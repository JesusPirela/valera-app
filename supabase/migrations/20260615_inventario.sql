-- ══════════════════════════════════════════════════════════════
-- INVENTARIO (solo admins)
-- Propiedades marcadas como inventario son un conjunto SEPARADO del
-- catálogo publicado: sirven para dar seguimiento a opciones de terceros
-- (p.ej. "Lonas Taray Club") antes de publicarlas. Se agrupan por sección
-- y traen una checklist de seguimiento con los asesores.
--
-- Reglas:
--  • Solo admins pueden VER filas de inventario (RLS).
--  • Nunca deben filtrarse a prospectadores ni a la ficha pública anon.
--  • Al "publicar" una opción de inventario se pone es_inventario = false
--    y pasa a formar parte del catálogo normal.
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.propiedades
  ADD COLUMN IF NOT EXISTS es_inventario          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inventario_seccion     text,
  ADD COLUMN IF NOT EXISTS inv_asesor_contactado  boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inv_asesor_respondio   boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inv_autorizado_publicar boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS inv_notas              text;

-- Índice para listar el inventario por sección rápidamente.
CREATE INDEX IF NOT EXISTS idx_propiedades_inventario
  ON public.propiedades (es_inventario, inventario_seccion)
  WHERE es_inventario = true;

-- ── RLS: usuarios autenticados ────────────────────────────────────────────
-- Los no-admin solo ven propiedades del catálogo (es_inventario = false).
-- Los admin ven todo (catálogo + inventario).
DROP POLICY IF EXISTS "propiedades_select_all" ON public.propiedades;
CREATE POLICY "propiedades_select_all" ON public.propiedades
  FOR SELECT
  USING (
    auth.role() = 'authenticated'
    AND (
      es_inventario = false
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

-- ── RLS: visitantes anónimos (ficha pública) ──────────────────────────────
-- La ficha pública nunca debe exponer inventario, aunque esté "disponible".
DROP POLICY IF EXISTS "propiedades_anon_disponibles" ON public.propiedades;
CREATE POLICY "propiedades_anon_disponibles"
  ON public.propiedades
  FOR SELECT
  TO anon
  USING (estado = 'disponible' AND es_inventario = false);

-- Imágenes: anon solo de propiedades disponibles que NO sean inventario.
DROP POLICY IF EXISTS "imagenes_anon_disponibles" ON public.propiedad_imagenes;
CREATE POLICY "imagenes_anon_disponibles"
  ON public.propiedad_imagenes
  FOR SELECT
  TO anon
  USING (
    EXISTS (
      SELECT 1 FROM public.propiedades p
      WHERE p.id = propiedad_imagenes.propiedad_id
        AND p.estado = 'disponible'
        AND p.es_inventario = false
    )
  );
