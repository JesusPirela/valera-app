-- ══════════════════════════════════════════════════════════════
-- Código de propiedad (VR-NNN): rellenar huecos.
-- Antes devolvía MAX+1, dejando "ids en el aire" cuando se borraba
-- una propiedad intermedia (p.ej. existe VR-001, VR-003 → faltaba VR-002).
-- Ahora devuelve el PRIMER número libre >= 1, de modo que cada nueva
-- propiedad ocupe el hueco más bajo disponible. Si no hay huecos,
-- devuelve MAX+1 (comportamiento equivalente al anterior).
-- El cliente sigue reintentando con +1 si hay carrera (unique 23505).
-- ══════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.siguiente_codigo_propiedad()
RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(MIN(s.n), 1)
  FROM generate_series(
    1,
    COALESCE(
      (SELECT MAX((substring(codigo FROM 'VR-([0-9]+)'))::int)
         FROM public.propiedades
        WHERE codigo ~ '^VR-[0-9]+$'),
      0
    ) + 1
  ) AS s(n)
  LEFT JOIN (
    SELECT (substring(codigo FROM 'VR-([0-9]+)'))::int AS num
      FROM public.propiedades
     WHERE codigo ~ '^VR-[0-9]+$'
  ) usados ON usados.num = s.n
  WHERE usados.num IS NULL
$$;

GRANT EXECUTE ON FUNCTION public.siguiente_codigo_propiedad() TO authenticated;
