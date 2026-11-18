/**
 * Una «cosa por enviar» (cambio 3, parte B, plan 2.2): algo que el
 * administrador hizo en este equipo y que todavía no llegó a la base.
 *
 * Tipos solo (sin código) para que el almacén y la bandeja los compartan
 * sin importarse uno al otro.
 */

export type TipoCosa =
  /** Un pago de una unidad, o una transferencia repartida a mano (varias filas, mismo grupo). */
  | "pago.registrar"
  /** «Repartir al volver»: el reparto lo pide a la base el envío, con la deuda de ese momento. */
  | "pago.repartir"
  /** Confirmar (conciliar) o anular un pago reportado, o todo su grupo. */
  | "pago.estado"
  /** Exoneración o ajuste a una unidad. */
  | "ajuste.registrar"
  /** Gasto del mes o cargo a una unidad: crear, editar o borrar una fila. */
  | "fila.crear"
  | "fila.editar"
  | "fila.borrar"
  /** El orden de los gastos: la posición final de cada uno (se puede repetir sin cambiar el resultado). */
  | "gasto.orden"
  /** La nota de la ficha de una unidad. */
  | "nota.guardar"
  /** Los datos de contacto de una persona ya vinculada a una unidad. */
  | "persona.editar";

/** Las tablas en que «fila.*» puede escribir. */
export type TablaFila = "gastos" | "cargos_unidad";

export type CandidatoDuplicado = {
  id: string;
  unidad_id: string;
  fecha: string;
  monto: number;
  moneda: string;
  referencia: string | null;
  estado: string;
  metodo: string | null;
  reportado_por: string | null;
};

/** Por qué una cosa quedó en «Revisar», y qué se puede hacer con ella. */
export type Revisar =
  /** La base la rechazó (RLS, una regla, un dato). Corregir y reenviar, o descartar. */
  | { clase: "rechazo"; mensaje: string }
  /** pago_no_repetido: misma referencia, día y monto que otro pago. «Es el mismo». */
  | { clase: "repetido"; mensaje: string }
  /** Hay un pago de la misma unidad, mismo monto, fecha a ±3 días (2.4). */
  | { clase: "duplicado"; mensaje: string; candidatos: CandidatoDuplicado[] }
  /** Otra persona cambió lo mismo después de que se editó acá (2.5). */
  | { clase: "conflicto"; mensaje: string; actual: Record<string, unknown> | null }
  /** El mes de ese gasto o cargo ya se cerró (2.7, lo que la base no puede ver). */
  | { clase: "mes_cerrado"; mensaje: string };

export type EstadoCosa = "por_enviar" | "enviando" | "revisar";

export type Cosa = {
  /** uuid creado en el equipo. En los inserts viaja a la base como id_equipo. */
  id: string;
  usuarioId: string;
  orgId: string;
  edificioId: string;
  /** Para mostrarla en la ficha de la unidad. */
  unidadId: string | null;
  tipo: TipoCosa;
  datos: Record<string, unknown>;
  /** En las ediciones: los valores que había al editar (2.5). */
  antes: Record<string, unknown> | null;
  /** Hora del equipo (ISO). */
  hechoEn: string;
  estado: EstadoCosa;
  intentos: number;
  revisar: Revisar | null;
  /** Una línea para la lista: «Pago de 101 · $ 50,00 · 18/11». */
  resumen: string;
  /** «Son distintos: enviar igual» (2.4). */
  permitirDuplicado?: boolean;
  /** «Usar la mía» en un conflicto (2.5). */
  pisar?: boolean;
};

/** Lo que arma la pantalla; la bandeja completa el resto. */
export type NuevaCosa = Omit<Cosa, "id" | "usuarioId" | "hechoEn" | "estado" | "intentos" | "revisar"> & {
  id?: string;
  hechoEn?: string;
};
