-- ¿Esta URL ya la usamos?
--
-- Al dar de alta una propiedad importándola de un link, hoy no hay forma de
-- saber si alguien ya la subió. Medido: de 254 propiedades con link, 43 lo
-- repiten.
--
-- PERO la mayoría de esas repeticiones son A PROPÓSITO, y eso cambia el
-- diseño. Las páginas de desarrollos (vinte, terrasoles, bpccasa) tienen
-- varios prototipos en un mismo link, así que una URL da 8 propiedades y está
-- bien. En cambio los portales de anuncio individual (sadasi 118, easybroker
-- 41, tuficha 23, casasplatino 8) no repiten NI UNA: ahí un repetido sí es un
-- error.
--
-- Por eso esto AVISA y no bloquea, y además enseña cuáles son: con los códigos
-- a la vista, quien da de alta decide en dos segundos si es otro prototipo del
-- mismo desarrollo o si alguien ya la subió.

-- ── Comparar links que son el mismo escrito distinto ───────────────────────
-- Sin esto el detector no sirve de nada: el mismo anuncio compartido desde el
-- celular y desde la computadora llega con http o https, con o sin www, con o
-- sin barra final, y con la coleta de rastreo que le pega Facebook.
CREATE OR REPLACE FUNCTION public.url_normalizada(p_url text)
RETURNS text
LANGUAGE sql IMMUTABLE AS $fn$
  SELECT NULLIF(
    rtrim(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(trim(p_url)), '^https?://(www\.)?', ''),
          '[?&](utm_[a-z_]+|fbclid|gclid|mc_[a-z]+|ref|source)=[^&]*', '', 'g'),
        '[?&]+$', ''),
      '/'),
    '');
$fn$;

-- ── El detector ────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.propiedades_con_esta_url(p_url text)
RETURNS TABLE(
  id uuid, codigo text, titulo text,
  creada timestamptz, quien text
)
LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' STABLE AS $fn$
  SELECT p.id, p.codigo, p.titulo, p.created_at,
         COALESCE(NULLIF(trim(perf.nombre), ''), 'alguien')
    FROM public.propiedades p
    LEFT JOIN public.profiles perf ON perf.id = p.created_by
   WHERE p.url_origen IS NOT NULL
     -- Se descarta lo gigante antes de normalizar: hay dos filas con una
     -- página HTML entera guardada aquí (82,000 caracteres), y normalizar eso
     -- en cada comparación es tiempo tirado.
     AND length(p.url_origen) <= 500
     AND public.url_normalizada(p.url_origen) = public.url_normalizada(p_url)
   ORDER BY p.created_at DESC
   LIMIT 20;
$fn$;

GRANT EXECUTE ON FUNCTION public.url_normalizada(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.propiedades_con_esta_url(text) TO authenticated;

-- ── Limpiar las dos filas con HTML en vez de link ──────────────────────────
-- VR-2232 y VR-2254 traen la página entera guardada donde va el link. Vino de
-- que el flujo de "pegar código" se salta la validación de URL y guarda lo que
-- haya en el campo. El código ya no deja que vuelva a pasar; esto limpia lo
-- que quedó, que además rompería al detector enseñando basura.
UPDATE public.propiedades
   SET url_origen = NULL
 WHERE url_origen IS NOT NULL
   AND (url_origen !~ '^https?://' OR length(url_origen) > 500);
