-- ═══════════════════════════════════════════════════════════════════════════
-- Trazabilidad de citas (08/jul/2026)
--
-- Se construye SOBRE citas_coordinacion (no se crea sistema nuevo ni se cambian
-- los estados existentes). El estado 'realizada' ya existía; lo que faltaba era
-- que solo se marque cuando el usuario CONFIRMA que la cita ocurrió, y guardar
-- el resultado. Agendar una cita nunca la cuenta como realizada.
--
-- Columnas nuevas (todas opcionales, no rompen nada):
--   resultado, comentarios     → cuando SÍ se realizó
--   motivo_no_realizada        → cuando NO se realizó
--   confirmada_at/confirmada_por → trazabilidad de quién y cuándo confirmó
--   notif_previa_at / notif_confirmacion_at → anti-duplicado de notificaciones
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE public.citas_coordinacion
  ADD COLUMN IF NOT EXISTS resultado             text,
  ADD COLUMN IF NOT EXISTS comentarios           text,
  ADD COLUMN IF NOT EXISTS motivo_no_realizada   text,
  ADD COLUMN IF NOT EXISTS confirmada_at         timestamptz,
  ADD COLUMN IF NOT EXISTS confirmada_por        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS notif_previa_at       timestamptz,
  ADD COLUMN IF NOT EXISTS notif_confirmacion_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_citas_prospectador_estado
  ON public.citas_coordinacion(prospectador_id, estado);
CREATE INDEX IF NOT EXISTS idx_citas_fecha_cita
  ON public.citas_coordinacion(fecha_cita);

-- Permitir enlazar una notificación con su cita (deep-link a la confirmación).
ALTER TABLE public.notificaciones
  ADD COLUMN IF NOT EXISTS cita_id uuid REFERENCES public.citas_coordinacion(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_notificaciones_cita_id ON public.notificaciones(cita_id);

-- 'cita' como tipo válido de notificación (lista COMPLETA; ver
-- 20260707_fix_notif_tipo_sistema_definitivo.sql: recrear el constraint
-- parcialmente ya rompió producción una vez).
ALTER TABLE public.notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;
ALTER TABLE public.notificaciones ADD CONSTRAINT notificaciones_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'nueva_propiedad','destacada','exclusiva','recordatorio',
    'nuevo_cliente','login','tienda','ruleta','cofre','lead_caliente','apartado',
    'registro_constructora','sistema','cita'
  ]));

