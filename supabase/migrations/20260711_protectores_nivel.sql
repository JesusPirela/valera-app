-- ═══════════════════════════════════════════════════════════════════════════
-- Racha v2 (11/jul/2026): protectores por nivel, meta diaria ajustable,
-- hitos celebrados y aviso de racha en riesgo.
--
--  • PROTECTORES: ya no hay tope para TENERLOS (se acumulan). Sí hay tope para
--    COMPRARLOS (2 por semana): sin eso, cualquiera con muchas coins compraría
--    50 y sería inmune a perder la racha — la racha dejaría de significar nada.
--    Además se GANAN subiendo de nivel: 1 cada 5 niveles, retroactivo.
--
--  • META DIARIA AJUSTABLE: el usuario elige cuántas misiones diarias necesita
--    para mantener la racha (1 = tranquilo, 2 = constante, 3 = intenso). Quien
--    elige su propia meta la cumple más: es un compromiso, no una imposición.
--    El SERVIDOR cuenta las misiones hechas hoy — una sola fuente de verdad.
--
--  • HITOS: al llegar a 7/15/30/45/60/100/180/365 días se premia y se avisa una
--    sola vez, para que la racha se sienta y no solo se cuente.
--
--  • AVISO DE RIESGO: por la tarde, a quien tiene racha viva pero aún no cumple
--    la meta de hoy. Es lo que más recupera gente (lo hace Duolingo).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.user_stats
  ADD COLUMN IF NOT EXISTS protectores_nivel_otorgado integer NOT NULL DEFAULT 0,
  -- Cuántas misiones diarias hacen falta para mantener la racha (1, 2 o 3).
  ADD COLUMN IF NOT EXISTS meta_diaria         integer NOT NULL DEFAULT 1,
  -- Último hito de racha ya celebrado (para no repetir el premio ni el confeti).
  ADD COLUMN IF NOT EXISTS racha_hito_celebrado integer NOT NULL DEFAULT 0,
  -- Último día en que se le avisó "tu racha está en riesgo" (anti-duplicado).
  ADD COLUMN IF NOT EXISTS notif_racha_fecha   date;

-- Nivel a partir del XP (misma fórmula que la app: calcularNivel).
CREATE OR REPLACE FUNCTION public.nivel_de_xp(p_xp integer)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN COALESCE(p_xp, 0) <= 0 THEN 1
    ELSE 1 + FLOOR((-485 + SQRT(235225 + 60 * p_xp::numeric)) / 30)::integer
  END
$$;

-- 1 protector cada 5 niveles.
CREATE OR REPLACE FUNCTION public.protectores_por_nivel(p_nivel integer)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT GREATEST(FLOOR(COALESCE(p_nivel, 1) / 5.0), 0)::integer
$$;

CREATE OR REPLACE FUNCTION public.max_compras_protector_semana()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 2 $$;

