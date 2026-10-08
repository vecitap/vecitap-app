"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Aviso, Button, Campo, Card, Flechas, Input, Select, Textarea } from "@/components/ui";
import { num, num0, usd } from "@/lib/formato";
import { interpretarPegado } from "@/lib/admin/pegar-partidas";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { LogoOrg } from "./LogoOrg";
import { DatosAdministradora } from "./DatosAdministradora";
import { NuevoEdificio } from "./NuevoEdificio";
import type { CategoriaConPartidas, EdificioAdmin, PartidaFija } from "@/lib/admin/tipos";
import type { Database } from "@/types/supabase";
import { mensajeDeError } from "@/lib/errores";

type ActualizarPartida = Database["public"]["Tables"]["partidas_fijas"]["Update"];
type Mensaje = { texto: string; tipo: "ok" | "error" };

/**
 * Portado de Ajustes() en admin.html:5670-6031 (+ LogoOrg, + NuevoEdificio).
 *
 * Las partidas editables siguen el patrón que ya usan Cobros/CierreMes:
 * cada campo es un subcomponente con su propio `useState(valorInicial)` y
 * el padre le pasa `key={`${id}:${valor}`}`, así que cuando el valor
 * guardado cambia React lo remonta con el valor fresco en vez de dejar un
 * buffer local desactualizado. Nada de `useEffect` ni `ref` para eso (ver
 * docs/estado-migracion.md, "Patrón para filas editables").
 */
