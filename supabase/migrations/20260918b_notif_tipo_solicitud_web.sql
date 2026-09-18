-- Agrega 'solicitud_web' al CHECK de notificaciones.tipo (usado por
-- registrar-solicitud-web al notificar a admin/supervisor de una nueva
-- solicitud o candidato del sitio). Copia EXACTA de la lista vigente
-- (20260731b_coleccion_favorito_notif.sql) + el nuevo valor — sin esto el
-- INSERT de la Edge Function falla con "violates check constraint
-- notificaciones_tipo_check".
ALTER TABLE public.notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;
ALTER TABLE public.notificaciones ADD CONSTRAINT notificaciones_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'nueva_propiedad','destacada','exclusiva','recordatorio','nuevo_cliente','login',
    'tienda','ruleta','cofre','lead_caliente','apartado','registro_constructora',
    'sistema','cita','ascenso_rol','bajada_precio','coleccion_favorito','solicitud_web'
  ]));
