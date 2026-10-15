-- El teléfono de la app de alarmas, que es otro aparato a ojos del push.
--
-- La app de alarmas es un programa distinto de Valera: otro identificador,
-- otra instalación y, sobre todo, OTRO token de push. Apple y Google entregan
-- por token, no por persona, así que mandar el aviso de la alarma al token de
-- Valera lo deja llegando a Valera, que es justo la app que no puede hacer
-- sonar nada con la pantalla bloqueada en iPhone.
--
-- Se guarda aparte y no se pisa con el de Valera: una persona puede tener las
-- dos apps, y entonces hay dos destinos vivos al mismo tiempo.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS push_token_alarmas text;
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS alarmas_so_version text;

COMMENT ON COLUMN public.profiles.push_token_alarmas IS
  'Token de push de la app de alarmas (app aparte). Null si no la tiene instalada.';
COMMENT ON COLUMN public.profiles.alarmas_so_version IS
  'Version de iOS que reporta la app de alarmas. Decide si puede usar AlarmKit (26+).';

-- Guardar el token desde la app de alarmas.
--
-- Va por funcion y no por un update directo: la app de alarmas solo necesita
-- escribir SU token, y asi no se le abre la tabla de perfiles entera a un
-- programa nuevo. Solo puede escribir sobre si misma.
CREATE OR REPLACE FUNCTION public.registrar_token_alarmas(
  p_token text,
  p_so_version text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_uid uuid := auth.uid();
BEGIN
  IF v_uid IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'no autenticado');
  END IF;
  IF p_token IS NULL OR length(trim(p_token)) < 10 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'token invalido');
  END IF;

  UPDATE public.profiles
     SET push_token_alarmas = p_token,
         alarmas_so_version = COALESCE(p_so_version, alarmas_so_version)
   WHERE id = v_uid;

  RETURN jsonb_build_object('ok', true);
END $fn$;

GRANT EXECUTE ON FUNCTION public.registrar_token_alarmas(text, text) TO authenticated;
