-- #2 Ubicación estructurada: columna `estado_mx` en propiedades, mantenida sola.
--
-- Contexto: la columna `estado` en realidad guarda el STATUS (disponible/vendida)
-- y la ubicación real vive en `zona` como texto libre ("queretaro", "Cancun",
-- "Coahuila", null). Para tener el ESTADO de México de forma confiable y poder
-- filtrar del lado del servidor, se agrega `estado_mx`, que un trigger llena a
-- partir de zona+dirección+título usando la MISMA lógica que lib/estados-mexico.ts.
-- No se toca ninguna columna existente (cambio 100% aditivo).

-- 1) Detección de estado desde texto libre (puerto de lib/estados-mexico.ts).
--    Normaliza (minúsculas, sin acentos) y devuelve el primer estado cuyo alias
--    aparezca; Querétaro va primero para que su inventario (la mayoría) gane.
CREATE OR REPLACE FUNCTION public.detectar_estado_mx(txt text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path = public
AS $$
  WITH base AS (
    SELECT ' ' || translate(lower(coalesce(txt, '')), 'áéíóúñü', 'aeiounu') || ' ' AS s
  ),
  pares(ord, estado, variante) AS (VALUES
    (1,'Querétaro','queretaro'),(2,'Querétaro','qro'),(3,'Querétaro','el marques'),(4,'Querétaro','corregidora'),(5,'Querétaro','san juan del rio'),(6,'Querétaro','tequisquiapan'),
    (7,'Nuevo León','nuevo leon'),(8,'Nuevo León','monterrey'),(9,'Nuevo León','san pedro garza'),(10,'Nuevo León','apodaca'),(11,'Nuevo León','guadalupe n'),(12,'Nuevo León','santa catarina'),(13,'Nuevo León','garcia n.l'),
    (14,'Jalisco','jalisco'),(15,'Jalisco','guadalajara'),(16,'Jalisco','zapopan'),(17,'Jalisco','tlaquepaque'),(18,'Jalisco','tonala'),(19,'Jalisco','puerto vallarta'),
    (20,'Ciudad de México','ciudad de mexico'),(21,'Ciudad de México','cdmx'),(22,'Ciudad de México','distrito federal'),(23,'Ciudad de México',' df '),
    (26,'Estado de México','estado de mexico'),(27,'Estado de México','edomex'),(28,'Estado de México','toluca'),(29,'Estado de México','naucalpan'),(30,'Estado de México','tlalnepantla'),(31,'Estado de México','ecatepec'),(32,'Estado de México','metepec'),(33,'Estado de México','huixquilucan'),
    (34,'Puebla','puebla'),(35,'Puebla','cholula'),(36,'Puebla','atlixco'),
    (37,'Guanajuato','guanajuato'),(38,'Guanajuato','leon, gto'),(39,'Guanajuato','leon gto'),(40,'Guanajuato','irapuato'),(41,'Guanajuato','celaya'),(42,'Guanajuato','salamanca gto'),(43,'Guanajuato','san miguel de allende'),
    (44,'Aguascalientes','aguascalientes'),
    (45,'Baja California Sur','baja california sur'),(46,'Baja California Sur','los cabos'),(47,'Baja California Sur','la paz, b'),(48,'Baja California Sur','cabo san lucas'),(49,'Baja California Sur','san jose del cabo'),
    (50,'Baja California','baja california'),(51,'Baja California','tijuana'),(52,'Baja California','mexicali'),(53,'Baja California','ensenada'),(54,'Baja California','rosarito'),
    (55,'Campeche','campeche'),
    (56,'Chiapas','chiapas'),(57,'Chiapas','tuxtla'),(58,'Chiapas','san cristobal de las casas'),
    (59,'Chihuahua','chihuahua'),(60,'Chihuahua','ciudad juarez'),(61,'Chihuahua','cd juarez'),
    (62,'Coahuila','coahuila'),(63,'Coahuila','saltillo'),(64,'Coahuila','torreon'),(65,'Coahuila','monclova'),(66,'Coahuila','piedras negras'),(67,'Coahuila','ramos arizpe'),
    (68,'Colima','colima'),(69,'Colima','manzanillo'),
    (70,'Durango','durango'),
    (71,'Guerrero','guerrero'),(72,'Guerrero','acapulco'),(73,'Guerrero','chilpancingo'),(74,'Guerrero','zihuatanejo'),(75,'Guerrero','ixtapa'),
    (76,'Hidalgo','hidalgo'),(77,'Hidalgo','pachuca'),(78,'Hidalgo','tulancingo'),(79,'Hidalgo','tizayuca'),
    (80,'Michoacán','michoacan'),(81,'Michoacán','morelia'),(82,'Michoacán','uruapan'),(83,'Michoacán','zamora mich'),
    (84,'Morelos','morelos'),(85,'Morelos','cuernavaca'),(86,'Morelos','jiutepec'),(87,'Morelos','temixco'),
    (88,'Nayarit','nayarit'),(89,'Nayarit','tepic'),(90,'Nayarit','nuevo vallarta'),(91,'Nayarit','bahia de banderas'),
    (92,'Oaxaca','oaxaca'),(93,'Oaxaca','huatulco'),(94,'Oaxaca','puerto escondido'),
    (95,'Quintana Roo','quintana roo'),(96,'Quintana Roo','cancun'),(97,'Quintana Roo','playa del carmen'),(98,'Quintana Roo','tulum'),(99,'Quintana Roo','cozumel'),(100,'Quintana Roo','riviera maya'),
    (101,'San Luis Potosí','san luis potosi'),(102,'San Luis Potosí','s.l.p'),(103,'San Luis Potosí',' slp'),
    (104,'Sinaloa','sinaloa'),(105,'Sinaloa','culiacan'),(106,'Sinaloa','mazatlan'),(107,'Sinaloa','los mochis'),
    (108,'Sonora','sonora'),(109,'Sonora','hermosillo'),(110,'Sonora','ciudad obregon'),(111,'Sonora','nogales'),(112,'Sonora','san carlos son'),
    (113,'Tabasco','tabasco'),(114,'Tabasco','villahermosa'),
    (115,'Tamaulipas','tamaulipas'),(116,'Tamaulipas','tampico'),(117,'Tamaulipas','reynosa'),(118,'Tamaulipas','matamoros'),(119,'Tamaulipas','nuevo laredo'),(120,'Tamaulipas','ciudad victoria'),
    (121,'Tlaxcala','tlaxcala'),(122,'Tlaxcala','apizaco'),
    (123,'Veracruz','veracruz'),(124,'Veracruz','xalapa'),(125,'Veracruz','jalapa'),(126,'Veracruz','boca del rio'),(127,'Veracruz','coatzacoalcos'),(128,'Veracruz','cordoba, ver'),(129,'Veracruz','orizaba'),
    (130,'Yucatán','yucatan'),(131,'Yucatán','merida'),(132,'Yucatán','progreso yuc'),
    (133,'Zacatecas','zacatecas'),(134,'Zacatecas','fresnillo')
  )
  SELECT p.estado
  FROM pares p, base
  WHERE position(p.variante IN base.s) > 0
  ORDER BY p.ord
  LIMIT 1;
$$;

-- 2) Columna nueva (aditiva). Guarda el estado detectado, con default Querétaro
--    cuando no se reconoce nada (mismo criterio que estadoDePropiedad en la app).
ALTER TABLE public.propiedades ADD COLUMN IF NOT EXISTS estado_mx text;

