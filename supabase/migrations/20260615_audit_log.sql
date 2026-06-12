-- =============================================================================
-- Auditoria: registro permanente de quien borra o modifica datos criticos.
-- Cubre propiedades y clientes (DELETE y UPDATE).
-- Solo admins pueden leer el log; nadie puede modificarlo ni borrarlo desde
-- el cliente (sin politicas de INSERT/UPDATE/DELETE: solo el trigger escribe).
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.audit_log (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  tabla       TEXT        NOT NULL,
  registro_id UUID        NOT NULL,
  accion      TEXT        NOT NULL CHECK (accion IN ('UPDATE', 'DELETE')),
  user_id     UUID,                 -- quien hizo el cambio (auth.uid())
  datos_antes JSONB,                -- estado del registro antes del cambio
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_log_tabla_registro ON public.audit_log (tabla, registro_id);
CREATE INDEX IF NOT EXISTS idx_audit_log_created        ON public.audit_log (created_at);

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='audit_log' AND policyname='audit_admin_select') THEN
    CREATE POLICY "audit_admin_select" ON public.audit_log FOR SELECT USING (
      EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    );
  END IF;
END $$;

-- Trigger generico: guarda el estado anterior en cada UPDATE/DELETE
CREATE OR REPLACE FUNCTION public.fn_audit_log()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.audit_log (tabla, registro_id, accion, user_id, datos_antes)
  VALUES (TG_TABLE_NAME, OLD.id, TG_OP, auth.uid(), to_jsonb(OLD));
  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS tr_audit_propiedades ON public.propiedades;
CREATE TRIGGER tr_audit_propiedades
  AFTER UPDATE OR DELETE ON public.propiedades
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();

DROP TRIGGER IF EXISTS tr_audit_clientes ON public.clientes;
CREATE TRIGGER tr_audit_clientes
  AFTER UPDATE OR DELETE ON public.clientes
  FOR EACH ROW EXECUTE FUNCTION public.fn_audit_log();
