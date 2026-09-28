"use client";

import { useEffect, useState } from "react";
import { Aviso, Badge, Button, Campo, Input, Select, type TonoBadge } from "@/components/ui";
import { correoValido } from "@/lib/admin/personas";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { fechaCorta } from "@/lib/formato";
import type { InvitacionAdmin, ResidenteAcceso, VigilanteAcceso } from "@/lib/admin/tipos";

type Mensaje = { texto: string; tipo: "ok" | "error" };
type Pestana = "invitar" | "pendientes" | "gente" | "vigilantes";

const TONO_ESTADO: Record<string, TonoBadge> = {
  aceptada: "verde",
  vencida: "rojo",
  revocada: "rojo",
};

/**
 * Portado de Accesos() en admin.html:3899-4252, con las cuatro pestañas:
 * Invitar · Invitaciones · Quién tiene acceso · Vigilantes. La de
 * vigilantes solo aparece si el edificio tiene contratada la garita —
 * sin el módulo, invitar a un vigilante sería darle una cuenta para
 * entrar a una pantalla donde la base le niega todo.
 *
 * `codigoUnidad()` del original no se portó: estaba definida pero nunca se
 * usaba en ninguna pestaña.
 *
 * Igual que CierreMes.tsx: `notificar`/`fallo` locales (no hay una versión
 * global en este proyecto) y los datos de las pestañas son estado propio,
 * cargado por su cuenta con `cargar()` — mismo patrón que el original, en
 * vez de pasar por Server Component + `router.refresh()` (`invs`/`gente`/
 * `vigis` no son props de la página, cambian con cada acción).
 */
