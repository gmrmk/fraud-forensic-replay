import { useState } from "react";
import { Lock, Unlock, RefreshCw, Globe, ShoppingCart } from "lucide-react";
import { CreditCard } from "../components/CreditCard";
import { useData } from "../store/data";

export function Cards() {
  const { account } = useData();
  const [locked, setLocked] = useState(false);

  const lastFour = account?.card.last_four ?? "4729";
  const bin = account?.card.bin ?? "414720";
  const holder = account?.customer.name ?? "Marcus Chen";
  const product = account?.card.product_type ?? "Signature Cash Rewards";
  const network = account?.card.network ?? "Visa";

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-ink font-bold" style={{ fontSize: 16 }}>Cards</h2>
      </div>

      <div className="grid gap-6" style={{ gridTemplateColumns: "300px 1fr" }}>
        {/* Card visual */}
        <div>
          <CreditCard
            network={network}
            bin={bin}
            lastFour={lastFour}
            holder={holder}
            product={product}
          />
          <div className="mt-3 text-center text-faint" style={{ fontSize: 11 }}>
            Virtual + Physical card
          </div>
        </div>

        {/* Controls */}
        <div className="flex flex-col gap-3">
          {/* Lock toggle */}
          <div className="bg-panel border border-line rounded-[14px] overflow-hidden">
            <div
              className="flex items-center gap-3 border-b border-line"
              style={{ padding: "12px 16px" }}
            >
              <div className="w-9 h-9 rounded-[10px] bg-bg flex items-center justify-center flex-none">
                {locked ? <Lock size={17} className="text-fraud" /> : <Unlock size={17} className="text-indigo" />}
              </div>
              <div className="flex-1">
                <div className="text-ink font-semibold" style={{ fontSize: 13.5 }}>
                  Card {locked ? "locked" : "active"}
                </div>
                <div className="text-muted mt-0.5" style={{ fontSize: 11.5 }}>
                  {locked
                    ? "Card is frozen - no new transactions will be approved"
                    : "Card is active and accepting transactions"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLocked((v) => !v)}
                className={[
                  "relative inline-flex h-6 w-11 flex-none rounded-full transition-colors duration-200 focus:outline-none",
                  locked ? "bg-fraud" : "bg-indigo",
                ].join(" ")}
                role="switch"
                aria-checked={locked}
              >
                <span
                  className={[
                    "inline-block h-5 w-5 rounded-full bg-white shadow transform transition-transform duration-200 mt-0.5",
                    locked ? "translate-x-5" : "translate-x-0.5",
                  ].join(" ")}
                />
              </button>
            </div>

            {locked && (
              <div className="bg-fraud-bg px-4 py-2.5 text-fraud text-[12px]">
                Card locking - all charges while locked will be declined. Unlock above to resume use.
              </div>
            )}
          </div>

          {/* Card settings (inert static panel) */}
          <div className="bg-panel border border-line rounded-[14px] overflow-hidden">
            <div
              className="text-faint uppercase border-b border-line"
              style={{ fontSize: 10.5, letterSpacing: "0.07em", padding: "9px 16px" }}
            >
              Spending controls
            </div>
            {[
              { icon: Globe,        label: "International transactions", detail: "Enabled",  active: true  },
              { icon: ShoppingCart, label: "Online / card-not-present",  detail: "Enabled",  active: true  },
              { icon: RefreshCw,    label: "Recurring charges",          detail: "Enabled",  active: true  },
            ].map(({ icon: Icon, label, detail, active }) => (
              <div
                key={label}
                className="flex items-center gap-3 border-b border-line last:border-b-0"
                style={{ padding: "12px 16px" }}
              >
                <div className="w-9 h-9 rounded-[10px] bg-bg flex items-center justify-center flex-none">
                  <Icon size={16} className="text-muted" />
                </div>
                <div className="flex-1">
                  <div className="text-ink" style={{ fontSize: 13 }}>{label}</div>
                </div>
                <span
                  className={`text-[11px] font-semibold ${active ? "text-[#15803d]" : "text-muted"}`}
                >
                  {detail}
                </span>
              </div>
            ))}
          </div>

          <p className="text-faint text-center" style={{ fontSize: 11 }}>
            Spending control changes - coming in a future release.
          </p>
        </div>
      </div>
    </div>
  );
}
