import * as React from "react";
import { cn } from "@/lib/utils";

function Select({ className, ...props }: React.ComponentProps<"select">) {
  return (
    <select
      data-slot="select"
      className={cn(
        "border-input text-foreground focus-visible:ring-ring border bg-transparent transition-colors focus-visible:ring-2 focus-visible:outline-none",
        "[&_option]:bg-popover [&_option]:text-popover-foreground [&_optgroup]:bg-popover [&_optgroup]:text-popover-foreground",
        "disabled:cursor-not-allowed disabled:opacity-50",
        "aria-invalid:border-destructive-text aria-invalid:focus-visible:ring-destructive-text",
        className,
      )}
      {...props}
    />
  );
}

export { Select };
