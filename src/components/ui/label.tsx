import * as React from "react";
import { cn } from "@/lib/utils";

function Label({ className, ...props }: React.ComponentProps<"label">) {
  return (
    <label data-slot="label" className={cn("mb-1 block text-sm text-blue-100/80 select-none", className)} {...props} />
  );
}

export { Label };
