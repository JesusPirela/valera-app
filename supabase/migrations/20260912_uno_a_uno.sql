-- Apartado privado "1 a 1" para admins: preparar los puntos a tratar con cada
-- prospectador, tomar notas por punto durante la llamada y cronometrarla.
--
-- TODO es privado del admin dueño (owner_id = auth.uid()). RLS impide que nadie
-- más lo vea; NUNCA se le envía nada al prospectador.

create table if not exists public.uno_a_uno_puntos (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  prospectador_id uuid not null references public.profiles(id) on delete cascade,
  texto           text not null,
  nota            text,
  hecho           boolean not null default false,
  orden           int not null default 0,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists idx_1a1_puntos_owner_prosp
  on public.uno_a_uno_puntos (owner_id, prospectador_id, orden);

create table if not exists public.uno_a_uno_sesiones (
  id              uuid primary key default gen_random_uuid(),
  owner_id        uuid not null references public.profiles(id) on delete cascade,
  prospectador_id uuid not null references public.profiles(id) on delete cascade,
  duracion_seg    int not null default 0,
  notas           text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_1a1_ses_owner_prosp
  on public.uno_a_uno_sesiones (owner_id, prospectador_id, created_at desc);

alter table public.uno_a_uno_puntos    enable row level security;
alter table public.uno_a_uno_sesiones  enable row level security;

drop policy if exists unoauno_puntos_owner on public.uno_a_uno_puntos;
create policy unoauno_puntos_owner on public.uno_a_uno_puntos for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());

drop policy if exists unoauno_ses_owner on public.uno_a_uno_sesiones;
create policy unoauno_ses_owner on public.uno_a_uno_sesiones for all
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
