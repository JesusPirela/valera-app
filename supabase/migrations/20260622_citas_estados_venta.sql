-- Agregar 5 estados de cierre de venta al pipeline de citas
ALTER TABLE citas_coordinacion
  DROP CONSTRAINT IF EXISTS citas_coordinacion_estado_check;

ALTER TABLE citas_coordinacion
  ADD CONSTRAINT citas_coordinacion_estado_check
  CHECK (estado IN (
    'por_contactar',
    'primer_contacto',
    'buscando_opciones',
    'en_coordinacion',
    'coordinada',
    'reagendada',
    'no_responde_asesor',
    'realizada',
    'aparto',
    'recaudando_documentacion',
    'aprobando_credito',
    'firma_contrato',
    'escrituracion',
    'cancelada'
  ));
