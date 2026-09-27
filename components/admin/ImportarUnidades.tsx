"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Aviso, Button, Card } from "@/components/ui";
import { nf, num, pct } from "@/lib/formato";
import { correoValido, normaliza } from "@/lib/admin/personas";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { Unidad } from "@/lib/admin/tipos";

type Fila = {
  codigo: string;
  alicuota: number | null;
  saldo: number | null;
  nombre: string;
  telefono: string;
  correo: string;
  errores: string[];
};

/** Portado de ImportarUnidades() en app.html:1655-1781. */
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
      const k = normaliza(codigo);
      const errores: string[] = [];
      if (!codigo) errores.push("sin código");
      if (alicuota === null) errores.push("alícuota ilegible");
      if (existentes.has(k)) errores.push("ya existe en el edificio");
      if (vistos.has(k)) errores.push("repetida en el pegado");
      if (correo && !correoValido(correo)) errores.push("correo inválido");
      vistos.add(k);
      return { codigo, alicuota, saldo, nombre, telefono, correo, errores };
    });
  }, [texto, unidades]);

  const buenas = previa.filter((f) => !f.errores.length);
  const suma =
    buenas.reduce((s, f) => s + (f.alicuota || 0), 0) +
    unidades.filter((u) => u.activa).reduce((s, u) => s + Number(u.alicuota || 0), 0);

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

    const conNombre = buenas.map((f, i) => ({ ...f, id: nuevas[i]?.id })).filter((f) => f.nombre && f.id);
    if (conNombre.length) {
      const { data: pers, error: e2 } = await supabase
        .from("personas")
        .insert(conNombre.map((f) => ({ org_id: orgId, nombre: f.nombre, telefono: f.telefono || null, correo: f.correo || null })))
        .select("id");
      if (e2 || !pers) {
        setOcupado(false);
        return setError(e2?.message ?? "No se pudieron registrar los propietarios.");
      }
      const { error: e3 } = await supabase
        .from("vinculos")
        .insert(conNombre.map((f, i) => ({ org_id: orgId, unidad_id: f.id as string, persona_id: pers[i].id, tipo: "propietario" })));
      if (e3) {
        setOcupado(false);
        return setError(e3.message);
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
          código, alícuota, saldo inicial, propietario, teléfono, correo
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
          Del tercer campo en adelante todo es opcional. Los montos aceptan coma o punto.
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
