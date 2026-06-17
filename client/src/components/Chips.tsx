import { LabelName } from "../types";
import { ReactNode } from "react";
import { cx } from "./Controls";

const labelStyles: Record<string, string> = {
  job: "bg-indigo-50 text-indigo-700",
  holiday: "bg-sky-50 text-sky-700",
  finance: "bg-emerald-50 text-emerald-700",
  newsletter: "bg-amber-50 text-amber-800",
  personal: "bg-fuchsia-50 text-fuchsia-700",
  receipt: "bg-cyan-50 text-cyan-700"
};

export function LabelChip({ label }: { label: LabelName | string }) {
  return (
    <span
      className={cx(
        "inline-flex min-h-6 items-center rounded-full px-2.5 text-xs font-bold",
        labelStyles[label.toLowerCase()] ?? "bg-slate-100 text-slate-700"
      )}
    >
      {label}
    </span>
  );
}

export function StatusChip({
  children,
  tone = "neutral"
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "danger";
}) {
  const tones = {
    neutral: "bg-slate-100 text-slate-600",
    good: "bg-teal-100 text-teal-800",
    warn: "bg-amber-100 text-amber-900",
    danger: "bg-rose-100 text-rose-700"
  };
  return <span className={cx("inline-flex min-h-6 items-center rounded-full px-2.5 text-xs font-bold", tones[tone])}>{children}</span>;
}
