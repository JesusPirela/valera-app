-- Auditoría de clientes enviados manualmente al chatbot de reactivación
-- (botón "Enviar al chatbot" en el CRM de prospectador_plus/asesor/supervisor).
-- También sirve para aplicar el tope de 10 envíos por mes por usuario.

CREATE TABLE IF NOT EXISTS chatbot_reactivaciones (
  id              UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  prospectador_id UUID        NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  cliente_id      UUID        REFERENCES clientes(id) ON DELETE SET NULL,
  nombre          TEXT        NOT NULL,
  telefono        TEXT        NOT NULL,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_reactivaciones_prospectador
  ON chatbot_reactivaciones(prospectador_id, created_at);

ALTER TABLE chatbot_reactivaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS chatbot_reactivaciones_select ON chatbot_reactivaciones;
CREATE POLICY chatbot_reactivaciones_select ON chatbot_reactivaciones FOR SELECT USING (
  auth.uid() = prospectador_id OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor'))
);

-- Sin policy de INSERT/UPDATE/DELETE para clientes autenticados: los registros
-- solo se crean desde la edge function "agregar-cliente-chatbot" con el
-- service role, que ignora RLS.

SELECT pg_notify('pgrst', 'reload schema');
