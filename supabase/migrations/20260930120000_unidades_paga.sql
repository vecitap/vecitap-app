-- Propietarios con varias unidades, fase 1: "¿quién paga el condominio?"
-- por unidad.
--
-- SIN APLICAR. Agrega una columna a `unidades`, dos disparadores y
-- recrea `mis_unidades()` (SECURITY DEFINER). La revisa y la aplica Nicolás:
-- primero en vecitap-pruebas, después en vecitap-produccion, con respaldo
-- previo (docs/respaldo.md).
--
-- Base: el `pg_get_functiondef` / `pg_policies` que Nicolás sacó de las DOS
-- bases el 30-sep. Coinciden entre sí y con `esquema_inicial.sql` en todo lo
-- que toca esta migración.
--
-- ─────────────────────────────────────────────────────────────────────────
-- QUÉ HACE
-- ─────────────────────────────────────────────────────────────────────────
--   1. `unidades.paga` ('propietario' | 'inquilino'), por omisión
--      'propietario'. Las unidades existentes quedan en 'propietario', que es
--      lo que pasa hoy de hecho.
--   2. Guarda B (en `unidades`): no se puede poner paga = 'inquilino' si la
--      unidad no tiene un inquilino vigente en `vinculos`.
--   3. Disparador A (en `vinculos`): cuando el último inquilino vigente de una
--      unidad deja de serlo, `paga` vuelve sola a 'propietario'.
--   3b. En ese mismo momento, se desactivan las membresías de INQUILINO de
--      ESA unidad (pedido de Gustavo, 01-oct). La cuenta del usuario no se
--      toca: si se muda a otro edificio con Vecitap, entra con el mismo
--      usuario y un código nuevo. Ver "3b: por qué ESTA parte sí es
--      SECURITY DEFINER" más abajo.
--   4. `mis_unidades()` devuelve también `paga`.
--
-- A y B juntas mantienen una sola invariante, en los dos sentidos:
--
--     paga = 'inquilino'  ⇒  la unidad tiene al menos un inquilino vigente
--
-- El riesgo que cubren: si el inquilino se va y la unidad queda en
-- 'inquilino', el propietario deja de ver los montos de una deuda que ya no
-- tiene a nadie más que la pague.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUÉ `paga` VA EN `unidades` Y NO EN `vinculos` (decisión de Nicolás)
-- ─────────────────────────────────────────────────────────────────────────
-- `mis_unidades()` y `saldo_visible()` no leen `vinculos`, y
-- `vinculos.persona_id` apunta a `personas`, no a usuarios de Auth: el
-- portal decide quién es quién por `membresias.relacion`. Con la columna en
-- la unidad, `mis_unidades()` solo lee `u.paga`. Además es una decisión
-- sobre la unidad que sobrevive al cambio de inquilino.
--
-- ─────────────────────────────────────────────────────────────────────────
-- "INQUILINO VIGENTE" — definición y supuesto
-- ─────────────────────────────────────────────────────────────────────────
-- Un vínculo de `vinculos` con tipo = 'inquilino' y `hasta is null`, de la
-- MISMA organización que la unidad (v.org_id = u.org_id).
--
--   · `hasta is null` es la misma definición que usa toda la base:
--     `destinatarios_de`, `garita_directorio`, `garita_vehiculos`, el índice
--     parcial `vinculos_org_id_unidad_id_tipo_idx` y `vigente()` en
--     lib/admin/personas.ts. Ninguna compara `hasta` con la fecha de hoy
--     (confirmado en los CSV del 30-sep). Consecuencia: un vínculo al que se
--     le pone un `hasta` FUTURO deja de ser vigente en ese mismo momento, no
--     el día que dice la fecha. Es coherente con el resto de la base, y A se
--     dispara en ese mismo UPDATE.
--   · Se define por `vinculos` y no por `membresias`: un inquilino puede
--     estar en el directorio de la administradora sin tener cuenta en la app.
--     **SUPUESTO pendiente de confirmar con Gustavo.**
--   · `v.org_id = u.org_id`: hoy NADA en la base obliga a que el `org_id` de
--     un vínculo coincida con el de su unidad (la FK de `unidad_id` es
--     simple, y la política `vinculos_escribir` solo mira `vinculos.org_id`).
--     Sin este filtro, un vínculo armado desde otra organización podría
--     satisfacer la guarda B de una unidad ajena. Con él, solo cuentan los
--     vínculos de la organización dueña de la unidad. El hueco de fondo (que
--     se pueda crear ese vínculo cruzado) NO se corrige acá: lo cierra
--     20260930140000_vinculos_org_coherente.sql, aparte. El filtro de acá
--     queda igual, aunque con esa aplicada sea redundante.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUÉ A Y B NO SON SECURITY DEFINER
-- ─────────────────────────────────────────────────────────────────────────
-- Corren con los permisos de quien dispara el cambio, y eso alcanza:
--
--   · Solo dos clases de quien pueden escribir en `unidades` y `vinculos`:
--     quien pasa `puede_operar(org_id)` (las políticas `unidades_escribir` y
--     `vinculos_escribir`, ambas FOR ALL), o un rol que se salta RLS
--     (postgres en el SQL Editor, service_role). Ninguna función de la base
--     escribe en `unidades` (revisado en esquema_inicial.sql y migraciones).
--   · B: quien actualiza la unidad pasa `puede_operar(unidades.org_id)`. Como
--     `vinculos_escribir` es FOR ALL, también actúa como política de lectura:
--     ese mismo usuario VE todos los vínculos con org_id = la org de la
--     unidad, que son exactamente los que B cuenta. No hay nada oculto que
--     haga falta ver con más permisos.
--   · A: quien cierra o borra el vínculo pasa `puede_operar(vinculos.org_id)`.
--     Si esa org es la de la unidad (el caso real), puede leer los vínculos y
--     actualizar la unidad. Si no lo es (un vínculo cruzado), ese vínculo
--     nunca contó para B, así que su salida no cambia nada; el UPDATE de A
--     afecta 0 filas por RLS y eso es lo correcto.
--   · Postgres no deja llamar una función de disparador fuera de un
--     disparador, así que SECURITY DEFINER acá no agregaría superficie de
--     ataque nueva — pero tampoco hace falta, y AGENTS.md pide no sumar
--     SECURITY DEFINER sin necesidad.
--
-- `SET search_path TO 'public'` en las dos, como el resto de las funciones
-- de la base, y con los nombres igual calificados (`public.unidades`,
-- `public.vinculos`). **NO `search_path = ''`** como en `hoy_local()`
-- (20260928140000), y el motivo lo encontró una prueba, no una lectura:
-- dentro del disparador, las consultas a `unidades`/`vinculos` evalúan sus
-- políticas de RLS, que llaman a `puede_operar(org_id)`. `puede_operar` es
-- `LANGUAGE sql` **sin** `SET search_path` propio (así está en las dos
-- bases), y su cuerpo dice `tiene_rol(...)` sin calificar: lo resuelve con la
-- ruta de quien la llama. Con la ruta vacía, para un usuario con sesión
-- (no postgres, que se salta RLS) falla con "function tiene_rol(uuid,
-- text[]) does not exist". `puede_operar` se corrige en su propia migración,
-- 20260930130000_puede_operar_search_path.sql (es una función de seguridad:
-- no se toca de paso); esta no depende de aquella, en ningún orden.
--
-- Son VOLATILE (el default de una función de disparador), a propósito: cada
-- sentencia toma una foto nueva de la base, que es lo que hace funcionar el
-- bloqueo de abajo.
--
-- ─────────────────────────────────────────────────────────────────────────
-- CONCURRENCIA: por qué A bloquea la unidad antes de mirar
-- ─────────────────────────────────────────────────────────────────────────
-- Sin bloqueo, dos cambios simultáneos pueden romper la invariante:
--   · Dos inquilinos se cierran a la vez: cada transacción ve al otro
--     todavía vigente, ninguna devuelve `paga`, y queda 'inquilino' sin
--     inquilinos.
--   · La administradora marca 'inquilino' mientras otra sesión cierra al
--     único inquilino: B ve el vínculo (todavía sin confirmar), A no ve el
--     cambio de `paga` (todavía sin confirmar), y queda 'inquilino' sin
--     inquilinos.
-- Arreglo: A toma `FOR UPDATE` sobre la fila de la unidad ANTES de contar
-- inquilinos. B ya tiene ese mismo bloqueo, porque Postgres bloquea la fila
-- antes de correr un BEFORE UPDATE. Así los dos se ordenan sobre la misma
-- fila, y el segundo cuenta con una foto que ya incluye lo que confirmó el
-- primero (READ COMMITTED, función VOLATILE). Cualquiera de los dos órdenes
-- termina coherente: o B rechaza, o A devuelve `paga` a 'propietario'.
--
-- ─────────────────────────────────────────────────────────────────────────
-- ¿UN RESIDENTE PUEDE CAMBIAR `paga`? NO — revisado, sin hueco
-- ─────────────────────────────────────────────────────────────────────────
-- `unidades` tiene RLS activo y dos políticas (CSV del 30-sep, iguales en
-- las dos bases):
--   · `unidades_escribir` FOR ALL: USING y WITH CHECK `puede_operar(org_id)`.
--   · `unidades_ver` FOR SELECT: solo lectura.
-- `puede_operar(org)` = `tiene_rol(org, {propietario_cuenta, administrador})`.
-- Un residente (o junta, contador, vigilante) no pasa: su UPDATE afecta 0
-- filas sin error. No hay otra política permisiva de escritura ni ninguna
-- función que escriba en `unidades`. No hace falta corregir nada.
-- Ojo, para la UI: un UPDATE rechazado por RLS NO da error, devuelve 0
-- filas — el cliente tiene que pedir `.select()` y comprobar que volvió la
-- fila, como ya hace DatosUnidad con los vínculos.
--
-- ─────────────────────────────────────────────────────────────────────────
-- `mis_unidades()`: lo que cambia y lo que se conserva
-- ─────────────────────────────────────────────────────────────────────────
-- Cambia el RETURNS TABLE (una columna más, `paga`, AL FINAL para no correr
-- la posición de las demás), y Postgres no deja cambiar el tipo de retorno
-- con CREATE OR REPLACE: hace falta DROP + CREATE. Se conserva tal cual:
-- sin argumentos, `LANGUAGE sql`, `STABLE`, `SECURITY DEFINER`,
-- `SET search_path TO 'public'`, el cuerpo entero (solo se agrega `u.paga`
-- al final del select) y los permisos.
--
-- Los permisos: el DROP los borra y el CREATE los vuelve a poner con el
-- default (EXECUTE para PUBLIC, que incluye a `anon`). Se restauran a lo que
-- hay hoy según el volcado: REVOKE de PUBLIC + EXECUTE solo para
-- `authenticated`. El REVOKE explícito de `anon` es por las dudas: si no
-- tiene nada, no hace nada. Ver la verificación 5 para compararlo con lo
-- que había antes.
--
-- No se cambia QUÉ ve cada uno: el propietario mirando una unidad con
-- paga = 'inquilino' sigue recibiendo `saldo` (lo necesita para mostrar el
-- estado; la UI decide no mostrar el monto), y el inquilino sigue viendo lo
-- que diga `inquilino_ve` vía `saldo_visible()`, sin cambios.
--
-- Después de aplicar: regenerar types/supabase.ts.

