-- ══════════════════════════════════════════════════════════════════════════════
-- SOLICITUDES DEL SITIO WEB — landing page pública (proyecto aparte, sitio
-- estático) envía aquí sus formularios, DELIBERADAMENTE separado del CRM
-- (tabla `clientes`): son solicitudes crudas sin perfilar, no deben mezclarse
-- con el pipeline de ventas que trabajan los prospectadores/asesores.
--
-- Dos tablas:
--  - solicitudes_sitio_web: contacto general o interés en una propiedad puntual
--  - candidatos_reclutamiento: aspirantes a asesor/prospectador
-- ══════════════════════════════════════════════════════════════════════════════

-- ── 1. Tablas ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.solicitudes_sitio_web (
  id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo              TEXT        NOT NULL
                                CHECK (tipo IN ('contacto_general', 'interes_propiedad')),
  nombre            TEXT        NOT NULL,
  telefono          TEXT        NOT NULL,
  mensaje           TEXT,
  -- Solo contacto_general
  presupuesto       TEXT,
  zona              TEXT,
  -- Solo interes_propiedad
  propiedad_codigo  TEXT,
  propiedad_titulo  TEXT,
  estado            TEXT        NOT NULL DEFAULT 'nuevo'
                                CHECK (estado IN ('nuevo', 'contactado', 'descartado')),
  created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_solicitudes_sitio_web_estado     ON public.solicitudes_sitio_web(estado);
CREATE INDEX IF NOT EXISTS idx_solicitudes_sitio_web_created_at ON public.solicitudes_sitio_web(created_at DESC);

CREATE TABLE IF NOT EXISTS public.candidatos_reclutamiento (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre      TEXT        NOT NULL,
  telefono    TEXT        NOT NULL,
  email       TEXT,
  mensaje     TEXT,
  estado      TEXT        NOT NULL DEFAULT 'nuevo'
                          CHECK (estado IN ('nuevo', 'contactado', 'descartado')),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_candidatos_reclutamiento_estado     ON public.candidatos_reclutamiento(estado);
CREATE INDEX IF NOT EXISTS idx_candidatos_reclutamiento_created_at ON public.candidatos_reclutamiento(created_at DESC);

-- ── 2. RLS ─────────────────────────────────────────────────────────────────────
-- INSERT abierto a anon (formulario público de la landing, sin sesión).
-- SELECT/UPDATE solo admin/supervisor (mismos roles que ya gestionan leads_pool,
-- leads_campanias, etc. — nunca se exponen a prospectadores/asesores).

ALTER TABLE public.solicitudes_sitio_web ENABLE ROW LEVEL SECURITY;

CREATE POLICY "solicitudes_sitio_web_insert_anon" ON public.solicitudes_sitio_web
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "solicitudes_sitio_web_admin_select" ON public.solicitudes_sitio_web
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')));

CREATE POLICY "solicitudes_sitio_web_admin_update" ON public.solicitudes_sitio_web
  FOR UPDATE TO authenticated
  USING     (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')));

ALTER TABLE public.candidatos_reclutamiento ENABLE ROW LEVEL SECURITY;

CREATE POLICY "candidatos_reclutamiento_insert_anon" ON public.candidatos_reclutamiento
  FOR INSERT TO anon
  WITH CHECK (true);

CREATE POLICY "candidatos_reclutamiento_admin_select" ON public.candidatos_reclutamiento
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')));

CREATE POLICY "candidatos_reclutamiento_admin_update" ON public.candidatos_reclutamiento
  FOR UPDATE TO authenticated
  USING     (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role IN ('admin', 'supervisor')));

-- ── 3. Grants ──────────────────────────────────────────────────────────────────
-- El GRANT es la puerta de entrada al motor de RLS; sin esto anon no puede ni
-- intentar el INSERT (RLS nunca llega a evaluarse).
GRANT INSERT ON public.solicitudes_sitio_web      TO anon;
GRANT INSERT ON public.candidatos_reclutamiento   TO anon;
GRANT SELECT, UPDATE ON public.solicitudes_sitio_web    TO authenticated;
GRANT SELECT, UPDATE ON public.candidatos_reclutamiento TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');
