-- Mandarme a mí mismo un aviso de alarma, para comprobar que llega.
--
-- El botón de "probar el cuadro" que ya existe dibuja la ventana en el acto,
-- desde la propia app. Eso comprueba que el permiso de superponerse está dado,
-- pero NO comprueba el camino que de verdad falla: que el push llegue al
-- teléfono y despierte a la app estando cerrada. Todo el historial de "no me
-- sale el cuadro" estuvo ahí, no en el dibujo.
--
-- Esto mete un aviso en la misma cola por la que pasa un lead de verdad, con
-- un tipo propio, así que recorre el camino completo: cola → procesar-pushes →
-- Expo → FCM → el servicio nativo → el cuadro.
--
-- Solo se puede mandar a uno mismo: el destinatario es auth.uid(), no un
-- parámetro. Y uno por minuto, para que picarle repetido no llene la cola de
-- pushes a la misma persona.
CREATE OR REPLACE FUNCTION public.probar_alarma_push()
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE
  v_uid   uuid := auth.uid();
  v_token text;
  v_ultimo timestamptz;
BEGIN
  IF v_uid IS NULL THEN
    RETURN 'No hay sesión.';
  END IF;

  SELECT p.push_token INTO v_token FROM public.profiles p WHERE p.id = v_uid;
  -- Sin token no hay a dónde mandarlo, y es el fallo más común: decirlo aquí
  -- ahorra buscar el problema en el teléfono cuando está en la cuenta.
  IF v_token IS NULL THEN
    RETURN 'Este usuario no tiene registrado el teléfono. Abre la app en el celular y acepta los avisos.';
  END IF;

  SELECT MAX(n.created_at) INTO v_ultimo
    FROM public.notificaciones n
   WHERE n.user_id = v_uid AND n.tipo = 'alarma_prueba';

  IF v_ultimo IS NOT NULL AND v_ultimo > now() - interval '1 minute' THEN
    RETURN 'Ya mandaste una hace menos de un minuto. Espera a que llegue.';
  END IF;

  INSERT INTO public.notificaciones (user_id, titulo, mensaje, tipo, push_enviado)
  VALUES (v_uid,
          'Prueba de alarma',
          'Si ves este cuadro, la alarma está bien configurada en tu teléfono.',
          'alarma_prueba',
          false);

  RETURN 'Enviado. Bloquea el teléfono o cambia de app: debe salir el cuadro.';
END $fn$;

GRANT EXECUTE ON FUNCTION public.probar_alarma_push() TO authenticated;
