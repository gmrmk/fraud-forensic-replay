import type { Ref } from "react";
import { MapCredit } from "./MapCredit";
import { TickerBar } from "./TickerBar";
import { Timeline } from "./Timeline";
import type { TickerItem } from "../lib/ticker-stream";
import type { Entity } from "../lib/entity";
import type { ScenarioAnnotation } from "../lib/scenarios";
import type { AccountEvent, LoginEvent, Transaction, Transfer } from "../types";

interface Props {
  /** App-owned ResizeObserver ref - App keeps publishing --bottom-stack-h;
   *  this component only hosts the measured element. */
  stackRef: Ref<HTMLDivElement>;
  tickerItems: TickerItem[];
  transactions: Transaction[];
  logins: LoginEvent[];
  accountEvents: AccountEvent[];
  transfers: Transfer[];
  genericEntities: Entity[];
  annotations: ScenarioAnnotation[];
}

/** Unified case-mode bottom-stack (Phase 5 L): attribution > ticker > timeline
 *  ride ONE bottom-0 flex column so they reflow together off the Timeline's
 *  natural height - no hand-tuned per-element `bottom-[...]` offsets. The
 *  12px side gutters (left-3/right-3) live here so each child fills the
 *  inset width (preserving the ticker's left=12/right=1268). The Timeline
 *  keeps the 12px bottom gutter as its own mb-3, so the column's measured
 *  height (published as --bottom-stack-h) lands the ticker at the same
 *  distFromBottom=119 it held under the old absolute offsets.
 *  (Extracted verbatim from App.tsx for its line cap.) */
export function CaseBottomStack({
  stackRef,
  tickerItems,
  transactions,
  logins,
  accountEvents,
  transfers,
  genericEntities,
  annotations,
}: Props) {
  return (
    // z-30 only while the speed menu is open, so it clears the z-20 Inspector; detail
    // windows start at z-20 and must keep painting above the timeline at rest.
    <div
      ref={stackRef}
      className="absolute bottom-0 left-3 right-3 z-10 has-[[aria-haspopup][aria-expanded=true]]:z-30 flex flex-col"
    >
      {/* The shell above is measured and placed in window pixels, so it is not zoomed; the
          content is (design 2026-11-19-text-size.md, section 5). Its height, which App
          publishes as --bottom-stack-h, is therefore the drawn height at any text size. */}
      <div className="chrome-zoom flex flex-col">
        <MapCredit />

        {/* TickerBar - event strip just above the Timeline, schema-driven. */}
        <TickerBar items={tickerItems} />

        {/* Bottom: timeline strip with scrubber + controls. */}
        <Timeline
          transactions={transactions}
          logins={logins}
          accountEvents={accountEvents}
          transfers={transfers}
          genericEntities={genericEntities}
          annotations={annotations}
        />
      </div>
    </div>
  );
}
