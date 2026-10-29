-- Ascenso automático: nuevo → prospectador → prospectador plus.
--
-- La regla, decidida sobre datos medidos y no inventados: en los últimos 30
-- días, 12 DÍAS DISTINTOS trabajados Y al menos 3 clientes o 2 citas.
--
-- Por qué las dos puertas y no solo la constancia: midiendo los 30 días
-- previos aparecieron dos casos que lo explican solos. Jorge Luis llevaba 20
-- días seguidos y 66 publicaciones, con 0 clientes y 0 citas. Sara, 12 días y
-- 139 publicaciones, también 0 clientes. Con solo constancia, el sistema
-- ascendería a quien publica mucho sin prospectar a nadie, que es justo lo
-- contrario de lo que el ascenso debería premiar.
--
-- Por qué días distintos y no totales: un total se alcanza en una tarde. Los
-- días distintos solo se alcanzan volviendo, que es lo que se quiere medir.
--
-- Lo que el sistema NO hace, a propósito:
--  · No baja a nadie de rol. Si alguien deja de trabajar, eso se ve en las
--    estadísticas; quitarle permisos solo por una mala racha se decide a mano.
--  · No asciende a asesor, supervisor ni gerencia. Esos son puestos, no
--    niveles que se ganen por actividad.
--  · No asciende cuentas inhabilitadas (el cron de inactivas pone activo=false).
--  · No deja saltar dos niveles seguidos: hay 30 días de espera entre ascensos,
--    porque la misma ventana de 30 días volvería a cumplirse al día siguiente y
--    un nuevo llegaría a plus en dos días.

-- ─── Bitácora ────────────────────────────────────────────────────────────────
-- Queda registro de cada ascenso con los números que lo justificaron, para
-- poder responder "¿por qué subió?" meses después, y para la espera de 30 días.
CREATE TABLE IF NOT EXISTS public.ascensos_log (
  id              UUID PRIMARY KEY DEFAULT extensions.gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rol_anterior    TEXT NOT NULL,
  rol_nuevo       TEXT NOT NULL,
  dias_activos    INT  NOT NULL,
  n_publicaciones INT  NOT NULL DEFAULT 0,
  n_clientes      INT  NOT NULL DEFAULT 0,
  n_citas         INT  NOT NULL DEFAULT 0,
  automatico      BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ascensos_log_user ON public.ascensos_log (user_id, created_at DESC);

ALTER TABLE public.ascensos_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "ascensos_log_lectura_mando" ON public.ascensos_log;
CREATE POLICY "ascensos_log_lectura_mando" ON public.ascensos_log
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = auth.uid() AND p.role IN ('admin','supervisor','gerente')
    )
  );

