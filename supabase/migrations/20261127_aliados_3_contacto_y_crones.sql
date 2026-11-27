-- Etapa 1 (tercera parte): el contacto del dueño y las funciones de mantenimiento.

-- -- 1. El teléfono y el correo de las inmobiliarias son solo para admins -------
--
-- Regla de negocio: una inmobiliaria aliada ve el catálogo completo, pero si
-- una propiedad le interesa TIENE QUE CONTACTARNOS. Hoy la tabla
-- `inmobiliarias` se lee entera con solo tener sesión, y 16 de las 20
-- agencias traen ahí su teléfono y su correo: bastaba con pedirlos.
--
-- Las políticas de RLS deciden QUÉ FILAS, no qué columnas. Para limitar
-- columnas hay que quitar el permiso de tabla y devolverlo columna por
-- columna. Se comprobó qué pide cada pantalla: el feed, la ficha, el menú de
-- inventario y el selector solo piden nombre, logo y la bandera de exclusiva.
-- La ÚNICA que leía todo era la pantalla de admin, y pasa a leerlo por la
-- función de abajo.
revoke select on public.inmobiliarias from authenticated;
grant select (id, nombre, logo_url, sitio_web, exclusiva, es_aliada, created_at)
  on public.inmobiliarias to authenticated;

-- Los admins sí ven el contacto, pero pidiéndolo a propósito.
create or replace function public.inmobiliarias_con_contacto()
returns table (
  id uuid, nombre text, logo_url text, telefono text, email text,
  sitio_web text, asesor_referencia text, exclusiva boolean, es_aliada boolean,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
begin
  -- Con EXISTS y no con "role <> 'admin'": si el perfil no tuviera rol, la
  -- comparación da NULL y no bloquearía a nadie (ver guardas de rol con NULL).
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    return;
  end if;
  return query
    select i.id, i.nombre, i.logo_url, i.telefono, i.email,
           i.sitio_web, i.asesor_referencia, i.exclusiva, i.es_aliada, i.created_at
      from public.inmobiliarias i
     order by i.nombre;
end $$;

revoke all on function public.inmobiliarias_con_contacto() from public, anon;
grant execute on function public.inmobiliarias_con_contacto() to authenticated;

-- -- 2. Las funciones de mantenimiento no son para los usuarios ----------------
--
-- Estas cinco las dispara el cron (o nadie). La app NO las llama —se
-- comprobó archivo por archivo— y sin embargo cualquier usuario con sesión
-- podía ejecutarlas: reciclar los leads no contactados, caducar las
-- propiedades destacadas, cerrar rentas, recalcular los contadores de todo el
-- mundo o regalarse protectores de racha.
--
-- El cron corre como dueño de la base, así que quitarle el permiso a los
-- usuarios no lo afecta.
-- OJO: en Postgres una función nace con permiso de ejecución para PUBLIC,
-- así que quitárselo solo a `authenticated` no sirve de nada: hay que
-- quitárselo a public (medido: tras el primer intento seguía ejecutable).
revoke execute on function public.cerrar_rentas_baratas_vencidas() from public, anon, authenticated;
revoke execute on function public.expirar_propiedades_destacadas() from public, anon, authenticated;
revoke execute on function public.recalcular_contadores_user_stats() from public, anon, authenticated;
revoke execute on function public.reciclar_leads_no_contactados() from public, anon, authenticated;
revoke execute on function public.otorgar_protectores_nivel(uuid) from public, anon, authenticated;

-- -- 3. Quitar el destacado de una propiedad es cosa de admin ------------------
-- La llamaba solo la pantalla de admin, pero la función no comprobaba nada:
-- con el id de cualquier propiedad, cualquiera podía quitarle el destacado.
create or replace function public.quitar_destacada(p_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if not exists (select 1 from public.profiles p where p.id = auth.uid() and p.role = 'admin') then
    raise exception 'Solo un administrador puede quitar el destacado';
  end if;
  update public.propiedades
     set destacada = false, destacada_mensaje = null, destacada_hasta = null
   where id = p_id;
end $$;

-- REVERTIR
--   grant select on public.inmobiliarias to authenticated;
--   drop function public.inmobiliarias_con_contacto();
--   grant execute on function public.cerrar_rentas_baratas_vencidas() to authenticated;
--   grant execute on function public.expirar_propiedades_destacadas() to authenticated;
--   grant execute on function public.recalcular_contadores_user_stats() to authenticated;
--   grant execute on function public.reciclar_leads_no_contactados() to authenticated;
--   grant execute on function public.otorgar_protectores_nivel(uuid) to authenticated;
--   -- quitar_destacada: volver a la versión sin guarda (ver git).
