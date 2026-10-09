-- Deja que cada quien lea el detalle de SUS propios leads de campaña.
--
-- leads_campania.extra guarda todas las respuestas del formulario de Facebook
-- —presupuesto, zona, recámaras y lo que el anuncio haya preguntado—, pero la
-- única política existente la restringe a admin y supervisor. El resultado es
-- que el prospectador, que es el dueño del lead y quien va a llamarle, no
-- podía ver lo que la persona contestó.
--
-- Alcance mínimo: solo SELECT, y solo de las filas cuyo cliente tiene a quien
-- consulta como responsable. No se toca la política de admin y supervisor, que
-- sigue dándoles acceso completo.
DROP POLICY IF EXISTS "leads_campania_propios" ON public.leads_campania;

CREATE POLICY "leads_campania_propios" ON public.leads_campania
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.clientes c
       WHERE c.id = leads_campania.cliente_id
         AND c.responsable_id = auth.uid()
    )
  );
