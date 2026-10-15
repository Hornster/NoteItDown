import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      data-slot="textarea"
      className={cn(
        "border-input text-foreground placeholder:text-muted-foreground focus-visible:ring-ring min-h-40 w-full rounded-lg border bg-transparent px-3 py-2 transition-colors focus-visible:ring-2 focus-visible:outline-none",
        "aria-invalid:border-destructive-text aria-invalid:focus-visible:ring-destructive-text",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
