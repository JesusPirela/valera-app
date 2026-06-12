-- =============================================================================
-- Valera University: nuevo curso "Productividad y Habitos de Alto Rendimiento"
-- 3 lecciones en video con notas de estudio aplicadas a bienes raices.
-- Se inserta sin publicar y se publica al final para disparar la notificacion
-- automatica a todos los prospectadores.
-- =============================================================================

INSERT INTO vu_cursos (id, titulo, descripcion, descripcion_corta, imagen_url, instructor, duracion_texto, categoria, nivel, publicado, orden)
VALUES (
  'bbbbbbbb-0000-0000-0000-000000000002',
  'Productividad y Habitos de Alto Rendimiento',
  'El exito en bienes raices no depende de la motivacion: depende de tus habitos y de como usas tu tiempo. En este curso aprenderas el metodo cientifico para construir rutinas que se sostienen solas, romper el ciclo de la procrastinacion y convertirte en esa persona que aprovecha cada dia. Tres lecciones directas y practicas que puedes aplicar desde hoy a tu trabajo de prospeccion.',
  'Construye habitos que se sostienen solos y multiplica tu rendimiento diario',
  'https://img.youtube.com/vi/LOWDFWI7BSw/maxresdefault.jpg',
  'Valera University',
  '~40 min - 3 lecciones',
  'Desarrollo personal',
  'basico',
  FALSE,
  10
) ON CONFLICT (id) DO NOTHING;

INSERT INTO vu_lecciones (curso_id, titulo, descripcion, youtube_url, contenido, orden)
VALUES
(
  'bbbbbbbb-0000-0000-0000-000000000002',
  'Cambia tu vida pasito a pasito',
  'La brecha entre quien eres y quien quieres ser no se cierra con fuerza de voluntad, sino con pasos tan pequenos que es imposible fallar. Esta leccion explica el metodo: divide tu meta en acciones minimas, claras y especificas.',
  'https://www.youtube.com/embed/LOWDFWI7BSw',
  'IDEAS CLAVE DE LA LECCION

1. No necesitas convertirte en otra persona para lograr tus metas. Necesitas rutinas que trabajen por ti.

2. El error clasico: ponerse metas enormes ("voy a publicar 50 propiedades este mes") que dependen de motivacion. La motivacion se acaba; los habitos no.

3. El metodo: divide tu objetivo en pasos tan pequenos que no puedas decir que no. No es "hacer prospeccion", es "enviar 1 mensaje al abrir la app".

4. Cada paso debe ser: PEQUENO (menos de 5 minutos), CLARO (sabes exactamente que hacer) y ESPECIFICO (no requiere pensarlo).

COMO APLICARLO EN VALERA
- En lugar de "voy a conseguir mas clientes" -> "cada manana agrego 1 cliente nuevo al CRM antes del desayuno".
- En lugar de "voy a publicar mas" -> "publico 1 propiedad justo despues de mi primer cafe".
- Registra tu racha en la app: la constancia diaria pesa mas que un dia heroico.',
  1
),
(
  'bbbbbbbb-0000-0000-0000-000000000002',
  'Disena tu rutina: detonadores y constancia',
  'Profundizamos en la ciencia del habito: como anclar tus nuevas acciones a detonadores (un lugar, una hora, una accion previa) para que se ejecuten en automatico, sin gastar fuerza de voluntad.',
  'https://www.youtube.com/embed/75d_29QWELk',
  'IDEAS CLAVE DE LA LECCION

1. Un habito tiene 3 partes: DETONADOR -> ACCION -> RECOMPENSA. Si controlas el detonador, controlas el habito.

2. Detonadores que funcionan: una hora fija del dia, un lugar especifico, o "despues de X cosa que ya hago" (despues de lavarme los dientes, despues de llegar a la oficina).

3. La regla de oro: nunca falles dos dias seguidos. Fallar un dia es normal; fallar dos es el inicio de abandonar.

4. El ambiente le gana a la voluntad: deja lo que necesitas a la vista y esconde las distracciones.

COMO APLICARLO EN VALERA
- Ancla tu prospeccion a un detonador: "al sentarme en mi escritorio, lo primero es abrir la app y revisar mis seguimientos pendientes".
- Bloquea 30 minutos a la misma hora todos los dias para publicar propiedades. Misma hora, mismo lugar.
- Usa los recordatorios del CRM como detonadores externos: cuando llegue la notificacion, actua de inmediato.',
  2
),
(
  'bbbbbbbb-0000-0000-0000-000000000002',
  'Productividad de alto nivel: aprovecha tu dia',
  'Como trabajan las personas que parecen rendir el triple: gestion de energia (no solo de tiempo), bloques de trabajo profundo sin distracciones y la disciplina de hacer lo importante primero.',
  'https://www.youtube.com/embed/LXggCtc_V20',
  'IDEAS CLAVE DE LA LECCION

1. La productividad real no es hacer mas cosas: es hacer LAS cosas que mueven resultados. En bienes raices: prospectar, publicar y dar seguimiento. Todo lo demas es secundario.

2. Gestiona tu energia, no solo tu tiempo: identifica tus horas de mayor enfoque y usalas para lo dificil (llamadas, seguimientos complicados). Deja lo mecanico para tus horas bajas.

3. Trabajo profundo: bloques de 45-90 minutos sin celular, sin redes, una sola tarea. Un bloque enfocado vale mas que 4 horas de trabajo interrumpido.

4. Lo importante primero: si haces lo mas dificil del dia en la manana, el resto del dia ya ganaste.

COMO APLICARLO EN VALERA
- Define tus "3 del dia" cada manana: 3 acciones que si o si haces (ej: 1 cliente nuevo, 2 publicaciones, 3 seguimientos).
- Haz tus llamadas y seguimientos dificiles en tu mejor horario, no "cuando haya tiempo".
- Mide tu semana en Mi Actividad: lo que se mide, mejora.',
  3
)
ON CONFLICT DO NOTHING;

-- Publicar al final: dispara la notificacion automatica de nuevo curso
UPDATE vu_cursos
SET publicado = TRUE
WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002' AND publicado = FALSE;
