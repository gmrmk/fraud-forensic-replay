import { Panel } from "./ui";

/**
 * The compact load-failure readout. A failed fetch must read as "this failed", never as
 * "nothing here" (D4), so every data source that can fail passes its message here and the
 * panel stays up until the source recovers. Null entries are healthy sources.
 */
export function DataErrors({ errors }: { errors: (string | null)[] }) {
  const present = errors.filter((e): e is string => e !== null);
  if (present.length === 0) return null;
  return (
    <Panel
      role="alert"
      accent="var(--alarm)"
      className="chrome-zoom absolute top-16 left-3 z-10 px-3 py-1.5"
    >
      {present.map((e) => (
        <div key={e} className="font-mono text-[10px]" style={{ color: "var(--panel-accent)" }}>
          load error: {e}
        </div>
      ))}
    </Panel>
  );
}
