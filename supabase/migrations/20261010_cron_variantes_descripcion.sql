-- La llave de servicio NO se escribe aquí: se saca del comando de un cron que
-- ya existe (procesar-pushes-pendientes la trae en su header Authorization).
-- Así el secreto nunca pasa por la línea de comandos ni por un archivo.
DO $do$
DECLARE
  v_llave text;
  v_cmd   text;
BEGIN
  SELECT (regexp_match(command, 'Bearer ([A-Za-z0-9_.-]{40,})'))[1]
    INTO v_llave
    FROM cron.job
   WHERE command LIKE '%Bearer %'
   ORDER BY jobname
   LIMIT 1;

  IF v_llave IS NULL THEN
    RAISE EXCEPTION 'No se encontró la llave en ningún cron existente';
  END IF;

  PERFORM cron.unschedule('generar-variantes-descripcion')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'generar-variantes-descripcion');

  v_cmd := format(
    $f$SELECT net.http_post(
         url     := 'https://ystxicgrryyzhrxinsbq.supabase.co/functions/v1/variantes-descripcion-lote',
         headers := %L::jsonb,
         body    := '{"propiedades":2,"porPropiedad":2}'::jsonb
       );$f$,
    jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_llave)
  );

  -- Cada 3 minutos → ~1,900 versiones al día, que es lo que aguantan las
  -- cuotas gratis. Son 15,680 por generar; la cola va primero por las
  -- propiedades que más gente publica, así el beneficio llega antes.
  PERFORM cron.schedule('generar-variantes-descripcion', '*/3 * * * *', v_cmd);
END $do$;

SELECT jobname, schedule, active,
       (command LIKE '%Bearer ey%') AS trae_llave
  FROM cron.job
 WHERE jobname = 'generar-variantes-descripcion';
