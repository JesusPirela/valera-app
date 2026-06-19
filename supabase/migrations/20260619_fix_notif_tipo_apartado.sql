-- ══════════════════════════════════════════════════════════════
-- Fix: el trigger tr_notif_apartado (20260618_notif_apartado.sql) inserta
-- notificaciones con tipo = 'apartado', pero ese valor nunca se agregó a
-- la restricción notificaciones_tipo_check. Por eso al marcar un cliente
-- como "Apartó/Compró" truena con:
--   new row for relation "notificaciones" violates check constraint
--   "notificaciones_tipo_check"
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;
ALTER TABLE public.notificaciones ADD CONSTRAINT notificaciones_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'nueva_propiedad','destacada','exclusiva','recordatorio',
    'nuevo_cliente','login','tienda','ruleta','cofre','lead_caliente','apartado'
  ]));

SELECT pg_notify('pgrst', 'reload schema');
