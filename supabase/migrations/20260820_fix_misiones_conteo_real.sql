-- Arregla el conteo de misiones diarias:
--  • "propiedad" cuenta PROPIEDADES DISTINTAS (1 propiedad a varios portales
--    generaba varias filas y la inflaba).
--  • El progreso se RECALCULA del conteo real (antes usaba GREATEST y nunca
--    bajaba, así que una vez inflado se quedaba en completada).
CREATE OR REPLACE FUNCTION public.sincronizar_misiones_diarias_hoy(p_fecha date DEFAULT ((now() AT TIME ZONE 'America/Mexico_City'::text))::date)
 RETURNS TABLE(mision_id uuid, recien_completada boolean, recompensa_xp integer, recompensa_coins integer)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_user_id UUID := auth.uid();
  m RECORD; um_id UUID; um_prog INTEGER; um_compl BOOLEAN; um_fecha DATE; um_exists BOOLEAN;
  v_count INTEGER; v_prog INTEGER; v_compl BOOLEAN; v_nueva BOOLEAN;
BEGIN
  FOR m IN
    SELECT mi.id, mi.categoria, mi.meta, mi.recompensa_xp, mi.recompensa_coins
    FROM public.misiones mi WHERE mi.tipo = 'diaria' AND mi.activa = true
  LOOP
    v_count := 0;
    IF m.categoria = 'propiedad' THEN
      SELECT COUNT(DISTINCT propiedad_id) INTO v_count
      FROM public.propiedad_publicacion
      WHERE user_id = v_user_id AND (fecha_publicacion AT TIME ZONE 'America/Mexico_City')::DATE = p_fecha;
    ELSIF m.categoria = 'crm' THEN
      SELECT COUNT(*) INTO v_count FROM public.clientes
      WHERE responsable_id = v_user_id AND (created_at AT TIME ZONE 'America/Mexico_City')::DATE = p_fecha;
    ELSIF m.categoria = 'seguimiento' THEN
      SELECT COUNT(*) INTO v_count FROM public.seguimientos_dia
      WHERE user_id = v_user_id AND fecha = p_fecha;
    ELSIF m.categoria = 'interaccion' THEN
      SELECT COUNT(DISTINCT cliente_id) INTO v_count FROM public.interacciones
      WHERE user_id = v_user_id AND tipo IN ('mensaje','llamada') AND (created_at AT TIME ZONE 'America/Mexico_City')::DATE = p_fecha;
    ELSIF m.categoria = 'curso' THEN
      SELECT COUNT(*) INTO v_count FROM public.vu_progreso
      WHERE user_id = v_user_id AND (completada_at AT TIME ZONE 'America/Mexico_City')::DATE = p_fecha;
    END IF;

    SELECT id, progreso, completada, fecha_reset INTO um_id, um_prog, um_compl, um_fecha
    FROM public.user_misiones WHERE user_id = v_user_id AND mision_id = m.id;
    um_exists := FOUND;

    -- Ya completada hoy: no se re-evalúa (no se quita lo ganado).
    IF um_exists AND um_compl AND um_fecha = p_fecha THEN CONTINUE; END IF;

    -- Recalcular SIEMPRE del conteo real (permite corregir hacia abajo).
    v_prog  := LEAST(v_count, m.meta);
    v_compl := v_prog >= m.meta;
    v_nueva := v_compl AND NOT (um_exists AND um_compl AND um_fecha = p_fecha);

    IF NOT um_exists THEN
      INSERT INTO public.user_misiones (user_id, mision_id, progreso, completada, fecha_reset, fecha_completada)
      VALUES (v_user_id, m.id, v_prog, v_compl, p_fecha, CASE WHEN v_compl THEN NOW() ELSE NULL END);
    ELSE
      UPDATE public.user_misiones SET progreso = v_prog, completada = v_compl, fecha_reset = p_fecha,
        fecha_completada = CASE WHEN v_nueva THEN NOW() ELSE fecha_completada END WHERE id = um_id;
    END IF;

    IF v_nueva THEN RETURN QUERY SELECT m.id, TRUE::BOOLEAN, m.recompensa_xp, m.recompensa_coins; END IF;
  END LOOP;
END;
$function$;

-- Corrige inflados de HOY que aún no estén marcados como completados.
UPDATE public.user_misiones um SET progreso = LEAST(
  (SELECT COUNT(DISTINCT pp.propiedad_id) FROM propiedad_publicacion pp
   WHERE pp.user_id = um.user_id AND (pp.fecha_publicacion AT TIME ZONE 'America/Mexico_City')::date = um.fecha_reset),
  (SELECT meta FROM misiones WHERE id = um.mision_id))
FROM misiones mi
WHERE mi.id = um.mision_id AND mi.categoria = 'propiedad' AND mi.tipo = 'diaria'
  AND um.completada = false AND um.fecha_reset = (now() AT TIME ZONE 'America/Mexico_City')::date;
