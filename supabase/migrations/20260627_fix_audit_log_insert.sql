-- Bug: tr_audit_recordatorios dispara también en INSERT (agregado en
-- 20260626_protecciones_datos.sql), pero fn_audit_log() usaba OLD.id, que es
-- NULL en un INSERT (OLD no existe) -> violaba el NOT NULL de registro_id.
-- Además el CHECK de accion no permitía 'INSERT'. Esto rompía el guardado de
-- nuevos recordatorios para todos los usuarios.

ALTER TABLE public.audit_log DROP CONSTRAINT IF EXISTS audit_log_accion_check;
ALTER TABLE public.audit_log
  ADD CONSTRAINT audit_log_accion_check CHECK (accion IN ('INSERT', 'UPDATE', 'DELETE'));

CREATE OR REPLACE FUNCTION public.fn_audit_log()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_log (tabla, registro_id, accion, user_id, datos_antes)
  VALUES (TG_TABLE_NAME, COALESCE(NEW.id, OLD.id), TG_OP, auth.uid(), to_jsonb(OLD));
  RETURN COALESCE(NEW, OLD);
END;
$$;

SELECT pg_notify('pgrst', 'reload schema');
