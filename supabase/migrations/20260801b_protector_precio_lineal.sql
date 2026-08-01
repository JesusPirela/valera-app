-- Ajuste de la progresión del precio del protector: en vez de duplicarse,
-- empieza en 100 y sube +50 por cada compra de la semana: 100, 150, 200, 250…
-- (se sigue reiniciando cada semana — lunes, hora MX).
CREATE OR REPLACE FUNCTION public.costo_protector_racha(p_user uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT (100 + 50 * compras_protector_semana(p_user))::integer
$$;
