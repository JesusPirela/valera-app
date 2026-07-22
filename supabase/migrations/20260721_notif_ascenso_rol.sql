-- Añade 'ascenso_rol' como tipo válido de notificación.
-- Se inserta desde la Edge Function cambiar-rol cuando el admin sube
-- a un usuario a 'prospectador' o 'prospectador_plus'.
ALTER TABLE public.notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;
ALTER TABLE public.notificaciones ADD CONSTRAINT notificaciones_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'nueva_propiedad','destacada','exclusiva','recordatorio',
    'nuevo_cliente','login','tienda','ruleta','cofre','lead_caliente','apartado',
    'registro_constructora','sistema','cita','ascenso_rol'
  ]));

NOTIFY pgrst, 'reload schema';
