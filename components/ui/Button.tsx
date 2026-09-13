import type { ButtonHTMLAttributes } from "react";

type Props = ButtonHTMLAttributes<HTMLButtonElement> & {
  variante?: "primario" | "secundario";
  mini?: boolean;
};

export function Button({ variante = "primario", mini = false, className = "", ...props }: Props) {
  const clases = [
    "btn",
    variante === "secundario" && "btn-secundario",
    mini && "btn-mini",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return <button className={clases} {...props} />;
}
