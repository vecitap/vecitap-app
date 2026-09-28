/**
 * Andamio del bloque 10, temporal por diseño.
 *
 * El bloque 10 construye las fundaciones (ruta, gate, tema, armazón) y las
 * cuatro vistas llegan en los bloques 11 y 12. Sin estas páginas el <nav>
 * del armazón llevaría a cuatro 404 y no habría manera de validar el
 * armazón, que es justamente lo que este bloque entrega.
 *
 * Cada bloque siguiente reemplaza el `<EnConstruccion>` de su vista por la
 * vista de verdad; cuando no quede ninguno, este archivo se borra.
 */
export function EnConstruccion({ vista, bloque }: { vista: string; bloque: number }) {
  return (
    <div className="garita-tarjeta">
      <h2>{vista}</h2>
      <div className="garita-vacio">
        Esta vista todavía no está construida — llega en el bloque {bloque} de la migración.
      </div>
    </div>
  );
}
