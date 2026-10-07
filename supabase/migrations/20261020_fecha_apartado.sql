-- El apartado tiene su propia fecha, y es esa la que debe mandar.
--
-- Una cita de agosto que se apartó en septiembre es un apartado de SEPTIEMBRE:
-- así es como se cuenta el mes y así tiene que aparecer en la tabla. Hasta
-- ahora solo existía la fecha de la CITA, así que ese apartado se quedaba
-- contando en agosto.
--
-- Se guardan las dos cosas, igual que con la cita: el texto que se muestra
-- (dia_apartado) y el timestamp real para ordenar y filtrar (fecha_apartado).
-- Sin el timestamp habría que adivinar el mes parseando texto en español, que
-- es justo lo que ya nos costó caro en otras pantallas.
ALTER TABLE public.citas_venta ADD COLUMN IF NOT EXISTS fecha_apartado timestamptz;
ALTER TABLE public.citas_venta ADD COLUMN IF NOT EXISTS dia_apartado   text;

-- La fecha que manda para ordenar, filtrar y agrupar por mes:
-- la del apartado si la cita está apartada y tiene una; si no, la de la cita.
--
-- Vive en la base y no solo en la pantalla para que la tabla, las gráficas y
-- cualquier reporte futuro usen EXACTAMENTE el mismo criterio. Cuando cada
-- pantalla calcula su propia fecha, acaban discrepando.
CREATE OR REPLACE FUNCTION public.fecha_efectiva_cita(
  p_estado text, p_fecha_apartado timestamptz, p_fecha_cita timestamptz
) RETURNS timestamptz
LANGUAGE sql IMMUTABLE SET search_path TO 'public' AS $fn$
  SELECT CASE
    WHEN p_fecha_apartado IS NOT NULL
     AND lower(coalesce(p_estado, '')) LIKE '%apart%'
    THEN p_fecha_apartado
    ELSE p_fecha_cita
  END
$fn$;

GRANT EXECUTE ON FUNCTION public.fecha_efectiva_cita(text, timestamptz, timestamptz) TO authenticated;

-- Índice para ordenar por ella sin recalcular en cada consulta.
CREATE INDEX IF NOT EXISTS idx_citas_venta_fecha_efectiva
  ON public.citas_venta (
    public.fecha_efectiva_cita(estado_seguimiento, fecha_apartado, fecha_cita)
  );

-- Comprobación: cuántos apartados hay y cuántos ya traen su fecha.
SELECT COUNT(*) AS apartados,
       COUNT(fecha_apartado) AS con_fecha_de_apartado
  FROM public.citas_venta
 WHERE lower(coalesce(estado_seguimiento, '')) LIKE '%apart%';
