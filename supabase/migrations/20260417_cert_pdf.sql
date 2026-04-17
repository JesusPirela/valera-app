-- =========================================================
-- Valera University — Certificación PDF
-- =========================================================

-- Marcar si un curso emite certificado oficial
ALTER TABLE vu_cursos ADD COLUMN IF NOT EXISTS es_certificacion BOOLEAN NOT NULL DEFAULT FALSE;

-- Guardar nombre completo del alumno para el certificado
ALTER TABLE vu_certificados ADD COLUMN IF NOT EXISTS nombre_completo TEXT;

-- RPC: guardar nombre en certificado (upsert)
CREATE OR REPLACE FUNCTION guardar_nombre_certificado(
  p_curso_id      UUID,
  p_nombre        TEXT
)
RETURNS VOID AS $$
BEGIN
  UPDATE vu_certificados
  SET nombre_completo = p_nombre
  WHERE user_id = auth.uid() AND curso_id = p_curso_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
