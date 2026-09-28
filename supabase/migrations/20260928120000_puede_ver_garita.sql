-- PROPUESTA para el bloque 13 (vista de Garita de solo lectura en Admin:
-- visitas del día + bitácora). SIN APLICAR — la corre Nicolás después de
-- revisar y, si hace falta, renombrar la función.
--
-- Nicolás pidió evaluar "el cambio a puede_garita". Esa función YA EXISTE y
-- es el gate operativo completo del módulo — no se toca acá. Motivo:
-- `permitir_garita` (el gate de TODAS las funciones garita_* de escritura:
-- garita_entrada, garita_avisar, garita_salida, garita_nota) llama a
-- `puede_garita` para decidir si autoriza. Sumarle a `puede_garita` la rama
-- de `junta` le daría a junta las mismas escrituras que a un vigilante
-- (registrar entradas/salidas, escribir bitácora) — el pedido es una vista
-- de SOLO LECTURA. Por eso esta migración crea una función nueva y
-- separada, `puede_ver_garita`, que ninguna función de escritura llama.
--
-- Verificado contra esquema_inicial.sql (dump local, pg_dump 17.11,
-- modificado el 2026-09-27 — cruzado contra el CSV real de garita_entrada
-- de la sesión anterior de este mismo chat y coincide en la parte
-- comparada, así que se usa como referencia de alta confianza, pero no
-- reemplaza confirmar con pg_get_functiondef antes de aplicar esto: ver la
-- consulta de verificación al final del archivo):
--
--   puede_garita(p_edificio) = vigilante de ese edificio (edificios_del_vigilante())
--                              OR puede_operar(org de ese edificio)
--   puede_operar(p_org)      = tiene_rol(p_org, ['propietario_cuenta','administrador'])
--   tiene_rol(p_org, roles)  = existe membresía activa de ESE org con rol = any(roles)
--                              -- no mira edificio: no puede expresar "junta
--                              -- de este edificio nada más", por eso no
--                              -- alcanza para la regla que pidió Nicolás.
--
-- Consecuencia útil de lo anterior: `propietario_cuenta`/`administrador` YA
-- pueden llamar hoy, sin ningún cambio, a garita_bitacora/garita_dentro/
-- garita_directorio/garita_vehiculos para cualquier edificio de su
-- organización (los cuatro autorizan vía permitir_garita -> puede_garita, y
-- su rama `puede_operar` ya los deja pasar). Lo único que falta es `junta`,
-- acotado a su propio edificio.
--
-- `membresias.edificio_id` YA EXISTE y ya está poblado para junta: el CHECK
-- `membresia_alcance` (ver esquema_inicial.sql) obliga a que toda fila con
-- rol='junta' tenga edificio_id NOT NULL — la migración
-- 20260926120000_membresias_multiples_por_organizacion.sql ya normalizó
-- esto. No hace falta ninguna columna ni tabla nueva: esta migración es
-- pura función, cero ALTER TABLE.
--
-- Ámbito deliberadamente chico: esta función es SOLO el gate de
-- autorización. Las funciones que de verdad van a devolver "visitas del
-- día" (garita_dentro no sirve — no tiene parámetro de fecha, solo muestra
-- quién está adentro AHORA) quedan para cuando se empiece a construir el
-- bloque 13, no forman parte de este cambio.

begin;

-- CREATE (no CREATE OR REPLACE) a propósito: si el nombre ya existiera por
-- algún motivo, mejor que falle fuerte acá a pisar algo sin darse cuenta.
CREATE FUNCTION public.puede_ver_garita(p_edificio uuid) RETURNS boolean
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
  select exists (
           select 1 from edificios e
            where e.id = p_edificio and puede_operar(e.org_id)
         )
      or exists (
           select 1 from membresias m
            where m.usuario_id = auth.uid()
              and m.activo
              and m.rol = 'junta'
              and m.edificio_id = p_edificio
         )
$$;

commit;

-- Verificación sugerida ANTES de aplicar esto (no forma parte de la
-- migración) — confirma que esquema_inicial.sql no está desactualizado en
-- las piezas de las que depende esta función:
--   select proname, pg_get_functiondef(oid) from pg_proc
--   where pronamespace = 'public'::regnamespace
--     and proname in ('puede_garita', 'permitir_garita', 'puede_operar',
--                      'tiene_rol', 'edificios_del_vigilante')
--   order by proname;
--
-- Verificación sugerida DESPUÉS de aplicar:
--   select proname, pg_get_functiondef(oid) from pg_proc
--   where proname = 'puede_ver_garita' and pronamespace = 'public'::regnamespace;
