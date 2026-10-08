"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Aviso, Button, Card } from "@/components/ui";
import { nf, num, pct } from "@/lib/formato";
import { correoValido, normaliza, separarTratamiento } from "@/lib/admin/personas";
import { leerPagaPegado, type Paga } from "@/lib/paga";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { Unidad } from "@/lib/admin/tipos";

type Fila = {
  codigo: string;
  alicuota: number | null;
  saldo: number | null;
  nombre: string;
  telefono: string;
  correo: string;
  paga: Paga | null;
  inqNombre: string;
  inqTelefono: string;
  inqCorreo: string;
  errores: string[];
};

type Persona = { nombre: string; telefono: string; correo: string };

/**
 * Portado de ImportarUnidades() en app.html:1655-1781.
 *
 * Agregado del 30-sep (docs/casos-de-uso-mejorados.md, caso 31): cuatro
 * columnas opcionales DESPUÉS de las seis de `main` —quién paga, y nombre,
 * teléfono y correo del inquilino—, así un pegado con el formato de `main`
 * se lee exactamente igual que antes. "Quién paga" vacío = propietario.
 *
 * Orden de escritura: unidades → propietarios → inquilinos → `paga`. La
 * base rechaza paga = 'inquilino' en una unidad sin inquilino vigente
 * (guarda B de supabase/migrations/20260930120000_unidades_paga.sql), así
 * que las unidades se crean con el default (propietario) y `paga` se fija al
 * final, cuando los vínculos de inquilino ya existen. Una fila que pide
 * inquilino sin traer su nombre se marca con error en la vista previa y no
 * se carga, igual que el resto de la validación.
 */
