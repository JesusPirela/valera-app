-- ═══════════════════════════════════════════════════════════════════════════
-- Racha estilo Duolingo (11/jul/2026)
--
-- ANTES: la racha subía solo con ABRIR la app (trackLoginDiario). No medía
-- trabajo real y no se podía salvar: si faltabas un día, se perdía y punto.
--
-- AHORA (modelo Duolingo, sobre las misiones que YA existen):
--   • Meta diaria = completar al menos 1 misión DIARIA (ya hay 5: publicar,
--     CRM, seguimiento, curso, interacción). Abrir la app ya no cuenta.
--   • Protector de racha (el "streak freeze"): se compra con Valera Coins, se
--     guarda en el inventario (máx 2) y se consume SOLO si faltas un día.
--   • Reparar racha: si la perdiste hace ≤2 días, la recuperas pagando coins.
--   • Récord personal (racha_maxima).
--
-- Las misiones de streak existentes (7, 15, 30, 45, 60 días) siguen igual: se
-- alimentan de streak_dias, que ahora sí es confiable.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.user_stats
  ADD COLUMN IF NOT EXISTS protectores_racha   integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS racha_maxima        integer NOT NULL DEFAULT 0,
  -- Último día (calendario MX) en que se cumplió la META DIARIA. Es lo que
  -- manda la racha. Distinto de `ultimo_acceso`, que sigue siendo solo el
  -- bono de XP por abrir la app.
  ADD COLUMN IF NOT EXISTS ultimo_dia_meta     date,
  -- Racha que se perdió y sigue siendo reparable (y cuándo se perdió).
  ADD COLUMN IF NOT EXISTS racha_perdida       integer,
  ADD COLUMN IF NOT EXISTS racha_perdida_fecha date;

-- Arranque suave: a quien ya tenía racha, se le respeta y se le da el día de
-- hoy como último día cumplido, para que nadie pierda su racha por el cambio.
UPDATE public.user_stats
SET ultimo_dia_meta = COALESCE(ultimo_dia_meta, ultimo_acceso),
    racha_maxima    = GREATEST(COALESCE(racha_maxima, 0), COALESCE(streak_dias, 0))
WHERE ultimo_dia_meta IS NULL;

-- Precios (un solo lugar, fácil de ajustar).
CREATE OR REPLACE FUNCTION public.costo_protector_racha()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 150 $$;

-- Reparar cuesta más entre más larga era la racha (como en Duolingo, recuperar
-- una racha grande debe doler). Tope para que nunca sea inalcanzable.
CREATE OR REPLACE FUNCTION public.costo_reparar_racha(p_racha integer)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT LEAST(100 + GREATEST(COALESCE(p_racha, 0), 0) * 15, 800)
$$;

-- Día de hoy en calendario de México (la racha vive en horario local, no UTC:
-- ese desfase ya reventó la racha una vez).
CREATE OR REPLACE FUNCTION public.hoy_mx()
RETURNS date LANGUAGE sql STABLE AS $$
  SELECT (NOW() AT TIME ZONE 'America/Mexico_City')::date
$$;

-- ── Sincronizar la racha ────────────────────────────────────────────────────
-- Se llama SIEMPRE que hay actividad relevante:
--   p_cumplio = false → al abrir la app: solo resuelve días faltados (consume
--                       protectores o marca la racha como perdida).
--   p_cumplio = true  → al completar una misión diaria: además avanza la racha.
--
-- La evaluación es perezosa (se resuelve al próximo contacto) en vez de con un
-- cron: así no hay proceso nocturno que se pueda caer y dejar rachas mal.
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
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT streak_dias, ultimo_dia_meta, protectores_racha, racha_maxima,
         racha_perdida, racha_perdida_fecha, valera_coins
    INTO s
  FROM user_stats WHERE id = v_user FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin estadísticas');
  END IF;

  -- 1) ¿Faltaron días desde la última vez que cumplió la meta?
  IF s.ultimo_dia_meta IS NOT NULL AND s.ultimo_dia_meta < v_hoy - 1 THEN
    v_faltados := (v_hoy - s.ultimo_dia_meta) - 1;   -- sin contar hoy

    IF s.protectores_racha >= v_faltados THEN
      -- Los protectores cubren la ausencia: la racha SOBREVIVE (no sube por los
      -- días congelados, igual que en Duolingo) y se consumen los protectores.
      UPDATE user_stats
      SET protectores_racha = protectores_racha - v_faltados,
          ultimo_dia_meta   = v_hoy - 1
      WHERE id = v_user;
      s.protectores_racha := s.protectores_racha - v_faltados;
      s.ultimo_dia_meta   := v_hoy - 1;
      v_salvada := true;
    ELSE
      -- No alcanzan: la racha se pierde, pero queda REPARABLE por unos días.
      UPDATE user_stats
      SET racha_perdida       = NULLIF(s.streak_dias, 0),
          racha_perdida_fecha = CASE WHEN s.streak_dias > 0 THEN v_hoy ELSE NULL END,
          streak_dias         = 0,
          ultimo_dia_meta     = NULL
      WHERE id = v_user;
      s.racha_perdida     := NULLIF(s.streak_dias, 0);
      s.streak_dias       := 0;
      s.ultimo_dia_meta   := NULL;
      v_perdida := true;
    END IF;
  END IF;

  -- 2) ¿Cumplió la meta HOY? (solo la primera vez del día cuenta)
  IF p_cumplio AND (s.ultimo_dia_meta IS NULL OR s.ultimo_dia_meta < v_hoy) THEN
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
  END IF;

  RETURN jsonb_build_object(
    'ok', true,
    'racha', s.streak_dias,
    'racha_maxima', s.racha_maxima,
    'protectores', s.protectores_racha,
    'meta_cumplida_hoy', (s.ultimo_dia_meta = v_hoy),
    'salvada_con_protector', v_salvada,
    'racha_perdida_hoy', v_perdida,
    'subio', v_subio
  );
