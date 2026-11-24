import type { ReactNode } from "react";

interface Props {
  label: string;
  children: ReactNode;
  sub?: string;
}

export function StatCard({ label, children, sub }: Props) {
  return (
    <div className="bg-panel border border-line rounded-2xl flex flex-col justify-center"
         style={{ padding: "15px 16px" }}>
      <div className="text-faint uppercase" style={{ fontSize: 10.5, letterSpacing: "0.07em" }}>
        {label}
      </div>
      <div className="mt-[5px] font-bold text-ink tnum" style={{ fontSize: 23, letterSpacing: "-0.02em" }}>
        {children}
      </div>
      {sub && (
        <div className="text-muted mt-[3px]" style={{ fontSize: 11 }}>
          {sub}
        </div>
      )}
    </div>
  );
}
