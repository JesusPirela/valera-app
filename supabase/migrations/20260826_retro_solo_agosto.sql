-- Retros pendientes para el asesor: SOLO citas de AGOSTO 2026 en adelante.
-- Antes filtraba por orden>=1250; ahora por fecha de la cita, para que a los
-- asesores ya no les salgan las de julio ni anteriores (ni las sin fecha, viejas).
CREATE OR REPLACE FUNCTION public.get_mis_citas_pendientes_retro()
 RETURNS TABLE(id uuid, cliente_nombre text, telefono text, detalles_pago text, interesado_en text, dia_cita text, prospecto text, coordino text, atendio text)
 LANGUAGE sql SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT id, cliente_nombre, telefono, detalles_pago, interesado_en, dia_cita, prospecto, coordino, atendio
  FROM citas_venta
  WHERE asesor_id = auth.uid()
    AND retro_completada_at IS NULL
    AND fecha_cita >= '2026-08-01'::timestamptz
  ORDER BY created_at DESC;
$function$;