begin;

-- ── 1. La columna ────────────────────────────────────────────────────────
-- Con un default constante, ADD COLUMN no reescribe la tabla (Postgres 11+).
-- El CHECK sí recorre las filas una vez para validarlo; `unidades` es chica.

alter table public.unidades
  add column paga text not null default 'propietario'
  constraint unidades_paga_check check (paga in ('propietario', 'inquilino'));

comment on column public.unidades.paga is
  'Quién paga el condominio de la unidad: propietario (por omisión) o '
  'inquilino. La fija la administradora. paga = inquilino exige un inquilino '
  'vigente en vinculos (disparador unidades_paga_exige_inquilino), y vuelve '
  'sola a propietario cuando el último se va (vinculos_inquilino_sale). Ver '
  'supabase/migrations/20260930120000_unidades_paga.sql.';

-- ── 2. Guarda B: paga = 'inquilino' exige un inquilino vigente ─────────────

create function public.unidades_paga_exige_inquilino() returns trigger
    language plpgsql
    set search_path to 'public'
    as $function$
begin
  if not exists (
       select 1 from public.vinculos v
        where v.unidad_id = new.id
          and v.org_id    = new.org_id
          and v.tipo      = 'inquilino'
          and v.hasta is null) then
    -- El mensaje lo muestra la UI de Admin tal cual: tiene que entenderse
    -- sin contexto técnico.
    raise exception 'La unidad % no tiene un inquilino registrado. Cargue primero los datos del inquilino y después indique que él paga el condominio.', new.codigo
      using errcode = 'check_violation';
  end if;
  return new;
