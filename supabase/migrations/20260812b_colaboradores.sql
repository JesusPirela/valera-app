-- Colaboradores: tracker de inmobiliarias externas cuyo catálogo se importa a
-- Valera desde EasyBroker/portales (antes vivía en un Google Sheet "Colaboradores
-- Oficial"). Import único de esa hoja como carga inicial; de aquí en adelante se
-- administra desde el panel admin.

CREATE TABLE IF NOT EXISTS public.colaboradores (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nombre               text NOT NULL,
  contacto             text,
  link                 text,
  estado_subida        text,  -- motivo si NO se sube el catálogo (ej. "NO SE SUBE PORQUE...")
  fecha_actualizacion  text,  -- texto libre: el sheet mezclaba fechas y notas ("9 de marzo", "No tiene propiedades xd")
  ultima_casa_subida   text,
  en_app               text,  -- 'SI' / 'PENDIENTE' / null
  marca                text,  -- columna sin nombre del sheet ("Columna 1", valores "i" sueltos) ⚠️ significado no verificado
  notas                text,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.colaboradores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS colaboradores_admin ON public.colaboradores;
CREATE POLICY colaboradores_admin ON public.colaboradores FOR ALL
  USING     (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','supervisor')))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role IN ('admin','supervisor')));

-- ── Carga inicial desde el Google Sheet "Colaboradores Oficial" ─────────────
INSERT INTO public.colaboradores (nombre, contacto, link, estado_subida, fecha_actualizacion, ultima_casa_subida, en_app, marca, notas) VALUES
('Maroko', '4422498690', 'https://www.easybroker.com/agent/agencies/maroko-inmobiliaria', 'NO SE SUBE PORQUE AUN NO NOS AUTORIZAN', NULL, NULL, NULL, NULL, 'sesiones pendientes'),
('GRUPO VILLANUEVA', '4427077242', 'https://www.easybroker.com/agent/agencies/grupo-villanueva-real-estate', NULL, NULL, NULL, 'SI', NULL, 'KIVA'),
('GRUPO PROFESIONAL INMOBILIARIO', '4422021701', 'https://www.easybroker.com/agent/agencies/grupo-profesional-inmobiliario-b3f47e00-f8ad-4291-b93d-19cd04e22967', NULL, NULL, NULL, 'SI', 'i', 'HIR CASA'),
('LAURA MORENO', '4461001158', 'https://www.easybroker.com/agent/agencies/lm-real-estate', NULL, '14/07/2026', NULL, 'SI', 'i', 'DESARROLLO SAN MIGUEL DE ALLENDE Q SAQUE'),
('SPAZIO VITALE', '4422501038', 'https://www.easybroker.com/agent/agencies/spazio-vitale', NULL, '14/07/2026', NULL, 'SI', 'i', 'DESARROLLO DE PACHUCA Y PROX CAMPANARIO QUE SAQUE'),
('CASTERS INMOBILIARIA(HALINKA)', NULL, NULL, 'NO SE SUBE', NULL, NULL, NULL, NULL, 'XENTRIC CON LUIS'),
('JMGROUP', '4423538886', 'https://www.easybroker.com/agent/agencies/jm-group-real-estate', NULL, '14/07/2026', NULL, 'SI', 'i', 'INMOBILIARIA DE CARLOS MUÑOZ con el pana joven'),
('TOP BROKERS', '442 258 8973', 'https://www.easybroker.com/agent/agencies/top-brokers-network', NULL, NULL, NULL, 'SI', 'i', NULL),
('VIVENDO', '4423803680', 'https://www.easybroker.com/agent/agencies/vivendo-inmobiliaria', NULL, NULL, NULL, 'SI', NULL, NULL),
('VIVENQUERETARO', '442148548', 'https://www.easybroker.com/agent/agencies/viveenqro-inmobiliaria', NULL, NULL, NULL, 'SI', 'i', NULL),
('EDUARDO BULTRON REMAX', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('remax infinity (en teoria no tenemos autorizacion)', NULL, NULL, 'NO SE SUBE', NULL, NULL, NULL, NULL, NULL),
('TRATO HECHO', 'Desaparecidos', 'https://www.easybroker.com/agent/agencies/trato-hecho-3b120478-c94a-4e55-b4df-f483ffe1a501', NULL, NULL, NULL, 'SI', NULL, NULL),
('dream house', '4461479532', 'https://www.easybroker.com/agent/agencies/inmobiliaria-de-dream-house', NULL, NULL, NULL, 'SI', NULL, NULL),
('BRIGO', '4423783911', 'https://www.easybroker.com/agent/agencies/brigo-inmobiliaria-92c943bd-9e81-4c48-a597-c18b5a774303', NULL, NULL, NULL, 'SI', 'i', NULL),
('CONNIE GARDEA Real Estate', '52 1 33 2833 7449', 'https://www.easybroker.com/agent/agencies/connie-gardea-real-estate', NULL, NULL, NULL, 'SI', NULL, NULL),
('TERRAFIRME', '4424562510', 'https://www.easybroker.com/agent/agencies/terra-firme-grupo-inmobiliario', NULL, NULL, NULL, 'SI', NULL, NULL),
('MARZA BIENES RAICES', '4421364103', 'https://www.easybroker.com/agent/agencies/marza-bienes-raices', NULL, NULL, NULL, NULL, NULL, NULL),
('RC INMUEBLES', 'MIREYA', NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('KELLER WILLIAMS KW', '4422194280', 'https://www.easybroker.com/agent/agencies/kw-central-queretaro', 'NO SE SUBE', NULL, NULL, NULL, NULL, NULL),
('SOY JORGE TU ASESOR', '4421305130', 'https://www.easybroker.com/agent/agencies/soy-jorge-tu-asesor', NULL, NULL, NULL, 'SI', 'i', NULL),
('MARTHA OLGUIN', '4421603971', 'https://www.easybroker.com/agent/agencies/jop-servicios-inmobiliarios', NULL, '11/06/2026', NULL, 'SI', NULL, NULL),
('GM INMOBILIARIA', '4421817352', 'https://gminmobiliariaqro.com/listings/propiedades-queretaro/', NULL, NULL, NULL, 'SI', NULL, NULL),
('coldwell banker', '4422206324', 'https://www.easybroker.com/agent/agencies/coldwell-banker-centro-queretaro', 'NO SE SUBE', NULL, NULL, NULL, NULL, NULL),
('ML 2', '4422718594', 'https://www.easybroker.com/agent/agencies/ml2-bienes-raices', NULL, '16/06/2026', NULL, 'SI', 'i', NULL),
('KUVER', '525541303621', 'https://www.easybroker.com/agent/agencies/kuver-bienesraices', NULL, NULL, NULL, 'SI', NULL, NULL),
('DINORA', '4426633666', 'https://www.easybroker.com/agent/agencies/profesional-en-bienes-raices', NULL, '19/06/2026', NULL, 'SI', NULL, NULL),
('ANDRES SEGURA', '4423597744', 'https://www.easybroker.com/agent/agencies/as-propiedades-premium', NULL, '19/06/2026', NULL, 'SI', 'i', NULL),
('7R', '5564436030', 'https://www.easybroker.com/agent/agencies/7r-real-estate', NULL, '19/06/2026', NULL, 'SI', 'i', NULL),
('TENGO LA LLAVE', '4423432114', 'https://www.easybroker.com/agent/agencies/tengo-la-llave', NULL, '19/06/2026', NULL, 'SI', NULL, NULL),
('VIVENZA', '4429800629', 'https://www.easybroker.com/agent/agencies/vivenza-inmobiliaria-53c0ebd7-e4d5-49a2-a71c-d3e8175121fb', NULL, '19/06/2026', NULL, 'SI', NULL, NULL),
('ADRIAN VERDI', '4423861875', 'https://www.easybroker.com/agent/agencies/inmobiliaria-de-luis-adrian-verdi-pacheco', NULL, 'No tiene propiedades xd', NULL, 'SI', NULL, NULL),
('TORY REALTOR', '4426696987', 'https://www.tory-realtor.com', NULL, '19/06/2026', NULL, 'SI', 'i', NULL),
('CARVI', '4425717327', 'https://www.easybroker.com/agent/agencies/carvi-bienes-raices', NULL, '19/06/2026', NULL, NULL, 'i', NULL),
('VERDE OLIVO', NULL, 'https://www.easybroker.com/agent/agencies/verde-olivo-inmuebles', NULL, NULL, NULL, NULL, NULL, NULL),
('DREAM TEAM BY KW', NULL, 'https://www.easybroker.com/agent/agencies/inmobiliaria-dream-team-kw-central-queretaro', 'No los encuentro', NULL, NULL, NULL, NULL, NULL),
('MARIFER QUIJANO', NULL, 'https://www.easybroker.com/agent/agencies/09a22908-ccc9-4f40-9bd1-5babf86599e6', NULL, NULL, NULL, 'PENDIENTE', NULL, NULL),
('ZOYLA DE AQI', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('SAKURA INMUEBLES', NULL, NULL, NULL, NULL, NULL, NULL, NULL, NULL),
('GIBA BY CENTURY21', NULL, 'https://www.easybroker.com/agent/agencies/inmobiliaria-de-century-21-giba', NULL, '22/06/2026', NULL, 'SI', NULL, NULL),
('realty dreams', NULL, 'https://www.realtydreamsmexico.com/', NULL, '22/06/2026', NULL, 'SI', NULL, NULL),
('MAKTUB8', NULL, 'EN PROCESO', NULL, NULL, NULL, NULL, NULL, NULL),
('MARGARITA TRUJILLO', NULL, 'https://www.inmueblesq.com/propiedades/   Y TAMBIEN EN INMOBAY INMUBLES QUERETARO SE LLAMA', NULL, '9 de marzo', NULL, NULL, NULL, NULL),
('MKL', NULL, 'https://www.easybroker.com/agent/agencies/mkl-inmobiliaria', NULL, '23/06/2026', NULL, 'SI', NULL, NULL),
('BETTER CALL RAUL / RAWEN', NULL, 'https://www.easybroker.com/agent/agencies/rawen-inmobiliaria', NULL, '24/06/2026', NULL, 'SI', NULL, NULL),
('TUHABI', NULL, 'CON ALEXIS', NULL, '24/06/2026', NULL, 'SI', NULL, NULL),
('GTF', NULL, 'Grupo de wasap', NULL, NULL, NULL, 'SI', NULL, NULL),
('Jacobo asesor', NULL, '5242 422 777 1 41  EN SU PERFIL ESTA EL CATALOGO', NULL, '24/06/2026', NULL, 'SI', NULL, NULL),
('Inmobiliaria de Diagnóstico Inmobiliario', NULL, 'https://www.easybroker.com/agent/agencies/371dc7e0-7a7c-41d6-a19d-cc7199a8a5ff', NULL, '25/06/2026', NULL, 'SI', NULL, NULL),
('REVAL REAL ESTATE', NULL, 'https://www.revalmx.com/', NULL, NULL, NULL, 'SI', NULL, NULL),
('SUMA BIENES RAICES', NULL, 'link en inmobay', NULL, '25/06/2026', NULL, 'SI', NULL, NULL),
('OTILIOS INMOBILIARIA', '446 120 3137', 'https://www.lamudi.com.mx/inmobiliaria/41032-73-c5a4e38878e6-b198-7675a388-8def-4cbe', NULL, '26/06/2026', NULL, 'SI', NULL, NULL),
('VARIANT', NULL, 'https://www.easybroker.com/agent/agencies/variant-realty', NULL, '26/06/2026', NULL, 'SI', NULL, NULL),
('ABR', NULL, 'https://www.easybroker.com/agent/agencies/abr-inmuebles', NULL, NULL, NULL, NULL, NULL, NULL),
('Cuarenta38', NULL, 'https://www.easybroker.com/agent/agencies/cuarenta38', NULL, '29/06/2026', NULL, 'SI', NULL, NULL),
('Kazen', NULL, 'https://www.easybroker.com/agent/agencies/kazen', NULL, '29/06/2026', NULL, 'SI', NULL, NULL),
('Bridgewell', NULL, 'https://www.easybroker.com/agent/agencies/bridgewell-home-mexico', NULL, NULL, NULL, 'PENDIENTE', NULL, NULL);

SELECT pg_notify('pgrst', 'reload schema');
