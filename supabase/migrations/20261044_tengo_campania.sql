-- ¿Tengo una campaña asignada?
--
-- La pantalla de perfil enseña la configuración de la alarma solo a quien
-- recibe leads de campaña. Preguntarlo con un select directo no sirve: la RLS
-- de campanias solo deja leer a admin y supervisor, así que a Martin y a Beto
-- —los dos que SÍ tienen campaña— les devolvía cero y la sección no les
-- aparecía. Justo al revés de lo que se quiere.
--
-- Devuelve un booleano y nada más: no hace falta enseñar la campaña, solo
-- saber si la hay.
CREATE OR REPLACE FUNCTION public.tengo_campania_asignada()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' STABLE AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.campanias c WHERE c.asignado_a = auth.uid()
  );
$fn$;

GRANT EXECUTE ON FUNCTION public.tengo_campania_asignada() TO authenticated;
