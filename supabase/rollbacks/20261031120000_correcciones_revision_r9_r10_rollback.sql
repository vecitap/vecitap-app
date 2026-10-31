-- Rollback de 20261031120000_correcciones_revision_r9_r10.sql (ronda 10b).
--
-- Vuelve las seis funciones a la versión anterior: los mismos siete
-- reemplazos, al revés. No toca datos (la cola ya encolada queda como está).

begin;

do $guarda$
declare v text; r record; malas text := '';
begin
  for r in select * from (values
      ('public.pagos_desde_cierre(uuid)',   'c17eb556849fb630e4f2e43b83318d2f'),
      ('public.org_campos_del_operador()',  'c43fde43b1187e0c8894da9773f2d07c'),
      ('public.exigir_org_al_dia(uuid)',    'b9c832365abf7318944d6c15f29593d7'),
      ('public.edificio_dentro_del_tope()', 'dcdd9fecaaf51552794b5a0fa2d18268'),
      ('public.destinatarios_de(uuid)',     '2558c045144a6e72adfbd5b8632f4255'),
      ('public.esc_html(text)',             'dc4d15f24644035a3580d97ef58f5b67')
    ) x(firma, md5) loop
    select md5(prosrc) into v from pg_proc where oid = to_regprocedure(r.firma);
    if v is distinct from r.md5 then malas := malas || format(' %s (md5=%s)', r.firma, coalesce(v, 'no existe')); end if;
  end loop;
  if malas <> '' then raise exception 'ABORTADO: no son las de 20261031120000:%', malas; end if;
end
$guarda$;

do $reemplazo$
declare
  r record; d text;
begin
  -- (n, firma, a = antes, b = después de la migración): acá se cambia b → a.
  for r in select * from (values
      (1, 'public.pagos_desde_cierre(uuid)',
          E'  if p_unidad not in (select unidades_visibles()) then\n',
          E'  -- Revisión cruzada r9/r10: sin NOT IN, que con un NULL da NULL y no entra al IF.\n'
          || E'  if p_unidad is null\n'
          || E'     or not exists (select 1 from unidades_visibles() v where v = p_unidad) then\n'),
      (2, 'public.org_campos_del_operador()',
          $a$'fija Vecitap. Escríbanos a hola@vecitap.com si necesita '$a$,
          $b$'fija Vecitap. Escríbanos a info@vecitap.com si necesita '$b$),
      (3, 'public.exigir_org_al_dia(uuid)',
          $a$'mandar correos. Escríbanos a hola@vecitap.com.'$a$,
          $b$'mandar correos. Escríbanos a info@vecitap.com.'$b$),
      (4, 'public.edificio_dentro_del_tope()',
          $a$'de uno, escríbanos a hola@vecitap.com y le ampliamos '$a$,
          $b$'de uno, escríbanos a info@vecitap.com y le ampliamos '$b$),
      (5, 'public.edificio_dentro_del_tope()',
          $a$'hola@vecitap.com para ampliarlo.', v_tope;$a$,
          $b$'info@vecitap.com para ampliarlo.', v_tope;$b$),
      (6, 'public.destinatarios_de(uuid)',
          $a$         nullif(btrim(coalesce(pe.correo, '')), ''),$a$ || E'\n',
          $b$         nullif(lower(btrim(coalesce(pe.correo, ''))), ''),   -- Ronda 10b: en minúsculas, como la cola$b$ || E'\n'),
      (7, 'public.esc_html(text)',
          $a$  select replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;')$a$ || E'\n',
          $b$  select replace(replace(replace(replace(replace(coalesce(t, ''), '&', '&amp;'), '<', '&lt;'), '>', '&gt;'), '"', '&quot;'), '''', '&#39;')$b$ || E'\n')
    ) x(n, firma, a, b) order by n loop
    d := pg_get_functiondef(to_regprocedure(r.firma));
    if (length(d) - length(replace(d, r.b, ''))) / length(r.b) <> 1 then
      raise exception 'ABORTADO: el reemplazo % (%) no aparece exactamente una vez', r.n, r.firma;
    end if;
    execute replace(d, r.b, r.a);
  end loop;
end
$reemplazo$;

do $despues$
declare v text; r record; malas text := '';
begin
  for r in select * from (values
      ('public.pagos_desde_cierre(uuid)',   '7b86d8acf44f957f57a87a45b1558c24'),
      ('public.org_campos_del_operador()',  '0b28110290b22a2a5d3dd9170720f5be'),
      ('public.exigir_org_al_dia(uuid)',    '61529947264f7088ce8d2da7187ea44e'),
      ('public.edificio_dentro_del_tope()', 'f1f555e84ab8fe93cf5ca445ed32c048'),
      ('public.destinatarios_de(uuid)',     '2be2e76b2ed4f1102ab8081b0b870776'),
      ('public.esc_html(text)',             'a5f0a43bf349fe7139e9702fe789c6d1')
    ) x(firma, md5) loop
    select md5(prosrc) into v from pg_proc where oid = to_regprocedure(r.firma);
    if v is distinct from r.md5 then malas := malas || format(' %s (md5=%s)', r.firma, v); end if;
  end loop;
  if malas <> '' then raise exception 'ABORTADO: no volvieron a la versión anterior:%', malas; end if;
end
$despues$;

commit;
