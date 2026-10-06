-- CORRECCIÓN de las dos migraciones anteriores (20261009 y 20261011).
--
-- Saqué los teléfonos de 61 descripciones para que Marketplace no rechazara
-- las publicaciones. Estaba mal: las 61 son propiedades de INVENTARIO, de las
-- secciones "Lonas" — propiedades levantadas de un letrero de "se vende" en la
-- calle. Ahí el teléfono del letrero ES el dato principal, y es para qué sirve
-- el registro.
--
-- Comprobado antes de revertir:
--   · las 61 tienen inventario_seccion;
--   · NINGUNA se ha publicado nunca (cero filas en publicacion_log);
--   · de las 66 con sección, solo 1 se publicó alguna vez;
--   · de las 2,234 SIN sección, 2,208 se han publicado.
--
-- O sea: el teléfono de esas 61 nunca llegó a Marketplace ni va a llegar. Les
-- quité información útil sin ganar nada.
--
-- Por lo tanto: el candado se aplica SOLO a las propiedades que se publican
-- (inventario_seccion IS NULL), y se devuelve la descripción a las de
-- inventario.

-- ── 1) El candado deja en paz al inventario ──────────────────────────────────
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

  -- Las de inventario ("Lonas") guardan a propósito el teléfono del letrero en
  -- la descripción, y no se publican. No se tocan.
  IF NEW.inventario_seccion IS NOT NULL THEN
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

    -- Qué cuenta como teléfono mexicano, y nada más que eso. Las reglas de
    -- arranque son las que evitan falsos positivos: "2024 2025 2026" normaliza
    -- a 12 dígitos pero empieza en "20" y por eso no entra.
    CONTINUE WHEN NOT (
         (length(v_digs) = 10 AND v_digs ~ '^[2-9]')
      OR (length(v_digs) = 12 AND v_digs ~ '^52')
      OR (length(v_digs) = 13 AND v_digs ~ '^521')
    );

    v_tels   := v_tels || v_digs;
    v_limpia := replace(v_limpia, v_tok, '');
  END LOOP;

  IF array_length(v_tels, 1) IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.inv_notas IS NULL OR trim(NEW.inv_notas) = '' THEN
    NEW.inv_notas := '📞 Contacto (estaba en la descripción): ' || array_to_string(v_tels, ' / ');
  ELSIF position(array_to_string(v_tels, ' / ') in NEW.inv_notas) = 0 THEN
    NEW.inv_notas := NEW.inv_notas || E'\n📞 Contacto (estaba en la descripción): ' || array_to_string(v_tels, ' / ');
  END IF;

  v_letras := length(regexp_replace(v_limpia, '[^[:alpha:]]', '', 'g'));
  IF v_letras < 25 THEN
    NEW.descripcion := NULL;
  ELSE
    NEW.descripcion := trim(regexp_replace(v_limpia, '[ \t]{2,}', ' ', 'g'));
  END IF;

  RETURN NEW;
END $fn$;

-- ── 2) Devolver la descripción a las de inventario ───────────────────────────
-- El texto original quedó respaldado en propiedades_descripcion_respaldo antes
-- de tocar nada. Se restaura solo donde la descripción está vacía y el
-- respaldo sí tiene texto, para no pisar nada que se haya escrito después.
UPDATE public.propiedades p
   SET descripcion = r.descripcion
  FROM public.propiedades_descripcion_respaldo r
 WHERE r.propiedad_id = p.id
   AND p.inventario_seccion IS NOT NULL
   AND p.descripcion IS NULL
   AND r.descripcion IS NOT NULL
   AND trim(r.descripcion) <> '';

-- ── 3) Quitar la nota que yo les agregué ─────────────────────────────────────
-- El teléfono vuelve a estar en la descripción, así que la nota duplicaría el
-- dato. Se borra SOLO la línea que agregué; las notas que ya existían se
-- conservan (p.ej. VR-051 tenía una nota propia).
UPDATE public.propiedades
   SET inv_notas = NULLIF(
         trim(regexp_replace(inv_notas,
              E'\n?📞 Contacto \\(estaba en la descripción\\):[^\n]*', '', 'g')), '')
 WHERE inv_notas LIKE '%Contacto (estaba en la descripción)%'
   AND inventario_seccion IS NOT NULL;

-- ── Comprobación ─────────────────────────────────────────────────────────────
SELECT
  (SELECT COUNT(*) FROM public.propiedades
    WHERE inventario_seccion IS NOT NULL AND descripcion IS NOT NULL
      AND descripcion ~ '\d{3}') AS inventario_con_su_telefono,
  (SELECT COUNT(*) FROM public.propiedades
    WHERE inventario_seccion IS NOT NULL
      AND inv_notas LIKE '%Contacto (estaba en la descripción)%') AS notas_que_sobran,
  (SELECT COUNT(*) FROM public.propiedades p
    WHERE p.inventario_seccion IS NULL AND p.descripcion IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM regexp_matches(p.descripcion, '(\+?\s?5?2?\s?\(?\d[\d\s\.\(\)-]{7,18}\d)', 'g') AS m
         WHERE (length(regexp_replace(m[1], '[^0-9]', '', 'g')) = 10 AND regexp_replace(m[1], '[^0-9]', '', 'g') ~ '^[2-9]')
            OR (length(regexp_replace(m[1], '[^0-9]', '', 'g')) = 12 AND regexp_replace(m[1], '[^0-9]', '', 'g') ~ '^52')
            OR (length(regexp_replace(m[1], '[^0-9]', '', 'g')) = 13 AND regexp_replace(m[1], '[^0-9]', '', 'g') ~ '^521')
      )) AS publicables_con_telefono;
