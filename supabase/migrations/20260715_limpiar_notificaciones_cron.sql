-- Limpieza semanal de notificaciones para roles no-admin.
-- Leídas:   se borran después de 30 días (ya fueron vistas, sin valor).
-- No leídas: se borran después de 60 días (si en 2 meses no se leyó, ya no importa).
-- Admins:   intocables (historial completo).
-- Horario: lunes 3am hora México (= 9am UTC).

SELECT cron.schedule(
  'limpiar-notificaciones-semanales',
  '0 9 * * 1',
  $$
  DELETE FROM public.notificaciones n
  USING public.profiles p
  WHERE n.user_id = p.id
    AND p.role NOT IN ('admin')
    AND (
      (n.leida = true  AND n.created_at < now() - interval '30 days')
      OR
      (n.leida = false AND n.created_at < now() - interval '60 days')
    );
  $$
);
