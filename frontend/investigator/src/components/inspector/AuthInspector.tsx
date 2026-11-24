import { useMemo } from "react";
import { InspectorSection } from "./InspectorSection";
import { InspectorField } from "./InspectorField";
import {
  haversineMiles,
  timeDeltaMs,
  formatTimeDelta,
  formatTs,
  computeBaseline,
} from "../../lib/entities";
import { MatchBadge } from "../match/MatchBadge";
import { FieldMatchBadge } from "../match/FieldMatchBadge";
import { toMgrs } from "../../lib/geo/mgrs";
import { matchBaseline, relatedEntities } from "../../lib/matches";
import type { LoginEvent, Transaction } from "../../types";

interface Props {
  tx: Transaction;
  transactions: Transaction[];
  logins: LoginEvent[];
}

const HOU_TZ = "America/Chicago";

/** Median match-count across every OTHER distinct value of `field` in
 *  `transactions` - the same "typical size of a peer group" idea as
 *  lib/matches.ts's sessionMatchStats (lib/matches.ts's matchBaseline does the
 *  walk), for the 7 transaction-side pivotable fields here. Feeding this (rather than a
 *  hardcoded 0) into MatchBadge lets its existing tone rule work as
 *  designed: baseline=0 means "no established norm exists", which is
 *  false for a common merchant/MCC/acquirer/etc and was forcing every
 *  benign field into the red "signature anomaly" tone. */
function fieldBaseline(
  transactions: Transaction[],
  field: "merchant_name" | "mcc" | "merchant_country" | "pos_entry_mode" | "acquirer" | "auth_source" | "card_id",
  ownValue: string
): number {
  return matchBaseline(field, ownValue, { transactions, logins: [], places: [] });
}

/** Scorecard raw score at the precision ml_anomaly's Decision shows (3dp). The
 *  score is bimodal (most rows sit near 1e-28), so a bare "0.000" would read as a
 *  stub zero; say "<0.001" instead. */
function formatModelScore(score: number): string {
  return score < 0.001 ? "<0.001" : score.toFixed(3);
}

