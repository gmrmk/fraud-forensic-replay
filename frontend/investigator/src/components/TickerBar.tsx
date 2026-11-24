/**
 * TickerBar - horizontal 36px strip above the Timeline. Shows ONE
 * event at a time, derived from the playhead position. Click body
 * to fire navigate(); arrow buttons step events.
 *
 * Schema-driven: consumes TickerItem[] from the stream layer
 * (lib/ticker-stream). Row content (palette dot, kind label, primary,
 * secondary) renders from the manifest node carried on each item,
 * never from hardcoded per-kind switches. A new scenario kind renders
 * free once its manifest node declares label/palette/primary/secondary.
 *
 * Architectural bridge note: useNavigation.navigate still accepts
 * EntityMatch (the seed-schema union), not the abstract item shape.
 * This component bridges by pairing item.kind with item.raw (the
 * intact original row) at navigate-call time. Kinds outside the union
 * fall through without firing navigate - deferred to a later
 * platform-readiness slice that teaches useNavigation the abstract
 * shape.
 *
 * Instrument-B: the shell is a <Panel material="instrument"> (lit
 * gradient + edge-light + grain) instead of the flat `bg-panel-bg border` HUD
 * strip; the prev/next steppers are FocusButtons. The bar stays SQUARE
 * (rounded-none). Labels stay Mono (this dense readout is the "/Mono" branch;
 * the entity-colored kind label and dot keep their inline style). The
 * breathing-pulse recolors from the risk-ramp + alarm tokens (index.css), so
 * fraud survives all 6 color modes.
 *
 * Phase 5 (L): the load-bearing `absolute bottom-[119px] left-3 right-3` offset
 * is gone. The ticker now rides the unified bottom-stack flex container in
 * App.tsx (attribution > ticker > timeline, anchored at bottom-0), so its
 * pixel position is the FLOW height of the stack, not a static magic number.
 * The bar fills the container width (the 12px gutters live on the container);
 * `h-9` (36px) keeps its measured height. A prior session lost this position by
 * dropping the offset WITHOUT the flex parent (see DOCTRINE-CATCHES 2026-05-28);
 * the container is the replacement anchor, not a regression.
 */
import { useMemo, type CSSProperties } from "react";
import { usePlayhead } from "../store/playhead";
import { useNavigation } from "../store/navigation";
import { useStoryInk } from "../store/kind-ink";
import type { TickerItem } from "../lib/ticker-stream";
import { Panel, FocusButton } from "./ui";

interface Props {
  items: TickerItem[];
}

// Built once: the ticker renders at every playhead tick, and an options object given to
// `toLocaleTimeString` can build a new formatter on each call (T1, BACKLOG item 20).
const TICKER_TIME = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Chicago",
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
});

function formatTickerTime(ms: number): string {
  if (!ms) return "";
  return TICKER_TIME.format(ms);
}

