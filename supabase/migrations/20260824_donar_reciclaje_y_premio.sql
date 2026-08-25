-- PARTE 3: al pasar un cliente a "compro", si viene de un lead DONADO, premiar al
-- donante (coins + XP) y dejar la comisión registrada como pendiente (el % se
-- define aparte). La fila del pool en estado 'convertido' + comision_liquidada=false
-- ES el registro de comisión pendiente que verá el admin.
CREATE OR REPLACE FUNCTION public.fn_recompensar_donacion_compra()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_lp record;
BEGIN
  IF NEW.estado IN ('compro','compro_externo') AND OLD.estado IS DISTINCT FROM NEW.estado THEN
    SELECT * INTO v_lp FROM leads_pool
    WHERE cliente_id = NEW.id AND donante_id IS NOT NULL AND convertido_at IS NULL
    LIMIT 1;
    IF FOUND AND v_lp.donante_id <> COALESCE(NEW.responsable_id, '00000000-0000-0000-0000-000000000000') THEN
      UPDATE leads_pool SET estado = 'convertido', convertido_at = now() WHERE id = v_lp.id;
      UPDATE user_stats SET valera_coins = valera_coins + 200, xp = xp + 300 WHERE id = v_lp.donante_id;
      INSERT INTO coin_transactions (user_id, cantidad, concepto)
      VALUES (v_lp.donante_id, 200, 'Comisión por cliente donado que compró 🤝');
      INSERT INTO notificaciones (user_id, titulo, mensaje, tipo)
      VALUES (v_lp.donante_id, '🤝 ¡Tu cliente donado compró!',
        'Un cliente que donaste al pool cerró la compra. Ganaste 200 coins + 300 XP y te toca tu parte de la comisión (el equipo te la liquida).',
        'sistema');
    END IF;
  END IF;
  RETURN NEW;
END $fn$;

DROP TRIGGER IF EXISTS trg_recompensar_donacion_compra ON public.clientes;
CREATE TRIGGER trg_recompensar_donacion_compra
AFTER UPDATE OF estado ON public.clientes
FOR EACH ROW EXECUTE FUNCTION public.fn_recompensar_donacion_compra();

-- PARTE 2: reciclar leads del pool que llevan 1 SEMANA asignados SIN NINGÚN
-- contacto ni seguimiento. Regresa el lead al pool y avisa (sin castigo). Aplica
-- a todo el pool, no solo lo donado.
CREATE OR REPLACE FUNCTION public.reciclar_leads_no_contactados()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $fn$
DECLARE v_rec record; v_n int := 0;
BEGIN
  FOR v_rec IN
    SELECT lp.id AS pool_id, lp.asignado_a, lp.cliente_id, c.nombre AS c_nombre
    FROM leads_pool lp
    JOIN clientes c ON c.id = lp.cliente_id
    WHERE lp.estado = 'asignado'
      AND lp.asignado_at < now() - interval '7 days'
      AND c.eliminado_at IS NULL
      AND COALESCE(c.wa_count,0) = 0
      AND COALESCE(c.call_count,0) = 0
      AND c.estado = 'por_perfilar'
      AND c.proximo_contacto IS NULL
      AND NOT EXISTS (
        SELECT 1 FROM interacciones i
        WHERE i.cliente_id = c.id AND i.tipo IN ('mensaje','llamada')
      )
  LOOP
    UPDATE leads_pool SET estado = 'disponible', asignado_a = NULL, asignado_at = NULL, cliente_id = NULL
    WHERE id = v_rec.pool_id;
    UPDATE clientes SET eliminado_at = now(), razon_descarte = 'Reciclado: sin contacto en 1 semana'
    WHERE id = v_rec.cliente_id;
    INSERT INTO notificaciones (user_id, titulo, mensaje, tipo)
    VALUES (v_rec.asignado_a, '⏳ Se te retiró un lead',
      'El lead "' || COALESCE(v_rec.c_nombre,'sin nombre') || '" volvió al pool porque no tuviste ninguna interacción en una semana.',
      'sistema');
    v_n := v_n + 1;
  END LOOP;
  RETURN v_n;
END $fn$;

-- Cron diario (06:20 UTC) para reciclar.
SELECT cron.schedule('reciclar-leads-no-contactados', '20 6 * * *', 'SELECT public.reciclar_leads_no_contactados();');
