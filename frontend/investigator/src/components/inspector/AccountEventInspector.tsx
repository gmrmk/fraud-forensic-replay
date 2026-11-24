import { InspectorSection } from "./InspectorSection";
import { InspectorField } from "./InspectorField";
import { SessionField } from "./SessionField";
import type { AccountEvent } from "../../types";

interface Props {
  event: AccountEvent;
}

const HOU_TZ = "America/Chicago";

/** Mask the local part of an address-like value: investigators read the DELTA
 *  (old → new), not the PII. p•••@tealmoor.example → p•••@sentrypine.example is the story. */
function mask(value: string | null): string {
  if (!value) return "-";
  const at = value.indexOf("@");
  if (at <= 1) return value;
  return `${value[0]}•••${value.slice(at)}`;
}

/** Behavioral kill-chain event: an email/phone/password change or a payee add.
 *  No geography on purpose - the globe shows nothing for an account takeover;
 *  the evidence is the delta and the session thread. */
export function AccountEventInspector({ event }: Props) {
  const when = new Date(event.timestamp).toLocaleString("en-US", {
    timeZone: HOU_TZ,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  // No Status row on purpose: an account event has no status column, so a status here would
  // state something the data does not hold.
  return (
    <>
      <InspectorSection title={event.kind === "profile_change" ? "Profile change" : "Payee added"}>
        <InspectorField label="When" field="timestamp" value={when} />
        {event.kind === "profile_change" ? (
          <>
            <InspectorField label="Field" field="field" value={event.field ?? "-"} />
            <div className="py-0.5 font-mono text-[10px]">
              <span className="text-[color:var(--text-faint-on-inspector)]">{mask(event.old_value)}</span>
              <span className="text-[#ffb347] mx-1.5">→</span>
              <span className="text-text">{mask(event.new_value)}</span>
            </div>
          </>
        ) : (
          <InspectorField label="Payee" field="payee_id" value={event.payee_id ?? "-"} />
        )}
        <SessionField sessionId={event.session_id} />
      </InspectorSection>
    </>
  );
}
