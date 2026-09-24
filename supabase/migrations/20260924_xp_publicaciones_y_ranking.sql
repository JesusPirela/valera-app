-- Tres arreglos de gamificación.
--
-- 1) DESPUBLICAR NO REVERTÍA EL PREMIO.
--    admin_despublicar_propiedad borraba publicacion_log y propiedad_publicacion
--    pero dejaba intactos el XP, las monedas y user_stats.total_propiedades.
--    Caso real: Angela Francisca tenía total_propiedades = 920 y 920 registros
--    de "Publicar propiedad 🏠" en xp_transactions, cuando propiedad_publicacion
--    solo mostraba 22 propiedades publicadas UNA vez cada una: le habían
--    despublicado el resto y se quedó con el premio. Ahora se revierte
--    (10 xp y 2 coins por publicación), sin dejar saldos negativos, y se deja
--    constancia con transacciones en negativo.
--
-- 2) CITAS REALIZADAS DEL RANKING: solo las que coordinó la casa.
--    get_ranking contaba toda cita 'realizada' del prospectador sin mirar quién
--    la coordinó, así que las que se agendaban por su cuenta también sumaban.
--    Ahora exige coordinado_por IN (Alexis, Chucho, Carlos Carbajal, Andrés
--    Valera — sus dos cuentas). De 248 citas realizadas, 180 califican.
--
-- 3) LOS CIERRES PESAN EN EL RANKING.
--    El ranking ordenaba solo por user_stats.xp, así que quien cerraba no subía.
--    Se suma un bono POR RANKING: 1,500 XP por venta y 1,000 por renta. No
--    modifica el XP real de nadie; solo el número que muestra y ordena el
--    ranking, y aplica también a los cierres ya hechos.
--
-- Aplicada a producción el 2026-09-24 y verificada.

CREATE OR REPLACE FUNCTION public.admin_despublicar_propiedad(p_user_id uuid, p_propiedad_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_veces int;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','supervisor')) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT COALESCE(veces_publicada,0) INTO v_veces
    FROM public.propiedad_publicacion
   WHERE user_id = p_user_id AND propiedad_id = p_propiedad_id;

  DELETE FROM public.publicacion_log       WHERE user_id = p_user_id AND propiedad_id = p_propiedad_id;
  DELETE FROM public.propiedad_publicacion WHERE user_id = p_user_id AND propiedad_id = p_propiedad_id;

  IF COALESCE(v_veces,0) > 0 THEN
    UPDATE public.user_stats
       SET xp                = GREATEST(0, COALESCE(xp,0) - v_veces * 10),
           valera_coins      = GREATEST(0, COALESCE(valera_coins,0) - v_veces * 2),
           total_propiedades = GREATEST(0, COALESCE(total_propiedades,0) - v_veces)
     WHERE id = p_user_id;
    INSERT INTO public.xp_transactions   (user_id, cantidad, concepto)
      VALUES (p_user_id, -v_veces * 10, 'Reverso: publicación retirada 🏠');
    INSERT INTO public.coin_transactions (user_id, cantidad, concepto)
      VALUES (p_user_id, -v_veces * 2,  'Reverso: publicación retirada 🏠');
  END IF;
END $fn$;

CREATE OR REPLACE FUNCTION public.get_ranking()
RETURNS TABLE(id uuid, nombre text, avatar_url text, color_acento text, figura_acento text,
              xp integer, streak_dias integer, posicion bigint, ventas_cerradas integer,
              rentas_cerradas integer, citas_realizadas integer, propiedades_publicadas integer,
              clientes_registrados integer, cursos_completados integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_coord uuid[] := ARRAY[
    '6735dd82-3c79-4fd3-86cd-870c45fbda94',  -- Alexis
    'd0a9694f-f73a-428f-a455-5f039e4b84dc',  -- Chucho
    'befd463f-4ed4-4cf4-a3ea-22998f6621b5',  -- Carlos Carbajal
    '9bfe9db6-a274-42b6-a2cd-9bd3237b88cf',  -- Andrés Valera (admin)
    '90605894-18ed-46ae-a031-5a7ac6193810'   -- Andrés Valera (supervisor)
  ]::uuid[];
  v_xp_venta int := 1500;
  v_xp_renta int := 1000;
BEGIN
  RETURN QUERY
  WITH base AS (
    SELECT us.id AS uid, p.nombre AS nom, p.avatar_url AS av, p.color_acento AS col,
           p.figura_acento AS fig, COALESCE(us.xp,0) AS xp_base, us.streak_dias AS racha,
           (SELECT COUNT(*)::int FROM public.clientes c
              WHERE c.responsable_id = us.id AND c.eliminado_at IS NULL
                AND c.estado = 'compro' AND c.tipo_operacion = 'venta') AS v_ventas,
           (SELECT COUNT(*)::int FROM public.clientes c
              WHERE c.responsable_id = us.id AND c.eliminado_at IS NULL
                AND c.estado = 'compro' AND c.tipo_operacion = 'renta') AS v_rentas,
           (SELECT COUNT(*)::int FROM public.citas_coordinacion ct
              WHERE ct.prospectador_id = us.id AND ct.estado = 'realizada'
                AND ct.coordinado_por = ANY(v_coord)) AS v_citas,
           (SELECT COUNT(DISTINCT pp.propiedad_id)::int FROM public.propiedad_publicacion pp
              WHERE pp.user_id = us.id AND pp.veces_publicada > 0) AS v_props,
           (SELECT COUNT(*)::int FROM public.clientes c
              WHERE c.responsable_id = us.id AND c.eliminado_at IS NULL) AS v_cli,
           (SELECT COUNT(*)::int FROM public.vu_certificados vc WHERE vc.user_id = us.id) AS v_cur
    FROM public.user_stats us
    JOIN public.profiles p ON p.id = us.id
    WHERE p.role NOT IN ('admin')
  ), calc AS (
    SELECT b.*, (b.xp_base + b.v_ventas * v_xp_venta + b.v_rentas * v_xp_renta)::int AS xp_total
    FROM base b
  )
  SELECT c.uid, c.nom, c.av, c.col, c.fig, c.xp_total, c.racha,
         RANK() OVER (ORDER BY c.xp_total DESC)::BIGINT,
         c.v_ventas, c.v_rentas, c.v_citas, c.v_props, c.v_cli, c.v_cur
  FROM calc c
  ORDER BY c.xp_total DESC
  LIMIT 50;
END $fn$;

-- Corrección puntual del contador inflado de Angela Francisca (920 → 22).
UPDATE public.user_stats s
   SET total_propiedades = COALESCE((SELECT SUM(veces_publicada) FROM public.propiedad_publicacion pp
                                      WHERE pp.user_id = s.id), 0)
 WHERE s.id = '4ece8094-6113-4f47-9304-8f96243c16a7';