-- ── RPC: confirmar el desenlace de una cita ────────────────────────────────
-- Un solo punto de entrada para las 3 opciones. Solo el prospectador dueño de
-- la cita (o un admin) puede confirmarla, y solo una vez.
CREATE OR REPLACE FUNCTION public.confirmar_cita(
  p_cita_id       uuid,
  p_desenlace     text,                 -- 'realizada' | 'no_realizada' | 'reagendada'
  p_resultado     text DEFAULT NULL,    -- si se realizó
  p_comentarios   text DEFAULT NULL,
  p_motivo        text DEFAULT NULL,    -- si no se realizó
  p_nueva_fecha   timestamptz DEFAULT NULL,  -- si se reagendó
  p_proximo_seguimiento timestamptz DEFAULT NULL  -- opcional, actualiza el CRM
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_user  uuid := auth.uid();
  v_cita  RECORD;
  v_admin boolean;
BEGIN
  IF v_user IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  SELECT * INTO v_cita FROM citas_coordinacion WHERE id = p_cita_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La cita no existe');
  END IF;

  SELECT EXISTS(SELECT 1 FROM profiles WHERE id = v_user AND role = 'admin') INTO v_admin;
  IF v_cita.prospectador_id <> v_user AND NOT v_admin THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta cita no es tuya');
  END IF;

  IF v_cita.confirmada_at IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Esta cita ya fue confirmada', 'estado', v_cita.estado);
  END IF;

  IF p_desenlace = 'realizada' THEN
    UPDATE citas_coordinacion SET
      estado = 'realizada', resultado = p_resultado, comentarios = p_comentarios,
      confirmada_at = NOW(), confirmada_por = v_user, updated_at = NOW()
    WHERE id = p_cita_id;

    -- CRM: avanzar a seguimiento de cierre solo si sigue en 'cita_agendada'
    -- (no pisamos etapas más avanzadas que el asesor ya haya puesto).
    UPDATE clientes SET estado = 'seguimiento_cierre', updated_at = NOW()
    WHERE id = v_cita.cliente_id AND estado = 'cita_agendada';

  ELSIF p_desenlace = 'no_realizada' THEN
    UPDATE citas_coordinacion SET
      estado = 'cancelada', motivo_no_realizada = p_motivo, comentarios = p_comentarios,
      confirmada_at = NOW(), confirmada_por = v_user, updated_at = NOW()
    WHERE id = p_cita_id;

    -- El cliente vuelve a "cita por agendar" para no perderlo del pipeline.
    UPDATE clientes SET estado = 'cita_por_agendar', updated_at = NOW()
    WHERE id = v_cita.cliente_id AND estado = 'cita_agendada';

  ELSIF p_desenlace = 'reagendada' THEN
    IF p_nueva_fecha IS NULL THEN
      RETURN jsonb_build_object('ok', false, 'error', 'Falta la nueva fecha');
    END IF;
    -- Se reabre la cita con la nueva fecha: NO se marca confirmada (debe volver
    -- a confirmarse tras la nueva fecha) y no cuenta como realizada.
    UPDATE citas_coordinacion SET
      estado = 'reagendada', fecha_cita = p_nueva_fecha, comentarios = p_comentarios,
      notif_previa_at = NULL, notif_confirmacion_at = NULL, updated_at = NOW()
    WHERE id = p_cita_id;

  ELSE
    RETURN jsonb_build_object('ok', false, 'error', 'Desenlace inválido');
  END IF;

  -- Próximo seguimiento (opcional) sobre el cliente
  IF p_proximo_seguimiento IS NOT NULL THEN
    UPDATE clientes SET proximo_contacto = p_proximo_seguimiento, updated_at = NOW()
    WHERE id = v_cita.cliente_id;
  END IF;

  -- Marcar como leída/atendida la notificación de confirmación de esta cita
  UPDATE notificaciones SET leida = true WHERE cita_id = p_cita_id AND leida = false;

  RETURN jsonb_build_object('ok', true, 'desenlace', p_desenlace);
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.confirmar_cita(uuid,text,text,text,text,timestamptz,timestamptz) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.confirmar_cita(uuid,text,text,text,text,timestamptz,timestamptz) TO authenticated, service_role;

-- ── RPC: citas del usuario pendientes de confirmar ─────────────────────────
-- Las que ya pasaron su hora y aún no se confirman. Alimenta el popup.
CREATE OR REPLACE FUNCTION public.get_citas_por_confirmar()
RETURNS TABLE(
  id uuid, cliente_id uuid, cliente_nombre text, cliente_telefono text,
  propiedad_id uuid, propiedad_codigo text, fecha_cita timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $fn$
BEGIN
  RETURN QUERY
  SELECT ct.id, ct.cliente_id, c.nombre, c.telefono,
         ct.propiedad_id, p.codigo, ct.fecha_cita
  FROM citas_coordinacion ct
  JOIN clientes c ON c.id = ct.cliente_id
  LEFT JOIN propiedades p ON p.id = ct.propiedad_id
  WHERE ct.prospectador_id = auth.uid()
    AND ct.confirmada_at IS NULL
    AND ct.estado IN ('coordinada', 'reagendada')
    AND ct.fecha_cita < NOW() - INTERVAL '30 minutes'
    AND ct.fecha_cita > NOW() - INTERVAL '30 days'
  ORDER BY ct.fecha_cita DESC;
END;
$fn$;

REVOKE EXECUTE ON FUNCTION public.get_citas_por_confirmar() FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_citas_por_confirmar() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
