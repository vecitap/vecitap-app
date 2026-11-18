import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { FilasPropietarios } from "@/lib/admin/pantallas/propietarios";
import type { FilasInicio } from "@/lib/admin/pantallas/inicio";
import type { FichasEdificio } from "@/lib/admin/pantallas/ficha";
import type { FilasPagos } from "@/lib/admin/pantallas/pagos";
import type { FilasMes } from "@/lib/admin/pantallas/mes";
import type { FilasCortes } from "@/lib/admin/pantallas/cortes";
import type { GastoAdmin, OrganizacionAdmin, ReciboAdmin, TasaViva } from "@/lib/admin/tipos";
import type { Cosa } from "./bandeja-tipos";

/**
 * El único módulo que lee y escribe la copia local (cambio 3, 1.1 e).
 *
 * Una base de IndexedDB por usuario, `vecitap-<user_id>`. Sin cifrar
 * (decidido el 17-nov: riesgo asumido por la empresa); si algún día cambia,
 * se cambia acá y en ningún otro lado.
 *
 * Almacenes: `copias` (una por edificio), `borradores` (formularios a medio
 * llenar, plan sección 3), `bandeja` (cosas hechas en este equipo que
 * todavía no llegaron a la base, parte B) y `meta` (el identificador de este
 * equipo).
 */

/** Lo que necesita el lateral (MarcoAdmin) para dibujarse sin el servidor. */
export type MarcoCopia = {
  organizacion: Pick<OrganizacionAdmin, "id" | "nombre" | "logo_url">;
  edificios: { id: string; nombre: string; direccion: string | null; tolerancia_alicuota: number | null }[];
  tasa: TasaViva | null;
};

export type CopiaEdificio = {
  edificioId: string;
  orgId: string;
  edificioNombre: string;
  version: number;
  sincronizadoEn: string; // ISO
  /** Para saber si algo cambió sin bajar todo de nuevo (lib/local/copia.ts). */
  huella: string;
  marco: MarcoCopia;
  inicio: FilasInicio;
  propietarios: FilasPropietarios;
  fichas: FichasEdificio;
  pagos: FilasPagos;
  mes: FilasMes;
  /** Lo que CierreMes pide en línea al abrir: los gastos del mes abierto. */
  gastosAbierto: GastoAdmin[];
  cortes: FilasCortes & { soloUsd: boolean };
  /** Lo que Cortes pide en línea al abrir: los recibos del último mes cerrado. */
  recibosUltimoMes: { periodoId: string; filas: ReciboAdmin[] } | null;
};

export type Borrador = {
  clave: string; // formulario · edificio
  valor: unknown;
  guardadoEn: string; // ISO
};

interface EsquemaLocal extends DBSchema {
  copias: { key: string; value: CopiaEdificio };
  borradores: { key: string; value: Borrador };
  bandeja: { key: string; value: Cosa; indexes: { edificio: string } };
  meta: { key: string; value: { clave: string; valor: string } };
}

const PREFIJO = "vecitap-";
const nombreBase = (usuarioId: string) => `${PREFIJO}${usuarioId}`;

function abrir(usuarioId: string): Promise<IDBPDatabase<EsquemaLocal>> {
  return openDB<EsquemaLocal>(nombreBase(usuarioId), 3, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("copias")) db.createObjectStore("copias", { keyPath: "edificioId" });
      if (!db.objectStoreNames.contains("borradores")) db.createObjectStore("borradores", { keyPath: "clave" });
      if (!db.objectStoreNames.contains("bandeja")) db.createObjectStore("bandeja", { keyPath: "id" }).createIndex("edificio", "edificioId");
      if (!db.objectStoreNames.contains("meta")) db.createObjectStore("meta", { keyPath: "clave" });
    },
  });
}

async function conBase<T>(usuarioId: string, f: (db: IDBPDatabase<EsquemaLocal>) => Promise<T>): Promise<T> {
  const db = await abrir(usuarioId);
  try {
    return await f(db);
  } finally {
    db.close();
  }
}

