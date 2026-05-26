-- Crear tabla si no existe (idempotente)
CREATE TABLE IF NOT EXISTS propiedad_publicada (
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  propiedad_id UUID NOT NULL REFERENCES propiedades(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (user_id, propiedad_id)
);

-- Activar RLS
ALTER TABLE propiedad_publicada ENABLE ROW LEVEL SECURITY;

-- Eliminar políticas anteriores si existen (para evitar duplicados)
DROP POLICY IF EXISTS "prospectadores_select_own" ON propiedad_publicada;
DROP POLICY IF EXISTS "prospectadores_insert_own" ON propiedad_publicada;
DROP POLICY IF EXISTS "prospectadores_delete_own" ON propiedad_publicada;
DROP POLICY IF EXISTS "admins_select_all" ON propiedad_publicada;

-- Cada prospectador solo ve sus propias publicaciones
CREATE POLICY "prospectadores_select_own" ON propiedad_publicada
  FOR SELECT USING (auth.uid() = user_id);

-- Cada prospectador solo inserta con su propio user_id
CREATE POLICY "prospectadores_insert_own" ON propiedad_publicada
  FOR INSERT WITH CHECK (auth.uid() = user_id);

-- Cada prospectador solo elimina sus propias publicaciones
CREATE POLICY "prospectadores_delete_own" ON propiedad_publicada
  FOR DELETE USING (auth.uid() = user_id);

-- Los admins pueden ver todas las publicaciones
CREATE POLICY "admins_select_all" ON propiedad_publicada
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
