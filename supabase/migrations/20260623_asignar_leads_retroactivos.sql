-- ══════════════════════════════════════════════════════════════════════════════
-- Asignación retroactiva de leads pendientes
--
-- Antes de implementar la auto-asignación, las compras de Lead Premium /
-- Lead Meta Ads quedaban en estado 'pendiente' sin asignar ningún lead.
-- Esta RPC las detecta y asigna un lead del pool a cada compra pendiente.
-- ══════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.admin_asignar_leads_pendientes()
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_compra     RECORD;
  v_asignacion JSONB;
  v_ok         INT := 0;
  v_sin_pool   INT := 0;
  v_total      INT := 0;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.profiles pr WHERE pr.id = auth.uid() AND pr.role = 'admin'
  ) THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  -- Compras pendientes de items de tipo lead (premium o meta)
  FOR v_compra IN
    SELECT sc.id AS compra_id, sc.user_id, si.tipo AS item_tipo
    FROM public.store_compras sc
    JOIN public.store_items si ON si.id = sc.item_id
    WHERE sc.estado = 'pendiente'
      AND si.tipo IN ('lead_premium', 'lead_meta')
    ORDER BY sc.created_at
  LOOP
    v_total := v_total + 1;

    v_asignacion := public.asignar_lead_desde_pool(
      v_compra.user_id,
      v_compra.compra_id,
      'tienda_' || v_compra.item_tipo
    );

    IF (v_asignacion->>'ok')::BOOLEAN THEN
      UPDATE public.store_compras
      SET estado = 'entregado', atendido_at = NOW()
      WHERE id = v_compra.compra_id;
      v_ok := v_ok + 1;
    ELSE
      -- Pool vacío: no hay más leads que asignar
      v_sin_pool := v_sin_pool + 1;
      EXIT;
    END IF;
  END LOOP;

  RETURN jsonb_build_object(
    'total_pendientes', v_total,
    'asignados',        v_ok,
    'sin_lead_en_pool', v_sin_pool
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_asignar_leads_pendientes() TO authenticated;
