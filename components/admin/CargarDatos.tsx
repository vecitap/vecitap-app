"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Aviso, Button, Card, Confirmar, Input, Select, Textarea } from "@/components/ui";
import { leerHojas } from "@/lib/admin/archivos-tabla";
import {
  CAMPOS,
  elegirHoja,
  filaDeEncabezados,
  leerTextoPegado,
  proponerColumnas,
  type Campo,
  type Propuesta,
} from "@/lib/admin/cargar-datos/columnas";
import {
  analizar,
  SIN_DECISIONES,
  type Decisiones,
  type Dudoso,
  type FilaPrevia,
  type Nota,
  type PersonaOrg,
} from "@/lib/admin/cargar-datos/analisis";
import { agruparAvisos, contarFilas, type GrupoAviso } from "@/lib/admin/cargar-datos/avisos";
import { TIPOS_UNIDAD, type TipoUnidad, type UnidadConPaga } from "@/lib/admin/tipos";
import { mensajeDeError } from "@/lib/errores";
import { nf } from "@/lib/formato";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { Json } from "@/types/supabase";

/** Columnas de la previa, en este orden; solo se muestran las que el archivo trae. */
const COLUMNAS_PREVIA: Exclude<Campo, "ignorar" | "codigo">[] = [
  "alicuota",
  "saldo",
  "saldo_hon",
  "paga",
  "tratamiento",
  "propietario",
  "documento",
  "telefono",
  "correo",
  "correo_respaldo",
  "corte",
  "inq_tratamiento",
  "inquilino",
  "inq_documento",
  "inq_telefono",
  "inq_correo",
  "inq_correo_respaldo",
  "inq_corte",
  "nota",
];

/**
 * Los datos con que se juntan las personas (ronda 7): en una fila que espera
 * «¿es la misma persona?», se ofrecen para corregir los que la fila trae.
 */
const CONTACTO: Campo[] = ["telefono", "correo", "correo_respaldo", "documento", "inq_telefono", "inq_correo", "inq_correo_respaldo", "inq_documento"];

/** La plantilla de Gustavo, tal cual (public/; solo trae datos de ejemplo). */
const PLANTILLA = "/Vecitap-plantilla-carga.xlsx";

const ESTADO: Record<FilaPrevia["estado"], { texto: string; color: string }> = {
  nueva: { texto: "Se carga", color: "var(--tinta)" },
  actualizar: { texto: "Se actualiza", color: "var(--azul)" },
  omitir: { texto: "Se omite", color: "var(--tenue)" },
  no: { texto: "No se carga", color: "var(--rojo)" },
};

/**
 * La de `cerrar_periodo()` (`edificios.tolerancia_alicuota`, 0,01 en todos los
 * edificios al 25-oct). Si un edificio la cambia, este aviso no lo sabe.
 */
const TOLERANCIA_ALICUOTAS = 0.01;

type Lectura = { nombre: string; crudas: string[][]; encabezados: number; propuestas: Propuesta[] };
type Hecho = {
  unidades_creadas: number;
  unidades_actualizadas: number;
  personas_nuevas: number;
  personas_completadas: number;
  vinculos_nuevos: number;
  vinculos_actualizados?: number;
  notas_guardadas?: number;
};

/**
 * «Cargar datos» (ronda 5, casos 56 y 57). Reemplaza a «Importar unidades».
 *
 * La administradora sube su Excel o CSV tal cual (o lo pega), y en un minuto
 * ve si quedó bien:
 *  1. el sistema propone qué es cada columna y ella la corrige
 *     (lib/admin/cargar-datos/columnas.ts);
 *  2. la previa muestra todos los datos de cada fila, lo dudoso en ámbar con
 *     la razón al lado, y la lista de filas que NO se cargan con su motivo
 *     (lib/admin/cargar-datos/analisis.ts);
 *  3. **nada se guarda** hasta que confirma; entonces todo va en una sola
 *     llamada, `importar_unidades()`
 *     (supabase/migrations/20261018140000_importar_unidades.sql), que guarda
 *     todo o nada.
 */
