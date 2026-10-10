-- Las estadísticas de propiedades devuelven también el id de cada una.
--
-- La pantalla lista cuántas veces se publicó cada propiedad, pero no quién la
-- publicó. Esa información ya existe —get_publicadores_propiedad()—, solo que
-- pide el id y la lista nunca lo entregaba: traía código, título, dirección,
-- desarrollo y el conteo. Sin el id no había forma de preguntar por los
-- publicadores sin una segunda búsqueda por código, que es frágil.
--
-- El CTE `base` ya seleccionaba p.id; únicamente faltaba incluirlo en la
-- proyección de `todas`. Es aditivo: quien no lo use no nota el cambio.
CREATE OR REPLACE FUNCTION public.estadisticas_publicaciones()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
declare v_role text; res jsonb;
begin
  select role into v_role from profiles where id=auth.uid();
  if v_role IS NULL OR v_role not in ('admin','supervisor') then raise exception 'Solo admin/supervisor'; end if;
  with counts as (select propiedad_id, count(*) veces from publicacion_log group by propiedad_id),
  base as (select p.id, p.codigo, p.titulo, p.direccion, p.zona, nullif(trim(p.nombre_constructora),'') dev, coalesce(c.veces,0) veces
           from propiedades p left join counts c on c.propiedad_id=p.id)
  select jsonb_build_object(
    'total_publicaciones', (select count(*) from publicacion_log),
    'propiedades_totales', (select count(*) from propiedades),
    'propiedades_publicadas', (select count(*) from counts),
    'nunca_publicadas', (select count(*) from base where veces=0),
    'por_desarrollo', (select coalesce(jsonb_agg(d),'[]'::jsonb) from (select dev desarrollo, count(*) propiedades, coalesce(sum(veces),0) veces from base where dev is not null group by dev order by veces desc) d),
    'todas', (select coalesce(jsonb_agg(t),'[]'::jsonb) from (select id,codigo,titulo,direccion,dev,veces from base order by veces desc, titulo) t)
  ) into res; return res;
end $fn$;
