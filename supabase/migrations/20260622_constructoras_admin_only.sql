-- El apartado de contactos (teléfonos) de constructoras debe ser exclusivo
-- de admin — el catálogo (solo lectura) sigue abierto a todos, pero editar
-- el teléfono ya no debe poder hacerlo un supervisor.
DROP POLICY IF EXISTS "constructoras_admin_write" ON public.constructoras;
CREATE POLICY "constructoras_admin_write" ON public.constructoras FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

SELECT pg_notify('pgrst', 'reload schema');
