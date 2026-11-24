import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { RecoveringGlobeMap } from "./components/MapRecovery";
import { Inspector } from "./components/Inspector";
import { ScenarioSwitcher } from "./components/ScenarioSwitcher";
import { Panel, Eyebrow } from "./components/ui";
import { TipLayer } from "./components/ui/Tip";
import { tip } from "./components/ui/Tip";
import { StalenessBanner } from "./components/StalenessBanner";
import { DataErrors } from "./components/DataErrors";
import { SrAnnouncer } from "./components/SrAnnouncer";
import { MapMenus } from "./components/MapMenus";
import { CaseBottomStack } from "./components/CaseBottomStack";
import { NarrativeLog } from "./components/NarrativeLog";
import { PivotWindowsLayer } from "./components/pivot/PivotWindowsLayer";
import { NotesMenu } from "./components/notes-menu/NotesMenu";
import { NoteGlobeLayer } from "./components/notes/NoteGlobeLayer";
import { lookupFromContext } from "./components/notes/record-lookup";
import { useNotesBoot } from "./lib/notes-io/useNotesBoot";
import { MatchesTable } from "./components/match/MatchesTable";
import { AuthInspector } from "./components/inspector/AuthInspector";
import { FraudInspector } from "./components/inspector/FraudInspector";
import { LoginInspector } from "./components/inspector/LoginInspector";
import { PlaceInspector } from "./components/inspector/PlaceInspector";
import { AccountEventInspector } from "./components/inspector/AccountEventInspector";
import { TransferInspector } from "./components/inspector/TransferInspector";
import { entityRendererRegistry } from "./lib/entity";
import { useGenericEntities } from "./lib/generic-entities";
import { visibleGeneric } from "./lib/globe/generic-markers";
import { entityBounds, unionBounds, type Bounds } from "./lib/adapters/manifest-row";
import {
  accountEventToEntity,
  loginToEntity,
  transactionToEntity,
  transferToEntity,
} from "./lib/adapters/ffr-seed";
import type { Entity } from "./lib/entity";
import { buildTickerStream, type TickerItem } from "./lib/ticker-stream";
import type { PivotContext } from "./lib/matches";
import type { ScenarioAnnotation, ScenarioHome } from "./lib/scenarios";
import { ResetViewButton } from "./components/ResetViewButton";
import { ThemeSwitcher } from "./components/ThemeSwitcher";
import { shouldSkipUnscopedCaseBundle } from "./lib/population-fetch";
import { usePlaybackDriver } from "./components/timeline/usePlaybackDriver";
import { useSelection } from "./store/selection";
import { usePlayhead } from "./store/playhead";
import { usePublishClock } from "./hooks/usePublishClock";
import { jumpHome } from "./hooks/useBarPadding";
import { linkHoldsCamera, linkOpensCase, useShareLink } from "./hooks/useShareLink";
import { useDecisions } from "./store/decisions";
import { usePivotData } from "./store/pivot-data";
import { useDecisionData } from "./store/decision-data";
import { reachedDecisions } from "./lib/active-decision";
import { bootFocusEntity, overlayFocusEntity } from "./lib/boot-focus";
import { useNavigation } from "./store/navigation";
import { usePaths } from "./store/paths";
import { useSchema } from "./store/schema";
import { useLayers } from "./store/layers";
import { useSolo } from "./store/solo";
import { narrowBySolo } from "./lib/solo";
import { narrowByShown } from "./lib/marks/draw";
import { useShowInputs } from "./store/marks";
import type maplibregl from "maplibre-gl";
import type {
  AccountEvent,
  LoginEvent,
  Place,
  Transaction,
  Transfer,
} from "./types";

// View typed seed rows as the generic row shape the ticker stream layer
// consumes (same intact-object pass-through the ffr-seed adapters use).
function asRows(rows: readonly unknown[]): Array<Record<string, unknown>> {
  return rows as Array<Record<string, unknown>>;
}

