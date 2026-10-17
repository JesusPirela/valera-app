-- ══════════════════════════════════════════════════════════════════════════════
-- Chatbot automático para leads de campaña sin respuesta en 24h.
--
-- El primer contacto de un lead de campaña debe ser humano (WhatsApp personal
-- del prospectador o llamada — ninguno de los dos pasa por Twilio, así que no
-- hay forma de detectar automáticamente si el cliente contestó). Por eso se
-- agrega un campo de confirmación MANUAL: el prospectador marca "¿Te
-- contestó?" sí/no después de contactarlo. Si pasan 24h desde el primer
-- contacto sin que se marque "sí" en NINGUNO de los dos canales, un cron
-- dispara al chatbot — mismo mecanismo que el botón manual "Enviar al
-- chatbot" (edge function agregar-cliente-chatbot), pero sin su tope mensual
-- ni el mínimo de presupuesto (aquí decide el sistema, no el prospectador).
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS primer_contacto_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS respuesta_cliente BOOLEAN; -- NULL = sin marcar, true = sí contestó, false = marcado explícito "no contestó"

COMMENT ON COLUMN public.clientes.primer_contacto_at IS
  'Hora del primer toque (WhatsApp o llamada) a un lead de campaña — arranca el plazo de 24h antes de mandarlo al chatbot.';
COMMENT ON COLUMN public.clientes.respuesta_cliente IS
  'Confirmación MANUAL del prospectador: ¿el cliente respondió? NULL = sin marcar. No se puede detectar automático: ni WhatsApp personal ni llamada pasan por Twilio.';

CREATE INDEX IF NOT EXISTS idx_clientes_campania_sin_respuesta
  ON public.clientes(primer_contacto_at)
  WHERE es_lead_campania = true AND eliminado_at IS NULL;

-- Distingue en la auditoría si el envío al chatbot fue el botón manual del
-- prospectador o este disparo automático por falta de respuesta.
ALTER TABLE public.chatbot_reactivaciones
  ADD COLUMN IF NOT EXISTS origen TEXT NOT NULL DEFAULT 'manual'
    CHECK (origen IN ('manual', 'auto_campania'));

SELECT pg_notify('pgrst', 'reload schema');
