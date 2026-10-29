-- El envío de un mes, con detalle (ronda 10, bloques B1 y B2).
--
-- Aplicada en vecitap-pruebas el 29-oct. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo, después de la revisión cruzada.
-- **Va después de 20261028130000_avisos_resend.sql** (usa los eventos de
-- Resend) y de 20261027140000_recibo_titulares_sin_bs.sql (usa
-- correo_recibo()). Rollback:
-- supabase/rollbacks/20261029130000_estado_envio_periodo_rollback.sql.
--
-- POR QUÉ
-- · B1: «Enviar por correo» en un mes ya enviado no avisaba nada. La cola no
--   duplica (el índice cola_un_correo_por_recibo frena un mismo recibo a la
--   misma dirección), pero la pantalla no decía que el mes ya había salido ni
--   cuántos correos nuevos iban a salir de verdad.
-- · B2: Cortes decía «86 enviados, 94 en cola, 4 fallidos, 1 rebotado» sin
--   decir cuáles; y esos números (resumen_correos) eran de TODOS los meses de
--   la administradora, y «direcciones que rebotaron» contaba `correos_malos`
--   de todas las administradoras.
--
-- QUÉ HACE: estado_envio_periodo(mes) → un jsonb con, para ESE mes:
--   enviado_en            cuándo se marcó enviado (null si no)
--   enviados / en_cola / fallidos / rebotados
--                         el último correo de cada recibo y dirección
--   nuevos                cuántos correos saldrían si se toca «Enviar» ahora
--                         (los destinatarios de correo_recibo() que todavía no
--                         tienen su correo del mes en la cola y no rebotaron)
--   sin_correo            recibos sin ningún destinatario
--   problemas             [{unidad_id, codigo, recibo_id, destino, motivo,
--                         en_cola}] en palabras: «Dirección inválida»,
--                         «Rebotó», «Lo marcó como spam», «Resend no lo
--                         aceptó», «Sin correo»…
-- Solo para quien opera la organización (puede_operar). No escribe nada.
-- resumen_correos() no se toca (la consola y otras pantallas no lo usan;
-- Cortes deja de usarlo).

begin;

do $guarda$
begin
  if to_regprocedure('public.estado_envio_periodo(uuid)') is not null then
    raise exception 'ABORTADA: estado_envio_periodo ya existe';
  end if;
  if to_regprocedure('public.registrar_evento_correo(text, text, text, timestamptz)') is null then
    raise exception 'ABORTADA: falta 20261028130000_avisos_resend.sql';
  end if;
end
$guarda$;

create function public.estado_envio_periodo(p_periodo uuid)
  returns jsonb
  language plpgsql
  stable
  security definer
  set search_path to 'public'
  as $function$
declare
  v_org uuid; v_enviado timestamptz;
  r record; c record; q record;
  v_alguno boolean; v_destino text; v_malo text;
  v_nuevos int := 0; v_sin int := 0;
  v_env int := 0; v_cola int := 0; v_fall int := 0; v_reb int := 0;
  v_problemas jsonb := '[]'::jsonb;
