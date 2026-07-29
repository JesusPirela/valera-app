-- Notificación automática a prospectadores cuando baja el precio de una propiedad.
-- Implementado como trigger AFTER UPDATE en `propiedades` para que funcione
-- independientemente de desde dónde se edite (app, Supabase Studio, etc.).
-- El relay de push (procesar-pushes, pg_cron) recoge las filas en <1 min.

-- 1. Añadir 'bajada_precio' al CHECK de tipos de notificación
ALTER TABLE public.notificaciones DROP CONSTRAINT IF EXISTS notificaciones_tipo_check;
ALTER TABLE public.notificaciones ADD CONSTRAINT notificaciones_tipo_check
  CHECK (tipo = ANY (ARRAY[
    'nueva_propiedad','destacada','exclusiva','recordatorio',
    'nuevo_cliente','login','tienda','ruleta','cofre','lead_caliente','apartado',
    'registro_constructora','sistema','cita','ascenso_rol','bajada_precio'
  ]));

-- 2. Función del trigger
CREATE OR REPLACE FUNCTION public.notif_bajada_precio()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_titulo    TEXT;
  v_mensaje   TEXT;
  v_precio_ant   TEXT;
  v_precio_nuevo TEXT;
  v_pct       INTEGER;
BEGIN
  -- Solo cuando el precio baja y ambos valores son conocidos
  IF NEW.precio IS NULL OR OLD.precio IS NULL OR NEW.precio >= OLD.precio THEN
    RETURN NEW;
  END IF;

  -- Solo propiedades disponibles y no de inventario (las de inventario no las ven los prospectadores)
  IF NEW.estado <> 'disponible' OR COALESCE(NEW.es_inventario, false) THEN
    RETURN NEW;
  END IF;

  v_precio_ant   := '$' || TO_CHAR(OLD.precio::NUMERIC, 'FM999,999,999');
  v_precio_nuevo := '$' || TO_CHAR(NEW.precio::NUMERIC, 'FM999,999,999');
  v_pct          := ROUND(((OLD.precio - NEW.precio) / OLD.precio) * 100);

  v_titulo  := '📉 Bajó el precio: ' || COALESCE(NEW.titulo, 'Propiedad');
  v_mensaje := 'Antes: ' || v_precio_ant || ' → Ahora: ' || v_precio_nuevo
    || CASE WHEN v_pct > 0 THEN ' (−' || v_pct || '%)' ELSE '' END
    || '. ¡Nueva oportunidad!';

  -- Insertar una notificación por cada prospectador/asesor activo.
  -- procesar-pushes las recoge y envía el push en <1 min.
  INSERT INTO public.notificaciones (user_id, titulo, mensaje, tipo, propiedad_id, leida)
  SELECT
    p.id,
    v_titulo,
    v_mensaje,
    'bajada_precio',
    NEW.id,
    false
  FROM public.profiles p
  WHERE p.role IN ('nuevo', 'prospectador', 'prospectador_plus', 'asesor', 'supervisor')
  ON CONFLICT DO NOTHING;

  RETURN NEW;
END;
$$;

-- 3. Trigger: solo se activa cuando cambia la columna precio
DROP TRIGGER IF EXISTS trg_notif_bajada_precio ON public.propiedades;
CREATE TRIGGER trg_notif_bajada_precio
  AFTER UPDATE OF precio ON public.propiedades
  FOR EACH ROW
  EXECUTE FUNCTION public.notif_bajada_precio();

NOTIFY pgrst, 'reload schema';