export default function App() {
  usePublishClock();
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [logins, setLogins] = useState<LoginEvent[]>([]);
  const [places, setPlaces] = useState<Place[]>([]);
  const [accountEvents, setAccountEvents] = useState<AccountEvent[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mapInstance, setMapInstance] = useState<maplibregl.Map | null>(null);
  const [scenarioHome, setScenarioHome] = useState<ScenarioHome | null | undefined>(undefined);
  const [scenarioAnnotations, setScenarioAnnotations] = useState<ScenarioAnnotation[]>([]);
  // Whether the active manifest declares a `focal` (a single-customer pack).
  // A population-scale pack declares none, so its case-boot must not
  // pull the unscoped whole transactions table. Set from ScenarioSwitcher's
  // onActive (which fetches /api/scenario). Defaults true so the case bundle is
  // never wrongly skipped before the manifest resolves (fail-open to the
  // pre-fix behavior for the small single-customer packs).
  const [hasManifestFocal, setHasManifestFocal] = useState(true);

  // Frame the camera on the scenario's establishing shot (manifest `home`); at open the map is already built there.
  useEffect(() => {
    if (!mapInstance || !scenarioHome) return;
    // A camera named by the link or the capture harness wins (jumpHome checks the lock). The jump
    // is marked as an opening of the camera, so the fit above the bar is taken from its zoom.
    jumpHome(mapInstance, scenarioHome);
  }, [mapInstance, scenarioHome]);

  const playhead = usePlayhead((s) => s.playhead);
  const minTime = usePlayhead((s) => s.minTime);
  const maxTime = usePlayhead((s) => s.maxTime);
  const setBounds = usePlayhead((s) => s.setBounds);
  const widenBounds = usePlayhead((s) => s.widenBounds);
  // A boolean, so App re-renders when the Inspector opens or closes and not on each selection.
  // The top row reserves the Inspector's width while it is open (index.css `.top-row`).
  const inspectorOpen = useSelection((s) => s.selected !== null);
  const { decisions, error: decisionsError, loaded: decisionsLoaded } = useDecisions();
  // The active scenario's declared kinds - seeded by ScenarioSwitcher's
  // onActive below; the ticker stream renders from these manifest nodes.
  const schemaNodes = useSchema((s) => s.nodes);
  // Kinds with no dedicated endpoint (a non-bank pack's sign-ins, key events, usage...),
  // read through /api/entities and adapted by the manifest; empty for a pack
  // that declares only concrete kinds.
  const genericByKind = useGenericEntities(schemaNodes, setLoadError);
  const genericList = useMemo(() => Object.values(genericByKind).flat(), [genericByKind]);
  // Capture-harness hook (see eyesHarness.ts): the loaded generic entities by id, so a shot can
  // navigate to a sign-in or a key event without a DOM click.
  useEffect(() => {
    (window as unknown as { __ffrGenericEntities?: Entity[] }).__ffrGenericEntities = genericList;
  }, [genericList]);

  // The case-mode bottom stack (attribution + ticker + timeline) rides one bottom-0 flex
  // container. Its height is content-driven, so we publish it as --bottom-stack-h and the
  // clearing surfaces (the Inspector) read `calc(var(--bottom-stack-h) + gap)`. useLayoutEffect
  // sets it pre-paint.
  const bottomStackRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const el = bottomStackRef.current;
    if (!el) return;
    let last = -1; // the height last written; a write of the same value is skipped
    const publish = (h: number) => {
      if (h === last) return;
      last = h;
      document.documentElement.style.setProperty("--bottom-stack-h", `${h}px`);
    };
    // offsetHeight, not a rect: the Panels carry `transition: transform` (theme-flip motion), and
    // a rect read mid-flip is TRANSFORMED; offsetHeight is the integer layout height. It forces a
    // layout, so it is read at mount and after a content change, never from a resize entry (its
    // border box is the same height) and never while playing (T1, BACKLOG item 20).
    const measure = () => publish(el.offsetHeight);
    measure();
    const ro = new ResizeObserver((entries) => {
      const box = entries[entries.length - 1]?.borderBoxSize?.[0];
      return box ? publish(Math.round(box.blockSize)) : measure();
    });
    ro.observe(el);
    // The Timeline's nodes arrive a render AFTER this effect and the ResizeObserver did not fire on
    // that reflow (the var stuck at 127px, not the settled 172px), so a childList observer
    // re-measures. Ticker updates are characterData, so it is quiet per frame; while playing it
    // waits, and the height is read once when play stops.
    const mo = new MutationObserver(() => usePlayhead.getState().isPlaying || measure());
    mo.observe(el, { childList: true, subtree: true });
    const unsubscribe = usePlayhead.subscribe((s, prev) => prev.isPlaying && !s.isPlaying && measure());
    return () => {
      ro.disconnect();
      mo.disconnect();
      unsubscribe();
    };
  }, []);

  // The rAF playback driver is mounted ONCE here (headless - it renders nothing and
  // subscribes to the playhead store directly), outside the Timeline component.
  usePlaybackDriver();

  // Feed the pivot-data store so leaf badge fields (SessionField) and the
  // NarrativeLog rail can read datasets without prop-drilling. Mirrors the
  // loaded arrays 1:1. The opening focus and the share link read the same rows.
  const caseRows = useMemo(
    () => ({ transactions, logins, accountEvents, transfers, entities: genericList }),
    [transactions, logins, accountEvents, transfers, genericList],
  );
  const setPivotData = usePivotData((s) => s.setPivotData);
  useEffect(() => setPivotData(caseRows), [caseRows, setPivotData]);
  // A share link opens the case where it says; afterwards the address bar follows the screen.
  useShareLink({ rows: caseRows, map: mapInstance });
  // Custom notes: the backing, the load once the scenario is known, the Inspector renderer, the unload question.
  useNotesBoot();

  // Case data bounds, cached so the generic kinds' span can be unioned into them.
  const caseBoundsRef = useRef<{ min: number; max: number } | null>(null);
  // The generic kinds' span, unioned into the playhead bounds whichever of the
  // case bundle or the generic read lands first.
  const genericBoundsRef = useRef<Bounds | null>(null);
  // The opening focus's latch (see the opening-focus effect below); declared here because the generic kinds' effect reads it.
  const bootFocusedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    // A population-scale pack declares no manifest
    // focal, so an unscoped /api/transactions here would pull the ENTIRE
    // transactions table (~198MB) - rows the case view never renders. When
    // skipping, each leg resolves an empty set instead of fetching, so the case
    // sets clear through the SAME resolved-promise path (setState stays in the
    // .then callback, never a synchronous cascade in the effect body). A focal-declaring
    // pack (card-fraud, priya-ato) fetches normally.
    const skipCaseBundle = shouldSkipUnscopedCaseBundle(hasManifestFocal);

    Promise.all([
      skipCaseBundle
        ? Promise.resolve([] as Transaction[])
        : fetch("/api/transactions").then((r) => {
            if (!r.ok) throw new Error(`transactions HTTP ${r.status}`);
            return r.json() as Promise<Transaction[]>;
          }),
      skipCaseBundle
        ? Promise.resolve([] as LoginEvent[])
        : fetch("/api/logins").then((r) => {
            if (!r.ok) throw new Error(`logins HTTP ${r.status}`);
            return r.json() as Promise<LoginEvent[]>;
          }),
      // Places context - ambient.
      // Caches forever after the first hit. If the demo key is misconfigured,
      // the endpoint returns [] and the Places toggle shows zero items - no
      // fatal load error. Skipped population case-boot serves none either.
      skipCaseBundle
        ? Promise.resolve([] as Place[])
        : fetch("/api/places").then((r) => {
            if (!r.ok) return [] as Place[];
            return r.json() as Promise<Place[]>;
          }),
      // Account-scoped behavioral kill-chain kinds via dedicated endpoints that
      // correctly honor account_id. /api/entities has no account_id param so
      // calling it with &account_id= silently ignores the scope and leaks the
      // whole population - the dedicated routes /api/account_events and
      // /api/transfers bind account_id as a WHERE clause. A scenario without
      // these tables answers 200 [] (absence is data).
      skipCaseBundle
        ? Promise.resolve([] as AccountEvent[])
        : fetch("/api/account_events").then((r) => {
            if (!r.ok) return [] as AccountEvent[];
            return r.json() as Promise<AccountEvent[]>;
          }),
      skipCaseBundle
        ? Promise.resolve([] as Transfer[])
        : fetch("/api/transfers").then((r) => {
            if (!r.ok) return [] as Transfer[];
            return r.json() as Promise<Transfer[]>;
          }),
    ])
      .then(([tx, lg, pl, ae, tr]) => {
        if (cancelled) return;
        setTransactions(tx);
        setLogins(lg);
        setPlaces(pl);
        setAccountEvents(ae);
        setTransfers(tr);
        // Set playhead bounds to the case's span.
        // (Places have no temporal dimension - they're ambient.)
        const times = [
          ...tx.map((t) => Date.parse(t.timestamp)),
          ...lg.map((l) => Date.parse(l.timestamp)),
          ...ae.map((e) => Date.parse(e.timestamp)),
          ...tr.map((t) => Date.parse(t.timestamp)),
        ];
        if (times.length > 0) {
          const caseMin = Math.min(...times);
          const caseMax = Math.max(...times);
          const b = unionBounds({ min: caseMin, max: caseMax }, genericBoundsRef.current);
          if (b) {
            caseBoundsRef.current = b;
            setBounds(b.min, b.max);
          }
        }
      })
      .catch((err: Error) => {
        if (!cancelled) setLoadError(err.message);
      });
    return () => {
      cancelled = true;
    };
  }, [setBounds, hasManifestFocal]);

  // Generic kinds carry timestamps too: widen the bounds to include them. They can land after the case
  // rows, so a playhead the opening focus or the visitor has placed stays put (widenBounds); only a
  // playhead no one has placed, still at the end of what had arrived, goes to the new end (setBounds).
  useEffect(() => {
    const gb = entityBounds(genericList);
    if (!gb) return;
    genericBoundsRef.current = gb;
    const b = unionBounds(caseBoundsRef.current, gb);
    if (!b) return;
    caseBoundsRef.current = b;
    const { playhead: at, maxTime: end } = usePlayhead.getState();
    if (!bootFocusedRef.current && at === end) setBounds(b.min, b.max);
    else widenBounds(b.min, b.max);
  }, [genericList, setBounds, widenBounds]);

  // Register the FFR-seed renderers in the entity registry. Closure-at-
  // registration captures transactions/logins; the effect re-runs when
  // data updates so renderers always see the current snapshot. This
  // preserves entity.ts's single-arg (entity) => ReactNode signature -
  // keeping the platform seam unsealed (no RenderContext re-introduction).
  useEffect(() => {
    entityRendererRegistry.set("auth", {
      inspectorBody: (entity) => (
        <AuthInspector
          tx={entity.fields as unknown as Transaction}
          transactions={transactions}
          logins={logins}
        />
      ),
    });
    entityRendererRegistry.set("fraud", {
      inspectorBody: (entity) => (
        <FraudInspector
          tx={entity.fields as unknown as Transaction}
          transactions={transactions}
          logins={logins}
        />
      ),
    });
    entityRendererRegistry.set("login", {
      inspectorBody: (entity) => (
        <LoginInspector
          login={entity.fields as unknown as LoginEvent}
          logins={logins}
        />
      ),
    });
    entityRendererRegistry.set("place", {
      inspectorBody: (entity) => (
        <PlaceInspector
          place={entity.fields as unknown as Place}
          transactions={transactions}
        />
      ),
    });
    entityRendererRegistry.set("account_event", {
      inspectorBody: (entity) => (
        <AccountEventInspector event={entity.fields as unknown as AccountEvent} />
      ),
    });
    entityRendererRegistry.set("transfer", {
      inspectorBody: (entity) => (
        <TransferInspector transfer={entity.fields as unknown as Transfer} />
      ),
    });
    return () => {
      entityRendererRegistry.delete("auth");
      entityRendererRegistry.delete("fraud");
      entityRendererRegistry.delete("login");
      entityRendererRegistry.delete("place");
      entityRendererRegistry.delete("account_event");
      entityRendererRegistry.delete("transfer");
    };
  }, [transactions, logins, transfers]);

  // PivotContext for the matches table - behavioral kinds included so a
  // session_id match lists the whole kill chain. Always the whole case.
  const matchContext: Required<PivotContext> = useMemo(
    () => ({ transactions, logins, places, accountEvents, transfers, entities: genericList }),
    [transactions, logins, places, accountEvents, transfers, genericList],
  );

  // A note's link to its record and that record's place, from the whole case (the notes menu and the globe's marks).
  const noteLookup = useMemo(() => lookupFromContext(matchContext), [matchContext]);

  // The solo (store/solo.ts) and then the Layers switches (a kind or value switched off, lib/marks/draw)
  // are derived ONCE, here: the globe's markers, the layer counts, the paths and hull, and the ticker
  // read shownContext and cannot disagree. With neither it is matchContext itself (same identities).
  // Not narrowed: matchContext (Matches, pinned windows), the Timeline's data (it narrows itself, and
  // a lane's top needs the whole case), places, and entitiesByKind (the reached decisions and the
  // opening focus).
  const solo = useSolo((s) => s.solo);
  const soloContext = useMemo(
    () => narrowBySolo(matchContext, solo) as Required<PivotContext>, // a present list stays present
    [matchContext, solo],
  );
  const show = useShowInputs();
  const shownContext = useMemo(
    () => narrowByShown(soloContext, show) as Required<PivotContext>, // a present list stays present
    [soloContext, show],
  );
  const { transactions: soloTransactions, logins: soloLogins, accountEvents: soloAccountEvents } = shownContext;
  const { transfers: soloTransfers, entities: soloEntities } = shownContext;

  // Visible sets - filtered to events at or before the playhead. Before
  // bounds load, show full sets so the globe doesn't flash empty.
  const visibleTransactions = useMemo(() => {
    if (maxTime <= minTime) return soloTransactions;
    return soloTransactions.filter((t) => Date.parse(t.timestamp) <= playhead);
  }, [soloTransactions, playhead, minTime, maxTime]);

  const visibleLogins = useMemo(() => {
    if (maxTime <= minTime) return soloLogins;
    return soloLogins.filter((l) => Date.parse(l.timestamp) <= playhead);
  }, [soloLogins, playhead, minTime, maxTime]);

  // Manifest-declared kinds on the globe: placeable entities the playhead has
  // reached, same windowing rule as the markers above.
  const visibleGenericEntities = useMemo(
    () => visibleGeneric(soloEntities, playhead, maxTime > minTime),
    [soloEntities, playhead, minTime, maxTime],
  );

  // Compose the schema-driven ticker stream - NOT windowed by the playhead. The ticker
  // derives the "current" event from the playhead position
  // (most-recent-at-or-before), but it needs the full chronology
  // available so arrow stepping (spec § 3) can advance through ALL
  // events in both directions. If filtered, stepping forward can never
  // advance past the current playhead - defeats the stepping primitive.
  // Only a solo narrows it: the arrow keys then step through the soloed row's events alone.
  // Transactions split fraud/auth by is_fraud, matching the manifests'
  // separate auth/fraud node queries (same split as entitiesByKind);
  // row metadata (label/palette/primary/secondary) flows from the
  // manifest nodes, so every kind the schema declares streams free.
  const tickerItems: TickerItem[] = useMemo(() => {
    const fraudRows: Transaction[] = [];
    const authRows: Transaction[] = [];
    for (const tx of soloTransactions) (tx.is_fraud ? fraudRows : authRows).push(tx);
    return buildTickerStream(
      {
        auth: asRows(authRows),
        fraud: asRows(fraudRows),
        login: asRows(soloLogins),
        account_event: asRows(soloAccountEvents),
        transfer: asRows(soloTransfers),
      },
      schemaNodes,
    );
  }, [soloTransactions, soloLogins, soloAccountEvents, soloTransfers, schemaNodes]);

  // Build per-kind Entity arrays from the FULL (unfiltered) lists so Path
  // geometry covers the whole arc. The playhead cascade reveals arcs over
  // time inside GlobeMap; computing paths from visibleTransactions/logins
  // would drop arcs that haven't been reached yet.
  const entitiesByKind = useMemo<Record<string, Entity[]>>(() => {
    const fraud: Entity[] = [];
    const auth: Entity[] = [];
    for (const tx of transactions) (tx.is_fraud ? fraud : auth).push(transactionToEntity(tx));
    const login = logins.map(loginToEntity);
    const byKind: Record<string, Entity[]> = { fraud, auth, login, ...genericByKind };
    // Behavioral lanes exist only when the scenario carries them - an empty
    // array would render an empty lane on every scenario.
    if (accountEvents.length > 0) byKind.account_event = accountEvents.map(accountEventToEntity);
    if (transfers.length > 0) byKind.transfer = transfers.map(transferToEntity);
    return byKind;
  }, [transactions, logins, accountEvents, transfers, genericByKind]);
  // The paths (and the hull) are built from the soloed entities the switches show: a copy of
  // entitiesByKind, which itself stays whole for the decisions below.
  const soloByKind = useMemo<Record<string, Entity[]>>(() => {
    if (shownContext === matchContext) return entitiesByKind;
    const kept = [...soloTransactions, ...soloLogins, ...soloAccountEvents, ...soloTransfers, ...soloEntities];
    const keep = new Set<string>(kept.map((r) => r.id));
    return Object.fromEntries(
      Object.entries(entitiesByKind).map(([kind, list]) => [kind, list.filter((e) => keep.has(e.id))]),
    );
  }, [shownContext, matchContext, entitiesByKind, soloTransactions, soloLogins, soloAccountEvents, soloTransfers, soloEntities]);
  const paths = usePaths(soloByKind);

  // Feed the decision-data store with the playhead-gated decision list so the
  // Inspector's DECISIONS pills render without prop-drilling. The store's own
  // id-signature guard absorbs the per-frame playhead churn.
  const setReached = useDecisionData((s) => s.setReached);
  useEffect(() => {
    setReached(reachedDecisions(decisions, playhead, entitiesByKind));
  }, [decisions, playhead, entitiesByKind, setReached]);

  // Open the case on its MARQUEE FINDING, not the trailing auth.
  // On load the playhead pins to maxTime, so the default entity is an ordinary
  // last auth and the top finding's pill stays hidden behind DecisionsSection's
  // relevance gate with nothing auto-selected. Auto-navigate to the top-severity
  // reached decision's landing trigger: that both mounts the Inspector and makes
  // the decision relevant, so the finding is the opening frame. bootFocusEntity
  // is playhead-INDEPENDENT (evaluated at maxTime) - this effect is NOT a
  // playhead-tick reaction and deliberately omits `playhead` from its deps. The
  // latch fires it exactly ONCE (a scenario switch reloads App);
  // after that a user scrub/click is never yanked back. NO-OP for a
  // population pack: no reached finding => null, so we neither
  // navigate nor latch (a later data arrival can still focus). navigate() pauses
  // the playhead, already paused on boot, so the rAF driver is never fought.
  useEffect(() => {
    if (bootFocusedRef.current) return;
    if (maxTime <= minTime || (scenarioHome === undefined && !linkHoldsCamera)) return; // bounds or opening camera not known yet
    // A share link decides how the case first opens (hooks/useShareLink): stand down, latched.
    const linked = linkOpensCase(caseRows);
    // The rule decisions' finding first, as always. A pack that has none (its case is a manifest
    // decision node) opens on the record that decision names, but only once the rule read has
    // settled: before that an empty list means "not yet", and a pack with rules must not open early.
    const focus = linked
      ? null
      : (bootFocusEntity(decisions, caseRows, entitiesByKind, maxTime) ??
        (decisionsLoaded ? overlayFocusEntity(schemaNodes, caseRows) : null));
    if (!focus && !linked) return; // population / no reached finding: do NOT latch, allow retry
    const opening = !!scenarioHome || linkHoldsCamera; // the map opened on a chosen camera
    bootFocusedRef.current = true;
    if (focus) useNavigation.getState().navigate(focus, opening ? { pan: false } : undefined);
  }, [decisions, decisionsLoaded, schemaNodes, entitiesByKind, caseRows, minTime, maxTime, scenarioHome]);

  return (
    <div className="h-screen w-screen relative bg-ground overflow-clip font-display">
      {/* Dead-tab guard: self-hides until a backend restart or a dead HMR
          socket makes this tab's world stale. Must outlive every view. */}
      <StalenessBanner />
      {/* G3: visually-hidden aria-live region; announces session-thread transitions to SR. */}
      <SrAnnouncer />
      {/* Deep-space backdrop - sits BEHIND the transparent globe canvas (earlier in
          DOM, no z-index, so it paints under GlobeMap's canvas). MapLibre leaves the
          off-globe region transparent under globe projection (verified by probe
          2026-06-18: sky-color is inert under globe, #5230), so this shows ONLY
          through the void around the sphere - the globe sphere is its own mask. Dark
          in BOTH themes (space does not change with the UI theme); kills the
          light-mode white void. Pure CSS, so the destructive setStyle theme swap
          never wipes it (unlike maplibre layers). */}
      <div aria-hidden="true" className="globe-space absolute inset-0 pointer-events-none" />
      <RecoveringGlobeMap
        transactions={visibleTransactions}
        logins={visibleLogins}
        places={places}
        genericEntities={visibleGenericEntities}
        paths={paths}
        onMapReady={setMapInstance}
        scenarioHome={scenarioHome}
      />

      {/* Ground atmosphere - near-invisible grain + low radial vignette so the
          black ground reads as depth, not a flat fill. Sits above the globe
          canvas (z-[1]) and below all HUD chrome (z-10+); pointer-events-none
          so it never intercepts a map drag. (Design-elevation brief § 1.) */}
      <div
        aria-hidden="true"
        className="ground-atmosphere absolute inset-0 z-[1] pointer-events-none"
      />

      {/* Top-left: identity + case header. The scenario line is live (select + reload).
          z-30: the switcher dropdown lives in this stacking context and must open over
          the narrative rail (z-20) just below it (FIX-2026-11-13). */}
      {/* The top row (2026-11-19, text size): the title card, then the menu group, in one
          zoomed grid (index.css `.top-row`). The cluster stays at the
          window's centre while the outer columns can hold the title card and the Inspector; when
          they cannot, the title card gives way (its lines are cut with an ellipsis) and the
          cluster keeps clear of the Inspector's width, which the third column reserves while it
          is open. The wrapper takes no pointer and makes no stacking context, so each child keeps
          the layer it had (the card z-30, the cluster z-40). Tab order: the card, then the cluster. */}
      <div
        className="top-row chrome-zoom absolute left-3 right-3 grid items-start pointer-events-none"
        data-inspector={inspectorOpen ? "open" : undefined}
      >
      <Panel
        material="instrument"
        elevation="raised"
        radius="md"
        className="relative col-start-1 row-start-1 z-30 min-w-0 max-w-full justify-self-start pointer-events-auto px-3 py-2"
      >
        {/* The name line: its label is cut with an ellipsis when the card gives way, and the
            tooltip holds the whole name. (It was pointer-events-none, which sent a hover to the
            card behind it; the card takes the pointer anyway, so the map loses nothing.) */}
        <div className="flex items-baseline gap-2" {...tip(["Fraud Forensic Replay"])}>
          <span
            className="text-[12px] font-extrabold tracking-ultra font-display"
            style={{ color: "var(--r1-on-panel)" }}
          >
            FFR
          </span>
          <Eyebrow tone="muted" className="min-w-0 truncate">Fraud Forensic Replay</Eyebrow>
        </div>
        <div className="mt-1">
          <ScenarioSwitcher
            onError={() => setScenarioHome(null)}
            onActive={(s) => {
              useSchema.getState().setActive(s.id, s.nodes, { rows: s.rows, fields: s.fields, lanes: s.lanes });
              useLayers.getState().seedPathKinds(s.nodes);
              setScenarioHome(s.home ?? null);
              setScenarioAnnotations(s.annotations ?? []);
              // A manifest with no focal is a population-scale pack; its
              // case-boot must not pull the whole table (see the case-boot effect).
              setHasManifestFocal(s.focal != null);
            }}
          />
        </div>
      </Panel>

      {/* The menu group: the Layers and Paths menus, the Notes menu, then the reset button and the
          visual-settings gear, on one flex row, the second column of the top row. The map controls
          sit in the bar, so nothing of theirs sits under the Inspector. */}
      <div className="top-row-menu relative col-start-2 row-start-1 z-40 flex items-stretch gap-2 pointer-events-auto">
        <MapMenus
          transactions={transactions} logins={logins} places={places} transfers={transfers}
          visibleTransactions={visibleTransactions} visibleLogins={visibleLogins}
          loadError={loadError} genericByKind={genericByKind}
        />
        <NotesMenu lookup={noteLookup} />
        <ResetViewButton map={mapInstance} home={scenarioHome} />
        <ThemeSwitcher />
      </div>
      </div>

      {/* Right-side: Inspector - opens on marker click. Data flows via
          entityRendererRegistry closures registered above. */}
      <Inspector />

      {/* No floating rule chrome: decisions
          surface ONLY as Inspector DECISIONS pills -> the rule-mode breakout.
          The technical trace is a floating RuleTraceWindow,
          opened via usePivotStore.openTrace from the rule-mode breakout's
          VIEW RULE DESCRIPTION link - no longer a fixed docked mount here. */}

      {/* Matches table - the one breakout surface: field mode (×N badges) and
          rule mode (DecisionPill → brief card + matched events). */}
      <MatchesTable context={matchContext} decisions={decisions} />

      {/* Evidence Workspace: docked chronological rail + floating
          glance/pinned/flagged windows. Mounted AFTER MatchesTable so floating
          evidence paints over the docked breakout at equal z (see the layer's
          z-authority note). */}
      <NarrativeLog />
      <PivotWindowsLayer map={mapInstance} decisions={decisions} context={matchContext} />
      <NoteGlobeLayer map={mapInstance} lookup={noteLookup} />

      {/* Bottom stack extracted to CaseBottomStack; App keeps the observer
          that publishes --bottom-stack-h. */}
      <CaseBottomStack
        stackRef={bottomStackRef}
        tickerItems={tickerItems}
        transactions={transactions}
        logins={logins}
        accountEvents={accountEvents}
        transfers={transfers}
        genericEntities={genericList}
        annotations={scenarioAnnotations}
      />

      <DataErrors errors={[loadError, decisionsError]} />
      {/* The one tooltip layer, for the whole screen (position: fixed, so its place here changes nothing). */}
      <TipLayer />
    </div>
  );
}
