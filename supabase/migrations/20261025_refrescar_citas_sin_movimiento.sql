-- Quita el cartel de "N días sin movimiento" de las citas del dashboard,
-- como si se hubieran movido hoy.
--
-- El cartel sale de citas_coordinacion.updated_at, así que basta ponerlo en
-- ahora. Lo que NO es trivial es hacerlo sin romper nada:
--
-- citas_coordinacion tiene un trigger (tr_citas_venta_desde_coord) que en cada
-- UPDATE sincroniza con citas_venta, y entre otras cosas BORRA la fila de
-- citas_venta cuando el estado no es coordinada/realizada/aparto/reagendada.
-- Justo los estados con cartel (por_contactar, primer_contacto,
-- buscando_opciones, en_coordinacion, no_responde_asesor, seguimiento_cierre_*,
-- falta_perfilamiento, recaudando_documentacion, aprobando_credito) caen fuera
-- de esa lista. Dispararlo 138 veces borraría citas de la tabla de venta.
--
-- Por eso el trigger se apaga durante el cambio y se vuelve a encender en la
-- MISMA transacción: si algo falla, el rollback lo deja encendido.
--
-- No se tocan las canceladas ni las realizadas: el KPI "canceladas del mes"
-- cuenta por updated_at, y moverlas inflaría ese número.
BEGIN;

CREATE TABLE IF NOT EXISTS public.citas_updated_at_respaldo AS
  SELECT id, updated_at, now() AS respaldado_at FROM public.citas_coordinacion WHERE false;

INSERT INTO public.citas_updated_at_respaldo (id, updated_at, respaldado_at)
SELECT id, updated_at, now() FROM public.citas_coordinacion;

ALTER TABLE public.citas_coordinacion DISABLE TRIGGER tr_citas_venta_desde_coord;

UPDATE public.citas_coordinacion
   SET updated_at = now()
 WHERE estado IN (
   'por_contactar','primer_contacto','buscando_opciones','en_coordinacion',
   'coordinada','reagendada','no_responde_asesor','seguimiento_cierre_alto',
   'seguimiento_cierre_bajo','falta_perfilamiento',
   'recaudando_documentacion','aprobando_credito'
 );

ALTER TABLE public.citas_coordinacion ENABLE TRIGGER tr_citas_venta_desde_coord;

COMMIT;

-- Comprobación: ninguna debe quedar con cartel (3 días o más).
SELECT COUNT(*) FILTER (WHERE (extract(epoch from (now() - updated_at))/86400)::int >= 3) AS con_cartel,
       COUNT(*)                                                                          AS en_estados_con_cartel,
       MAX((extract(epoch from (now() - updated_at))/86400)::int)                         AS el_mas_viejo
  FROM public.citas_coordinacion
 WHERE estado IN (
   'por_contactar','primer_contacto','buscando_opciones','en_coordinacion',
   'coordinada','reagendada','no_responde_asesor','seguimiento_cierre_alto',
   'seguimiento_cierre_bajo','falta_perfilamiento',
   'recaudando_documentacion','aprobando_credito'
 );
