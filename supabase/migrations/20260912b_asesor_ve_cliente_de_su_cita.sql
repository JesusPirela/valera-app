-- Un asesor debe poder VER (solo lectura) el cliente de las citas asignadas a él,
-- para tener su nombre/teléfono y poder atender la cita. Sin esto, el join a
-- clientes llegaba NULL por RLS (el cliente pertenece al prospectador, no al
-- asesor) y la pantalla de citas del asesor crasheaba ("Cannot read properties
-- of null (reading 'tipo_operacion')") y lo sacaba.
drop policy if exists clientes_select_asesor_cita on public.clientes;
create policy clientes_select_asesor_cita on public.clientes for select using (
  exists (
    select 1 from public.citas_coordinacion cc
    where cc.cliente_id = clientes.id and cc.asesor_id = auth.uid()
  )
);
