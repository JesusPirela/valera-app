-- ══════════════════════════════════════════════════════════════
-- GAMIFICATION ADMIN — políticas CRUD para rol admin
-- ══════════════════════════════════════════════════════════════

-- Admin puede gestionar misiones (INSERT / UPDATE / DELETE)
CREATE POLICY "misiones_admin_all" ON public.misiones
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admin puede gestionar artículos de tienda
CREATE POLICY "store_items_admin_all" ON public.store_items
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admin puede ver todas las compras de la tienda
CREATE POLICY "store_compras_admin_select" ON public.store_compras
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Admin puede ver todas las estadísticas de usuarios
CREATE POLICY "user_stats_admin_select" ON public.user_stats
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
