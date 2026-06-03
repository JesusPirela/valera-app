-- Tabla de configuración de app (clave-valor JSON)
CREATE TABLE IF NOT EXISTS public.app_config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

ALTER TABLE public.app_config ENABLE ROW LEVEL SECURITY;

-- Admins pueden leer y escribir; usuarios autenticados solo leer
DROP POLICY IF EXISTS "app_config_read" ON public.app_config;
CREATE POLICY "app_config_read" ON public.app_config
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "app_config_admin_write" ON public.app_config;
CREATE POLICY "app_config_admin_write" ON public.app_config
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin'));

-- Configuración editable de la ruleta/cofre por los admins
INSERT INTO public.app_config (key, value)
VALUES (
  'ruleta_config',
  '{"costo":100,"premios":[
    {"id":"sorteo",    "nombre":"Entrada sorteo", "icono":"🎟️","tipo":"sorteo",        "prob_cofre":30,  "prob_milestone":35},
    {"id":"plantilla", "nombre":"Pack plantillas","icono":"📋", "tipo":"plantilla",      "prob_cofre":22,  "prob_milestone":25},
    {"id":"boost",     "nombre":"Boost 3 días",   "icono":"🚀", "tipo":"boost",          "prob_cofre":18,  "prob_milestone":20},
    {"id":"lead_meta", "nombre":"Lead Meta Ads",  "icono":"📱", "tipo":"lead_meta",      "prob_cofre":13,  "prob_milestone":12},
    {"id":"curso",     "nombre":"Acceso curso",   "icono":"🎓", "tipo":"curso_premium",  "prob_cofre":10,  "prob_milestone":6},
    {"id":"lead_prem", "nombre":"Lead Premium",   "icono":"⭐", "tipo":"lead_premium",   "prob_cofre":5,   "prob_milestone":1.5},
    {"id":"merch",     "nombre":"Merch Valera",   "icono":"👕", "tipo":"merch",          "prob_cofre":1.5, "prob_milestone":0.4},
    {"id":"comision",  "nombre":"Comisión extra",  "icono":"💰", "tipo":"comision_extra", "prob_cofre":0.5, "prob_milestone":0.1}
  ]}'
)
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
