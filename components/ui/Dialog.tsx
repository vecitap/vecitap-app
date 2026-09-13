import { forwardRef, type DialogHTMLAttributes } from "react";

/** Envoltorio del <dialog> nativo (mismo patrón que vecitap.html), estilado. */
export const Dialog = forwardRef<HTMLDialogElement, DialogHTMLAttributes<HTMLDialogElement>>(
  function Dialog({ className = "", ...props }, ref) {
    return <dialog ref={ref} className={`dialogo ${className}`.trim()} {...props} />;
  }
);
