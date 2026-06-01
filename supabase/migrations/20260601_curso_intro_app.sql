-- Curso de presentación de la app: sin certificación, aparece primero (orden=0)

INSERT INTO vu_cursos (
  id, titulo, descripcion, descripcion_corta,
  instructor, duracion_texto, categoria, nivel,
  publicado, orden, es_certificacion
)
VALUES (
  'bbbbbbbb-0000-0000-0000-000000000001',
  'Conoce Valera App',
  'Video de presentación con todas las funcionalidades actuales de la app: gestión de propiedades, CRM, seguimientos, misiones, gamificación y más. El punto de partida ideal antes de cualquier otro curso.',
  'Recorrido completo por todas las características de la app',
  'Valera University',
  '~5 min · 1 lección',
  'Fundamentos',
  'basico',
  TRUE,
  0,
  FALSE
) ON CONFLICT (id) DO NOTHING;

INSERT INTO vu_lecciones (curso_id, titulo, descripcion, youtube_url, orden)
VALUES (
  'bbbbbbbb-0000-0000-0000-000000000001',
  'Presentación de Valera App',
  'Recorrido por todas las características actuales de la app.',
  'https://drive.google.com/file/d/1MRclMTOgrG-M7CgYQqc9y1wxvzyGOlTH/view',
  1
) ON CONFLICT DO NOTHING;
