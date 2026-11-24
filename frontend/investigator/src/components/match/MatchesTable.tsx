/**
 * MatchesTable - THE breakout surface (user-ratified 2026-06-11), one window,
 * two modes:
 *   field mode - dense table of all entities matching the active field=value
 *     (the ×N badge path; Variant A Inspector-mirror column per spec § 4).
 *   rule mode - the decision's authored brief card (terse boilerplate rendered
 *     VERBATIM from the scenario manifest, never generated) stacked above the
 *     decision's matched events; the full technical trace stays one link away
 *     in the DecisionConsole.
 * Opens when useMatches.active is set; renders nothing otherwise. Row click
 * fires navigate() (same primitive as ticker click); table stays open after.
 */
import { useEffect } from "react";
import { useMatches } from "../../store/matches";
import { useNavigation } from "../../store/navigation";
import { usePivotStore } from "../../store/pivot";
import { TRACE_WINDOW_DIMS } from "../../lib/window-dims";
import { chromeToWindowNow } from "../../store/text-size";
import { nextNonOverlappingPosition } from "../../lib/smart-position";
import { paletteForKind, type EntityKind as PaletteEntityKind } from "../../lib/entity-palette";
import { useStoryInk } from "../../store/kind-ink";
import { hexToRgba } from "../../theme/to-rgb";
import {
  relatedEntities,
  withExtraTransactions,
  type EntityMatch,
  type PivotContext,
} from "../../lib/matches";
import { useTerminalRows } from "./terminal-rows";
import { resolveEntityRef } from "../../lib/decision-entities";
import { actionColor, actionAlpha } from "../../lib/decisions";
import { DecisionPill } from "../DecisionPill";
import type { Decision } from "../../lib/decisions";

interface Props {
  context: PivotContext;
  decisions?: Decision[];
}

function fmtTime(iso: string): string {
  return new Date(iso).toLocaleTimeString("en-US", {
    timeZone: "America/Chicago",
    hour: "numeric", minute: "2-digit", hour12: true,
  });
}

function matchId(m: EntityMatch): string {
  return m.kind === "login" ? m.login.id
    : m.kind === "place" ? m.place.id
    : m.kind === "account_event" ? m.event.id
    : m.kind === "transfer" ? m.transfer.id
    : m.kind === "entity" ? m.entity.id
    : m.tx.id;
}

function matchTime(m: EntityMatch): string {
  return m.kind === "login" ? m.login.timestamp
    : m.kind === "place" ? ""
    : m.kind === "account_event" ? m.event.timestamp
    : m.kind === "transfer" ? m.transfer.timestamp
    : m.kind === "entity" ? (m.entity.timestamp > 0 ? new Date(m.entity.timestamp).toISOString() : "")
    : m.tx.timestamp;
}

function matchSessionId(m: EntityMatch): string | null {
  if (m.kind === "login") return m.login.session_id;
  if (m.kind === "account_event") return m.event.session_id;
  if (m.kind === "transfer") return m.transfer.session_id;
  return null;
}

/** The decision's matched events: every resolvable trigger entity, expanded to
 *  the full session thread when a trigger carries one. Deterministic walk of
 *  loaded data - the rule's own GROUP BY, rendered. */
function ruleMatches(decision: Decision, context: PivotContext): EntityMatch[] {
  const out = new Map<string, EntityMatch>();
  const triggers = decision.triggerEntityIds
    .map((id) => resolveEntityRef(id, context))
    .filter((m): m is EntityMatch => m !== null);
  for (const t of triggers) out.set(matchId(t), t);
  for (const t of triggers) {
    const sid = matchSessionId(t);
    if (!sid) continue;
    for (const m of relatedEntities("session_id", sid, context)) out.set(matchId(m), m);
  }
  return [...out.values()].sort((a, b) => matchTime(a).localeCompare(matchTime(b)));
}

