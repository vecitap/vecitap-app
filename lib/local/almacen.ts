import { deleteDB, openDB, type DBSchema, type IDBPDatabase } from "idb";
import type { FilasPropietarios } from "@/lib/admin/pantallas/propietarios";

/**
 * El único módulo que lee y escribe la copia local (cambio 3, 1.1 e).
 *
 * Una base de IndexedDB por usuario, `vecitap-<user_id>`. Sin cifrar
 * (decidido el 17-nov: riesgo asumido por la empresa); si algún día cambia,
 * se cambia acá y en ningún otro lado.
 *
 * Prueba de concepto: solo guarda lo que necesita Propietarios. La parte A
 * completa suma el resto de las pantallas y los almacenes `bandeja` y
 * `borradores`.
 */

export type CopiaEdificio = {
  edificioId: string;
  orgId: string;
  edificioNombre: string;
  version: number;
  sincronizadoEn: string; // ISO
  propietarios: FilasPropietarios;
};

interface EsquemaLocal extends DBSchema {
  copias: { key: string; value: CopiaEdificio };
}

const PREFIJO = "vecitap-";
const nombreBase = (usuarioId: string) => `${PREFIJO}${usuarioId}`;

function abrir(usuarioId: string): Promise<IDBPDatabase<EsquemaLocal>> {
  return openDB<EsquemaLocal>(nombreBase(usuarioId), 1, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("copias")) db.createObjectStore("copias", { keyPath: "edificioId" });
    },
  });
}

export async function leerCopia(usuarioId: string, edificioId: string): Promise<CopiaEdificio | null> {
  const db = await abrir(usuarioId);
  try {
    return (await db.get("copias", edificioId)) ?? null;
  } finally {
    db.close();
  }
}

export async function guardarCopia(usuarioId: string, copia: CopiaEdificio): Promise<void> {
  const db = await abrir(usuarioId);
  try {
    // Una sola escritura: la copia nueva reemplaza a la vieja de una vez,
    // nunca queda a medias.
    await db.put("copias", copia);
  } finally {
    db.close();
  }
}

export async function listarCopias(usuarioId: string): Promise<CopiaEdificio[]> {
  const db = await abrir(usuarioId);
  try {
    return await db.getAll("copias");
  } finally {
    db.close();
  }
}

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
