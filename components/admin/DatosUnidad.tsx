"use client";

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Aviso, Button, Campo, Card, Confirmar, Input, Select } from "@/components/ui";
import { fechaCorta, hoyLocalISO, num0 } from "@/lib/formato";
import { correoValido, nombreDe } from "@/lib/admin/personas";
import { OPCIONES_PAGA, esPaga, pagaDe, type Paga } from "@/lib/paga";
import { crearClienteNavegador } from "@/lib/supabase/client";
import type { UnidadConPaga, Vinculo } from "@/lib/admin/tipos";

const TRATAMIENTOS = ["Sr.", "Sra.", "Sres.", "Dr.", "Dra.", ""];

type FormPersona = { prefijo: string; nombre: string; documento: string; telefono: string; correo: string; enviar: boolean };

function aForm(v: Vinculo | null): FormPersona {
  return {
    prefijo: v?.personas?.prefijo || "Sr.",
    nombre: v?.personas?.nombre || "",
    documento: v?.personas?.documento || "",
    telefono: v?.personas?.telefono || "",
    correo: v?.personas?.correo || "",
    enviar: v ? v.enviar_corte : true,
  };
}

/**
 * Portado de DatosUnidad() en app.html:2133-2263.
 *
 * Dos agregados del 30-sep que `main` no tiene (docs/casos-de-uso-mejorados.md,
 * casos 31 y 32):
 *  - "¿Quién paga el condominio?" (`unidades.paga`). Se guarda DESPUÉS de los
 *    vínculos: la base rechaza paga = 'inquilino' si la unidad no tiene un
 *    inquilino vigente (guarda B de 20260930120000_unidades_paga.sql), así que
 *    "cargo al inquilino y marco que paga él" en un mismo guardado necesita
 *    que el vínculo exista primero.
 *  - "El inquilino ya no ocupa la unidad": le pone `hasta` a su vínculo. Si
 *    era el último inquilino, la base apaga además los accesos de inquilino
 *    de esta unidad (3b de la misma migración); su usuario sigue activo.
 */
