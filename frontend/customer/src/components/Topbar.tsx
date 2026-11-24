import { Search, Bell } from "lucide-react";

interface Props {
  greeting: string;
  subtitle: string;
}

export function Topbar({ greeting, subtitle }: Props) {
  return (
    <div className="flex items-center justify-between px-[26px] py-5 flex-none">
      <div>
        <div className="text-ink font-bold font-display" style={{ fontSize: 22, letterSpacing: "-0.01em" }}>
          {greeting}, Marcus
        </div>
        <div className="text-muted mt-0.5" style={{ fontSize: 12 }}>
          {subtitle}
        </div>
      </div>

      <div className="flex items-center gap-[10px]">
        {/* Visual-only search */}
        <div className="flex items-center gap-2 bg-panel border border-line rounded-[9px] px-3 py-2"
             style={{ width: 210 }}>
          <Search size={13} className="text-faint flex-none" />
          <span className="text-faint" style={{ fontSize: 12 }}>
            Search transactions…
          </span>
        </div>

        {/* Bell with red pip */}
        <div className="relative w-9 h-9 rounded-[9px] bg-panel border border-line flex items-center justify-center">
          <Bell size={16} className="text-muted" />
          <span className="absolute top-[8px] right-[9px] w-[7px] h-[7px] rounded-full bg-fraud" />
        </div>
      </div>
    </div>
  );
}
