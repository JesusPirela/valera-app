-- ══════════════════════════════════════════════════════════════
-- FIX seguridad: el inventario se filtraba a prospectadores.
-- Existían políticas SELECT permisivas para prospectadores que NO
-- excluían es_inventario. Como las políticas RLS se combinan con OR,
-- bastaba con que una de ellas concediera acceso para ver el inventario.
--
-- Solución: consolidar en una sola política de prospectador que excluye
-- el inventario. Los prospectadores siguen viendo el catálogo (también vía
-- propiedades_select_all). Solo los admins ven es_inventario = true.
-- ══════════════════════════════════════════════════════════════

DROP POLICY IF EXISTS "Prospectadores pueden ver" ON public.propiedades;
DROP POLICY IF EXISTS "prospectadores_select"     ON public.propiedades;

CREATE POLICY "prospectadores_select" ON public.propiedades
  FOR SELECT
  USING (
    es_inventario = false
    AND EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role = ANY (ARRAY['prospectador', 'prospectador_plus'])
    )
  );
