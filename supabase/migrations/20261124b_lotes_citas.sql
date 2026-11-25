-- "Armar lotes" en citas-venta (clientes viejos para re-contactar) deja de ser
-- un corte momentáneo en memoria: cuando un admin/supervisor "da" un lote,
-- queda guardado aquí con un snapshot FIJO de qué citas lo componen (citas_ids)
-- y a quién se le dio. Esto habilita:
--   (a) la restricción "ya no se puede dar otra vez" — un mismo conjunto exacto
--       de citas no se puede volver a dar (índice único sobre citas_hash);
--   (b) el registro de a quién se le asignó, ya sea un usuario real de la app
--       (asignado_a) o un nombre escrito a mano (asignado_texto), para cuando
--       se entrega fuera de la app;
--   (c) que si se asignó a un usuario real, ese lote le aparezca en su propia
--       pantalla (mis_lotes_citas()) como una lista de clientes a contactar.
CREATE TABLE IF NOT EXISTS public.lotes_citas (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  numero         int NOT NULL,               -- posición dentro de la vista donde se armó (solo informativo)
  tamano         int NOT NULL,
  citas_ids      uuid[] NOT NULL,            -- snapshot fijo de citas_venta.id al momento de darlo
  -- Hash estable del set de citas_ids (orden no importa) — permite el índice
  -- único de abajo sin depender de que el arreglo llegue ya ordenado.
  citas_hash     text GENERATED ALWAYS AS (
    array_to_string((SELECT array_agg(x ORDER BY x) FROM unnest(citas_ids) AS x), ',')
  ) STORED,
  filtro_desc    text,                       -- descripción legible de los filtros usados (informativo)
  creado_por     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  dado           boolean NOT NULL DEFAULT true,
  dado_at        timestamptz NOT NULL DEFAULT now(),
  asignado_a     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  asignado_texto text,
  trabajado      boolean NOT NULL DEFAULT false,
  trabajado_at   timestamptz,
  CONSTRAINT lotes_citas_asignado_chk CHECK (asignado_a IS NOT NULL OR asignado_texto IS NOT NULL)
);

-- Un mismo conjunto de citas no se puede dar dos veces.
CREATE UNIQUE INDEX IF NOT EXISTS uq_lotes_citas_hash ON public.lotes_citas (citas_hash);

CREATE INDEX IF NOT EXISTS idx_lotes_citas_asignado ON public.lotes_citas (asignado_a);

ALTER TABLE public.lotes_citas ENABLE ROW LEVEL SECURITY;

-- Mismo candado que citas_venta: solo admin/supervisor arman y ven todos los lotes.
DROP POLICY IF EXISTS lotes_citas_admin ON public.lotes_citas;
CREATE POLICY lotes_citas_admin ON public.lotes_citas FOR ALL
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin','supervisor')));

-- El prospectador asignado solo puede VER sus propios lotes (fila cruda, sin
-- los datos de citas_venta — esos se los da mis_lotes_citas() de abajo,
-- porque citas_venta en sí está blindada solo para admin/supervisor).
DROP POLICY IF EXISTS lotes_citas_asignado_select ON public.lotes_citas;
CREATE POLICY lotes_citas_asignado_select ON public.lotes_citas FOR SELECT
  USING (asignado_a = auth.uid());

-- ── PROSPECTADOR: lotes que le dieron, con los datos de cada cliente ya
--    resueltos desde citas_venta (que él no puede leer directamente). ────────
CREATE OR REPLACE FUNCTION public.mis_lotes_citas()
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
            'detalles_pago', cv.detalles_pago,
            'fecha_cita', cv.fecha_cita
          ) ORDER BY cv.fecha_cita NULLS LAST)
          FROM public.citas_venta cv
          WHERE cv.id = ANY(l.citas_ids)
        ) AS clientes
      FROM public.lotes_citas l
      WHERE l.asignado_a = v_uid
    ) t
  ), '[]'::jsonb);
END;
$$;
GRANT EXECUTE ON FUNCTION public.mis_lotes_citas() TO authenticated;

-- ── PROSPECTADOR: marca un lote propio como ya trabajado. ───────────────────
CREATE OR REPLACE FUNCTION public.marcar_lote_trabajado(p_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.lotes_citas
     SET trabajado = true, trabajado_at = now()
   WHERE id = p_id AND asignado_a = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Lote no encontrado o no asignado a ti';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.marcar_lote_trabajado(uuid) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
