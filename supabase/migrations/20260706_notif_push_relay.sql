-- Agrega push_enviado a notificaciones para controlar qué filas ya recibieron
-- un push real (Expo). El cron procesar-pushes procesa solo las que tengan
-- push_enviado = FALSE. Las que ya envían su propio push (chatbot-eventos,
-- recordatorio-notificaciones) insertan con push_enviado = TRUE para evitar duplicados.
ALTER TABLE public.notificaciones
  ADD COLUMN IF NOT EXISTS push_enviado BOOLEAN NOT NULL DEFAULT FALSE;

-- Marcar todas las filas existentes como ya enviadas para no generar
-- retroactivos al desplegar esta migración.
UPDATE public.notificaciones SET push_enviado = TRUE WHERE push_enviado = FALSE;

SELECT pg_notify('pgrst', 'reload schema');
