"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Aviso, Button, Card } from "@/components/ui";
import { nf } from "@/lib/formato";
import { leerPDF, leerTabla, parseMonto } from "@/lib/admin/archivos-tabla";
import { normaliza } from "@/lib/admin/personas";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { Unidad } from "@/lib/admin/tipos";
import { mensajeDeError } from "@/lib/errores";

type FilaLeida = { cod: string; monto: number | null; unidad: Unidad | null };

/* La lectura de archivos (`leerTabla` para Excel/CSV, `leerPDF`) y
   `parseMonto` viven en lib/admin/archivos-tabla.ts: los comparte con la
   conciliación bancaria de Pagos, igual que en admin.html (las mismas
   funciones sirven a las dos pantallas). */

/**
 * Portado de ImportarSaldos() en admin.html:1989-2123. Lee Excel, CSV y
 * PDF, igual que main — las librerías entran por importación diferida
 * desde lib/admin/archivos-tabla.ts, así que su peso solo se baja cuando
 * alguien elige de verdad un archivo (ver el comentario de ese archivo).
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
  const [nota, setNota] = useState<string | null>(null);
  const [leyendo, setLeyendo] = useState(false);
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
    setNota(null);
    setLeyendo(true);
    try {
      /* El PDF no tiene columnas: de cada renglón se saca el código (lo que
         viene al principio) y el último monto que aparezca
         (admin.html:2009-2016). */
      let crudas: string[][];
      if (/\.pdf$/i.test(file.name)) {
        crudas = (await leerPDF(file)).map((l) => {
          const montos = l.match(/-?\d{1,3}(?:[.,]\d{3})*[.,]\d{2}\b/g) || [];
          const cod = (l.match(/^[A-Za-zÀ-ÿ0-9ºª.\- ]{1,12}/) || [""])[0].trim();
          return [cod, montos.length ? montos[montos.length - 1] : ""];
        });
      } else {
        crudas = await leerTabla(file);
      }

      /* Se descartan las filas de total: en las planillas reales siempre hay
         una al final que, si entra, se carga como si fuera una unidad. */
      const limpias = crudas
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
      const cuantasCruzan = res.filter((r) => r.unidad).length;
      setNota(`${res.length} filas leídas, ${cuantasCruzan} cruzan con una unidad.`);
    } catch (e) {
      setError(mensajeDeError(e));
    }
    setLeyendo(false);
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
        return setError(mensajeDeError(e));
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
              Excel, CSV o PDF. Se cruza por el código de la unidad, sin importar puntos ni espacios.
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
              corregir una deuda de un mes ya cerrado, use una exoneración o un cargo puntual.
            </Aviso>
          </div>
        )}

        <input
          type="file"
          accept=".xlsx,.xls,.csv,.pdf"
          disabled={leyendo}
          onChange={(e) => leer(e.target.files?.[0])}
          className="control"
          style={{ padding: 10, marginTop: 14 }}
        />
        <p style={{ fontSize: 12, color: "var(--tenue)", marginTop: 8 }}>
          Del archivo se toma la primera columna como código y el último número de la fila como
          monto. La lectura de Excel y CSV es exacta; la de PDF es interpretada, así que revise la
          previa con más cuidado.
        </p>
        {nota && (
          <p style={{ fontSize: 12.5, color: "var(--tinta-2)", marginTop: 8 }}>{nota}</p>
        )}
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
            <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-titulos)" }}>Previa</h2>
            <p style={{ margin: "3px 0 0", fontSize: 12.5, color: "var(--tenue)" }}>
              {cruzan.length} de {filas.length} filas cruzan con una unidad
            </p>
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