export function Accesos({
  orgId,
  edificioId,
  nombreEdificio,
  edificios,
  unidades,
  hayGarita,
}: {
  orgId: string;
  edificioId: string;
  nombreEdificio: string;
  edificios: { id: string; nombre: string }[];
  unidades: { id: string; codigo: string }[];
  hayGarita: boolean;
}) {
  const [pest, setPest] = useState<Pestana>("invitar");
  const [f, setF] = useState({ unidad: "", correo: "", relacion: "propietario" });
  const [codigo, setCodigo] = useState<{ token: string; correo: string } | null>(null);
  const [invs, setInvs] = useState<InvitacionAdmin[]>([]);
  const [gente, setGente] = useState<ResidenteAcceso[]>([]);
  const [vigis, setVigis] = useState<VigilanteAcceso[]>([]);
  const [fv, setFv] = useState({ correo: "", edificio: "" });
  const [codigoVig, setCodigoVig] = useState<{ token: string; correo: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [mensaje, setMensaje] = useState<Mensaje | null>(null);

  function notificar(texto: string, tipo: "ok" | "error" = "ok") {
    setMensaje({ texto, tipo });
  }
  function fallo(e: unknown) {
    notificar(e instanceof Error ? e.message : String(e), "error");
  }

  async function cargar() {
    const supabase = crearClienteNavegador();
    const a = await supabase.rpc("invitaciones_de", { p_org: orgId });
    if (a.error) return fallo(a.error);
    setInvs(a.data ?? []);
    const b = await supabase.rpc("residentes_de", { p_edificio: edificioId });
    if (b.error) return fallo(b.error);
    setGente(b.data ?? []);
  }

  // Mismo dato que cargar() (más abajo, reusado después de cada
  // mutación), pero acá el fetch queda inline dentro del efecto: llamar a
  // una función declarada afuera que termina en setState dispara la regla
  // react-hooks/set-state-in-effect (no puede probar que el setState no es
  // síncrono), aunque acá sea imposible por el `await` — mismo patrón que
  // ya usa CierreMes.tsx.
  useEffect(() => {
    const supabase = crearClienteNavegador();
    supabase.rpc("invitaciones_de", { p_org: orgId }).then(({ data, error }) => {
      if (error) return fallo(error);
      setInvs(data ?? []);
    });
    supabase.rpc("residentes_de", { p_edificio: edificioId }).then(({ data, error }) => {
      if (error) return fallo(error);
      setGente(data ?? []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, edificioId]);

  useEffect(() => {
    if (!hayGarita) return;
    const supabase = crearClienteNavegador();
    supabase.rpc("vigilantes_de", { p_org: orgId }).then(({ data, error }) => {
      if (error) return fallo(error);
      setVigis(data ?? []);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [orgId, hayGarita]);

  async function cargarVigis() {
    const supabase = crearClienteNavegador();
    const { data, error } = await supabase.rpc("vigilantes_de", { p_org: orgId });
    if (error) return fallo(error);
    setVigis(data ?? []);
  }

  async function invitarVigilante() {
    const correo = (fv.correo || "").trim().toLowerCase();
    const ed = fv.edificio || edificioId;
    if (!ed) return notificar("Elija el edificio de la garita.", "error");
    if (!correoValido(correo)) return notificar("Ese correo no se entiende.", "error");
    setOcupado(true);
    const supabase = crearClienteNavegador();
    const { data, error } = await supabase.rpc("crear_invitacion", {
      p_org: orgId,
      p_correo: correo,
      p_rol: "vigilante",
      p_edificio: ed,
      p_unidad: undefined,
      p_relacion: undefined,
    });
    setOcupado(false);
    if (error) return fallo(error);
    setCodigoVig({ token: data, correo });
    setFv({ ...fv, correo: "" });
    cargarVigis();
  }

  async function fijarVigilante(id: string, activo: boolean) {
    const supabase = crearClienteNavegador();
    const { error } = await supabase.rpc("fijar_vigilante", { p_membresia: id, p_activo: activo });
    if (error) return fallo(error);
    notificar(activo ? "Vigilante reactivado." : "Ese vigilante ya no entra a la garita.");
    cargarVigis();
  }

  async function invitar() {
    if (!f.unidad) return notificar("Elija la unidad.", "error");
    if (!correoValido(f.correo)) return notificar("Ese correo no se entiende.", "error");
    setOcupado(true);
    const supabase = crearClienteNavegador();
    const { data, error } = await supabase.rpc("crear_invitacion", {
      p_org: orgId,
      p_correo: f.correo.trim().toLowerCase(),
      p_rol: "residente",
      p_edificio: undefined,
      p_unidad: f.unidad,
      p_relacion: f.relacion,
    });
    setOcupado(false);
    if (error) return fallo(error);
    setCodigo({ token: data, correo: f.correo.trim().toLowerCase() });
    setF({ ...f, correo: "" });
    cargar();
  }

  async function revocar(id: string) {
    const supabase = crearClienteNavegador();
    const { error } = await supabase.rpc("revocar_invitacion", { p_id: id });
    if (error) return fallo(error);
    notificar("Invitación revocada.");
    cargar();
  }

  async function cambiarNivel(unidadId: string, nivel: string) {
    const supabase = crearClienteNavegador();
    const { error } = await supabase.from("unidades").update({ inquilino_ve: nivel }).eq("id", unidadId);
    if (error) return fallo(error);
    notificar("Listo. El inquilino de esa unidad ve otra cosa desde ahora.");
    cargar();
  }

  async function darDeBaja(id: string) {
    const supabase = crearClienteNavegador();
    const { error } = await supabase.from("membresias").update({ activo: false }).eq("id", id);
    if (error) return fallo(error);
    notificar("Esa persona ya no entra a la unidad.");
    cargar();
  }

  async function copiar(t: string) {
    try {
      await navigator.clipboard.writeText(t);
      notificar("Copiado.");
    } catch {
      notificar("No se pudo copiar. Selecciónelo a mano.", "error");
    }
  }

  return (
    <div style={{ display: "grid", gap: 20 }}>
      {mensaje && (
        <Aviso tono={mensaje.tipo === "error" ? "rojo" : "verde"}>{mensaje.texto}</Aviso>
      )}

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
        {(
          [
            ["invitar", "Invitar"],
            ["pendientes", "Invitaciones"],
            ["gente", "Quién tiene acceso"],
            ...(hayGarita ? ([["vigilantes", "Vigilantes"]] as [Pestana, string][]) : []),
          ] as [Pestana, string][]
        ).map(([k, t]) => (
          <Button key={k} type="button" variante={pest === k ? "primario" : "secundario"} mini onClick={() => setPest(k)}>
            {t}
          </Button>
        ))}
      </div>

      {pest === "invitar" && (
        <>
          <div style={{ background: "var(--lienzo)", border: "1px solid var(--linea)", borderRadius: "var(--radio)", padding: 18 }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 16, fontFamily: "var(--font-titulos)" }}>Invitar a un residente</h2>
            <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--tenue)" }}>
              La invitación queda atada a ese correo y a esa unidad. No sirve para nadie más,
              aunque alguien consiga el código.
            </p>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(170px,1fr))" }}>
              <Campo etiqueta="Unidad">
                <Select value={f.unidad} onChange={(e) => setF({ ...f, unidad: e.target.value })}>
                  <option value="">Elija</option>
                  {unidades.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.codigo}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo etiqueta="Correo">
                <Input
                  value={f.correo}
                  placeholder="propietario@correo.com"
                  onChange={(e) => setF({ ...f, correo: e.target.value })}
                />
              </Campo>
              <Campo etiqueta="Es el..." ayuda="El inquilino puede ver menos que el propietario. Se configura por unidad.">
                <Select value={f.relacion} onChange={(e) => setF({ ...f, relacion: e.target.value })}>
                  <option value="propietario">Propietario</option>
                  <option value="inquilino">Inquilino</option>
                </Select>
              </Campo>
            </div>
            <div style={{ marginTop: 14 }}>
              <Button type="button" disabled={ocupado} onClick={invitar}>
                Generar la invitación
              </Button>
            </div>
          </div>

          {codigo && (
            <div style={{ background: "var(--lienzo)", border: "1px solid var(--linea)", borderRadius: "var(--radio)", padding: 18 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 16, fontFamily: "var(--font-titulos)" }}>
                Código para {codigo.correo}
              </h2>
              <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--tenue)" }}>
                Este código se muestra una sola vez. En la base solo queda su huella, así que ni
                usted lo puede volver a ver. Si se pierde, genere otro.
              </p>
              <div
                className="mono"
                style={{
                  padding: "14px 16px",
                  background: "var(--fondo)",
                  borderRadius: "var(--radio-chico)",
                  border: "1px solid var(--linea)",
                  wordBreak: "break-all",
                  fontSize: 14,
                }}
              >
                {codigo.token}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 12 }}>
                <Button type="button" mini onClick={() => copiar(codigo.token)}>
                  Copiar el código
                </Button>
                <Button
                  type="button"
                  variante="secundario"
                  mini
                  onClick={() =>
                    copiar(
                      `Hola. Para ver su recibo de condominio y reportar sus pagos, entre a ` +
                        // El original mandaba a la raíz del sitio, que en los
                        // HTML era index.html (el panel del residente). Acá la
                        // raíz es la página en construcción, así que el enlace
                        // apunta directo a /entrar con el destino puesto: el
                        // residente cae en /mi y, sin unidades todavía, en la
                        // pantalla de aceptar la invitación.
                        `${location.origin}/entrar?volver=/mi\n\n` +
                        `Cree su cuenta con el correo ${codigo.correo} y pegue este código:\n${codigo.token}`
                    )
                  }
                >
                  Copiar el mensaje completo
                </Button>
                <Button type="button" variante="secundario" mini onClick={() => setCodigo(null)}>
                  Ya lo envié
                </Button>
              </div>
              <p style={{ fontSize: 12.5, color: "var(--tenue)", marginBottom: 0, marginTop: 12 }}>
                Vence a los 7 días y se usa una sola vez.
              </p>
            </div>
          )}
        </>
      )}

      {pest === "pendientes" && (
        <div style={{ background: "var(--lienzo)", border: "1px solid var(--linea)", borderRadius: "var(--radio)" }}>
          <div style={{ padding: "18px 18px 0" }}>
            <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-titulos)" }}>Invitaciones</h2>
            <p style={{ margin: "3px 0 14px", fontSize: 12.5, color: "var(--tenue)" }}>
              El código no se guarda, solo su huella. Por eso aquí no se puede volver a leer.
            </p>
          </div>
          <div className="tabla-scroll">
            <table className="tabla">
              <thead>
                <tr>
                  <th>Correo</th>
                  <th>Unidad</th>
                  <th>Relación</th>
                  <th>Creada</th>
                  <th>Estado</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {invs.map((i) => (
                  <tr key={i.id}>
                    <td>{i.correo}</td>
                    <td className="mono">{i.unidad || "—"}</td>
                    <td>{i.relacion || "—"}</td>
                    <td className="mono" style={{ fontSize: 12 }}>
                      {String(i.creada_en).slice(0, 10)}
                    </td>
                    <td>
                      <Badge tono={TONO_ESTADO[i.estado] ?? "ambar"}>{i.estado}</Badge>
                    </td>
                    <td>
                      {i.estado === "pendiente" && (
                        <Button type="button" variante="secundario" mini onClick={() => revocar(i.id)}>
                          Revocar
                        </Button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {invs.length === 0 && (
            <div style={{ padding: 34, textAlign: "center", color: "var(--tenue)", fontSize: 14 }}>
              Todavía no ha invitado a nadie.
            </div>
          )}
        </div>
      )}

      {pest === "gente" && (
        <div style={{ background: "var(--lienzo)", border: "1px solid var(--linea)", borderRadius: "var(--radio)" }}>
          <div style={{ padding: "18px 18px 0" }}>
            <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-titulos)" }}>
              Quién tiene acceso · {nombreEdificio}
            </h2>
            <p style={{ margin: "3px 0 14px", fontSize: 12.5, color: "var(--tenue)" }}>
              Qué ve el inquilino se decide por unidad, no por persona. El propietario siempre ve
              todo.
            </p>
          </div>
          <div className="tabla-scroll">
            <table className="tabla apila">
              <thead>
                <tr>
                  <th>Unidad</th>
                  <th>Correo</th>
                  <th>Relación</th>
                  <th>Qué ve el inquilino</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {gente
                  .filter((g) => g.activo)
                  .map((g) => (
                    <tr key={g.membresia_id}>
                      <td className="mono">{g.unidad}</td>
                      <td style={{ fontSize: 13 }}>{g.correo}</td>
                      <td>{g.relacion}</td>
                      <td>
                        <Select
                          value={g.nivel}
                          style={{ fontSize: 13, padding: "7px 9px" }}
                          onChange={(e) => cambiarNivel(g.unidad_id, e.target.value)}
                        >
                          <option value="mes">Solo el recibo del mes</option>
                          <option value="saldo">El recibo y el saldo total</option>
                          <option value="todo">Todo, igual que el propietario</option>
                        </Select>
                      </td>
                      <td>
                        <Button type="button" variante="secundario" mini onClick={() => darDeBaja(g.membresia_id)}>
                          Dar de baja
                        </Button>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
          {gente.filter((g) => g.activo).length === 0 && (
            <div style={{ padding: 34, textAlign: "center", color: "var(--tenue)", fontSize: 14 }}>
              Nadie tiene acceso todavía en este edificio.
            </div>
          )}
        </div>
      )}

      {pest === "vigilantes" && hayGarita && (
        <>
          <div style={{ background: "var(--lienzo)", border: "1px solid var(--linea)", borderRadius: "var(--radio)", padding: 18 }}>
            <h2 style={{ margin: "0 0 4px", fontSize: 16, fontFamily: "var(--font-titulos)" }}>
              Invitar a un vigilante
            </h2>
            <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--tenue)" }}>
              Un correo por persona o por turno, nunca uno compartido: la bitácora guarda quién hizo
              cada cosa, y con una cuenta compartida esa firma no sirve de nada.
            </p>
            <div style={{ display: "grid", gap: 12, gridTemplateColumns: "repeat(auto-fit,minmax(200px,1fr))" }}>
              <Campo etiqueta="Edificio de la garita">
                <Select value={fv.edificio || edificioId} onChange={(e) => setFv({ ...fv, edificio: e.target.value })}>
                  {edificios.map((e2) => (
                    <option key={e2.id} value={e2.id}>
                      {e2.nombre}
                    </option>
                  ))}
                </Select>
              </Campo>
              <Campo etiqueta="Correo del vigilante">
                <Input
                  value={fv.correo}
                  placeholder="vigilante@correo.com"
                  onChange={(e) => setFv({ ...fv, correo: e.target.value })}
                />
              </Campo>
            </div>
            <div style={{ marginTop: 16, fontSize: 12.5, color: "var(--tinta-2)", lineHeight: 1.6 }}>
              El vigilante solo ve el edificio donde lo asigne, y dentro de él solo el código de cada
              unidad y el nombre de quien vive ahí. No ve saldos, ni recibos, ni pagos, ni teléfonos.
            </div>
            <div style={{ marginTop: 14 }}>
              <Button type="button" disabled={ocupado} onClick={invitarVigilante}>
                Generar la invitación
              </Button>
            </div>
          </div>

          {codigoVig && (
            <div style={{ background: "var(--lienzo)", border: "1px solid var(--linea)", borderRadius: "var(--radio)", padding: 18 }}>
              <h2 style={{ margin: "0 0 4px", fontSize: 16, fontFamily: "var(--font-titulos)" }}>
                Código para {codigoVig.correo}
              </h2>
              <p style={{ margin: "0 0 14px", fontSize: 12.5, color: "var(--tenue)" }}>
                Este código se muestra una sola vez. Pásaselo al vigilante junto con el enlace de la
                garita.
              </p>
              <div
                className="mono"
                style={{
                  padding: "14px 16px",
                  background: "var(--fondo)",
                  borderRadius: "var(--radio-chico)",
                  border: "1px solid var(--linea)",
                  wordBreak: "break-all",
                  fontSize: 13.5,
                }}
              >
                {codigoVig.token}
              </div>
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 16 }}>
                <Button type="button" variante="secundario" onClick={() => copiar(codigoVig.token)}>
                  Copiar el código
                </Button>
                <Button
                  type="button"
                  variante="secundario"
                  onClick={() =>
                    copiar(
                      `Hola. Para entrar al panel de seguridad de la garita, abra ` +
                        // El original manda a `garita.html`, que en main es un
                        // archivo suelto. Acá la garita es una ruta de la app.
                        `${location.origin}/garita\n\n` +
                        `Toque "Es mi primera vez", cree su clave con el correo ` +
                        `${codigoVig.correo} y pegue este código:\n${codigoVig.token}`
                    )
                  }
                >
                  Copiar el mensaje completo
                </Button>
                <Button type="button" variante="secundario" onClick={() => setCodigoVig(null)}>
                  Listo
                </Button>
              </div>
            </div>
          )}

          <div style={{ background: "var(--lienzo)", border: "1px solid var(--linea)", borderRadius: "var(--radio)" }}>
            <div style={{ padding: "18px 18px 0" }}>
              <h2 style={{ margin: 0, fontSize: 16, fontFamily: "var(--font-titulos)" }}>Vigilantes</h2>
              <p style={{ margin: "3px 0 14px", fontSize: 12.5, color: "var(--tenue)" }}>
                Al que deja el puesto se le da de baja, no se le borra: la bitácora que firmó tiene
                que seguir teniendo a quién apuntar.
              </p>
            </div>
            {vigis.length === 0 ? (
              <div style={{ padding: 34, textAlign: "center", color: "var(--tenue)", fontSize: 14 }}>
                Todavía no hay vigilantes dados de alta.
              </div>
            ) : (
              <div className="tabla-scroll">
                <table className="tabla apila">
                  <thead>
                    <tr>
                      <th>Correo</th>
                      <th>Edificio</th>
                      <th>Anotaciones</th>
                      <th>Última vez</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {vigis.map((v) => (
                      <tr key={v.membresia_id} style={{ opacity: v.activo ? 1 : 0.55 }}>
                        <td className="cabeza" data-t="Correo">
                          {v.correo}
                        </td>
                        <td data-t="Edificio">{v.edificio || "—"}</td>
                        <td data-t="Anotaciones" className="mono">
                          {v.anotaciones}
                        </td>
                        <td data-t="Última vez">
                          {v.ultima_anotacion ? (
                            fechaCorta(v.ultima_anotacion)
                          ) : (
                            <span style={{ color: "var(--tenue)" }}>nunca</span>
                          )}
                        </td>
                        <td className="acciones">
                          <Button
                            type="button"
                            variante="secundario"
                            mini
                            onClick={() => fijarVigilante(v.membresia_id, !v.activo)}
                          >
                            {v.activo ? "Dar de baja" : "Reactivar"}
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
