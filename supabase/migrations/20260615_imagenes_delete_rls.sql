-- Fix: propiedad_imagenes no tenia politica de DELETE ni UPDATE.
-- Resultado: al editar una propiedad y quitar imagenes, el DELETE era
-- filtrado silenciosamente por RLS (sin error) y las imagenes reaparecian.

CREATE POLICY "imagenes_admin_delete" ON public.propiedad_imagenes
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "imagenes_admin_update" ON public.propiedad_imagenes
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );
