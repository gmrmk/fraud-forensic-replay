import { useMemo } from "react";
import { InspectorSection } from "./InspectorSection";
import { InspectorField } from "./InspectorField";
import {
  haversineMiles,
  timeDeltaMs,
  impossibleTravelSpeedMph,
  formatTimeDelta,
  formatTs,
} from "../../lib/entities";
import { AuthInspector } from "./AuthInspector";
import type { LoginEvent, Transaction } from "../../types";

interface Props {
  tx: Transaction;
  transactions: Transaction[];
  logins: LoginEvent[];
}


/** Marcus's last CLEAN (non-fraud) transaction strictly before `tx`. */
function lastCleanTransaction(
  tx: Transaction,
  transactions: Transaction[]
): Transaction | undefined {
  const sorted = transactions
    .filter((t) => t.card_id === tx.card_id && !t.is_fraud && t.id !== tx.id)
    .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  let last: Transaction | undefined;
  for (const t of sorted) {
    if (t.timestamp >= tx.timestamp) break;
    last = t;
  }
  return last;
}

export function FraudInspector({ tx, transactions, logins }: Props) {
  const lastClean = useMemo(
    () => lastCleanTransaction(tx, transactions),
    [tx, transactions]
  );

  const travel = useMemo(() => {
    // Travel math is only honest for card-present rows: CNP merchant
    // coordinates are merchant-HQ geocodes, not cardholder locations.
    if (!lastClean || !tx.is_card_present) return null;
    const miles = haversineMiles(
      [lastClean.merchant_lat, lastClean.merchant_lng],
      [tx.merchant_lat, tx.merchant_lng]
    );
    const ms = timeDeltaMs(lastClean.timestamp, tx.timestamp);
    const mph = impossibleTravelSpeedMph(
      [lastClean.merchant_lat, lastClean.merchant_lng],
      lastClean.timestamp,
      [tx.merchant_lat, tx.merchant_lng],
      tx.timestamp
    );
    // 600 mph ≈ commercial-jet cruise. > 600 is impossible in practice.
    const impossible = mph > 600;
    return { miles, ms, mph, impossible, from: lastClean };
  }, [lastClean, tx]);

  // Card-not-present: no travel math (merchant coords are HQ geocodes, not
  // the cardholder) and no POS-entry skimmer framing (skimmers do not exist
  // online). Render channel-honest fields instead.
  if (!tx.is_card_present) {
    return (
      <>
        <InspectorSection
          title="Channel and score"
          trailing={
            tx.risk_score > 0 ? (
              <span className="font-mono text-[10px] text-[color:var(--alarm-on-inspector)]">
                {tx.risk_score} / 1000
              </span>
            ) : undefined
          }
        >
          <InspectorField label="Channel" field="is_card_present" value="Card not present" />
          <InspectorField
            label="3DS"
            field="is_3ds"
            value={tx.is_3ds ? "3DS passed" : "No 3DS"}
            valueClass={tx.is_3ds ? "text-text" : "text-[color:var(--alarm-on-inspector)]"}
          />
          {tx.risk_score > 0 && (
            <InspectorField
              label="Score"
              field="risk_score"
              value={tx.risk_score}
              valueClass="text-[color:var(--alarm-on-inspector)]"
            />
          )}
          <InspectorField label="Source" field="auth_source" value={tx.auth_source.toUpperCase()} />
          <InspectorField label="Acquirer" field="acquirer" value={tx.acquirer} />
        </InspectorSection>

        <AuthInspector tx={tx} transactions={transactions} logins={logins} />
      </>
    );
  }

  return (
    <>
      <InspectorSection title="Travel">
        {travel ? (
          <>
            <InspectorField label="From" field="derived_travel_from" value={travel.from.merchant_name} />
            <InspectorField label="From Country" field="derived_travel_from_country" value={travel.from.merchant_country} />
            <InspectorField label="From Date" field="derived_travel_from_date" value={formatTs(travel.from.timestamp)} />
            <InspectorField label="To" field="derived_travel_to" value={tx.merchant_name} />
            <InspectorField label="To Country" field="derived_travel_to_country" value={tx.merchant_country} />
            <InspectorField
              label="Distance"
              field="derived_travel_distance"
              value={`${Math.round(travel.miles).toLocaleString()} mi`}
            />
            <InspectorField label="Time" field="derived_travel_time" value={formatTimeDelta(travel.ms)} />
            <InspectorField
              label="Required Speed"
              field="derived_travel_required_speed"
              value={`${Math.round(travel.mph).toLocaleString()} mph`}
              valueClass={travel.impossible ? "text-[color:var(--alarm-on-inspector)]" : "text-text"}
            />
          </>
        ) : (
          <div className="font-mono text-[10px] text-[color:var(--text-faint-on-inspector)] py-0.5">Earlier transaction: none</div>
        )}
      </InspectorSection>

      <InspectorSection
        title="Risk Signals"
        trailing={
          <span className="font-mono text-[10px] text-[color:var(--alarm-on-inspector)]">
            {tx.risk_score} / 1000
          </span>
        }
      >
        <InspectorField
          label="Score"
          field="risk_score"
          value={tx.risk_score}
          valueClass="text-[color:var(--alarm-on-inspector)]"
        />
        <InspectorField label="Source" field="auth_source" value={tx.auth_source.toUpperCase()} />
        <InspectorField
          label="POS Entry"
          field="pos_entry_mode"
          value={tx.pos_entry_mode.replace(/_/g, " ")}
          valueClass={
            tx.pos_entry_mode === "chip_fallback_swipe"
              ? "text-[color:var(--alarm-on-inspector)]"
              : "text-text"
          }
        />
        <InspectorField label="Acquirer" field="acquirer" value={tx.acquirer} />
      </InspectorSection>

      <AuthInspector tx={tx} transactions={transactions} logins={logins} />
    </>
  );
}
