-- ══════════════════════════════════════════════════════════════
-- GAMIFICATION SYSTEM — Valera App
-- ══════════════════════════════════════════════════════════════

-- ── user_stats: XP, coins, streak por usuario ────────────────
CREATE TABLE IF NOT EXISTS public.user_stats (
  id                  UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  xp                  INTEGER NOT NULL DEFAULT 0,
  valera_coins        INTEGER NOT NULL DEFAULT 0,
  streak_dias         INTEGER NOT NULL DEFAULT 0,
  ultimo_acceso       DATE,
  total_propiedades   INTEGER NOT NULL DEFAULT 0,
  total_clientes      INTEGER NOT NULL DEFAULT 0,
  total_cursos        INTEGER NOT NULL DEFAULT 0,
  total_seguimientos  INTEGER NOT NULL DEFAULT 0,
  total_ventas        INTEGER NOT NULL DEFAULT 0,
  total_interacciones INTEGER NOT NULL DEFAULT 0,
  created_at          TIMESTAMPTZ DEFAULT NOW()
);

-- ── misiones: definición de misiones (diarias y base) ─────────
CREATE TABLE IF NOT EXISTS public.misiones (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo             TEXT NOT NULL CHECK (tipo IN ('diaria', 'base')),
  categoria        TEXT NOT NULL CHECK (categoria IN ('propiedad','crm','curso','streak','seguimiento','interaccion')),
  titulo           TEXT NOT NULL,
  descripcion      TEXT,
  meta             INTEGER NOT NULL,
  recompensa_xp    INTEGER NOT NULL DEFAULT 0,
  recompensa_coins INTEGER NOT NULL DEFAULT 0,
  orden            INTEGER NOT NULL DEFAULT 0,
  activa           BOOLEAN NOT NULL DEFAULT TRUE,
  icono            TEXT DEFAULT '🎯'
);

-- ── user_misiones: progreso del usuario en cada misión ────────
CREATE TABLE IF NOT EXISTS public.user_misiones (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  mision_id        UUID NOT NULL REFERENCES public.misiones(id) ON DELETE CASCADE,
  progreso         INTEGER NOT NULL DEFAULT 0,
  completada       BOOLEAN NOT NULL DEFAULT FALSE,
  fecha_completada TIMESTAMPTZ,
  fecha_reset      DATE,
  UNIQUE(user_id, mision_id)
);

