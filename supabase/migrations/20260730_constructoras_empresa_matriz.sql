-- Agrega empresa_matriz a constructoras para agrupar desarrollos por desarrolladora.
-- Visible solo para admin/supervisor/asesor en la pantalla de constructoras.
ALTER TABLE public.constructoras
  ADD COLUMN IF NOT EXISTS empresa_matriz TEXT;

-- Atlas Desarrollos
UPDATE public.constructoras SET empresa_matriz = 'Atlas Desarrollos'
WHERE nombre IN ('ALBIA','ALLEZA MIRADOR','BELENA','DOZA EL MAYORAZGO, ZIBATA',
  'Mirador de Santiago','PASEO PITAHAYA, ZIBATA','SIRIONE','VARELLA MESETA','ATLAS');

-- Javer
UPDATE public.constructoras SET empresa_matriz = 'Javer'
WHERE nombre IN ('CUMBRE','CUMBRE ALTA','CUMBRE MEZQUITE','MARQUES DEL RIO',
  'MASSARO ZIBATA','PASEO SAN JUNIPERO','PRIVALIA AMBIENTA','VALVENTO');

-- Grupo CAISA
UPDATE public.constructoras SET empresa_matriz = 'Grupo CAISA'
WHERE nombre IN ('ALONDRA','AMAIA','Lago de Juriquilla','MELODIA',
  'NAZCA MUNAY','NAZCA NEA','SOPHIA DISTRITO');

-- Vialli Grupo Inmobiliario
UPDATE public.constructoras SET empresa_matriz = 'Vialli Grupo Inmobiliario'
WHERE nombre IN ('AMURALLE','SAMARE','TORRE DE PIEDRA BUGAMBILIA',
  'TORRE DE PIEDRA JACARANDAS','TORRE DE PIEDRA LA CARMINA','TORRE DE PIEDRA ZARU');

-- Urbana México
UPDATE public.constructoras SET empresa_matriz = 'Urbana México'
WHERE nombre IN ('AMAJ','ATIA JURIQUILLA','BARAKA','IMARHI','KENZA SONTERRA','ZELENI');

-- GP Vivienda
UPDATE public.constructoras SET empresa_matriz = 'GP Vivienda'
WHERE nombre IN ('Balkan Residencial','Nayenh Prive','Peninsula Park Living, Monterrey',
  'Santaluz Residencial','Valencia Residencial','Zevana Residencial');

-- Casas Riscos
UPDATE public.constructoras SET empresa_matriz = 'Casas Riscos'
WHERE nombre IN ('GRAND CUMBRE MIRADOR','RISCOS CONDESA','RISCOS INTERCITY',
  'RISCOS MIRADOR','RISCOS ZARU');

-- Ruba
UPDATE public.constructoras SET empresa_matriz = 'Ruba'
WHERE nombre IN ('AUREA IOLITA','BRIANZZAS','CASTELLO MESETA','SENDAI','TOSSA');

-- Casas Ponty
UPDATE public.constructoras SET empresa_matriz = 'Casas Ponty'
WHERE nombre IN ('Villa Carriedo','Villa Magna Residencial',
  'Villas del Refugio','Villas del Refugio Nogales');

-- SLO Desarrollos (Xanadú)
UPDATE public.constructoras SET empresa_matriz = 'SLO Desarrollos'
WHERE nombre IN ('Xanadu Corregidora','Xanadu Zakia','Xanadu Zibata');

-- Procesa Desarrollos
UPDATE public.constructoras SET empresa_matriz = 'Procesa Desarrollos'
WHERE nombre IN ('Ibiza Residencial','Lake Cañadas Tower Juriquilla',
  'LOMAS TOWERS JURIQUILLA','Nuevo Zikura');

-- Imperio Construye
UPDATE public.constructoras SET empresa_matriz = 'Imperio Construye'
WHERE nombre IN ('Los Robles Juriquilla','Los Robles Zibatá','Los Robles Zire');

-- Grupo Vinte
UPDATE public.constructoras SET empresa_matriz = 'Grupo Vinte'
WHERE nombre IN ('LA VISTA RESIDENCIAL','REAL SOLARE');

-- DMI Desarrollos
UPDATE public.constructoras SET empresa_matriz = 'DMI Desarrollos'
WHERE nombre IN ('La Espiga','Valles Campanario');

