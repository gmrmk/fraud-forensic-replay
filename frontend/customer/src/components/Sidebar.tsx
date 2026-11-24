import {
  LayoutDashboard,
  Receipt,
  FileText,
  CreditCard as CreditCardIcon,
  Bell,
  User,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

interface NavItem {
  id: string;
  label: string;
  icon: LucideIcon;
}

const NAV_ITEMS: NavItem[] = [
  { id: "dashboard",    label: "Dashboard",    icon: LayoutDashboard },
  { id: "transactions", label: "Transactions", icon: Receipt },
  { id: "statements",   label: "Statements",   icon: FileText },
  { id: "cards",        label: "Cards",        icon: CreditCardIcon },
  { id: "alerts",       label: "Alerts",       icon: Bell },
  { id: "profile",      label: "Profile",      icon: User },
];

interface Props {
  active: string;
  onNavigate: (id: string) => void;
  alertCount: number;
}

export function Sidebar({ active, onNavigate, alertCount }: Props) {
  return (
    <aside
      className="w-[218px] flex-none bg-panel border-r border-line flex flex-col"
      style={{ padding: "20px 14px" }}
    >
      {/* Wordmark */}
      <div className="flex items-center gap-[9px] px-2 pb-[18px]">
        <div
          className="w-7 h-7 rounded-lg flex-none"
          style={{ background: "linear-gradient(135deg,#4338ca,#6d28d9)" }}
        />
        <span className="text-ink font-bold font-display" style={{ fontSize: 16, letterSpacing: "0.01em" }}>
          Corrivale
        </span>
      </div>

      {/* Nav */}
      <nav className="flex flex-col gap-0.5">
        {NAV_ITEMS.map(({ id, label, icon: Icon }) => {
          const isActive = id === active;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onNavigate(id)}
              className={[
                "flex items-center gap-[11px] px-[11px] py-[9px] rounded-[9px] text-[13.5px] w-full text-left",
                isActive
                  ? "bg-[#f1f0fd] text-indigo font-semibold"
                  : "text-muted font-medium hover:bg-bg",
              ].join(" ")}
            >
              <Icon size={17} className="flex-none" />
              <span className="flex-1">{label}</span>
              {id === "alerts" && alertCount > 0 && (
                <span className="ml-auto bg-fraud text-white text-[10px] font-bold rounded-[10px] px-[7px] py-px">
                  {alertCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      <div className="flex-1" />

      {/* Marcus footer */}
      <div
        className="flex items-center gap-[10px] p-[9px] border-t border-line mt-2"
      >
        <div
          className="w-8 h-8 rounded-full flex-none flex items-center justify-center text-white text-[13px] font-bold"
          style={{ background: "linear-gradient(135deg,#0ea5e9,#4338ca)" }}
        >
          MC
        </div>
        <div>
          <div className="text-ink font-semibold" style={{ fontSize: 12.5 }}>
            Marcus Chen
          </div>
          <div className="text-faint" style={{ fontSize: 10.5 }}>
            Signature&nbsp;&middot;&nbsp;4729
          </div>
        </div>
      </div>

      {/* Never pass synthetic data off as real: the label is on every screen, in the
          muted tier (4.8:1 on white) so that it can be read. */}
      <p className="text-muted px-[9px] pt-2" style={{ fontSize: 10.5, lineHeight: 1.35 }}>
        Synthetic data. Fictional people and merchants.
      </p>
    </aside>
  );
}
