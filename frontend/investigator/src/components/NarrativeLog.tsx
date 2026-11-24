import { useMemo, useState } from "react";
import { usePlayhead } from "../store/playhead";
import { useSelection } from "../store/selection";
import { usePivotData } from "../store/pivot-data";
import { useShowInputs } from "../store/marks";
import { drawRecordOf, isShown } from "../lib/marks/draw";
import { PivotBadge } from "./pivot/PivotBadge";
import { TargetButton } from "./target/TargetButton";
import { relatedEntities, type EntityMatch } from "../lib/matches";
import { kindRgbVar } from "../lib/entity-palette";
import type { LoginEvent, Transaction } from "../types";

const HOU_TZ = "America/Chicago";

type Row =
  | { kind: "auth" | "fraud"; t: Transaction; ts: number }
  | { kind: "login"; l: LoginEvent; ts: number };

/** Stable empty result so downstream memos don't churn on empty frames. */
const EMPTY_ROWS: Row[] = [];

// Built once: the log redraws at every playback frame, and building a formatter for each row of
// each frame cost 116 ms of script in 3,000 on the card story.
const TS_FORMAT = new Intl.DateTimeFormat("en-US", {
  timeZone: HOU_TZ, hour: "numeric", minute: "2-digit", hour12: true,
});

function formatTs(iso: string): string {
  return TS_FORMAT.format(new Date(iso));
}

/** Docked collapsible left rail - the chronological spine. Last 8 events at
 *  or before the playhead; row click pauses + selects; the hover ×N badges
 *  open glance windows (quick-look, no selection change). Zero props: data
 *  from usePivotData, time from usePlayhead (playhead-as-truth). */