-- ── coin_transactions: historial de movimientos de coins ──────
CREATE TABLE IF NOT EXISTS public.coin_transactions (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cantidad   INTEGER NOT NULL,
  concepto   TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ── store_items: artículos disponibles en la tienda ───────────
CREATE TABLE IF NOT EXISTS public.store_items (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre       TEXT NOT NULL,
  descripcion  TEXT,
  costo_coins  INTEGER NOT NULL,
  tipo         TEXT NOT NULL,
  disponible   BOOLEAN NOT NULL DEFAULT TRUE,
  stock        INTEGER,
  icono        TEXT DEFAULT '🎁',
  orden        INTEGER NOT NULL DEFAULT 0
);

-- ── store_compras: historial de compras ───────────────────────
CREATE TABLE IF NOT EXISTS public.store_compras (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  item_id     UUID NOT NULL REFERENCES public.store_items(id),
  costo_coins INTEGER NOT NULL,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- ══════════════════════════════════════════════════════════════
-- ROW LEVEL SECURITY
-- ══════════════════════════════════════════════════════════════

ALTER TABLE public.user_stats      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_misiones   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.coin_transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_items     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_compras   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.misiones        ENABLE ROW LEVEL SECURITY;

-- user_stats: usuario ve las propias, admin ve todas
CREATE POLICY "user_stats_select" ON public.user_stats FOR SELECT USING (
  auth.uid() = id OR
  EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
);
CREATE POLICY "user_stats_insert" ON public.user_stats FOR INSERT WITH CHECK (auth.uid() = id);
CREATE POLICY "user_stats_update" ON public.user_stats FOR UPDATE USING (auth.uid() = id);

-- user_misiones
CREATE POLICY "user_misiones_select" ON public.user_misiones FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "user_misiones_insert" ON public.user_misiones FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "user_misiones_update" ON public.user_misiones FOR UPDATE USING (auth.uid() = user_id);

-- coin_transactions
CREATE POLICY "coin_tx_select" ON public.coin_transactions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "coin_tx_insert" ON public.coin_transactions FOR INSERT WITH CHECK (auth.uid() = user_id);

-- store_items: visible para todos los autenticados
CREATE POLICY "store_items_select" ON public.store_items FOR SELECT USING (true);

-- misiones: visible para todos
CREATE POLICY "misiones_select" ON public.misiones FOR SELECT USING (true);

-- store_compras
CREATE POLICY "store_compras_select" ON public.store_compras FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "store_compras_insert" ON public.store_compras FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ══════════════════════════════════════════════════════════════
-- FUNCIONES RPC
-- ══════════════════════════════════════════════════════════════

-- Actualiza XP + coins de forma atómica y registra la transacción
CREATE OR REPLACE FUNCTION public.award_xp_coins(
  p_user_id    UUID,
  p_xp         INTEGER,
  p_coins      INTEGER,
  p_concepto   TEXT,
  p_campo_contador TEXT DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  INSERT INTO public.user_stats (id, xp, valera_coins)
  VALUES (p_user_id, GREATEST(p_xp, 0), GREATEST(p_coins, 0))
  ON CONFLICT (id) DO UPDATE SET
    xp           = user_stats.xp + GREATEST(EXCLUDED.xp, 0),
    valera_coins = user_stats.valera_coins + GREATEST(EXCLUDED.valera_coins, 0);

  IF p_campo_contador IS NOT NULL AND p_campo_contador IN (
    'total_propiedades','total_clientes','total_cursos',
    'total_seguimientos','total_ventas','total_interacciones'
  ) THEN
    EXECUTE format(
      'UPDATE public.user_stats SET %I = COALESCE(%I, 0) + 1 WHERE id = $1',
      p_campo_contador, p_campo_contador
    ) USING p_user_id;
  END IF;

  IF p_coins > 0 THEN
    INSERT INTO public.coin_transactions (user_id, cantidad, concepto)
    VALUES (p_user_id, p_coins, p_concepto);
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.award_xp_coins TO authenticated;

-- Gasta coins de la tienda (atómico, valida saldo)
CREATE OR REPLACE FUNCTION public.gastar_coins(
  p_user_id    UUID,
  p_cantidad   INTEGER,
  p_concepto   TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_saldo INTEGER;
BEGIN
  IF p_user_id != auth.uid() THEN
    RAISE EXCEPTION 'Access denied';
  END IF;

  SELECT valera_coins INTO v_saldo FROM public.user_stats WHERE id = p_user_id FOR UPDATE;
  IF v_saldo IS NULL OR v_saldo < p_cantidad THEN
    RETURN FALSE;
  END IF;

  UPDATE public.user_stats SET valera_coins = valera_coins - p_cantidad WHERE id = p_user_id;
  INSERT INTO public.coin_transactions (user_id, cantidad, concepto)
  VALUES (p_user_id, -p_cantidad, p_concepto);
  RETURN TRUE;
END;
$$;
GRANT EXECUTE ON FUNCTION public.gastar_coins TO authenticated;

-- Ranking público (top 50 por XP)
CREATE OR REPLACE FUNCTION public.get_ranking()
RETURNS TABLE (
  id          UUID,
  nombre      TEXT,
  avatar_url  TEXT,
  xp          INTEGER,
  valera_coins INTEGER,
  streak_dias INTEGER,
  posicion    BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    us.id,
    p.nombre,
    p.avatar_url,
    us.xp,
    us.valera_coins,
    us.streak_dias,
    RANK() OVER (ORDER BY us.xp DESC)::BIGINT AS posicion
  FROM public.user_stats us
  JOIN public.profiles p ON p.id = us.id
  WHERE p.role NOT IN ('admin')
  ORDER BY us.xp DESC
  LIMIT 50;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_ranking() TO authenticated;

-- ══════════════════════════════════════════════════════════════
-- SEED: MISIONES
-- ══════════════════════════════════════════════════════════════
INSERT INTO public.misiones (tipo, categoria, titulo, descripcion, meta, recompensa_xp, recompensa_coins, orden, icono) VALUES
-- ── Diarias ──────────────────────────────────────────────────
('diaria', 'propiedad',   'Publicador del día',      'Publica 10 propiedades hoy',               10, 30, 10, 1,  '🏠'),
('diaria', 'crm',         'Prospectador activo',      'Agrega 1 cliente nuevo al CRM',            1,  25,  8, 2,  '👤'),
('diaria', 'seguimiento', 'Al día con clientes',      'Completa 2 seguimientos pendientes',        2,  20,  6, 3,  '✅'),
('diaria', 'curso',       'Aprendizaje diario',       'Ve 1 lección de un curso',                 1,  20,  5, 4,  '📚'),
('diaria', 'interaccion', 'Conectado con clientes',   'Registra 3 interacciones con clientes',    3,  20,  5, 5,  '💬'),
-- ── Base: Propiedades ─────────────────────────────────────────
('base',   'propiedad',   'Primeros pasos',           'Publica 20 propiedades',                   20,  50, 15, 10, '🏠'),
('base',   'propiedad',   'Catálogo en crecimiento',  'Publica 50 propiedades',                   50, 100, 35, 11, '🏘️'),
('base',   'propiedad',   'Agente activo',            'Publica 75 propiedades',                   75, 150, 55, 12, '🌟'),
('base',   'propiedad',   'Centenario',               'Publica 100 propiedades',                 100, 200, 80, 13, '💯'),
('base',   'propiedad',   'Publicador Elite',         'Publica 125 propiedades',                 125, 250,110, 14, '🔥'),
('base',   'propiedad',   'Maestro del catálogo',     'Publica 150 propiedades',                 150, 300,145, 15, '👑'),
('base',   'propiedad',   'Leyenda inmobiliaria',     'Publica 200 propiedades',                 200, 500,200, 16, '🏆'),
-- ── Base: Cursos ──────────────────────────────────────────────
('base',   'curso',       'Primer aprendizaje',       'Completa 3 cursos',                         3, 100, 30, 20, '📚'),
('base',   'curso',       'Estudiante dedicado',      'Completa 5 cursos',                         5, 200, 60, 21, '🎓'),
('base',   'curso',       'Experto en formación',     'Completa 10 cursos',                       10, 500,150, 22, '🧠'),
-- ── Base: CRM ────────────────────────────────────────────────
('base',   'crm',         'Primer pipeline',          'Agrega 5 clientes al CRM',                  5,  75, 20, 30, '👥'),
('base',   'crm',         'CRM en marcha',            'Agrega 10 clientes al CRM',                10, 150, 45, 31, '📋'),
('base',   'crm',         'Prospectador consistente', 'Agrega 20 clientes al CRM',                20, 300, 90, 32, '⚡'),
('base',   'crm',         'Pipeline profesional',     'Agrega 50 clientes al CRM',                50, 750,225, 33, '💼'),
('base',   'crm',         'CRM Master',               'Agrega 100 clientes al CRM',              100,1500,450, 34, '🏆'),
-- ── Base: Streaks ─────────────────────────────────────────────
('base',   'streak',      'Una semana constante',     'Entra 7 días seguidos',                     7,  70, 20, 40, '🔥'),
('base',   'streak',      'Dos semanas de fuego',     'Entra 15 días seguidos',                   15, 150, 45, 41, '🔥'),
('base',   'streak',      'Un mes imparable',         'Entra 30 días seguidos',                   30, 300, 90, 42, '⚡'),
('base',   'streak',      'Máquina de disciplina',    'Entra 45 días seguidos',                   45, 450,135, 43, '💪'),
('base',   'streak',      'Leyenda de constancia',    'Entra 60 días seguidos',                   60, 600,180, 44, '👑'),
-- ── Base: Seguimientos ───────────────────────────────────────
('base',   'seguimiento', 'Primeros seguimientos',    'Completa 5 seguimientos',                   5,  50, 15, 50, '✅'),
('base',   'seguimiento', 'Seguimiento constante',    'Completa 10 seguimientos',                 10, 100, 30, 51, '📅'),
('base',   'seguimiento', 'Seguidor profesional',     'Completa 25 seguimientos',                 25, 250, 75, 52, '🎯'),
('base',   'seguimiento', 'Maestro del seguimiento',  'Completa 50 seguimientos',                 50, 500,150, 53, '💎')
ON CONFLICT DO NOTHING;

-- ══════════════════════════════════════════════════════════════
-- SEED: TIENDA
-- ══════════════════════════════════════════════════════════════
INSERT INTO public.store_items (nombre, descripcion, costo_coins, tipo, icono, orden) VALUES
('Lead Premium',             'Un lead calificado de alta conversión generado por el equipo',    500,  'lead_premium',       '⭐', 1),
('Lead Meta Ads',            'Lead generado por campañas activas de Facebook e Instagram',      300,  'lead_meta',          '📱', 2),
('Boost de publicación',     'Destaca una de tus propiedades por 7 días en el catálogo',       200,  'boost',              '🚀', 3),
('Plantilla profesional',    'Pack de plantillas de seguimiento y presentación de propiedades', 150,  'plantilla',          '📋', 4),
('Acceso prioritario 1 sem', 'Ver nuevas propiedades exclusivas antes que nadie por 1 semana', 800,  'acceso_prioritario', '🔑', 5),
('Entrada al sorteo',        'Participa en el sorteo mensual de la agencia con tu número',      50,   'sorteo',             '🎟️', 6),
('Comisión extra temporal',  'Bono de comisión adicional del 0.5% por tus próximas 2 semanas', 1500, 'comision_extra',     '💰', 7),
('Curso premium',            'Acceso a un módulo exclusivo de cierre de ventas avanzado',       400,  'curso_premium',      '🎓', 8),
('Merch Valera',             'Producto oficial de la marca (camiseta, taza o gorra)',           1000, 'merch',              '👕', 9)
ON CONFLICT DO NOTHING;
