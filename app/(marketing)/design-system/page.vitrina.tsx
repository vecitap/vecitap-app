"use client";

import { useRef } from "react";
import {
  Badge,
  Button,
  Campo,
  Card,
  Dialog,
  Input,
  Select,
  Table,
  Textarea,
  ThemeToggle,
} from "@/components/ui";

/**
 * Vitrina interna de los tokens y componentes del sistema de diseño
 * (Fase 2). No es una página del producto — sirve para revisar visualmente
 * que el tema claro/oscuro y los componentes compartidos quedaron bien
 * antes de usarlos en la migración de cada módulo (Fase 4 en adelante).
 */
export default function VitrinaDiseno() {
  const dialogoRef = useRef<HTMLDialogElement>(null);

  return (
    <main style={{ maxWidth: 720, margin: "0 auto", padding: 24, display: "grid", gap: 20 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontFamily: "var(--font-titulos)" }}>Sistema de diseño</h1>
        <ThemeToggle />
      </div>

      <Card>
        <h2 style={{ marginTop: 0 }}>Botones</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Button>Primario</Button>
          <Button variante="secundario">Secundario</Button>
          <Button mini>Mini</Button>
          <Button disabled>Deshabilitado</Button>
        </div>
      </Card>

      <Card>
        <h2 style={{ marginTop: 0 }}>Estados</h2>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <Badge tono="verde">Activa</Badge>
          <Badge tono="ambar">Pago vencido</Badge>
          <Badge tono="rojo">Suspendida</Badge>
          <Badge tono="azul">Sin suscripción</Badge>
          <Badge tono="tenue">En prueba</Badge>
        </div>
      </Card>

      <Card>
        <h2 style={{ marginTop: 0 }}>Formulario</h2>
        <Campo etiqueta="Nombre" obligatorio>
          <Input placeholder="Nombre completo" />
        </Campo>
        <Campo etiqueta="Tipo de documento" obligatorio>
          <Select defaultValue="V">
            <option value="V">V</option>
            <option value="E">E</option>
            <option value="G">G</option>
            <option value="J">J</option>
          </Select>
        </Campo>
        <Campo etiqueta="Monto" error="No se entiende el monto en Bs.">
          <Input placeholder="0,00" />
        </Campo>
        <Campo etiqueta="Notas">
          <Textarea rows={3} placeholder="Opcional" />
        </Campo>
      </Card>

      <Card>
        <h2 style={{ marginTop: 0 }}>Tabla</h2>
        <Table>
          <thead>
            <tr>
              <th>Unidad</th>
              <th>Residente</th>
              <th>Estado</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>PB-1</td>
              <td>María Pérez</td>
              <td>
                <Badge tono="verde">Al día</Badge>
              </td>
            </tr>
            <tr>
              <td>3-A</td>
              <td>Juan Gómez</td>
              <td>
                <Badge tono="rojo">Debe</Badge>
              </td>
            </tr>
          </tbody>
        </Table>
      </Card>

      <Card>
        <h2 style={{ marginTop: 0 }}>Diálogo</h2>
        <Button onClick={() => dialogoRef.current?.showModal()}>Abrir diálogo</Button>
        <Dialog ref={dialogoRef}>
          <h3 style={{ marginTop: 0 }}>Confirmar</h3>
          <p>Este es el componente Dialog envolviendo el &lt;dialog&gt; nativo.</p>
          <Button variante="secundario" onClick={() => dialogoRef.current?.close()}>
            Cerrar
          </Button>
        </Dialog>
      </Card>
    </main>
  );
}