-- 3) Trigger: mantiene estado_mx al día en cada INSERT/UPDATE, sin depender de
--    que la app lo escriba.
CREATE OR REPLACE FUNCTION public.fn_set_estado_mx()
RETURNS trigger LANGUAGE plpgsql SET search_path = public AS $$
BEGIN
  NEW.estado_mx := COALESCE(
    detectar_estado_mx(concat_ws(' ', NEW.zona, NEW.direccion, NEW.titulo)),
    'Querétaro'
  );
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS tr_set_estado_mx ON public.propiedades;
CREATE TRIGGER tr_set_estado_mx
  BEFORE INSERT OR UPDATE OF zona, direccion, titulo ON public.propiedades
  FOR EACH ROW EXECUTE FUNCTION public.fn_set_estado_mx();

-- 4) Backfill de lo existente.
UPDATE public.propiedades
SET estado_mx = COALESCE(detectar_estado_mx(concat_ws(' ', zona, direccion, titulo)), 'Querétaro')
WHERE estado_mx IS DISTINCT FROM COALESCE(detectar_estado_mx(concat_ws(' ', zona, direccion, titulo)), 'Querétaro');

-- 5) Índice para filtrar por estado del lado del servidor.
CREATE INDEX IF NOT EXISTS idx_propiedades_estado_mx ON public.propiedades (estado_mx);
