-- Fusión de columna "Perfilado sin fecha" (por_contactar) en "Lo estamos contactando" (primer_contacto).
-- La columna desaparece del kanban; las citas que tenían ese estado pasan a primer_contacto.
UPDATE public.citas_coordinacion
SET estado = 'primer_contacto'
WHERE estado = 'por_contactar';
