-- Buscar "maria" y que salga "María", y al revés.
--
-- El problema: los buscadores que van a la base usan ilike, y a ilike las
-- tildes le importan. "maria" no encuentra a "María Elena", "zibata" no
-- encuentra "Zibatá", "marques" no encuentra "El Marqués". La gente no
-- escribe acentos al buscar, así que media base quedaba invisible.
--
-- La solución: cada tabla guarda, al lado del texto de verdad, una copia sin
-- acentos y en minúsculas, y los buscadores miran ESA. Se calcula sola (es
-- una columna generada), así que no hay nada que mantener ni se puede
-- desincronizar.
--
-- Se usa translate y no la extensión unaccent, aunque esté instalada: unaccent
-- es STABLE y Postgres no deja usar funciones que no sean IMMUTABLE dentro de
-- una columna generada.

CREATE OR REPLACE FUNCTION public.sin_acentos(p_txt TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $function$
  SELECT lower(translate(
    coalesce(p_txt, ''),
    'áéíóúüñÁÉÍÓÚÜÑàèìòùÀÈÌÒÙâêîôûÂÊÎÔÛäëïöÿÄËÏÖãõÃÕçÇ',
    'aeiounAEIOUNaeiouAEIOUaeiouAEIOUaeioyAEIOaoAOcC'
  ));
$function$;

-- ─── Las columnas para buscar ────────────────────────────────────────────────
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS nombre_busqueda TEXT
  GENERATED ALWAYS AS (public.sin_acentos(nombre)) STORED;

ALTER TABLE public.propiedades
  ADD COLUMN IF NOT EXISTS titulo_busqueda TEXT
  GENERATED ALWAYS AS (public.sin_acentos(titulo)) STORED;

ALTER TABLE public.propiedades
  ADD COLUMN IF NOT EXISTS direccion_busqueda TEXT
  GENERATED ALWAYS AS (public.sin_acentos(direccion)) STORED;

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS nombre_busqueda TEXT
  GENERATED ALWAYS AS (public.sin_acentos(nombre)) STORED;

-- Sin índice a propósito: para buscar "%algo%" haría falta pg_trgm, que no
-- está instalada, y con 3,240 clientes y 2,500 propiedades el recorrido
-- directo ya responde de sobra. Si algún día crece, aquí es donde toca
-- instalar pg_trgm y poner índices GIN sobre estas tres columnas.

-- ─── Buscar también dentro de la descripción ─────────────────────────────────
-- 2,523 propiedades traen descripción, de unos 988 caracteres cada una. Ahí
-- está lo que no cabe en el título: "alberca", "roof garden", "una planta",
-- "acepta mascotas". Sin esto había que acordarse del código o del título
-- exacto.
ALTER TABLE public.propiedades
  ADD COLUMN IF NOT EXISTS descripcion_busqueda TEXT
  GENERATED ALWAYS AS (public.sin_acentos(descripcion)) STORED;
