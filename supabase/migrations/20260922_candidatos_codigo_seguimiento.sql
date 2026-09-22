-- ══════════════════════════════════════════════════════════════════════════════
-- Seguimiento de solicitud SIN CUENTA para candidatos de reclutamiento.
-- El candidato recibe un código único al aplicar y lo usa después para
-- consultar el estado de su solicitud, sin login ni contraseña — el código
-- es la única "credencial". Por eso la acción de consulta (en
-- registrar-solicitud-web) solo devuelve nombre (primero) + estado, nunca
-- teléfono/email/mensaje/documentos.
--
-- Formato: VLR-XXXXXX (6 caracteres tras el guion), generado por la edge
-- function con el charset 23456789ABCDEFGHJKLMNPQRSTUVWXYZ (32 símbolos):
-- dígitos 2-9 + mayúsculas SIN 0/O/1/I, para que no se confundan al
-- dictarlo o transcribirlo a mano.
-- ══════════════════════════════════════════════════════════════════════════════

ALTER TABLE public.candidatos_reclutamiento
  ADD COLUMN IF NOT EXISTS codigo_seguimiento TEXT UNIQUE;

SELECT pg_notify('pgrst', 'reload schema');
