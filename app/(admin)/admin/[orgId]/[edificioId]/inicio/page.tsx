import Link from "next/link";
import { Building2, CalendarClock, ChevronRight, CircleDollarSign, ReceiptText, TrendingDown } from "lucide-react";
import { Aviso, Card, Vacio } from "@/components/ui";
import { Edificio } from "@/components/admin/Edificio";
import { calcularMetricasInicio } from "@/lib/admin/metricas";
import { usd } from "@/lib/formato";
import { crearClienteServidor } from "@/lib/supabase/server";
import type { SaldoActual, Unidad } from "@/lib/admin/tipos";

/** Portado de Inicio() en app.html:1348-1433. */
export default async function PaginaInicio({
  params,
}: {
  params: Promise<{ orgId: string; edificioId: string }>;
}) {
  const { orgId, edificioId } = await params;
  const supabase = await crearClienteServidor();

  const [{ data: unidades, error: e1 }, { data: saldos, error: e2 }, { data: conceptos, error: e3 }, { data: periodos, error: e4 }, { data: edificio, error: e5 }] =
    await Promise.all([
      supabase
        .from("unidades")
        .select("id,codigo,alicuota,saldo_inicial,saldo_inicial_hon,activa,vinculos(id,tipo,desde,hasta,enviar_corte,persona_id,personas(id,prefijo,nombre,documento,telefono,correo))")
        .eq("edificio_id", edificioId)
        .order("codigo"),
      supabase
        .from("saldos_actuales")
        .select("unidad_id,codigo,alicuota,condominio,administracion,servicio,total,estado")
        .eq("edificio_id", edificioId)
        .order("codigo"),
      supabase.from("conceptos_cobro").select("id,nombre,bolsillo,modo,monto,iva,orden,activo,edificio_id").or(`edificio_id.eq.${edificioId},edificio_id.is.null`),
      supabase
        .from("periodos")
        .select("id,anio,mes,etiqueta,estado,tasa_bcv,presupuesto,total_gastos,cerrado_en,enviado_en")
        .eq("edificio_id", edificioId)
        .order("anio", { ascending: false })
        .order("mes", { ascending: false }),
      supabase.from("edificios").select("tolerancia_alicuota").eq("id", edificioId).single(),
    ]);

  if (e1 || e2 || e3 || e4 || e5) throw e1 || e2 || e3 || e4 || e5;

  const unidadesFilas: Unidad[] = unidades ?? [];
  const saldosFilas: SaldoActual[] = saldos ?? [];

  if (unidadesFilas.length === 0) {
    return (
      <Vacio
        titulo="Empiece por cargar los propietarios"
        texto="Registre las unidades con su alícuota y el saldo que arrastran hoy. Puede pegarlos desde su hoja de cálculo."
        icono={<Building2 size={28} />}
        accion={
          <Link href={`/admin/${orgId}/${edificioId}/propietarios`} className="btn" style={{ textDecoration: "none" }}>
            Ir a Propietarios
          </Link>
        }
      />
    );
  }

  const { sumaAlicuotas, porCobrar, aFavor, conDeuda } = calcularMetricasInicio(unidadesFilas, saldosFilas);
  const cerrados = (periodos ?? []).filter((p) => p.estado === "cerrado");
  const ultimo = cerrados[0];
  const periodoAbierto = (periodos ?? []).find((p) => p.estado === "abierto") ?? null;
  const hayConceptos = (conceptos ?? []).some((c) => c.activo);
  const usaPresupuesto = (conceptos ?? []).some((c) => c.activo && c.modo.startsWith("presupuesto"));
  // Mismo literal que main (admin.html:1620). Ver docs/casos-de-uso-mejorados.md, caso 11.
  const morosos = [...saldosFilas]
    .filter((s) => (Number(s.total) || 0) > 0.01)
    .sort((a, b) => Number(b.total) - Number(a.total))
    .slice(0, 6);

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <div className="apila-movil" style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(210px,1fr))" }}>
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <TrendingDown size={15} style={{ color: "var(--tenue)" }} />
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--tenue)" }}>
              Por cobrar
            </div>
          </div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: porCobrar > 0 ? "var(--rojo)" : "var(--verde)" }}>
            {usd(porCobrar)}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--tenue)", marginTop: 4 }}>
            {conDeuda} de {saldosFilas.length} unidades con deuda
          </div>
        </Card>
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <CircleDollarSign size={15} style={{ color: "var(--tenue)" }} />
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--tenue)" }}>
              Saldos a favor
            </div>
          </div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 700 }}>{usd(Math.abs(aFavor))}</div>
          <div style={{ fontSize: 11.5, color: "var(--tenue)", marginTop: 4 }}>Anticipos que ya pagaron</div>
        </Card>
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <ReceiptText size={15} style={{ color: "var(--tenue)" }} />
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--tenue)" }}>
              Último mes cerrado
            </div>
          </div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 700 }}>{ultimo ? ultimo.etiqueta : "—"}</div>
          <div style={{ fontSize: 11.5, color: "var(--tenue)", marginTop: 4 }}>
            {ultimo ? `${cerrados.length} meses cerrados` : "Todavía no se ha cerrado ninguno"}
          </div>
        </Card>
        <Link
          href={`/admin/${orgId}/${edificioId}/mes`}
          style={{ textDecoration: "none", color: "inherit" }}
        >
          <Card>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <CalendarClock size={15} style={{ color: "var(--tenue)" }} />
              <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--tenue)" }}>
                Mes abierto
              </div>
            </div>
            <div className="mono" style={{ fontSize: 22, fontWeight: 700 }}>
              {periodoAbierto ? periodoAbierto.etiqueta : "ninguno"}
            </div>
            <div style={{ fontSize: 11.5, color: "var(--tenue)", marginTop: 4 }}>
              {periodoAbierto
                ? usaPresupuesto
                  ? periodoAbierto.presupuesto
                    ? `presupuesto ${usd(periodoAbierto.presupuesto)}`
                    : "falta el presupuesto"
                  : `gastos ${usd(periodoAbierto.total_gastos)}`
                : "Abrir el mes para empezar"}
            </div>
          </Card>
        </Link>
      </div>

      {!hayConceptos && (
        <Aviso tono="rojo" titulo="Este edificio no tiene cobros configurados">
          Sin al menos un cobro activo el mes no se puede cerrar. Vaya a Cobros y defina qué se
          le cobra a cada unidad.
        </Aviso>
      )}
      {periodoAbierto && usaPresupuesto && !periodoAbierto.presupuesto && (
        <Aviso tono="ambar" titulo="Falta el presupuesto del mes">
          Este edificio cobra repartiendo un presupuesto, no el gasto ejecutado. Escriba el monto
          en Cierre del mes antes de cerrar.
        </Aviso>
      )}

      <Edificio
        saldos={saldosFilas}
        sumaAlicuotas={sumaAlicuotas}
        tolerancia={edificio?.tolerancia_alicuota}
        hrefUnidad={(unidadId) => `/admin/${orgId}/${edificioId}/propietarios/${unidadId}`}
      />

      {morosos.length > 0 && (
        <Card style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "16px 18px 0" }}>
            <h2 style={{ margin: 0, fontSize: 15, fontFamily: "var(--font-titulos)" }}>Quién debe más</h2>
            <p style={{ margin: "3px 0 12px", fontSize: 12, color: "var(--tenue)" }}>
              Los seis saldos más altos. Haga clic para ver la cuenta completa.
            </p>
          </div>
          <table className="tabla apila" style={{ width: "100%" }}>
            <thead>
              <tr>
                <th>Unidad</th>
                <th>Condominio</th>
                <th>Administración</th>
                <th>Servicio</th>
                <th style={{ textAlign: "right" }}>Total</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {morosos.map((m) => (
                <tr key={m.unidad_id}>
                  <td className="mono cabeza" style={{ fontWeight: 600 }}>
                    <Link
                      href={`/admin/${orgId}/${edificioId}/propietarios/${m.unidad_id}`}
                      style={{ color: "inherit", textDecoration: "none" }}
                    >
                      {m.codigo}
                    </Link>
                  </td>
                  <td className="mono" data-t="Condominio">
                    {usd(m.condominio)}
                  </td>
                  <td className="mono" data-t="Administración">
                    {usd(m.administracion)}
                  </td>
                  <td className="mono" data-t="Servicio">
                    {usd(m.servicio)}
                  </td>
                  <td className="mono" data-t="Total" style={{ textAlign: "right", fontWeight: 700, color: "var(--rojo)" }}>
                    {usd(m.total)}
                  </td>
                  <td className="flecha" style={{ width: 28 }}>
                    <Link href={`/admin/${orgId}/${edificioId}/propietarios/${m.unidad_id}`}>
                      <ChevronRight size={15} style={{ color: "var(--tenue)" }} />
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
