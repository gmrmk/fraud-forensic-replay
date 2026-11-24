import { useEffect, useState } from "react";
import { fetchHealth } from "../lib/health";
import { Panel, FocusButton } from "./ui";

const POLL_MS = 30_000;

interface StalenessBannerProps {
  /** Injected for tests; defaults to a full page reload. */
  reload?: () => void;
}

/**
 * Dead-tab guard (user-ratified 2026-06-11, plan U0): the backend's
 * process-global state resets on restart and a Vite restart orphans the
 * bundle, both silently. This banner makes staleness VISIBLE instead of
 * letting a stale tab impersonate the app. boot_id polling catches backend
 * restarts; the HMR-socket listener catches dev-server death.
 */
export function StalenessBanner({
  reload = () => window.location.reload(),
}: StalenessBannerProps) {
  const [stale, setStale] = useState(false);

  useEffect(() => {
    let baseline: string | null = null;
    let cancelled = false;
    let retryId: ReturnType<typeof setTimeout> | null = null;

    const poll = async () => {
      try {
        const h = await fetchHealth();
        if (cancelled) return;
        if (baseline === null) {
          baseline = h.boot_id;
        } else if (h.boot_id !== baseline) {
          setStale(true);
        }
      } catch {
        // Backend unreachable: data fetches already surface that. This is
        // specifically a RESTART detector, not a liveness one.
        //
        // If the FIRST poll fails (baseline still null), schedule a
        // short retry so the baseline is set quickly. Without this, the next
        // interval tick (30s later) becomes the first successful poll and
        // silently adopts whatever boot_id the backend has at that point -
        // making any restart that happened during the outage undetectable.
        // A 3s retry closes the window without hammering the backend.
        if (baseline === null && !cancelled) {
          retryId = setTimeout(() => void poll(), 3_000);
        }
      }
    };
    void poll();
    const id = setInterval(() => void poll(), POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(id);
      if (retryId !== null) clearTimeout(retryId);
    };
  }, []);

  useEffect(() => {
    if (import.meta.hot) {
      import.meta.hot.on("vite:ws:disconnect", () => setStale(true));
    }
  }, []);

  if (!stale) return null;
  // Instrument-B material - an instrument Panel on the
  // dedicated alarm channel (accent -> --panel-accent = var(--alarm)) instead of
  // a flat vermillion flood (which collapses to a flat gray in monochrome). The
  // alarm reads through COLOR where present and through the redundant ▲ glyph +
  // all-caps copy where it can't, per the locked CVD discipline. Its square edges
  // (rounded-none) keep it flush to the viewport top.
  return (
    <Panel
      material="instrument"
      accent="var(--alarm)"
      role="alert"
      // A fixed height (2rem): the top row's menu group sits below it by exactly this much while it
      // shows (index.css, `.top-row-menu`), so the group's buttons are not under it. `grid content-center`
      // centres the one line without padding that would make the height depend on its content.
      className="stale-banner chrome-zoom absolute top-0 left-0 right-0 z-50 grid h-8 content-center rounded-none px-4"
    >
      <div
        className="flex items-center justify-center gap-3 font-mono text-[10px] font-bold uppercase tracking-widest"
        style={{ color: "var(--panel-accent)" }}
      >
        <span data-alarm-cue aria-hidden="true" className="text-[12px] leading-none">
          ▲
        </span>
        <span>SERVER RESTARTED - THIS VIEW MAY BE STALE</span>
        <FocusButton
          variant="chip"
          onClick={reload}
          className="rounded-sm px-2 py-0.5 transition hover:brightness-125"
          style={{ border: "1px solid var(--panel-accent)", color: "var(--panel-accent)" }}
        >
          RELOAD
        </FocusButton>
      </div>
    </Panel>
  );
}