-- Investti
UPDATE public.constructoras SET empresa_matriz = 'Investti'
WHERE nombre IN ('Cañadas del Lago I Corregidora','La Porta I, Los Arcos','La Porta II, Loma Dorada');

-- Casas Platino
UPDATE public.constructoras SET empresa_matriz = 'Casas Platino'
WHERE nombre IN ('Aurora Residencial','Campello','XIMHAI ZIBATA');

-- QroCasa
UPDATE public.constructoras SET empresa_matriz = 'QroCasa'
WHERE nombre IN ('Fuerte Santiago','Fuerte Sofia');

-- Grupo Vasco Urbania
UPDATE public.constructoras SET empresa_matriz = 'Grupo Vasco Urbania'
WHERE nombre IN ('Monte Himalaya','Vitea Gardens');

-- Resto con empresa propia o menos desarrollos
UPDATE public.constructoras SET empresa_matriz = 'Grupo Sadasi'       WHERE nombre = 'SENDAS RESIDENCIAL';
UPDATE public.constructoras SET empresa_matriz = 'Grupo Altozano'     WHERE nombre = 'Niebla Altozano';
UPDATE public.constructoras SET empresa_matriz = 'Abilia'             WHERE nombre = 'Latitud La Victoria';
UPDATE public.constructoras SET empresa_matriz = 'Adama'              WHERE nombre = 'Terranto Milenio III';
UPDATE public.constructoras SET empresa_matriz = 'DEVARANA'           WHERE nombre = 'Royal View, Zibata';
UPDATE public.constructoras SET empresa_matriz = 'Wolstrat'           WHERE nombre = 'ZOUL';
UPDATE public.constructoras SET empresa_matriz = 'Tres Marías'        WHERE nombre = 'TORRES PANORAMA';
UPDATE public.constructoras SET empresa_matriz = 'Arpada'             WHERE nombre = 'CIMA TOWERS';
UPDATE public.constructoras SET empresa_matriz = 'Macazaga Desarrollos' WHERE nombre = 'San Calixto Residencial, La Vista';
UPDATE public.constructoras SET empresa_matriz = 'Almena Inmobiliaria' WHERE nombre = 'KERENDA';
UPDATE public.constructoras SET empresa_matriz = 'Casas Acrópolis'    WHERE nombre = 'Mykonos Residencial';
UPDATE public.constructoras SET empresa_matriz = 'Conecto Desarrollos' WHERE nombre = 'IKAYA';
UPDATE public.constructoras SET empresa_matriz = 'Casas Trio'         WHERE nombre = 'Las Haciendas';
UPDATE public.constructoras SET empresa_matriz = 'Casas Carpín'       WHERE nombre = 'Gran Valle';
UPDATE public.constructoras SET empresa_matriz = 'Altta Homes'        WHERE nombre = 'Acento Residencial';
UPDATE public.constructoras SET empresa_matriz = 'Aspen Bajío'        WHERE nombre = 'MANAHAL';
UPDATE public.constructoras SET empresa_matriz = 'The Grand Living'   WHERE nombre = 'The Grand Living, Juriquilla';
UPDATE public.constructoras SET empresa_matriz = 'Desarrollos Proyecta' WHERE nombre = 'LUCASTA';
UPDATE public.constructoras SET empresa_matriz = 'Altos del Marqués'  WHERE nombre = 'VIRREY DE CATALUÑA';
UPDATE public.constructoras SET empresa_matriz = 'Inmobiliaria Cordillera' WHERE nombre = 'Villas La Joya';
UPDATE public.constructoras SET empresa_matriz = 'Grupo Vasco Urbania' WHERE nombre = 'Vitea Gardens';

-- Ciudad Marques va en Ruba
UPDATE public.constructoras SET empresa_matriz = 'Ruba' WHERE nombre = 'CIUDAD MARQUES';

-- Los que quedaron sin empresa_matriz conocida: empresa_matriz = su propio nombre
-- (cada uno aparece como su propio grupo, sin caer en "Otros")
UPDATE public.constructoras SET empresa_matriz = nombre WHERE empresa_matriz IS NULL;

NOTIFY pgrst, 'reload schema';
