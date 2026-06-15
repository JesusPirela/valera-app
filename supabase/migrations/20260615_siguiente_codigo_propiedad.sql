-- ══════════════════════════════════════════════════════════════
-- Generación robusta del código de propiedad (VR-NNN).
-- El cálculo "max+1" en el cliente leía `select('codigo')`, que está
-- limitado a ~1000 filas. Al pasar de 1000 propiedades el máximo quedaba
-- subestimado y chocaba con un código existente (unique violation 23505).
-- Esta función calcula el siguiente número en el servidor (agregación,
-- sin límite de filas) y SECURITY DEFINER para ver todas las filas.
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.siguiente_codigo_propiedad()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MAX((substring(codigo FROM 'VR-([0-9]+)'))::int), 0) + 1
  FROM public.propiedades
  WHERE codigo ~ '^VR-[0-9]+$'
$$;

GRANT EXECUTE ON FUNCTION public.siguiente_codigo_propiedad() TO authenticated;
