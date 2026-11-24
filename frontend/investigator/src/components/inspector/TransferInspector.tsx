import { InspectorSection } from "./InspectorSection";
import { InspectorField } from "./InspectorField";
import { SessionField } from "./SessionField";
import type { Transfer } from "../../types";

interface Props {
  transfer: Transfer;
}

const HOU_TZ = "America/Chicago";

export function TransferInspector({ transfer }: Props) {
  const when = new Date(transfer.timestamp).toLocaleString("en-US", {
    timeZone: HOU_TZ,
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
  const blocked = transfer.status === "blocked";
  return (
    <InspectorSection title={`${transfer.rail === "wire" ? "Wire" : "Tamsinmere"} transfer`}>
      <InspectorField label="When" field="timestamp" value={when} />
      <InspectorField label="Amount" field="amount" value={`$${transfer.amount.toFixed(2)}`} />
      <InspectorField label="Payee" field="payee_id" value={transfer.payee_id} />
      <InspectorField
        label="Status"
        field="status"
        value={
          blocked ? (
            <span className="px-1.5 py-px text-[9px] font-semibold tracking-wider text-[#0b0608] bg-signal rounded-full">
              BLOCKED · {(transfer.decline_reason ?? "declined").replace(/_/g, " ").toUpperCase()}
            </span>
          ) : (
            transfer.status
          )
        }
      />
      <SessionField sessionId={transfer.session_id} />
    </InspectorSection>
  );
}
