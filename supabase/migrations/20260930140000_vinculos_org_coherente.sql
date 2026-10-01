-- Coherencia de organización en `vinculos`: la unidad de un vínculo tiene
-- que ser de la misma organización que el vínculo.
--
-- SIN APLICAR. La revisa y la aplica Nicolás: primero en vecitap-pruebas,
-- después en vecitap-produccion, con respaldo previo (docs/respaldo.md).
-- **Antes de aplicar, correr la CONSULTA PREVIA de abajo en esa base.**
-- Independiente de las otras dos migraciones del 30-sep.
--
-- ─────────────────────────────────────────────────────────────────────────
-- EL HUECO
-- ─────────────────────────────────────────────────────────────────────────
-- `vinculos` tiene `org_id` y `unidad_id`, pero nada obliga a que coincidan:
--   · la FK `vinculos_unidad_id_fkey` es simple (solo `unidad_id`), y
--   · la política `vinculos_escribir` mira solo `puede_operar(vinculos.org_id)`.
-- Una administradora de la organización X puede insertar un vínculo con
-- `org_id = X` sobre una unidad de la organización Y (le basta con conocer
-- su uuid). Esa persona aparece después en `destinatarios_de()` de la unidad
-- de Y — o sea, **recibe los cortes de cuenta de Y**, con montos y deuda —, y
-- en el directorio de la garita de Y. Es una fuga entre organizaciones.
--
-- ─────────────────────────────────────────────────────────────────────────
-- FK COMPUESTA O DISPARADOR: se eligió DISPARADOR
-- ─────────────────────────────────────────────────────────────────────────
-- La FK compuesta es lo más declarativo (`unique (id, org_id)` en unidades +
-- `foreign key (unidad_id, org_id) references unidades (id, org_id)`), y la
-- primera opción en abstracto. Se descartó por un efecto sobre la API:
--
--   · Con dos FK entre `unidades` y `vinculos`, PostgREST ya no sabe cuál
--     usar para el embed `vinculos(...)`, y responde PGRST201 ("more than one
--     relationship was found"). Ese embed lo usan Propietarios, la ficha de
--     la unidad, Inicio y Cortes: las cuatro pantallas se caerían en
--     producción el mismo minuto en que se aplica.
--   · Evitarlo exige BORRAR `vinculos_unidad_id_fkey` y reemplazarla por la
--     compuesta (o cambiar las cuatro consultas para nombrar la FK). Es un
--     cambio más grande sobre una tabla en uso, cambia los tipos generados
--     (`Relationships`) y su rollback es más delicado.
--
-- El disparador no cambia nada de la API ni de los tipos. Lo que hay que
-- cubrir a mano, y está cubierto:
--   · Las filas que YA existen: un disparador no valida el pasado. La guarda
--     de abajo aborta la migración si hay alguna fila incoherente.
--   · El otro lado: cambiar `unidades.org_id` de una unidad con vínculos
--     también rompería la coherencia. Segundo disparador, en `unidades`.
--   · Un superusuario puede apagar disparadores (`session_replication_role`)
--     — también puede apagar FKs del mismo modo. No es un caso real acá.
--
-- ─────────────────────────────────────────────────────────────────────────
-- POR QUÉ NO SON SECURITY DEFINER
-- ─────────────────────────────────────────────────────────────────────────
-- Mismo razonamiento que en 20260930120000_unidades_paga.sql:
--   · `vinculos`: para que una escritura prospere, quien la hace tiene que
--     pasar `puede_operar(new.org_id)`. Esa misma condición le deja LEER
--     todas las unidades de `new.org_id` (la política `unidades_escribir` es
--     FOR ALL, también vale para SELECT). Si la unidad es de esa org, la ve
--     y pasa; si es de otra, no la encuentra y el disparador rechaza — que es
--     lo correcto, la vea o no. Quien se salta RLS (postgres, service_role)
--     ve todo y el chequeo es exacto.
--   · `unidades`: quien cambia el `org_id` de una unidad pasa
--     `puede_operar(old.org_id)` y ve todos los vínculos de esa org, que son
--     los únicos que puede tener la unidad después de la guarda.
-- `SET search_path TO 'public'` (no `''`): con ruta vacía, las políticas
-- que usan `puede_operar` fallan mientras no esté aplicada
-- 20260930130000_puede_operar_search_path.sql. Ver ese archivo.
--
-- ─────────────────────────────────────────────────────────────────────────
-- LO QUE NO CUBRE (anotado en docs/estado-migracion.md)
-- ─────────────────────────────────────────────────────────────────────────
-- `vinculos.persona_id` tampoco está atado a la organización: un vínculo
-- podría apuntar a una `persona` de otra organización. Es el mismo tipo de
-- hueco, del lado de la persona. La consulta previa lo cuenta, a título
-- informativo, pero esta migración no lo bloquea (no fue pedido y merece su
-- propia revisión).
--
-- ─────────────────────────────────────────────────────────────────────────
-- CONSULTA PREVIA — correr ANTES de aplicar, en cada base
-- ─────────────────────────────────────────────────────────────────────────
--   -- (a) Vínculos cuya unidad es de otra organización. Esperado: 0 filas.
--   --     Si aparece alguna, NO aplicar: mandar el resultado para decidir
--   --     a qué organización corresponde de verdad.
--   select v.id as vinculo_id, v.tipo, v.desde, v.hasta,
--          v.org_id as org_del_vinculo, u.org_id as org_de_la_unidad,
--          u.codigo as unidad
--     from public.vinculos v
--     join public.unidades u on u.id = v.unidad_id
--    where v.org_id <> u.org_id
--    order by u.codigo;
--
--   -- (b) Informativo, no bloquea: vínculos cuya persona es de otra
--   --     organización. Esperado: 0.
--   select count(*) as vinculos_con_persona_de_otra_org
--     from public.vinculos v
--     join public.personas p on p.id = v.persona_id
--    where p.org_id <> v.org_id;

begin;

-- ═════════════════════════════════════════════════════════════════════════
-- GUARDA · ninguna fila existente puede violar la regla
-- ═════════════════════════════════════════════════════════════════════════
do $guarda$
declare
  v_malas integer;
begin
  select count(*) into v_malas
    from public.vinculos v
    join public.unidades u on u.id = v.unidad_id
   where v.org_id <> u.org_id;
  if v_malas > 0 then
    raise exception 'ABORTADA: hay % vínculo(s) cuya unidad es de otra organización. Corra la CONSULTA PREVIA (a) de este archivo y decida qué hacer con esas filas antes de aplicar.', v_malas
      using errcode = 'foreign_key_violation';
  end if;
end
$guarda$;

-- ── 1. En vinculos: la unidad tiene que ser de la misma organización ─────

create function public.vinculos_unidad_misma_org() returns trigger
    language plpgsql
    set search_path to 'public'
    as $function$
begin
  if not exists (
       select 1 from public.unidades u
        where u.id = new.unidad_id
          and u.org_id = new.org_id) then
    raise exception 'La unidad de este vínculo no pertenece a la misma organización.'
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end $function$;

create trigger vinculos_unidad_misma_org
  before insert or update of unidad_id, org_id on public.vinculos
  for each row
  execute function public.vinculos_unidad_misma_org();

-- ── 2. En unidades: no cambiar de organización una unidad con vínculos ───

create function public.unidades_org_con_vinculos() returns trigger
    language plpgsql
    set search_path to 'public'
    as $function$
begin
  if exists (
       select 1 from public.vinculos v
        where v.unidad_id = new.id
          and v.org_id <> new.org_id) then
    raise exception 'La unidad % tiene propietarios o inquilinos registrados en su organización: no se puede pasar a otra.', new.codigo
      using errcode = 'foreign_key_violation';
  end if;
  return new;
end $function$;

create trigger unidades_org_con_vinculos
  before update of org_id on public.unidades
  for each row
  when (new.org_id is distinct from old.org_id)
  execute function public.unidades_org_con_vinculos();

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN DESPUÉS DE APLICAR
-- ─────────────────────────────────────────────────────────────────────────
-- 1) Los dos disparadores y que no son SECURITY DEFINER:
--
--      select c.relname, t.tgname, pg_get_triggerdef(t.oid)
--        from pg_trigger t join pg_class c on c.oid = t.tgrelid
--       where c.relnamespace = 'public'::regnamespace
--         and t.tgname in ('vinculos_unidad_misma_org', 'unidades_org_con_vinculos');
--      -- Esperado: 2 filas.
--
--      select proname, prosecdef, proconfig from pg_proc
--       where pronamespace = 'public'::regnamespace
--         and proname in ('vinculos_unidad_misma_org', 'unidades_org_con_vinculos');
--      -- Esperado: prosecdef = false, proconfig = {search_path=public}.
--
-- 2) Rechaza un vínculo cruzado, sin dejar rastro. Elegir una unidad de una
--    org y el id de OTRA org (en pruebas hay más de una), y una persona
--    cualquiera:
--
--      begin;
--      insert into public.vinculos (org_id, unidad_id, persona_id, tipo)
--      values ('<org B>', '<unidad de la org A>', '<persona_id>', 'inquilino');
--      rollback;
--      -- Esperado: ERROR "La unidad de este vínculo no pertenece a la misma organización."
--
-- 3) Sigue aceptando el caso normal: en la app, cargar un inquilino desde la
--    ficha de una unidad (Admin → Propietarios → unidad → Datos) y guardar.
--    Tiene que guardarse igual que antes.
--
-- 4) Las pantallas que embeben `vinculos` (Propietarios, Inicio, Cortes, la
--    ficha) siguen cargando: el disparador no cambia las relaciones que ve
--    PostgREST.
-- ─────────────────────────────────────────────────────────────────────────
