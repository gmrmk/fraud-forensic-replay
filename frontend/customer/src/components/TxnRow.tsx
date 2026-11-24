import { HOUSTON, isDeclined } from "../lib/derive";
import { formatMoney } from "../lib/money";
import type { Transaction } from "../lib/types";

interface Props {
  tx: Transaction;
}

function merchantCity(tx: Transaction): string {
  if (tx.merchant_country === "NG") return "Lekki, Lagos NG";
  return tx.merchant_country ? tx.merchant_country : "Online";
}

function formatTime(ts: string): string {
  const d = new Date(ts);
  return d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: HOUSTON });
}

export function TxnRow({ tx }: Props) {
  const isFraud = tx.is_fraud === 1;
  const declined = isDeclined(tx);
  const isSuspicious = !isFraud && tx.is_card_present === 0 && tx.amount < 10;
  const initial = tx.merchant_name.charAt(0).toUpperCase();

  const rowClass = isFraud
    ? "bg-fraud-bg"
    : "";

  const tileClass = isFraud
    ? "bg-[#fde7e4] text-fraud"
    : isSuspicious
    ? "bg-warn-bg text-warn"
    : "bg-bg text-indigo";

  const nameClass = isFraud ? "text-fraud" : "text-ink";
  const amountClass = isFraud ? "text-fraud" : "text-ink";

  return (
    <div
      className={`flex items-center gap-[13px] border-b border-line last:border-b-0 ${rowClass}`}
      style={{ padding: "12px 16px" }}
    >
      {/* Merchant initial tile */}
      <div
        className={`w-9 h-9 rounded-[10px] flex items-center justify-center font-bold text-[14px] flex-none ${tileClass}`}
      >
        {isFraud ? "!" : initial}
      </div>

      {/* Body */}
      <div className="flex-1 min-w-0">
        <div className={`text-[13.5px] font-medium ${nameClass} flex items-center gap-1 flex-wrap`}>
          <span>{tx.merchant_name}</span>
          {isFraud && (
            <span
              className="bg-fraud text-white font-bold rounded-[6px]"
              style={{ fontSize: 9, letterSpacing: "0.05em", padding: "2px 7px" }}
            >
              FLAGGED
            </span>
          )}
          {declined && (
            <span
              className="text-muted-strong bg-bg border border-line font-bold rounded-[5px]"
              style={{ fontSize: 9, padding: "1px 6px" }}
            >
              DECLINED
            </span>
          )}
          {isSuspicious && !isFraud && (
            <span
              className="text-warn bg-warn-bg border border-warn-line font-bold rounded-[5px]"
              style={{ fontSize: 9, padding: "1px 6px" }}
            >
              NEW MERCHANT
            </span>
          )}
        </div>
        <div className="text-muted mt-0.5" style={{ fontSize: 11.5 }}>
          {merchantCity(tx)} &middot; {tx.category} &middot; {formatTime(tx.timestamp)}
        </div>
      </div>

      {/* Amount */}
      {declined ? (
        // A declined attempt moved no money: no minus sign, muted and struck through.
        <div className="tnum font-semibold text-muted-strong line-through" style={{ fontSize: 14 }}>
          <span className="sr-only">Declined, not charged</span>
          ${formatMoney(tx.amount)}
        </div>
      ) : (
        <div className={`tnum font-semibold ${amountClass}`} style={{ fontSize: 14 }}>
          -${formatMoney(tx.amount)}
        </div>
      )}
    </div>
  );
}
