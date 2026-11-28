-- CUENTAS DE INMOBILIARIA ALIADA · Tanda de correcciones.
--
-- Cinco pendientes que salieron de usar la cuenta de verdad:
--   1. Agregar propiedades — ya lo dejaba la RLS de 20261127_aliados_4, solo
--      faltaba la pantalla (no es cosa de esta migración).
--   2. El titular administra a su gente — ya podía invitarlos
--      (20261128b_aliado_titular); faltaba poder renombrarlos y darlos de
--      baja. Eso es lo que agrega esta migración.
--   3. El catálogo redirigía a una ficha que no le toca ver a un aliado — es
--      bug de ruteo en el cliente, no de la base.
--   4. Las estadísticas eran una fila pelona de números — es estilo, no base.
--   5. Los clientes: el titular NO veía los de su equipo (clientes_select
--      solo deja ver lo propio), y pidieron además un "CRM de asesores" como
--      el que ya tiene un gerente sobre su equipo. Eso sí es de aquí.

-- -- 1. El titular ve (de solo lectura) los clientes de TODA su agencia -------
-- Mismo patrón que gerente_select_clientes, pero acotado a SU organización en
-- vez de a todo el equipo. Sin esto, calcularCrmMetricas() le devuelve vacío
-- en cuanto se le pide algo que no sea su propio responsable_id.
DROP POLICY IF EXISTS clientes_select_aliado_titular ON public.clientes;
CREATE POLICY clientes_select_aliado_titular ON public.clientes
  FOR SELECT TO authenticated
  USING (
    public.es_aliado_admin()
    AND EXISTS (
      SELECT 1 FROM public.profiles p
       WHERE p.id = clientes.responsable_id AND p.inmobiliaria_id = public.mi_inmobiliaria()
    )
  );

-- -- 2. El titular renombra a su gente -----------------------------------------
-- Cambiar el NOMBRE de otro perfil no es cosa de RLS (eso decide filas, no
-- columnas) ni de un GRANT column-level (ahí no hay forma de decir "solo si
-- es de tu misma agencia"): se resuelve con una función SECURITY DEFINER que
-- hace la comprobación a mano.
CREATE OR REPLACE FUNCTION public.renombrar_miembro_aliado(p_id uuid, p_nombre text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.es_aliado_admin() THEN
    RAISE EXCEPTION 'Solo el titular puede renombrar a su gente';
  END IF;
  IF trim(coalesce(p_nombre, '')) = '' THEN
    RAISE EXCEPTION 'El nombre no puede quedar vacío';
  END IF;
  UPDATE public.profiles
     SET nombre = trim(p_nombre)
   WHERE id = p_id AND inmobiliaria_id = public.mi_inmobiliaria();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Ese usuario no es de tu inmobiliaria';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.renombrar_miembro_aliado(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.renombrar_miembro_aliado(uuid, text) TO authenticated;

SELECT pg_notify('pgrst', 'reload schema');

-- REVERTIR
--   drop function public.renombrar_miembro_aliado(uuid, text);
--   drop policy clientes_select_aliado_titular on public.clientes;
