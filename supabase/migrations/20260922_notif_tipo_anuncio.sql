-- Agrega 'anuncio' al CHECK de notificaciones.tipo.
--
-- Síntoma: al publicar un anuncio el RPC crear_anuncio fallaba con
--   new row for relation "notificaciones" violates check constraint
--   "notificaciones_tipo_check"
-- porque crear_anuncio inserta las notificaciones con tipo = 'anuncio' y ese
-- valor no estaba permitido. Publicar anuncios estaba roto en producción.
--
-- OJO: al revisar el constraint REAL en la base, tampoco estaba 'solicitud_web'
-- pese a existir la migración 20260918b_notif_tipo_solicitud_web.sql — esa
-- migración quedó en git pero NUNCA se aplicó (las migraciones no van con el
-- push; se corren aparte por la Management API). Por eso las notificaciones de
-- registrar-solicitud-web también fallaban en silencio. Esta migración deja la
-- lista completa y vigente, con AMBOS valores.
--
-- Aplicada a producción el 2026-09-22 y verificada.
ALTER TABLE public.notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;
ALTER TABLE public.notificaciones ADD CONSTRAINT notificaciones_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'nueva_propiedad','destacada','exclusiva','recordatorio','nuevo_cliente','login',
    'tienda','ruleta','cofre','lead_caliente','apartado','registro_constructora',
    'sistema','cita','ascenso_rol','bajada_precio','coleccion_favorito',
    'solicitud_web','anuncio'
  ]));
