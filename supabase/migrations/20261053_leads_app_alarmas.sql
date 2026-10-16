-- Todos mis leads de campaña, no solo los que están sonando.
--
-- mis_leads_alarma() devuelve únicamente lo pendiente, que es lo que la alarma
-- necesita. Pero una app que solo recibe un aviso y enseña un botón es, en
-- palabras de la propia guía de Apple, "push notifications alone", y la
-- rechazan por funcionalidad mínima.
--
-- Más allá de la revisión, tiene sentido por sí solo: quien recibe la alarma
-- en el teléfono quiere ver a quién más le debe una llamada, no solo al que
-- está gritando ahora.
--
-- 30 días y no 7 como la alarma: la alarma solo persigue lo reciente, pero la
-- lista sirve para dar seguimiento a lo de semanas atrás.
CREATE OR REPLACE FUNCTION public.mis_leads_campania_app()
RETURNS TABLE(
  id uuid, nombre text, telefono text,
  zona text, presupuesto text, estado text,
  wa int, llamadas int,
  creado timestamptz, pospuesto_hasta timestamptz
)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' STABLE AS $fn$
  SELECT c.id, c.nombre, c.telefono, c.zona_busqueda, c.presupuesto, c.estado,
         COALESCE(c.wa_count, 0)::int, COALESCE(c.call_count, 0)::int,
         c.created_at,
         (SELECT ap.hasta FROM public.alarma_pospuesta ap
           WHERE ap.user_id = c.responsable_id AND ap.tipo = 'alarma_lead'
             AND ap.referencia_id = c.id AND ap.hasta > now())
    FROM public.clientes c
   WHERE c.responsable_id = auth.uid()
     AND c.es_lead_campania
     AND c.eliminado_at IS NULL
     AND c.created_at > now() - interval '30 days'
   -- Primero los que faltan por contactar, y dentro de esos los más nuevos:
   -- es el orden en el que hay que trabajarlos.
   ORDER BY (COALESCE(c.wa_count,0) = 0 AND COALESCE(c.call_count,0) = 0) DESC,
            c.created_at DESC;
$fn$;

GRANT EXECUTE ON FUNCTION public.mis_leads_campania_app() TO authenticated;
