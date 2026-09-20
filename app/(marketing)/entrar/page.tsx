import { Suspense } from "react";
import { FormularioEntrar } from "./FormularioEntrar";

export default function EntrarPage() {
  return (
    <main style={{ maxWidth: 420, margin: "0 auto", padding: 24 }}>
      <Suspense fallback={null}>
        <FormularioEntrar />
      </Suspense>
    </main>
  );
}