begin
  select p.org_id, p.enviado_en into v_org, v_enviado from periodos p where p.id = p_periodo;
  if v_org is null or not puede_operar(v_org) then raise exception 'Sin permiso'; end if;

  -- Lo que saldría ahora, y lo que no puede salir.
  for r in select rc.id, rc.unidad_id, u.codigo
             from recibos rc join unidades u on u.id = rc.unidad_id
            where rc.periodo_id = p_periodo loop
    v_alguno := false;
    for c in select * from correo_recibo(r.id) loop
      v_alguno := true;
      v_destino := lower(btrim(c.destino));
      continue when exists (select 1 from cola_correo k
                             where k.recibo_id = r.id and k.destino = v_destino
                               and k.tipo = 'recibo' and k.estado <> 'cancelado');
      select m.motivo into v_malo from correos_malos m where m.correo = v_destino;
      if found then
        v_problemas := v_problemas || jsonb_build_object(
          'unidad_id', r.unidad_id, 'codigo', r.codigo, 'recibo_id', r.id, 'destino', v_destino, 'en_cola', false,
          'motivo', case when v_malo ilike '%complained%' then 'No se le manda: esa persona marcó un correo anterior como spam'
                         when v_malo ilike '%bounced%' then 'No se le manda: un correo anterior a esta dirección rebotó'
                         else 'No se le manda: Resend dijo que la dirección no es válida' end);
      else
        v_nuevos := v_nuevos + 1;
      end if;
    end loop;
    if not v_alguno then
      v_sin := v_sin + 1;
      v_problemas := v_problemas || jsonb_build_object(
        'unidad_id', r.unidad_id, 'codigo', r.codigo, 'recibo_id', r.id, 'destino', null, 'en_cola', false,
        'motivo', 'Sin correo: nadie de la unidad tiene correo cargado con «recibe corte»');
    end if;
  end loop;

  -- Cómo le fue a lo que ya está en la cola: el último correo de cada recibo y dirección.
  for q in select distinct on (k.recibo_id, k.destino) k.*, u.codigo
             from cola_correo k
             join recibos rc on rc.id = k.recibo_id
             join unidades u on u.id = rc.unidad_id
            where rc.periodo_id = p_periodo and k.tipo in ('recibo', 'reenvio') and k.estado <> 'cancelado'
            order by k.recibo_id, k.destino, k.encolado_en desc loop
    if q.evento in ('bounced', 'complained') then
      v_reb := v_reb + 1;
      v_problemas := v_problemas || jsonb_build_object(
        'unidad_id', q.unidad_id, 'codigo', q.codigo, 'recibo_id', q.recibo_id, 'destino', q.destino, 'en_cola', true,
        'motivo', case q.evento when 'complained' then 'Lo marcó como spam'
                                else 'Rebotó: la dirección no existe o no recibe correos' end);
    elsif q.estado = 'fallido' then
      v_fall := v_fall + 1;
      v_problemas := v_problemas || jsonb_build_object(
        'unidad_id', q.unidad_id, 'codigo', q.codigo, 'recibo_id', q.recibo_id, 'destino', q.destino, 'en_cola', true,
        'motivo', case when q.ultimo_error ilike '%invalid%' or q.ultimo_error ~ '\m422\M' then 'Dirección inválida: Resend no la aceptó'
                       when q.ultimo_error ~ '\m429\M' or q.ultimo_error ilike '%rate%' then 'Resend no lo aceptó (demasiados envíos a la vez), después de 3 intentos'
                       when q.ultimo_error ~ '\m40[13]\M' or q.ultimo_error ilike '%api key%' then 'Resend rechazó la clave de envío: avísele a Vecitap'
                       else 'No salió después de 3 intentos' end);
    elsif q.estado = 'pendiente' then
      v_cola := v_cola + 1;
    elsif q.estado = 'enviado' then
      v_env := v_env + 1;
    end if;
  end loop;

  return jsonb_build_object(
    'enviado_en', v_enviado, 'enviados', v_env, 'en_cola', v_cola, 'fallidos', v_fall, 'rebotados', v_reb,
    'nuevos', v_nuevos, 'sin_correo', v_sin, 'problemas', v_problemas);
end $function$;

revoke all on function public.estado_envio_periodo(uuid) from public, anon;
grant execute on function public.estado_envio_periodo(uuid) to authenticated;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. select md5(prosrc), prosecdef, array_to_string(proacl, ',') from pg_proc where proname = 'estado_envio_periodo';
--    -- Esperado: 1ffdc2eba5960fa1d868b676ffe69136, true, postgres=X/postgres,authenticated=X/postgres.
-- 2. Como la administradora (sub en request.jwt.claims, role authenticated):
--      select estado_envio_periodo('<un mes cerrado sin enviar>');
--      -- enviado_en null, nuevos = los correos del mes, enviados 0
--      select * from encolar_recibos('<ese mes>');
--      select estado_envio_periodo('<ese mes>');
--      -- enviado_en con fecha, nuevos 0, en_cola = los encolados
--    Con un correo en correos_malos, uno fallido y una unidad sin correo:
--    `problemas` trae las tres con su motivo. Como otra administradora → «Sin permiso».
