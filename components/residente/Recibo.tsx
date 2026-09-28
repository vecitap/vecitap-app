"use client";

import { useState } from "react";
import { Button, Card } from "@/components/ui";
import { bs, fechaCorta, fechaLarga, nf, usd } from "@/lib/formato";
import { imprimirDocumento, reciboEnPapel } from "@/lib/recibo-papel";
import type { RegistroRecibo } from "@/lib/residente/tipos";
import type { Database } from "@/types/supabase";

type Unidad = Database["public"]["Functions"]["mis_unidades"]["Returns"][number];

/** Portado de Recibo() en residente.html:725-862. */
export function Recibo({
  unidad,
  recibo,
  falla,
}: {
  unidad: Unidad;
  recibo: RegistroRecibo | null;
  falla: string | null;
}) {
  // Este estado va arriba de todo: un hook detrás de un return solo se
  // ejecuta a veces, y React tumba la pantalla entera cuando la cuenta le
  // cambia entre un dibujado y otro.
  const [abierto, setAbierto] = useState(false);

  if (falla) {
    return (
      <Card>
        <div style={{ color: "var(--rojo)", fontSize: 14, lineHeight: 1.6 }}>
          No se pudo traer su recibo. Muéstrele este mensaje a su administración:
          <div
            className="mono"
            style={{ marginTop: 8, fontSize: 12.5, color: "var(--tinta-2)", background: "var(--fondo)", padding: 10, borderRadius: 8 }}
          >
            {falla}
          </div>
        </div>
      </Card>
    );
  }

  if (!recibo) {
    return (
      <Card>
        <div style={{ color: "var(--tinta-2)", fontSize: 14, lineHeight: 1.6 }}>
          {unidad.recibo_numero ? (
            <>
              Su recibo <b className="mono">{unidad.recibo_numero}</b> de {unidad.recibo_periodo} existe, pero
              esta pantalla no logró traer el detalle. Avísele a su administración.
            </>
          ) : (
            <>
              Todavía no hay ningún recibo emitido para esta unidad. Aparece aquí en cuanto su administración
              cierre el mes.
            </>
          )}
        </div>
      </Card>
    );
  }

  const tasaViva = Number(recibo.tasaHoy?.valor) > 0;
  const tasaCandidata = tasaViva ? Number(recibo.tasaHoy!.valor) : Number(recibo.tasa_bcv);
  const tasaMostrada = tasaCandidata > 0 ? tasaCandidata : null;

  const fila = (etiqueta: string, valor: number, fuerte = false) => (
    <div
      key={etiqueta}
      style={{
        display: "flex",
        justifyContent: "space-between",
        gap: 12,
        padding: "9px 0",
        borderBottom: "1px solid var(--linea)",
        fontWeight: fuerte ? 700 : 400,
      }}
    >
      <span style={{ color: fuerte ? "var(--tinta)" : "var(--tinta-2)" }}>{etiqueta}</span>
      <span className="mono">{usd(valor)}</span>
    </div>
  );

  return (
    <Card>
      <div
        style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, marginBottom: 12, flexWrap: "wrap" }}
      >
        <div>
          <div style={{ fontSize: 12, color: "var(--tenue)" }}>Recibo</div>
          <div className="mono" style={{ fontSize: 16, fontWeight: 600 }}>
            {recibo.numero}
          </div>
        </div>
        {/* Se usa la tasa viva. Solo si la base no la dio se cae a la del
            recibo, y entonces se dice de cuándo es (index.html:1368-1384). */}
        {tasaMostrada !== null && (
          <div style={{ textAlign: "right" }}>
            <div style={{ fontSize: 12, color: "var(--tenue)" }}>Si paga hoy</div>
            <div className="mono" style={{ fontSize: 15, fontWeight: 600 }}>
              {bs(Number(recibo.total) * tasaMostrada)}
            </div>
            <div style={{ fontSize: 11, color: "var(--tenue)" }}>
              tasa {nf(2).format(tasaMostrada)}
              {tasaViva ? " de hoy" : " del recibo"}
            </div>
          </div>
        )}
      </div>

      {recibo.conceptos.map((l) => fila(l.nombre, l.monto))}
      {Number(recibo.directos) > 0 && fila("Cargos de su unidad", recibo.directos)}
      {Number(recibo.anterior) > 0 && fila("Saldo del mes anterior", recibo.anterior)}
      {Number(recibo.a_favor) > 0 && fila("A su favor", -recibo.a_favor)}
      {Number(recibo.mora) > 0 && fila("Intereses de mora", recibo.mora)}
      {fila("Total", recibo.total, true)}

      {recibo.vence_el && (
        <div
          style={{ marginTop: 12, padding: "10px 12px", borderRadius: 9, background: "var(--ambar-bg)", color: "var(--ambar)", fontSize: 13, fontWeight: 600 }}
        >
          Vence el {fechaLarga(recibo.vence_el)}
        </div>
      )}

      {/* En qué se fue la plata. Es lo primero que pregunta cualquiera que
          recibe un recibo de condominio. */}
      {recibo.detalle.length > 0 && (
        <div style={{ marginTop: 16, borderTop: "1px solid var(--linea)", paddingTop: 14 }}>
          <button
            type="button"
            onClick={() => setAbierto(!abierto)}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--tinta)", fontSize: 14, fontWeight: 600, fontFamily: "inherit" }}
          >
            {abierto ? "Ocultar" : "Ver"} en qué se gastó este mes
          </button>

          {abierto && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 12.5, color: "var(--tenue)", lineHeight: 1.6, marginBottom: 12 }}>
                Su alícuota es {nf(4).format(recibo.alicuota)} %. La columna de la derecha es la parte que le
                toca de cada gasto.
              </div>
              {recibo.detalle.map((cat, i) => (
                <div key={i} style={{ marginBottom: 14 }}>
                  <div style={{ fontSize: 11.5, textTransform: "uppercase", letterSpacing: ".07em", color: "var(--tenue)", fontWeight: 700, marginBottom: 6 }}>
                    {cat.categoria}
                  </div>
                  {(cat.lineas || []).map((l, j) => (
                    <div
                      key={j}
                      style={{ display: "flex", justifyContent: "space-between", gap: 12, padding: "7px 0", borderBottom: "1px solid var(--linea)", fontSize: 13.5 }}
                    >
                      <span style={{ color: "var(--tinta-2)", flex: 1, minWidth: 0 }}>
                        {l.concepto}
                        {l.referencia && <span style={{ color: "var(--tenue)", fontSize: 12 }}> · {l.referencia}</span>}
                      </span>
                      <span className="mono" style={{ color: "var(--tenue)", fontSize: 12.5, whiteSpace: "nowrap" }}>
                        {usd(l.monto)}
                      </span>
                      <span className="mono" style={{ fontWeight: 600, whiteSpace: "nowrap" }}>
                        {usd(l.parte)}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div style={{ marginTop: 16 }}>
        <Button
          type="button"
          variante="secundario"
          style={{ width: "100%" }}
          onClick={() =>
            imprimirDocumento(
              reciboEnPapel({
                edificio: recibo.edificio || unidad.edificio,
                organizacion: unidad.organizacion,
                unidad: unidad.codigo,
                vence: fechaCorta(recibo.vence_el),
                // La tasa viva viaja al papel: el PDF se genera ahora, no el
                // día en que se emitió el recibo (index.html:1453-1455).
                tasaHoy: recibo.tasaHoy,
                recibo,
              }),
              () => {}
            )
          }
        >
          Descargar o imprimir mi recibo
        </Button>
        <div style={{ fontSize: 12, color: "var(--tenue)", marginTop: 6, lineHeight: 1.5 }}>
          Se abre listo para imprimir. En el mismo cuadro puede elegir «Guardar como PDF».
        </div>
      </div>

      <p style={{ fontSize: 12.5, color: "var(--tenue)", lineHeight: 1.6, marginBottom: 0, marginTop: 14 }}>
        El monto en bolívares es referencial y cambia todos los días: su cuota está en dólares y se
        convierte con la tasa del Banco Central del día en que usted pague. Si paga mañana, el monto
        en bolívares será otro.
      </p>
    </Card>
  );
}