-- ─── La medición ─────────────────────────────────────────────────────────────
-- UNA sola función para medir, que usan el cron y la pantalla. Si el tablero y
-- el ascenso contaran por separado, tarde o temprano dirían cosas distintas y
-- nadie sabría cuál creer.
CREATE OR REPLACE FUNCTION public.medir_constancia(
  p_dias         INT DEFAULT 30,
  p_min_dias     INT DEFAULT 12,
  p_min_clientes INT DEFAULT 3,
  p_min_citas    INT DEFAULT 2
)
RETURNS TABLE (
  persona_id      UUID,
  persona_nombre  TEXT,
  rol_actual      TEXT,
  rol_siguiente   TEXT,
  dias_activos    INT,
  n_publicaciones INT,
  n_seguimientos  INT,
  n_clientes      INT,
  n_citas         INT,
  ultimo_ascenso  TIMESTAMPTZ,
  cumple          BOOLEAN,
  le_falta        TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
WITH limites AS (
  SELECT (now() - make_interval(days => p_dias)) AS desde
),
gente AS (
  SELECT pr.id, pr.nombre, pr.role
    FROM public.profiles pr
   WHERE pr.role IN ('nuevo', 'prospectador')
     AND pr.activo IS NOT FALSE
),
eventos AS (
  SELECT g.id AS uid, e.cuando, e.clase
    FROM gente g
    CROSS JOIN limites l
    CROSS JOIN LATERAL (
      SELECT pl.created_at AS cuando, 'pub'::TEXT AS clase
        FROM public.publicacion_log pl
       WHERE pl.user_id = g.id AND pl.created_at >= l.desde
      UNION ALL
      SELECT sd.created_at, 'seg'
        FROM public.seguimientos_dia sd
       WHERE sd.user_id = g.id AND sd.created_at >= l.desde
      UNION ALL
      -- Los clientes borrados no cuentan: si contaran, bastaría con crear y
      -- borrar para fabricar el número.
      SELECT c.created_at, 'cli'
        FROM public.clientes c
       WHERE c.responsable_id = g.id AND c.created_at >= l.desde
         AND c.eliminado_at IS NULL
      UNION ALL
      SELECT cc.created_at, 'cita'
        FROM public.citas_coordinacion cc
       WHERE cc.prospectador_id = g.id AND cc.created_at >= l.desde
    ) e
),
medido AS (
  SELECT
    g.id AS uid, g.nombre AS nom, g.role AS rol,
    -- Los días se cortan por la hora de la Ciudad de México, no por UTC: con
    -- UTC, lo trabajado después de las 6 de la tarde cae en el día siguiente y
    -- un día de trabajo se vería como dos.
    COUNT(DISTINCT (e.cuando AT TIME ZONE 'America/Mexico_City')::DATE)::INT AS dias,
    COUNT(*) FILTER (WHERE e.clase = 'pub')::INT  AS pubs,
    COUNT(*) FILTER (WHERE e.clase = 'seg')::INT  AS segs,
    COUNT(*) FILTER (WHERE e.clase = 'cli')::INT  AS clis,
    COUNT(*) FILTER (WHERE e.clase = 'cita')::INT AS cits,
    (SELECT MAX(al.created_at) FROM public.ascensos_log al WHERE al.user_id = g.id) AS ult
  FROM gente g
  LEFT JOIN eventos e ON e.uid = g.id
  GROUP BY g.id, g.nombre, g.role
)
SELECT
  m.uid,
  m.nom,
  m.rol,
  CASE m.rol WHEN 'nuevo' THEN 'prospectador' ELSE 'prospectador_plus' END,
  m.dias,
  m.pubs,
  m.segs,
  m.clis,
  m.cits,
  m.ult,
  (
    m.dias >= p_min_dias
    AND (m.clis >= p_min_clientes OR m.cits >= p_min_citas)
    AND (m.ult IS NULL OR m.ult < now() - INTERVAL '30 days')
  ),
  -- En palabras, para que la pantalla no tenga que repetir la regla y pueda
  -- decirle a cada quien exactamente qué le falta.
  CASE
    WHEN m.ult IS NOT NULL AND m.ult >= now() - INTERVAL '30 days'
      THEN 'Ascendió hace menos de un mes'
    WHEN m.dias < p_min_dias AND NOT (m.clis >= p_min_clientes OR m.cits >= p_min_citas)
      THEN (p_min_dias - m.dias) || ' días más, y clientes o citas'
    WHEN m.dias < p_min_dias
      THEN (p_min_dias - m.dias) || ' días más de trabajo'
    WHEN NOT (m.clis >= p_min_clientes OR m.cits >= p_min_citas)
      THEN 'Constancia lista; le faltan clientes o citas'
    ELSE 'Listo para ascender'
  END
FROM medido m
ORDER BY m.dias DESC, m.clis DESC
$function$;

-- ─── La pantalla ─────────────────────────────────────────────────────────────
-- Lo mismo, pero con el guardia de rol puesto. medir_constancia es SECURITY
-- DEFINER para poder leer las tablas de todos, así que no se expone directo.
CREATE OR REPLACE FUNCTION public.ver_constancia_equipo(
  p_dias         INT DEFAULT 30,
  p_min_dias     INT DEFAULT 12,
  p_min_clientes INT DEFAULT 3,
  p_min_citas    INT DEFAULT 2
)
RETURNS TABLE (
  persona_id      UUID,
  persona_nombre  TEXT,
  rol_actual      TEXT,
  rol_siguiente   TEXT,
  dias_activos    INT,
  n_publicaciones INT,
  n_seguimientos  INT,
  n_clientes      INT,
  n_citas         INT,
  ultimo_ascenso  TIMESTAMPTZ,
  cumple          BOOLEAN,
  le_falta        TEXT
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE v_rol TEXT;
BEGIN
  SELECT pr.role INTO v_rol FROM public.profiles pr WHERE pr.id = auth.uid();
  -- Ojo: "v_rol NOT IN (...)" no bloquea si v_rol sale NULL. Con IS DISTINCT
  -- FROM sí, y un perfil sin rol se queda fuera, que es lo correcto.
  IF v_rol IS DISTINCT FROM 'admin'
     AND v_rol IS DISTINCT FROM 'supervisor'
     AND v_rol IS DISTINCT FROM 'gerente'
  THEN
    RETURN;
  END IF;

  RETURN QUERY
    SELECT m.persona_id, m.persona_nombre, m.rol_actual, m.rol_siguiente,
           m.dias_activos, m.n_publicaciones, m.n_seguimientos,
           m.n_clientes, m.n_citas, m.ultimo_ascenso, m.cumple, m.le_falta
      FROM public.medir_constancia(p_dias, p_min_dias, p_min_clientes, p_min_citas) m;
END;
$function$;

-- ─── El ascenso ──────────────────────────────────────────────────────────────
-- Lo corre el cron. Devuelve a quién ascendió, para que quede en la bitácora
-- de cron y se pueda revisar qué pasó cada noche.
CREATE OR REPLACE FUNCTION public.evaluar_ascensos(
  p_dias         INT DEFAULT 30,
  p_min_dias     INT DEFAULT 12,
  p_min_clientes INT DEFAULT 3,
  p_min_citas    INT DEFAULT 2
)
RETURNS TABLE (persona_nombre TEXT, rol_anterior TEXT, rol_nuevo TEXT, dias_activos INT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE r RECORD;
BEGIN
  FOR r IN
    SELECT m.* FROM public.medir_constancia(p_dias, p_min_dias, p_min_clientes, p_min_citas) m
     WHERE m.cumple
  LOOP
    -- El rol se vuelve a comprobar aquí dentro: entre la medición y esta línea
    -- alguien pudo haberle cambiado el rol a mano, y no se va a pisar.
    UPDATE public.profiles pr
       SET role = r.rol_siguiente
     WHERE pr.id = r.persona_id
       AND pr.role = r.rol_actual;

    IF NOT FOUND THEN
      CONTINUE;
    END IF;

    INSERT INTO public.ascensos_log (
      user_id, rol_anterior, rol_nuevo, dias_activos,
      n_publicaciones, n_clientes, n_citas, automatico
    ) VALUES (
      r.persona_id, r.rol_actual, r.rol_siguiente, r.dias_activos,
      r.n_publicaciones, r.n_clientes, r.n_citas, TRUE
    );

    -- Esta notificación es la que dispara el modal de "¡Ascendiste!" que ya
    -- existe en la app: busca un 'ascenso_rol' sin leer y usa el mensaje como
    -- el rol nuevo. Por eso el mensaje es el rol pelado y no una frase.
    INSERT INTO public.notificaciones (user_id, titulo, mensaje, tipo, leida)
    VALUES (
      r.persona_id,
      CASE r.rol_siguiente
        WHEN 'prospectador_plus' THEN '🚀 ¡Ascendiste a Prospectador Plus!'
        ELSE '🎉 ¡Ascendiste a Prospectador!'
      END,
      r.rol_siguiente,
      'ascenso_rol',
      FALSE
    );

    RETURN QUERY SELECT r.persona_nombre, r.rol_actual, r.rol_siguiente, r.dias_activos;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public.medir_constancia(INT, INT, INT, INT) FROM anon, authenticated;
REVOKE ALL ON FUNCTION public.evaluar_ascensos(INT, INT, INT, INT) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ver_constancia_equipo(INT, INT, INT, INT) TO authenticated;

-- ─── Cuándo corre ────────────────────────────────────────────────────────────
-- pg_cron corre en UTC y la Ciudad de México es UTC-6, así que 12:10 UTC son
-- las 6:10 de la mañana de allá: el aviso de "¡Ascendiste!" ya está esperando
-- cuando la persona abre la app.
SELECT cron.unschedule('evaluar-ascensos')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'evaluar-ascensos');
SELECT cron.schedule('evaluar-ascensos', '10 12 * * *', 'SELECT public.evaluar_ascensos();');
