-- Tabla aparte para clientes de Vinte (constructora aliada) — accesible desde
-- la pestaña "Vinte" dentro de Citas de venta, pero es una tabla propia, SIN
-- relación con citas_venta. Ligera a propósito: sin retro, sin chatbot, sin
-- gráficas — solo una lista editable para importar/exportar y repartir en
-- lotes, igual que "Armar lotes" en citas-venta.
CREATE TABLE IF NOT EXISTS public.clientes_vinte (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cliente_nombre   text,
  telefono         text,
  zona_interesada  text,
  presupuesto      numeric,
  fecha_contacto   date,
  notas            text,
  creado_por       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_clientes_vinte_created ON public.clientes_vinte (created_at DESC);

CREATE OR REPLACE FUNCTION public.fn_clientes_vinte_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS tr_clientes_vinte_touch ON public.clientes_vinte;
CREATE TRIGGER tr_clientes_vinte_touch BEFORE UPDATE ON public.clientes_vinte
  FOR EACH ROW EXECUTE FUNCTION public.fn_clientes_vinte_touch();

-- Mismo candado que citas_venta: exclusiva admin/supervisor.
ALTER TABLE public.clientes_vinte ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS clientes_vinte_admin ON public.clientes_vinte;
CREATE POLICY clientes_vinte_admin ON public.clientes_vinte FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','supervisor')));

-- ── Lotes de clientes_vinte — mismo mecanismo que lotes_citas (misma función
--    _uuid_array_sort_text de esa migración, reutilizada tal cual). ──────────
CREATE TABLE IF NOT EXISTS public.lotes_vinte (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero         int NOT NULL,
  tamano         int NOT NULL,
  clientes_ids   uuid[] NOT NULL,
  clientes_hash  text GENERATED ALWAYS AS (public._uuid_array_sort_text(clientes_ids)) STORED,
  creado_por     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  dado           boolean NOT NULL DEFAULT true,
  dado_at        timestamptz NOT NULL DEFAULT now(),
  asignado_a     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  asignado_texto text,
  trabajado      boolean NOT NULL DEFAULT false,
  trabajado_at   timestamptz,
  CONSTRAINT lotes_vinte_asignado_chk CHECK (asignado_a IS NOT NULL OR asignado_texto IS NOT NULL)
);

CREATE UNIQUE INDEX IF NOT EXISTS uq_lotes_vinte_hash ON public.lotes_vinte (clientes_hash);
CREATE INDEX IF NOT EXISTS idx_lotes_vinte_asignado ON public.lotes_vinte (asignado_a);

ALTER TABLE public.lotes_vinte ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS lotes_vinte_admin ON public.lotes_vinte;
CREATE POLICY lotes_vinte_admin ON public.lotes_vinte FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','supervisor')));

DROP POLICY IF EXISTS lotes_vinte_asignado_select ON public.lotes_vinte;
CREATE POLICY lotes_vinte_asignado_select ON public.lotes_vinte FOR SELECT
  USING (asignado_a = auth.uid());

-- ── PROSPECTADOR: lotes de Vinte que le dieron, con los datos ya resueltos
--    desde clientes_vinte (él no puede leer esa tabla directamente). ────────
CREATE OR REPLACE FUNCTION public.mis_lotes_vinte()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'No autenticado'; END IF;

  RETURN COALESCE((
    SELECT jsonb_agg(row_to_json(t) ORDER BY t.dado_at DESC)
    FROM (
      SELECT
        l.id, l.numero, l.tamano, l.dado_at, l.trabajado, l.trabajado_at,
        (
          SELECT jsonb_agg(jsonb_build_object(
            'id', cv.id,
            'cliente_nombre', cv.cliente_nombre,
            'telefono', cv.telefono,
            'zona_interesada', cv.zona_interesada,
            'presupuesto', cv.presupuesto,
            'fecha_contacto', cv.fecha_contacto,
            'notas', cv.notas
          ) ORDER BY cv.fecha_contacto NULLS LAST)
          FROM public.clientes_vinte cv
          WHERE cv.id = ANY(l.clientes_ids)
        ) AS clientes
      FROM public.lotes_vinte l
      WHERE l.asignado_a = v_uid
    ) t
  ), '[]'::jsonb);
END;
$$;
GRANT EXECUTE ON FUNCTION public.mis_lotes_vinte() TO authenticated;

-- ── PROSPECTADOR: marca un lote de Vinte propio como ya trabajado. ───────────
CREATE OR REPLACE FUNCTION public.marcar_lote_vinte_trabajado(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.lotes_vinte
     SET trabajado = true, trabajado_at = now()
   WHERE id = p_id AND asignado_a = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote no encontrado o no asignado a ti';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.marcar_lote_vinte_trabajado(uuid) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
