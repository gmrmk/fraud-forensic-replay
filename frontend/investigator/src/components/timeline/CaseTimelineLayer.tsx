/**
 * CaseTimelineLayer - the case-mode data overlay that plugs into TimelineShell's
 * track slot (TimelineShell split, item P). It owns everything case-specific that
 * rides the shared frame: the ambient F2 density gradient, the dwell-gap bracket,
 * the kill-chain elapsed chips, the customer-reported annotation diamonds, the
 * per-kind lane lines, the TransferPathOverlay, the event dots (with all halos /
 * rings), and the hover tooltip - plus the f2 / story / eventTicks / prominence
 * memos, all case-derived.
 *
 * Pure-move note (Phase 1): the memos and JSX are lifted verbatim from the old
 * Timeline.tsx. The layer mounts FIRST inside the shell's track, so the shell's
 * base line / fill / day ticks / chevrons / handle paint OVER it - preserving the
 * exact z-index stack (overlay -> baseline -> fill -> ticks -> chevrons -> handle).
 *
 * The shell hands down its projector; case mode's projector domain IS the visible
 * window, so the dot/day seeks route through project.msAt (behavior-identical to
 * the old windowMin + frac*span) and the layer reads windowMin/windowMax/span from
 * the store exactly as before.
 */
import { memo, useMemo } from "react";
import { useSchema } from "../../store/schema";
import { useStoryInk } from "../../store/kind-ink";
import { trackNodes } from "../../lib/case-events";
import { LANE_ORDER, cssRgb, laneKinds, lanePositions } from "../../lib/timeline-lanes";
import type { Entity } from "../../lib/entity";
import { nodeProminence } from "../../lib/node-prominence";
import { usePlayhead } from "../../store/playhead";
import { useNavigation } from "../../store/navigation";
import { useSessionFilter } from "../../store/session-filter";
import { sessionTickState } from "../../lib/session-highlight";
import {
  accountEventToEntity,
  loginToEntity,
  transactionToEntity,
  transferToEntity,
} from "../../lib/adapters/ffr-seed";
import {
  elapsedChips,
  quietGap,
  severitySession,
  type StoryTick,
} from "../../lib/timeline-story";
import { kindRgbVar, kindOnPanelVar } from "../../lib/entity-palette";
import { KIND_SLOT } from "../../theme/entity-mapping";
import { nodeBrief, recordLines, ringFacts, type TimeForm } from "../../lib/time-words";
import { useClockForm } from "../../store/clock-form";
import { tip } from "../ui/Tip";
import { useOnMenu } from "../LayerRow";
import { TransferPathOverlay } from "./TransferPathOverlay";
import { CustomPathTimeline } from "../paths/CustomPathTimeline";
import type { TimelineProjector } from "../../lib/timeline-projector";
import type { ScenarioAnnotation } from "../../lib/scenarios";
import type { AccountEvent, Transaction, LoginEvent, Transfer } from "../../types";

// Lane order lives in lib/timeline-lanes (LANE_ORDER): only kinds PRESENT in
// the data get a lane, so a card-fraud scenario stays the familiar 3-lane track
// while an ATO scenario grows its behavioral lanes and a non-bank pack grows
// one lane per manifest-declared kind.

const NO_GENERIC: Entity[] = [];

/** The kind's colour as a CSS colour: a mode-aware slot var for the concrete
 *  kinds, the manifest palette for a declared kind with no theme slot. */
// eslint-disable-next-line react-refresh/only-export-components -- a pure helper kept with the one layer that paints with it; later items import it
export function makePaint(genericHex: Record<string, string>) {
  return (kind: string, alpha?: number | string): string => {
    const hex = genericHex[kind];
    if (hex) return cssRgb(hex, alpha);
    return alpha === undefined
      ? `rgb(var(${kindRgbVar(kind)}))`
      : `rgb(var(${kindRgbVar(kind)}) / ${alpha})`;
  };
}

