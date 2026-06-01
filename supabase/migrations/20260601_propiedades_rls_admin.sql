-- ══════════════════════════════════════════════════════════════
-- FIX: Políticas RLS para tabla propiedades
-- Admins pueden crear, editar y eliminar propiedades.
-- Todos los usuarios autenticados pueden leer.
-- ══════════════════════════════════════════════════════════════

-- Asegurarse que RLS esté habilitado
ALTER TABLE public.propiedades ENABLE ROW LEVEL SECURITY;

-- Limpiar políticas existentes para evitar conflictos
DROP POLICY IF EXISTS "propiedades_select_all"    ON public.propiedades;
DROP POLICY IF EXISTS "propiedades_insert_admin"  ON public.propiedades;
DROP POLICY IF EXISTS "propiedades_update_admin"  ON public.propiedades;
DROP POLICY IF EXISTS "propiedades_delete_admin"  ON public.propiedades;

-- Todos los usuarios autenticados pueden ver propiedades
CREATE POLICY "propiedades_select_all" ON public.propiedades
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Solo admins pueden insertar
CREATE POLICY "propiedades_insert_admin" ON public.propiedades
  FOR INSERT
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Solo admins pueden actualizar
CREATE POLICY "propiedades_update_admin" ON public.propiedades
  FOR UPDATE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Solo admins pueden eliminar
CREATE POLICY "propiedades_delete_admin" ON public.propiedades
  FOR DELETE
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