export function Ajustes({
  orgId,
  organizacion,
  edificio,
  categorias,
  puedeEditarOrg,
}: {
  orgId: string;
  organizacion: { nombre: string; rif: string | null; logo_url: string | null };
  edificio: EdificioAdmin;
  categorias: CategoriaConPartidas[];
  puedeEditarOrg: boolean;
}) {
  const router = useRouter();
  const [e, setE] = useState({
    nombre: edificio.nombre,
    rif: edificio.rif ?? "",
    direccion: edificio.direccion ?? "",
    prefijo: edificio.prefijo_recibo,
    mora: String(edificio.interes_mora),
    tolerancia: String(edificio.tolerancia_alicuota),
    redondeo: String(edificio.tolerancia_redondeo ?? 0.5),
  });
  const [nuevaCat, setNuevaCat] = useState("");
  const [pegado, setPegado] = useState("");
  const [catPorOmision, setCatPorOmision] = useState("");
  const [nuevoEd, setNuevoEd] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);

  function notificar(texto: string, tipo: "ok" | "error" = "ok") {
    setMensaje({ texto, tipo });
  }
  function fallo(err: unknown) {
    notificar(mensajeDeError(err), "error");
  }

  async function guardarEdificio() {
    setOcupado(true);
    const supabase = crearClienteNavegador();
    const { error } = await supabase
      .from("edificios")
      .update({
        nombre: e.nombre.trim(),
        rif: e.rif.trim() || null,
        direccion: e.direccion.trim() || null,
        prefijo_recibo: e.prefijo.trim().toUpperCase(),
        interes_mora: num0(e.mora),
        tolerancia_alicuota: num0(e.tolerancia) || 0.01,
        tolerancia_redondeo: num0(e.redondeo),
      })
      .eq("id", edificio.id);
    setOcupado(false);
    if (error) return fallo(error);
    notificar("Edificio actualizado.");
    router.refresh();
  }

  /** Acepta varias de una vez: pegar una columna de Excel crea todas. */
  async function agregarCat(texto?: string) {
    const nombres = String(texto ?? nuevaCat)
      .split(/\r?\n/)
      .map((x) => x.trim())
      .filter(Boolean);
    if (!nombres.length) return;
    const filas = nombres.map((nombre, i) => ({
      org_id: orgId,
      edificio_id: edificio.id,
      nombre,
      orden: categorias.length + 1 + i,
    }));
    const supabase = crearClienteNavegador();
    const { error } = await supabase.from("categorias").insert(filas);
    if (error) return fallo(error);
    setNuevaCat("");
    notificar(nombres.length === 1 ? "Categoría agregada." : `${nombres.length} categorías agregadas.`);
    router.refresh();
  }

  const leido = useMemo(() => interpretarPegado(pegado), [pegado]);

  const catPorNombre = (nombre: string) =>
    categorias.find((c) => c.nombre.trim().toLowerCase() === String(nombre).trim().toLowerCase());

  const problemas = leido.filter((r) => r.tipo === "partida" && !r.categoria && !catPorOmision).length;

  async function guardarPegado() {
    if (!leido.length) return notificar("No hay nada que cargar.", "error");
    if (problemas)
      return notificar("Hay filas sin categoría. Elija una categoría por omisión o agréguela a la fila.", "error");

    setOcupado(true);
    const supabase = crearClienteNavegador();
    try {
      // 1) crear las categorías que no existan
      const faltan: string[] = [];
      leido.forEach((r) => {
        const nombre = r.categoria;
        if (!nombre) return;
        if (catPorNombre(nombre)) return;
        if (faltan.some((x) => x.toLowerCase() === nombre.toLowerCase())) return;
        faltan.push(nombre);
      });
      if (faltan.length) {
        const { error } = await supabase.from("categorias").insert(
          faltan.map((nombre, i) => ({
            org_id: orgId,
            edificio_id: edificio.id,
            nombre,
            orden: categorias.length + 1 + i,
          }))
        );
        if (error) throw error;
      }

      // 2) releer para tener los identificadores nuevos
      const { data: frescas, error: e2 } = await supabase.from("categorias").select("id,nombre").eq("edificio_id", edificio.id);
      if (e2) throw e2;
      const porNombre = new Map((frescas ?? []).map((c) => [c.nombre.trim().toLowerCase(), c.id]));

      // 3) insertar las partidas
      const partidas = leido
        .filter((r) => r.tipo === "partida")
        .map((r, i) => ({
          org_id: orgId,
          orden: (i + 1) * 10,
          categoria_id: porNombre.get(String(r.categoria || "").trim().toLowerCase()) || catPorOmision,
          concepto: r.concepto || "Sin concepto",
          referencia: r.referencia || null,
          monto: r.monto || 0,
        }));
      if (partidas.length) {
        const { error } = await supabase.from("partidas_fijas").insert(partidas);
        if (error) throw error;
      }
      setPegado("");
      notificar(`${faltan.length} categorías y ${partidas.length} partidas cargadas.`);
      router.refresh();
    } catch (err) {
      fallo(err);
    }
    setOcupado(false);
  }

  async function agregarPartida(catId: string) {
    const cat = categorias.find((c) => c.id === catId);
    const ultimo = Math.max(0, ...(cat?.partidas_fijas ?? []).map((p) => p.orden || 0));
    const supabase = crearClienteNavegador();
    const { error } = await supabase
      .from("partidas_fijas")
      .insert({ org_id: orgId, categoria_id: catId, concepto: "", referencia: null, monto: 0, orden: ultimo + 10 });
    if (error) return fallo(error);
    router.refresh();
  }

  async function mover(fn: "mover_categoria" | "mover_partida", id: string, arriba: boolean) {
    const supabase = crearClienteNavegador();
    const { error } = await supabase.rpc(fn, { p_id: id, p_arriba: arriba });
    if (error) return fallo(error);
    router.refresh();
  }

  async function editarPartida(id: string, campos: ActualizarPartida) {
    const supabase = crearClienteNavegador();
    const { error } = await supabase.from("partidas_fijas").update(campos).eq("id", id);
    if (error) return fallo(error);
    router.refresh();
  }

  async function borrarPartida(id: string) {
    const supabase = crearClienteNavegador();
    const { error } = await supabase.from("partidas_fijas").delete().eq("id", id);
    if (error) return fallo(error);
    router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: 20, maxWidth: 860 }}>
      {mensaje && <Aviso tono={mensaje.tipo === "error" ? "rojo" : "verde"}>{mensaje.texto}</Aviso>}

      <DatosAdministradora
        // key: después de guardar, router.refresh() trae el valor nuevo y la
        // tarjeta se remonta con él (mismo patrón que las filas editables).
        key={`${organizacion.nombre}|${organizacion.rif ?? ""}`}
        orgId={orgId}
        nombre={organizacion.nombre}
        rif={organizacion.rif}
        puedeEditar={puedeEditarOrg}
      />

      <LogoOrg orgId={orgId} nombre={organizacion.nombre} logoUrl={organizacion.logo_url} />

      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12, flexWrap: "wrap" }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-titulos)" }}>Datos del edificio</h2>
            <p style={{ margin: "3px 0 14px", fontSize: 12.5, color: "var(--tenue)" }}>
              El prefijo debe ser único dentro de la administradora: es lo que distingue el recibo de
              un edificio del de otro.
            </p>
          </div>
          <Button type="button" variante="secundario" mini onClick={() => setNuevoEd(true)}>
            <Plus size={14} /> Otro edificio
          </Button>
        </div>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }}>
          <Campo etiqueta="Nombre">
            <Input value={e.nombre} onChange={(x) => setE({ ...e, nombre: x.target.value })} />
          </Campo>
          <Campo etiqueta="RIF">
            <Input className="mono" value={e.rif} onChange={(x) => setE({ ...e, rif: x.target.value })} />
          </Campo>
          <Campo etiqueta="Prefijo del recibo">
            <Input className="mono" value={e.prefijo} onChange={(x) => setE({ ...e, prefijo: x.target.value })} />
          </Campo>
          <Campo
            etiqueta="Interés de mora mensual %"
            ayuda="Se calcula sobre todo el saldo previo de condominio, así que el interés del mes pasado también genera interés."
          >
            <Input className="mono" value={e.mora} onChange={(x) => setE({ ...e, mora: x.target.value })} />
          </Campo>
          <Campo etiqueta="Tolerancia de alícuotas">
            <Input className="mono" value={e.tolerancia} onChange={(x) => setE({ ...e, tolerancia: x.target.value })} />
          </Campo>
          <Campo
            etiqueta="Perdón de centavos USD"
            ayuda="Al cerrar el mes, una deuda menor a este monto se perdona sola y queda como ajuste con su motivo. En 0 queda apagado."
          >
            <Input className="mono" value={e.redondeo} onChange={(x) => setE({ ...e, redondeo: x.target.value })} />
          </Campo>
          <div style={{ gridColumn: "1 / -1" }}>
            <Campo etiqueta="Dirección">
              <Input value={e.direccion} onChange={(x) => setE({ ...e, direccion: x.target.value })} />
            </Campo>
          </div>
        </div>
        <div style={{ marginTop: 16 }}>
          <Button type="button" disabled={ocupado} onClick={guardarEdificio}>
            Guardar
          </Button>
        </div>
      </Card>

      <Card>
        <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-titulos)" }}>Categorías y partidas fijas</h2>
        <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--tenue)" }}>
          Los gastos que se repiten todos los meses. Al abrir un mes entran solos con su monto, y ahí
          se ajusta lo que haya cambiado.
        </p>

        {categorias.map((c) => (
          <div key={c.id} style={{ borderTop: "1px solid var(--linea)", paddingTop: 14, marginTop: 14 }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                <Flechas
                  onSubir={() => mover("mover_categoria", c.id, true)}
                  onBajar={() => mover("mover_categoria", c.id, false)}
                />
                <span style={{ fontWeight: 600, fontSize: 14 }}>{c.nombre}</span>
              </div>
              <Button type="button" variante="secundario" mini onClick={() => agregarPartida(c.id)}>
                <Plus size={13} /> Partida
              </Button>
            </div>
            {(c.partidas_fijas ?? []).map((p) => (
              <FilaPartida
                key={`${p.id}:${p.concepto}:${p.referencia ?? ""}:${p.monto}`}
                partida={p}
                onSubir={() => mover("mover_partida", p.id, true)}
                onBajar={() => mover("mover_partida", p.id, false)}
                onEditar={editarPartida}
                onBorrar={() => borrarPartida(p.id)}
              />
            ))}
            {(c.partidas_fijas ?? []).length === 0 && (
              <p style={{ fontSize: 12.5, color: "var(--tenue)" }}>Sin partidas fijas.</p>
            )}
          </div>
        ))}

        <div
          style={{
            borderTop: "1px solid var(--linea)",
            paddingTop: 14,
            marginTop: 14,
            display: "flex",
            gap: 8,
            flexWrap: "wrap",
            alignItems: "flex-end",
          }}
        >
          <div style={{ width: 260 }}>
            <Campo etiqueta="Nueva categoría" ayuda="Puede pegar varias de una vez, una por línea.">
              <Input
                value={nuevaCat}
                onChange={(x) => setNuevaCat(x.target.value)}
                onPaste={(x) => {
                  const t = x.clipboardData.getData("text");
                  if (!/\r?\n/.test(t.trim())) return; // una sola: comportamiento normal
                  x.preventDefault();
                  agregarCat(t);
                }}
                placeholder="Servicios"
              />
            </Campo>
          </div>
          <Button type="button" variante="secundario" onClick={() => agregarCat()}>
            Agregar
          </Button>
        </div>
      </Card>

      {/* ── Carga masiva desde una hoja de cálculo ── */}
      <Card>
        <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-titulos)" }}>Pegar categorías y partidas</h2>
        <p style={{ margin: "3px 0 10px", fontSize: 12.5, color: "var(--tenue)" }}>
          Copie las filas en Excel o Google Sheets y péguelas aquí. Antes de guardar nada se muestra
          lo que el sistema entendió.
        </p>

        <div style={{ fontSize: 12.5, color: "var(--tinta-2)", lineHeight: 1.6, marginBottom: 10 }}>
          El orden de las columnas es <b>Categoría · Concepto · Referencia · Monto</b>. Puede pegar
          menos columnas:
          <div
            className="mono"
            style={{
              fontSize: 12,
              color: "var(--tenue)",
              marginTop: 6,
              background: "var(--fondo)",
              padding: "10px 12px",
              borderRadius: "var(--radio-chico)",
              whiteSpace: "pre",
              overflowX: "auto",
            }}
          >
            {`Servicios      Electricidad   Corpoelec   1.240,50
Servicios      Agua           Hidroven      380,00
Personal       Conserje                    1.500,00
Mantenimiento`}
          </div>
          La última columna que sea un número se toma como el monto. Una línea sola, sin monto, se
          toma como una categoría nueva.
        </div>

        <Textarea
          rows={7}
          value={pegado}
          onChange={(x) => setPegado(x.target.value)}
          placeholder="Pegue aquí…"
          className="mono"
          style={{ fontSize: 13, resize: "vertical" }}
        />

        {leido.length > 0 && (
          <>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end", flexWrap: "wrap", marginTop: 14 }}>
              <div style={{ width: 260 }}>
                <Campo etiqueta="Categoría para las filas que no la traigan">
                  <Select value={catPorOmision} onChange={(x) => setCatPorOmision(x.target.value)}>
                    <option value="">Ninguna</option>
                    {categorias.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.nombre}
                      </option>
                    ))}
                  </Select>
                </Campo>
              </div>
              <Button type="button" disabled={ocupado || problemas > 0} onClick={guardarPegado}>
                Cargar {leido.filter((r) => r.tipo === "partida").length} partidas
              </Button>
            </div>

            {problemas > 0 && (
              <p style={{ fontSize: 12.5, color: "var(--rojo)", marginTop: 8 }}>
                {problemas} filas no dicen a qué categoría van. Elija una arriba o agregue la
                categoría como primera columna.
              </p>
            )}

            <div className="tabla-scroll" style={{ marginTop: 12, maxHeight: 320 }}>
              <table className="tabla">
                <thead>
                  <tr>
                    <th>Categoría</th>
                    <th>Concepto</th>
                    <th>Referencia</th>
                    <th style={{ textAlign: "right" }}>Monto</th>
                    <th>Qué se va a hacer</th>
                  </tr>
                </thead>
                <tbody>
                  {leido.map((r, i) => {
                    const existe = r.categoria ? catPorNombre(r.categoria) : null;
                    const sinCat = r.tipo === "partida" && !r.categoria && !catPorOmision;
                    return (
                      <tr key={i} style={{ background: sinCat ? "var(--rojo-bg)" : "transparent" }}>
                        <td>{r.categoria || <span style={{ color: "var(--tenue)" }}>—</span>}</td>
                        <td>{r.tipo === "categoria" ? "" : r.concepto}</td>
                        <td className="mono" style={{ fontSize: 12 }}>
                          {r.tipo === "categoria" ? "" : r.referencia}
                        </td>
                        <td className="mono" style={{ textAlign: "right" }}>
                          {r.tipo === "categoria" ? "" : usd(r.monto)}
                        </td>
                        <td style={{ fontSize: 12, color: sinCat ? "var(--rojo)" : "var(--tinta-2)" }}>
                          {sinCat
                            ? "falta la categoría"
                            : r.tipo === "categoria"
                              ? existe
                                ? "la categoría ya existe"
                                : "categoría nueva"
                              : existe || !r.categoria
                                ? "partida"
                                : "partida · crea la categoría"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
      </Card>

      {nuevoEd && <NuevoEdificio orgId={orgId} onCerrar={() => setNuevoEd(false)} />}
    </div>
  );
}

function FilaPartida({
  partida: p,
  onSubir,
  onBajar,
  onEditar,
  onBorrar,
}: {
  partida: PartidaFija;
  onSubir: () => void;
  onBajar: () => void;
  onEditar: (id: string, campos: ActualizarPartida) => void;
  onBorrar: () => void;
}) {
  const [concepto, setConcepto] = useState(p.concepto);
  const [referencia, setReferencia] = useState(p.referencia ?? "");
  const [monto, setMonto] = useState(String(p.monto));

  return (
    <div
      style={{
        display: "grid",
        gap: 8,
        alignItems: "center",
        gridTemplateColumns: "26px minmax(140px,2fr) minmax(110px,1fr) 118px 34px",
        marginBottom: 8,
      }}
    >
      <Flechas onSubir={onSubir} onBajar={onBajar} />
      <Input
        value={concepto}
        placeholder="Concepto"
        onChange={(x) => setConcepto(x.target.value)}
        onBlur={() => concepto !== p.concepto && onEditar(p.id, { concepto })}
        style={{ padding: "7px 9px", fontSize: 13 }}
      />
      <Input
        className="mono"
        value={referencia}
        placeholder="Referencia"
        onChange={(x) => setReferencia(x.target.value)}
        onBlur={() => referencia !== (p.referencia ?? "") && onEditar(p.id, { referencia: referencia || null })}
        style={{ padding: "7px 9px", fontSize: 13 }}
      />
      <Input
        className="mono"
        value={monto}
        placeholder="0,00"
        onChange={(x) => setMonto(x.target.value)}
        onBlur={() => {
          const v = num(monto) ?? 0;
          if (v !== Number(p.monto)) onEditar(p.id, { monto: v });
        }}
        style={{ padding: "7px 9px", fontSize: 13, textAlign: "right" }}
      />
      <button
        type="button"
        onClick={onBorrar}
        title="Eliminar"
        style={{ border: "none", background: "transparent", cursor: "pointer", color: "var(--tenue)" }}
      >
        <Trash2 size={15} />
      </button>
    </div>
  );
}
