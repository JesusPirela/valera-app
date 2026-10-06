-- Ningún teléfono debe quedar en propiedades.descripcion, que es el campo que
-- se copia y se pega en Facebook Marketplace. Marketplace prohíbe datos de
-- contacto en el cuerpo del anuncio y rechaza la publicación.
--
-- La limpieza del 05/10 movió 60, pero se le escapó una: VR-1128 traía
-- "55 2882 9745" y el patrón de entonces pedía lada de 3 dígitos. Limpiar una
-- vez no sirve si mañana alguien vuelve a escribir un teléfono ahí, así que
-- aquí va un CANDADO: un trigger que los saca solo, en cada insert y update.
--
-- Los NÚMEROS DE M² Y PRECIOS NO SE TOCAN. Solo se saca lo que es un teléfono.

CREATE OR REPLACE FUNCTION public.fn_descripcion_sin_telefonos()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $fn$
DECLARE
  v_tels   text[] := '{}';
  v_tok    text;
  v_digs   text;
  v_limpia text;
  v_letras int;
BEGIN
  IF NEW.descripcion IS NULL OR trim(NEW.descripcion) = '' THEN
    RETURN NEW;
  END IF;

  v_limpia := NEW.descripcion;

  -- Cada racha de dígitos que pueda traer +, espacios, guiones, puntos o
  -- paréntesis en medio. La COMA queda FUERA a propósito: así "9,900,000" se
  -- parte en trozos cortos y un precio nunca se confunde con un teléfono.
  FOR v_tok IN
    SELECT m[1]
      FROM regexp_matches(NEW.descripcion,
                          '(\+?\s?5?2?\s?\(?\d[\d\s\.\(\)-]{7,18}\d)', 'g') AS m
  LOOP
    v_digs := regexp_replace(v_tok, '[^0-9]', '', 'g');

    -- Qué cuenta como teléfono mexicano, y nada más que eso:
    --   · 10 dígitos que empiecen en 2-9 (ninguna lada arranca en 0 o 1);
    --   · 12 con lada de país (52...);
    --   · 13 con el 1 de celular (521...).
    -- Las reglas de arranque son las que evitan falsos positivos: una fecha
    -- como "2026 10 05 16 00" normaliza a 12 dígitos, pero empieza en "20" y
    -- por eso no entra. Un precio de 10 dígitos serían miles de millones de
    -- pesos: no existe en el inventario.
    CONTINUE WHEN NOT (
         (length(v_digs) = 10 AND v_digs ~ '^[2-9]')
      OR (length(v_digs) = 12 AND v_digs ~ '^52')
      OR (length(v_digs) = 13 AND v_digs ~ '^521')
    );

    v_tels   := v_tels || v_digs;
    v_limpia := replace(v_limpia, v_tok, '');
  END LOOP;

  IF array_length(v_tels, 1) IS NULL THEN
    RETURN NEW;  -- no había teléfonos, la descripción se queda intacta
  END IF;

  -- El teléfono NO se pierde: se guarda en inv_notas, que es el campo interno
  -- de inventario y nunca se copia para publicar.
  IF NEW.inv_notas IS NULL OR trim(NEW.inv_notas) = '' THEN
    NEW.inv_notas := '📞 Contacto (estaba en la descripción): ' || array_to_string(v_tels, ' / ');
  ELSIF position(array_to_string(v_tels, ' / ') in NEW.inv_notas) = 0 THEN
    NEW.inv_notas := NEW.inv_notas || E'\n📞 Contacto (estaba en la descripción): ' || array_to_string(v_tels, ' / ');
  END IF;

  -- Si al quitar el teléfono ya no queda una descripción de verdad (casi sin
  -- letras), se deja en NULL: ese campo se estaba usando como libreta de
  -- contactos, no como descripción. Si sí queda texto, se conserva.
  v_letras := length(regexp_replace(v_limpia, '[^[:alpha:]]', '', 'g'));
  IF v_letras < 25 THEN
    NEW.descripcion := NULL;
  ELSE
    NEW.descripcion := trim(regexp_replace(v_limpia, '[ \t]{2,}', ' ', 'g'));
  END IF;

  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS tr_descripcion_sin_telefonos ON public.propiedades;
CREATE TRIGGER tr_descripcion_sin_telefonos
  BEFORE INSERT OR UPDATE OF descripcion ON public.propiedades
  FOR EACH ROW
  WHEN (NEW.descripcion IS NOT NULL)
  EXECUTE FUNCTION public.fn_descripcion_sin_telefonos();

-- ── Limpieza de lo que ya estaba ─────────────────────────────────────────────
-- Un UPDATE que se dispara a sí mismo: el trigger hace el trabajo. Se toca
-- solo lo que de verdad trae un teléfono, para no reescribir 2,200 filas.
UPDATE public.propiedades p
   SET descripcion = p.descripcion
 WHERE p.descripcion IS NOT NULL
   AND EXISTS (
     SELECT 1
       FROM regexp_matches(p.descripcion, '(\+?\s?5?2?\s?\(?\d[\d\s\.\(\)-]{7,18}\d)', 'g') AS m
      WHERE (length(regexp_replace(m[1], '[^0-9]', '', 'g')) = 10 AND regexp_replace(m[1], '[^0-9]', '', 'g') ~ '^[2-9]')
         OR (length(regexp_replace(m[1], '[^0-9]', '', 'g')) = 12 AND regexp_replace(m[1], '[^0-9]', '', 'g') ~ '^52')
         OR (length(regexp_replace(m[1], '[^0-9]', '', 'g')) = 13 AND regexp_replace(m[1], '[^0-9]', '', 'g') ~ '^521')
   );
