-- Tokens de la integración directa con Mercado Libre (una sola cuenta de la
-- agencia). Los tokens NUNCA se exponen al cliente: solo la edge function
-- (service role) los usa. RLS activa sin policies = nadie los lee salvo service role.
CREATE TABLE IF NOT EXISTS public.ml_integracion (
  id            int PRIMARY KEY DEFAULT 1,
  ml_user_id    bigint,
  nickname      text,
  access_token  text,
  refresh_token text,
  expires_at    timestamptz,
  updated_at    timestamptz DEFAULT now(),
  CONSTRAINT ml_solo_una CHECK (id = 1)
);
ALTER TABLE public.ml_integracion ENABLE ROW LEVEL SECURITY;

-- Estado de conexión para el admin (sin exponer tokens).
CREATE OR REPLACE FUNCTION public.ml_estado()
RETURNS TABLE (conectado boolean, nickname text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF (SELECT role FROM public.profiles WHERE id = auth.uid()) <> 'admin' THEN
    RAISE EXCEPTION 'Solo admin';
  END IF;
  RETURN QUERY SELECT (i.refresh_token IS NOT NULL), i.nickname FROM public.ml_integracion i WHERE i.id = 1;
END $$;
GRANT EXECUTE ON FUNCTION public.ml_estado() TO authenticated;
