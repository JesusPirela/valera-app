-- CUENTAS DE INMOBILIARIA ALIADA · "Mis citas", propio de cada agencia.
--
-- NO es el mismo `citas_coordinacion` que usan nuestros asesores: ese es el
-- pool de leads NUESTROS que un admin/gerente reparte a SU gente — mezclar
-- ahí a un aliado sería dejarlo tocar información interna que no le toca.
-- Esta es una agenda APARTE, para que una agencia aliada programe y le dé
-- seguimiento a las citas de SUS propios clientes (sobre su inventario o el
-- catálogo compartido). Mismo vocabulario de estados que ya usan nuestros
-- asesores (visual, nada más — son tablas distintas) para que a quien
-- venga del lado de Valera no le resulte un lenguaje nuevo.
CREATE TABLE IF NOT EXISTS public.citas_aliado (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_id     uuid NOT NULL REFERENCES public.clientes(id) ON DELETE CASCADE,
  propiedad_id   uuid REFERENCES public.propiedades(id) ON DELETE SET NULL,
  propiedad_externa text,
  fecha_cita     timestamptz,
  estado         text NOT NULL DEFAULT 'coordinada',
  notas          text,
  responsable_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_citas_aliado_responsable ON public.citas_aliado (responsable_id);
CREATE INDEX IF NOT EXISTS idx_citas_aliado_cliente ON public.citas_aliado (cliente_id);

CREATE OR REPLACE FUNCTION public.fn_citas_aliado_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS tr_citas_aliado_touch ON public.citas_aliado;
CREATE TRIGGER tr_citas_aliado_touch BEFORE UPDATE ON public.citas_aliado
  FOR EACH ROW EXECUTE FUNCTION public.fn_citas_aliado_touch();

ALTER TABLE public.citas_aliado ENABLE ROW LEVEL SECURITY;

-- El responsable administra SUS citas por completo.
DROP POLICY IF EXISTS citas_aliado_propio ON public.citas_aliado;
CREATE POLICY citas_aliado_propio ON public.citas_aliado
  FOR ALL TO authenticated
  USING (responsable_id = (SELECT auth.uid()))
  WITH CHECK (
    responsable_id = (SELECT auth.uid())
    -- El cliente de la cita tiene que ser SUYO: sin esto, cualquier aliado
    -- podría agendarle una cita a un cliente que no es suyo con solo
    -- adivinar su id.
    AND EXISTS (SELECT 1 FROM public.clientes cl WHERE cl.id = cliente_id AND cl.responsable_id = (SELECT auth.uid()))
  );

-- El titular ve (solo lectura) las citas de TODA su agencia — mismo patrón
-- que clientes_select_aliado_titular de 20261130_aliado_correcciones.
DROP POLICY IF EXISTS citas_aliado_titular ON public.citas_aliado;
CREATE POLICY citas_aliado_titular ON public.citas_aliado
  FOR SELECT TO authenticated
  USING (
    public.es_aliado_admin()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = citas_aliado.responsable_id AND p.inmobiliaria_id = public.mi_inmobiliaria()
    )
  );

SELECT pg_notify('pgrst', 'reload schema');

-- REVERTIR
--   drop table public.citas_aliado;
--   drop function public.fn_citas_aliado_touch();