CREATE OR REPLACE FUNCTION public.compras_protector_semana(p_user uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COUNT(*)::integer FROM coin_transactions
  WHERE user_id = p_user
    AND concepto LIKE 'Protector de racha%'
    AND created_at > NOW() - INTERVAL '7 days'
$$;

-- Misiones DIARIAS completadas hoy (lo que mide la meta).
CREATE OR REPLACE FUNCTION public.misiones_diarias_hoy(p_user uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COUNT(*)::integer
  FROM user_misiones um
  JOIN misiones m ON m.id = um.mision_id
  WHERE um.user_id = p_user
    AND m.tipo = 'diaria'
    AND um.completada = true
    AND um.fecha_reset = hoy_mx()
$$;

-- Premio del hito: coins + protectores. Devuelve NULL si no es hito.
CREATE OR REPLACE FUNCTION public.premio_hito_racha(p_dias integer)
RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE p_dias
    WHEN 7   THEN jsonb_build_object('coins',   50, 'protectores', 0)
    WHEN 15  THEN jsonb_build_object('coins',  100, 'protectores', 0)
    WHEN 30  THEN jsonb_build_object('coins',  200, 'protectores', 1)
    WHEN 45  THEN jsonb_build_object('coins',  300, 'protectores', 0)
    WHEN 60  THEN jsonb_build_object('coins',  500, 'protectores', 1)
    WHEN 100 THEN jsonb_build_object('coins', 1000, 'protectores', 2)
    WHEN 180 THEN jsonb_build_object('coins', 2000, 'protectores', 2)
    WHEN 365 THEN jsonb_build_object('coins', 5000, 'protectores', 3)
    ELSE NULL
  END
$$;

-- Entregar los protectores ganados por nivel (idempotente).
CREATE OR REPLACE FUNCTION public.otorgar_protectores_nivel(p_user uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_nivel integer; v_tocan integer; v_ya integer; v_nuevos integer;
BEGIN
  SELECT nivel_de_xp(xp), protectores_nivel_otorgado INTO v_nivel, v_ya
  FROM user_stats WHERE id = p_user;
  IF NOT FOUND THEN RETURN 0; END IF;

  v_tocan  := protectores_por_nivel(v_nivel);
  v_nuevos := v_tocan - COALESCE(v_ya, 0);
  IF v_nuevos <= 0 THEN RETURN 0; END IF;

  UPDATE user_stats
  SET protectores_racha          = protectores_racha + v_nuevos,
      protectores_nivel_otorgado = v_tocan
  WHERE id = p_user;
  RETURN v_nuevos;
END;
$fn$;

-- ── Elegir la meta diaria ──────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_meta_diaria(p_meta integer)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_user uuid := auth.uid();
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;
  IF p_meta NOT IN (1, 2, 3) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Meta inválida');
  END IF;
  UPDATE user_stats SET meta_diaria = p_meta WHERE id = v_user;
  RETURN jsonb_build_object('ok', true, 'meta_diaria', p_meta);
END;
$fn$;

-- ── Sincronizar la racha ───────────────────────────────────────────────────
-- El servidor decide si la meta está cumplida contando las misiones diarias de
-- hoy contra la meta elegida. (p_cumplio queda ignorado: existía cuando el
-- cliente decidía, y eso permitía que un cliente viejo mintiera.)
CREATE OR REPLACE FUNCTION public.sincronizar_racha(p_cumplio boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_user     uuid := auth.uid();
  v_hoy      date := hoy_mx();
  s          RECORD;
  v_faltados integer;
  v_salvada  boolean := false;
  v_perdida  boolean := false;
  v_subio    boolean := false;
  v_regalo   integer := 0;
  v_hechas   integer;
  v_cumplio  boolean;
  v_premio   jsonb := NULL;
  v_hito     integer := 0;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  -- Protectores ganados por nivel primero: si subió de nivel y faltó un día,
  -- el protector recién ganado ya puede salvarlo.
  v_regalo := otorgar_protectores_nivel(v_user);

  SELECT streak_dias, ultimo_dia_meta, protectores_racha, racha_maxima,
         racha_perdida, racha_perdida_fecha, valera_coins, meta_diaria,
         racha_hito_celebrado
    INTO s
  FROM user_stats WHERE id = v_user FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin estadísticas');
  END IF;

  v_hechas  := misiones_diarias_hoy(v_user);
  v_cumplio := v_hechas >= COALESCE(s.meta_diaria, 1);

  -- 1) Días faltados desde la última meta cumplida
  IF s.ultimo_dia_meta IS NOT NULL AND s.ultimo_dia_meta < v_hoy - 1 THEN
    v_faltados := (v_hoy - s.ultimo_dia_meta) - 1;

    IF s.protectores_racha >= v_faltados THEN
      UPDATE user_stats
      SET protectores_racha = protectores_racha - v_faltados,
          ultimo_dia_meta   = v_hoy - 1
      WHERE id = v_user;
      s.protectores_racha := s.protectores_racha - v_faltados;
      s.ultimo_dia_meta   := v_hoy - 1;
      v_salvada := true;
    ELSE
      UPDATE user_stats
      SET racha_perdida       = NULLIF(s.streak_dias, 0),
          racha_perdida_fecha = CASE WHEN s.streak_dias > 0 THEN v_hoy ELSE NULL END,
          streak_dias         = 0,
          ultimo_dia_meta     = NULL
      WHERE id = v_user;
      s.racha_perdida   := NULLIF(s.streak_dias, 0);
      s.streak_dias     := 0;
      s.ultimo_dia_meta := NULL;
      v_perdida := true;
    END IF;
  END IF;

  -- 2) ¿Cumplió la meta HOY?
  IF v_cumplio AND (s.ultimo_dia_meta IS NULL OR s.ultimo_dia_meta < v_hoy) THEN
    IF s.ultimo_dia_meta = v_hoy - 1 THEN
      s.streak_dias := s.streak_dias + 1;
    ELSE
      s.streak_dias := 1;
    END IF;
    s.ultimo_dia_meta := v_hoy;
    s.racha_maxima    := GREATEST(COALESCE(s.racha_maxima, 0), s.streak_dias);
    v_subio := true;

    UPDATE user_stats
    SET streak_dias     = s.streak_dias,
        ultimo_dia_meta = v_hoy,
        racha_maxima    = s.racha_maxima
    WHERE id = v_user;

    -- 3) ¿Llegó a un hito nuevo? Se premia y se avisa UNA sola vez.
    v_premio := premio_hito_racha(s.streak_dias);
    IF v_premio IS NOT NULL AND s.streak_dias > COALESCE(s.racha_hito_celebrado, 0) THEN
      v_hito := s.streak_dias;
      UPDATE user_stats
      SET valera_coins         = valera_coins + (v_premio->>'coins')::integer,
          protectores_racha    = protectores_racha + (v_premio->>'protectores')::integer,
          racha_hito_celebrado = v_hito
      WHERE id = v_user;

      INSERT INTO coin_transactions (user_id, cantidad, concepto)
      VALUES (v_user, (v_premio->>'coins')::integer,
              format('¡Racha de %s días! 🔥', v_hito));

      s.protectores_racha := s.protectores_racha + (v_premio->>'protectores')::integer;
    ELSE
      v_premio := NULL;
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'racha', s.streak_dias,
    'racha_maxima', s.racha_maxima,
    'protectores', s.protectores_racha,
    'meta_cumplida_hoy', (s.ultimo_dia_meta = v_hoy),
    'salvada_con_protector', v_salvada,
    'racha_perdida_hoy', v_perdida,
    'subio', v_subio,
    'protectores_ganados_nivel', v_regalo,
    'hito_alcanzado', NULLIF(v_hito, 0),
    'premio_hito', v_premio
  );
