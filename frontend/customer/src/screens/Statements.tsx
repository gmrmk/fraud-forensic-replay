import { FileText, Download } from "lucide-react";

interface StatementRow {
  period: string;
  closing: string;
  balance: string;
  minDue: string;
  dueDate: string;
  status: "paid" | "due" | "current";
}

const STATEMENTS: StatementRow[] = [
  { period: "May 2026",  closing: "May 31, 2026",  balance: "$1,204.18", minDue: "$35.00", dueDate: "Jun 22, 2026", status: "current" },
  { period: "Apr 2026",  closing: "Apr 30, 2026",  balance: "$987.44",   minDue: "$35.00", dueDate: "May 22, 2026", status: "paid" },
  { period: "Mar 2026",  closing: "Mar 31, 2026",  balance: "$1,531.90", minDue: "$35.00", dueDate: "Apr 22, 2026", status: "paid" },
];

const STATUS_STYLES: Record<StatementRow["status"], { label: string; cls: string }> = {
  current: { label: "Due Jun 22",  cls: "bg-warn-bg text-warn border border-warn-line" },
  due:     { label: "Overdue",     cls: "bg-fraud-bg text-fraud border border-fraud-line" },
  paid:    { label: "Paid",        cls: "bg-[#f0fdf4] text-[#15803d] border border-[#bbf7d0]" },
};

export function Statements() {
  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-ink font-bold" style={{ fontSize: 16 }}>Statements</h2>
        <span className="text-muted" style={{ fontSize: 12 }}>Last 3 billing cycles</span>
      </div>

      <div className="bg-panel border border-line rounded-[14px] overflow-hidden">
        {STATEMENTS.map((s, i) => (
          <div
            key={s.period}
            className={`flex items-center gap-4 ${i < STATEMENTS.length - 1 ? "border-b border-line" : ""}`}
            style={{ padding: "14px 16px" }}
          >
            {/* Icon */}
            <div className="w-9 h-9 rounded-[10px] bg-bg flex items-center justify-center flex-none">
              <FileText size={17} className="text-indigo" />
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <div className="text-ink font-semibold" style={{ fontSize: 13.5 }}>{s.period}</div>
              <div className="text-muted mt-0.5" style={{ fontSize: 11.5 }}>
                Closing balance {s.balance} &middot; Min due {s.minDue}
              </div>
            </div>

            {/* Status badge */}
            <span
              className={`text-[10px] font-bold uppercase rounded-[8px] px-[8px] py-[3px] ${STATUS_STYLES[s.status].cls}`}
              style={{ letterSpacing: "0.05em" }}
            >
              {STATUS_STYLES[s.status].label}
            </span>

            {/* Download */}
            <button
              type="button"
              className="w-8 h-8 rounded-[8px] bg-bg flex items-center justify-center text-muted hover:text-indigo hover:bg-[#f1f0fd] transition-colors"
              aria-label={`Download ${s.period} statement`}
            >
              <Download size={15} />
            </button>
          </div>
        ))}
      </div>

      <p className="text-faint mt-4 text-center" style={{ fontSize: 11 }}>
        Statements are available for download as PDF. For older statements, contact support.
      </p>
    </div>
  );
}
