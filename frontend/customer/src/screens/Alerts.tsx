import { useClock } from "../store/clock";
import { useData } from "../store/data";
import { visibleTxns, fraudAlerted, lagosAlert } from "../lib/derive";
import { TxnRow } from "../components/TxnRow";

export function Alerts() {
  const t = useClock((s) => s.t);
  const { txns, error } = useData();
  const visible = visibleTxns(txns, t);
  const hasAlert = fraudAlerted(visible);
  const flagged = visible.filter((x) => x.is_fraud === 1);
  const lagos = lagosAlert(visible);

  return (
    <div>
      <div className="mb-4 flex items-baseline justify-between">
        <h2 className="text-ink font-bold" style={{ fontSize: 16 }}>Security alerts</h2>
        {hasAlert && (
          <span
            className="bg-fraud text-white font-bold rounded-[10px] px-[9px] py-px"
            style={{ fontSize: 11 }}
          >
            {flagged.length} active
          </span>
        )}
      </div>

      {error && (
        <div className="bg-warn-bg border border-warn-line rounded-lg px-4 py-2 mb-4 text-warn text-sm">
          {error}
        </div>
      )}

      {!hasAlert ? (
        <div className="bg-panel border border-line rounded-[14px] px-4 py-12 text-center">
          <div className="text-[32px] mb-3">✓</div>
          <div className="text-ink font-semibold mb-1" style={{ fontSize: 15 }}>All clear</div>
          <div className="text-muted" style={{ fontSize: 13 }}>
            No unusual activity detected on your account.
          </div>
        </div>
      ) : (
        <div>
          <p className="text-muted mb-3" style={{ fontSize: 13 }}>
            The following transactions were flagged as potentially fraudulent. If you did not
            make these charges, please contact support immediately.
          </p>
          <div className="bg-panel border border-fraud-line rounded-[14px] overflow-hidden mb-4">
            {flagged.map((tx) => (
              <TxnRow key={tx.id} tx={tx} />
            ))}
          </div>
          {lagos && (
          <div className="bg-fraud-bg border border-fraud-line rounded-[13px] px-4 py-3 flex items-start gap-3">
            <div
              className="bg-fraud text-white flex items-center justify-center font-extrabold rounded-[8px] flex-none mt-0.5"
              style={{ width: 28, height: 28, fontSize: 15 }}
            >
              !
            </div>
            <div>
              <div className="text-fraud font-semibold" style={{ fontSize: 13 }}>
                Transactions detected in Lagos, Nigeria
              </div>
              <div className="text-muted mt-1" style={{ fontSize: 12 }}>
                Card-present activity {Math.round(lagos.miles).toLocaleString("en-US")} mi from your
                last purchase. If you are not currently in Nigeria, these charges are likely unauthorized.
              </div>
              <button
                type="button"
                className="mt-2 bg-fraud text-white font-semibold rounded-[8px]"
                style={{ fontSize: 12, padding: "7px 14px" }}
              >
                Dispute charges
              </button>
            </div>
          </div>
          )}
        </div>
      )}
    </div>
  );
}