END;
$fn$;

-- ── Estado de la racha (para pintar la UI) ─────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_estado_racha()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_hoy  date := hoy_mx();
  s      RECORD;
  v_reparable boolean := false;
  v_nivel     integer;
  v_compradas integer;
  v_hechas    integer;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT streak_dias, ultimo_dia_meta, protectores_racha, racha_maxima,
         racha_perdida, racha_perdida_fecha, valera_coins, xp, meta_diaria
    INTO s
  FROM user_stats WHERE id = v_user;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin estadísticas');
  END IF;

  v_reparable := s.racha_perdida IS NOT NULL
             AND s.racha_perdida_fecha IS NOT NULL
             AND s.racha_perdida_fecha >= v_hoy - 2;

  v_nivel     := nivel_de_xp(s.xp);
  v_compradas := compras_protector_semana(v_user);
  v_hechas    := misiones_diarias_hoy(v_user);

  RETURN jsonb_build_object(
    'ok', true,
    'racha', COALESCE(s.streak_dias, 0),
    'racha_maxima', COALESCE(s.racha_maxima, 0),
    'protectores', COALESCE(s.protectores_racha, 0),
    'meta_cumplida_hoy', (s.ultimo_dia_meta = v_hoy),
    'en_riesgo', (s.ultimo_dia_meta = v_hoy - 1),
    'coins', COALESCE(s.valera_coins, 0),
    'costo_protector', costo_protector_racha(),
    'compras_restantes', GREATEST(max_compras_protector_semana() - v_compradas, 0),
    'max_compras_semana', max_compras_protector_semana(),
    'nivel', v_nivel,
    'proximo_protector_nivel', (FLOOR(v_nivel / 5.0)::integer + 1) * 5,
    -- Meta diaria elegida y progreso de hoy
    'meta_diaria', COALESCE(s.meta_diaria, 1),
    'misiones_hoy', v_hechas,
    'reparable', v_reparable,
    'racha_perdida', CASE WHEN v_reparable THEN s.racha_perdida ELSE NULL END,
    'costo_reparar', CASE WHEN v_reparable THEN costo_reparar_racha(s.racha_perdida) ELSE NULL END
  );
