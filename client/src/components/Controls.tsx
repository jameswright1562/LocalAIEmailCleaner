import { ReactNode } from "react";

type ButtonProps = {
  children: ReactNode;
  variant?: "primary" | "secondary" | "danger" | "ghost";
  onClick?: () => void;
  disabled?: boolean;
  loading?: boolean;
  type?: "button" | "submit";
};

const buttonStyles = {
  primary: "border-indigo-700 bg-indigo-700 text-white shadow-sm shadow-indigo-900/10 hover:bg-indigo-800",
  secondary: "border-teal-700 bg-teal-700 text-white shadow-sm shadow-teal-900/10 hover:bg-teal-800",
  danger: "border-rose-600 bg-rose-600 text-white shadow-sm shadow-rose-900/10 hover:bg-rose-700",
  ghost: "border-slate-300 bg-white text-slate-800 hover:bg-slate-50"
};

export function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

export function Spinner({ className = "h-4 w-4" }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cx("inline-block animate-spin rounded-full border-2 border-current border-r-transparent", className)}
    />
  );
}

export function Button({ children, variant = "primary", onClick, disabled, loading, type = "button" }: ButtonProps) {
  return (
    <button
      className={cx(
        "inline-flex min-h-10 items-center justify-center gap-2 rounded-lg border px-3.5 text-sm font-bold transition hover:-translate-y-px disabled:cursor-not-allowed disabled:opacity-60",
        buttonStyles[variant]
      )}
      disabled={disabled || loading}
      onClick={onClick}
      type={type}
    >
      {loading ? <Spinner /> : null}
      {children}
    </button>
  );
}

type FieldProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
};

export function Field({ label, value, onChange, placeholder, type = "text" }: FieldProps) {
  return (
    <label className="grid gap-1.5">
      <span className="text-sm font-extrabold text-slate-700">{label}</span>
      <input
        className="min-h-10 w-full rounded-lg border border-slate-300 bg-white px-3 text-slate-950 outline-none focus:border-indigo-700 focus:ring-4 focus:ring-indigo-700/10"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        type={type}
      />
    </label>
  );
}

type ToggleProps = {
  label: string;
  description?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
};

export function Toggle({ label, description, checked, onChange }: ToggleProps) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3">
      <span>
        <strong className="block text-sm font-extrabold text-slate-800">{label}</strong>
        {description ? <small className="mt-0.5 block text-sm leading-5 text-slate-500">{description}</small> : null}
      </span>
      <input
        className="h-6 w-11 accent-indigo-700"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        type="checkbox"
      />
    </label>
  );
}
