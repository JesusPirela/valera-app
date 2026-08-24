-- Reversión diaria (06:07 UTC) de accesos prioritarios vencidos.
SELECT cron.schedule('revertir-accesos-prioritarios', '7 6 * * *', 'SELECT public.revertir_accesos_prioritarios_vencidos();');
