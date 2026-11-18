import Link from "next/link";
import { Building2, CalendarClock, ChevronRight, CircleDollarSign, ReceiptText, TrendingDown } from "lucide-react";
import { Aviso, Card, Vacio } from "@/components/ui";
import { Edificio } from "@/components/admin/Edificio";
import { usd } from "@/lib/formato";
import type { PropsInicio } from "@/lib/admin/pantallas/inicio";

/**
 * Portado de Inicio() en app.html:1348-1433. Lo que antes estaba escrito
 * dentro de inicio/page.tsx, sin cambios: lo dibujan la página en línea y la
 * pantalla sin conexión (cambio 3), con props de `armarPropsInicio`.
 *
 * Sin directiva: es Server Component desde la página y Client Component
 * desde la cáscara. Por eso no usa nada propio de ninguno de los dos.
 */
export function PantallaInicio({
  orgId,
  edificioId,
  tolerancia,
  props: p,
}: {
  orgId: string;
  edificioId: string;
  tolerancia: number | null | undefined;
  props: PropsInicio;
}) {
  if (!p.hayUnidades) {
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

  const { saldos, porCobrar, aFavor, conDeuda, sumaAlicuotas, ultimo, cantidadCerrados, periodoAbierto, hayConceptos, usaPresupuesto, morosos } = p;

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
          <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: porCobrar > 0 ? "var(--rojo)" : "var(--tinta)" }}>
            {usd(porCobrar)}
          </div>
          <div style={{ fontSize: 11.5, color: "var(--tenue)", marginTop: 4 }}>
            {conDeuda} de {saldos.length} unidades con deuda
          </div>
        </Card>
        <Card>
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
            <CircleDollarSign size={15} style={{ color: "var(--tenue)" }} />
            <div style={{ fontSize: 11, textTransform: "uppercase", letterSpacing: ".08em", color: "var(--tenue)" }}>
              Saldos a favor
            </div>
          </div>
          <div className="mono" style={{ fontSize: 22, fontWeight: 700, color: aFavor < -0.009 ? "var(--a-favor)" : undefined }}>{usd(Math.abs(aFavor))}</div>
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
            {ultimo ? `${cantidadCerrados} meses cerrados` : "Todavía no se ha cerrado ninguno"}
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
          Sin al menos un cobro activo el mes no se puede cerrar. Vaya a Ajustes, «Reglas de cobro
          del edificio», y defina qué se le cobra a cada unidad.
        </Aviso>
      )}
      {periodoAbierto && usaPresupuesto && !periodoAbierto.presupuesto && (
        <Aviso tono="ambar" titulo="Falta el presupuesto del mes">
          Este edificio cobra repartiendo un presupuesto, no el gasto ejecutado. Escriba el monto
          en «Gastos del mes» antes de cerrar.
        </Aviso>
      )}

      <Edificio
        saldos={saldos}
        sumaAlicuotas={sumaAlicuotas}
        tolerancia={tolerancia}
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
