import type { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "ghost";

type KingdomButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: Variant;
};

export function KingdomButton({ variant = "primary", className = "", type = "button", ...props }: KingdomButtonProps) {
  return <button className={`gp-kingdom-button gp-kingdom-button-${variant} ${className}`.trim()} type={type} {...props} />;
}
