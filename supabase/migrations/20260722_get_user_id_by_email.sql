-- RPC para que las edge functions (service_role) resuelvan email → user_id
-- sin tener que paginar auth.admin.listUsers.
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(p_email TEXT)
RETURNS UUID
LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$
  SELECT id FROM auth.users
  WHERE lower(trim(email)) = lower(trim(p_email))
  LIMIT 1;
$$;

-- Solo service_role puede llamar esto (las edges que usan la clave de servicio).
REVOKE EXECUTE ON FUNCTION public.get_user_id_by_email(TEXT) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.get_user_id_by_email(TEXT) TO service_role;

NOTIFY pgrst, 'reload schema';
