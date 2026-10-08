"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button, Campo, CampoClave, Card, Input } from "@/components/ui";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { rutaInterna, urlDelSitio } from "@/lib/url-sitio";

type Modo = "entrar" | "crear" | "olvide" | "clave-nueva";

/**
 * Entrar · crear cuenta · recuperar la clave · poner una clave nueva.
 * Portado de Entrar()/ClaveNueva() en admin.html:793-927, con los mismos
 * textos y reglas que index.html, operador.html y garita.html (los cuatro
 * HTML de `main` comparten este flujo).
 *
 * Reglas de `main` que importan:
 * · La clave necesita **8** caracteres (main las subió de 6 a 8).
 * · Al volver del correo de recuperación, Supabase abre una sesión
 *   especial y avisa con `PASSWORD_RECOVERY`. También se mira el `#` de la
 *   dirección, porque ese aviso puede llegar antes de que el componente se
 *   suscriba si la página estaba recién cargada.
 * · Mientras esa sesión está viva **hay que** cambiar la clave: si la
 *   persona se va sin hacerlo, queda dentro sin saberlo. Por eso esa
 *   pantalla no tiene más salida que poner la clave o cerrar sesión.
 *
 * El modo "crear" (signUp) existe en las tres pantallas de Entrar de
 * `main`, sin distinción por rol, así que acá va compartido entre los tres
 * (ver docs/casos-de-uso-mejorados.md, caso 6). El rate limiting propio
 * sigue pendiente de Fase 5 — Supabase Auth ya limita intentos por su
 * cuenta, pero no hay nada adicional de este lado.
 *
 * **Los dos enlaces por correo salen por `/auth/confirmar`** (ver esa ruta):
 * el de confirmar la cuenta (`emailRedirectTo`) y el de recuperar la clave
 * (`redirectTo`). La URL absoluta la arma `urlDelSitio()`, que acierta sola
 * en local, en cada Preview y en https://vecitap.com — no hay ningún dominio
 * escrito acá. El canje del `?code=` pasó a hacerse del lado del servidor, y
 * esta pantalla se entera por la URL: `?clave=nueva` abre el formulario de
 * clave nueva, `?error=enlace` avisa que el enlace ya no sirve.
 */
