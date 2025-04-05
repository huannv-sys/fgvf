import React from "react";
import { cn } from "../../lib/utils";

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?:
    | "primary"
    | "secondary"
    | "success"
    | "danger"
    | "warning"
    | "info"
    | "light"
    | "dark"
    | "link"
    | "outline-primary"
    | "outline-secondary"
    | "outline-success"
    | "outline-danger"
    | "outline-warning"
    | "outline-info"
    | "outline-light"
    | "outline-dark"
    | "ghost";
  size?: "sm" | "md" | "lg";
}

export function Button({
  className,
  variant = "primary",
  size = "md",
  children,
  disabled,
  ...props
}: ButtonProps) {
  // Map variants to Bootstrap classes
  let variantClass = "";
  
  if (variant === "ghost") {
    variantClass = "btn-link text-body";
  } else {
    variantClass = `btn-${variant}`;
  }

  // Map sizes to Bootstrap classes
  const sizeClass = {
    sm: "btn-sm",
    md: "",
    lg: "btn-lg",
  }[size];

  return (
    <button
      className={cn(
        "btn",
        variantClass,
        sizeClass,
        disabled && "disabled",
        className
      )}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}