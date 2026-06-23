-- Fix: la migración del Pool de Leads (20260622_leads_pool.sql) usa
-- tipo = 'sistema' en 3 lugares (alerta de pool bajo, pool vacío, y el
-- premio de cofre/ruleta "Acceso prioritario") pero ese valor nunca se
-- agregó al CHECK constraint — por eso truena:
--   new row for relation "notificaciones" violates check constraint
--   "notificaciones_tipo_check"

ALTER TABLE public.notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;
ALTER TABLE public.notificaciones ADD CONSTRAINT notificaciones_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'nueva_propiedad','destacada','exclusiva','recordatorio',
    'nuevo_cliente','login','tienda','ruleta','cofre','lead_caliente','apartado',
    'registro_constructora','sistema'
  ]));

SELECT pg_notify('pgrst', 'reload schema');