end $function$;

-- Se dispara en todo INSERT, y en todo UPDATE que nombre `paga` u `org_id`
-- en el SET — aunque el valor no cambie. Es a propósito: si alguna vez la
-- invariante quedara rota, el próximo guardado con paga = 'inquilino' lo
-- delata en vez de arrastrarlo. Un INSERT con paga = 'inquilino' siempre
-- falla (la unidad todavía no tiene vínculos): una unidad nueva se crea en
-- 'propietario' y se cambia después de cargar al inquilino.
create trigger unidades_paga_exige_inquilino
  before insert or update of paga, org_id on public.unidades
  for each row
  when (new.paga = 'inquilino')
  execute function public.unidades_paga_exige_inquilino();

-- ── 3. Disparador A: se fue el último inquilino → paga vuelve a propietario

create function public.vinculos_inquilino_sale() returns trigger
    language plpgsql
    set search_path to 'public'
    as $function$
begin
  -- Bloquear la unidad ANTES de contar (ver "Concurrencia" arriba). Si no
  -- aparece —se está borrando en cascada, o RLS no la deja ver porque el
  -- vínculo era de otra organización— no hay nada que corregir.
  perform 1 from public.unidades u where u.id = old.unidad_id for update;
  if not found then
    return null;
  end if;

  update public.unidades u
     set paga = 'propietario'
   where u.id = old.unidad_id
     and u.paga = 'inquilino'
     and not exists (
           select 1 from public.vinculos v
            where v.unidad_id = u.id
              and v.org_id    = u.org_id
              and v.tipo      = 'inquilino'
              and v.hasta is null);
  return null;