export function CargarDatos({
  orgId,
  edificioId,
  unidades,
  onVolver,
}: {
  orgId: string;
  edificioId: string;
  unidades: UnidadConPaga[];
  onVolver: () => void;
}) {
  const router = useRouter();
  const [lectura, setLectura] = useState<Lectura | null>(null);
  const [columnas, setColumnas] = useState<Campo[]>([]);
  const [dec, setDec] = useState<Decisiones>(SIN_DECISIONES);
  const [pegado, setPegado] = useState("");
  const [verPegar, setVerPegar] = useState(false);
  const [leyendo, setLeyendo] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [personas, setPersonas] = useState<PersonaOrg[] | null>(null);
  const [hayCierres, setHayCierres] = useState<boolean | null>(null);
  const [notas, setNotas] = useState<Record<string, string> | null>(null);
  const [confirmar, setConfirmar] = useState(false);
  const [guardando, setGuardando] = useState(false);
  const [hecho, setHecho] = useState<Hecho | null>(null);
  /**
   * Correcciones hechas en la previa (ronda 7, caso 79): celda del archivo
   * (`fila:columna`, índices de `crudas`) → valor nuevo. Se aplican sobre las
   * filas leídas y todo vuelve a pasar por `analizar()`, la misma función que
   * lee el archivo: no hay reglas aparte para lo corregido, y la pregunta
   * «¿es la misma persona?» se vuelve a hacer sola. No se guarda nada hasta
   * confirmar la carga.
   */
  const [ediciones, setEdiciones] = useState<Record<string, string>>({});

  // Lo que ya existe en la administradora: personas (para no duplicarlas) y
  // si el edificio tiene meses cerrados (el saldo inicial ya no se usa).
  useEffect(() => {
    let vivo = true;
    const supabase = crearClienteNavegador();
    Promise.all([
      supabase
        .from("personas")
        .select("id,prefijo,nombre,documento,telefono,correo,correo_respaldo,vinculos(hasta,unidades(codigo))")
        .eq("org_id", orgId),
      supabase.from("periodos").select("id", { count: "exact", head: true }).eq("edificio_id", edificioId).eq("estado", "cerrado"),
      // Las notas de las unidades que ya existen (caso 74), para mostrar qué cambia.
      supabase.from("notas_unidad").select("unidad_id,nota").eq("org_id", orgId),
    ]).then(([p, c, n]) => {
      if (!vivo) return;
      if (p.error || c.error || n.error) return setError(mensajeDeError(p.error || c.error || n.error));
      setNotas(Object.fromEntries((n.data ?? []).map((x) => [x.unidad_id, x.nota])));
      setPersonas(
        (p.data ?? []).map((x) => ({
          id: x.id,
          prefijo: x.prefijo,
          nombre: x.nombre,
          documento: x.documento,
          telefono: x.telefono,
          correo: x.correo,
          correo_respaldo: x.correo_respaldo,
          unidades: (x.vinculos ?? []).filter((v) => !v.hasta && v.unidades).map((v) => v.unidades!.codigo),
        }))
      );
      setHayCierres((c.count ?? 0) > 0);
    });
    return () => {
      vivo = false;
    };
  }, [orgId, edificioId]);

  function abrir(nombre: string, crudas: string[][]) {
    if (!crudas.some((f) => f.some((c) => String(c ?? "").trim()))) {
      setError("El archivo no tiene datos.");
      return;
    }
    const encabezados = filaDeEncabezados(crudas);
    const propuestas = proponerColumnas(crudas, encabezados);
    setLectura({ nombre, crudas, encabezados, propuestas });
    setColumnas(propuestas.map((p) => p.campo));
    setDec(SIN_DECISIONES);
    setEdiciones({});
    setHecho(null);
  }

  async function leerArchivo(file: File | undefined) {
    if (!file) return;
    setError(null);
    setLeyendo(true);
    try {
      const hoja = elegirHoja(await leerHojas(file));
      if ("error" in hoja) setError(hoja.error);
      else
        abrir(
          hoja.nombre ? `la hoja «${hoja.nombre}» de ${file.name}` : file.name,
          hoja.filas.map((f) => f.map((c) => String(c ?? "").trim()))
        );
    } catch (e) {
      setError(mensajeDeError(e));
    }
    setLeyendo(false);
  }

  // Las filas del archivo con las correcciones de la previa encima.
  const crudas = useMemo(() => {
    if (!lectura) return null;
    if (!Object.keys(ediciones).length) return lectura.crudas;
    const copia = lectura.crudas.map((f) => [...f]);
    for (const [k, v] of Object.entries(ediciones)) {
      const [i, j] = k.split(":").map(Number);
      if (!copia[i]) continue;
      while (copia[i].length <= j) copia[i].push("");
      copia[i][j] = v;
    }
    return copia;
  }, [lectura, ediciones]);

  const resultado = useMemo(() => {
    if (!lectura || !crudas || !personas || hayCierres === null || !notas) return null;
    return analizar(crudas, lectura.encabezados, columnas, { unidades, personas, hayCierres, notas }, dec);
  }, [lectura, crudas, columnas, personas, hayCierres, notas, unidades, dec]);

  const grupos = useMemo(() => (resultado ? agruparAvisos(resultado.filas) : []), [resultado]);
  const semaforo = useMemo(() => (resultado ? contarFilas(resultado.filas) : null), [resultado]);

  /** La celda de una fila (número de Excel) y un campo, con las correcciones encima. */
  const celdaDe = (fila: number, campo: Campo) => {
    const j = columnas.indexOf(campo);
    return j < 0 || !crudas ? "" : String(crudas[fila - 1]?.[j] ?? "");
  };
  const fueCorregida = (fila: number, campo: Campo) => {
    const j = columnas.indexOf(campo);
    return j >= 0 && `${fila - 1}:${j}` in ediciones;
  };
  function corregir(fila: number, campo: Campo, valor: string) {
    const j = columnas.indexOf(campo);
    if (j < 0) return;
    setEdiciones((e) => ({ ...e, [`${fila - 1}:${j}`]: valor.trim() }));
  }
  const corregidas = Object.keys(ediciones).length;

  const sinCodigo = lectura && !columnas.includes("codigo");
  const aCargar = resultado ? resultado.carga.filas.length : 0;
  const porElegir = resultado ? resultado.resumen.porElegir : 0;
  // Con los 5 decimales de una alícuota: «99,99993 %», no un «99,9999 %» redondeado.
  const sumaTexto = resultado ? `${nf(5).format(resultado.resumen.sumaAlicuotas)} %` : "";
  const fueraDeTolerancia = !!resultado && Math.abs(resultado.resumen.sumaAlicuotas - 100) > TOLERANCIA_ALICUOTAS;

  function elegirColumna(i: number, campo: Campo) {
    setColumnas((cs) => cs.map((c, j) => (j === i ? campo : c === campo && campo !== "ignorar" ? "ignorar" : c)));
  }

  async function cargar() {
    if (!resultado) return;
    setConfirmar(false);
    setGuardando(true);
    setError(null);
    const supabase = crearClienteNavegador();
    const { data, error: e } = await supabase.rpc("importar_unidades", {
      p_edificio: edificioId,
      p_personas: resultado.carga.personas as unknown as Json,
      p_filas: resultado.carga.filas as unknown as Json,
    });
    setGuardando(false);
    if (e) return setError(mensajeDeError(e));
    setHecho(data as unknown as Hecho);
    router.refresh();
  }

  /* ───────────── pantalla ───────────── */

  if (hecho) {
    return (
      <Card>
        <Aviso tono="ok" titulo="Datos cargados">
          {hecho.unidades_creadas} unidades nuevas
          {hecho.unidades_actualizadas ? `, ${hecho.unidades_actualizadas} actualizadas` : ""}. {hecho.personas_nuevas} personas
          nuevas
          {hecho.personas_completadas ? `, ${hecho.personas_completadas} fichas existentes completadas` : ""}.
          {hecho.vinculos_actualizados ? ` Se cambió «recibe el corte» en ${hecho.vinculos_actualizados}.` : ""}
          {hecho.notas_guardadas ? ` ${hecho.notas_guardadas} ${hecho.notas_guardadas === 1 ? "nota guardada" : "notas guardadas"} (solo las ve la administración).` : ""}
        </Aviso>
        <div style={{ marginTop: 14 }}>
          <Button type="button" onClick={onVolver}>
            Volver a Propietarios
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: "var(--font-titulos)", fontSize: 16 }}>Cargar datos</h2>
            <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--tenue)", maxWidth: 620, lineHeight: 1.5 }}>
              Suba su planilla tal como la tiene (Excel o CSV): unidad, alícuota, saldo, propietario, teléfono,
              correos e inquilino, en cualquier orden. Antes de guardar va a ver qué entendió el sistema de cada
              fila. <b>Nada se guarda hasta que usted confirme.</b>
            </p>
            <p style={{ margin: "6px 0 0", fontSize: 12.5, color: "var(--tenue)", maxWidth: 620, lineHeight: 1.5 }}>
              ¿Empieza de cero? Descargue la plantilla, llene la hoja «Unidades» y súbala aquí.
            </p>
          </div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "flex-end" }}>
            <a href={PLANTILLA} download className="btn btn-secundario btn-mini" style={{ textDecoration: "none" }}>
              Descargar plantilla
            </a>
            <Button type="button" variante="secundario" mini onClick={onVolver}>
              Volver
            </Button>
          </div>
        </div>
        <input
          type="file"
          accept=".xlsx,.xls,.csv"
          disabled={leyendo}
          onChange={(e) => {
            leerArchivo(e.target.files?.[0]);
            // Validación de la ronda 7: sin esto, después de «Descartar» volver
            // a elegir el mismo archivo no hacía nada (el navegador no avisa de
            // un cambio si el archivo es el mismo).
            e.target.value = "";
          }}
          className="control"
          style={{ padding: 10, marginTop: 14 }}
        />
        <div style={{ marginTop: 10 }}>
          <button
            type="button"
            onClick={() => setVerPegar(!verPegar)}
            style={{ background: "none", border: "none", padding: 0, color: "var(--tenue)", fontSize: 12.5, textDecoration: "underline", cursor: "pointer" }}
          >
            {verPegar ? "Ocultar" : "O pegue las filas desde Excel"}
          </button>
          {verPegar && (
            <div style={{ marginTop: 8, display: "grid", gap: 8 }}>
              <Textarea value={pegado} onChange={(e) => setPegado(e.target.value)} rows={6} className="mono" style={{ fontSize: 12.5 }} />
              <div>
                <Button type="button" variante="secundario" mini disabled={!pegado.trim()} onClick={() => abrir("lo pegado", leerTextoPegado(pegado))}>
                  Leer lo pegado
                </Button>
              </div>
            </div>
          )}
        </div>
        {error && (
          <div style={{ marginTop: 12 }}>
            <Aviso tono="rojo" titulo="No se pudo completar">
              {error}
            </Aviso>
          </div>
        )}
      </Card>

      {lectura && (
        <Card>
          <h3 style={{ margin: 0, fontSize: 14 }}>1. Qué es cada columna</h3>
          <p style={{ margin: "3px 0 12px", fontSize: 12.5, color: "var(--tenue)" }}>
            {lectura.encabezados >= 0
              ? `Los encabezados están en la fila ${lectura.encabezados + 1} de ${lectura.nombre}.`
              : `${lectura.nombre} no tiene encabezados: las columnas se reconocieron por su contenido.`}{" "}
            El sistema propuso cada una; si alguna está mal, cámbiela y la previa se actualiza sola.
          </p>
          <div style={{ display: "grid", gap: 10, gridTemplateColumns: "repeat(auto-fill,minmax(210px,1fr))" }}>
            {columnas.map((campo, i) => {
              const ejemplos = lectura.crudas
                .slice(lectura.encabezados + 1)
                .map((f) => f[i])
                .filter(Boolean)
                .slice(0, 2);
              return (
                <div key={i} style={{ border: "1px solid var(--linea)", borderRadius: "var(--radio-chico)", padding: 10, background: campo === "ignorar" ? "var(--fondo)" : undefined }}>
                  <div style={{ fontSize: 12.5, fontWeight: 600, overflowWrap: "anywhere" }}>
                    {lectura.encabezados >= 0 && lectura.crudas[lectura.encabezados][i] ? `«${lectura.crudas[lectura.encabezados][i]}»` : `Columna ${i + 1}`}
                  </div>
                  <div className="mono" style={{ fontSize: 11.5, color: "var(--tenue)", margin: "2px 0 6px", overflowWrap: "anywhere" }}>
                    {ejemplos.join(" · ") || "vacía"}
                  </div>
                  <Select value={campo} onChange={(e) => elegirColumna(i, e.target.value as Campo)} style={{ padding: "6px 8px", fontSize: 13 }}>
                    {(Object.keys(CAMPOS) as Campo[]).map((k) => (
                      <option key={k} value={k}>
                        {CAMPOS[k]}
                      </option>
                    ))}
                  </Select>
                  <div style={{ fontSize: 11, color: "var(--tenue)", marginTop: 4 }}>
                    {campo === lectura.propuestas[i].campo ? lectura.propuestas[i].razon : "elegido a mano"}
                  </div>
                </div>
              );
            })}
          </div>
          {sinCodigo && (
            <div style={{ marginTop: 12 }}>
              <Aviso tono="rojo" titulo="Falta la columna del código">
                Elija cuál columna tiene el código de la unidad (01A, PB-1…). Sin ella no se puede cargar nada.
              </Aviso>
            </div>
          )}
        </Card>
      )}

      {lectura && !resultado && !error && <p style={{ fontSize: 13, color: "var(--tenue)" }}>Revisando lo que ya existe en la administradora…</p>}

      {resultado && !sinCodigo && (
        <>
          <Card>
            <h3 style={{ margin: 0, fontSize: 14 }}>2. Qué va a pasar</h3>
            {semaforo && (
              <p style={{ margin: "8px 0 0", fontSize: 14, fontWeight: 600, lineHeight: 1.5 }}>
                <span style={{ color: "var(--tinta)" }}>{semaforo.bien} {semaforo.bien === 1 ? "fila bien" : "filas bien"}</span>
                {" · "}
                <span style={{ color: "var(--ambar)" }}>{semaforo.ambar} con avisos</span>
                {" · "}
                <span style={{ color: "var(--rojo)" }}>{semaforo.rojo} con errores</span>
              </p>
            )}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, margin: "10px 0 4px" }}>
              <Chip color="var(--tinta)">{resultado.resumen.nuevas} unidades nuevas</Chip>
              {resultado.resumen.actualizar > 0 && <Chip color="var(--azul)">{resultado.resumen.actualizar} se actualizan</Chip>}
              {resultado.resumen.omitir > 0 && <Chip color="var(--tenue)">{resultado.resumen.omitir} ya existen y se omiten</Chip>}
              {resultado.resumen.noSeCargan > 0 && <Chip color="var(--rojo)">{resultado.resumen.noSeCargan} no se cargan</Chip>}
              {resultado.resumen.conObservaciones > 0 && <Chip color="var(--ambar)">{resultado.resumen.conObservaciones} con observaciones</Chip>}
              <Chip color="var(--tinta-2)">
                {resultado.resumen.personasNuevas} personas nuevas
                {resultado.resumen.personasExistentes ? ` · ${resultado.resumen.personasExistentes} ya existían` : ""}
              </Chip>
            </div>
            <p style={{ fontSize: 12.5, color: "var(--tenue)", margin: "6px 0 0" }}>
              {resultado.resumen.leidas} filas leídas. Con esta carga las alícuotas del edificio sumarían{" "}
              <b>{sumaTexto}</b>.
            </p>
            {/* Avisa siempre que no dé 100 exacto, con la suma real; nunca bloquea la carga. */}
            {Math.abs(resultado.resumen.sumaAlicuotas - 100) > 0.000005 && (
              <div style={{ marginTop: 10 }}>
                {Math.abs(resultado.resumen.sumaAlicuotas - 100) > TOLERANCIA_ALICUOTAS ? (
                  <Aviso tono="ambar" titulo={`Las alícuotas van a sumar ${sumaTexto}, no 100 %`}>
                    Puede cargar igual y corregir después, pero el mes no se podrá cerrar hasta que cuadren.
                  </Aviso>
                ) : (
                  <Aviso tono="azul" titulo={`Las alícuotas van a sumar ${sumaTexto}`}>
                    No es 100 exacto, pero está dentro de la tolerancia del cierre ({TOLERANCIA_ALICUOTAS.toLocaleString("es-VE")}): el mes se puede cerrar.
                  </Aviso>
                )}
              </div>
            )}
            {resultado.resumen.faltanColumnas.length > 0 && (
              <div style={{ marginTop: 10 }}>
                <Aviso tono="ambar" titulo="Faltan columnas que la plantilla pide">
                  El archivo no trae {resultado.resumen.faltanColumnas.map((c) => `«${c}»`).join(", ")}. Puede cargar igual; si la
                  columna está en el archivo con otro nombre, elíjala arriba en «Qué es cada columna».
                </Aviso>
              </div>
            )}
            {resultado.resumen.saldoIgnorado && (
              <div style={{ marginTop: 10 }}>
                <Aviso tono="ambar" titulo="El saldo no se va a cargar">
                  Este edificio ya tiene meses cerrados: el saldo inicial solo se usa antes del primer cierre. Para
                  corregir una deuda use una exoneración o un cargo puntual.
                </Aviso>
              </div>
            )}
          </Card>

          {grupos.length > 0 && (
            <Card>
              <h3 style={{ margin: 0, fontSize: 14 }}>Avisos</h3>
              <p style={{ margin: "3px 0 6px", fontSize: 12.5, color: "var(--tenue)", lineHeight: 1.5 }}>
                Toque «ver más» para ver las filas. Lo que se puede corregir se corrige aquí mismo, sin volver a subir el
                archivo: la previa se revisa otra vez sola.
                {corregidas > 0 && (
                  <b style={{ color: "var(--tinta)" }}>
                    {" "}
                    {corregidas === 1 ? "1 corrección hecha" : `${corregidas} correcciones hechas`}: se guardan solo al confirmar la carga.
                  </b>
                )}
              </p>
              {grupos.map((g) => (
                <GrupoAvisos
                  key={g.clave}
                  grupo={g}
                  columnas={columnas}
                  celdaDe={celdaDe}
                  fueCorregida={fueCorregida}
                  corregir={corregir}
                  estacionamiento={dec.estacionamiento}
                  elegirEstacionamiento={(fila, si) => setDec({ ...dec, estacionamiento: { ...dec.estacionamiento, [fila]: si } })}
                />
              ))}
            </Card>
          )}

          {resultado.filas.some((f) => f.existente?.cambios.length) && (
            <Card>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", alignItems: "baseline" }}>
                <h3 style={{ margin: 0, fontSize: 14 }}>Unidades que ya existen</h3>
                <div style={{ display: "flex", gap: 8 }}>
                  <Button
                    type="button"
                    mini
                    variante="secundario"
                    onClick={() =>
                      setDec({
                        ...dec,
                        actualizar: Object.fromEntries(resultado.filas.filter((f) => f.existente?.cambios.length).map((f) => [f.clave, true])),
                      })
                    }
                  >
                    Actualizar todas
                  </Button>
                  <Button type="button" mini variante="secundario" onClick={() => setDec({ ...dec, actualizar: {} })}>
                    Omitir todas
                  </Button>
                </div>
              </div>
              <p style={{ margin: "3px 0 10px", fontSize: 12.5, color: "var(--tenue)" }}>
                Por omisión no se tocan. Marque «Actualizar» para aplicar los cambios de abajo. El propietario o el
                inquilino nunca se cambian desde aquí; los datos de una persona solo se completan si estaban vacíos.
              </p>
              {resultado.filas
                .filter((f) => f.existente?.cambios.length)
                .map((f) => (
                  <label key={f.fila} style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: "1px solid var(--linea)", fontSize: 13.5, alignItems: "flex-start" }}>
                    <input
                      type="checkbox"
                      checked={!!dec.actualizar[f.clave]}
                      onChange={(e) => setDec({ ...dec, actualizar: { ...dec.actualizar, [f.clave]: e.target.checked } })}
                      style={{ marginTop: 3 }}
                    />
                    <span>
                      <b className="mono">{f.codigo}</b> (fila {f.fila}) · Actualizar
                      <span style={{ display: "block", color: "var(--tinta-2)", fontSize: 12.5 }}>{f.existente!.cambios.join(" · ")}</span>
                    </span>
                  </label>
                ))}
            </Card>
          )}

          {resultado.dudosos.length > 0 && (
            <Card>
              <h3 style={{ margin: 0, fontSize: 14, color: "var(--ambar)" }}>Personas para revisar</h3>
              <p style={{ margin: "3px 0 10px", fontSize: 12.5, color: "var(--tenue)" }}>
                Se juntan solas cuando tienen el mismo nombre y comparten el correo, el teléfono o la cédula. Estas no
                son seguras: elija. Las que comparten un dato pero tienen otro nombre no tienen respuesta por omisión.
              </p>
              {resultado.dudosos.map((d) => (
                <PreguntaPersona
                  key={d.clave}
                  d={d}
                  elegir={(valor) => setDec({ ...dec, personas: { ...dec.personas, [d.clave]: valor } })}
                />
              ))}
            </Card>
          )}

          <Card style={{ padding: 0, overflow: "hidden" }}>
            <div style={{ padding: "16px 18px 6px" }}>
              <h3 style={{ margin: 0, fontSize: 14 }}>3. Lo que dice su archivo</h3>
              <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--tenue)" }}>
                En ámbar, lo dudoso, con la razón debajo. El tipo de unidad se puede cambiar aquí.
              </p>
            </div>
            <div className="tabla-scroll" style={{ maxHeight: 520 }}>
              <table className="tabla tabla-fija">
                <thead>
                  <tr>
                    <th>Fila</th>
                    <th>Código</th>
                    <th>Tipo</th>
                    {COLUMNAS_PREVIA.filter((c) => columnas.includes(c)).map((c) => (
                      <th key={c}>{CAMPOS[c]}</th>
                    ))}
                    <th>Qué pasa</th>
                  </tr>
                </thead>
                <tbody>
                  {resultado.filas.map((f) => (
                    <tr key={f.fila} style={{ background: f.estado === "no" ? "var(--rojo-bg)" : undefined, opacity: f.estado === "omitir" ? 0.7 : 1 }}>
                      <td className="mono" style={{ color: "var(--tenue)" }}>
                        {f.fila}
                      </td>
                      <td className="mono" style={{ fontWeight: 600 }}>
                        {f.codigo || "—"}
                      </td>
                      <td>
                        {f.estado === "no" ? (
                          <span style={{ fontSize: 12.5 }}>{TIPOS_UNIDAD[f.tipo]}</span>
                        ) : (
                          <>
                            <Select
                              value={f.tipo}
                              onChange={(e) => setDec({ ...dec, tipo: { ...dec.tipo, [f.fila]: e.target.value as TipoUnidad } })}
                              style={{ padding: "4px 6px", fontSize: 12.5, minWidth: 120 }}
                            >
                              {Object.entries(TIPOS_UNIDAD).map(([k, t]) => (
                                <option key={k} value={k}>
                                  {t}
                                </option>
                              ))}
                            </Select>
                            <NotaCelda nota={f.campos.tipo?.nota} />
                          </>
                        )}
                      </td>
                      {COLUMNAS_PREVIA.filter((c) => columnas.includes(c)).map((c) => {
                        const v = f.campos[c];
                        return (
                          <td key={c} style={{ background: v?.nota?.nivel === "ambar" ? "var(--ambar-bg)" : undefined, fontSize: 13 }}>
                            <span className={c === "alicuota" || c.startsWith("saldo") || c.includes("telefono") || c.includes("documento") ? "mono" : undefined}>{v?.valor || <span style={{ color: "var(--tenue)" }}>—</span>}</span>
                            {fueCorregida(f.fila, c) && <div style={{ fontSize: 11, fontWeight: 600, color: "var(--tinta-2)" }}>corregido en la previa</div>}
                            <NotaCelda nota={v?.nota} />
                          </td>
                        );
                      })}
                      <td style={{ fontSize: 12.5, minWidth: 220 }}>
                        <b style={{ color: ESTADO[f.estado].color }}>{ESTADO[f.estado].texto}</b>
                        {f.motivo && <div style={{ color: "var(--tinta-2)" }}>{f.motivo}</div>}
                        {f.notas.map((n, k) => (
                          <NotaCelda key={k} nota={n} />
                        ))}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div style={{ padding: 18, borderTop: "1px solid var(--linea)", display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <Button type="button" cargando={guardando} disabled={!aCargar || porElegir > 0} onClick={() => setConfirmar(true)}>
                Cargar {aCargar} {aCargar === 1 ? "unidad" : "unidades"}
              </Button>
              <Button
                type="button"
                variante="secundario"
                onClick={() => {
                  setLectura(null);
                  setPegado("");
                  setEdiciones({});
                }}
              >
                Descartar
              </Button>
              {porElegir > 0 ? (
                <span style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ambar)" }}>
                  {porElegir === 1 ? "Falta 1 respuesta" : `Faltan ${porElegir} respuestas`} en «Personas para revisar» (las marcadas en ámbar).
                </span>
              ) : (
                <span style={{ fontSize: 12.5, color: "var(--tenue)" }}>Todo se guarda junto: si algo falla, no se guarda nada.</span>
              )}
            </div>
          </Card>
        </>
      )}

      {confirmar && resultado && (
        <Confirmar
          titulo="¿Cargar estos datos?"
          texto={[
            `Se crean ${resultado.resumen.nuevas} unidades`,
            resultado.resumen.actualizar ? ` y se actualizan ${resultado.resumen.actualizar}` : "",
            `. Se registran ${resultado.resumen.personasNuevas} personas nuevas`,
            resultado.resumen.personasExistentes ? ` y se usan ${resultado.resumen.personasExistentes} fichas que ya existían` : "",
            ".",
            resultado.resumen.noSeCargan ? ` ${resultado.resumen.noSeCargan} filas no se cargan (están en la lista de arriba).` : "",
            fueraDeTolerancia ? ` Las alícuotas van a sumar ${sumaTexto}: el mes no se podrá cerrar hasta que cuadren.` : "",
            " Nadie recibe acceso a la app por esto: los accesos se dan desde Accesos.",
          ].join("")}
          boton="Sí, cargar"
          onSi={cargar}
          onNo={() => setConfirmar(false)}
        />
      )}
    </div>
  );
}

