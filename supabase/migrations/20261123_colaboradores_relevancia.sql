-- Colaboradores: relevancia, y la columna que le faltaba al botón de
-- "actualizado".
--
-- 1) RELEVANCIA
--
-- En el sheet original hay una columna sin nombre ("Columna 1") donde se
-- marcaba "AA" a los colaboradores más relevantes y "A" a los que también
-- importan pero menos. Al importar el sheet esa columna llegó a `marca`, y
-- llegó mal: de los 19 marcados solo sobrevivieron 13 filas y todas con el
-- valor "i", perdiendo la diferencia entre AA y A. O sea que el dato más útil
-- de la lista —a quién le pido opciones primero— no estaba en la app.
--
-- Se guarda como número y no como las letras del sheet porque lo que importa
-- es el ORDEN, no la etiqueta: así la lista se puede ordenar por relevancia y
-- la pantalla decide cómo enseñarlo.
--   2 = clave        (lo que en el sheet era AA)
--   1 = importante   (lo que era A)
--   0 = normal
alter table colaboradores
  add column if not exists relevancia smallint not null default 0;

alter table colaboradores
  drop constraint if exists colaboradores_relevancia_rango;
alter table colaboradores
  add constraint colaboradores_relevancia_rango check (relevancia between 0 and 2);

-- 2) ACTUALIZADO_AT
--
-- La pantalla ya tenía el botón "Marcar actualizado hoy" y escribía en
-- `actualizado_at`... que no existía. Cada toque fallaba con "column does not
-- exist" y la fila se recargaba igual que estaba, así que el botón nunca
-- funcionó desde que se puso.
alter table colaboradores
  add column if not exists actualizado_at timestamptz;

-- ── Los 17 marcados en el sheet (5 con AA, 12 con A) ────────────────────────
-- Los nombres se comparan en mayúsculas y sin espacios de sobra porque en la
-- base vienen tal cual se escribieron en el sheet ("ML 2", "coldwell banker").
update colaboradores set relevancia = 2
where upper(btrim(nombre)) in (
  'GRUPO PROFESIONAL INMOBILIARIO',
  'LAURA MORENO',
  'SPAZIO VITALE',
  'SOY JORGE TU ASESOR',
  '7R'
);

update colaboradores set relevancia = 1
where upper(btrim(nombre)) in (
  'JMGROUP',
  'TOP BROKERS',
  'VIVENQUERETARO',
  'CONNIE GARDEA REAL ESTATE',
  'MARTHA OLGUIN',
  'ML 2',
  'ANDRES SEGURA',
  'TENGO LA LLAVE',
  'VIVENZA',
  'ADRIAN VERDI',
  'TORY REALTOR',
  'MARIFER QUIJANO'
);

-- Las dos filas que en el sheet decían "i" (BRIGO y CARVI) se quedan en
-- normal: "i" no es ni AA ni A y nadie dijo qué significa.

-- ── Las fechas que ya estaban escritas a mano ────────────────────────────────
--
-- `fecha_actualizacion` es texto libre que venía del sheet: 27 filas la tienen
-- y la mayoría son fechas dd/mm/aaaa ("19/06/2026"), pero otras son recados
-- ("No tiene propiedades xd"). Ahora que existe `actualizado_at` de verdad, se
-- pasan las que SÍ son fechas para no empezar con las 58 filas en blanco.
-- El texto original no se borra: queda por si alguien quiere revisarlo.
update colaboradores
set actualizado_at = to_timestamp(btrim(fecha_actualizacion), 'DD/MM/YYYY')
where actualizado_at is null
  and fecha_actualizacion ~ '^\s*\d{1,2}/\d{1,2}/\d{4}\s*$'
  and to_timestamp(btrim(fecha_actualizacion), 'DD/MM/YYYY') <= now();
