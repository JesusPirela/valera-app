-- Corrida de DÍA dedicada a las propiedades recién dadas de alta.
--
-- El cron que ya existía (jobid 20) corre de 07 a 11 UTC —de 1 a 6 de la
-- mañana en México— y se dedica al rezago: 1,306 propiedades sin ninguna
-- versión. A mediodía ya llevaba 150 de 150 del tope, así que una propiedad
-- dada de alta por la mañana no tenía con qué generar sus 3 versiones y se
-- formaba en esa cola de 1,306, ordenada al azar. En la práctica, nunca.
--
-- Esta corrida va cada 10 minutos en horario de trabajo (14:00–02:59 UTC =
-- 8am–8:59pm en México) y solo mira lo creado en las últimas 24 horas. En un
-- día sin altas no gasta nada: la cola sale vacía y responde al instante.
--
-- El gasto está acotado por RESERVA_NUEVAS en la edge function, que además es
-- cuota que el rezago YA NO puede tocar. Medido: se crean entre 2 y 15
-- propiedades al día, a 3 versiones cada una.
--
-- La orden se arma copiando la del jobid 20 y cambiándole el cuerpo, para no
-- tener que escribir aquí la llave de servicio.
SELECT cron.schedule(
  'variantes-propiedades-nuevas',
  '*/10 14-23,0-2 * * *',
  replace(
    (SELECT command FROM cron.job WHERE jobname = 'generar-variantes-descripcion'),
    '''{}''::jsonb',
    '''{"propiedades":3,"horas":24}''::jsonb'
  )
);