export function TickerBar({ items }: Props) {
  const playhead = usePlayhead((s) => s.playhead);
  const isPlaying = usePlayhead((s) => s.isPlaying);
  const navigate = useNavigation((s) => s.navigate);
  const ink = useStoryInk();

  // Parse each item's ISO ts once and sort chronologically; the playhead
  // comparison below needs Unix ms either way.
  const sorted = useMemo(
    () =>
      items
        .map((item) => ({ item, ms: Date.parse(item.ts) }))
        .sort((a, b) => a.ms - b.ms),
    [items],
  );

  const currentIndex = useMemo(() => {
    let idx = -1;
    for (let i = 0; i < sorted.length; i++) {
      if (sorted[i].ms <= playhead) idx = i;
      else break;
    }
    return idx;
  }, [sorted, playhead]);

  if (sorted.length === 0 || currentIndex < 0) return null;

  const current = sorted[currentIndex];

  // The dot + kind label recolor via the mode-aware --kind-token (set per kind
  // in index.css, inherited from the .event.kind-X row). The manifest palette
  // rides along as --kind-fallback so a kind without a .kind-X rule still shows
  // its declared color (the schema-agnostic guarantee in the header). Same
  // value for both, so one style object serves the dot and the label. A story's own kind reads its
  // colour for the live theme and mode; the declared palette is what stays where the resolver has
  // no entry (a kind that has a slot, which the .kind-X rule colours anyway).
  const kindStyle: CSSProperties = {};
  (kindStyle as Record<string, string>)["--kind-fallback"] =
    ink.get(current.item.node.kind)?.mark ?? current.item.node.palette;

  // Bridge: pair item.kind with item.raw to rehydrate the EntityMatch.
  // The stream layer passes raw rows through intact, so the cast
  // resolves to the same concrete object App fetched. Kinds outside
  // the union are a no-op until useNavigation accepts the abstract
  // entity shape.
  function navigateItem(item: TickerItem) {
    const raw = item.raw;
    if (item.kind === "auth") navigate({ kind: "auth", tx: raw as never });
    else if (item.kind === "fraud") navigate({ kind: "fraud", tx: raw as never });
    else if (item.kind === "login") navigate({ kind: "login", login: raw as never });
    else if (item.kind === "place") navigate({ kind: "place", place: raw as never });
    else if (item.kind === "account_event")
      navigate({ kind: "account_event", event: raw as never });
    else if (item.kind === "transfer")
      navigate({ kind: "transfer", transfer: raw as never });
    // Future kinds: no-op until useNavigation supports the abstract shape.
  }

  function stepBy(delta: number) {
    const newIdx = Math.max(0, Math.min(sorted.length - 1, currentIndex + delta));
    if (newIdx !== currentIndex) {
      // Spec § 3: arrow buttons step the playhead. navigate() seeks the
      // playhead to the entity timestamp itself (refactor 2026-05-28),
      // so every snap-to-node surface gets temporal sync for free.
      navigateItem(sorted[newIdx].item);
    }
  }

  return (
    <Panel
      material="instrument"
      className={`ticker z-10 flex items-stretch h-9 rounded-none${!isPlaying ? " paused" : ""}`}
    >
      <FocusButton
        variant="icon"
        title="Previous event"
        onClick={() => stepBy(-1)}
        className="w-9 text-muted hover:bg-accent/10 hover:text-accent border-r border-panel-border font-mono text-sm"
      >
        ←
      </FocusButton>
      <span className="now-label self-center px-3 font-mono text-[9px] uppercase tracking-widest border-r border-panel-border h-full flex items-center">
        {isPlaying ? "NOW" : "PAUSED"}
      </span>
      <div
        data-testid="ticker-event"
        onClick={() => navigateItem(current.item)}
        className={`event ticker-event-pulse kind-${current.item.kind} flex-1 min-w-0 flex items-center gap-3 px-4 cursor-pointer overflow-hidden hover:bg-accent/5`}
      >
        <span
          data-testid="ticker-kind-dot"
          className="ticker-kind-dot inline-block w-1.5 h-1.5 rounded-full flex-shrink-0"
          style={kindStyle}
        />
        <span
          className="ticker-kind-label font-mono text-[10px] tracking-widest flex-shrink-0"
          style={kindStyle}
        >
          {current.item.node.label.toUpperCase()}
        </span>
        <span className="font-mono text-[9px] text-[color:var(--ticker-status-on-panel)] tracking-widest flex-shrink-0">
          {formatTickerTime(current.ms)}
        </span>
        <span className="font-mono text-[11px] text-text flex-shrink-0">
          {current.item.primary}
        </span>
        <span className="font-mono text-[9px] text-muted tracking-widest flex-1 min-w-0 truncate">
          {current.item.secondary}
        </span>
        <span className="font-mono text-[9px] text-[color:var(--ticker-status-on-panel)] tracking-widest flex-shrink-0 pl-3 border-l border-panel-border">
          {currentIndex + 1} / {sorted.length}
        </span>
      </div>
      <FocusButton
        variant="icon"
        title="Next event"
        onClick={() => stepBy(1)}
        className="w-9 text-muted hover:bg-accent/10 hover:text-accent border-l border-panel-border font-mono text-sm"
      >
        →
      </FocusButton>
    </Panel>
  );
}
