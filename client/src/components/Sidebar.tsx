import {
  CalendarClock,
  History,
  Inbox,
  MailX,
  Settings,
  Sparkles
} from "lucide-react";
import { cx } from "./Controls";

export type Page = "dashboard" | "scheduled" | "history" | "unsubscribe" | "settings";

const navItems = [
  { id: "dashboard", label: "Dashboard", icon: Inbox },
  { id: "scheduled", label: "Scheduled Runs", icon: CalendarClock },
  { id: "history", label: "History", icon: History },
  { id: "unsubscribe", label: "Unsubscribe", icon: MailX },
  { id: "settings", label: "Settings", icon: Settings }
] as const;

type Props = {
  page: Page;
  onPageChange: (page: Page) => void;
};

export function Sidebar({ page, onPageChange }: Props) {
  return (
    <aside className="sticky top-0 flex h-screen flex-col gap-7 border-r border-slate-200 bg-white/85 px-4 py-6 backdrop-blur max-[980px]:static max-[980px]:h-auto max-[980px]:flex-row max-[980px]:items-center max-[980px]:overflow-x-auto max-[980px]:p-3">
      <div className="flex items-center gap-3 px-1.5 py-1">
        <div className="grid h-10 w-10 place-items-center rounded-xl bg-indigo-700 text-white shadow-sm shadow-indigo-900/20">
          <Sparkles size={18} />
        </div>
        <div>
          <strong className="block text-[15px] leading-5 text-slate-950">LocalAI Mail</strong>
          <span className="text-sm text-slate-500 max-[620px]:hidden">Private inbox agent</span>
        </div>
      </div>
      <nav className="grid gap-1.5 max-[980px]:flex" aria-label="Main navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className={cx(
                "flex min-h-10 w-full items-center gap-2.5 whitespace-nowrap rounded-lg px-3 text-left text-sm font-bold transition",
                page === item.id ? "bg-indigo-50 text-indigo-700" : "bg-transparent text-slate-600 hover:bg-slate-100"
              )}
              key={item.id}
              onClick={() => onPageChange(item.id)}
              type="button"
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
      <div className="mt-auto flex items-center gap-2.5 rounded-xl border border-slate-200 bg-white/80 p-3 max-[980px]:hidden">
        <span className="h-2.5 w-2.5 rounded-full bg-teal-600 shadow-[0_0_0_6px_rgba(13,148,136,0.12)]" />
        <div>
          <strong className="block text-[15px] leading-5 text-slate-950">AI ready</strong>
          <span className="text-sm text-slate-500">OpenAI compatible</span>
        </div>
      </div>
    </aside>
  );
}
