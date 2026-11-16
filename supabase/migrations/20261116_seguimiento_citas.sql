-- Accountability de citas: que paso DESPUES de cada cita de venta.
--
-- Es un eje DISTINTO a citas_venta.estado_seguimiento. Ese dice si la cita
-- ocurrio (Realizada, Cancelada/Reagenda, Aparto...). Este dice que contesto
-- el asesor o el prospectador cuando le preguntamos en que quedo el cliente.
-- Una cita "Realizada" puede acabar descartada o en apartado: meterlos en la
-- misma columna borraria justo lo que se quiere medir.
create table if not exists public.seguimiento_citas (
  cita_venta_id uuid primary key references public.citas_venta(id) on delete cascade,
  estado text not null default 'sin_contactar',
  notas text,
  quien_respondio text,
  actualizado_por uuid,
  actualizado_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  -- El check mantiene honestas las graficas: un estado inventado a mano no
  -- entraria en ninguna barra y el total dejaria de cuadrar.
  constraint seguimiento_citas_estado_valido check (estado in (
    'sin_contactar','sin_respuesta','mandar_opciones','se_contactaran',
    'compra_futuro','falta_credito','descartado','aparto_compro'
  ))
);

comment on table public.seguimiento_citas is
  'Accountability: que paso DESPUES de cada cita de venta. Eje distinto a citas_venta.estado_seguimiento, que dice si la cita ocurrio.';

alter table public.seguimiento_citas enable row level security;

create policy seguimiento_citas_admin on public.seguimiento_citas for all
  using (exists (select 1 from profiles where id = auth.uid() and role = 'admin'))
  with check (exists (select 1 from profiles where id = auth.uid() and role = 'admin'));

create policy seguimiento_citas_gerente on public.seguimiento_citas for all
  using (exists (select 1 from profiles where id = auth.uid() and role in ('gerente','supervisor')))
  with check (exists (select 1 from profiles where id = auth.uid() and role in ('gerente','supervisor')));