export function FormularioEntrar() {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Sin `volver`, /destino resuelve el rol del lado del servidor. Antes
  // caía en `/` (la página en construcción), que no lleva a ningún lado
  // para ninguno de los tres roles.
  //
  // 08-oct (prueba 7 del tramo 1): pasa por rutaInterna(), el mismo saneado
  // que usa page.tsx del lado del servidor. Antes se usaba crudo: un
  // `?volver=/` (o una URL ajena) llevaba ahí después de entrar.
  const volver = rutaInterna(searchParams.get("volver"));
  // Puestos por /auth/confirmar después de canjear el enlace del correo.
  const vieneDeRecuperacion = searchParams.get("clave") === "nueva";
  const enlaceRoto = searchParams.get("error") === "enlace";
  // Para qué era el enlace que falló: cambia solo el consejo del mensaje.
  const enlaceEraDe = searchParams.get("de");

  const [modo, setModo] = useState<Modo>(vieneDeRecuperacion ? "clave-nueva" : "entrar");
  const [correo, setCorreo] = useState("");
  const [clave, setClave] = useState("");
  const [otra, setOtra] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [correoSesion, setCorreoSesion] = useState("");

  /* Volvió del correo de recuperación.
     · El camino normal hoy es `?clave=nueva`, que pone /auth/confirmar después
       de canjear el `?code=` del lado del servidor. Ahí la sesión ya está en
       las cookies y solo falta traer el correo para mostrarlo.
     · El `#type=recovery` y el evento `PASSWORD_RECOVERY` se conservan como
       red de seguridad para un enlace del flujo viejo (implícito) que siga
       vivo en la bandeja de alguien. */
  useEffect(() => {
    const supabase = crearClienteNavegador();
    let vivo = true;

    const esRecuperacion =
      vieneDeRecuperacion || /type=recovery/.test(window.location.hash || "");
    if (esRecuperacion) {
      supabase.auth.getUser().then(({ data }) => {
        if (!vivo) return;
        setCorreoSesion(data.user?.email ?? "");
        setModo("clave-nueva");
      });
    }

    const { data: sub } = supabase.auth.onAuthStateChange((evento, sesion) => {
      if (evento !== "PASSWORD_RECOVERY") return;
      setCorreoSesion(sesion?.user?.email ?? "");
      setModo("clave-nueva");
    });
    return () => {
      vivo = false;
      sub?.subscription?.unsubscribe();
    };
  }, [vieneDeRecuperacion]);

  function cambiarModo(siguiente: Modo) {
    setError(null);
    setAviso(null);
    setModo(siguiente);
  }

  /**
   * Después de entrar (o de poner la clave nueva), una navegación completa
   * y no `router.push()` + `router.refresh()` (08-oct, prueba 7). Esas dos
   * corrían en paralelo: el push iba a `volver` y el refresh volvía a pedir
   * /entrar, que con la sesión ya abierta redirige por su cuenta. En los
   * logs de pruebas del 07-oct, después de un ingreso de la cuenta Admin de
   * Gustavo (10:14) no se pidió /destino ni ninguna página de la app durante
   * 22 segundos — lo que encaja con haber quedado en la portada de venta. La
   * causa exacta no se pudo confirmar (no hay logs de Vercel de ese día).
   * Con una sola navegación del navegador, el servidor recibe las cookies
   * recién escritas y resuelve el destino una vez.
   */
  function irA(destino: string) {
    window.location.assign(destino);
  }

  async function enviar(evento: FormEvent) {
    evento.preventDefault();
    setError(null);
    setAviso(null);
    setEnviando(true);
    const supabase = crearClienteNavegador();

    if (modo === "olvide") {
      /* El enlace vuelve a ESTA página, no a otra: si la persona terminara
         en otro panel con una sesión a medio hacer, no entendería nada. Pasa
         primero por /auth/confirmar, que canjea el código y la deja acá con
         la sesión ya abierta y el formulario en "clave nueva". */
      const { error: e } = await supabase.auth.resetPasswordForEmail(correo.trim().toLowerCase(), {
        redirectTo: urlDelSitio(
          `/auth/confirmar?de=clave&siguiente=${encodeURIComponent("/entrar?clave=nueva")}`
        ),
      });
      setEnviando(false);
      if (e) return setError(e.message);
      setModo("entrar");
      setAviso(`Le mandamos un enlace a ${correo.trim()}. Revise también la carpeta de spam.`);
      return;
    }

    if (modo === "clave-nueva") {
      if (clave.length < 8) {
        setEnviando(false);
        return setError("La clave necesita al menos 8 caracteres.");
      }
      if (clave !== otra) {
        setEnviando(false);
        return setError("Las dos claves no son iguales.");
      }
      const { error: e } = await supabase.auth.updateUser({ password: clave });
      setEnviando(false);
      if (e) return setError(e.message);
      try {
        history.replaceState(null, "", location.pathname);
      } catch {
        /* sin historial disponible */
      }
      irA(volver);
      return;
    }

    const credenciales = { email: correo.trim().toLowerCase(), password: clave };
    const { data, error: e } =
      modo === "entrar"
        ? await supabase.auth.signInWithPassword(credenciales)
        : await supabase.auth.signUp({
            ...credenciales,
            options: {
              /* Con "Confirm email" encendido (producción) el enlace del
                 correo tiene que traer a la persona de vuelta a ESTE sitio y
                 dejarla adentro. Pasa por /auth/confirmar, que canjea el
                 código y la manda a donde iba (`volver`); esa ruta sanea el
                 valor, así que un `volver` armado a mano no puede convertir
                 el enlace en un redirector a otro dominio. */
              emailRedirectTo: urlDelSitio(
                `/auth/confirmar?de=registro&siguiente=${encodeURIComponent(volver)}`
              ),
            },
          });

    setEnviando(false);
    if (e) {
      setError(modo === "entrar" ? "Correo o contraseña incorrectos." : e.message);
      return;
    }

    // Con "Confirm email" apagado, signUp ya devuelve sesión abierta: hay
    // que seguir de largo igual que al entrar, o la persona se queda
    // mirando esta pantalla con la sesión hecha y sin botón que la lleve a
    // ningún lado. Con la confirmación encendida no hay sesión todavía, y
    // ahí sí corresponde el aviso de "revise su bandeja".
    if (modo === "crear" && !data.session) {
      setAviso("Cuenta creada. Confirme su correo y vuelva a entrar.");
      return;
    }

    irA(volver);
  }

  const titulo =
    modo === "clave-nueva"
      ? "Poner una clave nueva"
      : modo === "olvide"
        ? "Recuperar mi clave"
        : modo === "crear"
          ? "Crear mi cuenta"
          : "Entrar";

  async function salirDeLaRecuperacion() {
    const supabase = crearClienteNavegador();
    await supabase.auth.signOut();
    try {
      history.replaceState(null, "", location.pathname);
    } catch {
      /* sin historial disponible */
    }
    cambiarModo("entrar");
    router.refresh();
  }

  return (
    <Card>
      <h1 style={{ marginTop: 0, fontFamily: "var(--font-titulos)" }}>{titulo}</h1>

      {modo === "clave-nueva" && (
        <p style={{ fontSize: 13.5, color: "var(--tinta-2)", lineHeight: 1.6, marginTop: 0 }}>
          Para <b>{correoSesion}</b>. El enlace que usó no sirve otra vez.
        </p>
      )}
      {modo === "olvide" && (
        <p style={{ fontSize: 13.5, color: "var(--tinta-2)", lineHeight: 1.6, margin: "0 0 14px" }}>
          Le mandamos un enlace para poner una clave nueva. Va al correo con el que entra, y solo
          sirve una vez.
        </p>
      )}

      {enlaceRoto && modo !== "clave-nueva" && (
        <p style={{ color: "var(--rojo)", fontSize: 13.5, lineHeight: 1.6, margin: "0 0 14px" }}>
          Ese enlace ya no sirve: vence y se usa una sola vez.{" "}
          {enlaceEraDe === "registro"
            ? "Entre con su correo y su clave; si le dice que falta confirmar la cuenta, cree la cuenta otra vez con el mismo correo y le llega un enlace nuevo."
            : enlaceEraDe === "correo"
              ? "Su correo sigue siendo el de antes. Entre con él y vuelva a pedir el cambio desde su perfil."
              : "Pida uno nuevo con “Olvidé mi contraseña”."}
        </p>
      )}

      <form onSubmit={enviar}>
        {aviso && (
          <p style={{ color: "var(--verde)", fontSize: 13.5, lineHeight: 1.5, marginTop: 0 }}>{aviso}</p>
        )}

        {modo === "clave-nueva" ? (
          <>
            <Campo etiqueta="Clave nueva" obligatorio ayuda="Mínimo 8 caracteres." error={error ?? undefined}>
              <CampoClave
                autoComplete="new-password"
                autoFocus
                value={clave}
                onChange={(e) => setClave(e.target.value)}
                required
              />
            </Campo>
            <Campo etiqueta="Repítala" obligatorio>
              <CampoClave
                autoComplete="new-password"
                value={otra}
                onChange={(e) => setOtra(e.target.value)}
                required
              />
            </Campo>
          </>
        ) : (
          <>
            <Campo etiqueta="Correo" obligatorio error={modo === "olvide" ? (error ?? undefined) : undefined}>
              <Input
                type="email"
                autoComplete="username"
                value={correo}
                onChange={(e) => setCorreo(e.target.value)}
                required
              />
            </Campo>
            {modo !== "olvide" && (
              <Campo etiqueta="Contraseña" obligatorio error={error ?? undefined}>
                <CampoClave
                  autoComplete={modo === "entrar" ? "current-password" : "new-password"}
                  value={clave}
                  onChange={(e) => setClave(e.target.value)}
                  minLength={modo === "crear" ? 8 : undefined}
                  required
                />
              </Campo>
            )}
          </>
        )}

        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
          <Button type="submit" disabled={enviando}>
            {enviando
              ? "Un momento…"
              : modo === "clave-nueva"
                ? "Guardar la clave"
                : modo === "olvide"
                  ? "Mandarme el enlace"
                  : modo === "crear"
                    ? "Crear la cuenta"
                    : "Entrar"}
          </Button>
          {modo === "olvide" && (
            <Button type="button" variante="secundario" disabled={enviando} onClick={() => cambiarModo("entrar")}>
              Volver
            </Button>
          )}
          {modo === "clave-nueva" && (
            <Button type="button" variante="secundario" onClick={salirDeLaRecuperacion}>
              Cancelar y salir
            </Button>
          )}
        </div>
      </form>

      {modo !== "clave-nueva" && modo !== "olvide" && (
        <div style={{ textAlign: "center", marginTop: 14, display: "grid", gap: 2 }}>
          <button type="button" onClick={() => cambiarModo(modo === "entrar" ? "crear" : "entrar")} style={ENLACE}>
            {modo === "entrar" ? "No tengo cuenta todavía" : "Ya tengo cuenta"}
          </button>
          <button type="button" onClick={() => cambiarModo("olvide")} style={ENLACE}>
            Olvidé mi contraseña
          </button>
        </div>
      )}
    </Card>
  );
}

const ENLACE = {
  border: "none",
  background: "transparent",
  cursor: "pointer",
  color: "var(--tenue)",
  fontSize: 13.5,
  padding: "6px 8px",
  fontFamily: "inherit",
} as const;
