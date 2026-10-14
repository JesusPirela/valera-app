-- La configuración de la alarma también la ve quien ya trae leads de campaña.
--
-- La primera versión miraba solo campanias.asignado_a. Eso deja fuera un caso
-- real: se reasigna una campaña a otro asesor y los leads ya entregados se
-- quedan con el anterior, que sigue recibiendo alarmas por ellos y por tanto
-- sigue necesitando los permisos puestos. Con la condición vieja perdía la
-- pantalla para arreglarlos justo cuando le suena la alarma.
--
-- Medido antes de cambiarlo: con campaña asignada hay 2 personas (Martin y
-- Beto); con leads de campaña en la cartera, 3 (los dos anteriores más Alexis
-- Plus, la cuenta de pruebas). No abre la sección a medio equipo.
CREATE OR REPLACE FUNCTION public.tengo_campania_asignada()
RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' STABLE AS $fn$
  SELECT EXISTS (SELECT 1 FROM public.campanias c WHERE c.asignado_a = auth.uid())
      OR EXISTS (SELECT 1 FROM public.clientes cl
                  WHERE cl.responsable_id = auth.uid() AND cl.es_lead_campania);
$fn$;

GRANT EXECUTE ON FUNCTION public.tengo_campania_asignada() TO authenticated;
