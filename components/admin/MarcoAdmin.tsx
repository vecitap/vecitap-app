"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Building2,
  ChartColumn,
  KeyRound,
  ListChecks,
  LogOut,
  House,
  Moon,
  ReceiptText,
  RefreshCw,
  Send,
  Settings2,
  Sun,
  Users,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import { Logo, Select } from "@/components/ui";
import { nf } from "@/lib/formato";
import { crearClienteNavegador } from "@/lib/supabase/client";
import { useTema } from "@/lib/theme/ThemeProvider";
import { tasaDeReferencia, type TasaViva } from "@/lib/tasa";
import type { OrganizacionAdmin } from "@/lib/admin/tipos";
import { mensajeDeError } from "@/lib/errores";

/**
 * El armazón de Admin: columna lateral oscura + encabezado con la tasa del
 * BCV. Portado de App() en admin.html:1310-1470.
 *
 * El lateral es **oscuro en los dos temas** a propósito (decisión del
 * socio, tokens `--lat-*` en app/globals.css): separa "dónde estoy" (la
 * columna) de "qué estoy haciendo" (el contenido) con un cambio de
 * superficie en vez de una línea. Por eso el logotipo de Vecitap va
 * siempre en su versión crema y el selector de edificio lleva sus propios
 * colores: con los del tema claro quedaría invisible ahí.
 *
 * Es un Client Component porque necesita saber en qué edificio y en qué
 * sección está (`usePathname`), algo que un layout de servidor no puede
 * leer. Los datos (organización, edificios, tasa inicial) llegan como
 * props desde el layout, que sí es servidor.
 */

// Mismos íconos que el menú de admin.html:1189-1199 (caso 13).
const SECCIONES: { seg: string; etiqueta: string; icono: LucideIcon; modulo?: string }[] = [
  { seg: "inicio", etiqueta: "Inicio", icono: House },
  { seg: "propietarios", etiqueta: "Propietarios", icono: Users },
  { seg: "cobros", etiqueta: "Cobros", icono: ListChecks },
  { seg: "mes", etiqueta: "Cierre del mes", icono: ReceiptText },
  { seg: "pagos", etiqueta: "Pagos", icono: Wallet },
  { seg: "cortes", etiqueta: "Cortes de cuenta", icono: Send, modulo: "cortes" },
  { seg: "estadisticas", etiqueta: "Estadísticas", icono: ChartColumn, modulo: "estadisticas" },
  { seg: "accesos", etiqueta: "Accesos", icono: KeyRound },
];

