-- Cargo a una sola unidad desde Cobros: multa, consumo u otro cobro que NO
-- es un gasto del edificio (ronda 10, bloque C, R10-5).
--
-- Aplicada en vecitap-pruebas el 29-oct. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo, después de la revisión cruzada.
-- **Va después de 20261029140000_cargos_en_recibo.sql** (la guarda exige su
-- cerrar_periodo()). Rollback:
-- supabase/rollbacks/20261029160000_cargos_unidad_rollback.sql.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUÉ UNA TABLA APARTE Y NO EL GASTO «SOLO A UNA UNIDAD»
-- ─────────────────────────────────────────────────────────────────────────
-- El gasto `tipo = 'directo'` es un gasto: estado_financiero() suma todo
-- `gastos` como egreso. Una multa o un consumo cargado así salía como egreso
-- del edificio sin serlo. Decisión aprobada por Nicolás el 29-oct:
--   · Multa, consumo u otro cobro → esta tabla. NO es egreso. Cuando la
--     unidad paga, el pago conciliado entra como ingreso (como hoy).
--   · Reparación que pagó el edificio y le cobra a una unidad → sigue siendo
--     el gasto directo de siempre (Cobros lo guarda ahí con «El edificio pagó
--     esto»): egreso al registrarlo, ingreso cuando la unidad paga.
-- estado_financiero() no cambia: esta tabla no está en su consulta.
--
-- ─────────────────────────────────────────────────────────────────────────
-- QUÉ CAMBIA
-- ─────────────────────────────────────────────────────────────────────────
-- 1. `cargos_unidad` (mes, unidad, motivo, referencia, monto), con RLS: la
--    ven administración y contador de la organización; la escribe quien
--    opera (puede_operar, la misma regla que gastos). El residente no la
--    lee: ve el cargo en su recibo al cerrar (`recibos.cargos`).
-- 2. Guarda (trigger): solo con el mes abierto; la unidad tiene que ser del
--    edificio del mes; `org_id` lo pone la base. Al cerrar el mes el cargo
--    queda en el recibo y no se toca (reabrir el mes lo vuelve editable).
--    Los borrados en cascada (mes, unidad u organización) pasan.
-- 3. cerrar_periodo() y simular_cierre(): suman estos cargos donde ya
--    sumaban el gasto directo (bolsillo condominio, antes de la mora y del
--    redondeo: el mismo cálculo en los dos). cerrar_periodo() los agrega a
--    `recibos.cargos`, cada uno con su motivo; `recibos.directos` es la suma
--    de los dos tipos. Si no se paga, al mes siguiente es deuda de
--    condominio y cuenta para la mora igual que la cuota.

begin;

do $guarda$
declare v text;
begin
  select md5(prosrc) into v from pg_proc where oid = 'public.cerrar_periodo(uuid)'::regprocedure;
  if v is distinct from 'eaa0fce90bcfe90a248a0c0393f8f3b1' then
    raise exception 'ABORTADA: cerrar_periodo cambió (md5=%). ¿Falta 20261029140000_cargos_en_recibo.sql?', v;
  end if;
  select md5(prosrc) into v from pg_proc where oid = 'public.simular_cierre(uuid)'::regprocedure;
  if v is distinct from '19b6299970311a6d0bf17d48f3aa673f' then
    raise exception 'ABORTADA: simular_cierre cambió (md5=%)', v;
  end if;
  if to_regclass('public.cargos_unidad') is not null then
    raise exception 'ABORTADA: cargos_unidad ya existe';
  end if;
end
$guarda$;

create table public.cargos_unidad (
  id          uuid primary key default gen_random_uuid(),
  org_id      uuid not null references public.organizaciones(id) on delete cascade,
  periodo_id  uuid not null references public.periodos(id) on delete cascade,
  unidad_id   uuid not null references public.unidades(id) on delete cascade,
  concepto    text not null check (char_length(btrim(concepto)) between 1 and 120),
  referencia  text check (referencia is null or char_length(referencia) <= 120),
  monto       numeric(18,2) not null check (monto > 0 and monto < 1000000000),
  creado_en   timestamptz not null default now(),
  creado_por  uuid default auth.uid()
);

create index cargos_unidad_periodo_unidad on public.cargos_unidad (periodo_id, unidad_id);
create index cargos_unidad_unidad on public.cargos_unidad (unidad_id);

comment on table public.cargos_unidad is
  'Ronda 10 (C): cargo a una sola unidad desde Cobros (multa, consumo). No es un gasto del edificio: no sale como egreso en estado_financiero(). Entra en simular_cierre() y cerrar_periodo() como el gasto directo, en el bolsillo de condominio. Se edita mientras el mes está abierto.';

