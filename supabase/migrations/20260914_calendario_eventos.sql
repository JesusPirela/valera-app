-- Calendario IN-APP (local, sin Google). Eventos personales del usuario.
-- De momento se usa solo en el apartado de admin. Cada quien ve solo los suyos.
create table if not exists public.eventos_calendario (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.profiles(id) on delete cascade,
  titulo       text not null,
  descripcion  text,
  inicio       timestamptz not null,
  fin          timestamptz,
  todo_el_dia  boolean not null default false,
  color        text not null default '#1a6470',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists idx_eventos_cal_user_inicio on public.eventos_calendario (user_id, inicio);

alter table public.eventos_calendario enable row level security;
drop policy if exists eventos_cal_owner on public.eventos_calendario;
create policy eventos_cal_owner on public.eventos_calendario for all
  using (user_id = auth.uid()) with check (user_id = auth.uid());
