-- 60 propiedades traían un teléfono en propiedades.descripcion, y ese campo es
-- justo el que se copia y se pega en Facebook Marketplace. Marketplace prohíbe
-- datos de contacto en el cuerpo del anuncio: esas publicaciones se rechazan
-- solas aunque todo lo demás esté bien.
--
-- Al revisarlas resultó que las 60 son SOLO el teléfono (ninguna pasa de 36
-- caracteres, y la más corta son 10 dígitos pelones). No son descripciones con
-- un teléfono metido: alguien usó el campo de descripción para apuntar el
-- contacto del dueño.
--
-- Así que el teléfono NO se borra: se mueve a inv_notas, que es el campo
-- interno de inventario (solo se ve en la pantalla de Inventario y en el mapa,
-- nunca se copia para publicar). La descripción se deja en NULL, que es lo que
-- en realidad era: esta propiedad no tiene descripción.
--
-- Reversible: el texto original de las 2,256 propiedades quedó en
-- public.propiedades_descripcion_respaldo antes de este cambio.

-- Respaldo, por si esta migración se corre en un entorno donde no existe.
CREATE TABLE IF NOT EXISTS public.propiedades_descripcion_respaldo AS
  SELECT id AS propiedad_id, codigo, descripcion, now() AS respaldado_at
    FROM public.propiedades;

WITH con_telefono AS (
  SELECT id, codigo, trim(descripcion) AS tel
    FROM public.propiedades
   WHERE descripcion IS NOT NULL
     AND (descripcion ILIKE '%whatsapp%' OR descripcion ~ '[0-9]{3}[- ]?[0-9]{3}[- ]?[0-9]{4}')
     -- Solo las que son puro contacto. Si alguna trae una descripción de
     -- verdad con un teléfono adentro, se queda y se revisa a mano: borrarle
     -- el texto perdería información.
     AND length(trim(descripcion)) <= 40
)
UPDATE public.propiedades p
   SET inv_notas = CASE
         WHEN p.inv_notas IS NULL OR trim(p.inv_notas) = ''
           THEN '📞 Contacto (estaba en la descripción): ' || ct.tel
         ELSE p.inv_notas || E'\n📞 Contacto (estaba en la descripción): ' || ct.tel
       END,
       descripcion = NULL
  FROM con_telefono ct
 WHERE p.id = ct.id;

-- Debe quedar 0.
SELECT COUNT(*) AS descripciones_con_telefono
  FROM public.propiedades
 WHERE descripcion IS NOT NULL
   AND (descripcion ILIKE '%whatsapp%' OR descripcion ~ '[0-9]{3}[- ]?[0-9]{3}[- ]?[0-9]{4}');
