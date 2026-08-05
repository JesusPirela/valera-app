-- Programar la expiración de propiedades destacadas. La función
-- expirar_propiedades_destacadas() ya existía pero NUNCA se agendó, así que las
-- destacadas vencidas (destacada_hasta < now()) seguían marcadas como destacadas.
DO $$
BEGIN
  PERFORM cron.unschedule('expirar-destacadas');
EXCEPTION WHEN OTHERS THEN NULL;
END
$$;

-- Cada 10 minutos: quita la marca a las que ya vencieron.
SELECT cron.schedule('expirar-destacadas', '*/10 * * * *', $cron$
  SELECT public.expirar_propiedades_destacadas();
$cron$);

-- Limpiar de inmediato las que ya están vencidas.
SELECT public.expirar_propiedades_destacadas();
