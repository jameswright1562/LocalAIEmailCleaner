import {
  CalendarClock,
  History,
  Inbox,
  MailX,
  Settings,
  Sparkles
} from "lucide-react";

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
    <aside className="sidebar">
      <div className="brand">
        <div className="brand-mark">
          <Sparkles size={18} />
        </div>
        <div>
          <strong>LocalAI Mail</strong>
          <span>Private inbox agent</span>
        </div>
      </div>
      <nav className="nav-list" aria-label="Main navigation">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <button
              className={`nav-item ${page === item.id ? "active" : ""}`}
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
      <div className="sidebar-status">
        <span className="pulse-dot" />
        <div>
          <strong>AI ready</strong>
          <span>OpenAI compatible</span>
        </div>
      </div>
    </aside>
  );
}
