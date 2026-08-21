-- FIX: sincronizar_misiones_diarias_hoy tenía dos discrepancias vs la lógica JS:
--
-- 1. propiedad: no filtraba publicada = true.
--    El JS ya filtra .eq('publicada', true), pero el SQL contaba cualquier
--    registro en propiedad_publicacion del día, incluyendo propiedades que el
--    usuario luego despublicó. Resultado: un seguimiento posterior disparaba
--    sincronizar_misiones_diarias_hoy y volvía a marcar la misión como completa
--    aunque la propiedad ya no estuviera publicada (mismo bug original reportado
--    por el prospectador, pero ahora vía SQL en vez de JS).
--
-- 2. interaccion: no filtraba tipo IN ('mensaje','llamada') y no deduplicaba por
--    cliente. El JS usa .in('tipo', [...]) y agrupa por cliente_id único. El SQL
--    contaba todas las interacciones (incluyendo otros tipos) sin dedup →
--    overcounting vs JS. Si el usuario mandaba WhatsApp + llamada al mismo cliente,
--    JS contaba 1 (cliente único), SQL contaba 2.

CREATE OR REPLACE FUNCTION public.sincronizar_misiones_diarias_hoy(p_fecha date DEFAULT ((now() AT TIME ZONE 'America/Mexico_City'::text))::date)
 RETURNS TABLE(mision_id uuid, recien_completada boolean, recompensa_xp integer, recompensa_coins integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
#variable_conflict use_column
DECLARE
  v_user_id UUID := auth.uid();
  m         RECORD;
  um_id     UUID;
  um_prog   INTEGER;
  um_compl  BOOLEAN;
  um_fecha  DATE;
  um_exists BOOLEAN;
  v_count   INTEGER;
  v_prog    INTEGER;
  v_compl   BOOLEAN;
  v_nueva   BOOLEAN;
BEGIN
  FOR m IN
    SELECT mi.id, mi.categoria, mi.meta, mi.recompensa_xp, mi.recompensa_coins
    FROM public.misiones mi
    WHERE mi.tipo = 'diaria' AND mi.activa = true
  LOOP
    v_count := 0;

    IF m.categoria = 'propiedad' THEN
      -- COUNT(DISTINCT): una propiedad publicada en varios portales genera varias
      -- filas (una por portal); sin DISTINCT cada portal contaba como una publicación
      -- distinta y bastaba publicar 1 propiedad en 10 portales para completar la misión.
      -- Solo propiedades que siguen publicadas (publicada = true): publicar+despublicar
      -- y luego hacer un seguimiento ya no vuelve a marcarla como completada.
      SELECT COUNT(DISTINCT propiedad_id) INTO v_count
      FROM public.propiedad_publicacion
      WHERE user_id = v_user_id
        AND publicada = true
        AND (fecha_publicacion AT TIME ZONE 'America/Mexico_City')::DATE = p_fecha;

    ELSIF m.categoria = 'crm' THEN
      SELECT COUNT(*) INTO v_count
      FROM public.clientes
      WHERE responsable_id = v_user_id
        AND (created_at AT TIME ZONE 'America/Mexico_City')::DATE = p_fecha;

    ELSIF m.categoria = 'seguimiento' THEN
      SELECT COUNT(*) INTO v_count
      FROM public.seguimientos_dia
      WHERE user_id = v_user_id
        AND fecha = p_fecha;

    ELSIF m.categoria = 'interaccion' THEN
      -- Mismo criterio que el JS: solo tipo mensaje/llamada, un cliente
      -- cuenta una vez aunque tenga múltiples interacciones del mismo día.
      SELECT COUNT(DISTINCT cliente_id) INTO v_count
      FROM public.interacciones
      WHERE user_id = v_user_id
        AND tipo IN ('mensaje', 'llamada')
        AND (created_at AT TIME ZONE 'America/Mexico_City')::DATE = p_fecha;

    ELSIF m.categoria = 'curso' THEN
      SELECT COUNT(*) INTO v_count
      FROM public.vu_progreso
      WHERE user_id = v_user_id
        AND (completada_at AT TIME ZONE 'America/Mexico_City')::DATE = p_fecha;
    END IF;

    SELECT id, progreso, completada, fecha_reset
      INTO um_id, um_prog, um_compl, um_fecha
    FROM public.user_misiones
    WHERE user_id = v_user_id AND mision_id = m.id;

    um_exists := FOUND;

    IF um_exists AND um_compl AND um_fecha = p_fecha THEN
      CONTINUE;
    END IF;

    -- Recalcular SIEMPRE desde el conteo real: permite corregir hacia abajo
    -- (ej. propiedad despublicada) y evita inflar el progreso de un día anterior.
    v_prog := LEAST(v_count, m.meta);

    v_compl := v_prog >= m.meta;
    v_nueva := v_compl AND NOT (um_exists AND um_compl AND um_fecha = p_fecha);

    IF NOT um_exists THEN
      INSERT INTO public.user_misiones
        (user_id, mision_id, progreso, completada, fecha_reset, fecha_completada)
      VALUES
        (v_user_id, m.id, v_prog, v_compl, p_fecha,
         CASE WHEN v_compl THEN NOW() ELSE NULL END);
    ELSE
      UPDATE public.user_misiones SET
        progreso         = v_prog,
        completada       = v_compl,
        fecha_reset      = p_fecha,
        fecha_completada = CASE WHEN v_nueva THEN NOW() ELSE fecha_completada END
      WHERE id = um_id;
    END IF;

    IF v_nueva THEN
      RETURN QUERY SELECT m.id, TRUE::BOOLEAN, m.recompensa_xp, m.recompensa_coins;
    END IF;
  END LOOP;
END;
$function$;
