-- Corrige notificaciones con texto/emoji mal codificados (aparecían como "??" o "C?mo")
-- IMPORTANTE: ejecutar este script desde el SQL Editor del panel de Supabase (navegador),
-- no desde una terminal, para evitar que la codificación se corrompa de nuevo.

-- 1. Recrear la función de regalo de cofres con el texto correcto en UTF-8
CREATE OR REPLACE FUNCTION admin_regalar_cofre(
  p_target_user_id UUID,
  p_cantidad       INT  DEFAULT 1,
  p_nota           TEXT DEFAULT 'El equipo Valera te regala este cofre misterioso 🎁'
)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
  v_rol          TEXT;
  v_admin_nombre TEXT;
  v_target_nombre TEXT;
BEGIN
  SELECT role, nombre INTO v_rol, v_admin_nombre FROM profiles WHERE id = auth.uid();
  IF v_rol IS DISTINCT FROM 'admin' THEN
    RAISE EXCEPTION 'No autorizado: se requiere rol de administrador';
  END IF;

  IF p_cantidad <= 0 THEN
    RAISE EXCEPTION 'La cantidad debe ser mayor a 0';
  END IF;

  IF p_cantidad > 999 THEN
    RAISE EXCEPTION 'La cantidad no puede superar 999';
  END IF;

  SELECT nombre INTO v_target_nombre FROM profiles WHERE id = p_target_user_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Usuario destino no encontrado';
  END IF;

  INSERT INTO user_stats(id, cofres_pendientes)
  VALUES (p_target_user_id, p_cantidad)
  ON CONFLICT (id) DO UPDATE
    SET cofres_pendientes = user_stats.cofres_pendientes + EXCLUDED.cofres_pendientes;

  INSERT INTO cofres_entregas(admin_id, target_user_id, admin_nombre, target_nombre, cantidad, nota)
  VALUES (auth.uid(), p_target_user_id, v_admin_nombre, v_target_nombre, p_cantidad, p_nota);

  INSERT INTO notificaciones(user_id, titulo, mensaje, tipo)
  VALUES (
    p_target_user_id,
    '🎁 ¡Te regalaron ' || p_cantidad || CASE WHEN p_cantidad = 1 THEN ' cofre gratis!' ELSE ' cofres gratis!' END,
    p_nota,
    'cofre'
  );

  RETURN TRUE;
END;
$$;

-- 2. Corregir notificaciones de cofres ya guardadas con el título mal codificado
UPDATE notificaciones
SET titulo = '🎁 ¡Te regalaron ' || (regexp_match(titulo, '(\d+)'))[1] ||
  CASE WHEN (regexp_match(titulo, '(\d+)'))[1] = '1' THEN ' cofre gratis!' ELSE ' cofres gratis!' END
WHERE tipo = 'cofre'
  AND titulo NOT LIKE '🎁%'
  AND titulo ~ '\d+';

-- 3. Corregir el título del curso de Valera University mal codificado
UPDATE vu_cursos
SET titulo = 'Cómo Perfilar Correctamente un Perfil de Venta'
WHERE titulo ILIKE '%mo Perfilar Correctamente un Perfil de Venta';

-- 4. Corregir las notificaciones ya enviadas que referencian ese curso
UPDATE notificaciones
SET mensaje = regexp_replace(mensaje, 'C.{1,2}mo Perfilar Correctamente un Perfil de Venta', 'Cómo Perfilar Correctamente un Perfil de Venta')
WHERE mensaje ILIKE '%mo Perfilar Correctamente un Perfil de Venta%';

SELECT pg_notify('pgrst', 'reload schema');
