-- Ajuste curso "Productividad y Habitos de Alto Rendimiento": queda en
-- 2 lecciones (los videos correctos son LOWDFWI7BSw y LXggCtc_V20).
-- Se elimina la leccion intermedia que apuntaba a un video equivocado.

-- Borrar la leccion con el video incorrecto (cascada limpia su progreso)
DELETE FROM vu_lecciones
WHERE curso_id = 'bbbbbbbb-0000-0000-0000-000000000002'
  AND youtube_url LIKE '%75d_29QWELk%';

-- Reordenar: la leccion de productividad pasa a ser la 2
UPDATE vu_lecciones
SET orden = 2
WHERE curso_id = 'bbbbbbbb-0000-0000-0000-000000000002'
  AND youtube_url LIKE '%LXggCtc_V20%';

-- Actualizar duracion del curso
UPDATE vu_cursos
SET duracion_texto = '~30 min - 2 lecciones'
WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002';