end $function$;

-- "Deja de estar vigente": era un inquilino vigente y después del cambio ya
-- no lo es para ESA unidad — se le puso `hasta`, cambió de tipo, se movió a
-- otra unidad u otra organización.
create trigger vinculos_inquilino_sale_upd
  after update of tipo, hasta, unidad_id, org_id on public.vinculos
  for each row
  when (old.tipo = 'inquilino' and old.hasta is null
        and (new.tipo <> 'inquilino'
             or new.hasta is not null
             or new.unidad_id <> old.unidad_id
             or new.org_id <> old.org_id))
  execute function public.vinculos_inquilino_sale();

create trigger vinculos_inquilino_sale_del
  after delete on public.vinculos
  for each row
  when (old.tipo = 'inquilino' and old.hasta is null)
  execute function public.vinculos_inquilino_sale();

-- ── 3b. Se fue el último inquilino → se apagan sus accesos a esa unidad ──
--
-- 3b: por qué ESTA parte sí es SECURITY DEFINER (y A y B no)
-- La política de escritura de `membresias` es `mem_admin` (FOR ALL), y solo
-- deja pasar a `propietario_cuenta` (leída por MCP el 01-oct, igual en las
-- dos bases). Una `administrador` —que es quien carga y cierra inquilinos—
-- PUEDE cerrar el vínculo, pero su UPDATE a `membresias` afectaría 0 filas,
-- sin error. Con los permisos de quien dispara, la regla de Gustavo no se
-- cumpliría justo en el caso más común.
--
-- Por eso esta función corre como su dueño, y por eso está acotada al
-- mínimo:
--   · Hace UNA sola cosa: `activo = false` en membresías con rol
--     'residente', relación 'inquilino', de ESA unidad y de la MISMA
--     organización que la unidad. No toca otras unidades, otros roles, ni
--     la cuenta (auth.users), ni borra nada.
--   · Solo actúa si el vínculo que se fue era de la misma organización que
--     la unidad. Quien lo cerró tuvo que pasar `puede_operar` sobre la org
--     del vínculo (política `vinculos_escribir`), así que ya administra esa
--     unidad. Un vínculo cruzado (el hueco que cierra 20260930140000) no
--     dispara nada.
--   · Solo si no queda ningún inquilino vigente, contado después de
--     bloquear la fila de la unidad (mismo criterio de concurrencia que A).
--   · Es una función de disparador: Postgres no deja llamarla como RPC
--     ("trigger functions can only be called as triggers"). Además se le
--     quita EXECUTE a todos; disparar el disparador no lo necesita.
--   · `SET search_path TO 'public'` y nombres calificados.
--
-- Lo que esto amplía, dicho explícitamente: hasta ahora una `administrador`
-- no podía desactivar ninguna membresía. Desde acá puede, de forma
-- indirecta, desactivar los accesos de inquilino de una unidad de su
-- organización, y solo cerrando al último inquilino de esa unidad. Es la
-- regla de negocio que pidió Gustavo. Queda en `auditoria` (aud_membresias).
--
-- Lo que NO hace: si quedan otros inquilinos vigentes, no apaga ninguna
-- membresía (las membresías no están atadas a una persona del directorio,
-- solo a la unidad, así que no se puede saber cuál es "la del que se fue").

