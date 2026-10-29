-- «Reenviar recibo» no duplica un correo que ya espera en la cola (ronda 10,
-- encontrado en la validación del bloque B2, R10-6).
--
-- Aplicada en vecitap-pruebas el 29-oct. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo, después de la revisión cruzada.
-- **Va después de 20261027160000_correos_estado_y_cupo.sql** (la guarda exige
-- su reenviar_recibo()). Rollback:
-- supabase/rollbacks/20261029170000_reenviar_sin_duplicar_rollback.sql.
--
-- POR QUÉ
-- En la validación: se corrigió el correo de 01B, «Enviar por correo» puso en
-- la cola el recibo a la dirección nueva (B1: «manda 2 correos más»), y después
-- «Reenviar recibo» desde la lista de problemas le agregó OTRO a la misma
-- dirección. Los dos iban a salir: el propietario recibía el recibo dos veces.
-- La guarda de reenviar_recibo() solo miraba reenvíos de los últimos 10
-- minutos, no un correo del mismo recibo que todavía no salió.
--
-- QUÉ CAMBIA (tres reemplazos exactos dentro de la función, con md5 antes y
-- después; nada más):
-- · Si a una dirección ya hay un correo de ese recibo esperando en la cola
--   (estado 'pendiente'), no se agrega otro a esa dirección.
-- · Si por eso no se agregó ninguno: «Ese recibo ya está en la cola,
--   esperando para salir: no hace falta reenviarlo.»
-- Los correos ya enviados, fallidos o rebotados no cuentan: reenviar después
-- de eso sigue funcionando como hasta hoy.

begin;

do $guarda$
declare v text;
begin
  select md5(prosrc) into v from pg_proc where oid = 'public.reenviar_recibo(uuid)'::regprocedure;
  if v is distinct from '9b2cd13086327e530012a9a161526968' then
    raise exception 'ABORTADA: reenviar_recibo cambió (md5=%). ¿Falta 20261027160000_correos_estado_y_cupo.sql?', v;
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
  pares := array[[a1, b1], [a2, b2], [a3, b3]];
  for i in 1..3 loop
    if (length(d) - length(replace(d, pares[i][1], ''))) / length(pares[i][1]) <> 1 then
      raise exception 'ABORTADA: el reemplazo % no aparece exactamente una vez', i;
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
  if v is distinct from '5786e9909401cca6bbacaf9302276efd' then
    raise exception 'ABORTADA: reenviar_recibo no quedó como se esperaba (md5=%)', v;
  end if;
end
$despues$;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. select md5(prosrc) from pg_proc where proname = 'reenviar_recibo';
--    -- Esperado: 5786e9909401cca6bbacaf9302276efd
-- 2. Como la administradora, con un recibo que tiene un correo 'pendiente' en
--    la cola a cada una de sus direcciones:
--      select reenviar_recibo('<recibo>');
--    -- Esperado: «Ese recibo ya está en la cola, esperando para salir: no hace
--    --   falta reenviarlo.» y ninguna fila nueva en cola_correo.
--    Con el correo ya enviado (o fallido): devuelve el número de correos y
--    agrega una fila 'reenvio' por dirección, como antes.
