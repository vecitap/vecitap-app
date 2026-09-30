import { Suspense } from "react";
import { PantallaMarca } from "@/components/ui";
import { FormularioEntrar } from "./FormularioEntrar";

export default function EntrarPage() {
  return (
    <PantallaMarca volverAlSitio>
      <Suspense fallback={null}>
        <FormularioEntrar />
      </Suspense>
    </PantallaMarca>
  );
}
