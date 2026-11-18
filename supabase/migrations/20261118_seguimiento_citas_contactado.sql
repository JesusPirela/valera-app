-- "Ya le escribimos a alguien por esta cita".
--
-- Es una marca de GESTIÓN NUESTRA, distinta del estado del cliente. Hacían
-- falta las dos: una cita puede seguir en "Sin contactar" —porque el asesor
-- todavía no contesta nada— y aun así haberla perseguido tres veces. Sin esta
-- marca, quien revisa la lista mañana no sabe cuáles ya se intentaron y
-- vuelve a escribirle a la misma gente.
--
-- No se resolvió con el estado 'sin_respuesta' ("le escribimos, no contesta")
-- porque ese es lo que CONTESTÓ (o dejó de contestar) la otra persona, y se
-- pierde en cuanto llega la respuesta: una cita contestada vuelve a verse
-- igual que una que nadie tocó.
alter table public.seguimiento_citas
  add column if not exists contactado    boolean not null default false,
  add column if not exists contactado_at timestamptz,
  add column if not exists contactado_por uuid;

comment on column public.seguimiento_citas.contactado is
  'Marca nuestra: ya se le escribió al asesor o al prospectador por esta cita. Distinto del estado, que es lo que contestaron.';
