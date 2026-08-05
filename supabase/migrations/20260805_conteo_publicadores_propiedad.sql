-- Conteo de usuarios distintos que han publicado cada propiedad.
-- Accessible a todos los usuarios autenticados: no revela quién publicó,
-- solo cuántos. Permite mostrar el badge "¡Sé de los primeros!" en el
-- listado cuando una propiedad ha sido publicada por muy pocos o ninguno.
CREATE OR REPLACE FUNCTION public.get_conteo_publicadores_propiedad()
RETURNS TABLE (propiedad_id uuid, total_usuarios integer)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT propiedad_id, COUNT(DISTINCT user_id)::integer AS total_usuarios
  FROM public.propiedad_publicacion
  WHERE veces_publicada > 0
  GROUP BY propiedad_id;
$$;

GRANT EXECUTE ON FUNCTION public.get_conteo_publicadores_propiedad() TO authenticated;
