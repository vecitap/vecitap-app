"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Aviso, Button, Card } from "@/components/ui";
import { nf } from "@/lib/formato";
import { normaliza } from "@/lib/admin/personas";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { Unidad } from "@/lib/admin/tipos";

type FilaLeida = { cod: string; monto: number | null; unidad: Unidad | null };

/** Igual a parseMonto() en app.html:176-182 — formato venezolano (1.234,56) y también 1234.56. */
function parseMonto(v: string): number | null {
  let s = String(v).replace(/[^\d.,-]/g, "").trim();
  if (!s || s === "-") return null;
  const coma = s.lastIndexOf(","),
    punto = s.lastIndexOf(".");
  if (coma > punto) s = s.replace(/\./g, "").replace(",", ".");
  else s = s.replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/** Lector de CSV, sin dependencias — divide por coma o punto y coma. */
function leerCSV(texto: string): string[][] {
  return texto
    .split(/\r?\n/)
    .map((l) => l.split(/[,;]/).map((c) => c.trim()))
    .filter((f) => f.some((c) => c));
}

/**
 * Portado de ImportarSaldos() en app.html:1788-1915 — con una limitación
 * deliberada (ver docs/estado-migracion.md, sección Admin/Sesión 1): el
 * original lee Excel y PDF con `xlsx`/`pdf.js` cargados por CDN; ninguno
 * es dependencia de este proyecto y esta sesión no instaló paquetes
 * nuevos. Solo queda implementada la lectura de CSV (sin librería) — el
 * resto del flujo (previa, cruce por código, aplicar) está completo y
 * listo para conectar a un lector de Excel/PDF real más adelante.
 */
export function ImportarSaldos({
  edificioId,
  unidades,
  onVolver,
}: {
  edificioId: string;
  unidades: Unidad[];
  onVolver: () => void;
}) {
  const router = useRouter();
  const [filas, setFilas] = useState<FilaLeida[]>([]);
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hayCierres, setHayCierres] = useState<boolean | null>(null);

  useEffect(() => {
    const supabase = crearClienteNavegador();
    supabase
      .from("periodos")
      .select("id", { count: "exact", head: true })
      .eq("edificio_id", edificioId)
      .eq("estado", "cerrado")
      .then(({ count }) => setHayCierres((count || 0) > 0));
  }, [edificioId]);

  const porCodigo = useMemo(() => {
    const m: Record<string, Unidad> = {};
    unidades.forEach((u) => (m[normaliza(u.codigo)] = u));
    return m;
  }, [unidades]);

  async function leer(file: File | undefined) {
    if (!file) return;
    setError(null);
    if (!/\.csv$/i.test(file.name)) {
      setError(
        "Por ahora solo se puede leer CSV. Excel (.xlsx/.xls) y PDF necesitan un paquete que todavía no está instalado (xlsx / pdf.js) — pendiente de decisión, ver docs/estado-migracion.md."
      );
      return;
    }
    const texto = await file.text();
    const limpias = leerCSV(texto)
      .filter((f) => f.length >= 2)
      .filter((f) => !/total|suma|deuda total/i.test(String(f[0] || "")));

    const res: FilaLeida[] = limpias
      .map((f) => {
        const cod = String(f[0] || "").trim();
        let monto: number | null = null;
        for (let i = f.length - 1; i >= 1 && monto === null; i--) monto = parseMonto(f[i]);
        return { cod, monto, unidad: porCodigo[normaliza(cod)] ?? null };
      })
      .filter((r) => r.cod && r.monto !== null);

    setFilas(res);
  }

  const cruzan = filas.filter((f): f is FilaLeida & { unidad: Unidad; monto: number } => !!f.unidad && f.monto !== null);

  async function aplicar() {
    setOcupado(true);
    setError(null);
    const supabase = crearClienteNavegador();
    for (const f of cruzan) {
      const { error: e } = await supabase.from("unidades").update({ saldo_inicial: f.monto }).eq("id", f.unidad.id);
      if (e) {
        setOcupado(false);
        return setError(e.message);
      }
    }
    setOcupado(false);
    setFilas([]);
    onVolver();
    router.refresh();
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <Card>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
          <div>
            <h2 style={{ margin: 0, fontFamily: "var(--font-titulos)", fontSize: 16 }}>Cargar saldos iniciales</h2>
            <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--tenue)" }}>
              CSV por ahora. Se cruza por el código de la unidad, sin importar puntos ni espacios.
            </p>
          </div>
          <Button type="button" variante="secundario" mini onClick={onVolver}>
            Volver
          </Button>
        </div>

        {hayCierres && (
          <div style={{ margin: "14px 0" }}>
            <Aviso tono="rojo" titulo="Este edificio ya tiene meses cerrados">
              El saldo inicial solo se usa mientras no exista ningún cierre. Después, el saldo
              parte de la última instantánea y cambiar este número no lo mueve. Si necesita
              corregir una deuda de un mes ya cerrado, use una exoneración o un cargo puntual
              (Pagos, Sesión 2).
            </Aviso>
          </div>
        )}

        <input
          type="file"
          accept=".csv"
          onChange={(e) => leer(e.target.files?.[0])}
          className="control"
          style={{ padding: 10, marginTop: 14 }}
        />
        <p style={{ fontSize: 12, color: "var(--tenue)", marginTop: 8 }}>
          Del archivo se toma la primera columna como código y el último número de la fila como
          monto.
        </p>
        {error && (
          <div style={{ marginTop: 12 }}>
            <Aviso tono="ambar" titulo="No se pudo leer el archivo">
              {error}
            </Aviso>
          </div>
        )}
      </Card>

      {filas.length > 0 && (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 18px 0" }}>
            <h3 style={{ margin: 0, fontSize: 14 }}>
              {cruzan.length} de {filas.length} filas cruzan con una unidad
            </h3>
          </div>
          <div className="tabla-scroll" style={{ maxHeight: 380 }}>
            <table className="tabla">
              <thead>
                <tr>
                  <th>Código del archivo</th>
                  <th>Unidad</th>
                  <th style={{ textAlign: "right" }}>Saldo a aplicar</th>
                </tr>
              </thead>
              <tbody>
                {filas.map((f, i) => (
                  <tr key={i} style={{ background: f.unidad ? "transparent" : "var(--ambar-bg)" }}>
                    <td className="mono">{f.cod}</td>
                    <td className="mono">
                      {f.unidad ? f.unidad.codigo : <span style={{ color: "var(--ambar)" }}>no se encontró</span>}
                    </td>
                    <td className="mono" style={{ textAlign: "right" }}>
                      {f.monto === null ? "—" : nf(2).format(f.monto)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div style={{ padding: 18, borderTop: "1px solid var(--linea)", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <Button type="button" disabled={!cruzan.length || ocupado} onClick={aplicar}>
              Aplicar {cruzan.length} saldos
            </Button>
            <Button type="button" variante="secundario" onClick={() => setFilas([])}>
              Descartar
            </Button>
          </div>
        </Card>
      )}
    </div>
  );
}