/**
 * Un tipo de aviso en una línea («12 filas sin correo del propietario») con
 * «ver más» para las filas. Cada fila trae, si se puede, el campo para
 * corregirla ahí mismo (ronda 7, caso 79). Pensado para el teléfono: una
 * columna, sin tabla.
 */
function GrupoAvisos({
  grupo,
  columnas,
  celdaDe,
  fueCorregida,
  corregir,
  estacionamiento,
  elegirEstacionamiento,
}: {
  grupo: GrupoAviso;
  columnas: Campo[];
  celdaDe: (fila: number, campo: Campo) => string;
  fueCorregida: (fila: number, campo: Campo) => boolean;
  corregir: (fila: number, campo: Campo, valor: string) => void;
  estacionamiento: Record<number, boolean>;
  elegirEstacionamiento: (fila: number, si: boolean) => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const n = grupo.items.length;
  const color = grupo.nivel === "rojo" ? "var(--rojo)" : "var(--ambar)";
  return (
    <div style={{ borderTop: "1px solid var(--linea)", padding: "9px 0" }}>
      <div style={{ display: "flex", gap: 10, alignItems: "baseline", justifyContent: "space-between", flexWrap: "wrap" }}>
        <span style={{ fontSize: 13.5, color, fontWeight: 600, minWidth: 0, overflowWrap: "anywhere" }}>
          {n} {n === 1 ? "fila" : "filas"} {grupo.titulo}
        </span>
        <button
          type="button"
          onClick={() => setAbierto(!abierto)}
          aria-expanded={abierto}
          style={{ background: "none", border: "none", padding: 0, color: "var(--tinta-2)", fontSize: 12.5, textDecoration: "underline", cursor: "pointer" }}
        >
          {abierto ? "ver menos" : "ver más"}
        </button>
      </div>
      {abierto && (
        <div style={{ display: "grid", gap: 8, marginTop: 8 }}>
          {grupo.items.map((it) => (
            <div key={`${it.fila}:${it.campo ?? ""}`} style={{ background: "var(--fondo)", borderRadius: "var(--radio-chico)", padding: "8px 10px", fontSize: 13 }}>
              <div style={{ overflowWrap: "anywhere" }}>
                <span style={{ color: "var(--tenue)" }}>Fila {it.fila} ·</span> <b className="mono">{it.codigo || "—"}</b> — {it.texto}
              </div>
              {it.campo && it.campo !== "ignorar" && (
                columnas.includes(it.campo) ? (
                  <CorregirCelda
                    key={celdaDe(it.fila, it.campo)}
                    campo={it.campo}
                    valor={celdaDe(it.fila, it.campo)}
                    corregida={fueCorregida(it.fila, it.campo)}
                    onCorregir={(v) => corregir(it.fila, it.campo!, v)}
                  />
                ) : (
                  <div style={{ fontSize: 12, color: "var(--tenue)", marginTop: 4 }}>
                    El archivo no trae la columna «{CAMPOS[it.campo]}»: elíjala arriba si está con otro nombre.
                  </div>
                )
              )}
              {it.persona &&
                CONTACTO.filter((c) => columnas.includes(c) && celdaDe(it.fila, c)).map((c) => (
                  <CorregirCelda
                    key={`${c}:${celdaDe(it.fila, c)}`}
                    campo={c}
                    valor={celdaDe(it.fila, c)}
                    corregida={fueCorregida(it.fila, c)}
                    onCorregir={(v) => corregir(it.fila, c, v)}
                  />
                ))}
              {(it.sinAlicuota || estacionamiento[it.fila]) && (
                <label style={{ display: "flex", gap: 6, alignItems: "center", fontSize: 12.5, color: "var(--tinta-2)", marginTop: 6 }}>
                  <input type="checkbox" checked={!!estacionamiento[it.fila]} onChange={(e) => elegirEstacionamiento(it.fila, e.target.checked)} />
                  Cargarla como estacionamiento con alícuota 0
                </label>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * El campo para corregir una celda. Se aplica al tocar «Corregir» (o Enter),
 * no con cada letra: si no, el aviso desaparecería a mitad de lo que se está
 * escribiendo.
 */
function CorregirCelda({ campo, valor, corregida, onCorregir }: { campo: Campo; valor: string; corregida: boolean; onCorregir: (v: string) => void }) {
  const [borrador, setBorrador] = useState(valor);
  const opciones = campo === "paga" ? ["Propietario", "Inquilino"] : campo === "corte" || campo === "inq_corte" ? ["Sí", "No"] : null;
  const cambiado = borrador.trim() !== valor.trim();
  return (
    <div style={{ display: "flex", gap: 6, alignItems: "center", marginTop: 6, flexWrap: "wrap" }}>
      <span style={{ fontSize: 12, color: "var(--tenue)" }}>{CAMPOS[campo]}:</span>
      {opciones ? (
        <Select value={borrador} onChange={(e) => setBorrador(e.target.value)} style={{ padding: "6px 8px", fontSize: 13, flex: "1 1 140px", minWidth: 0 }}>
          {!opciones.includes(borrador) && <option value={borrador}>{borrador || "(vacío)"}</option>}
          {opciones.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </Select>
      ) : (
        <Input
          value={borrador}
          onChange={(e) => setBorrador(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && cambiado) onCorregir(borrador);
          }}
          inputMode={campo.includes("correo") ? "email" : campo.includes("telefono") ? "tel" : campo === "alicuota" || campo.startsWith("saldo") ? "decimal" : undefined}
          style={{ padding: "6px 8px", fontSize: 13, flex: "1 1 160px", minWidth: 0 }}
        />
      )}
      <Button type="button" mini variante="secundario" disabled={!cambiado} onClick={() => onCorregir(borrador)}>
        Corregir
      </Button>
      {corregida && !cambiado && <span style={{ fontSize: 11.5, color: "var(--tinta-2)", fontWeight: 600 }}>corregido</span>}
    </div>
  );
}

function Chip({ color, children }: { color: string; children: ReactNode }) {
  return (
    <span style={{ fontSize: 12.5, fontWeight: 600, color, border: `1px solid ${color}`, borderRadius: 999, padding: "3px 10px" }}>{children}</span>
  );
}

function NotaCelda({ nota }: { nota?: Nota }) {
  if (!nota) return null;
  const color = nota.nivel === "rojo" ? "var(--rojo)" : nota.nivel === "ambar" ? "var(--ambar)" : "var(--tenue)";
  return (
    <div style={{ fontSize: 11.5, color, lineHeight: 1.4, marginTop: 2 }}>
      {nota.texto}
      {/* Lo que queda cuando algo del archivo no se aplica (caso 75). */}
      {nota.queda && <div style={{ color: "var(--tinta)", fontWeight: 600 }}>Se queda: {nota.queda}</div>}
    </div>
  );
}

/**
 * «¿Es la misma persona? Archivo: X · Ficha: Y [Sí] [No]» (pedido de Gustavo,
 * caso 75). Una línea por candidata; con varias, «Sí» en la que es y un «No»
 * al final para «ninguna».
 */
function PreguntaPersona({ d, elegir }: { d: Dudoso; elegir: (valor: string) => void }) {
  const varias = d.lineas.length > 1;
  const boton = (texto: string, valor: string) => (
    <Button type="button" mini variante={d.valor === valor ? "primario" : "secundario"} aria-pressed={d.valor === valor} onClick={() => elegir(valor)}>
      {texto}
    </Button>
  );
  return (
    <div
      style={{
        padding: "8px 0",
        borderTop: "1px solid var(--linea)",
        fontSize: 13.5,
        display: "grid",
        gap: 6,
        ...(d.pendiente ? { background: "var(--ambar-bg)", paddingLeft: 8, paddingRight: 8 } : {}),
      }}
    >
      {d.lineas.map((l) => (
        <div key={l.valor} style={{ display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", justifyContent: "space-between" }}>
          <span style={{ minWidth: 0, overflowWrap: "anywhere" }}>
            ¿Es la misma persona? <span style={{ color: "var(--tenue)" }}>Archivo:</span> {d.archivo}{" "}
            <span style={{ color: "var(--tenue)" }}>· {l.contra}:</span> {l.etiqueta}
            {l.aviso && <span style={{ display: "block", fontSize: 12, color: "var(--ambar)" }}>{l.aviso}</span>}
          </span>
          <span style={{ display: "flex", gap: 6 }}>
            {boton("Sí", l.valor)}
            {!varias && boton("No", d.valorNo)}
          </span>
        </div>
      ))}
      {varias && (
        <div style={{ display: "flex", justifyContent: "flex-end" }}>{boton("No, ninguna: es otra persona", d.valorNo)}</div>
      )}
      {d.pendiente && (
        <div style={{ fontSize: 12.5, fontWeight: 600, color: "var(--ambar)" }}>Sin respuesta por omisión: elija para poder cargar.</div>
      )}
    </div>
  );
}
