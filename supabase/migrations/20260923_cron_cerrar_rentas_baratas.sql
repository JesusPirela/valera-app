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
      AND precio <= 15000
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
