-- Se retira lo que quedaba del BANCO DE DESCRIPCIONES.
--
-- Historia corta: el banco guardaba versiones de cada descripción reescritas
-- por una IA, para que ocho personas publicando la misma propiedad no se
-- pisaran en Facebook Marketplace. Se retiró del botón de copiar el
-- 24/nov/2026 porque el 17% de esas versiones afirmaba amenidades que la
-- propiedad no tiene. Desde entonces las tablas y las funciones seguían ahí,
-- sin que nadie las leyera.
--
-- El 27/nov/2026 el equipo pidió quitar también el reacomodo de párrafos que
-- lo había sustituido ("da mucho error"), así que ya no queda NADA que use
-- esto. Lo que sí se queda es la IA que mejora la descripción AL SUBIR la
-- propiedad, que es otra cosa y la pidieron conservar.
--
-- QUÉ SE BORRA Y QUÉ NO
--   · Se borra: la tabla del banco (vacía), sus tres respaldos y la tabla de
--     variantes de cierre. Todo eso es texto de IA que ya no se publica.
--   · NO se borra `propiedades_descripcion_respaldo` (2,256 filas): esa no es
--     del banco, es el respaldo de las descripciones REALES de las
--     propiedades. Es la red por si alguna se pierde, y borrarla no se pidió.

-- -- 1. Las funciones que alimentaban el banco ---------------------------------
-- Ninguna vista ni función depende de ellas (verificado contra pg_proc y
-- pg_views antes de borrar).
drop function if exists public.propiedades_sin_variantes(integer, integer, integer);
drop function if exists public.variante_descripcion(uuid);

-- -- 2. Las tablas -------------------------------------------------------------
drop table if exists public.propiedad_descripcion_variantes;   -- 0 filas
drop table if exists public.respaldo_variantes_ia_20261124;    -- 6,654 versiones de IA
drop table if exists public._bk_variantes_desfasadas_20261117; -- 65
drop table if exists public._bk_variantes_recamaras_20261117;  -- 8
drop table if exists public.variantes_cierre_respaldo;         -- 1,551 cierres de IA

-- REVERTIR: no se puede. Las tablas de arriba eran texto generado; se borró a
-- propósito y no hay de dónde recuperarlo. Las descripciones de verdad siguen
-- en `propiedades.descripcion` y su respaldo en
-- `propiedades_descripcion_respaldo`, que esta migración NO toca.
