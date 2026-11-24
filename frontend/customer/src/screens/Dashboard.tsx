import { useClock } from "../store/clock";
import { useData } from "../store/data";
import { visibleTxns, currentBalance, fraudAlerted, availableCredit, lagosAlert } from "../lib/derive";
import { formatMoney } from "../lib/money";
import { BalanceOdometer } from "../components/BalanceOdometer";
import { CreditCard } from "../components/CreditCard";
import { StatCard } from "../components/StatCard";
import { FraudAlertBanner } from "../components/FraudAlertBanner";
import { TxnRow } from "../components/TxnRow";

function groupByDay(txns: ReturnType<typeof visibleTxns>) {
  const groups = new Map<string, typeof txns>();
  for (const tx of txns) {
    const key = new Date(tx.timestamp).toLocaleDateString("en-US", {
      weekday: "short", month: "short", day: "numeric",
    });
    const existing = groups.get(key) ?? [];
    existing.push(tx);
    groups.set(key, existing);
  }
  return groups;
}

export function Dashboard() {
  const t = useClock((s) => s.t);
  const rate = useClock((s) => s.rate); // scales the odometer roll to the playhead pace
  const { account, txns, error } = useData();

  const visible = visibleTxns(txns, t);
  const balance = currentBalance(visible);
  const hasAlert = fraudAlerted(visible);
  const alert = hasAlert ? lagosAlert(visible) : null;
  const creditAvailable = account ? availableCredit(account.credit_limit, balance) : 0;

  // First 8 visible transactions for the activity section
  const recent = visible.slice(0, 8);
  const dayGroups = groupByDay(recent);

  const loading = account === null && !error;

  return (
    <div className="p-0">
      {/* Error note (non-blocking) */}
      {error && (
        <div className="bg-warn-bg border border-warn-line rounded-lg px-4 py-2 mb-4 text-warn text-sm">
          {error} - showing last cached state
        </div>
      )}

      {/* Fraud alert banner */}
      <FraudAlertBanner alert={alert} onReview={() => {}} />

      {/* Hero grid: card + stats */}
      <div className="grid gap-4 mb-[18px]" style={{ gridTemplateColumns: "300px 1fr" }}>
        {/* Credit card */}
        {loading ? (
          <div className="rounded-2xl bg-line animate-pulse" style={{ height: 178 }} />
        ) : account ? (
          <CreditCard
            network={account.card.network}
            bin={account.card.bin}
            lastFour={account.card.last_four}
            holder={account.customer.name}
            product={account.card.product_type ?? "Signature Cash Rewards"}
          />
        ) : (
          <CreditCard
            network="Visa"
            bin="414720"
            lastFour="4729"
            holder="MARCUS CHEN"
            product="Signature Cash Rewards"
          />
        )}

        {/* 2×2 stat grid */}
        <div className="grid grid-cols-2 gap-[14px]">
          {/* Current balance with odometer */}
          <StatCard label="Current balance" sub={account ? `of $${formatMoney(account.credit_limit)} limit` : undefined}>
            {loading ? (
              <span className="text-2xl">-</span>
            ) : (
              <BalanceOdometer value={balance} rate={rate} />
            )}
          </StatCard>

          {/* Available credit */}
          <StatCard
            label="Available credit"
            sub={account ? `of $${formatMoney(account.credit_limit)} limit` : undefined}
          >
            {loading ? "-" : `$${formatMoney(creditAvailable)}`}
          </StatCard>

          {/* Statement due - spanning both columns */}
          <div className="col-span-2 bg-panel border border-line rounded-2xl flex items-center justify-between"
               style={{ padding: "15px 16px" }}>
            <div>
              <div className="text-faint uppercase" style={{ fontSize: 10.5, letterSpacing: "0.07em" }}>
                Statement due
              </div>
              <div className="text-ink font-semibold mt-1" style={{ fontSize: 13 }}>
                Min $35 &middot; due Jun 22
              </div>
            </div>
            {/* Usage bar (static visual indicator) */}
            <div className="h-[7px] rounded-[4px] bg-[#eceaf9] overflow-hidden" style={{ width: 160 }}>
              <div
                className="h-full bg-indigo rounded-[4px]"
                style={{ width: account ? `${Math.min((balance / account.credit_limit) * 100, 100)}%` : "19%" }}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Recent activity */}
      <div className="flex items-center justify-between mb-[10px]" style={{ margin: "4px 2px 10px" }}>
        <h3 className="text-ink font-bold" style={{ fontSize: 14 }}>Recent activity</h3>
        <span className="text-indigo font-semibold" style={{ fontSize: 12 }}>View all</span>
      </div>

      {visible.length === 0 ? (
        <div className="bg-panel border border-line rounded-[14px] px-4 py-8 text-center text-muted text-sm">
          No activity yet
        </div>
      ) : (
        <div className="bg-panel border border-line rounded-[14px] overflow-hidden">
          {Array.from(dayGroups.entries()).map(([day, rows]) => (
            <div key={day}>
              <div
                className="text-faint uppercase bg-[#fafbfc] border-b border-line"
                style={{ fontSize: 10.5, letterSpacing: "0.07em", padding: "11px 16px 6px" }}
              >
                {day}
              </div>
              {rows.map((tx) => (
                <TxnRow key={tx.id} tx={tx} />
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
