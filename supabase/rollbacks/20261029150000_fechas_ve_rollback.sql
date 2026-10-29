-- Reverso de 20261029150000_fechas_ve.sql (ronda 10, B4).
--
-- Vuelve despachar_correos(), garita_avisar() y reabrir_periodo() a como
-- estaban (los mismos reemplazos, al revés) y borra fecha_ve() y
-- fecha_hora_ve().

begin;

do $guarda$
declare r record; v text; malas text := '';
begin
  for r in select * from (values
      ('public.despachar_correos(integer)', 'd20348414484564578a3469ed7940c89'),
      ('public.garita_avisar(uuid)', 'afd9c226b53ff1acfe7916d0a95758fd'),
      ('public.reabrir_periodo(uuid, boolean)', '482c12b7434a33c76696a5ff66d69b81')
    ) as t(firma, md5_esperado) loop
    select md5(prosrc) into v from pg_proc where oid = r.firma::regprocedure;
    if v is distinct from r.md5_esperado then
      malas := malas || format(' %s (md5=%s, se esperaba %s);', r.firma, v, r.md5_esperado);
    end if;
  end loop;
  if malas <> '' then raise exception 'ABORTADA: no son las de la ronda 10:%', malas; end if;
end
$guarda$;

-- Los textos son los de la migración, con las columnas «viejo» y «nuevo» cambiadas de lugar.
do $reemplazo$
declare r record; d text; n int;
begin
  for r in select * from (values
      ('public.despachar_correos(integer)',
       $a$coalesce(to_char(momento_cupo(v_espera) at time zone 'America/Caracas', 'DD/MM HH24:MI'), 'más de un día')$a$,
       $b$coalesce(fecha_hora_ve(momento_cupo(v_espera)), 'más de un día')$b$, 1),
      ('public.garita_avisar(uuid)',
       $a$to_char(r.entrada_en, 'DD/MM/YYYY HH24:MI')$a$,
       $b$fecha_hora_ve(r.entrada_en)$b$, 2),
      ('public.reabrir_periodo(uuid, boolean)',
       $a$to_char(v_enviado, 'DD/MM/YYYY')$a$,
       $b$fecha_ve(v_enviado)$b$, 1)
    ) as t(firma, nuevo, viejo, veces) loop
    d := pg_get_functiondef(r.firma::regprocedure);
    n := (length(d) - length(replace(d, r.viejo, ''))) / length(r.viejo);
    if n <> r.veces then
      raise exception 'ABORTADA: en % el texto a reemplazar aparece % veces (se esperaban %)', r.firma, n, r.veces;
    end if;
    execute replace(d, r.viejo, r.nuevo);
  end loop;
end
$reemplazo$;

do $despues$
declare r record; v text; malas text := '';
begin
  for r in select * from (values
      ('public.despachar_correos(integer)', 'e2b9a8ad1adee36bed93e9ccb80ecdb9'),
      ('public.garita_avisar(uuid)', 'fb811b7a68d35cb071cb3b3f5980e10b'),
      ('public.reabrir_periodo(uuid, boolean)', 'a50623541758d0680d04d968b9ef9c73')
    ) as t(firma, md5_esperado) loop
    select md5(prosrc) into v from pg_proc where oid = r.firma::regprocedure;
    if v is distinct from r.md5_esperado then
      malas := malas || format(' %s (md5=%s, se esperaba %s);', r.firma, v, r.md5_esperado);
    end if;
  end loop;
  if malas <> '' then raise exception 'ABORTADA: no volvieron a las de antes:%', malas; end if;
end
$despues$;

drop function public.fecha_hora_ve(timestamptz);
drop function public.fecha_ve(timestamptz);

commit;
