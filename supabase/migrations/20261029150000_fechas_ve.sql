-- Las fechas que escribe la base, en hora de Venezuela y con el formato de la
-- app (ronda 10, bloque B4): «28/10/2026, 4:40 p. m.»; solo fecha,
-- «28/10/2026».
--
-- Aplicada en vecitap-pruebas el 29-oct. SIN APLICAR en vecitap-produccion:
-- la aplica Nicolás, con respaldo previo, después de la revisión cruzada.
-- **Va después de 20261028140000_cupo_por_organizacion.sql** (la guarda exige
-- su despachar_correos()). Rollback:
-- supabase/rollbacks/20261029150000_fechas_ve_rollback.sql.
--
-- QUÉ HABÍA (leído en pruebas; las tres con el mismo md5 que en producción
-- después del Paso 8):
-- · despachar_correos(): el aviso a Vecitap de «se acabó el cupo» decía
--   «alrededor de 29/10 00:00» (sin año, 24 horas).
-- · garita_avisar(): el aviso de visita decía la hora con
--   `to_char(entrada_en, 'DD/MM/YYYY HH24:MI')` **en la zona de la sesión
--   (UTC)**: una visita de las 4:40 p. m. salía «20:40».
-- · reabrir_periodo(): «Los recibos de este mes ya se enviaron el …» con la
--   fecha en UTC (después de las 8 p. m., el día siguiente).
--
-- QUÉ CAMBIA
-- 1. Dos funciones nuevas, las únicas que formatean fechas en la base:
--    fecha_ve(timestamptz) → '28/10/2026' y fecha_hora_ve(timestamptz) →
--    '28/10/2026, 4:40 p. m.', las dos en America/Caracas. Las mismas reglas
--    que `formatoFecha()`/`formatoFechaHora()` de lib/formato.ts.
-- 2. Las tres funciones de arriba las usan. Se aplica como reemplazos exactos
--    dentro de su texto, con su md5 antes y después; nada más cambia.
-- correo_recibo() ya escribía el vencimiento como 'DD/MM/YYYY' de una fecha
-- (no de un instante): no cambia.

begin;

do $guarda$
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
  if to_regprocedure('public.fecha_ve(timestamptz)') is not null then malas := malas || ' fecha_ve ya existe;'; end if;
  if malas <> '' then raise exception 'ABORTADA:%', malas; end if;
end
$guarda$;

create function public.fecha_ve(p timestamptz) returns text
  language sql stable set search_path to 'public'
  as $function$
  select to_char(p at time zone 'America/Caracas', 'DD/MM/YYYY')
$function$;

create function public.fecha_hora_ve(p timestamptz) returns text
  language sql stable set search_path to 'public'
  as $function$
  select to_char(p at time zone 'America/Caracas', 'DD/MM/YYYY, ')
         || ltrim(to_char(p at time zone 'America/Caracas', 'HH12'), '0')
         || to_char(p at time zone 'America/Caracas', ':MI ')
         || case when extract(hour from p at time zone 'America/Caracas') < 12 then 'a. m.' else 'p. m.' end
$function$;

revoke all on function public.fecha_ve(timestamptz) from public, anon;
revoke all on function public.fecha_hora_ve(timestamptz) from public, anon;
grant execute on function public.fecha_ve(timestamptz) to authenticated;
grant execute on function public.fecha_hora_ve(timestamptz) to authenticated;

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
    ) as t(firma, viejo, nuevo, veces) loop
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
      ('public.despachar_correos(integer)', 'd20348414484564578a3469ed7940c89'),
      ('public.garita_avisar(uuid)', 'afd9c226b53ff1acfe7916d0a95758fd'),
      ('public.reabrir_periodo(uuid, boolean)', '482c12b7434a33c76696a5ff66d69b81')
    ) as t(firma, md5_esperado) loop
    select md5(prosrc) into v from pg_proc where oid = r.firma::regprocedure;
    if v is distinct from r.md5_esperado then
      malas := malas || format(' %s (md5=%s, se esperaba %s);', r.firma, v, r.md5_esperado);
    end if;
  end loop;
  if malas <> '' then raise exception 'ABORTADA: no quedaron como se esperaba:%', malas; end if;
end
$despues$;

commit;

-- ─────────────────────────────────────────────────────────────────────────
-- VERIFICACIÓN
-- ─────────────────────────────────────────────────────────────────────────
-- 1. select proname, md5(prosrc) from pg_proc where proname in ('despachar_correos','garita_avisar','reabrir_periodo');
--    -- Esperado: despachar_correos d20348414484564578a3469ed7940c89, garita_avisar afd9c226b53ff1acfe7916d0a95758fd, reabrir_periodo 482c12b7434a33c76696a5ff66d69b81;
--    --   fecha_ve ff704daf3dcd23234bd5619bf203eec6, fecha_hora_ve 44079179f4bffb33e3691cb0101c2182.
-- 2. select fecha_hora_ve('2026-10-28 20:40:00+00'), fecha_hora_ve('2026-10-29 04:05:00+00'),
--           fecha_hora_ve('2026-10-28 16:00:00+00'), fecha_ve('2026-10-29 02:00:00+00');
--    -- Esperado: '28/10/2026, 4:40 p. m.', '29/10/2026, 12:05 a. m.', '28/10/2026, 12:00 p. m.', '28/10/2026'.
