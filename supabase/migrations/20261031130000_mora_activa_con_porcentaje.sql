-- La mora no se puede encender con 0 % (ronda 11, A).
--
-- Aplicada en vecitap-pruebas el 31-oct. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo. No depende de otras migraciones (la
-- columna `edificios.mora_activa` viene de esquema_inicial.sql). Rollback:
-- supabase/rollbacks/20261031130000_mora_activa_con_porcentaje_rollback.sql.
--
-- POR QUÉ
-- `edificios.mora_activa` no la escribía nadie: ni la app ni ninguna función
-- (en main, admin.html tampoco). cerrar_periodo() y, desde la ronda 8,
-- simular_cierre() solo cobran mora con `mora_activa` Y `interes_mora > 0`, así
-- que un edificio con porcentaje cargado nunca cobraba mora, sin aviso. La
-- ronda 11 agrega en Ajustes el interruptor «Cobrar mora» (código, no base).
--
-- QUÉ CAMBIA (solo esto):
-- · CHECK `edificios_mora_con_porcentaje`: `not mora_activa or interes_mora > 0`.
--   Encender la mora con 0 % no tiene sentido (no cobra nada y la pantalla diría
--   que está encendida); la base lo rechaza aunque alguien se salte la pantalla.
--
-- Lo que NO cambia:
-- · Quién puede escribir `mora_activa`: la misma política que `interes_mora`
--   (`edificios_escribir`: puede_operar(org_id), para toda la fila) y el mismo
--   UPDATE de columna para authenticated. Comprobado el 31-oct en las dos bases.
-- · La auditoría: el trigger `aud_edificios` (registrar_auditoria) ya guarda la
--   fila entera antes y después, con auth.uid() y la hora.
-- · Hoy ningún edificio tiene `mora_activa` (pruebas: 0 de 11; producción: 0
--   de 3): la restricción entra sin tocar datos. La guarda lo comprueba igual.

begin;

do $guarda$
declare n int;
begin
  if exists (select 1 from pg_constraint
              where conrelid = 'public.edificios'::regclass and conname = 'edificios_mora_con_porcentaje') then
    raise exception 'ABORTADA: edificios_mora_con_porcentaje ya existe';
  end if;
  if not exists (select 1 from information_schema.columns
                  where table_schema = 'public' and table_name = 'edificios' and column_name = 'mora_activa') then
    raise exception 'ABORTADA: edificios.mora_activa no existe';
  end if;
  select count(*) into n from edificios where mora_activa and not coalesce(interes_mora, 0) > 0;
  if n > 0 then
    raise exception 'ABORTADA: hay % edificio(s) con la mora activa y 0 %%: corregirlos antes', n;
  end if;
end
$guarda$;

alter table public.edificios
  add constraint edificios_mora_con_porcentaje check (not mora_activa or interes_mora > 0);

comment on constraint edificios_mora_con_porcentaje on public.edificios is
  'Ronda 11 (A): la mora solo se enciende con un porcentaje mayor que 0.';

do $despues$
begin
  if (select pg_get_constraintdef(oid) from pg_constraint
       where conrelid = 'public.edificios'::regclass and conname = 'edificios_mora_con_porcentaje')
     is distinct from 'CHECK (((NOT mora_activa) OR (interes_mora > (0)::numeric)))' then
    raise exception 'ABORTADA: la restricción no quedó como se esperaba';
  end if;
end
$despues$;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. select pg_get_constraintdef(oid) from pg_constraint where conname = 'edificios_mora_con_porcentaje';
--    -- Esperado: CHECK (((NOT mora_activa) OR (interes_mora > (0)::numeric)))
-- 2. Como la administradora del edificio (sub en request.jwt.claims, role
--    authenticated), dentro de una transacción que se deshace:
--      update edificios set mora_activa = true, interes_mora = 0 where id = '<edificio>';
--    -- Esperado: violates check constraint "edificios_mora_con_porcentaje".
--      update edificios set mora_activa = true, interes_mora = 1 where id = '<edificio>';
--    -- Esperado: 1 fila, y en auditoria una fila 'update' con
--    --   antes->>'mora_activa' = 'false', despues->>'mora_activa' = 'true' y su usuario_id.
-- 3. La misma escritura como una administradora de OTRA organización → 0 filas (RLS).
-- 4. Con la mora al 1 % en Edificio Gustavo, simular_cierre(Mayo 2027): 10C mora 9,50;
--    08D mora 1,55.
