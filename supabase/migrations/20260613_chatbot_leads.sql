-- =========================================================
-- Chatbot WhatsApp: leads gestionados por el bot, separados
-- por prospectador dueño, y notificación de "lead caliente"
-- =========================================================

-- ── Tabla de leads del chatbot ───────────────────────────

CREATE TABLE IF NOT EXISTS chatbot_leads (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  telefono          TEXT        UNIQUE NOT NULL,
  nombre            TEXT,
  prospectador_id   UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  estado            TEXT        NOT NULL DEFAULT 'contactado'
                                 CHECK (estado IN ('contactado', 'esperando_asesor', 'atendido')),
  perfil            JSONB,
  fecha_contactado  TIMESTAMPTZ,
  fecha_caliente    TIMESTAMPTZ,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_chatbot_leads_prospectador ON chatbot_leads(prospectador_id);
CREATE INDEX IF NOT EXISTS idx_chatbot_leads_telefono     ON chatbot_leads(telefono);

ALTER TABLE chatbot_leads ENABLE ROW LEVEL SECURITY;

-- Prospectador ve/actualiza solo sus leads; admin y supervisor ven/actualizan todos
CREATE POLICY "chatbot_leads_select" ON chatbot_leads FOR SELECT USING (
  auth.uid() = prospectador_id OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor'))
);

CREATE POLICY "chatbot_leads_update" ON chatbot_leads FOR UPDATE USING (
  auth.uid() = prospectador_id OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor'))
);

-- Auto-actualizar updated_at
CREATE OR REPLACE FUNCTION update_updated_at_chatbot_leads()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS chatbot_leads_updated_at ON chatbot_leads;
CREATE TRIGGER chatbot_leads_updated_at
  BEFORE UPDATE ON chatbot_leads
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_chatbot_leads();


-- ── notificaciones: soporte para 'lead_caliente' ─────────

ALTER TABLE notificaciones
  ADD COLUMN IF NOT EXISTS chatbot_lead_id UUID REFERENCES chatbot_leads(id) ON DELETE SET NULL;

ALTER TABLE public.notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;
ALTER TABLE public.notificaciones ADD CONSTRAINT notificaciones_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'nueva_propiedad','destacada','exclusiva','recordatorio',
    'nuevo_cliente','login','tienda','ruleta','cofre','lead_caliente'
  ]));


-- ── RPC: resolver el id de un perfil a partir de su email ─
-- (usada por la edge function chatbot-eventos para mapear
-- prospectador_email -> prospectador_id)

CREATE OR REPLACE FUNCTION get_profile_id_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id UUID;
BEGIN
  SELECT au.id INTO v_id
  FROM auth.users au
  WHERE lower(au.email) = lower(trim(p_email))
  LIMIT 1;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION get_profile_id_by_email(TEXT) TO service_role;

SELECT pg_notify('pgrst', 'reload schema');
