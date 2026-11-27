-- Etapa 1 (segunda parte): cerrar lo que un usuario normal NO debería poder hacer.
--
-- Esto salió de auditar qué puede hacer hoy un prospectador, y lo que apareció
-- no es cómodo:
--
--   · CUALQUIERA DE LOS 129 USUARIOS PODÍA ASCENDERSE A ADMIN. La regla de
--     `profiles` deja editar tu propia fila —para el token de notificaciones,
--     el nombre, el avatar— pero una regla de RLS NO puede limitar columnas, y
--     nadie había limitado el permiso: `role` estaba entre lo que se podía
--     escribir. Un `update profiles set role='admin' where id = yo` pasaba.
--     Y siendo admin se ve y se borra todo.
--   · Lo mismo con `user_stats`: cualquiera podía ponerse las monedas y el XP
--     que quisiera, que es la economía de la tienda, los cofres y la ruleta.
--   · Cualquiera podía meter fotos en CUALQUIER propiedad, y borrar o
--     reemplazar las fotos de cualquier propiedad en el depósito de archivos.
--
-- Nada de esto hace falta para que la app funcione: se comprobó una por una
-- cada escritura que hace el cliente. El rol, por ejemplo, NO lo escribe la
-- app: lo cambia la edge function `cambiar-rol`, que corre con la llave de
-- servicio y no depende de estos permisos.

-- -- 1. Perfiles: solo las columnas que de verdad edita su dueño ---------------
-- Se quita el permiso de tabla y se devuelve columna por columna. Es la única
-- forma en Postgres de limitar POR COLUMNA: las políticas de RLS deciden QUÉ
-- FILAS, los permisos deciden QUÉ COLUMNAS.
--
-- La lista salió de rastrear TODAS las escrituras del cliente sobre
-- `profiles` (12 en 4 archivos). Las de alarmas van incluidas porque las
-- escribe la app de alarmas, que usa esta misma base.
revoke update on public.profiles from authenticated;
grant update (
  nombre, telefono, avatar_url, color_acento, figura_acento,
  push_token, push_token_alarmas, alarmas_so_version,
  app_version, app_platform, telefono_marca, telefono_modelo, so_version,
  last_seen
) on public.profiles to authenticated;

-- -- 2. Las monedas y el XP se ganan, no se escriben ---------------------------
-- El cliente solo escribe dos contadores (los cursos terminados y la marca de
-- último acceso). Todo lo que vale —xp, valera_coins, cofres, protectores,
-- racha, tokens de diseño— lo mueven funciones del servidor, que corren como
-- dueñas y no les afecta este permiso.
revoke update on public.user_stats from authenticated;
grant update (total_cursos, ultimo_acceso) on public.user_stats to authenticated;

-- -- 3. Las fotos de una propiedad las pone quien puede editarla ---------------
-- Estaba en `true`: cualquiera podía insertar una foto en cualquier propiedad.
-- Las ocho escrituras que hace la app salen de pantallas de admin.
drop policy if exists "Autenticados pueden insertar imagenes" on public.propiedad_imagenes;
drop policy if exists "propiedad_imagenes_insert" on public.propiedad_imagenes;
do $$
declare p record;
begin
  for p in select policyname from pg_policies
            where schemaname='public' and tablename='propiedad_imagenes' and cmd='INSERT'
  loop
    execute format('drop policy %I on public.propiedad_imagenes', p.policyname);
  end loop;
end $$;

create policy propiedad_imagenes_insert_admin on public.propiedad_imagenes
  for insert to authenticated
  with check (public.is_admin());

-- -- 4. El depósito de fotos --------------------------------------------------
-- La política de subir se llamaba "Admins pueden subir imagenes" pero NO
-- comprobaba que fueras admin: solo miraba el nombre del depósito. Y las de
-- modificar y BORRAR estaban abiertas a cualquiera con sesión. Es decir, hoy
-- cualquier usuario puede borrar las fotos de todo el inventario.
--
-- Leer no se toca: el depósito es público y las fichas compartidas dependen de
-- ello.
drop policy if exists "Admins pueden subir imagenes" on storage.objects;
drop policy if exists "Allow authenticated updates" on storage.objects;
drop policy if exists "Allow authenticated deletes" on storage.objects;

create policy propiedades_subir_admin on storage.objects
  for insert to authenticated
  with check (bucket_id = 'propiedades' and public.is_admin());

create policy propiedades_modificar_admin on storage.objects
  for update to authenticated
  using (bucket_id = 'propiedades' and public.is_admin());

create policy propiedades_borrar_admin on storage.objects
  for delete to authenticated
  using (bucket_id = 'propiedades' and public.is_admin());

-- REVERTIR
--   grant update on public.profiles to authenticated;
--   grant update on public.user_stats to authenticated;
--   drop policy propiedad_imagenes_insert_admin on public.propiedad_imagenes;
--   create policy "Autenticados pueden insertar imagenes" on public.propiedad_imagenes
--     for insert to authenticated with check (true);
--   drop policy propiedades_subir_admin on storage.objects;
--   drop policy propiedades_modificar_admin on storage.objects;
--   drop policy propiedades_borrar_admin on storage.objects;
--   create policy "Admins pueden subir imagenes" on storage.objects
--     for insert to authenticated with check (bucket_id = 'propiedades');
--   create policy "Allow authenticated updates" on storage.objects
--     for update to authenticated using (bucket_id = 'propiedades');
--   create policy "Allow authenticated deletes" on storage.objects
--     for delete to authenticated using (bucket_id = 'propiedades');
