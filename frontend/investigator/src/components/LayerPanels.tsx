import { Fragment, useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { useSchema } from "../store/schema";
import { useStoryInk } from "../store/kind-ink";
import { genericCounts, type GenericCount } from "../lib/generic-entities";
import type { Entity } from "../lib/entity";
import { useLayers } from "../store/layers";
import { useDrawInputs, useMarksStore, useRecordFacts } from "../store/marks";
import { usePivotData } from "../store/pivot-data";
import { usePlayhead } from "../store/playhead";
import {
  EMPTY_VALUE,
  FACET_LABEL,
  YOURS_LABEL,
  facetWords,
  kindSwitchWords,
  moreWords,
  valueSwitchWords,
  valuesFoldWords,
  yoursFoldWords,
  yoursWords,
} from "../lib/tooltip-words/layers";
import { caseDrawRecords, yoursCounts } from "../lib/yours-counts";
import { YOURS_FACETS, type YoursFacet } from "../lib/marks/types";
// The shared small drawings (model B's, landed): the lens, the pin and the disposition glyphs, and the ink.
import { DispositionGlyph, MARK_INK, MarkGlyph } from "./marks/glyphs";
import { TONE_STYLE } from "./verdict/tone-style";
import { cardLine, deviceLine } from "../lib/case-summary";
import { formatTimeDelta } from "../lib/entities";
import { FieldRow, FocusButton } from "./ui";
import { tip } from "./ui/Tip";
import { KeyRow, LayerSwitch, useOnMenu } from "./LayerRow";
import type {
  LoginEvent,
  LoginOutcome,
  Place,
  Transaction,
  Transfer,
} from "../types";

// MCC-prefixed labels match how a card-network investigator reads a
// transaction in NICE Actimize / Falcon / FICO. The MCC is the universal
// handle; the English gloss is decoration.
const CATEGORY_LABEL: Record<string, string> = {
  groceries: "5411 · Grocery",
  gas: "5541 · Service Stn",
  fast_food: "5814 · Fast Food",
  restaurant: "5812 · Eating Place",
  coffee: "5814 · Coffee",
  warehouse: "5300 · Wholesale",
  pharmacy: "5912 · Drug Store",
  department: "5311 · Department",
  subscription: "5815 · Digital Goods",
  kids_activity: "8351 · Child Care",
  auto_service: "7538 · Auto Service",
  work_lodging: "7011 · Lodging",
  online_retail: "5942 · Online Retail",
  rideshare: "4121 · Rideshare",
  travel_agency: "4722 · Travel Agency",
};

const LOGIN_OUTCOME_LABEL: Record<LoginOutcome, string> = {
  success: "Success",
  challenge_required: "Challenge issued",
  challenge_passed: "Challenge passed",
  challenge_failed: "Challenge failed",
  failed: "Failed",
};

// Login-outcome severity -> the on-panel theme var the count renders in (so the
// breakdown recolors per mode and stays legible on the menu's opaque
// surface). identity=r2, elevated=r3, severity=alarm.
const OUTCOME_TONE: Record<LoginOutcome, string> = {
  success: "var(--r2-on-panel)",
  challenge_required: "var(--r3-on-panel)",
  challenge_passed: "var(--r3-on-panel)",
  challenge_failed: "var(--alarm-on-panel)",
  failed: "var(--alarm-on-panel)",
};

interface Props {
  /** Full sets (for the "/ N" denominators + summary lines). */
  transactions: Transaction[];
  logins: LoginEvent[];
  places: Place[];
  /** Not read here: the paths a case offers are PathPanel's (see offeredPathKinds). */
  transfers: Transfer[];
  /** Playhead-filtered sets (for the visible-count numerators + breakdowns). */
  visibleTransactions: Transaction[];
  visibleLogins: LoginEvent[];
  /** Surfaces the auth count as "ERR" when the initial fetch failed. */
  loadError: string | null;
  /** Manifest-declared kinds of a non-bank pack (sign-ins, key events, usage ...). */
  genericByKind?: Record<string, Entity[]>;
}

/** Details indent: the 9 px square plus the 8 px gap on the left, so a region lines up with the
 *  label above it. On the right, 32 px (the 24 px chevron column, its 2 px gap and the button's
 *  6 px) puts a detail value under the row counts. The bottom padding sets an open region apart
 *  from the next row. */
const DETAILS_INDENT = "pb-2.5 pl-[17px] pr-8";

/** A facet row's drawing: the pin for Pinned, the disposition's glyph for PASS, FAIL and WAITING, and an
 *  empty slot for Noted and In a path (the shared drawings hold no note mark), so the labels line up. */
function facetGlyph(f: YoursFacet): ReactNode {
  if (f === "pinned") return <MarkGlyph name="pin" />;
  if (f === "pass" || f === "fail" || f === "wait") return <DispositionGlyph disposition={f} />;
  return <span />;
}

/** The last row of a cut value list: `<n> more`, which lists the rest in place. Mono 10 px, muted. */
function MoreRow({ n, onPress }: { n: number; onPress: () => void }) {
  return (
    <FocusButton
      variant="ghost"
      onClick={onPress}
      className="flex h-[26px] w-full items-center text-left font-mono text-[10px] text-muted hover:bg-text/10"
      {...tip(moreWords(n))}
    >
      {`${n} more`}
    </FocusButton>
  );
}

/**
 * LayerPanels - the body of the Layers menu, on the menu's one opaque surface (no panel shell).
 * Authorizations, Places and Logins are switch rows (a square, a label, a count); Authorizations
 * and Logins also carry a chevron that unfolds their details (the card line and merchant table,
 * the device line and login outcomes), folded at first. Each manifest-declared kind with records is a
 * switch; one that declares a filter also opens into one switch per value of its field (a long list is
 * cut at seven with a row for the rest). A kind with no record stays a key row. While the marks store
 * holds a story, a Dispositions switch is the first row (the lens, `touched / all`, disabled while it is off
 * and nothing is touched); its chevron opens six facet switches (Pinned, PASS, FAIL, WAITING, Noted, In a
 * path) and a hairline follows. The Time zones switch is the last row, under a hairline when a row sits
 * above it, with its note and credit. Coloured text reads the on-panel colours. Toggles and playhead bounds come from their
 * stores. The path switches are PathPanel's.
 */
export function LayerPanels({
  transactions,
  logins,
  places,
  visibleTransactions,
  visibleLogins,
  loadError,
  genericByKind,
}: Props) {
  const minTime = usePlayhead((s) => s.minTime);
  const maxTime = usePlayhead((s) => s.maxTime);
  const schemaNodes = useSchema((s) => s.nodes);
  // The counts are the one function's (lib/marks/draw): reached and shown over all, so they follow the
  // switches and the playhead together.
  const draw = useDrawInputs();
  const generic = useMemo(
    () => genericCounts(schemaNodes, genericByKind ?? {}, draw),
    [schemaNodes, genericByKind, draw],
  );
  const hiddenKinds = useLayers((s) => s.hiddenKinds);
  const hiddenValues = useLayers((s) => s.hiddenValues);
  const toggleKind = useLayers((s) => s.toggleKind);
  const toggleValue = useLayers((s) => s.toggleValue);
  const showAuths = useLayers((s) => s.showAuths);
  const showLogins = useLayers((s) => s.showLogins);
  const showPlaces = useLayers((s) => s.showPlaces);
  const showTimezone = useLayers((s) => s.showTimezone);
  const toggleAuths = useLayers((s) => s.toggleAuths);
  const toggleLogins = useLayers((s) => s.toggleLogins);
  const togglePlaces = useLayers((s) => s.togglePlaces);
  const toggleTimezone = useLayers((s) => s.toggleTimezone);
  const onMenu = useOnMenu();
  const ink = useStoryInk();

  // Dispositions: drawn while the marks store holds a story. Its counts read the investigator's state
  // over the case's five lists (never the switches or the playhead), so they are made from the facts
  // function, which changes only with the nodes, the notes and the paths. Five selectors, never one object.
  const hasStory = useMarksStore((s) => s.scenario) !== null;
  const caseTransactions = usePivotData((s) => s.transactions);
  const caseLogins = usePivotData((s) => s.logins);
  const caseAccountEvents = usePivotData((s) => s.accountEvents);
  const caseTransfers = usePivotData((s) => s.transfers);
  const caseEntities = usePivotData((s) => s.entities);
  const facts = useRecordFacts();
  const yoursOn = useLayers((s) => s.yoursOn);
  const yoursFacets = useLayers((s) => s.yoursFacets);
  const toggleYours = useLayers((s) => s.toggleYours);
  const toggleFacet = useLayers((s) => s.toggleFacet);
  const yoursNumbers = useMemo(
    () =>
      yoursCounts(
        caseDrawRecords({
          transactions: caseTransactions,
          logins: caseLogins,
          accountEvents: caseAccountEvents,
          transfers: caseTransfers,
          entities: caseEntities,
        }),
        facts,
      ),
    [caseTransactions, caseLogins, caseAccountEvents, caseTransfers, caseEntities, facts],
  );
  const [yoursOpen, setYoursOpen] = useState(false);

  const [open, setOpen] = useState({ auths: false, logins: false });
  const fold = (which: "auths" | "logins") => setOpen((o) => ({ ...o, [which]: !o[which] }));
  // A manifest kind's value list is folded at first and lists seven values of a long list until its
  // more row is pressed; both are local to the menu and are not kept anywhere.
  const [openKinds, setOpenKinds] = useState<ReadonlySet<string>>(() => new Set());
  const [moreKinds, setMoreKinds] = useState<ReadonlySet<string>>(() => new Set());
  const flipped = (held: ReadonlySet<string>, kind: string): ReadonlySet<string> => {
    const next = new Set(held);
    if (!next.delete(kind)) next.add(kind);
    return next;
  };
  const regionId = useId();
  const noteId = useId();
  // The kind whose more row was just pressed: the focus moves to its eighth value once the rest is drawn,
  // and the mark is cleared, so no other change moves the focus.
  const focusEighthOf = useRef<string | null>(null);
  useEffect(() => {
    const kind = focusEighthOf.current;
    if (kind === null) return;
    focusEighthOf.current = null;
    document.getElementById(`${regionId}-k-${kind}`)?.querySelectorAll<HTMLElement>("button[aria-pressed]")[7]?.focus();
  }, [moreKinds, regionId]);
  const valueHidden = (kind: string, value: string): boolean =>
    Object.hasOwn(hiddenValues, kind) && hiddenValues[kind].includes(value);
  // A value press while its kind is off turns the kind on with that value on (the other values stay as they are).
  const pressValue = (kind: string, value: string): void => {
    if (hiddenKinds.includes(kind)) {
      toggleKind(kind);
      if (valueHidden(kind, value)) toggleValue(kind, value);
    } else {
      toggleValue(kind, value);
    }
  };

  // A pack without card, login or place data (platform access) shows none of those rows.
  // Authorizations stays up on a load error so its ERR shows.
  const hasAuths = transactions.length > 0 || loadError != null;
  const hasLogins = logins.length > 0;
  // Rows without a chevron keep its column, so every count ends at one edge.
  const listed = (g: GenericCount): boolean => g.total > 0 && g.filter !== null && g.values.length > 0;
  const gutter = hasAuths || hasLogins || hasStory || generic.some(listed);
  // The hairline above Time zones separates it from the rows above; with none, it would be a
  // rule under nothing.
  const hasRowAbove = hasAuths || places.length > 0 || hasLogins || generic.length > 0;

  const categoryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of visibleTransactions) {
      counts.set(t.category, (counts.get(t.category) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [visibleTransactions]);

  const outcomeCounts = useMemo(() => {
    const counts = new Map<LoginOutcome, number>();
    for (const l of visibleLogins) {
      counts.set(l.outcome, (counts.get(l.outcome) ?? 0) + 1);
    }
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  }, [visibleLogins]);

  const yoursId = `${regionId}-yours`;
  const authsId = `${regionId}-auths`;
  const loginsId = `${regionId}-logins`;

  return (
    <div className="flex flex-col">
      {/* No fade on an off layer: at 0.9 the on-panel counts fell to 4.12:1 on the opaque
          menu; the ring square and aria-pressed say "off". */}
      {/* Dispositions: the first row, in the investigator's ink. On, only the records that match an on facet
          are drawn (the one function's); the six facet rows show their own state whatever it says. Disabled
          while it is off and nothing is touched; it stays focusable, so its tooltip can be read. */}
      {hasStory && (
        <>
          <LayerSwitch
            label={YOURS_LABEL}
            on={yoursOn}
            mixed={yoursOn && YOURS_FACETS.some((f) => !yoursFacets[f])}
            onToggle={toggleYours}
            color={MARK_INK}
            glyph={<MarkGlyph name="lens" />}
            count={`${yoursNumbers.touched} / ${yoursNumbers.all}`}
            disabled={!yoursOn && yoursNumbers.touched === 0}
            tipLines={yoursWords(yoursNumbers.touched, yoursOn)}
            gutter={gutter}
            details={{
              open: yoursOpen,
              onToggle: () => setYoursOpen((o) => !o),
              id: yoursId,
              tipLines: yoursFoldWords(yoursOpen),
            }}
          />
          {yoursOpen && (
            <div id={yoursId} className="pl-[17px]">
              {YOURS_FACETS.map((f) => (
                <LayerSwitch
                  key={f}
                  label={FACET_LABEL[f]}
                  on={yoursFacets[f]}
                  onToggle={() => toggleFacet(f)}
                  color={MARK_INK}
                  glyph={facetGlyph(f)}
                  count={String(yoursNumbers.facets[f])}
                  gutter={gutter}
                  tipLines={facetWords(f)}
                />
              ))}
            </div>
          )}
          <div className="my-1.5" style={{ borderTop: "1px solid var(--hairline)" }} />
        </>
      )}

      {hasAuths && (
        <>
          <LayerSwitch
            label="Authorizations"
            tipLines={kindSwitchWords("Authorizations")}
            on={showAuths}
            onToggle={toggleAuths}
            color="var(--r1-on-panel)"
            count={loadError ? "ERR" : `${visibleTransactions.length} / ${transactions.length}`}
            countSpoken={loadError ? "load error" : undefined}
            countTone={loadError ? "var(--alarm-on-panel)" : undefined}
            details={{ open: open.auths, onToggle: () => fold("auths"), id: authsId }}
          />
          {open.auths && (
            <div id={authsId} className={DETAILS_INDENT}>
              <div className="font-mono text-[11px] text-muted">{cardLine(transactions)}</div>
              <div className="mt-0.5 text-[10px] tracking-widest text-dim">
                {maxTime > minTime ? formatTimeDelta(maxTime - minTime) : "-"}
              </div>
              {/* Every category is listed; the menu's own scroller handles a tall menu. */}
              <div className="mt-1">
                {categoryCounts.map(([cat, n]) => (
                  <FieldRow
                    key={cat}
                    label={CATEGORY_LABEL[cat] ?? cat}
                    value={n}
                    valueTier="mono"
                  />
                ))}
              </div>
            </div>
          )}
        </>
      )}

      {/* Places context: an ambient switch, no detail rows */}
      {places.length > 0 && (
        <>
          <LayerSwitch
            label="Places · Context"
            on={showPlaces}
            onToggle={togglePlaces}
            color="var(--text-muted)"
            count={String(places.length)}
            gutter={gutter}
          />
          {showPlaces && (
            <div className="pb-1 pl-[17px] text-[10px] tracking-widest text-dim">
              Memorial · 8km radius
            </div>
          )}
        </>
      )}

      {hasLogins && (
        <>
          <LayerSwitch
            label="Logins"
            tipLines={kindSwitchWords("Logins")}
            on={showLogins}
            onToggle={toggleLogins}
            color="var(--r2-on-panel)"
            count={`${visibleLogins.length} / ${logins.length}`}
            details={{ open: open.logins, onToggle: () => fold("logins"), id: loginsId }}
          />
          {open.logins && (
            <div id={loginsId} className={DETAILS_INDENT}>
              <div className="font-mono text-[11px] text-muted">{deviceLine(logins)}</div>
              {outcomeCounts.map(([outcome, n]) => (
                <FieldRow
                  key={outcome}
                  label={LOGIN_OUTCOME_LABEL[outcome]}
                  value={n}
                  valueTier="mono"
                  valueTone={OUTCOME_TONE[outcome]}
                />
              ))}
            </div>
          )}
        </>
      )}

      {/* Manifest-declared kinds: a kind with records is a switch (reached / total by the one function);
          one that declares a filter opens into one switch per value. A kind with no record stays a key
          row. A kind that draws a path has its path switch in the Paths menu. */}
      {generic.map((g) => {
        if (g.total === 0) {
          return <KeyRow key={g.kind} label={g.label} color={onMenu(ink.get(g.kind)?.mark ?? g.palette)} count={`${g.visible} / ${g.total}`} gutter={gutter} />;
        }
        const filterLabel = g.filter?.label ?? "";
        const kindOn = !hiddenKinds.includes(g.kind);
        const hasValues = listed(g);
        const open = hasValues && openKinds.has(g.kind);
        const valuesId = `${regionId}-k-${g.kind}`;
        const mixed = kindOn && g.values.some((v) => valueHidden(g.kind, v.value));
        // Eight values or fewer are all listed; a longer list lists seven and a row for the rest.
        const cut = g.values.length > 8 && !moreKinds.has(g.kind);
        const listedValues = cut ? g.values.slice(0, 7) : g.values;
        return (
          <Fragment key={g.kind}>
            <LayerSwitch
              label={g.label}
              on={kindOn}
              mixed={mixed}
              onToggle={() => toggleKind(g.kind)}
              color={onMenu(ink.get(g.kind)?.mark ?? g.palette)}
              count={`${g.visible} / ${g.total}`}
              tipLines={kindSwitchWords(g.label)}
              gutter={gutter}
              details={
                hasValues
                  ? {
                      open,
                      onToggle: () => setOpenKinds((held) => flipped(held, g.kind)),
                      id: valuesId,
                      tipLines: valuesFoldWords(g.label, filterLabel, open),
                    }
                  : undefined
              }
            />
            {open && (
              <div id={valuesId} className="pl-[17px]">
                {listedValues.map((v) => (
                  <LayerSwitch
                    key={v.value}
                    label={v.value === "" ? EMPTY_VALUE : v.value}
                    plain
                    on={kindOn && !valueHidden(g.kind, v.value)}
                    onToggle={() => pressValue(g.kind, v.value)}
                    color={v.tone ? TONE_STYLE[v.tone].text : onMenu(ink.get(g.kind)?.mark ?? g.palette)}
                    count={`${v.visible} / ${v.total}`}
                    tipLines={valueSwitchWords(g.label, filterLabel, v.value)}
                    gutter={gutter}
                  />
                ))}
                {cut && (
                  <MoreRow
                    n={g.values.length - 7}
                    onPress={() => {
                      focusEighthOf.current = g.kind;
                      setMoreKinds((held) => new Set(held).add(g.kind));
                    }}
                  />
                )}
              </div>
            )}
          </Fragment>
        );
      })}

      {hasRowAbove && <div className="my-1.5" style={{ borderTop: "1px solid var(--hairline)" }} />}

      {/* Day/night + UTC-offset-band overlay. The note and credit always show: they
          describe the layer (data-integrity rule; license in
          public/data/timezones.LICENSE.txt). The note also describes the switch. */}
      <LayerSwitch
        label="Time zones"
        on={showTimezone}
        onToggle={toggleTimezone}
        color="var(--text-muted)"
        gutter={gutter}
        describedBy={noteId}
      />
      <div className="pb-0.5 pl-[17px]">
        <div id={noteId} className="text-dim" style={{ fontSize: 10, lineHeight: 1.35 }}>
          Day/night · standard UTC offsets, no DST
        </div>
        <a
          href="https://github.com/treyerl/timezones"
          target="_blank"
          rel="noreferrer"
          className="text-dim underline transition-colors hover:text-accent"
          style={{ fontSize: 10 }}
        >
          treyerl/timezones · MIT<span className="sr-only"> (opens in a new tab)</span>
        </a>
      </div>
    </div>
  );
}
