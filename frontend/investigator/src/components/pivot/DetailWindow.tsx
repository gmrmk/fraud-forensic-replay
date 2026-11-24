import { WindowFrame } from "./WindowFrame";
import { TargetButton } from "../target/TargetButton";
import { paletteFor } from "../../lib/entity-palette";
import { echoSelection } from "../../lib/selection-echo";
import { entityLngLat } from "../../lib/node-anchor";
import { useSchema } from "../../store/schema";
import { useTheme } from "../../store/theme";
import { useStoryInk } from "../../store/kind-ink";
import { windowKindColours } from "../../lib/window-ink";
import { SectionRows } from "../inspector/ManifestFieldsSection";
import { NotesBody } from "../verdict/NotesBody";
import { PileBody } from "../verdict/PileBody";
import { TONE_STYLE } from "../verdict/tone-style";
import { decisionOf } from "../../lib/verdicts";
import type { DetailWindowState, PopoutView } from "../../store/pivot";
import type { EntityMatch } from "../../lib/matches";
import type { Entity } from "../../lib/entity";

interface Props {
  window: DetailWindowState;
  /** Layer-computed screen position (projection-aware for flagged). */
  screenPos?: { x: number; y: number };
  /** Entity ahead of the playhead (layer-computed). */
  dimmed?: boolean;
  onToggleFlag?: () => void;
  onDragTo?: (x: number, y: number) => void;
  /** The case's manifest entities by kind (a pile popout lists its members from them). */
  byKind?: Record<string, readonly Entity[]>;
}

function shortName(e: EntityMatch): string {
  switch (e.kind) {
    case "auth":
    case "fraud": return e.tx.merchant_name;
    case "login": return e.login.device_fp;
    case "place": return e.place.name;
    case "account_event": return e.event.kind.replace("_", " ");
    case "transfer": return `${e.transfer.rail} · ${e.transfer.payee_id}`;
    case "entity": return e.entity.displayMetadata.primaryLabel;
  }
}

/** A popout title leads with the entity id and the view: the 9px header truncates at about 22
 *  characters, and popouts at a shared pin must stay tellable apart when collapsed. A primary
 *  label that itself leads with the id (a primary of "${id} · ${reason}") drops that lead. */
function popoutTitle(entity: Entity, view: PopoutView): string {
  if (view.type === "pile") return view.label; // a list of records: its anchor's id would mislead
  const { primaryLabel, secondaryLabel } = entity.displayMetadata;
  const lead = `${entity.id} · `;
  const tail =
    primaryLabel === entity.id ? secondaryLabel
    : primaryLabel.startsWith(lead) ? primaryLabel.slice(lead.length)
    : primaryLabel;
  return [entity.id, view.label, tail].filter(Boolean).join(" · ");
}

const HINT_ROW =
  "font-mono text-[9px] text-[color:var(--text-faint)] tracking-[0.18em] uppercase mt-2 pt-1.5 border-t border-panel-border hover:text-[color:var(--text-muted)] cursor-pointer text-left w-full";

function Body({ e }: { e: EntityMatch }) {
  const line = "font-mono text-[10px] text-[color:var(--text)] truncate";
  const sub = "font-mono text-[10px] text-[color:var(--text-faint)]";
  switch (e.kind) {
    case "auth":
    case "fraud":
      return (
        <>
          <div className={`font-mono text-[13px] font-bold leading-tight ${e.kind === "fraud" ? "text-[color:var(--alarm)]" : "text-[color:var(--r1-on-panel)]"}`}>
            ${e.tx.amount.toFixed(2)}
          </div>
          <div className={line}>{e.tx.merchant_name} · {e.tx.merchant_country}</div>
          <div className={sub}>RISK {e.tx.risk_score} · {e.tx.auth_source}</div>
        </>
      );
    case "login":
      return (
        <>
          <div className="font-mono text-[12px] font-bold leading-tight text-[color:var(--r2-on-panel)]">{e.login.outcome}</div>
          <div className={line}>{e.login.device_fp}</div>
          <div className={sub}>{e.login.ip_asn} · rep {e.login.ip_reputation}</div>
        </>
      );
    case "place":
      return (
        <>
          <div className="font-mono text-[12px] font-bold leading-tight text-[color:var(--text-muted)]">{e.place.name}</div>
          <div className={line}>{e.place.category}</div>
          <div className={sub}>{e.place.lat.toFixed(3)}, {e.place.lng.toFixed(3)}</div>
        </>
      );
    case "account_event":
      return (
        <>
          <div className="font-mono text-[12px] font-bold leading-tight text-[color:var(--r3-on-panel)]">{e.event.kind.replace("_", " ").toUpperCase()}</div>
          <div className={line}>{e.event.field ?? e.event.payee_id ?? "account change"}</div>
          <div className={sub}>session {e.event.session_id}</div>
        </>
      );
    case "transfer":
      return (
        <>
          <div className="font-mono text-[13px] font-bold leading-tight text-[color:var(--r1-on-panel)]">${e.transfer.amount.toFixed(2)}</div>
          <div className={line}>{e.transfer.rail} · {e.transfer.status}</div>
          <div className={sub}>payee {e.transfer.payee_id}</div>
        </>
      );
    case "entity":
      return (
        <>
          <div className="font-mono text-[12px] font-bold leading-tight text-[color:var(--text)]">{e.entity.kind.toUpperCase()}</div>
          <div className={line}>{e.entity.displayMetadata.primaryLabel}</div>
          <div className={sub}>{e.entity.displayMetadata.secondaryLabel}</div>
        </>
      );
  }
}

