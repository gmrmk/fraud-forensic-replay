import { useState } from "react";
import { useClock } from "../store/clock";
import { useData } from "../store/data";
import { visibleTxns } from "../lib/derive";
import { filterTxns } from "../lib/filter";
import { TxnRow } from "../components/TxnRow";

export function Transactions() {
  const t = useClock((s) => s.t);
  const { txns, error } = useData();
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [flaggedOnly, setFlaggedOnly] = useState(false);

  const visible = visibleTxns(txns, t);
  const filtered = filterTxns(visible, { q, category: category || undefined, flaggedOnly });

  const categories = Array.from(new Set(txns.map((tx) => tx.category))).sort();

  return (
    <div>
      <div className="mb-4 flex items-center gap-3 flex-wrap">
        <input
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search transactions…"
          className="bg-panel border border-line rounded-[9px] px-3 py-2 text-ink placeholder:text-faint outline-none focus:border-indigo"
          style={{ fontSize: 13, width: 220 }}
        />
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className="bg-panel border border-line rounded-[9px] px-3 py-2 text-ink outline-none focus:border-indigo"
          style={{ fontSize: 13 }}
        >
          <option value="">All categories</option>
          {categories.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-muted cursor-pointer" style={{ fontSize: 13 }}>
          <input
            type="checkbox"
            checked={flaggedOnly}
            onChange={(e) => setFlaggedOnly(e.target.checked)}
            className="accent-fraud"
          />
          Flagged only
        </label>
      </div>

      {error && (
        <div className="bg-warn-bg border border-warn-line rounded-lg px-4 py-2 mb-4 text-warn text-sm">
          {error}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="bg-panel border border-line rounded-[14px] px-4 py-8 text-center text-muted text-sm">
          {visible.length === 0 ? "No activity yet" : "No transactions match your filters"}
        </div>
      ) : (
        <div className="bg-panel border border-line rounded-[14px] overflow-hidden">
          {filtered.map((tx) => (
            <TxnRow key={tx.id} tx={tx} />
          ))}
        </div>
      )}
    </div>
  );
}