export function ImportarUnidades({
  orgId,
  edificioId,
  unidades,
  onVolver,
}: {
  orgId: string;
  edificioId: string;
  unidades: Unidad[];
  onVolver: () => void;
}) {
  const router = useRouter();
  const [texto, setTexto] = useState("");
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const previa = useMemo<Fila[]>(() => {
    const filas = texto
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean);
    const existentes = new Set(unidades.map((u) => normaliza(u.codigo)));
    const vistos = new Set<string>();
    return filas.map((l) => {
      const p = l.split(/[\t;,]/).map((x) => x.trim());
      const codigo = p[0] || "";
      const alicuota = num(p[1]);
      const saldo = num(p[2]);
      const nombre = p[3] || "";
      const telefono = p[4] || "";
      const correo = p[5] || "";
      const paga = leerPagaPegado(p[6]);
      const inqNombre = p[7] || "";
      const inqTelefono = p[8] || "";
      const inqCorreo = p[9] || "";
      const k = normaliza(codigo);
      const errores: string[] = [];
      if (!codigo) errores.push("sin código");
      if (alicuota === null) errores.push("alícuota ilegible");
      if (existentes.has(k)) errores.push("ya existe en el edificio");
      if (vistos.has(k)) errores.push("repetida en el pegado");
      if (correo && !correoValido(correo)) errores.push("correo inválido");
      if (paga === null) errores.push(`«${p[6]}» en quién paga: escriba propietario o inquilino`);
      if (paga === "inquilino" && !inqNombre) errores.push("paga el inquilino, pero la fila no trae su nombre");
      if ((inqTelefono || inqCorreo) && !inqNombre) errores.push("datos de inquilino sin nombre");
      if (inqCorreo && !correoValido(inqCorreo)) errores.push("correo del inquilino inválido");
      vistos.add(k);
      return { codigo, alicuota, saldo, nombre, telefono, correo, paga, inqNombre, inqTelefono, inqCorreo, errores };
    });
  }, [texto, unidades]);

  const buenas = previa.filter((f) => !f.errores.length);
  const suma =
    buenas.reduce((s, f) => s + (f.alicuota || 0), 0) +
    unidades.filter((u) => u.activa).reduce((s, u) => s + Number(u.alicuota || 0), 0);

  /** Crea las personas y sus vínculos de un tipo. Devuelve el mensaje de error, o null. */
  async function vincular(
    supabase: ReturnType<typeof crearClienteNavegador>,
    tipo: "propietario" | "inquilino",
    filas: { unidadId: string; persona: Persona }[]
  ): Promise<string | null> {
    if (!filas.length) return null;
    const { data: pers, error: e1 } = await supabase
      .from("personas")
      .insert(
        filas.map((f) => {
          // "Sr. Pérez" de la planilla → prefijo "Sr." + nombre "Pérez"
          // (ronda 2, caso 39). Sin tratamiento no se manda `prefijo`, y
          // `defaultToNull: false` deja que la base ponga el suyo por
          // omisión, como antes.
          const { prefijo, nombre } = separarTratamiento(f.persona.nombre);
          return { org_id: orgId, nombre, ...(prefijo ? { prefijo } : {}), telefono: f.persona.telefono || null, correo: f.persona.correo || null };
        }),
        { defaultToNull: false }
      )
      .select("id");
    if (e1 || !pers || pers.length !== filas.length) return e1?.message ?? `No se pudieron registrar los ${tipo}s.`;
    const { error: e2 } = await supabase
      .from("vinculos")
      .insert(filas.map((f, i) => ({ org_id: orgId, unidad_id: f.unidadId, persona_id: pers[i].id, tipo })));
    return e2 ? e2.message : null;
  }

  async function aplicar() {
    if (!buenas.length) return;
    setOcupado(true);
    setError(null);
    const supabase = crearClienteNavegador();

    const { data: nuevas, error: e1 } = await supabase
      .from("unidades")
      .insert(buenas.map((f) => ({ org_id: orgId, edificio_id: edificioId, codigo: f.codigo, alicuota: f.alicuota || 0, saldo_inicial: f.saldo || 0 })))
      .select("id,codigo");
    if (e1 || !nuevas) {
      setOcupado(false);
      return setError(e1?.message ?? "No se pudieron cargar las unidades.");
    }
    // Por código y no por posición: los códigos del pegado son únicos (se
    // validó arriba), y así no depende del orden en que la base devuelva las filas.
    const idDe = new Map(nuevas.map((n) => [n.codigo, n.id]));
    const conId = buenas.map((f) => ({ ...f, id: idDe.get(f.codigo) })).filter((f): f is Fila & { id: string } => !!f.id);

    const eProp = await vincular(
      supabase,
      "propietario",
      conId.filter((f) => f.nombre).map((f) => ({ unidadId: f.id, persona: { nombre: f.nombre, telefono: f.telefono, correo: f.correo } }))
    );
    if (eProp) {
      setOcupado(false);
      return setError(eProp);
    }

    const eInq = await vincular(
      supabase,
      "inquilino",
      conId.filter((f) => f.inqNombre).map((f) => ({ unidadId: f.id, persona: { nombre: f.inqNombre, telefono: f.inqTelefono, correo: f.inqCorreo } }))
    );
    if (eInq) {
      setOcupado(false);
      return setError(
        `Las unidades y sus propietarios se cargaron, pero no los inquilinos: ${eInq}. Todas quedaron como «paga el propietario»; cargue los inquilinos desde la ficha de cada unidad.`
      );
    }

    const pagaInquilino = conId.filter((f) => f.paga === "inquilino").map((f) => f.id);
    if (pagaInquilino.length) {
      const { data: marcadas, error: e4 } = await supabase.from("unidades").update({ paga: "inquilino" }).in("id", pagaInquilino).select("id");
      if (e4 || !marcadas || marcadas.length !== pagaInquilino.length) {
        setOcupado(false);
        return setError(
          `Las unidades, propietarios e inquilinos se cargaron, pero no se pudo marcar que paga el inquilino${e4 ? `: ${e4.message}` : ""}. Márquelo desde la ficha de cada unidad.`
        );
      }
    }

    setOcupado(false);
    setTexto("");
    onVolver();
    router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: "var(--font-titulos)", fontSize: 16 }}>Importar unidades</h2>
            <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--tenue)" }}>
              Una unidad por línea. Separe con coma, punto y coma o tabulación — puede pegar directo desde Excel.
            </p>
          </div>
          <Button type="button" variante="secundario" mini onClick={onVolver}>
            Volver
          </Button>
        </div>
        <div className="mono" style={{ background: "var(--fondo)", borderRadius: "var(--radio-chico)", padding: "12px 14px", fontSize: 12.5, color: "var(--tinta-2)", margin: "14px 0" }}>
          código, alícuota, saldo inicial, propietario, teléfono, correo, quién paga, inquilino, teléfono del inquilino, correo del inquilino
        </div>
        <textarea
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          rows={9}
          placeholder={"01A, 2,41144, 0, Grecia González, 0414-1234567, grecia@correo.com\n01B, 2,50809, 145,50"}
          className="control mono"
          style={{ fontSize: 13 }}
        />
        <p style={{ fontSize: 12, color: "var(--tenue)", marginTop: 8 }}>
          Del tercer campo en adelante todo es opcional. Los montos aceptan coma o punto. En «quién paga» escriba
          propietario o inquilino; si lo deja vacío, paga el propietario. Si paga el inquilino, la fila tiene que traer
          su nombre.
        </p>
      </Card>

      {error && (
        <Aviso tono="rojo" titulo="No se pudo completar la carga">
          {error}
        </Aviso>
      )}

      {previa.length > 0 && (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 18px 0" }}>
            <h3 style={{ margin: 0, fontSize: 14 }}>
              {buenas.length} de {previa.length} filas se pueden cargar
            </h3>
            {Math.abs(suma - 100) > 0.01 && (
              <div style={{ margin: "10px 0" }}>
                <Aviso tono="ambar" titulo="Con estas filas las alícuotas no van a cuadrar">
                  Quedarían en {pct(suma)}. Puede cargarlas igual y corregir después, pero el mes
                  no cerrará hasta que cuadre.
                </Aviso>
              </div>
            )}
          </div>
          <div className="tabla-scroll" style={{ maxHeight: 380 }}>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Código</th>
                  <th>Alícuota</th>
                  <th>Saldo</th>
                  <th>Propietario</th>
                  <th>Inquilino</th>
                  <th>Estado</th>
                </tr>
              </thead>
              <tbody>
                {previa.map((f, i) => (
                  <tr key={i} style={{ background: f.errores.length ? "var(--rojo-bg)" : "transparent" }}>
                    <td className="mono">{f.codigo || "—"}</td>
                    <td className="mono">{f.alicuota === null ? "—" : nf(5).format(f.alicuota)}</td>
                    <td className="mono">{f.saldo === null ? "—" : nf(2).format(f.saldo)}</td>
                    <td>{f.nombre || <span style={{ color: "var(--tenue)" }}>—</span>}</td>
                    <td>
                      {f.inqNombre || <span style={{ color: "var(--tenue)" }}>—</span>}
                      {f.paga === "inquilino" && <div style={{ fontSize: 11.5, color: "var(--azul)" }}>paga él</div>}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {f.errores.length ? (
                        <span style={{ color: "var(--rojo)" }}>{f.errores.join(" · ")}</span>
                      ) : (
                        <span style={{ color: "var(--verde)" }}>lista</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: 18, borderTop: "1px solid var(--linea)", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button type="button" disabled={!buenas.length || ocupado} onClick={aplicar}>
              Cargar {buenas.length} unidades
            </Button>
            <Button type="button" variante="secundario" onClick={() => setTexto("")}>
              Limpiar
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
