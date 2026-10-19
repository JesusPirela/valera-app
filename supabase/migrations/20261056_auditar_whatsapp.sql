-- Dejar de volar a ciegas con los WhatsApp de aviso al asesor.
--
-- Hoy la unica huella es leads_campania.whatsapp_enviado, un si/no que ademas
-- miente: la funcion lo pone en true aunque NO haya mandado nada, cuando el
-- asesor no tiene telefono registrado. Y aun cuando si manda, solo guarda que
-- Twilio ACEPTO el mensaje — que no es lo mismo que WhatsApp lo ENTREGARA.
-- Un mensaje puede aceptarse y morir despues (plantilla no aprobada, numero
-- sin WhatsApp, ventana de 24h), y de eso no queda rastro en ningun lado.
--
-- Con estas columnas se puede responder "¿le llego o no?" sin entrar a la
-- consola de Twilio y sin adivinar.
ALTER TABLE public.leads_campania ADD COLUMN IF NOT EXISTS whatsapp_sid text;
ALTER TABLE public.leads_campania ADD COLUMN IF NOT EXISTS whatsapp_error text;
ALTER TABLE public.leads_campania ADD COLUMN IF NOT EXISTS whatsapp_enviado_at timestamptz;

COMMENT ON COLUMN public.leads_campania.whatsapp_sid IS
  'SID del mensaje en Twilio. Con el se consulta el estado real de entrega.';
COMMENT ON COLUMN public.leads_campania.whatsapp_error IS
  'Por que no se mando o por que fallo. Null si salio bien.';
COMMENT ON COLUMN public.leads_campania.whatsapp_enviado_at IS
  'Cuando se acepto el envio. Null si nunca se intento.';

-- ── Lo que ya quedo mal marcado ───────────────────────────────────────────
-- Los 195 marcados como enviados no tienen SID ni fecha, asi que no hay forma
-- de saber cuales se mandaron de verdad. No se tocan: borrarles la bandera los
-- volveria a encolar y mandaria WhatsApps repetidos de leads viejos, que es
-- peor que la duda. Se marcan como de antes del registro, y de aqui en
-- adelante todo queda auditado.
UPDATE public.leads_campania
   SET whatsapp_error = 'sin registro: anterior a la auditoria'
 WHERE whatsapp_enviado AND whatsapp_sid IS NULL AND whatsapp_error IS NULL;