END;
$fn$;

-- ── Estado de la racha (solo lectura, para pintar la UI) ────────────────────
CREATE OR REPLACE FUNCTION public.get_estado_racha()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_user uuid := auth.uid();
  v_hoy  date := hoy_mx();
  s      RECORD;
  v_reparable boolean := false;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT streak_dias, ultimo_dia_meta, protectores_racha, racha_maxima,
         racha_perdida, racha_perdida_fecha, valera_coins
    INTO s
  FROM user_stats WHERE id = v_user;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin estadísticas');
  END IF;

  -- Reparable si se perdió hace 2 días o menos.
  v_reparable := s.racha_perdida IS NOT NULL
             AND s.racha_perdida_fecha IS NOT NULL
             AND s.racha_perdida_fecha >= v_hoy - 2;

  RETURN jsonb_build_object(
    'ok', true,
    'racha', COALESCE(s.streak_dias, 0),
    'racha_maxima', COALESCE(s.racha_maxima, 0),
    'protectores', COALESCE(s.protectores_racha, 0),
    'max_protectores', 2,
    'meta_cumplida_hoy', (s.ultimo_dia_meta = v_hoy),
    -- En riesgo: cumplió ayer pero aún no hoy → si no hace nada, la pierde.
    'en_riesgo', (s.ultimo_dia_meta = v_hoy - 1),
    'coins', COALESCE(s.valera_coins, 0),
    'costo_protector', costo_protector_racha(),
    'reparable', v_reparable,
    'racha_perdida', CASE WHEN v_reparable THEN s.racha_perdida ELSE NULL END,
    'costo_reparar', CASE WHEN v_reparable THEN costo_reparar_racha(s.racha_perdida) ELSE NULL END
  );
END;
$fn$;

-- ── Comprar un protector de racha ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.comprar_protector_racha()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_user  uuid := auth.uid();
  v_costo integer := costo_protector_racha();
  s       RECORD;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT valera_coins, protectores_racha INTO s
  FROM user_stats WHERE id = v_user FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin estadísticas');
  END IF;

  IF s.protectores_racha >= 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ya tienes el máximo de 2 protectores');
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

  RETURN jsonb_build_object('ok', true, 'protectores', s.protectores_racha + 1,
                            'coins', s.valera_coins - v_costo);
END;
$fn$;

-- ── Reparar una racha perdida ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reparar_racha()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_user  uuid := auth.uid();
  v_hoy   date := hoy_mx();
  v_costo integer;
  s       RECORD;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT valera_coins, racha_perdida, racha_perdida_fecha, racha_maxima INTO s
  FROM user_stats WHERE id = v_user FOR UPDATE;

  IF NOT FOUND OR s.racha_perdida IS NULL OR s.racha_perdida_fecha IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No hay ninguna racha que reparar');
  END IF;

  IF s.racha_perdida_fecha < v_hoy - 2 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ya pasó el tiempo para reparar esta racha');
  END IF;

  v_costo := costo_reparar_racha(s.racha_perdida);

  IF s.valera_coins < v_costo THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No te alcanzan las Valera Coins',
                              'costo', v_costo, 'faltan', v_costo - s.valera_coins);
  END IF;

  -- Se restaura la racha y se deja como si hubiera cumplido AYER: así al
  -- completar su misión de hoy sigue sumando desde donde iba.
  UPDATE user_stats
  SET valera_coins        = valera_coins - v_costo,
      streak_dias         = s.racha_perdida,
      ultimo_dia_meta     = v_hoy - 1,
      racha_maxima        = GREATEST(COALESCE(s.racha_maxima, 0), s.racha_perdida),
      racha_perdida       = NULL,
      racha_perdida_fecha = NULL
  WHERE id = v_user;

  INSERT INTO coin_transactions (user_id, cantidad, concepto)
  VALUES (v_user, -v_costo, 'Reparar racha 🔥');

  RETURN jsonb_build_object('ok', true, 'racha', s.racha_perdida,
                            'coins', s.valera_coins - v_costo, 'costo', v_costo);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.sincronizar_racha(boolean)   FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.get_estado_racha()           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.comprar_protector_racha()    FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.reparar_racha()              FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.sincronizar_racha(boolean)   TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.get_estado_racha()           TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.comprar_protector_racha()    TO authenticated, service_role;
GRANT  EXECUTE ON FUNCTION public.reparar_racha()              TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
