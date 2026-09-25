-- ══════════════════════════════════════════════════════════════════════════════
-- Cierre automático de rentas baratas y viejas.
--
-- Regla de negocio (pedida explícitamente, sin extras): una propiedad en
-- RENTA que lleve 3+ meses publicada (created_at) y cuyo precio sea <= $15,000
-- se marca sola como 'rentada' — se asume que a esas alturas ya se rentó y
-- nadie actualizó el catálogo a mano. Solo toca las que siguen 'disponible':
-- no reabre nada ni pisa un estado puesto a mano (vendida/rentada ya).
--
-- Sigue el mismo patrón que expirar_propiedades_destacadas() (ver
-- 20260624_destacada_hasta.sql / 20260805d_cron_expirar_destacadas.sql):
-- función SQL agendada con pg_cron, sin pasar por una edge function.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.cerrar_rentas_baratas_vencidas()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INT;
BEGIN
  WITH cerradas AS (
    UPDATE propiedades
    SET estado = 'rentada'
    WHERE operacion = 'renta'
      AND estado = 'disponible'
      AND precio > 0 AND precio <= 15000
      AND created_at <= NOW() - INTERVAL '3 months'
    RETURNING id
  )
  SELECT COUNT(*) INTO v_count FROM cerradas;
  RETURN v_count;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.cerrar_rentas_baratas_vencidas() FROM anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('cerrar-rentas-baratas');
EXCEPTION WHEN OTHERS THEN NULL;
END
$$;

-- Una vez al día basta (la condición es de meses, no de minutos).
SELECT cron.schedule('cerrar-rentas-baratas', '0 8 * * *', $cron$
  SELECT public.cerrar_rentas_baratas_vencidas();
$cron$);

-- Aplicar de inmediato a las que YA cumplen la condición (retroactivo).
SELECT public.cerrar_rentas_baratas_vencidas();

SELECT pg_notify('pgrst', 'reload schema');

-- ── Nota al aplicarla (24/09/2026) ───────────────────────────────────────────
-- Esta migración estuvo en git desde el 23/09 pero NUNCA llegó a aplicarse:
-- marca 'rentada' y el CHECK de la tabla solo admitía 'disponible' y 'vendida',
-- así que reventaba. El estado se añadió en 20260928_estado_rentada.sql, que
-- debe correr ANTES que esta.
--
-- Al aplicarla se vio que la condición "precio <= 15000" también atrapaba las
-- fichas con precio 0, que no son rentas baratas sino propiedades a las que
-- nadie les puso precio: de las 5 que cerró, 3 eran de esas. Por eso ahora se
-- exige "precio > 0", y esas 3 se devolvieron a 'disponible'.
--
-- Estado final: 2 propiedades cerradas (VR-502 y VR-626, ambas de $15,000).
-- Los valores previos quedaron en public.propiedades_respaldo_rentadas_20260924:
--
--   UPDATE public.propiedades p SET estado = b.estado
--     FROM public.propiedades_respaldo_rentadas_20260924 b WHERE b.id = p.id;
--   SELECT cron.unschedule('cerrar-rentas-baratas');
