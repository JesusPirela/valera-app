-- Cambia el cierre de las 1,551 versiones YA generadas, sin volver a pedirle
-- nada a ninguna IA. Son 1,551 llamadas que no se gastan — y la cuota es justo
-- lo que escasea.
--
-- El cierre es siempre la ÚLTIMA línea y arranca con 📲, así que se puede
-- reemplazar solo esa línea y dejar intacto el resto del texto.
--
-- Cuál le toca a cada una sale de su idx (la plantilla con la que se generó) y
-- el género del tipo de propiedad: casa y propiedad son femeninas;
-- departamento, local y terreno, masculinos.
BEGIN;

CREATE TABLE IF NOT EXISTS public.variantes_cierre_respaldo AS
  SELECT id, texto, now() AS respaldado_at FROM public.propiedad_descripcion_variantes WHERE false;

INSERT INTO public.variantes_cierre_respaldo (id, texto, respaldado_at)
SELECT id, texto, now() FROM public.propiedad_descripcion_variantes;

WITH datos AS (
  SELECT v.id,
         v.idx,
         (p.tipo IS NULL OR p.tipo NOT IN ('departamento', 'local', 'terreno')) AS fem,
         CASE p.tipo WHEN 'casa' THEN 'casa' WHEN 'departamento' THEN 'departamento'
                     WHEN 'local' THEN 'local' WHEN 'terreno' THEN 'terreno'
                     ELSE 'propiedad' END AS tipo_txt,
         v.texto
    FROM public.propiedad_descripcion_variantes v
    JOIN public.propiedades p ON p.id = v.propiedad_id
), nuevo AS (
  SELECT d.id,
         '📲 ' || CASE d.idx % 10
           WHEN 0 THEN 'Agende una visita para ' || (CASE WHEN d.fem THEN 'conocerla' ELSE 'conocerlo' END) || ' con detalle.'
           WHEN 1 THEN 'Con gusto le mostramos ' || (CASE WHEN d.fem THEN 'esta' ELSE 'este' END) || ' ' || d.tipo_txt || ' cuando guste.'
           WHEN 2 THEN 'Programe su visita sin compromiso.'
           WHEN 3 THEN 'Quedamos a sus órdenes para coordinar una visita.'
           WHEN 4 THEN 'Le invitamos a ' || (CASE WHEN d.fem THEN 'conocerla' ELSE 'conocerlo' END) || ' personalmente.'
           WHEN 5 THEN 'Solicite su cita y con gusto le atendemos.'
           WHEN 6 THEN 'Estamos a sus órdenes para agendar un recorrido.'
           WHEN 7 THEN 'Agende su visita y conozca ' || (CASE WHEN d.fem THEN 'esta' ELSE 'este' END) || ' ' || d.tipo_txt || ' en persona.'
           WHEN 8 THEN 'Con gusto coordinamos una cita a su conveniencia.'
           ELSE        'Le atendemos con gusto para programar su visita.'
         END AS cierre,
         d.texto
    FROM datos d
)
UPDATE public.propiedad_descripcion_variantes v
   -- Se corta el texto justo antes del último 📲 y se pega el cierre nuevo.
   SET texto = rtrim(left(n.texto, position('📲' in n.texto) - 1)) || E'\n\n' || n.cierre
  FROM nuevo n
 WHERE v.id = n.id
   AND position('📲' in n.texto) > 0;

COMMIT;

SELECT trim(split_part(texto, chr(10), array_length(string_to_array(texto, chr(10)), 1))) AS cierre,
       COUNT(*) AS n
  FROM public.propiedad_descripcion_variantes
 GROUP BY 1 ORDER BY 2 DESC;
