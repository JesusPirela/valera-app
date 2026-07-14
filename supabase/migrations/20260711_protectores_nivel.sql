-- ═══════════════════════════════════════════════════════════════════════════
-- Protectores de racha: se GANAN con nivel, y comprarlos tiene límite (11/jul)
--
-- CAMBIOS respecto a la primera versión:
--   • YA NO hay tope para TENER protectores (antes máx 2 en inventario). Se
--     pueden acumular todos los que ganes.
--   • SÍ hay tope para COMPRARLOS: máximo 2 por semana. Sin esto, cualquiera
--     con muchas coins compraría 50 y sería inmune a perder la racha — la racha
--     dejaría de significar nada.
--   • Los protectores se GANAN subiendo de nivel: 1 cada 5 niveles (nivel 5, 10,
--     15, 20…). Se otorgan solos y de forma retroactiva por los niveles que el
--     usuario YA tiene, porque se los ganó.
-- ═══════════════════════════════════════════════════════════════════════════

-- Cuántos protectores se le han entregado ya por nivel (para no darlos dos veces).
ALTER TABLE public.user_stats
  ADD COLUMN IF NOT EXISTS protectores_nivel_otorgado integer NOT NULL DEFAULT 0;

-- Nivel a partir del XP (misma fórmula que la app: calcularNivel).
CREATE OR REPLACE FUNCTION public.nivel_de_xp(p_xp integer)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN COALESCE(p_xp, 0) <= 0 THEN 1
    ELSE 1 + FLOOR((-485 + SQRT(235225 + 60 * p_xp::numeric)) / 30)::integer
  END
$$;

-- Protectores que corresponden a un nivel: 1 cada 5 niveles.
CREATE OR REPLACE FUNCTION public.protectores_por_nivel(p_nivel integer)
RETURNS integer LANGUAGE sql IMMUTABLE AS $$
  SELECT GREATEST(FLOOR(COALESCE(p_nivel, 1) / 5.0), 0)::integer
$$;

-- Máximo de COMPRAS por semana (los ganados por nivel no cuentan aquí).
CREATE OR REPLACE FUNCTION public.max_compras_protector_semana()
RETURNS integer LANGUAGE sql IMMUTABLE AS $$ SELECT 2 $$;

-- Compras hechas en los últimos 7 días. Se cuentan desde coin_transactions
-- (ya queda registro de cada compra), así no hace falta otra tabla.
CREATE OR REPLACE FUNCTION public.compras_protector_semana(p_user uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT COUNT(*)::integer FROM coin_transactions
  WHERE user_id = p_user
    AND concepto LIKE 'Protector de racha%'
    AND created_at > NOW() - INTERVAL '7 days'
$$;

-- ── Entregar los protectores que el usuario se ganó por nivel ───────────────
-- Idempotente: solo entrega la diferencia entre lo que le toca y lo ya dado.
CREATE OR REPLACE FUNCTION public.otorgar_protectores_nivel(p_user uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_nivel    integer;
  v_tocan    integer;
  v_ya       integer;
  v_nuevos   integer;
BEGIN
  SELECT nivel_de_xp(xp), protectores_nivel_otorgado
    INTO v_nivel, v_ya
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

-- ── Sincronizar racha (ahora también entrega los protectores de nivel) ──────
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
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  -- Primero se entregan los protectores ganados por nivel: así, si el usuario
  -- subió de nivel y faltó un día, el protector recién ganado ya puede salvarlo.
  v_regalo := otorgar_protectores_nivel(v_user);

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
    'subio', v_subio,
    'protectores_ganados_nivel', v_regalo
  );
END;
$fn$;

-- ── Estado de la racha (expone el cupo de compra y el próximo premio) ───────
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
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT streak_dias, ultimo_dia_meta, protectores_racha, racha_maxima,
         racha_perdida, racha_perdida_fecha, valera_coins, xp
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

  RETURN jsonb_build_object(
    'ok', true,
    'racha', COALESCE(s.streak_dias, 0),
    'racha_maxima', COALESCE(s.racha_maxima, 0),
    'protectores', COALESCE(s.protectores_racha, 0),
    'meta_cumplida_hoy', (s.ultimo_dia_meta = v_hoy),
    'en_riesgo', (s.ultimo_dia_meta = v_hoy - 1),
    'coins', COALESCE(s.valera_coins, 0),
    'costo_protector', costo_protector_racha(),
    -- Compras: hay cupo semanal (tener no tiene tope, comprar sí).
    'compras_restantes', GREATEST(max_compras_protector_semana() - v_compradas, 0),
    'max_compras_semana', max_compras_protector_semana(),
    -- Premio por nivel: 1 cada 5 niveles.
    'nivel', v_nivel,
    'proximo_protector_nivel', (FLOOR(v_nivel / 5.0)::integer + 1) * 5,
    'reparable', v_reparable,
    'racha_perdida', CASE WHEN v_reparable THEN s.racha_perdida ELSE NULL END,
    'costo_reparar', CASE WHEN v_reparable THEN costo_reparar_racha(s.racha_perdida) ELSE NULL END
  );
END;
$fn$;

-- ── Comprar protector: sin tope de inventario, con cupo semanal ─────────────
CREATE OR REPLACE FUNCTION public.comprar_protector_racha()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_user      uuid := auth.uid();
  v_costo     integer := costo_protector_racha();
  v_max       integer := max_compras_protector_semana();
  v_compradas integer;
  s           RECORD;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT valera_coins, protectores_racha INTO s
  FROM user_stats WHERE id = v_user FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sin estadísticas');
  END IF;

  -- Ya no se limita TENER protectores, solo COMPRARLOS.
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

REVOKE EXECUTE ON FUNCTION public.otorgar_protectores_nivel(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.otorgar_protectores_nivel(uuid) TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
