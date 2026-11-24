-- "Avísame cuando se libere": recordatorio para una propiedad EN PAUSA.
--
-- Una propiedad saturada (ya la publicaron 10 personas distintas en 30 días)
-- se frena para todos. Hoy, al tocar "⏸ Muy publicada", sale la explicación y
-- la fecha en que se libera... y ahí termina: quien la quería publicar tiene
-- que acordarse solo de volver ese día. Nadie se acuerda, y la propiedad se
-- libera sin que nadie la aproveche.
--
-- Esto deja apuntarse. Cuando la propiedad se destraba, llega el aviso a
-- notificaciones (y el push, por el cron de siempre).
--
-- Por qué NO se guarda la fecha y se dispara ese día: la fecha se mueve. Si
-- alguien más la publica antes, el desbloqueo se corre 30 días más. Guardar la
-- fecha haría llegar el aviso cuando todavía está frenada, que es peor que no
-- avisar. Así que la condición no es una fecha: es que la propiedad ya no esté
-- en propiedades_saturadas().

-- ── 1. La suscripción ──────────────────────────────────────────────────────
create table if not exists public.propiedad_aviso_libre (
  propiedad_id uuid not null references public.propiedades(id) on delete cascade,
  user_id      uuid not null references auth.users(id) on delete cascade,
  created_at   timestamptz not null default now(),
  -- Cuándo se mandó el aviso. NULL = pendiente. Se deja la fila en vez de
  -- borrarla para que el cron no pueda mandar el mismo aviso dos veces.
  avisado_at   timestamptz,
  primary key (propiedad_id, user_id)
);

-- El cron busca por "pendientes": ese es el índice que importa.
create index if not exists idx_aviso_libre_pendientes
  on public.propiedad_aviso_libre (propiedad_id)
  where avisado_at is null;

alter table public.propiedad_aviso_libre enable row level security;

-- Cada quien ve y maneja sus propios avisos, y nada más. No hay política de
-- admin a propósito: es una preferencia personal, no un dato del negocio.
drop policy if exists aviso_libre_owner on public.propiedad_aviso_libre;
create policy aviso_libre_owner on public.propiedad_aviso_libre
  for all
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

-- ── 2. El tipo de notificación ─────────────────────────────────────────────
-- notificaciones.tipo tiene un CHECK con la lista cerrada de tipos. Sin
-- agregar el nuevo, el insert del cron falla y el aviso nunca llega.
alter table public.notificaciones drop constraint if exists notificaciones_tipo_check;
alter table public.notificaciones add constraint notificaciones_tipo_check
  check (tipo = any (array[
    'nueva_propiedad', 'destacada', 'exclusiva', 'recordatorio', 'nuevo_cliente',
    'login', 'tienda', 'ruleta', 'cofre', 'lead_caliente', 'apartado',
    'registro_constructora', 'sistema', 'cita', 'ascenso_rol', 'bajada_precio',
    'coleccion_favorito', 'solicitud_web', 'anuncio', 'alarma_lead',
    'alarma_retro', 'propiedad_libre'
  ]));

-- ── 3. El disparador ───────────────────────────────────────────────────────
create or replace function public.generar_avisos_propiedad_libre()
returns void
language plpgsql
security definer
set search_path to 'public'
as $fn$
declare
  v_hora int;
begin
  -- Las propiedades se liberan a cualquier hora (30 días exactos después de
  -- una publicación), y a nadie le sirve un push a las 3 de la mañana. El
  -- aviso espera a una hora de trabajo; la suscripción no se pierde.
  v_hora := extract(hour from (now() at time zone 'America/Mexico_City'));
  if v_hora < 8 or v_hora >= 21 then
    return;
  end if;

  -- Una propiedad vendida o rentada no tiene nada que avisar. Se quita la
  -- suscripción en silencio en vez de dejar la fila esperando para siempre.
  delete from public.propiedad_aviso_libre a
   using public.propiedades p
   where p.id = a.propiedad_id
     and a.avisado_at is null
     and p.estado in ('vendida', 'rentada');

  -- El UPDATE y el INSERT van en UNA sola sentencia (el update marca y
  -- devuelve las filas, el insert escribe sobre esas mismas). Repetir el
  -- filtro en dos sentencias deja la puerta abierta a mandar el aviso dos
  -- veces si algo cambia entre una y otra.
  with sat as (
    -- Se materializa una vez: propiedades_saturadas() recorre
    -- publicacion_log entero y no conviene por fila.
    select s.propiedad_id from public.propiedades_saturadas() s
  ),
  marcados as (
    update public.propiedad_aviso_libre a
       set avisado_at = now()
     where a.avisado_at is null
       -- (1) la propiedad salió de pausa
       and not exists (select 1 from sat where sat.propiedad_id = a.propiedad_id)
       -- (2) y a esta persona no le queda su propio tope de 30 días. Avisar
       --     sin esto mandaría a alguien a un botón que sigue sin dejarlo
       --     publicar, o sea un aviso que miente.
       and not exists (
         select 1 from public.propiedad_publicacion pp
          where pp.propiedad_id = a.propiedad_id
            and pp.user_id = a.user_id
            and pp.fecha_publicacion is not null
            and pp.fecha_publicacion > now() - interval '30 days'
       )
       -- (3) y sigue estando publicable (un borrador todavía no se abre)
       and exists (
         select 1 from public.propiedades p
          where p.id = a.propiedad_id and p.estado = 'disponible'
       )
    returning a.user_id, a.propiedad_id
  )
  insert into public.notificaciones
    (user_id, propiedad_id, titulo, mensaje, tipo, leida, push_enviado)
  select m.user_id,
         m.propiedad_id,
         '🟢 Ya puedes publicar ' || coalesce(p.codigo, 'una propiedad'),
         coalesce(nullif(trim(p.titulo), ''), 'La propiedad') ||
           ' salió de pausa. Pediste que te avisara: ya la puedes publicar.',
         'propiedad_libre',
         false,
         false
    from marcados m
    join public.propiedades p on p.id = m.propiedad_id;
end
$fn$;

revoke all on function public.generar_avisos_propiedad_libre() from public, anon, authenticated;

-- ── 4. El cron ─────────────────────────────────────────────────────────────
-- Cada 15 min. No hace falta más fino: lo que se avisa es "ya la puedes
-- publicar", no una cita a una hora exacta.
select cron.unschedule('avisos-propiedad-libre')
 where exists (select 1 from cron.job where jobname = 'avisos-propiedad-libre');

select cron.schedule(
  'avisos-propiedad-libre',
  '*/15 * * * *',
  $cron$ select public.generar_avisos_propiedad_libre(); $cron$
);
