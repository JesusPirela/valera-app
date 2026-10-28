-- Que quien recibe una cartera sepa cuáles no eran suyos.
--
-- Al mover los clientes de una persona a otra, al que los recibe le aparecen
-- de golpe decenas —o cientos— de clientes revueltos con los propios, sin
-- forma de distinguirlos. No sabe a cuáles ya les habló alguien, de cuáles no
-- conoce la historia, ni a quién preguntarle.
--
-- Se marca igual que los donados, que ya se señalan en la tarjeta con quién
-- los dio.
ALTER TABLE public.clientes
  ADD COLUMN IF NOT EXISTS recibido_de        uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS recibido_de_nombre text,
  ADD COLUMN IF NOT EXISTS recibido_at        timestamptz;

COMMENT ON COLUMN public.clientes.recibido_de_nombre IS
  'De quién venía el cliente cuando se movió la cartera. Se guarda el NOMBRE y no sólo el id porque la persona puede darse de baja y el nombre sigue sirviendo para saber a quién preguntarle.';

-- ── La función de mover, marcando de dónde vienen ────────────────────────
CREATE OR REPLACE FUNCTION public.mover_clientes(
  p_de uuid, p_a uuid, p_solo_vivos boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_rol text; v_n int; v_existe boolean; v_nombre_de text;
BEGIN
  SELECT role INTO v_rol FROM public.profiles WHERE id = auth.uid();
  -- Con un rol NULL, "NOT IN (...)" da NULL y el IF no entra: el guardia no
  -- guardaría nada. Por eso el NULL se comprueba aparte.
  IF v_rol IS NULL OR v_rol NOT IN ('admin', 'gerente') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Sólo dirección puede mover carteras.');
  END IF;

  IF p_de IS NULL OR p_a IS NULL OR p_de = p_a THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Hay que elegir dos personas distintas.');
  END IF;

  SELECT EXISTS (SELECT 1 FROM public.profiles WHERE id = p_a) INTO v_existe;
  IF NOT v_existe THEN
    RETURN jsonb_build_object('ok', false, 'error', 'La persona de destino no existe.');
  END IF;

  SELECT COALESCE(NULLIF(trim(nombre), ''), 'otro asesor')
    INTO v_nombre_de FROM public.profiles WHERE id = p_de;

  -- "Vivos" = los que todavía se trabajan. Se dejan fuera los cerrados y los
  -- descartados: mover un histórico no sirve de nada y ensucia la cartera de
  -- quien lo recibe.
  UPDATE public.clientes
     SET responsable_id     = p_a,
         recibido_de        = p_de,
         recibido_de_nombre = v_nombre_de,
         recibido_at        = now(),
         updated_at         = now()
   WHERE responsable_id = p_de
     AND eliminado_at IS NULL
     AND (NOT p_solo_vivos
          OR estado NOT IN ('compro', 'compro_externo', 'descartado'));

  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN jsonb_build_object('ok', true, 'movidos', v_n, 'de', v_nombre_de);
END $fn$;

GRANT EXECUTE ON FUNCTION public.mover_clientes(uuid, uuid, boolean) TO authenticated;

-- ── Quitar la marca ──────────────────────────────────────────────────────
-- Una vez que el asesor ya se hizo cargo del cliente, la etiqueta estorba.
-- La quita él mismo desde la ficha, y sólo de los suyos.
CREATE OR REPLACE FUNCTION public.marcar_cliente_asumido(p_cliente_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $fn$
DECLARE v_n int;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No autenticado');
  END IF;

  UPDATE public.clientes
     SET recibido_de = NULL, recibido_de_nombre = NULL, recibido_at = NULL
   WHERE id = p_cliente_id
     AND responsable_id = auth.uid();

  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Ese cliente no es tuyo.');
  END IF;
  RETURN jsonb_build_object('ok', true);
END $fn$;

GRANT EXECUTE ON FUNCTION public.marcar_cliente_asumido(uuid) TO authenticated;
