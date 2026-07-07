-- ═══════════════════════════════════════════════════════════════════════════
-- Fix: asignar leads del pool truena con
--   new row for relation "notificaciones" violates check constraint
--   "notificaciones_tipo_check"
--
-- Causa: asignar_lead_desde_pool() inserta una alerta a admins con tipo='sistema'
-- cuando el pool baja de 3 leads. El tipo 'sistema' SÍ se había agregado en
-- 20260622_fix_notif_tipo_sistema.sql, pero ese mismo día
-- 20260622_notif_registro_constructora.sql recreó el constraint DESPUÉS y omitió
-- 'sistema', revirtiendo el fix en producción.
--
-- Esta es la lista COMPLETA y definitiva. Si en el futuro se agrega un tipo,
-- edítese ESTA lista completa (no recrear el constraint parcialmente).
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;
ALTER TABLE public.notificaciones ADD CONSTRAINT notificaciones_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'nueva_propiedad','destacada','exclusiva','recordatorio',
    'nuevo_cliente','login','tienda','ruleta','cofre','lead_caliente','apartado',
    'registro_constructora','sistema'
  ]));

NOTIFY pgrst, 'reload schema';