export function DatosUnidad({
  orgId,
  unidad,
  prop,
  inq,
}: {
  orgId: string;
  unidad: UnidadConPaga;
  prop: Vinculo | null;
  inq: Vinculo | null;
}) {
  const router = useRouter();
  const [u, setU] = useState({
    codigo: unidad.codigo,
    alicuota: String(unidad.alicuota),
    saldo: String(unidad.saldo_inicial),
    saldoHon: String(unidad.saldo_inicial_hon),
    activa: unidad.activa,
  });
  const [paga, setPaga] = useState<Paga>(pagaDe(unidad.paga));
  const [p, setP] = useState<FormPersona>(aForm(prop));
  const [i, setI] = useState<FormPersona>(aForm(inq));
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [listo, setListo] = useState<string | null>(null);
  const [confirmarSalida, setConfirmarSalida] = useState(false);

  // "Tiene inquilino" para la UI: el vigente que ya está en la base, o uno
  // que se va a crear en este mismo guardado. La base vuelve a comprobarlo
  // (guarda B); esto solo evita mandar algo que se sabe que va a rechazar.
  const hayInquilino = !!inq || !!i.nombre.trim();
  const faltaInquilino = paga === "inquilino" && !hayInquilino;
  // Si se va `inq` y no queda otro inquilino vigente, el disparador A de la
  // base devuelve `paga` a propietario. Con otro vigente (raro: la ficha
  // muestra uno solo), la base no la toca y la pantalla tampoco.
  const otrosInquilinos = unidad.vinculos.filter((v) => v.tipo === "inquilino" && !v.hasta && v.id !== inq?.id).length;
  const pagaVuelve = pagaDe(unidad.paga) === "inquilino" && otrosInquilinos === 0;

  async function guardarVinculo(tipo: "propietario" | "inquilino", f: FormPersona, actual: Vinculo | null) {
    if (!f.nombre.trim()) return;
    const supabase = crearClienteNavegador();
    const camposPersona = {
      prefijo: f.prefijo || null,
      nombre: f.nombre.trim(),
      documento: f.documento.trim() || null,
      telefono: f.telefono.trim() || null,
      correo: f.correo.trim() || null,
    };

    if (actual?.personas?.id) {
      const { data: dp, error } = await supabase.from("personas").update(camposPersona).eq("id", actual.personas.id).select("id");
      if (error) throw error;
      if (!dp || dp.length === 0) throw new Error(`No se pudo guardar los datos del ${tipo}. Puede ser un permiso.`);

      const { data: dv, error: e2 } = await supabase
        .from("vinculos")
        .update({ enviar_corte: !!f.enviar })
        .eq("id", actual.id)
        .select("id,enviar_corte");
      if (e2) throw e2;
      if (!dv || dv.length === 0) throw new Error(`No se pudo guardar el envío del corte del ${tipo}.`);
      if (dv[0].enviar_corte !== !!f.enviar) throw new Error(`La base guardó otro valor en el envío del corte del ${tipo}.`);
    } else {
      const { data, error } = await supabase.from("personas").insert({ org_id: orgId, ...camposPersona }).select("id").single();
      if (error) throw error;
      const { error: e2 } = await supabase
        .from("vinculos")
        .insert({ org_id: orgId, unidad_id: unidad.id, persona_id: data.id, tipo, enviar_corte: f.enviar });
      if (e2) throw e2;
    }
  }

  async function guardarPaga() {
    if (paga === pagaDe(unidad.paga)) return;
    const supabase = crearClienteNavegador();
    // Con .select(): un UPDATE que RLS filtra no da error, devuelve 0 filas.
    // El mensaje de la guarda B, si rechaza, llega en `error` y se muestra
    // tal cual — está escrito para la administradora.
    const { data, error } = await supabase.from("unidades").update({ paga }).eq("id", unidad.id).select("paga");
    if (error) throw error;
    if (!data || data.length === 0) throw new Error("No se pudo guardar quién paga el condominio. Puede ser un permiso.");
    if (data[0].paga !== paga) throw new Error("La base guardó otro valor en quién paga el condominio.");
  }

  async function guardar() {
    if (faltaInquilino) {
      setError(
        `La unidad ${unidad.codigo} no tiene un inquilino registrado. Cargue primero los datos del inquilino y después indique que él paga el condominio.`
      );
      return;
    }
    setOcupado(true);
    setError(null);
    setListo(null);
    try {
      const supabase = crearClienteNavegador();
      const { error } = await supabase
        .from("unidades")
        .update({ codigo: u.codigo.trim(), alicuota: num0(u.alicuota), saldo_inicial: num0(u.saldo), saldo_inicial_hon: num0(u.saldoHon), activa: u.activa })
        .eq("id", unidad.id);
      if (error) throw error;
      await guardarVinculo("propietario", p, prop);
      await guardarVinculo("inquilino", i, inq);
      await guardarPaga();
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setOcupado(false);
  }

  async function inquilinoSeFue() {
    if (!inq) return;
    setConfirmarSalida(false);
    setOcupado(true);
    setError(null);
    setListo(null);
    try {
      const supabase = crearClienteNavegador();
      // Accesos de inquilino activos de ESTA unidad, antes y después: la base
      // los apaga sola cuando se va el último inquilino (3b de
      // 20260930120000_unidades_paga.sql), y la pantalla solo lo anuncia si
      // de verdad apagó al menos uno. La administradora los puede leer
      // (política mem_ver), aunque no escribirlos.
      const accesosActivos = async () => {
        const { count, error } = await supabase
          .from("membresias")
          .select("id", { count: "exact", head: true })
          .eq("unidad_id", unidad.id)
          .eq("rol", "residente")
          .eq("relacion", "inquilino")
          .eq("activo", true);
        return error ? null : (count ?? 0);
      };
      const antes = await accesosActivos();

      const { data, error } = await supabase
        .from("vinculos")
        .update({ hasta: hoyLocalISO() })
        .eq("id", inq.id)
        .is("hasta", null)
        .select("id");
      if (error) throw error;
      if (!data || data.length === 0) throw new Error("No se pudo registrar la salida del inquilino. Puede ser un permiso, o ya se había registrado.");

      const despues = await accesosActivos();
      const seQuitoAcceso = antes !== null && despues !== null && despues < antes;
      // El formulario del inquilino queda vacío: si conservara los datos del
      // que se fue, el próximo "Guardar cambios" lo volvería a crear como
      // inquilino nuevo. Y `paga` vuelve a propietario solo si la base lo
      // hizo (disparador A: era el único inquilino vigente).
      setI(aForm(null));
      if (pagaVuelve) setPaga("propietario");
      setListo(
        [
          `${nombreDe(inq) || "El inquilino"} ya no figura como inquilino de ${unidad.codigo}.`,
          seQuitoAcceso ? "También se le quitó el acceso a la app." : "",
        ]
          .filter(Boolean)
          .join(" ")
      );
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
    setOcupado(false);
  }

  function bloque(titulo: string, f: FormPersona, setF: (f: FormPersona) => void, ayuda: string, pie?: ReactNode) {
    const correoMal = !!f.correo && !correoValido(f.correo);
    return (
      <Card>
        <h3 style={{ margin: "0 0 4px", fontSize: 14 }}>{titulo}</h3>
        <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--tenue)" }}>{ayuda}</p>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
          <Campo etiqueta="Tratamiento">
            <Select value={f.prefijo} onChange={(e) => setF({ ...f, prefijo: e.target.value })}>
              {TRATAMIENTOS.map((x) => (
                <option key={x} value={x}>
                  {x || "sin tratamiento"}
                </option>
              ))}
            </Select>
          </Campo>
          <Campo etiqueta="Nombre">
            <Input value={f.nombre} onChange={(e) => setF({ ...f, nombre: e.target.value })} />
          </Campo>
          <Campo etiqueta="Cédula o RIF">
            <Input className="mono" value={f.documento} onChange={(e) => setF({ ...f, documento: e.target.value })} />
          </Campo>
          <Campo etiqueta="Teléfono">
            <Input className="mono" value={f.telefono} onChange={(e) => setF({ ...f, telefono: e.target.value })} />
          </Campo>
          <div style={{ gridColumn: "1 / -1" }}>
            <Campo etiqueta="Correo" error={correoMal ? "Ese correo no se entiende." : undefined}>
              <Input value={f.correo} onChange={(e) => setF({ ...f, correo: e.target.value })} />
            </Campo>
          </div>
          <label style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
            <input type="checkbox" checked={f.enviar} onChange={(e) => setF({ ...f, enviar: e.target.checked })} />
            Enviarle el corte de cuenta
          </label>
        </div>
        {pie}
      </Card>
    );
  }

  return (
    <div style={{ display: "grid", gap: 16 }}>
      {error && <p style={{ color: "var(--rojo)", fontSize: 13 }}>{error}</p>}
      {listo && (
        <Aviso tono="verde" titulo="Listo">
          {listo}
        </Aviso>
      )}
      <Card>
        <h3 style={{ margin: "0 0 4px", fontSize: 14 }}>La unidad</h3>
        <p style={{ margin: "0 0 12px", fontSize: 12, color: "var(--tenue)" }}>
          El código sale en el número de cada recibo, así que cambiarlo cambia la numeración de
          los recibos futuros.
        </p>
        <div style={{ display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
          <Campo etiqueta="Código">
            <Input className="mono" value={u.codigo} onChange={(e) => setU({ ...u, codigo: e.target.value })} />
          </Campo>
          <Campo etiqueta="Alícuota %">
            <Input className="mono" value={u.alicuota} onChange={(e) => setU({ ...u, alicuota: e.target.value })} />
          </Campo>
          <Campo etiqueta="Saldo inicial de condominio" ayuda="Solo cuenta mientras el edificio no tenga ningún mes cerrado.">
            <Input className="mono" value={u.saldo} onChange={(e) => setU({ ...u, saldo: e.target.value })} />
          </Campo>
          <Campo etiqueta="Saldo inicial de administración">
            <Input className="mono" value={u.saldoHon} onChange={(e) => setU({ ...u, saldoHon: e.target.value })} />
          </Campo>
          <div style={{ gridColumn: "1 / -1" }}>
            <Campo
              etiqueta="¿Quién paga el condominio?"
              ayuda="Lo decide la administración. Si paga el inquilino, el propietario ve esta unidad en su resumen solo como al día o con deuda, sin montos."
            >
              <Select value={paga} onChange={(e) => esPaga(e.target.value) && setPaga(e.target.value)}>
                {OPCIONES_PAGA.map((o) => (
                  <option key={o.valor} value={o.valor}>
                    {o.etiqueta}
                  </option>
                ))}
              </Select>
            </Campo>
          </div>
          {faltaInquilino && (
            <div style={{ gridColumn: "1 / -1" }}>
              <Aviso tono="ambar" titulo="Falta el inquilino">
                Para indicar que paga el inquilino, primero cargue sus datos más abajo.
              </Aviso>
            </div>
          )}
          <label style={{ gridColumn: "1 / -1", display: "flex", alignItems: "center", gap: 8, fontSize: 13.5 }}>
            <input type="checkbox" checked={u.activa} onChange={(e) => setU({ ...u, activa: e.target.checked })} />
            Unidad activa · una unidad inactiva no se factura, pero conserva su historia
          </label>
        </div>
      </Card>

      {bloque(
        "Propietario",
        p,
        setP,
        "La ley obliga al propietario del momento: quien era dueño en marzo responde por marzo, aunque venda en junio."
      )}
      {bloque(
        "Inquilino",
        i,
        setI,
        "Se registra para poder enviarle el corte, pero la deuda sigue siendo del propietario.",
        inq && (
          <div style={{ marginTop: 14, paddingTop: 12, borderTop: "1px solid var(--linea)" }}>
            <Button type="button" variante="secundario" mini disabled={ocupado} onClick={() => setConfirmarSalida(true)}>
              El inquilino ya no ocupa la unidad
            </Button>
          </div>
        )
      )}

      <div>
        <Button type="button" disabled={ocupado} onClick={guardar}>
          Guardar cambios
        </Button>
      </div>

      {confirmarSalida && inq && (
        <Confirmar
          titulo="¿El inquilino ya no ocupa la unidad?"
          texto={[
            `${nombreDe(inq) || "El inquilino"} deja de figurar como inquilino de ${unidad.codigo} desde hoy, ${fechaCorta(hoyLocalISO())}. Sus datos y su historia se conservan.`,
            pagaVuelve ? "La unidad vuelve a «paga el propietario»." : "",
            otrosInquilinos === 0
              ? "Si tiene cuenta en la app, se le quita el acceso a esta unidad; su usuario sigue activo para otros edificios."
              : "Como la unidad tiene otro inquilino registrado, los accesos a la app de esta unidad no se tocan.",
            "Los cambios sin guardar de este formulario no se guardan con esta acción.",
          ]
            .filter(Boolean)
            .join(" ")}
          boton="Sí, ya no la ocupa"
          onSi={inquilinoSeFue}
          onNo={() => setConfirmarSalida(false)}
        />
      )}
    </div>
  );
}
