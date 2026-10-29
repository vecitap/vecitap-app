-- Rollback de 20261029170000_reenviar_sin_duplicar.sql (ronda 10, R10-6).
--
-- Vuelve reenviar_recibo() a la versión de 20261027160000 (md5 9b2cd130…):
-- los mismos tres reemplazos, al revés. No toca la cola.

begin;

do $guarda$
declare v text;
begin
  select md5(prosrc) into v from pg_proc where oid = 'public.reenviar_recibo(uuid)'::regprocedure;
  if v is distinct from '5786e9909401cca6bbacaf9302276efd' then
    raise exception 'ABORTADO: reenviar_recibo no es el de 20261029170000 (md5=%)', v;
  end if;
end
$guarda$;

do $reemplazo$
declare
  d text;
  a1 text := E'declare v_org uuid; v_estado text; c record; n int := 0;\n';
  b1 text := E'declare v_org uuid; v_estado text; c record; n int := 0;\n  v_ya int := 0;   -- Ronda 10\n';
  a2 text := E'    continue when exists (select 1 from correos_malos m where m.correo = lower(btrim(c.destino)));\n';
  b2 text := E'    continue when exists (select 1 from correos_malos m where m.correo = lower(btrim(c.destino)));\n'
          || E'    -- Ronda 10: si a esa dirección ya hay un correo de este recibo esperando\n'
          || E'    -- en la cola (por ejemplo, de «Enviar por correo»), no se duplica.\n'
          || E'    if exists (select 1 from cola_correo q\n'
          || E'                where q.recibo_id = p_recibo and q.estado = ''pendiente''\n'
          || E'                  and q.destino = lower(btrim(c.destino))) then\n'
          || E'      v_ya := v_ya + 1;\n'
          || E'      continue;\n'
          || E'    end if;\n';
  a3 text := E'  if n = 0 then\n';
  b3 text := E'  if n = 0 and v_ya > 0 then\n'
          || E'    raise exception ''Ese recibo ya está en la cola, esperando para salir: no hace falta reenviarlo.'';\n'
          || E'  end if;\n'
          || E'  if n = 0 then\n';
  i int; pares text[][];
begin
  d := pg_get_functiondef('public.reenviar_recibo(uuid)'::regprocedure);
  pares := array[[b1, a1], [b2, a2], [b3, a3]];
  for i in 1..3 loop
    if (length(d) - length(replace(d, pares[i][1], ''))) / length(pares[i][1]) <> 1 then
      raise exception 'ABORTADO: el reemplazo % no aparece exactamente una vez', i;
    end if;
    d := replace(d, pares[i][1], pares[i][2]);
  end loop;
  execute d;
end
$reemplazo$;

do $despues$
declare v text;
begin
  select md5(prosrc) into v from pg_proc where oid = 'public.reenviar_recibo(uuid)'::regprocedure;
  if v is distinct from '9b2cd13086327e530012a9a161526968' then
    raise exception 'ABORTADO: reenviar_recibo no volvió a la versión anterior (md5=%)', v;
  end if;
end
$despues$;

commit;
