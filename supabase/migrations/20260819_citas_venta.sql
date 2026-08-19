-- Tabla EXCLUSIVA admin/supervisor: seguimiento de citas de venta.
-- (a) Guarda el histórico (import del Excel del equipo).
-- (b) Se rellena sola cuando se crea una cita en el dashboard (citas_coordinacion):
--     un trigger jala nombre/teléfono del cliente y el asesor asignado.
-- Reemplaza el viejo "¿Q PASÓ?" por 3 campos de retroalimentación estructurada.

CREATE TABLE IF NOT EXISTS public.citas_venta (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Datos de la cita
  cliente_nombre       text,
  telefono             text,
  detalles_pago        text,            -- "DETALLES" (forma de pago / crédito)
  interesado_en        text,            -- "INTERESADO EN" (propiedad de interés)
  dia_cita             text,            -- "DÍA DE LA CITA" (texto libre; el Excel es irregular)
  fecha_cita           timestamptz,     -- fecha parseada cuando se conoce (citas del dashboard)
  prospecto            text,            -- "PROSPECTO" (quién prospectó)
  coordino             text,            -- "COORDINO"
  atendio              text,            -- "ATENDIÓ" (asesor que dio la cita)
  estado_seguimiento   text,            -- "BOTON ESTADO DE SEGUIMIENTO"
  fecha_prox_seguimiento text,          -- "FECHA PROX SEGUIMIENTO"
  -- Retroalimentación (reemplaza "¿Q PASÓ?")
  retro_como_estuvo    text,            -- 1. ¿Cómo estuvo la cita?
  retro_info_extra     text,            -- 2. ¿Qué info extra del cliente conseguimos?
  retro_plan_accion    text,            -- 3. ¿Cuál es el plan de acción?
  retro_completada_at  timestamptz,     -- cuándo el asesor dio la retro
  -- Enlaces (para autollenado y para el popup del asesor)
  asesor_id            uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  cita_coordinacion_id uuid REFERENCES public.citas_coordinacion(id) ON DELETE SET NULL,
  origen               text NOT NULL DEFAULT 'manual',  -- 'excel' | 'dashboard' | 'manual'
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_citas_venta_asesor ON public.citas_venta (asesor_id);
CREATE INDEX IF NOT EXISTS idx_citas_venta_cita   ON public.citas_venta (cita_coordinacion_id);
CREATE INDEX IF NOT EXISTS idx_citas_venta_created ON public.citas_venta (created_at DESC);

-- updated_at automático
CREATE OR REPLACE FUNCTION public.fn_citas_venta_touch()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS tr_citas_venta_touch ON public.citas_venta;
CREATE TRIGGER tr_citas_venta_touch BEFORE UPDATE ON public.citas_venta
  FOR EACH ROW EXECUTE FUNCTION public.fn_citas_venta_touch();

-- ── Autollenado desde el dashboard de citas ────────────────────────────────
-- Cuando se crea (o actualiza el asesor de) una cita en citas_coordinacion, se
-- refleja en citas_venta con el nombre/teléfono del cliente y el asesor.
CREATE OR REPLACE FUNCTION public.fn_citas_venta_desde_coordinacion()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_nombre text; v_tel text; v_prop text;
BEGIN
  SELECT nombre, telefono INTO v_nombre, v_tel FROM clientes WHERE id = NEW.cliente_id;
  v_prop := COALESCE(NEW.propiedad_externa, (SELECT titulo FROM propiedades WHERE id = NEW.propiedad_id));

  INSERT INTO citas_venta (cliente_nombre, telefono, interesado_en, fecha_cita, dia_cita,
                           atendio, asesor_id, estado_seguimiento, retro_como_estuvo,
                           cita_coordinacion_id, origen)
  VALUES (v_nombre, v_tel, v_prop, NEW.fecha_cita,
          to_char(NEW.fecha_cita AT TIME ZONE 'America/Mexico_City', 'FMDay DD "de" FMMonth'),
          (SELECT nombre FROM profiles WHERE id = NEW.asesor_id), NEW.asesor_id,
          NEW.estado, NULLIF(NEW.resultado, ''), NEW.id, 'dashboard')
  ON CONFLICT (cita_coordinacion_id) DO UPDATE
    SET cliente_nombre = EXCLUDED.cliente_nombre,
        telefono       = COALESCE(citas_venta.telefono, EXCLUDED.telefono),
        interesado_en  = COALESCE(citas_venta.interesado_en, EXCLUDED.interesado_en),
        asesor_id      = COALESCE(EXCLUDED.asesor_id, citas_venta.asesor_id),
        atendio        = COALESCE(EXCLUDED.atendio, citas_venta.atendio),
        estado_seguimiento = COALESCE(EXCLUDED.estado_seguimiento, citas_venta.estado_seguimiento);
  RETURN NEW;
END $$;

-- Índice único para el ON CONFLICT (solo cuando hay enlace)
CREATE UNIQUE INDEX IF NOT EXISTS uq_citas_venta_coord
  ON public.citas_venta (cita_coordinacion_id) WHERE cita_coordinacion_id IS NOT NULL;

DROP TRIGGER IF EXISTS tr_citas_venta_desde_coord ON public.citas_coordinacion;
CREATE TRIGGER tr_citas_venta_desde_coord
  AFTER INSERT OR UPDATE OF asesor_id, estado, cliente_id ON public.citas_coordinacion
  FOR EACH ROW EXECUTE FUNCTION public.fn_citas_venta_desde_coordinacion();

-- ── Permisos: solo admin/supervisor ven/editan la tabla ────────────────────
ALTER TABLE public.citas_venta ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS citas_venta_admin ON public.citas_venta;
CREATE POLICY citas_venta_admin ON public.citas_venta FOR ALL
  USING (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('admin','supervisor')));

-- ── RPC: el asesor asignado (o admin/supervisor) guarda su retroalimentación ─
CREATE OR REPLACE FUNCTION public.guardar_retro_cita(
  p_id uuid, p_como_estuvo text, p_info_extra text, p_plan_accion text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_rol text; v_asesor uuid;
BEGIN
  SELECT role INTO v_rol FROM profiles WHERE id = auth.uid();
  SELECT asesor_id INTO v_asesor FROM citas_venta WHERE id = p_id;
  IF v_rol NOT IN ('admin','supervisor') AND (v_asesor IS NULL OR v_asesor <> auth.uid()) THEN
    RAISE EXCEPTION 'No autorizado';
  END IF;
  UPDATE citas_venta
     SET retro_como_estuvo = p_como_estuvo,
         retro_info_extra  = p_info_extra,
         retro_plan_accion = p_plan_accion,
         retro_completada_at = now()
   WHERE id = p_id;
END $$;
GRANT EXECUTE ON FUNCTION public.guardar_retro_cita(uuid,text,text,text) TO authenticated;

-- ── RPC: citas del asesor que faltan de retroalimentación (para el popup) ────
CREATE OR REPLACE FUNCTION public.get_mis_citas_pendientes_retro()
RETURNS TABLE(id uuid, cliente_nombre text, interesado_en text, dia_cita text)
LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  SELECT id, cliente_nombre, interesado_en, dia_cita
  FROM citas_venta
  WHERE asesor_id = auth.uid() AND retro_completada_at IS NULL
  ORDER BY created_at DESC;
$$;
GRANT EXECUTE ON FUNCTION public.get_mis_citas_pendientes_retro() TO authenticated;
