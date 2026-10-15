import type { ReactNode } from "react";
import { CircleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const inputGeometry = "rounded-lg px-3 py-2 pl-10 transition-colors";

interface FormFieldProps {
  id: string;
  name?: string;
  label: string;
  type?: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  error?: string;
  hint?: ReactNode;
  icon: ReactNode;
  endContent?: ReactNode;
}

export function FormField({
  id,
  name,
  label,
  type = "text",
  value,
  onChange,
  placeholder,
  error,
  hint,
  icon,
  endContent,
}: FormFieldProps) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <div className="relative">
        <span className="text-muted-foreground absolute top-1/2 left-3 size-4 -translate-y-1/2">{icon}</span>
        <Input
          id={id}
          name={name ?? id}
          type={type}
          value={value}
          onChange={(e) => {
            onChange(e.target.value);
          }}
          placeholder={placeholder}
          aria-invalid={error ? true : undefined}
          className={inputGeometry}
        />
        {endContent}
      </div>
      {error ? (
        <p className="text-destructive-text mt-1 flex items-center gap-1 text-xs">
          <CircleAlert className="size-3" aria-hidden="true" />
          {error}
        </p>
      ) : (
        hint
      )}
    </div>
  );
}