-- La guarda: solo con el mes abierto, la unidad del mismo edificio que el
-- mes, y la organización la pone la base (del mes), no el cliente.
create function public.cargos_unidad_guarda() returns trigger
  language plpgsql security definer set search_path = public
as $$
declare v_estado text; v_edificio uuid; v_org uuid;
begin
  if tg_op in ('UPDATE', 'DELETE') then
    -- Borrado en cascada (se borra el mes, la unidad o la organización): pasa.
    if tg_op = 'DELETE' and pg_trigger_depth() > 1 then return old; end if;
    select p.estado into v_estado from periodos p where p.id = old.periodo_id;
    if v_estado is distinct from 'abierto' then
      raise exception 'Ese mes ya está cerrado: el cargo quedó en el recibo y no se puede cambiar. Para corregirlo, reabra el mes.';
    end if;
  end if;
  if tg_op = 'DELETE' then return old; end if;

  select p.estado, p.edificio_id, p.org_id into v_estado, v_edificio, v_org
    from periodos p where p.id = new.periodo_id;
  if v_estado is distinct from 'abierto' then
    raise exception 'Ese mes no está abierto: el cargo va en el mes que todavía no se cerró.';
  end if;
  if not exists (select 1 from unidades u where u.id = new.unidad_id and u.edificio_id = v_edificio) then
    raise exception 'Esa unidad no es de este edificio.';
  end if;
  new.org_id := v_org;
  new.concepto := btrim(new.concepto);
  new.referencia := nullif(btrim(coalesce(new.referencia, '')), '');
  if tg_op = 'UPDATE' then
    new.creado_en := old.creado_en;
    new.creado_por := old.creado_por;
  end if;
  return new;
end $$;

revoke all on function public.cargos_unidad_guarda() from public, anon, authenticated;

create trigger cargos_unidad_guarda
  before insert or update or delete on public.cargos_unidad
  for each row execute function public.cargos_unidad_guarda();

alter table public.cargos_unidad enable row level security;

-- Ver: la administración y el contador de la organización. El residente no
-- lo lee de acá: lo ve en su recibo (`recibos.cargos`) cuando se cierra.
create policy cargos_unidad_ver on public.cargos_unidad for select
  using (tiene_rol(org_id, array['propietario_cuenta', 'administrador', 'contador']));
-- Escribir: quien opera la organización (la misma regla que gastos).
create policy cargos_unidad_escribir on public.cargos_unidad for all
  using (puede_operar(org_id))
  with check (puede_operar(org_id));

revoke all on table public.cargos_unidad from public, anon, authenticated;
grant select, insert, update, delete on table public.cargos_unidad to authenticated;

do $reemplazo$
declare
  d text;
  -- cerrar_periodo, reemplazo 1: la suma de los cargos de la unidad suma también los de Cobros.
  a1 text := E'       where periodo_id = p_periodo and tipo = ''directo'' and unidad_id = r.id;\n\n      -- Ronda 10 (C): cada cargo';
  b1 text := E'       where periodo_id = p_periodo and tipo = ''directo'' and unidad_id = r.id;\n'
             || E'\n'
             || E'      -- Ronda 10 (C, R10-5): más los cargos a una sola unidad de Cobros\n'
             || E'      -- (multa, consumo), que no son gastos del edificio. Mismo bolsillo\n'
             || E'      -- (condominio) y mismo lugar del cálculo que el gasto directo: antes de\n'
             || E'      -- la mora y del redondeo.\n'
             || E'      v_directos := v_directos + coalesce((select sum(cu.monto) from cargos_unidad cu\n'
             || E'                                            where cu.periodo_id = p_periodo and cu.unidad_id = r.id), 0);\n'
             || E'\n      -- Ronda 10 (C): cada cargo';
  -- cerrar_periodo, reemplazo 2: la lista con su motivo incluye los de Cobros.
  a2 text := E'      select coalesce(jsonb_agg(jsonb_build_object(\n'
             || E'               ''concepto'', g.concepto, ''referencia'', g.referencia, ''monto'', g.monto)\n'
             || E'               order by g.orden nulls last, g.creado_en), ''[]''::jsonb)\n'
             || E'        into v_cargos\n'
             || E'        from gastos g\n'
             || E'       where g.periodo_id = p_periodo and g.tipo = ''directo'' and g.unidad_id = r.id;\n';
  b2 text := E'      select coalesce(jsonb_agg(jsonb_build_object(\n'
             || E'               ''concepto'', x.concepto, ''referencia'', x.referencia, ''monto'', x.monto)\n'
             || E'               order by x.creado_en), ''[]''::jsonb)\n'
             || E'        into v_cargos\n'
             || E'        from (select g.concepto, g.referencia, g.monto, g.creado_en\n'
             || E'                from gastos g\n'
             || E'               where g.periodo_id = p_periodo and g.tipo = ''directo'' and g.unidad_id = r.id\n'
             || E'              union all\n'
             || E'              select cu.concepto, cu.referencia, cu.monto, cu.creado_en\n'
             || E'                from cargos_unidad cu\n'
             || E'               where cu.periodo_id = p_periodo and cu.unidad_id = r.id) x;\n';
  -- simular_cierre, reemplazo 3: la misma suma, en el bolsillo de condominio.
  a3 text := E'       where periodo_id = p_periodo and tipo = ''directo'' and unidad_id = r.id;\n\n      v_adm  := v_adm  + v_dir_adm;\n';
  b3 text := E'       where periodo_id = p_periodo and tipo = ''directo'' and unidad_id = r.id;\n'
             || E'\n'
             || E'      -- Ronda 10 (C, R10-5): los cargos a una sola unidad de Cobros, igual\n'
             || E'      -- que en cerrar_periodo() (condominio, antes de la mora y del redondeo).\n'
             || E'      v_dir_cond := v_dir_cond + coalesce((select sum(cu.monto) from cargos_unidad cu\n'
             || E'                                            where cu.periodo_id = p_periodo and cu.unidad_id = r.id), 0);\n'
             || E'\n      v_adm  := v_adm  + v_dir_adm;\n';
  i int; pares text[][];
