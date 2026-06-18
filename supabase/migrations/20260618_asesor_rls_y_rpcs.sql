-- =========================================================
-- Extender visibilidad de equipo completo (como Supervisor)
-- al nuevo rol 'asesor', solo en las tablas/RPCs que las
-- pantallas reutilizadas por el hub de Asesor necesitan:
--   - clientes (CRM)            -> app/(admin)/crm.tsx, detalle-cliente.tsx
--   - citas_coordinacion        -> app/(admin)/coordinacion-citas.tsx
--   - get_prospectadores()      -> para que el admin siga viendo/gestionando
--                                   al usuario en Usuarios tras promoverlo
-- =========================================================

-- ── clientes (CRM): asesor ve/gestiona como admin/supervisor ──
DROP POLICY IF EXISTS "clientes_select" ON clientes;
CREATE POLICY "clientes_select" ON clientes FOR SELECT USING (
  auth.uid() = responsable_id OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'asesor'))
);

DROP POLICY IF EXISTS "clientes_update" ON clientes;
CREATE POLICY "clientes_update" ON clientes FOR UPDATE USING (
  auth.uid() = responsable_id OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'asesor'))
);

DROP POLICY IF EXISTS "clientes_delete" ON clientes;
CREATE POLICY "clientes_delete" ON clientes FOR DELETE USING (
  auth.uid() = responsable_id OR
  EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor', 'asesor'))
);

-- ── citas_coordinacion: asesor ve/gestiona como admin/supervisor ──
DROP POLICY IF EXISTS "citas_admin_all" ON public.citas_coordinacion;
CREATE POLICY "citas_admin_all" ON public.citas_coordinacion
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'supervisor', 'asesor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND role IN ('admin', 'supervisor', 'asesor')
    )
  );

-- ── get_prospectadores(): que 'asesor' siga apareciendo en Usuarios ──
CREATE OR REPLACE FUNCTION get_prospectadores()
RETURNS TABLE (
  id            UUID,
  email         TEXT,
  nombre        TEXT,
  created_at    TIMESTAMPTZ,
  last_seen     TIMESTAMPTZ,
  role          TEXT,
  valera_coins  INTEGER
) AS $$
BEGIN
  RETURN QUERY
  SELECT
    p.id,
    au.email::TEXT,
    p.nombre,
    p.created_at,
    p.last_seen,
    p.role,
    COALESCE(us.valera_coins, 0)::INTEGER
  FROM profiles p
  JOIN auth.users au ON au.id = p.id
  LEFT JOIN public.user_stats us ON us.id = p.id
  WHERE p.role IN ('prospectador', 'prospectador_plus', 'nuevo', 'supervisor', 'asesor')
  ORDER BY p.created_at DESC;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

SELECT pg_notify('pgrst', 'reload schema');