export const leerCopia = (usuarioId: string, edificioId: string) =>
  conBase(usuarioId, async (db) => (await db.get("copias", edificioId)) ?? null);

// Una sola escritura: la copia nueva reemplaza a la vieja de una vez, nunca
// queda a medias.
export const guardarCopia = (usuarioId: string, copia: CopiaEdificio) => conBase(usuarioId, (db) => db.put("copias", copia).then(() => undefined));

export const borrarCopia = (usuarioId: string, edificioId: string) => conBase(usuarioId, (db) => db.delete("copias", edificioId));

/** Las copias de este usuario, sin los datos: para el selector de edificios. */
export const listarCopias = (usuarioId: string) =>
  conBase(usuarioId, async (db) =>
    (await db.getAll("copias")).map((c) => ({ edificioId: c.edificioId, orgId: c.orgId, edificioNombre: c.edificioNombre, sincronizadoEn: c.sincronizadoEn, version: c.version }))
  );

export const leerBorrador = (usuarioId: string, clave: string) =>
  conBase(usuarioId, async (db) => (await db.get("borradores", clave)) ?? null);

export const guardarBorrador = (usuarioId: string, borrador: Borrador) => conBase(usuarioId, (db) => db.put("borradores", borrador).then(() => undefined));

export const borrarBorrador = (usuarioId: string, clave: string) => conBase(usuarioId, (db) => db.delete("borradores", clave));

/* ── Bandeja (parte B) ── */

/** Las cosas por enviar de este usuario (de un edificio, o todas), en el orden en que se hicieron. */
export const listarBandeja = (usuarioId: string, edificioId?: string) =>
  conBase(usuarioId, async (db) => {
    const todas = edificioId ? await db.getAllFromIndex("bandeja", "edificio", edificioId) : await db.getAll("bandeja");
    return todas.sort((a, b) => a.hechoEn.localeCompare(b.hechoEn));
  });

export const leerCosa = (usuarioId: string, id: string) => conBase(usuarioId, async (db) => (await db.get("bandeja", id)) ?? null);

export const guardarCosa = (usuarioId: string, cosa: Cosa) => conBase(usuarioId, (db) => db.put("bandeja", cosa).then(() => undefined));

export const borrarCosa = (usuarioId: string, id: string) => conBase(usuarioId, (db) => db.delete("bandeja", id));

/**
 * El identificador de este equipo (plan 2.7): se crea una vez y queda en la
 * base local del usuario. Con él la base sabe qué equipos pueden tener cosas
 * por enviar.
 */
export const equipoId = (usuarioId: string) =>
  conBase(usuarioId, async (db) => {
    const hay = await db.get("meta", "equipo");
    if (hay) return hay.valor;
    const nuevo = crypto.randomUUID();
    await db.put("meta", { clave: "equipo", valor: nuevo });
    return nuevo;
  });

/**
 * Al salir: borra la base del usuario que sale (plan 1.1 j). Las de otros
 * usuarios de este navegador se conservan (decidido el 17-nov: si dejaron
 * cosas por enviar, esperan a que vuelvan).
 */
export async function borrarBaseDelUsuario(usuarioId: string): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  await deleteDB(nombreBase(usuarioId));
}

/** Para pruebas y para el «sw.js de emergencia»: borra todas las bases `vecitap-*`. */
export async function borrarTodasLasBases(): Promise<void> {
  if (typeof indexedDB === "undefined") return;
  // indexedDB.databases() existe en Chrome, Edge, Firefox y Safari actuales.
  const bases = typeof indexedDB.databases === "function" ? await indexedDB.databases() : [];
  await Promise.all(
    bases
      .map((b) => b.name)
      .filter((n): n is string => !!n && n.startsWith(PREFIJO))
      .map((n) => deleteDB(n))
  );
}

/** Pide al navegador que no borre la copia por falta de espacio. */
export async function pedirAlmacenPersistente(): Promise<void> {
  try {
    if (navigator.storage?.persisted && !(await navigator.storage.persisted())) {
      await navigator.storage.persist?.();
    }
  } catch {
    // Si el navegador no lo permite, la copia igual funciona.
  }
}
