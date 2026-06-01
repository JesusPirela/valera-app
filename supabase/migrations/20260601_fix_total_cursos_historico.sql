-- Corregir total_cursos en user_stats para usuarios que completaron cursos
-- antes de que registrarAccion fuera llamado al completar lecciones.
-- Fuente de verdad: vu_certificados (un registro por curso completado).
UPDATE public.user_stats us
SET total_cursos = (
  SELECT COUNT(*) FROM public.vu_certificados vc WHERE vc.user_id = us.id
)
WHERE (
  SELECT COUNT(*) FROM public.vu_certificados vc WHERE vc.user_id = us.id
) > us.total_cursos;