interface Props {
  project: TimelineProjector;
  transactions: Transaction[];
  logins?: LoginEvent[];
  accountEvents?: AccountEvent[];
  transfers?: Transfer[];
  /** Manifest-declared kinds (a non-bank pack's sign-ins, key events, usage ...). */
  genericEntities?: Entity[];
  annotations?: ScenarioAnnotation[];
}

/** `memo`: the layer reads no playhead value, but the shell that mounts it renders at every tick and
 *  hands it a new element each time. With every prop the same and no store value changed, a tick
 *  builds none of the memos below and none of the marker lane's buttons (T1, BACKLOG item 20). */
export const CaseTimelineLayer = memo(function CaseTimelineLayer({
  project,
  transactions,
  logins,
  accountEvents,
  transfers,
  genericEntities = NO_GENERIC,
  annotations,
}: Props) {
  const schemaNodes = useSchema((s) => s.nodes);
  const declared = useMemo(() => trackNodes(schemaNodes), [schemaNodes]);
  // A kind that declares a magnitude is drawn as a lane under the track by Timeline.tsx, so it
  // gets no dots here; every other declared kind draws as dots on its own lane.
  const generic = useMemo(() => declared.filter((n) => !n.magnitude), [declared]);
  const genericKinds = useMemo(() => generic.map((n) => n.kind), [generic]);
  // A story's own kind takes the resolver's mark for the live theme and colour mode; with no entry (a kind
  // that has a palette slot is never given one) it keeps its manifest colour as before.
  const ink = useStoryInk();
  const genericHex = useMemo(() => Object.fromEntries(declared.map((n) => [n.kind, ink.get(n.kind)?.mark ?? n.palette])), [declared, ink]);
  const paint = useMemo(() => makePaint(genericHex), [genericHex]);
  // A node's solid mark and its tooltip's dot are the kind's colour clamped for the panel in the
  // current theme and colour mode: a coded kind reads its on-panel var; a declared kind's hex is
  // stepped to 3:1 on the panel surface (the same step the Layers menu's dots take).
  const onMenu = useOnMenu();
  const onPanel = useMemo(
    () =>
      (kind: string): string =>
        // The on-panel variables are hex colours, so they are read directly: wrapped in rgb()
        // the declaration is invalid and the mark does not paint (FIX-2026-11-20).
        genericHex[kind] ? onMenu(genericHex[kind]) : `var(${kindOnPanelVar(kind)})`,
    [genericHex, onMenu],
  );
  // The manifest's word for each kind; a kind it does not label is named by its own id.
  const kindLabels = useMemo(() => new Map(schemaNodes.map((n) => [n.kind, n.label || n.kind])), [schemaNodes]);
  const windowMin = usePlayhead((s) => s.windowMin);
  const windowMax = usePlayhead((s) => s.windowMax);
  const setPlayhead = usePlayhead((s) => s.setPlayhead);
  const pause = usePlayhead((s) => s.pause);
  const navigate = useNavigation((s) => s.navigate);
  const selectedSessionId = useSessionFilter((s) => s.selectedSessionId);
  // The clock's switch: the times inside the tooltips take its 12 or 24 hour form.
  const form: TimeForm = useClockForm((s) => s.h24) ? "24h" : "12h";

  // Derived geometry - against the VISIBLE window (zoom), not the data bounds.
  const span = windowMax - windowMin;

  // Entity-driven event ticks - transactions (+ logins when passed).
  // `challengeVar` carries the slot STEM for the step-up-auth halo, mirroring
  // the Inspector's outcome → color mapping (LoginInspector.tsx:24-28 +
  // lib/colors.ts:47-61): "r3" (amber/elevated) for passed/required, "alarm"
  // (red/signal) for failed. null for non-challenge events. Storing the stem
  // (not a frozen triplet) keeps the halo mode-aware: the consumer composes
  // `var(--${stem}-on-panel)` for the ring (a hex colour) + `rgb(var(--${stem}-rgb) / α)`
  // for the glow. (Spec 3 amber-challenge, 2026-05-28; mode-aware 2026-06-18)
  const eventTicks = useMemo(() => {
    if (span <= 0) return [];
    const challengeVarById = new Map<string, "r3" | "alarm">();
    const newDeviceIds = new Set<string>();
    for (const l of logins ?? []) {
      if (l.outcome === "challenge_passed" || l.outcome === "challenge_required") {
        challengeVarById.set(l.id, "r3"); // elevated (amber)
      } else if (l.outcome === "challenge_failed") {
        challengeVarById.set(l.id, "alarm"); // signal (red)
      }
      // The ATO tell: a never-seen device fingerprint (device_trust intel).
      if (l.device_trust === "new") newDeviceIds.add(l.id);
    }
    const blockedIds = new Set((transfers ?? []).filter((t) => t.status === "blocked").map((t) => t.id));
    // The field lines that explain a ring, for the tooltip only (never the accessible name).
    const factsById = new Map<string, string[]>();
    for (const l of logins ?? []) factsById.set(l.id, ringFacts({ deviceTrust: l.device_trust, outcome: l.outcome }));
    for (const t of transfers ?? []) factsById.set(t.id, ringFacts({ status: t.status }));
    const all = [
      ...transactions.map(transactionToEntity),
      ...(logins ?? []).map(loginToEntity),
      ...(accountEvents ?? []).map(accountEventToEntity),
      ...(transfers ?? []).map(transferToEntity),
      ...genericEntities.filter((e) => genericKinds.includes(e.kind)),
    ];
    return all
      .filter((e) => e.timestamp >= windowMin && e.timestamp <= windowMax)
      .map((e) => {
        const kindLabel = kindLabels.get(e.kind) ?? e.kind;
        const brief = nodeBrief(e.displayMetadata.primaryLabel, e.timestamp, form);
        return {
          id: e.id,
          kind: e.kind,
          ts: e.timestamp,
          session: (e.fields as { session_id?: string }).session_id ?? null,
          pct: ((e.timestamp - windowMin) / span) * 100,
          challengeVar: challengeVarById.get(e.id) ?? null,
          newDevice: newDeviceIds.has(e.id),
          blocked: blockedIds.has(e.id),
          // The words are built here, once for the window: this layer redraws at every tick, and a
          // date format for each node at each tick would cost frames. The name holds the kind, the
          // headline and the time, and no ring word; the ring's field lines are in the tooltip.
          // The time takes the clock's form, as the tooltip's does. The name is one imperative
          // followed by values, so the writing rules that apply meet as follows (the Simplified
          // Technical English rules as the Wikipedia article states them):
          //   R2 R4 R5 R6 R7 R11 one imperative, simple present form, no -ing, no passive
          //   R8 two fixed words; the rest is the manifest's own words and a time, printed unchanged
          //   R3 not applicable: no noun cluster is written here
          // Not met: R1 (the dictionary is not at hand, so "Jump" is not checked) and R9 (no article
          // before the kind's label and no full stop, since the name ends in a value).
          name: `Jump to ${kindLabel}: ${brief}`,
          tipBrief: brief,
          tipLines: recordLines(
            kindLabel,
            e.displayMetadata.primaryLabel,
            e.displayMetadata.secondaryLabel ?? "",
            e.timestamp,
            factsById.get(e.id) ?? [],
            form,
          ),
        };
      });
    // The form is part of what builds the words: a change of the switch builds them again, once.
  }, [transactions, logins, accountEvents, transfers, genericEntities, genericKinds, kindLabels, windowMin, windowMax, span, form]);

  // Density-aware emphasis: as fewer events fall in the window (zoomed in or
  // sparse data), nodes + rings grow, glows tighten, and the patchy density
  // gradient fades - so each event reads as a crisp distinct mark instead of a
  // smear. At full zoom-out the density backdrop carries it (prominence → 0).
  const prominence = nodeProminence(eventTicks.length);

  // The storytelling layer: in an ATO the timing IS the signature. Derive the
  // severity session (the attack thread), its elapsed-time chips, the dwell
  // gap before it, and the annotation marks - all from generic ticks. (The
  // per-day density band moved to useCaseDayCells, the shell's dayDensity slot.)
  const story = useMemo(() => {
    const storyTicks: StoryTick[] = eventTicks.map((t) => ({
      id: t.id,
      kind: t.kind,
      ts: t.ts,
      session: t.session,
      severe: t.newDevice || t.blocked || t.kind === "fraud",
    }));
    const sessionId = severitySession(storyTicks);
    return {
      sessionId,
      chips: elapsedChips(storyTicks, sessionId, windowMin, span),
      gap: quietGap(storyTicks, sessionId, windowMin, span),
      annotationMarks: (annotations ?? [])
        .map((a) => ({
          pct: ((Date.parse(a.timestamp) - windowMin) / span) * 100,
          label: a.label,
          note: a.note,
        }))
        .filter((a) => a.pct >= 0 && a.pct <= 100),
    };
  }, [eventTicks, annotations, windowMin, span]);

  // F2 timeline-bar visuals (Spec 3 polish, 2026-05-28). Replaces the
  // prior fraud-cluster band + 22 px event-tick bars with: an ambient
  // density gradient (the backdrop), three thin lane lines per kind,
  // and tiny dots on each lane for individual events.
  //
  // The ambient gradient buckets events into AMBIENT_BUCKETS slots
  // across the timeline width and tints each bucket with the dominant
  // kind's color at an intensity-scaled alpha. Lane gradients per kind
  // do the same per-kind: transparent where no events, soft kind-color
  // where activity exists.
  const f2 = useMemo(() => {
    const AMBIENT_BUCKETS = 40;
    const LANE_BUCKETS = 60;
    const kindFor = (k: string): string => (k in KIND_SLOT || genericKinds.includes(k) ? k : "auth");

    // Lanes derive from the kinds PRESENT in the data, in LANE_ORDER. A
    // card-fraud pack renders the familiar fraud/login/auth trio; an ATO
    // pack grows account_event + transfer lanes (and has no fraud lane -
    // its fraud lives in the behavioral kinds).
    const present = new Set(eventTicks.map((t) => kindFor(t.kind)));
    const lanes = laneKinds(present, genericKinds);
    const positions = lanePositions(lanes);

    // Ambient: pick dominant kind per bucket, alpha scales with total density.
    const ambientBuckets: Record<string, number>[] = Array.from(
      { length: AMBIENT_BUCKETS },
      () => ({}),
    );
    for (const t of eventTicks) {
      const idx = Math.min(
        AMBIENT_BUCKETS - 1,
        Math.max(0, Math.floor((t.pct / 100) * AMBIENT_BUCKETS)),
      );
      const k = kindFor(t.kind);
      ambientBuckets[idx][k] = (ambientBuckets[idx][k] ?? 0) + 1;
    }
    const ambientStops = ambientBuckets.map((b, i) => {
      const pct = (i / (AMBIENT_BUCKETS - 1)) * 100;
      const total = Object.values(b).reduce((a, n) => a + n, 0);
      if (total === 0) return `rgba(0,0,0,0) ${pct.toFixed(2)}%`;
      // Dominant kind; LANE_ORDER breaks ties severity-first (fraud wins).
      let dom = "auth";
      let domCount = -1;
      for (const k of [...LANE_ORDER, ...genericKinds]) {
        const n = b[k] ?? 0;
        if (n > domCount) {
          dom = k;
          domCount = n;
        }
      }
      const alpha = Math.min(0.32, (total / 5) * 0.12);
      // A coded kind paints in the theme's ink form of its slot (--<slot>-mark-rgb, MARKS-INK); a
      // declared kind keeps its manifest colour.
      const inkVar = kindRgbVar(dom).replace(/-rgb$/, "-mark-rgb");
      const stop = genericHex[dom] ? paint(dom, alpha.toFixed(3)) : `rgb(var(${inkVar}) / ${alpha.toFixed(3)})`;
      return `${stop} ${pct.toFixed(2)}%`;
    });
    const ambientGradient = `linear-gradient(90deg, ${ambientStops.join(", ")})`;

    // Per-kind lane density → gradient string. Transparent where no
    // events in that kind, kind-colored where dense.
    const buildLaneGradient = (kind: string): string => {
      const buckets = new Array(LANE_BUCKETS).fill(0) as number[];
      for (const t of eventTicks) {
        if (kindFor(t.kind) !== kind) continue;
        const idx = Math.min(
          LANE_BUCKETS - 1,
          Math.max(0, Math.floor((t.pct / 100) * LANE_BUCKETS)),
        );
        buckets[idx] += 1;
      }
      const stops = buckets.map((count, i) => {
        const pct = (i / (LANE_BUCKETS - 1)) * 100;
        const alpha = count === 0 ? 0 : Math.min(0.78, 0.32 + count * 0.18);
        return `${paint(kind, alpha.toFixed(3))} ${pct.toFixed(2)}%`;
      });
      return `linear-gradient(90deg, ${stops.join(", ")})`;
    };

    const laneGradients: Record<string, string> = {};
    for (const k of lanes) laneGradients[k] = buildLaneGradient(k);

    return { ambientGradient, lanes, laneGradients, lanePositions: positions, kindFor };
  }, [eventTicks, genericKinds, genericHex, paint]);

  return (
    <>
      {/* F2 ambient density backdrop, soft and kind-tinted,
          spanning the full track height. Bucket-derived; dominant
          kind per slot at intensity-scaled alpha. */}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none transition-opacity"
        style={{ background: f2.ambientGradient, opacity: 1 - prominence * 0.7 }}
      />

      {/* The dwell: a bracketed quiet span between the last precursor and
          the takeover burst - in an ATO the silence is evidence too. */}
      {story.gap && story.gap.toPct - story.gap.fromPct > 3 && (
        <div aria-hidden="true" className="pointer-events-none">
          <div
            className="absolute border-t border-dashed"
            style={{
              left: `${story.gap.fromPct}%`,
              width: `${story.gap.toPct - story.gap.fromPct}%`,
              top: 3,
              borderColor: "rgb(var(--r3-rgb) / 0.45)",
            }}
          />
          <span
            className="absolute font-mono text-[8px] tracking-[0.18em] -translate-x-1/2"
            style={{
              left: `${(story.gap.fromPct + story.gap.toPct) / 2}%`,
              top: -3,
              color: "var(--r3-on-panel)",
              textShadow: "0 1px 2px rgba(0,0,0,0.9)",
            }}
          >
            {story.gap.label}
          </span>
        </div>
      )}

      {/* The kill-chain readout: the session's inter-event timing rendered
          as evidence ("+7m · +9m · +13m · +30m"). One compact flag at the
          burst - individual chips would be sub-pixel at a 30-day zoom. */}
      {story.sessionId && story.chips.length > 0 && (
        <span
          aria-hidden="true"
          className="absolute font-mono text-[8px] tracking-wider pointer-events-none whitespace-nowrap"
          style={{
            left: `${Math.min(story.chips[0].pct, 86)}%`,
            top: 25,
            transform: story.chips[0].pct > 70 ? "translateX(-100%)" : undefined,
            color: "var(--alarm-on-panel)",
            textShadow: "0 1px 2px rgba(0,0,0,0.9)",
          }}
        >
          {story.chips.map((c) => c.label).join(" · ")}
        </span>
      )}

      {/* Customer-reported annotations (the phish SMS): a hollow dashed
          diamond - reported, not observed; never a data dot. */}
      {story.annotationMarks.map((a, i) => (
        <span
          key={i}
          className="absolute -translate-x-1/2 pointer-events-auto cursor-help"
          style={{ left: `${a.pct}%`, top: 1, zIndex: 4 }}
          title={`${a.label}: ${a.note}`}
        >
          <span
            className="block rotate-45"
            style={{
              width: 6,
              height: 6,
              border: "1px dashed var(--r3-on-panel)",
              background: "transparent",
            }}
          />
        </span>
      ))}

      {/* F2 lane lines - one per PRESENT kind, in severity order (top →
          bottom). Each is a 1 px line with a horizontal gradient that
          fades from transparent (no activity) to soft kind-color (dense
          activity). Lanes derive from the data, not a hardcoded trio, so
          an ATO scenario grows account_event + transfer lanes. */}
      {f2.lanes.map((k) => (
        <div
          key={k}
          aria-hidden="true"
          className="absolute left-0 right-0 pointer-events-none transition-opacity"
          style={{
            top: `${f2.lanePositions[k]}%`,
            height: 1,
            background: f2.laneGradients[k],
            opacity: 1 - prominence * 0.7,
            zIndex: 2,
          }}
        />
      ))}

      {/* Transfer path - the money-movement lane's connective tissue
          (coordless by design, so it lives in the time dimension). */}
      <TransferPathOverlay
        transfers={transfers ?? []}
        minTime={windowMin}
        span={span}
        laneTop={f2.lanePositions["transfer"]}
      />

      {/* The investigator's paths: the dashed line and the numbered plates of the saved paths and the
          draft, on the track only (this layer is not drawn while the bar is folded). Under the dots'
          z 3 for the line and over it for the plates; it reads the playhead only as which stops lie
          after it, so a tick that crosses no stop does not render it. */}
      <CustomPathTimeline windowMin={windowMin} span={span} lanes={f2.lanePositions} kindFor={f2.kindFor} ticks={eventTicks} />

      {/* F2 event dots - tiny glowing circles riding their kind's
          lane line. Click fires the unified navigate() primitive
          (BLOOM + selection echo + playhead seek + pause). Hover or
          focus shows the tooltip layer's words (data-tip). Wrapped in
          a button for keyboard access; the 12 px hit-target halo is
          invisible (background transparent) and centered around the
          4 px visible dot. */}
      {eventTicks.map((tick) => {
        const kind = f2.kindFor(tick.kind);
        const laneTop = f2.lanePositions[kind] ?? 50;
        // The dot + its glow both ride the kind's raw vivid ramp colour so a
        // node pops; prominence (below) scales the size, brightness, and glow.
        // Heavier dot for severity-bearing events: fraud txns, the
        // never-seen-device login, and any blocked transfer.
        const emphatic = kind === "fraud" || tick.newDevice || tick.blocked;
        // Session-thread filter: the matching session's ticks get the
        // highlight ring; every other tick (null sessions included) dims.
        const sess = sessionTickState(tick.session, selectedSessionId);
        return (
          <button
            type="button"
            key={tick.id}
            {...tip(tick.tipLines, onPanel(kind))}
            data-tip-node={tick.tipBrief}
            data-node-kind={tick.kind}
            onClick={(e) => {
              e.stopPropagation();
              const tx = transactions.find((t) => t.id === tick.id);
              if (tx) {
                navigate({ kind: tx.is_fraud ? "fraud" : "auth", tx });
                return;
              }
              const login = (logins ?? []).find((l) => l.id === tick.id);
              if (login) {
                navigate({ kind: "login", login });
                return;
              }
              const ev = (accountEvents ?? []).find((a) => a.id === tick.id);
              if (ev) {
                navigate({ kind: "account_event", event: ev });
                return;
              }
              const tr = (transfers ?? []).find((t) => t.id === tick.id);
              if (tr) {
                navigate({ kind: "transfer", transfer: tr });
                return;
              }
              const ge = genericEntities.find((g) => g.id === tick.id);
              if (ge) {
                navigate({ kind: "entity", entity: ge });
                return;
              }
              setPlayhead(project.msAt(tick.pct / 100));
              pause();
            }}
            className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full cursor-pointer hover:scale-150 transition-transform flex items-center justify-center"
            style={{
              left: `${tick.pct}%`,
              top: `${laneTop}%`,
              width: 12,
              height: 12,
              background: "transparent",
              padding: 0,
              border: "none",
              zIndex: 3,
              // CVD-robust dimming (G2, 2026-06-18): two-channel cue so the
              // thread-vs-non-thread distinction survives monochrome, deuteranopia,
              // protanopia, and tritanopia.
              //
              // opacity 0.7 (raised from 0.55): luminance channel - works in
              // monochrome/greyscale where filter:saturate is a NO-OP. 0.7 vs 1.0
              // is ~1.4:1 luminance ratio which is perceptible without washing the
              // track out (0.55 caused a readability regression in 2026-06-11 review;
              // 0.7 threads the needle - dim enough to read, not so dim it washes).
              //
              // saturate(0.35): color-mode channel - drains hue from non-thread
              // ticks for users who CAN perceive color, adding a second signal on
              // top of the luminance cue. In monochrome this is a no-op, so it
              // never fights the opacity cue; it only adds redundancy in color modes.
              opacity: sess.dimmed ? 0.7 : 1,
              filter: sess.dimmed ? "saturate(0.35)" : undefined,
            }}
            aria-label={tick.name}
          >
            {/* Session-highlight ring: the active thread's ticks wear a
                luminance halo that pops in monochrome as well as color modes.
                CVD-robust design (G2, 2026-06-18):
                - border 1.5px (up from 1px): thicker stroke = more luminance
                  area; perceptible where a hairline ring would vanish.
                - rgba(0,229,255,...) = cyan for color modes (r1 accent).
                - boxShadow outer glow at full opacity: the BRIGHTNESS of the
                  glow is the monochrome cue - a bright halo around the dot
                  reads as "special" in greyscale regardless of hue.
                - width/height 15 (up from 14): larger ring footprint amplifies
                  the luminance contrast against the dimmed neighbours (0.7 opc).
                Sized above the 10 px newDevice and 8 px challenge rings so all
                three stay legible together. */}
            {sess.highlighted && (
              <span
                aria-hidden="true"
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
                style={{
                  width: 15 + prominence * 6,
                  height: 15 + prominence * 6,
                  border: "1.5px solid rgb(var(--r1-rgb) / 0.95)",
                  boxShadow: "0 0 7px 1px rgb(var(--r1-rgb) / 0.75)",
                }}
              />
            )}
            {/* The ATO tell ring: a never-seen device gets a red halo on
                the login lane - the one dot a reviewer must find. */}
            {tick.newDevice && (
              <span
                aria-hidden="true"
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
                style={{
                  width: 10 + prominence * 5,
                  height: 10 + prominence * 5,
                  border: "1px solid var(--alarm-on-panel)",
                  boxShadow: "0 0 4px rgb(var(--alarm-rgb) / 0.95)",
                }}
              />
            )}
            {tick.challengeVar && !tick.newDevice && (
              <span
                aria-hidden="true"
                className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full pointer-events-none"
                style={{
                  width: 8 + prominence * 4,
                  height: 8 + prominence * 4,
                  border: `1px solid var(--${tick.challengeVar}-on-panel)`,
                  boxShadow: `0 0 2px rgb(var(--${tick.challengeVar}-rgb) / 0.9)`,
                }}
              />
            )}
            {tick.blocked ? (
              // Blocked transfer: hollow, red-rimmed - the system visibly
              // catching wire #2 must not look like a coffee purchase.
              <span
                aria-hidden="true"
                className="block rounded-full"
                style={{
                  width: 5 + prominence * 3,
                  height: 5 + prominence * 3,
                  background: "transparent",
                  border: "1.5px solid var(--alarm-on-panel)",
                  boxShadow: "0 0 6px rgb(var(--alarm-rgb) / 0.9)",
                }}
              />
            ) : (
              <span
                aria-hidden="true"
                className="block rounded-full"
                style={{
                  width: (emphatic ? 4 : 3) + prominence * 4,
                  height: (emphatic ? 4 : 3) + prominence * 4,
                  // The core is the kind's colour clamped for the panel (3:1 on it, in
                  // every theme and mode); the glow below stays the raw vivid ramp so a
                  // node still pops. Size + glow scale with prominence; the density
                  // gradient fades as you zoom in.
                  background: onPanel(kind),
                  boxShadow: emphatic
                    ? `0 0 ${5 - prominence}px ${paint(kind, 0.9 + prominence * 0.1)}, 0 0 2px ${paint(kind)}`
                    : `0 0 ${4 - prominence}px ${paint(kind, 0.55 + prominence * 0.4)}`,
                }}
              />
            )}
          </button>
        );
      })}

    </>
  );
});
