-- Falta el estado 'rentada' en las propiedades.
--
-- La tabla solo admitía 'disponible' y 'vendida':
--     CHECK (estado = ANY (ARRAY['disponible', 'vendida']))
--
-- Por eso había dos cosas rotas en producción, las dos calladas:
--
-- 1) El modal de "Cambiar estado" masivo del panel de propiedades ofrece
--    "🔵 Rentada" desde hace tiempo. Al elegirlo, el UPDATE violaba el CHECK y
--    no cambiaba nada.
--
-- 2) La migración 20260923_cron_cerrar_rentas_baratas.sql se subió a git pero
--    NUNCA llegó a aplicarse, justamente porque marca las propiedades como
--    'rentada' y reventaba aquí. Es decir, el cierre automático de rentas
--    viejas y baratas que se dio por hecho no estaba corriendo.
--
-- Se amplía el CHECK y se deja 'rentada' como un estado de primera: una renta
-- cerrada no es una venta, y meterla en 'vendida' ensuciaría el conteo de
-- cierres de las estadísticas.

ALTER TABLE public.propiedades DROP CONSTRAINT IF EXISTS propiedades_estado_check;

ALTER TABLE public.propiedades ADD CONSTRAINT propiedades_estado_check
  CHECK (estado = ANY (ARRAY['disponible'::text, 'vendida'::text, 'rentada'::text]));

SELECT pg_notify('pgrst', 'reload schema');