END;
$fn$;

-- ── Comprar protector: sin tope de inventario, con cupo semanal ────────────
CREATE OR REPLACE FUNCTION public.comprar_protector_racha()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_costo integer := costo_protector_racha();
  v_max integer := max_compras_protector_semana();
  v_compradas integer;
  s RECORD;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT valera_coins, protectores_racha INTO s
  FROM user_stats WHERE id = v_user FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin estadísticas');
  END IF;

  v_compradas := compras_protector_semana(v_user);
  IF v_compradas >= v_max THEN
    RETURN jsonb_build_object('ok', false,
      'error', format('Solo puedes comprar %s protectores por semana. Sube de nivel para ganar más.', v_max));
  END IF;

  IF s.valera_coins < v_costo THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No te alcanzan las Valera Coins',
                              'faltan', v_costo - s.valera_coins);
  END IF;

  UPDATE user_stats
  SET valera_coins      = valera_coins - v_costo,
      protectores_racha = protectores_racha + 1
  WHERE id = v_user;

  INSERT INTO coin_transactions (user_id, cantidad, concepto)
  VALUES (v_user, -v_costo, 'Protector de racha 🛡️');

  RETURN jsonb_build_object('ok', true,
    'protectores', s.protectores_racha + 1,
    'coins', s.valera_coins - v_costo,
    'compras_restantes', GREATEST(v_max - (v_compradas + 1), 0));
END;
$fn$;

-- ── Rachas en riesgo (para el aviso de la tarde) ───────────────────────────
-- Devuelve a quién avisar y lo marca, para no avisarle dos veces el mismo día.
-- Solo la usa la edge function (service_role).
CREATE OR REPLACE FUNCTION public.rachas_en_riesgo()
RETURNS TABLE(user_id uuid, racha integer, meta_diaria integer, misiones_hoy integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE v_hoy date := hoy_mx();
BEGIN
  RETURN QUERY
  WITH candidatos AS (
    SELECT us.id,
           us.streak_dias,
           us.meta_diaria,
           misiones_diarias_hoy(us.id) AS hechas
    FROM user_stats us
    WHERE us.streak_dias > 0
      -- Cumplió AYER (racha viva) pero hoy todavía no.
      AND us.ultimo_dia_meta = v_hoy - 1
      -- No se le ha avisado hoy.
      AND (us.notif_racha_fecha IS DISTINCT FROM v_hoy)
  ),
  a_avisar AS (
    SELECT * FROM candidatos WHERE hechas < meta_diaria
  ),
  marcados AS (
    UPDATE user_stats SET notif_racha_fecha = v_hoy
    WHERE id IN (SELECT id FROM a_avisar)
    RETURNING id
  )
  SELECT a.id, a.streak_dias, a.meta_diaria, a.hechas
  FROM a_avisar a
  WHERE a.id IN (SELECT id FROM marcados);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.otorgar_protectores_nivel(uuid) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.rachas_en_riesgo()             FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.set_meta_diaria(integer)       FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.otorgar_protectores_nivel(uuid) TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.rachas_en_riesgo()              TO service_role;
GRANT  EXECUTE ON FUNCTION public.set_meta_diaria(integer)        TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