export function NarrativeLog() {
  const playhead = usePlayhead((s) => s.playhead);
  const minTime = usePlayhead((s) => s.minTime);
  const maxTime = usePlayhead((s) => s.maxTime);
  const pause = usePlayhead((s) => s.pause);
  const selectTransaction = useSelection((s) => s.selectTransaction);
  const selectLogin = useSelection((s) => s.selectLogin);
  const transactions = usePivotData((s) => s.transactions);
  const logins = usePivotData((s) => s.logins);
  // The Layers switches act on the rows (the one function, lib/marks/draw); the counts below stay whole.
  const show = useShowInputs();
  const [collapsed, setCollapsed] = useState(false);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // HOT PATH: usePlaybackDriver writes playhead every rAF frame, so this
  // component re-renders at ~60fps during playback. Sort the merged rows
  // ONCE per dataset change; per frame only a binary search runs, and
  // `recent` keeps a STABLE reference while the visible ids are unchanged
  // so the counts memo below never re-walks the datasets mid-playback
  // (at 43k-row population scale the old
  // filter+sort-per-frame shape real jank).
  const sorted: Row[] = useMemo(() => {
    const all: Row[] = [
      ...transactions.map<Row>((t) => ({
        kind: t.is_fraud ? "fraud" : "auth", t, ts: Date.parse(t.timestamp),
      })),
      ...logins.map<Row>((l) => ({ kind: "login", l, ts: Date.parse(l.timestamp) })),
    ].filter((r) => isShown(drawRecordOf(r.kind === "login" ? { kind: "login", login: r.l } : { kind: r.kind, tx: r.t }), show));
    return all.sort((a, b) => a.ts - b.ts);
  }, [transactions, logins, show]);

  const visibleIndex = (() => {
    if (maxTime <= minTime || sorted.length === 0) return -1;
    // Rightmost row with ts <= playhead.
    let lo = 0, hi = sorted.length - 1, idx = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (sorted[mid].ts <= playhead) { idx = mid; lo = mid + 1; }
      else hi = mid - 1;
    }
    return idx;
  })();

  const recent: Row[] = useMemo(
    () => visibleIndex < 0
      ? EMPTY_ROWS
      : sorted.slice(Math.max(0, visibleIndex - 7), visibleIndex + 1).reverse(),
    [sorted, visibleIndex],
  );

  // Precompute badge counts once per render (relatedEntities is O(n) per call).
  const counts = useMemo(() => {
    const txCtx = { transactions, logins, places: [] };
    const loginCtx = { transactions: [], logins, places: [] };
    const map = new Map<string, { mcc?: number; merchant_country?: number; device_fp?: number }>();
    for (const e of recent) {
      if (e.kind === "login") {
        map.set(e.l.id, { device_fp: relatedEntities("device_fp", e.l.device_fp, loginCtx).length });
      } else {
        map.set(e.t.id, {
          mcc: relatedEntities("mcc", e.t.mcc, txCtx).length,
          merchant_country: relatedEntities("merchant_country", e.t.merchant_country, txCtx).length,
        });
      }
    }
    return map;
  }, [recent, transactions, logins]);

  if (recent.length === 0) return null;

  return (
    <aside
      className="chrome-zoom absolute top-3 left-3 z-20 mt-[68px] flex flex-col max-h-[min(calc(var(--vh-c)_*_0.6),calc(var(--vh-c)_-_var(--bottom-stack-c)_-_87px))] overflow-hidden rounded-[14px] backdrop-blur-[8px] w-[288px]"
      style={{
        // Compositor-only fold (spec §5 binding budget): the shell keeps a
        // FIXED 288px width and collapses via clip-path to its left 44px
        // control strip - width/height are never animated. Same technique
        // family as WindowFrame's collapse-to-bar.
        clipPath: collapsed
          ? "inset(0 244px 0 0 round 14px)"
          : "inset(0 0 0 0 round 14px)",
        transition: "clip-path var(--dur-normal) var(--ease-out-expo)",
        background: "linear-gradient(180deg, rgb(var(--panel-top)/0.78), rgb(var(--panel-base)/0.86))",
        boxShadow: "inset 0 0 0 1px rgb(var(--edge-light) / 0.10)",
      }}
    >
      <div className="flex items-center gap-2 px-3 py-2 border-b border-[color:var(--hairline,#2C343F)]">
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="w-5 h-5 rounded flex items-center justify-center font-mono text-[11px] text-[color:var(--text-faint)] bg-[rgb(var(--panel-floor)/0.7)] hover:text-[color:var(--text-muted)]"
          aria-label={collapsed ? "Open the narrative" : "Fold the narrative"}
        >
          {collapsed ? "›" : "‹"}
        </button>
        {!collapsed && (
          <span className="font-mono text-[9px] uppercase tracking-[0.22em] text-[color:var(--narrative-header)] whitespace-nowrap">
            Narrative
          </span>
        )}
      </div>
      {!collapsed && (
        <div className="overflow-y-auto">
          {recent.map((e) => {
            const entity: EntityMatch =
              e.kind === "login" ? { kind: "login", login: e.l } : { kind: e.kind, tx: e.t };
            const id = e.kind === "login" ? e.l.id : e.t.id;
            const isHovered = hoveredId === id;
            const c = counts.get(id);
            const label =
              e.kind === "login"
                ? e.l.device_fp
                : `$${e.t.amount.toFixed(2)} · ${e.t.merchant_name}`;
            const onRow = () => {
              pause();
              if (e.kind === "login") selectLogin(e.l);
              else selectTransaction(e.t);
            };
            return (
              <div
                key={id}
                role="button"
                tabIndex={0}
                onClick={onRow}
                onKeyDown={(ev) => {
                  if (ev.target !== ev.currentTarget) return;
                  if (ev.key === "Enter" || ev.key === " ") { ev.preventDefault(); onRow(); }
                }}
                onMouseEnter={() => setHoveredId(id)}
                onMouseLeave={() => setHoveredId((cur) => (cur === id ? null : cur))}
                className="relative w-full text-left pl-3 pr-2 py-1.5 border-b border-[rgba(44,52,63,0.6)] last:border-0 hover:bg-white/5 cursor-pointer focus:outline-none flex items-center gap-2"
              >
                {/* kind-accent row spine */}
                <span
                  aria-hidden
                  className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-4 rounded-r"
                  style={{ background: `rgb(var(${kindRgbVar(e.kind)}))` }}
                />
                <span className="font-mono text-[9px] text-[color:var(--narrative-time)] whitespace-nowrap">
                  {formatTs(e.kind === "login" ? e.l.timestamp : e.t.timestamp)}
                </span>
                <span className="flex-1 min-w-0 font-mono text-[10px] text-[color:var(--text)] truncate">
                  {label}
                </span>
                {isHovered && e.kind !== "login" && c?.mcc !== undefined && (
                  <PivotBadge entity={entity} field="mcc" value={e.t.mcc} count={c.mcc} baseline={0} />
                )}
                {isHovered && e.kind !== "login" && c?.merchant_country !== undefined && (
                  <PivotBadge entity={entity} field="merchant_country" value={e.t.merchant_country} count={c.merchant_country} baseline={0} />
                )}
                {isHovered && e.kind === "login" && c?.device_fp !== undefined && (
                  <PivotBadge entity={entity} field="device_fp" value={e.l.device_fp} count={c.device_fp} baseline={0} />
                )}
                <TargetButton entity={entity} variant="row" />
              </div>
            );
          })}
        </div>
      )}
    </aside>
  );
}
