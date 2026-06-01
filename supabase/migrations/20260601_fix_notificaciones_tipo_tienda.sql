-- Agregar 'tienda' al check constraint de notificaciones.tipo
-- Sin esto, las notificaciones de compra/entrega de la tienda fallan
ALTER TABLE public.notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;
ALTER TABLE public.notificaciones ADD CONSTRAINT notificaciones_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'nueva_propiedad','destacada','exclusiva','recordatorio',
    'nuevo_cliente','login','tienda'
  ]));
