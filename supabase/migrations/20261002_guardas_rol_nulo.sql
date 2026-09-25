-- Las guardas de rol dejaban pasar a quien no tiene perfil.
--
-- Salió al arreglar el historial de donaciones. El patrón repetido era:
--
--     SELECT role INTO v_rol FROM profiles WHERE id = auth.uid();
--     IF v_rol NOT IN ('admin','supervisor') THEN RAISE EXCEPTION 'No autorizado'; END IF;
--
-- Si v_rol sale NULL —sin sesión, o con una sesión sin fila en profiles—, la
-- comparación `NULL NOT IN (...)` no da falso: da NULL. Y un IF con condición
-- NULL no entra, así que la excepción NUNCA se lanzaba y la función seguía
-- adelante. Comprobado antes del arreglo: get_donaciones_historial() devolvía
-- sus 37 filas sin ninguna sesión.
--
-- Eran seis funciones, y las seis tienen GRANT EXECUTE para el rol `anon`, que
-- es el de la clave pública que viaja dentro del bundle de la web:
--
--     backfill_citas_venta          (escribe: rellena citas_venta)
--     estadisticas_publicaciones    (lee)
--     get_donaciones_historial      (lee)
--     marcar_asistencia_bloque      (escribe)
--     marcar_metrica_bloque         (escribe)
--     marcar_reunion_bloque         (escribe)
--
-- Se añade la comprobación de NULL a las seis. NO se amplía ningún permiso ni
-- se toca a quién puede llamarlas: siguen siendo admin y supervisor, que es lo
-- que ya decía el código. Lo único que cambia es que ahora la guarda cumple lo
-- que dice.
--
-- En backfill_citas_venta la condición lleva un AND para service_role, así que
-- la parte del rol va entre paréntesis: sin ellos, el OR se habría comido ese
-- AND y el camino de service_role habría dejado de funcionar.
--
-- Aplicada el 2026-09-25 y verificada: get_donaciones_historial() sin sesión
-- ahora responde "No autorizado", y no queda ninguna función con este patrón.

DO $mig$
DECLARE r record; nueva text;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_functiondef(p.oid) AS def
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'public' AND p.prosecdef
       AND pg_get_functiondef(p.oid) ILIKE '%NOT IN %admin%'
       AND pg_get_functiondef(p.oid) NOT ILIKE '%IS NULL%'
  LOOP
    IF r.proname = 'backfill_citas_venta' THEN
      nueva := replace(r.def,
        'IF v_rol NOT IN (''admin'', ''supervisor'')',
        'IF (v_rol IS NULL OR v_rol NOT IN (''admin'', ''supervisor''))');
    ELSE
      nueva := regexp_replace(r.def,
        '\m(IF|if)[[:space:]]+(v_rol|v_role)[[:space:]]+(NOT IN|not in)[[:space:]]*\(',
        '\1 \2 IS NULL OR \2 \3 (');
    END IF;

    IF nueva = r.def THEN
      RAISE EXCEPTION 'No se pudo endurecer la guarda de %', r.proname;
    END IF;
    EXECUTE nueva;
  END LOOP;
END $mig$;