create function public.vinculos_inquilino_sale_accesos() returns trigger
    language plpgsql
    security definer
    set search_path to 'public'
    as $function$
declare
  v_org uuid;
begin
  select u.org_id into v_org
    from public.unidades u
   where u.id = old.unidad_id
     for update;
  if not found or v_org <> old.org_id then
    return null;
  end if;

  if exists (
       select 1 from public.vinculos v
        where v.unidad_id = old.unidad_id
          and v.org_id    = v_org
          and v.tipo      = 'inquilino'
          and v.hasta is null) then
    return null;
  end if;

  update public.membresias m
     set activo = false
   where m.unidad_id = old.unidad_id
     and m.org_id    = v_org
     and m.rol       = 'residente'
     and m.relacion  = 'inquilino'
     and m.activo;
  return null;
end $function$;

revoke all on function public.vinculos_inquilino_sale_accesos() from public;
revoke all on function public.vinculos_inquilino_sale_accesos() from anon, authenticated;

create trigger vinculos_inquilino_sale_accesos_upd
  after update of tipo, hasta, unidad_id, org_id on public.vinculos
  for each row
  when (old.tipo = 'inquilino' and old.hasta is null
        and (new.tipo <> 'inquilino'
             or new.hasta is not null
             or new.unidad_id <> old.unidad_id
             or new.org_id <> old.org_id))
  execute function public.vinculos_inquilino_sale_accesos();

create trigger vinculos_inquilino_sale_accesos_del
  after delete on public.vinculos
  for each row
  when (old.tipo = 'inquilino' and old.hasta is null)
  execute function public.vinculos_inquilino_sale_accesos();

-- ── 4. mis_unidades() con `paga` ─────────────────────────────────────────

drop function public.mis_unidades();

create function public.mis_unidades()
 returns table(unidad_id uuid, codigo text, alicuota numeric, edificio_id uuid, edificio text, org_id uuid, organizacion text, relacion text, nivel text, saldo numeric, recibo_numero text, recibo_total numeric, recibo_periodo text, recibo_anio integer, recibo_mes integer, paga text)
 language sql
 stable security definer
 set search_path to 'public'
as $function$
  select u.id, u.codigo, u.alicuota,
         e.id, e.nombre, o.id, o.nombre,
         coalesce(m.relacion, 'propietario'),
         u.inquilino_ve,
         saldo_visible(u.id),
         r.numero, r.total, p.etiqueta, p.anio, p.mes,
         u.paga                                   -- ← lo único nuevo
    from membresias m
    join unidades u    on u.id = m.unidad_id
    join edificios e   on e.id = u.edificio_id
    join organizaciones o on o.id = u.org_id
    left join lateral (
      select r2.numero, r2.total, r2.periodo_id
        from recibos r2
        join periodos p2 on p2.id = r2.periodo_id
       where r2.unidad_id = u.id and p2.estado = 'cerrado'
       order by p2.anio desc, p2.mes desc
       limit 1) r on true
    left join periodos p on p.id = r.periodo_id
   where m.usuario_id = auth.uid() and m.activo and m.rol = 'residente'
   order by o.nombre, e.nombre, u.codigo
