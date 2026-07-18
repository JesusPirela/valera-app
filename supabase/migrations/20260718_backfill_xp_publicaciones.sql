-- ─────────────────────────────────────────────────────────────────────────────
-- Backfill XP de publicaciones perdido por el sistema anterior (pre-19 jun 2026)
--
-- Antes de publicar_propiedad_atomico, el XP se otorgaba en una segunda llamada
-- RPC separada. Si la conexión fallaba entre ambas llamadas, la publicación
-- quedaba registrada en propiedad_publicacion pero el XP/coins nunca llegaban.
--
-- Lógica:
--   publicaciones_reales  = SUM(veces_publicada) desde propiedad_publicacion
--   publicaciones_con_xp  = total_propiedades en user_stats (las que sí dieron XP)
--   diferencia            = reales - con_xp  (siempre >= 0)
--   xp_faltante           = diferencia * 10
--   coins_faltantes       = diferencia * 2
--
-- Solo se toca a usuarios donde haya diferencia real > 0.
-- ─────────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT
      us.id,
      COALESCE(SUM(pp.veces_publicada), 0)::INT  AS pubs_reales,
      COALESCE(us.total_propiedades, 0)::INT      AS pubs_con_xp
    FROM public.user_stats us
    LEFT JOIN public.propiedad_publicacion pp
           ON pp.user_id = us.id AND pp.veces_publicada > 0
    GROUP BY us.id, us.total_propiedades
    HAVING COALESCE(SUM(pp.veces_publicada), 0) > COALESCE(us.total_propiedades, 0)
  LOOP
    DECLARE
      v_diff   INT := r.pubs_reales - r.pubs_con_xp;
      v_xp     INT := v_diff * 10;
      v_coins  INT := v_diff * 2;
    BEGIN
      -- Otorgar XP y coins faltantes y sincronizar el contador
      UPDATE public.user_stats SET
        xp                = xp + v_xp,
        valera_coins      = valera_coins + v_coins,
        total_propiedades = r.pubs_reales
      WHERE id = r.id;

      -- Registrar en historial para trazabilidad
      INSERT INTO public.xp_transactions (user_id, cantidad, concepto)
      VALUES (r.id, v_xp,
        format('Corrección histórica: %s publicaciones sin XP registradas (backfill jun-2026)', v_diff));

      INSERT INTO public.coin_transactions (user_id, cantidad, concepto)
      VALUES (r.id, v_coins,
        format('Corrección histórica: %s publicaciones sin coins registradas (backfill jun-2026)', v_diff));

      RAISE NOTICE 'Usuario %: % publicaciones sin XP → +% XP, +% coins',
        r.id, v_diff, v_xp, v_coins;
    END;
  END LOOP;
END;
$$;

SELECT pg_notify('pgrst', 'reload schema');