begin
  d := pg_get_functiondef('public.cerrar_periodo(uuid)'::regprocedure);
  pares := array[[a1, b1], [a2, b2]];
  for i in 1..2 loop
    if (length(d) - length(replace(d, pares[i][1], ''))) / length(pares[i][1]) <> 1 then
      raise exception 'ABORTADA: el reemplazo % de cerrar_periodo no aparece exactamente una vez', i;
    end if;
    d := replace(d, pares[i][1], pares[i][2]);
  end loop;
  execute d;

  d := pg_get_functiondef('public.simular_cierre(uuid)'::regprocedure);
  if (length(d) - length(replace(d, a3, ''))) / length(a3) <> 1 then
    raise exception 'ABORTADA: el reemplazo de simular_cierre no aparece exactamente una vez';
  end if;
  execute replace(d, a3, b3);
end
$reemplazo$;

do $despues$
declare v text;
begin
  select md5(prosrc) into v from pg_proc where oid = 'public.cerrar_periodo(uuid)'::regprocedure;
  if v is distinct from '2db1cb7be8c9a6d8330e29da8a6a7ac3' then
    raise exception 'ABORTADA: cerrar_periodo no quedó como se esperaba (md5=%)', v;
  end if;
  select md5(prosrc) into v from pg_proc where oid = 'public.simular_cierre(uuid)'::regprocedure;
  if v is distinct from 'c116e31f4170921832b2f640a5592d77' then
    raise exception 'ABORTADA: simular_cierre no quedó como se esperaba (md5=%)', v;
  end if;
end
$despues$;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. select proname, md5(prosrc) from pg_proc where proname in ('cerrar_periodo', 'simular_cierre');
--      → cerrar_periodo 2db1cb7be8c9a6d8330e29da8a6a7ac3, simular_cierre c116e31f4170921832b2f640a5592d77
--    select relrowsecurity from pg_class where oid = 'public.cargos_unidad'::regclass;  → true
--    select polname from pg_policy where polrelid = 'public.cargos_unidad'::regclass;
--      → cargos_unidad_ver, cargos_unidad_escribir
--    select grantee, privilege_type from information_schema.role_table_grants
--     where table_name = 'cargos_unidad' and grantee in ('anon', 'authenticated');
--      → solo authenticated: SELECT, INSERT, UPDATE, DELETE (nada para anon)
-- 2. En una transacción deshecha, como la administradora, en un mes abierto
--    con redondeo 'redondear' y una cuota extraordinaria: un cargo de
--    cargos_unidad y un gasto directo a la misma unidad.
--      select codigo, total from simular_cierre('<mes>');
--      select * from cerrar_periodo('<mes>');
--      select u.codigo, r.total, r.directos, r.cargos from recibos r join unidades u on u.id = r.unidad_id where r.periodo_id = '<mes>';
--    Esperado: total del recibo = el de la previa; `directos` = cargo + gasto
--    directo; `cargos` = los dos, con su motivo.
--      select estado_financiero('<edificio>', '<inicio del mes>', '<fin del mes>') -> 'egresos';
--    Esperado: incluye el gasto directo y NO el cargo de cargos_unidad.
-- 3. Con el mes ya cerrado: update/delete de ese cargo → «Ese mes ya está
--    cerrado…». Un cargo con la unidad de otro edificio → «Esa unidad no es
--    de este edificio.»