$function$;

revoke all on function public.mis_unidades() from public;
revoke all on function public.mis_unidades() from anon;
grant execute on function public.mis_unidades() to authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- ANTES DE APLICAR (en cada base) — para comparar después
-- ─────────────────────────────────────────────────────────────────────────
-- 0) Los permisos actuales de mis_unidades(), para confirmar que la
--    verificación 5 deja lo mismo:
--
--      select proacl from pg_proc
--       where proname = 'mis_unidades' and pronamespace = 'public'::regnamespace;
--
--    Esperado según el volcado: {postgres=X/postgres,authenticated=X/postgres}
--    (si sale otra cosa, anotarlo y avisar antes de aplicar).
--
-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN DESPUÉS DE APLICAR
-- ─────────────────────────────────────────────────────────────────────────
-- 1) La columna, con su default y su CHECK, y todas las unidades en
--    'propietario':
--
--      select column_name, data_type, column_default, is_nullable
--        from information_schema.columns
--       where table_schema = 'public' and table_name = 'unidades'
--         and column_name = 'paga';
--      -- Esperado: paga | text | 'propietario'::text | NO
--
--      select paga, count(*) from public.unidades group by paga;
--      -- Esperado: una sola fila, 'propietario' = total de unidades.
--
-- 2) Los cinco disparadores nuevos, y que A y B NO son SECURITY DEFINER
--    (la 3b sí, a propósito: ver verificación 7):
--
--      select c.relname, t.tgname, pg_get_triggerdef(t.oid)
--        from pg_trigger t join pg_class c on c.oid = t.tgrelid
--       where c.relnamespace = 'public'::regnamespace
--         and c.relname in ('unidades', 'vinculos') and not t.tgisinternal
--       order by 1, 2;
--      -- Esperado: aud_unidades (ya estaba), unidades_paga_exige_inquilino,
--      -- vinculos_inquilino_sale_accesos_del, vinculos_inquilino_sale_accesos_upd,
--      -- vinculos_inquilino_sale_del, vinculos_inquilino_sale_upd. (Si la
--      -- 20260930140000 ya está aplicada, también vinculos_unidad_misma_org
--      -- y unidades_org_con_vinculos.)
--
--      select proname, prosecdef as security_definer, provolatile, proconfig
--        from pg_proc
--       where pronamespace = 'public'::regnamespace
--         and proname in ('unidades_paga_exige_inquilino', 'vinculos_inquilino_sale');
--      -- Esperado en las dos: security_definer = false, provolatile = 'v',
--      -- proconfig = {search_path=public}.
--
-- 3) mis_unidades(): misma forma, con `paga` al final:
--
--      select pg_get_functiondef(oid), pg_get_userbyid(proowner) as dueno
--        from pg_proc
--       where proname = 'mis_unidades' and pronamespace = 'public'::regnamespace;
--      -- Esperado: `LANGUAGE sql`, `STABLE SECURITY DEFINER`,
--      -- `SET search_path TO 'public'`, `paga text` al final del RETURNS
--      -- TABLE, y dueño `postgres` (el mismo que las demás SECURITY
--      -- DEFINER; si fuera otro, avisar).
--
-- 4) Las dos guardas, de punta a punta, SIN dejar rastro (todo dentro de
--    una transacción que se deshace). Elegir una unidad de prueba SIN
--    inquilino y otra CON uno:
--
--      select u.codigo, u.id,
--             exists (select 1 from public.vinculos v
--                      where v.unidad_id = u.id and v.org_id = u.org_id
--                        and v.tipo = 'inquilino' and v.hasta is null) as tiene_inquilino
--        from public.unidades u order by tiene_inquilino desc, u.codigo limit 10;
--
--    4a) B rechaza una unidad sin inquilino:
--
--      begin;
--      update public.unidades set paga = 'inquilino' where id = '<unidad SIN inquilino>';
--      rollback;
--      -- Esperado: ERROR "La unidad … no tiene un inquilino registrado. …"
--
--    4b) B acepta una con inquilino, y A la devuelve al cerrar el vínculo:
--
--      begin;
--      update public.unidades set paga = 'inquilino' where id = '<unidad CON inquilino>';
--      select paga from public.unidades where id = '<unidad CON inquilino>';
--      -- Esperado: inquilino
--      update public.vinculos set hasta = hoy_local()
--       where unidad_id = '<unidad CON inquilino>' and tipo = 'inquilino' and hasta is null;
--      select paga from public.unidades where id = '<unidad CON inquilino>';
--      -- Esperado: propietario
--      rollback;
--
--    4c) Lo mismo borrando el vínculo en vez de cerrarlo:
--
--      begin;
--      update public.unidades set paga = 'inquilino' where id = '<unidad CON inquilino>';
--      delete from public.vinculos
--       where unidad_id = '<unidad CON inquilino>' and tipo = 'inquilino' and hasta is null;
--      select paga from public.unidades where id = '<unidad CON inquilino>';
--      -- Esperado: propietario
--      rollback;
--
--    (Corridas desde el SQL Editor, como postgres: prueban la lógica, no
--    RLS. La prueba "un residente no puede cambiar `paga`" va con sesión
--    impersonada, abajo.)
--
-- 5) Permisos de mis_unidades(), a comparar con el paso 0:
--
--      select proacl from pg_proc
--       where proname = 'mis_unidades' and pronamespace = 'public'::regnamespace;
--      -- Esperado: igual que en el paso 0 — sin `=X/` suelto (PUBLIC) y sin
--      -- `anon`.
--
-- 6) Un residente NO puede cambiar `paga` (RLS), y mis_unidades() le
--    devuelve la columna. Con sesión impersonada, igual que en la
--    verificación de RLS del vigilante (docs/estado-migracion.md):
--
--      begin;
--      set local role authenticated;
--      set local request.jwt.claims = '{"sub":"<usuario_id de un residente>","role":"authenticated"}';
--      select codigo, relacion, paga, saldo from mis_unidades();
--      -- Esperado: sus unidades, con paga = 'propietario'.
--      update public.unidades set paga = 'propietario'
--       where id in (select unidad_id from mis_unidades())
--      returning id;
--      -- Esperado: 0 filas (RLS lo filtra sin error). Se usa 'propietario'
--      -- a propósito para que la guarda B no se meta y se vea solo RLS.
--      rollback;
--
-- 7) 3b, la función y sus permisos:
--
--      select proname, prosecdef, proconfig, proacl, pg_get_userbyid(proowner) dueno
--        from pg_proc
--       where oid = 'public.vinculos_inquilino_sale_accesos()'::regprocedure;
--      -- Esperado: prosecdef = true, proconfig = {search_path=public},
--      -- proacl = {postgres=X/postgres} (nadie más), dueño postgres.
--
-- 8) 3b de punta a punta, como una ADMINISTRADORA (no propietario_cuenta:
--    es el caso que justifica SECURITY DEFINER), sin dejar rastro. El
--    `raise exception` del final deshace todo y muestra el resultado en el
--    mensaje de error:
--
--      do $v$
--      declare a int; b int; otra int;
--      begin
--        perform set_config('role', 'authenticated', true);
--        perform set_config('request.jwt.claims',
--          '{"sub":"<usuario_id de una administradora>","role":"authenticated"}', true);
--        select count(*) into a from public.membresias
--         where unidad_id = '<unidad con inquilino>' and rol = 'residente'
--           and relacion = 'inquilino' and activo;
--        update public.vinculos set hasta = hoy_local()
--         where unidad_id = '<unidad con inquilino>' and tipo = 'inquilino' and hasta is null;
--        select count(*) into b from public.membresias
--         where unidad_id = '<unidad con inquilino>' and rol = 'residente'
--           and relacion = 'inquilino' and activo;
--        select count(*) into otra from public.membresias
--         where unidad_id <> '<unidad con inquilino>' and not activo;
--        raise exception 'RESULTADO antes=% despues=% inactivas_en_otras_unidades=%', a, b, otra;
--      end $v$;
--      -- Esperado: despues = 0, y `inactivas_en_otras_unidades` igual que
--      -- antes de correrlo (no tocó otras unidades). Las propietarias de la
--      -- misma unidad, intactas.
-- ─────────────────────────────────────────────────────────────────────────
