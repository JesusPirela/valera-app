-- Razón de descarte al cerrar un lead en el CRM
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS razon_descarte TEXT;

-- Razón de cancelación al cancelar una cita
ALTER TABLE public.citas_coordinacion
  ADD COLUMN IF NOT EXISTS razon_cancelacion TEXT;