export function MarcoAdmin({
  organizacion,
  edificios,
  tasaInicial,
  children,
}: {
  organizacion: Pick<OrganizacionAdmin, "id" | "nombre" | "logo_url">;
  edificios: { id: string; nombre: string; direccion: string | null }[];
  tasaInicial: TasaViva | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { tema, ponerTema } = useTema();
  const [menuAbierto, setMenuAbierto] = useState(false);

  const segmentos = pathname.split("/").filter(Boolean); // admin / orgId / edificioId / seccion
  const edificioId = segmentos[2] ?? "";
  const seccion = segmentos[3] ?? "inicio";
  const edificio = edificios.find((e) => e.id === edificioId) ?? null;

  /* Qué módulos tiene contratado esta administradora. Lo decide Vecitap
     desde su panel y lo responde la base; acá solo se esconde lo que ya
     está apagado del otro lado. Si la consulta falla no se esconde nada:
     es preferible un botón de más que una pantalla mutilada sin causa
     visible, y de todos modos la base rechaza lo que no corresponde. */
  const [modulos, setModulos] = useState<Record<string, boolean> | null>(null);
  useEffect(() => {
    if (!edificioId) return;
    let vivo = true;
    const supabase = crearClienteNavegador();
    supabase.rpc("mis_modulos", { p_edificio: edificioId }).then(({ data, error }) => {
      if (!vivo) return;
      if (error) return setModulos(null);
      const m: Record<string, boolean> = {};
      (data ?? []).forEach((x) => {
        m[x.clave] = x.activo;
      });
      setModulos(m);
    });
    return () => {
      vivo = false;
    };
  }, [edificioId]);

  const hayModulo = (clave: string) => !modulos || modulos[clave] !== false;

  /* Si estaba parado en una pantalla que acaban de apagar, se devuelve a
     Inicio. Sin esto queda un área de contenido en blanco. */
  useEffect(() => {
    if (!edificioId || !modulos) return;
    if ((seccion === "cortes" || seccion === "estadisticas") && modulos[seccion] === false) {
      router.replace(`/admin/${organizacion.id}/${edificioId}/inicio`);
    }
  }, [modulos, seccion, edificioId, organizacion.id, router]);

  const menu = SECCIONES.filter((m) => m.modulo === undefined || hayModulo(m.modulo));

  return (
    <div className="admin-marco">
      <aside className={`admin-lateral ${menuAbierto ? "abierto" : ""}`}>
        <div className="admin-lateral-cab">
          <button
            type="button"
            className="admin-cerrar-menu"
            onClick={() => setMenuAbierto(false)}
            aria-label="Cerrar el menú"
          >
            <X size={20} />
          </button>
          {organizacion.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={organizacion.logo_url} alt="" style={{ maxHeight: 34, maxWidth: 130 }} />
          ) : (
            <>
              <div className="admin-iso" aria-hidden="true" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Building2 size={17} style={{ color: "var(--acento-sobre)" }} />
              </div>
              {/* Sin `slice`: cortar a mano deja "Administradora U" sin
                  avisar. Con puntos suspensivos se lee como un nombre
                  largo, que es lo que es. */}
              <span className="admin-org" title={organizacion.nombre}>
                {organizacion.nombre}
              </span>
            </>
          )}
        </div>

        <div style={{ padding: "0 6px 14px" }}>
          <Select
            className="admin-sel-edificio"
            value={edificioId}
            onChange={(e) => router.push(`/admin/${organizacion.id}/${e.target.value}/${seccion}`)}
            aria-label="Edificio"
          >
            {edificios.length === 0 && <option value="">Sin edificios</option>}
            {edificios.map((e) => (
              <option key={e.id} value={e.id}>
                {e.nombre}
              </option>
            ))}
          </Select>
        </div>

        {edificioId &&
          menu.map((m) => (
            <Link
              key={m.seg}
              href={`/admin/${organizacion.id}/${edificioId}/${m.seg}`}
              className={`admin-nav ${seccion === m.seg ? "activa" : ""}`}
              onClick={() => setMenuAbierto(false)}
            >
              <m.icono size={17} /> {m.etiqueta}
            </Link>
          ))}

        <div className="admin-lateral-pie">
          {edificioId && (
            <Link
              href={`/admin/${organizacion.id}/${edificioId}/ajustes`}
              className={`admin-nav ${seccion === "ajustes" ? "activa" : ""}`}
              onClick={() => setMenuAbierto(false)}
            >
              <Settings2 size={17} /> Ajustes
            </Link>
          )}
          <button
            type="button"
            className="admin-nav"
            title="Cambiar entre claro y oscuro"
            onClick={() => ponerTema(tema === "oscuro" ? "claro" : "oscuro")}
          >
            {tema === "oscuro" ? <Sun size={17} /> : <Moon size={17} />}
            {tema === "oscuro" ? "Tema claro" : "Tema oscuro"}
          </button>
          <form action="/api/auth/salir" method="post">
            <button type="submit" className="admin-nav">
              <LogOut size={17} /> Salir
            </button>
          </form>
          <div style={{ padding: "16px 12px 4px", opacity: 0.75 }}>
            {/* El lateral es oscuro en los dos temas, así que acá va
                siempre el logotipo en crema, no el de fondo claro. */}
            <Logo alto={18} forzarTema="oscuro" />
          </div>
        </div>
      </aside>

      {menuAbierto && <div className="admin-velo" onClick={() => setMenuAbierto(false)} />}

      <main className="admin-principal">
        <header className="admin-cabecera">
          <button
            type="button"
            className="admin-hamburguesa"
            onClick={() => setMenuAbierto(true)}
            aria-label="Abrir el menú"
          >
            ☰
          </button>
          <div style={{ minWidth: 0 }}>
            <h1 className="admin-titulo">{edificio?.nombre ?? "Sin edificios todavía"}</h1>
            <p className="admin-subtitulo">{edificio?.direccion || organizacion.nombre}</p>
          </div>
          <TasaCabecera inicial={tasaInicial} />
        </header>

        <div className="admin-relleno">{children}</div>
      </main>
    </div>
  );
}

/**
 * La tasa del BCV de hoy, en el encabezado. admin.html:1148-1216 +
 * 1442-1470: la fuente es la base (`tasa_atrasada`, que es la misma tasa
 * con la que se convierten los pagos — la pantalla no puede mostrar una y
 * el cálculo usar otra). Solo si la base no tiene ninguna se consulta
 * DolarAPI, y entonces se dice "referencia": ese número no convierte nada.
 */
function TasaCabecera({ inicial }: { inicial: TasaViva | null }) {
  const [tasa, setTasa] = useState<TasaViva | null>(inicial);
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function actualizar() {
    setCargando(true);
    setError(null);
    const supabase = crearClienteNavegador();
    const { data, error: e } = await supabase.rpc("tasa_atrasada");
    const fila = Array.isArray(data) ? data[0] : data;
    if (!e && fila && Number(fila.tasa) > 0) {
      setTasa({ valor: Number(fila.tasa), fuente: "BCV", actualizada: fila.fecha ?? null, dias: fila.dias ?? null });
      setCargando(false);
      return;
    }
    try {
      setTasa(await tasaDeReferencia());
    } catch (err) {
      setError(mensajeDeError(err));
    }
    setCargando(false);
  }

  const atrasada = (tasa?.dias ?? 0) > 2;

  return (
    <div className="admin-tasa">
      <div>
        <div className="admin-tasa-rotulo">
          Tasa BCV de hoy
          <button type="button" onClick={actualizar} disabled={cargando} aria-busy={cargando || undefined} title="Actualizar" aria-label="Actualizar la tasa">
            <RefreshCw size={12} />
          </button>
        </div>
        <div className="mono admin-tasa-valor">{tasa?.valor ? nf(2).format(tasa.valor) : "—"}</div>
        <div className="admin-tasa-pie" style={{ color: error || atrasada ? "var(--rojo)" : "var(--tenue)" }}>
          {cargando
            ? "consultando…"
            : error
              ? error
              : atrasada
                ? `atrasada ${tasa?.dias} días`
                : tasa?.actualizada
                  ? `${tasa.fuente} · ${String(tasa.actualizada).slice(0, 10).split("-").reverse().join("/")}`
                  : "referencia"}
        </div>
      </div>
    </div>
  );
}
