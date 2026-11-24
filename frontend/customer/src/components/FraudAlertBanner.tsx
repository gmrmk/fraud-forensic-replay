import type { LagosAlert } from "../lib/derive";
import { hoursMinutes } from "../lib/derive";

interface Props {
  alert: LagosAlert | null;
  onReview: () => void;
}

export function FraudAlertBanner({ alert, onReview }: Props) {
  if (alert === null || alert.count === 0) return null;
  const { count } = alert;

  return (
    <div
      className="flex items-center gap-[13px] bg-fraud-bg border border-fraud-line rounded-[13px] mb-[18px]"
      style={{ padding: "14px 16px" }}
    >
      {/* Icon tile */}
      <div
        className="bg-fraud text-white flex items-center justify-center font-extrabold rounded-[9px] flex-none"
        style={{ width: 34, height: 34, fontSize: 17 }}
        aria-hidden="true"
      >
        !
      </div>

      <div className="flex-1 min-w-0">
        <div className="text-fraud font-bold" style={{ fontSize: 13.5 }}>
          We spotted {count} unusual {count === 1 ? "charge" : "charges"} in Lagos, Nigeria
        </div>
        <div style={{ fontSize: 12, color: "#9b443a", marginTop: 2 }}>
          Card-present transactions {Math.round(alert.miles).toLocaleString("en-US")} mi from your last purchase,{" "}
          {hoursMinutes(alert.minutes)} later. Did you make these?
        </div>
      </div>

      <button
        type="button"
        onClick={onReview}
        className="bg-fraud text-white rounded-lg font-semibold ml-auto flex-none"
        style={{ padding: "9px 15px", fontSize: 12.5 }}
      >
        Review charges
      </button>
    </div>
  );
}
