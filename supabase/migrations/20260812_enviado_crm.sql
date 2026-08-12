-- Leads de campaña: poder "mandar" un lead al CRM normal.
--
-- El asesor revisa sus leads de campaña y, cuando uno le sirve, lo manda a su
-- CRM normal con un botón. Al hacerlo:
--   • enviado_crm = true  → el cliente SÍ aparece en el CRM normal
--     (clientesCrm = NOT es_lead_campania OR enviado_crm),
--   • sale de la pestaña "Por atender" del apartado de campaña y queda en
--     "Enviados al CRM" (historial), sin borrarse.
-- Es reversible (botón "Deshacer" → enviado_crm=false).

ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS enviado_crm    boolean NOT NULL DEFAULT false;
ALTER TABLE public.clientes ADD COLUMN IF NOT EXISTS enviado_crm_at timestamptz;
