-- Reverso de 20261008130000_mis_cuotas.sql.
--
-- La función es nueva y no la usa nada de la base: se borra. El portal de
-- esta ronda la llama desde app/(residente)/mi/[unidadId]/layout.tsx y, si
-- no está, sigue funcionando: las unidades que paga el inquilino vuelven a
-- decir "Debe" / "Al día" sin el número de cuotas (lib/residente/cuotas.ts
-- trata el error como "sin dato").

begin;

drop function if exists public.mis_cuotas();

commit;

-- Verificación:
--   select count(*) from pg_proc where proname = 'mis_cuotas';
--   -- Esperado: 0