export function MatchesTable({ context, decisions = [] }: Props) {
  const active = useMatches((s) => s.active);
  const close = useMatches((s) => s.close);
  const navigate = useNavigation((s) => s.navigate);
  const openTrace = usePivotStore((s) => s.openTrace);
  const ink = useStoryInk();

  // terminal_id is the one cross-card field: the focal case holds only its own
  // card's visits, so the rest of the terminal's rows are read on open.
  const terminalId = active?.mode === "field" && active.field === "terminal_id" ? active.value : null;
  const terminalRows = useTerminalRows((s) => (terminalId ? s.rows[terminalId] : undefined));
  const terminalStatus = useTerminalRows((s) => (terminalId ? s.status[terminalId] : undefined));
  const loadTerminal = useTerminalRows((s) => s.load);
  useEffect(() => {
    if (terminalId) loadTerminal(terminalId);
  }, [terminalId, loadTerminal]);

  /** Open the windowed trace positioned off the clicked control, dodging
   *  every screen-anchored workspace window already open. */
  const openTraceFrom = (decisionId: string, anchor: HTMLElement) => {
    const origin = anchor.getBoundingClientRect();
    openTrace(
      decisionId,
      nextNonOverlappingPosition({
        origin: { x: origin.left, y: origin.top, width: origin.width, height: origin.height },
        // The estimates are the chrome's pixels; the placement is in window pixels.
        size: { width: chromeToWindowNow(TRACE_WINDOW_DIMS.width), height: chromeToWindowNow(TRACE_WINDOW_DIMS.height) },
        existing: usePivotStore.getState().windows
          .filter((w) => w.anchor.type === "screen")
          .map((w) => ({
            x: (w.anchor as { x: number }).x, y: (w.anchor as { y: number }).y,
            width: chromeToWindowNow(TRACE_WINDOW_DIMS.width), height: chromeToWindowNow(TRACE_WINDOW_DIMS.height),
          })),
        viewport: { x: 0, y: 0, width: window.innerWidth, height: window.innerHeight },
      })
    );
  };

  if (!active) return null;

  const renderRow = (m: EntityMatch, i: number, showCard = false) => {
    const id = matchId(m);
    const kindLabel =
      m.kind === "fraud" ? "FRAUD"
      : m.kind === "login" ? "LOGIN"
      : m.kind === "account_event" ? "PROFILE"
      : m.kind === "transfer" ? "TRANSFER"
      : m.kind === "place" ? "PLACE"
      : m.kind === "entity" ? m.entity.kind.toUpperCase()
      : "AUTH";
    if (m.kind === "auth" || m.kind === "fraud") {
      const t = m.tx;
      const kindColorClass = m.kind === "fraud" ? "text-signal" : "text-accent";
      // Stacked 2-line card (Variant A per spec § 4). Line 1: KIND ·
      // time · merchant. Line 2: $amount · risk · source · acquirer.
      // NRN + Terminal dropped from cells - still surfaced + pivotable
      // via Inspector's Card-Network section.
      return (
        <div
          key={`${id}-${i}`}
          role="button"
          tabIndex={0}
          onClick={() => navigate(m)}
          onKeyDown={(e) => {
            if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
              e.preventDefault();
              navigate(m);
            }
          }}
          className="flex flex-col gap-1 px-3 py-2.5 border-b border-panel-border/60 last:border-0 cursor-pointer hover:bg-accent/5 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
        >
          <div className="flex items-baseline gap-2 font-mono min-w-0">
            <span className={`text-[9px] tracking-widest flex-shrink-0 ${kindColorClass}`}>{kindLabel}</span>
            <span className="text-[9px] text-dim tracking-wide flex-shrink-0">{fmtTime(t.timestamp)}</span>
            {showCard && (
              <span className="text-muted text-[9px] tracking-wide flex-shrink-0">{`·${t.card_id.slice(-4)}`}</span>
            )}
            <span className="text-text text-[11px] flex-1 min-w-0 truncate">{t.merchant_name}</span>
          </div>
          <div className="flex items-baseline gap-2.5 font-mono min-w-0">
            <span className="text-text text-[10px] font-semibold flex-shrink-0">${t.amount.toFixed(2)}</span>
            <span className={`text-[9px] font-semibold flex-shrink-0 ${t.risk_score >= 700 ? "text-signal" : "text-text"}`}>{t.risk_score}</span>
            <span className={`text-[9px] tracking-wide flex-shrink-0 ${t.auth_source === "stip" ? "text-signal" : "text-muted"}`}>{t.auth_source}</span>
            <span className="text-muted text-[9px] flex-1 min-w-0 truncate text-right">{t.acquirer}</span>
          </div>
        </div>
      );
    }
    // Login / place / behavioral row - two lines like the tx rows (time on
    // line 1, detail on line 2). Enriched 2026-06-11: the single-line
    // three-token summary read as "sparse" next to the inspector's detail.
    const primary =
      m.kind === "login" ? m.login.device_fp
      : m.kind === "account_event" ? m.event.kind
      : m.kind === "transfer" ? `$${m.transfer.amount.toFixed(2)} ${m.transfer.rail}`
      : m.kind === "entity" ? m.entity.displayMetadata.primaryLabel
      : m.place.name;
    const secondary =
      m.kind === "login" ? m.login.outcome
      : m.kind === "account_event" ? (m.event.field ?? "")
      : m.kind === "transfer" ? m.transfer.status
      : m.kind === "entity" ? m.entity.displayMetadata.secondaryLabel
      : m.place.category;
    const ts = matchTime(m);
    return (
      <div
        key={`${id}-${i}`}
        role="button"
        tabIndex={0}
        onClick={() => navigate(m)}
        onKeyDown={(e) => {
          if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            navigate(m);
          }
        }}
        className="flex flex-col gap-1 px-3 py-2.5 border-b border-panel-border/60 last:border-0 cursor-pointer hover:bg-accent/5 font-mono focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
      >
        <div className="flex items-baseline gap-2 min-w-0">
          <span
            className={`text-[9px] tracking-widest flex-shrink-0 ${
              m.kind === "login" ? "text-identity"
              : (m.kind === "account_event" && m.event.is_fraud) ||
                (m.kind === "transfer" && m.transfer.is_fraud) ? "text-signal"
              : "text-muted"
            }`}
            style={
              m.kind === "entity"
                ? { color: ink.get(m.entity.kind)?.mark ?? paletteForKind(m.entity.kind).hex }
                : undefined
            }
          >{kindLabel}</span>
          {ts !== "" && (
            <span className="text-[9px] text-dim tracking-wide flex-shrink-0">{fmtTime(ts)}</span>
          )}
          <span className="text-text text-[11px] flex-1 min-w-0 truncate">{primary}</span>
        </div>
        <div className="flex items-baseline gap-2.5 min-w-0">
          <span className="text-muted text-[10px] flex-1 min-w-0 truncate">{secondary}</span>
        </div>
      </div>
    );
  };

  if (active.mode === "rule") {
    const decision = decisions.find((d) => d.id === active.decisionId);
    if (!decision) return null;
    // The rule-mode accent rides the mode-aware action tokens. The old
    // `${accent}66` hex-alpha trick is gone (a CSS var has no hex tail); the
    // translucent borders/shadow use actionAlpha (rgb(var(--slot-rgb) / a)), so
    // the breakout recolors across all 6 color modes with the verdict.
    const action = decision.decision;
    const accent = actionColor(action);
    const matches = ruleMatches(decision, context);
    return (
      <div
        className="chrome-zoom absolute top-3 left-3 z-30 border bg-panel-bg flex flex-col"
        style={{
          width: 320,
          bottom: "calc(var(--bottom-stack-c) + 7px)", // clears the unified bottom stack (--bottom-stack-c is its height in the chrome's pixels)
          borderColor: actionAlpha(action, 0.4),
          borderTopWidth: 2,
          borderTopColor: accent,
          boxShadow: `0 6px 24px ${actionAlpha(action, 0.1)}`,
        }}
        role="region"
        aria-label="Matches workspace"
      >
        <div className="px-4 py-2.5 border-b flex items-baseline justify-between" style={{ borderBottomColor: actionAlpha(action, 0.2) }}>
          <span className="font-mono text-[11px] uppercase tracking-ultra" style={{ color: accent }}>
            MATCHES <span className="text-muted">· RULE</span>
          </span>
          <button
            type="button"
            onClick={close}
            aria-label="Close matches"
            className="font-mono text-sm leading-none text-muted hover:text-text px-2"
          >
            ×
          </button>
        </div>
        <div className="px-4 pt-3 pb-4 border-b border-panel-border">
          <div className="flex items-center justify-between gap-2 mb-3">
            <DecisionPill
              decision={decision}
              actionLabel="View rule description."
              onClick={(ev) => {
                close();
                openTraceFrom(decision.id, ev.currentTarget);
              }}
            />
          </div>
          <div className="font-mono text-[9px] uppercase tracking-widest text-muted mb-1.5">
            Why this fired
          </div>
          {/* The brief is authored rule boilerplate from the scenario manifest,
              rendered verbatim - identical for every firing, no interpolation. */}
          <p className="text-[13px] leading-relaxed text-text/90 m-0">
            {decision.rule.sop?.brief ?? decision.rule.sop?.what ?? ""}
          </p>
          <div className="mt-3 text-right">
            <button
              type="button"
              onClick={(ev) => {
                // The trace replaces the breakout (spec §3). Floating evidence
                // paints over the docked breakout regardless - the windows
                // layer mounts later at equal z-30 (see PivotWindowsLayer's
                // z-authority note) - so this close() is UX, not z-defense.
                close();
                openTraceFrom(decision.id, ev.currentTarget);
              }}
              className="font-mono text-[9px] uppercase tracking-widest text-muted hover:text-text transition"
            >
              VIEW RULE DESCRIPTION ▸
            </button>
          </div>
        </div>
        <div className="px-3 py-1 border-b border-panel-border bg-black/30 font-mono text-[9px] uppercase tracking-widest text-muted">
          {matches.length} matched {matches.length === 1 ? "event" : "events"}
        </div>
        <div className="flex-1 overflow-y-auto">{matches.map((m, i) => renderRow(m, i))}</div>
      </div>
    );
  }

  const matches = relatedEntities(
    active.field,
    active.value,
    terminalRows ? withExtraTransactions(context, terminalRows) : context
  );
  const today = paletteForKind(active.parentKind as PaletteEntityKind);
  // A story's own kind tints the header with its colour for the live theme and mode; the classes and
  // every other kind keep the palette they have.
  const own = ink.get(active.parentKind)?.mark;
  const palette = own
    ? { ...today, hex: own, headerBgRgba: hexToRgba(own, 0.05), headerDividerRgba: hexToRgba(own, 0.2) }
    : today;
  const showCard =
    new Set(matches.flatMap((m) => (m.kind === "auth" || m.kind === "fraud" ? [m.tx.card_id] : []))).size > 1;

  return (
    <div
      className={`chrome-zoom absolute top-3 left-3 z-30 border ${palette.borderClass} bg-panel-bg flex flex-col`}
      style={{
        width: 320,                  // Inspector-mirror column (Variant A per spec § 4)
        bottom: "calc(var(--bottom-stack-c) + 7px)", // clears the unified bottom stack (--bottom-stack-c is its height in the chrome's pixels)
        boxShadow: `0 6px 24px ${palette.hex}1a`,
      }}
      role="region"
      aria-label="Matches workspace"
    >
      <div
        className="px-4 py-2.5 border-b flex items-baseline justify-between"
        style={{
          borderBottomColor: palette.headerDividerRgba,
          backgroundColor: palette.headerBgRgba,
        }}
      >
        <span className={`font-mono text-[11px] uppercase tracking-ultra ${palette.textClass}`}>
          MATCHES · {active.value} <span className="text-muted">· {active.field}</span>
        </span>
        <button
          type="button"
          role="button"
          onClick={close}
          aria-label="Close matches"
          className="font-mono text-sm leading-none text-muted hover:text-text px-2"
        >
          ×
        </button>
      </div>
      <div className="px-3 py-1 border-b border-panel-border bg-black/30 font-mono text-[9px] uppercase tracking-widest text-muted">
        {matches.length} {matches.length === 1 ? "match" : "matches"}
        {terminalId &&
          ` · ${terminalStatus === "ok" ? "all cards" : terminalStatus === "error" ? "all cards unavailable" : "loading all cards"}`}
      </div>
      <div className="flex-1 overflow-y-auto">{matches.map((m, i) => renderRow(m, i, showCard))}</div>
    </div>
  );
}
