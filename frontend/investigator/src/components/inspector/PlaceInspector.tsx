import { useMemo } from "react";
import { InspectorSection } from "./InspectorSection";
import { InspectorField } from "./InspectorField";
import { haversineMiles } from "../../lib/entities";
import type { Place, Transaction } from "../../types";

interface Props {
  place: Place;
  transactions: Transaction[];
}

const HOU_TZ = "America/Chicago";

/** Match transactions to a place by proximity (< 0.25 mi). Strict name
 *  matching is too brittle since Faker placeholder names don't equal
 *  Places feed names. */
function nearbyTransactions(
  place: Place,
  transactions: Transaction[],
  maxMiles = 0.25
): Transaction[] {
  return transactions
    .filter(
      (t) =>
        haversineMiles(
          [place.lat, place.lng],
          [t.merchant_lat, t.merchant_lng]
        ) < maxMiles
    )
    .sort((a, b) => b.timestamp.localeCompare(a.timestamp))
    .slice(0, 5);
}

export function PlaceInspector({ place, transactions }: Props) {
  const matches = useMemo(
    () => nearbyTransactions(place, transactions),
    [place, transactions]
  );

  return (
    <>
      <InspectorSection title="Place (Context)">
        <InspectorField label="Name" field="name" value={place.name} />
        <InspectorField label="Category" field="category" value={place.category} />
        <InspectorField
          label="Location"
          field="lat"
          value={`${place.lat.toFixed(4)}, ${place.lng.toFixed(4)}`}
        />
        <InspectorField label="Source" field="derived_place_source" value="Places feed (cached)" />
      </InspectorSection>

      <InspectorSection
        title="Authorizations within 0.25 miles"
        trailing={
          <span className="font-mono text-[9px] text-muted">
            {matches.length}
          </span>
        }
      >
        {matches.length === 0 ? (
          <div className="font-mono text-[10px] text-[color:var(--text-faint-on-inspector)] py-0.5">Nearby authorizations: none</div>
        ) : (
          matches.map((t) => (
            <div
              key={t.id}
              className="py-0.5 flex items-baseline justify-between font-mono text-[10px]"
            >
              <span className="flex items-baseline gap-1 min-w-0 truncate">
                <span className="text-[color:var(--text-faint-on-inspector)] truncate">
                  {new Date(t.timestamp).toLocaleDateString("en-US", {
                    timeZone: HOU_TZ,
                    month: "short",
                    day: "numeric",
                  })}
                </span>
                {!!t.is_fraud && (
                  <span className="text-[8px] font-semibold tracking-wider text-[color:var(--alarm-on-inspector)] flex-shrink-0">
                    FRAUD
                  </span>
                )}
              </span>
              <span className={t.is_fraud ? "text-[color:var(--alarm-on-inspector)]" : "text-text"}>
                ${t.amount.toFixed(2)}
              </span>
            </div>
          ))
        )}
      </InspectorSection>
    </>
  );
}
