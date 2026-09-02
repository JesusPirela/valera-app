-- Columna de fecha para la tabla de cierres: la fecha de la CITA (cuándo fue).
-- Si no hay, en la app se muestra la fecha de REGISTRO del cierre (created_at).
ALTER TABLE public.cierres
  ADD COLUMN IF NOT EXISTS fecha_cita date;

-- Backfill: traer la fecha de la cita más reciente que coincida por nombre.
UPDATE public.cierres c
SET fecha_cita = sub.fecha
FROM (
  SELECT lower(btrim(cliente_nombre)) AS nom,
         max(fecha_cita)::date        AS fecha
  FROM public.citas_venta
  WHERE fecha_cita IS NOT NULL
  GROUP BY 1
) sub
WHERE c.fecha_cita IS NULL
  AND lower(btrim(c.cliente_nombre)) = sub.nom;
