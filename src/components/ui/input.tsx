import * as React from "react";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "border-input text-foreground placeholder:text-muted-foreground focus-visible:ring-ring w-full border bg-transparent transition-colors focus-visible:ring-2 focus-visible:outline-none",
        "file:text-foreground file:border-0 file:bg-transparent file:text-sm file:font-medium",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive-text aria-invalid:focus-visible:ring-destructive-text",
        className,
      )}
      {...props}
    />
  );
}

export { Input };
