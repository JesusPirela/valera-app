-- El historial de donaciones no cargaba nunca: "column reference id is ambiguous".
--
-- La función declara RETURNS TABLE(id uuid, ...), lo que crea una variable de
-- salida llamada `id`. Y su propia guarda de permisos hacía:
--
--     SELECT role INTO v_rol FROM profiles WHERE id = auth.uid();
--                                                ^^ sin cualificar
--
-- Ahí Postgres no sabe si ese `id` es profiles.id o la variable de salida, así
-- que aborta antes de comprobar nada. Resultado: la pantalla se quedaba sin
-- historial para todo el mundo, incluso para quien sí tenía permiso, y sin
-- decir por qué. Salió en el monitoreo el 24/09 desde /donaciones.
--
-- Se cualifica la columna. El permiso NO se toca: sigue siendo admin o
-- supervisor, igual que antes.
CREATE OR REPLACE FUNCTION public.get_donaciones_historial()
RETURNS TABLE(id uuid, donante_nombre text, tipo text, cliente_nombre text,
              destino_nombre text, creado_at timestamp with time zone)
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE v_rol text;
BEGIN
  SELECT p.role INTO v_rol FROM profiles p WHERE p.id = auth.uid();
  IF v_rol NOT IN ('admin','supervisor') THEN RAISE EXCEPTION 'No autorizado'; END IF;
  RETURN QUERY
    SELECT d.id, d.donante_nombre, d.tipo, d.cliente_nombre, d.destino_nombre, d.creado_at
    FROM donaciones d ORDER BY d.creado_at DESC LIMIT 500;
END $function$;
