import { LabelName } from "../types";
import { ReactNode } from "react";

export function LabelChip({ label }: { label: LabelName | string }) {
  return <span className={`chip label-${label.toLowerCase()}`}>{label}</span>;
}

export function StatusChip({
  children,
  tone = "neutral"
}: {
  children: ReactNode;
  tone?: "neutral" | "good" | "warn" | "danger";
}) {
  return <span className={`status-chip ${tone}`}>{children}</span>;
}
