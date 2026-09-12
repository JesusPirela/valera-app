-- Notas finales de la reunión 1-a-1: un "Problema" y un "Compromiso" por charla.
alter table public.uno_a_uno_sesiones
  add column if not exists problema text,
  add column if not exists compromiso text;
