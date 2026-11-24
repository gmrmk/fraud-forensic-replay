import { useLayers } from "../store/layers";
import { useSchema } from "../store/schema";
import { useStoryInk } from "../store/kind-ink";
import { kindOnPanelVar, paletteForKind } from "../lib/entity-palette";
import { KIND_SLOT } from "../theme/entity-mapping";
import { LayerSwitch, useOnMenu } from "./LayerRow";
import { PathButtons } from "./paths/PathButtons";
import { YourPaths } from "./paths/YourPaths";
import { useMarksStore } from "../store/marks";
import type { LoginEvent, Transaction, Transfer } from "../types";

/**
 * The path kinds a case offers, in the store's order.
 *
 * The toggles derive from the manifest path kinds (the pathKinds store keys) rather than
 * a hardcoded list, so any coord-bearing kind a future scenario ingests gets a toggle. Transfer
 * and fraud are both data-gated: transfer's arc is coordless by design (it surfaces only when the
 * scenario carries transfers); fraud defaults ON in the store but must not render lit with no arc
 * behind it when the scenario has no fraud entities (e.g. priya-ato). Fraud reads the
 * same is_fraud flag the fraud/auth split and the ticker use. Auth and login need their data too.
 */
// eslint-disable-next-line react-refresh/only-export-components -- a pure rule kept beside the one panel that renders its result
export function offeredPathKinds(
  pathKinds: Record<string, boolean>,
  data: {
    transactions: readonly Transaction[];
    logins: readonly LoginEvent[];
    transfers: readonly Transfer[];
  },
): string[] {
  const hasFraud = data.transactions.some((t) => t.is_fraud);
  return Object.keys(pathKinds)
    .filter((kind) => kind !== "transfer" || data.transfers.length > 0)
    .filter((kind) => kind !== "fraud" || hasFraud)
    .filter((kind) => kind !== "auth" || data.transactions.length > 0)
    .filter((kind) => kind !== "login" || data.logins.length > 0);
}

/**
 * PathPanel - the Paths menu: one switch row per offered path kind, no counts. A row reads the
 * label the manifest gives the kind (the menu's own name supplies the word "path"); a kind the
 * manifest does not declare shows its kind with spaces for underscores. With no kind on offer
 * and no path of the investigator's, the panel says so in one line, so the Paths button always has
 * something to open. Below the data's rows come the investigator's own paths (Your paths, under a
 * hairline when a data row is above) and, under a hairline, the path buttons.
 */
export function PathPanel({ kinds }: { kinds: string[] }) {
  const pathKinds = useLayers((s) => s.pathKinds);
  const togglePath = useLayers((s) => s.togglePath);
  const nodes = useSchema((s) => s.nodes);
  const onMenu = useOnMenu();
  const ink = useStoryInk();
  const hasSavedPath = useMarksStore((s) => s.paths.length > 0);
  const hairline = <div role="separator" className="my-1.5" style={{ borderTop: "1px solid var(--hairline)" }} />;
  return (
    <div className="flex flex-col">
      {kinds.length === 0 && !hasSavedPath ? (
        <div className="py-1 text-[10px] tracking-widest text-dim">No paths in this case</div>
      ) : null}
      {kinds.map((kind) => {
        const label = nodes.find((n) => n.kind === kind)?.label ?? kind.replace(/_/g, " ");
        // As the map draws the path: a slotted kind in its theme and colour-mode slot, here its
        // on-panel shade; any other kind in its node colour, here stepped to read on the menu.
        const color =
          kind in KIND_SLOT ? `var(${kindOnPanelVar(kind)})` : onMenu(ink.get(kind)?.mark ?? paletteForKind(kind).hex);
        return (
          <LayerSwitch
            key={kind}
            label={label}
            name={`${label} path`}
            on={pathKinds[kind]}
            onToggle={() => togglePath(kind)}
            color={color}
          />
        );
      })}
      {kinds.length > 0 && hasSavedPath ? hairline : null}
      <YourPaths />
      {hairline}
      <PathButtons />
    </div>
  );
}
