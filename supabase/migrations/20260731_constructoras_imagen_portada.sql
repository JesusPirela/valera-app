-- Agregar columna imagen_portada para portadas de cards en la vista de constructoras
ALTER TABLE public.constructoras ADD COLUMN IF NOT EXISTS imagen_portada TEXT;

-- Imágenes de portada obtenidas de los sitios oficiales de cada desarrollo.
-- Se usa ILIKE para tolerar variaciones de mayúsculas/minúsculas en el nombre.
-- La condición "imagen_portada IS NULL" evita pisar URLs que ya hayan sido
-- ingresadas manualmente por el admin.

UPDATE public.constructoras
SET imagen_portada = 'https://media.lahaus.com/uploads/ims/project_image/image/79567/render_1.jpg'
WHERE LOWER(nombre) LIKE '%aurea iolita%' AND imagen_portada IS NULL;

UPDATE public.constructoras
SET imagen_portada = 'https://xanaduresidencial.com/wp-content/uploads/2023/04/galezib1.webp'
WHERE LOWER(nombre) LIKE '%xanadu%' AND imagen_portada IS NULL;

UPDATE public.constructoras
SET imagen_portada = 'https://media.lahaus.com/uploads/ims/project_image/image/35607/port.jpg'
WHERE LOWER(nombre) LIKE '%intercity%' AND imagen_portada IS NULL;

UPDATE public.constructoras
SET imagen_portada = 'https://s3.us-east-2.amazonaws.com/vinte.com.mx/multimedia/real_solare/solare.jpg'
WHERE LOWER(nombre) LIKE '%solare%' AND imagen_portada IS NULL;

UPDATE public.constructoras
SET imagen_portada = 'https://media.lahaus.com/uploads/ims/project_image/image/64501/mykonoshome1.jpg'
WHERE LOWER(nombre) LIKE '%mykonos%' AND imagen_portada IS NULL;

UPDATE public.constructoras
SET imagen_portada = 'https://condesazibata.com/wp-content/uploads/PLAZA-CONDESA-III-resize.webp'
WHERE LOWER(nombre) LIKE '%condesa%' AND imagen_portada IS NULL;

UPDATE public.constructoras
SET imagen_portada = 'https://www.realestatemarket.com.mx/images/2026/07-Julio/29/belena-zibata-queretaro-100-lugares-g.jpg'
WHERE LOWER(nombre) LIKE '%belena%' AND imagen_portada IS NULL;

UPDATE public.constructoras
SET imagen_portada = 'https://gpvivienda.com/wp-content/uploads/2026/06/WhatsApp-Image-2026-06-05-at-3.58.34-PM.jpeg'
WHERE LOWER(nombre) LIKE '%santaluz%' AND imagen_portada IS NULL;

UPDATE public.constructoras
SET imagen_portada = 'https://carpin.mx/img/desarrollos/amenidades/GranValle/202602131334510Amenidades-web-Gran-Valle-conjunto.jpg'
WHERE LOWER(nombre) LIKE '%gran valle%' AND imagen_portada IS NULL;

UPDATE public.constructoras
SET imagen_portada = 'https://media.lahaus.com/uploads/ims/project_image/image/86323/portada_curado.jpg'
WHERE LOWER(nombre) LIKE '%fuerte santiago%' AND imagen_portada IS NULL;

UPDATE public.constructoras
SET imagen_portada = 'https://media.lahaus.com/uploads/ims/project_image/image/17710/1.JPG'
WHERE LOWER(nombre) LIKE '%privalia%' AND imagen_portada IS NULL;

UPDATE public.constructoras
SET imagen_portada = 'https://urbanamexico.com.mx/wp-content/uploads/banner_imarhi_casas.jpg'
WHERE LOWER(nombre) LIKE '%imarhi%' AND imagen_portada IS NULL;

UPDATE public.constructoras
SET imagen_portada = 'https://soa.mx/wp-content/uploads/2021/03/01.-Alezza-conjunto-tres-torres-1.jpg'
WHERE (LOWER(nombre) LIKE '%alleza%' OR LOWER(nombre) LIKE '%alezza%') AND imagen_portada IS NULL;