export function AuthInspector({ tx, transactions, logins }: Props) {
  // Find the chronologically-preceding transaction on the same card.
  const prior = useMemo(() => {
    const sorted = transactions
      .filter((t) => t.card_id === tx.card_id && t.id !== tx.id)
      .sort((a, b) => a.timestamp.localeCompare(b.timestamp));
    let last: Transaction | undefined;
    for (const t of sorted) {
      if (t.timestamp >= tx.timestamp) break;
      last = t;
    }
    return last;
  }, [tx, transactions]);

  // 5 most recent at the same merchant - analyst sees the history with
  // this place at a glance.
  const recentAtMerchant = useMemo(() => {
    return transactions
      .filter((t) => t.merchant_name === tx.merchant_name && t.id !== tx.id)
      .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      .slice(0, 5);
  }, [tx, transactions]);

  const priorDistance = prior
    ? haversineMiles(
        [prior.merchant_lat, prior.merchant_lng],
        [tx.merchant_lat, tx.merchant_lng]
      )
    : null;
  const mgrs = toMgrs(tx.merchant_lat, tx.merchant_lng);
  const priorTimeMs = prior ? timeDeltaMs(prior.timestamp, tx.timestamp) : null;

  // 30d rolling baseline ending JUST BEFORE this transaction - shows
  // analysts what's typical for this card.
  const baseline = useMemo(
    () => computeBaseline(transactions, tx.card_id, tx.timestamp),
    [transactions, tx]
  );

  const pivotCounts = useMemo(() => {
    const ctx = { transactions, logins, places: [] };
    return {
      merchant_name: relatedEntities("merchant_name", tx.merchant_name, ctx).length,
      mcc: relatedEntities("mcc", tx.mcc, ctx).length,
      merchant_country: relatedEntities("merchant_country", tx.merchant_country, ctx).length,
      pos_entry_mode: relatedEntities("pos_entry_mode", tx.pos_entry_mode, ctx).length,
      acquirer: relatedEntities("acquirer", tx.acquirer, ctx).length,
      auth_source: relatedEntities("auth_source", tx.auth_source, ctx).length,
      card_id: relatedEntities("card_id", tx.card_id, ctx).length,
    };
  }, [tx, transactions, logins]);

  const pivotBaselines = useMemo(
    () => ({
      merchant_name: fieldBaseline(transactions, "merchant_name", tx.merchant_name),
      mcc: fieldBaseline(transactions, "mcc", tx.mcc),
      merchant_country: fieldBaseline(transactions, "merchant_country", tx.merchant_country),
      pos_entry_mode: fieldBaseline(transactions, "pos_entry_mode", tx.pos_entry_mode),
      acquirer: fieldBaseline(transactions, "acquirer", tx.acquirer),
      auth_source: fieldBaseline(transactions, "auth_source", tx.auth_source),
      card_id: fieldBaseline(transactions, "card_id", tx.card_id),
    }),
    [tx, transactions]
  );

  return (
    <>
      <InspectorSection title="Authorization">
        <InspectorField
          label="Amount"
          field="amount"
          value={`$${tx.amount.toFixed(2)}`}
          valueClass="text-[color:var(--r1-on-inspector)]"
        />
        <InspectorField
          label="Merchant"
          field="merchant_name"
          value={
            <>
              <span className="text-text">{tx.merchant_name}</span>
              <MatchBadge
                field="merchant_name"
                value={tx.merchant_name}
                count={pivotCounts.merchant_name}
                baseline={pivotBaselines.merchant_name}
              />
            </>
          }
        />
        <InspectorField
          label="Channel"
          field="is_card_present"
          value={tx.is_card_present ? "Card present" : "Card not present"}
        />
        <InspectorField
          label="MCC"
          field="mcc"
          value={
            <>
              <span className="text-text">{tx.mcc}</span>
              <MatchBadge
                field="mcc"
                value={tx.mcc}
                count={pivotCounts.mcc}
                baseline={pivotBaselines.mcc}
              />
              <span className="text-text"> · {tx.category}</span>
            </>
          }
        />
      </InspectorSection>

      <InspectorSection title="Timing">
        <InspectorField label="Posted" field="timestamp" value={formatTs(tx.timestamp)} />
        {priorTimeMs !== null && (
          <InspectorField
            label="Δ Prior Auth"
            field="derived_prior_auth"
            value={formatTimeDelta(priorTimeMs)}
          />
        )}
      </InspectorSection>

      <InspectorSection title="Location">
        <InspectorField
          label="Latitude, longitude"
          field="merchant_lat"
          value={`${tx.merchant_lat.toFixed(4)}, ${tx.merchant_lng.toFixed(4)}`}
        />
        {mgrs && <InspectorField label="MGRS" field="derived_mgrs" value={mgrs} />}
        <InspectorField
          label="Country"
          field="merchant_country"
          value={
            <>
              <span className="text-text">{tx.merchant_country}</span>
              <MatchBadge
                field="merchant_country"
                value={tx.merchant_country}
                count={pivotCounts.merchant_country}
                baseline={pivotBaselines.merchant_country}
              />
            </>
          }
        />
        {priorDistance !== null && (
          <InspectorField
            label="Δ Prior Geo"
            field="derived_prior_geo"
            value={`${priorDistance.toFixed(1)} mi`}
          />
        )}
      </InspectorSection>

      <InspectorSection title="Authorization details">
        <InspectorField
          label="Response"
          field="auth_response_code"
          value={`${tx.auth_response_code} · ${tx.auth_response_code === "00" ? "approved" : "declined"}`}
        />
        <InspectorField
          label="POS Entry"
          field="pos_entry_mode"
          value={
            <>
              <span className="text-text">
                {tx.pos_entry_mode.replace(/_/g, " ")}
              </span>
              <MatchBadge
                field="pos_entry_mode"
                value={tx.pos_entry_mode}
                count={pivotCounts.pos_entry_mode}
                baseline={pivotBaselines.pos_entry_mode}
              />
            </>
          }
        />
        <InspectorField label="NRN" field="network_ref_number" value={tx.network_ref_number} />
        <InspectorField
          label="Terminal"
          field="terminal_id"
          value={
            <>
              <span className="text-text">{tx.terminal_id}</span>
              <FieldMatchBadge
                field="terminal_id"
                value={tx.terminal_id}
                context={{ transactions, logins, places: [] }}
              />
            </>
          }
        />
        <InspectorField
          label="Acquirer"
          field="acquirer"
          value={
            <>
              <span className="text-text">{tx.acquirer}</span>
              <MatchBadge
                field="acquirer"
                value={tx.acquirer}
                count={pivotCounts.acquirer}
                baseline={pivotBaselines.acquirer}
              />
            </>
          }
        />
        <InspectorField
          label="Source"
          field="auth_source"
          value={
            <>
              <span className="text-text">{tx.auth_source.toUpperCase()}</span>
              <MatchBadge
                field="auth_source"
                value={tx.auth_source}
                count={pivotCounts.auth_source}
                baseline={pivotBaselines.auth_source}
              />
            </>
          }
        />
        {!tx.is_card_present && (
          <InspectorField label="3DS" field="is_3ds" value={tx.is_3ds ? "Yes" : "No"} />
        )}
        <InspectorField label="Currency" field="currency" value={tx.currency} />
      </InspectorSection>

      <InspectorSection
        title="Risk"
        trailing={
          <span
            className={`font-mono text-[10px] ${
              tx.risk_score >= 700
                ? "text-[color:var(--alarm-on-inspector)]"
                : tx.risk_score >= 400
                ? "text-[color:var(--r3-on-inspector)]"
                : "text-[color:var(--r1-on-inspector)]"
            }`}
          >
            {tx.risk_score} / 1000
          </span>
        }
      >
        <InspectorField
          label="Score"
          field="risk_score"
          value={tx.risk_score}
          valueClass={
            tx.risk_score >= 700
              ? "text-[color:var(--alarm-on-inspector)]"
              : tx.risk_score >= 400
              ? "text-[color:var(--r3-on-inspector)]"
              : "text-text"
          }
        />
        {/* The scorecard's own number, a separate provenance from the seeded Score
            above. Rank + raw score only: calibration is untested, so no "% fraud". */}
        {tx.ml_score != null && tx.ml_percentile != null && (
          <InspectorField
            label="Model"
            field="ml_score"
            value={`${tx.ml_percentile.toFixed(1)} pct · score ${formatModelScore(tx.ml_score)}`}
          />
        )}
        {tx.ml_score != null && tx.ml_percentile != null && tx.ml_model_version && (
          <InspectorField
            label="Model Version"
            field="ml_model_version"
            // The record's version alone: with the model's fixed name before it the value
            // wrapped onto a second line in the 260 px panel.
            value={tx.ml_model_version}
          />
        )}
      </InspectorSection>

      <InspectorSection title="Card">
        <InspectorField
          label="PAN"
          field="card_id"
          value={
            <>
              <span className="text-text">{`····${tx.card_id.slice(-4)}`}</span>
              <MatchBadge
                field="card_id"
                value={tx.card_id}
                count={pivotCounts.card_id}
                baseline={pivotBaselines.card_id}
              />
            </>
          }
        />
        <InspectorField label="Balance" field="balance_after" value={`$${tx.balance_after.toFixed(2)}`} />
      </InspectorSection>

      {baseline.avgDailyAuths > 0 && (
        <InspectorSection title="Baseline (30d)">
          <InspectorField
            label="Average spend a day"
            field="derived_avg_daily_spend"
            value={`$${baseline.avgDailySpend.toFixed(2)}`}
          />
          <InspectorField
            label="Average authorizations a day"
            field="derived_avg_daily_auths"
            value={baseline.avgDailyAuths.toFixed(1)}
          />
          {baseline.topMerchants.length > 0 && (
            <div className="pt-1">
              <div className="font-mono text-[9px] uppercase tracking-widest text-muted mb-0.5">
                Top Merchants
              </div>
              {baseline.topMerchants.map((m) => (
                <div
                  key={m.name}
                  className="py-0.5 flex items-baseline justify-between font-mono text-[10px]"
                >
                  <span className="text-text truncate">{m.name}</span>
                  <span className="text-muted">{m.count}×</span>
                </div>
              ))}
            </div>
          )}
        </InspectorSection>
      )}

      {recentAtMerchant.length > 0 && (
        <InspectorSection
          title="At this merchant"
          trailing={
            <span className="font-mono text-[9px] text-muted">
              {recentAtMerchant.length}
            </span>
          }
        >
          {recentAtMerchant.map((t) => (
            <div
              key={t.id}
              className="py-0.5 flex items-baseline justify-between font-mono text-[10px]"
            >
              <span className="text-[color:var(--text-faint-on-inspector)] truncate">
                {new Date(t.timestamp).toLocaleDateString("en-US", {
                  timeZone: HOU_TZ,
                  month: "short",
                  day: "numeric",
                })}
              </span>
              <span className="text-text">${t.amount.toFixed(2)}</span>
            </div>
          ))}
        </InspectorSection>
      )}
    </>
  );
}