const NOT_IN_PACK = "font-mono text-[10px] text-[color:var(--text-faint)]";

interface PopoutBodyProps {
  entity: Entity;
  view: PopoutView;
  byKind: Record<string, readonly Entity[]>;
  /** The popout's pin, where a pile's rows tether the notes they open. */
  at?: { lng: number; lat: number };
}

function PopoutBody({ entity, view, byKind, at }: PopoutBodyProps) {
  const node = useSchema((s) => s.nodeFor(entity.kind));
  if (view.type === "notes") return node ? <NotesBody entity={entity} node={node} /> : <div className={NOT_IN_PACK}>This scenario has no notes.</div>;
  if (view.type === "pile") return <PileBody memberIds={view.memberIds} byKind={byKind} at={at} />;
  const section = node?.sections?.find((s) => s.id === view.sectionId);
  // The active pack no longer declares this section (scenario switched): say so, invent nothing.
  if (!node || !section) return <div className={NOT_IN_PACK}>This scenario has no such section.</div>;
  return <SectionRows entity={entity} node={node} fields={section.fields} />;
}

export function DetailWindow({ window: w, screenPos, dimmed, onToggleFlag, onDragTo, byKind }: Props) {
  const e = w.entity;
  const popout = w.view && e.kind === "entity" ? { view: w.view, entity: e.entity } : null;
  const palette = paletteFor(e);
  const theme = useTheme((s) => s.theme);
  const color = useTheme((s) => s.color);
  const ink = useStoryInk();
  const kc = windowKindColours(e.kind === "entity" ? e.entity.kind : e.kind, theme, color, ink, palette.hex);
  const node = useSchema((s) => (popout ? s.nodeFor(popout.entity.kind) : undefined));
  const decision = popout && node ? decisionOf(popout.entity, node) : null;
  // A decision's window wears its verdict's colour, not the decision layer's red (a PASSED note
  // read as FAIL); a pile mixes verdicts, so its frame stays neutral and its capsules carry them.
  const accent =
    popout?.view.type === "pile" ? "var(--text-muted)"
    : decision ? TONE_STYLE[decision.tone].text
    : kc.line;
  const pos =
    screenPos ?? (w.anchor.type === "screen" ? { x: w.anchor.x, y: w.anchor.y } : { x: 0, y: 0 });
  return (
    <WindowFrame
      id={w.id}
      title={popout ? popoutTitle(popout.entity, popout.view) : `Detail · ${shortName(e)}`}
      anchorScreen={pos}
      z={w.z}
      accent={accent}
      titleColor={popout?.view.type === "pile" || decision ? undefined : kc.title}
      pinned={w.pinned}
      collapsed={w.collapsed}
      flagged={w.anchor.type === "node"}
      canFlag={entityLngLat(e) !== null}
      dimmed={dimmed}
      onToggleFlag={onToggleFlag}
      onDragTo={onDragTo}
      headerLeading={<TargetButton entity={e} variant="chrome" />}
      wide={popout !== null}
    >
      {popout ? (
        <PopoutBody
          entity={popout.entity}
          view={popout.view}
          byKind={byKind ?? {}}
          at={w.anchor.type === "node" ? w.anchor.lngLat : undefined}
        />
      ) : <Body e={e} />}
      <button type="button" className={HINT_ROW} aria-label="Open in full inspector" onClick={() => echoSelection(e)}>
        Tap for full inspector
      </button>
    </WindowFrame>
  );
}
