-- Leads de campañas de Facebook (Meta Lead Ads). El backend sincroniza los leads
-- vía Graph API; el admin ve la campaña + sus leads y puede asignar toda la
-- campaña a un asesor → los leads se vuelven clientes en su CRM.

CREATE TABLE IF NOT EXISTS public.campanias (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_id    text UNIQUE NOT NULL,
  nombre     text NOT NULL,
  estado     text,
  asignado_a uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);
ALTER TABLE public.campanias ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS campanias_admin ON public.campanias;
CREATE POLICY campanias_admin ON public.campanias FOR ALL
  USING     (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','supervisor')));

CREATE TABLE IF NOT EXISTS public.leads_campania (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  meta_lead_id    text UNIQUE NOT NULL,
  campania_id     uuid REFERENCES public.campanias(id) ON DELETE CASCADE,
  nombre          text,
  telefono        text,
  email           text,
  ad_set          text,
  ad              text,
  extra           jsonb,
  cliente_id      uuid REFERENCES public.clientes(id) ON DELETE SET NULL,
  lead_created_at timestamptz,
  created_at      timestamptz DEFAULT now()
);
ALTER TABLE public.leads_campania ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS leads_admin ON public.leads_campania;
CREATE POLICY leads_admin ON public.leads_campania FOR ALL
  USING     (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','supervisor')));
CREATE INDEX IF NOT EXISTS idx_leads_campania_camp ON public.leads_campania(campania_id);

-- Asignar una campaña a un asesor: convierte sus leads (sin cliente aún) en
-- clientes del CRM de ese asesor. Devuelve cuántos clientes creó. Solo admin.
CREATE OR REPLACE FUNCTION public.asignar_campania(p_campania_id uuid, p_user_id uuid)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_role text; v_n int := 0; r record; v_cid uuid;
BEGIN
  SELECT role INTO v_role FROM public.profiles WHERE id = auth.uid();
  IF v_role IS DISTINCT FROM 'admin' THEN RAISE EXCEPTION 'Solo un administrador puede asignar campañas'; END IF;

  UPDATE public.campanias SET asignado_a = p_user_id, updated_at = now() WHERE id = p_campania_id;

  FOR r IN SELECT * FROM public.leads_campania WHERE campania_id = p_campania_id AND cliente_id IS NULL LOOP
    INSERT INTO public.clientes (nombre, telefono, email, fuente_lead, estado, responsable_id)
      VALUES (COALESCE(NULLIF(TRIM(r.nombre), ''), 'Lead Facebook'),
              COALESCE(r.telefono, ''), NULLIF(r.email, ''),
              'facebook', 'por_perfilar', p_user_id)
      RETURNING id INTO v_cid;
    UPDATE public.leads_campania SET cliente_id = v_cid WHERE id = r.id;
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $$;
GRANT EXECUTE ON FUNCTION public.asignar_campania(uuid, uuid) TO authenticated;
