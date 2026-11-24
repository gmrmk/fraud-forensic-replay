// frontend/investigator/src/components/timeline/rows/GroupBy.tsx
// The grouping control: a button that opens a menu of the
// fields the rows may be grouped by. It takes no props. It reads the manifest (useSchema), the loaded
// rows (usePivotData) and the grouping in force (useTrackBy), so it can be mounted anywhere on the
// bar with one line. What it offers is `groupingOptions`: the manifest's labelled, pivotable fields
// that give a named row. A pack with fewer than two such fields has nothing to switch, so nothing is
// drawn.
//
// The keys follow the bar's other menus, with one change. The arrow keys, Home and End move focus
// through the fields and choose nothing (a choice regroups every row and clears a solo, so one arrow
// press must not make it). Enter, Space and a click choose: the menu closes and focus stays on the
// button. Escape closes it with the grouping as it was (as the bar's other
// menus close on Escape), and so does a press outside or focus leaving.
// The field in force is the checked item and is in the button's name. The change is said once, by
// the rows' list, whose name and row count change with the grouping; this control adds no live region.
// The menu is mounted only while it is open, so the button points at no element that could be absent.
//
// The look is not picked (section 5 item 39): this is the plain version, in the header's own type.
import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { BAR_FOCUS_RING } from "../../../lib/bar-metrics";
import { groupingOf } from "../../../lib/tracks";
import { usePivotData } from "../../../store/pivot-data";
import { useSchema } from "../../../store/schema";
import { chooseGrouping, groupingOptions, useTrackBy } from "../../../store/track-by";
import { Panel } from "../../ui";
import { tip } from "../../ui/Tip";
import { FoldMark } from "../FoldMark";

const FILL = "rgb(var(--text-rgb) / 0.14)";

/** The button's name, and the first line of its tooltip: the word, then the field in force. */
const buttonName = (label: string): string => (label ? `Group: ${label}` : "Group");

export function GroupBy() {
  const nodes = useSchema((s) => s.nodes);
  const rows = useSchema((s) => s.rows);
  const fields = useSchema((s) => s.fields);
  const transactions = usePivotData((s) => s.transactions);
  const logins = usePivotData((s) => s.logins);
  const accountEvents = usePivotData((s) => s.accountEvents);
  const transfers = usePivotData((s) => s.transfers);
  const entities = usePivotData((s) => s.entities);
  const asked = useTrackBy((s) => s.by);

  const options = useMemo(
    () => groupingOptions({ nodes, rows, fields, data: { transactions, logins, accountEvents, transfers, entities } }),
    [nodes, rows, fields, transactions, logins, accountEvents, transfers, entities],
  );
  const current = groupingOf(rows, asked);
  const checked = options.findIndex((o) => o.field === current);

  const [open, setOpen] = useState(false);
  // The item that holds the one Tab stop: the checked one, or the first when none is.
  const [cursor, setCursor] = useState(0);
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) button.current?.focus();
  }, []);

  const toggle = (): void => {
    if (!open) setCursor(Math.max(checked, 0));
    setOpen(!open);
  };

  // On open, focus the item that holds the stop.
  useEffect(() => {
    if (open) itemRefs.current[cursor]?.focus();
    // Only the opening moves focus; the keys move it themselves.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Escape and a press outside close the menu; both listeners exist only while it is open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: globalThis.KeyboardEvent): void => {
      if (e.key !== "Escape") return;
      e.preventDefault();
      close(true);
    };
    const onDown = (e: MouseEvent): void => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("mousedown", onDown);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("mousedown", onDown);
    };
  }, [open, close]);

  if (options.length < 2) return null;

  const pick = (field: string): void => {
    chooseGrouping(field, rows);
    close(true);
  };
  const move = (to: number): void => {
    const next = (to + options.length) % options.length;
    setCursor(next);
    itemRefs.current[next]?.focus();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>): void => {
    const at = itemRefs.current.findIndex((el) => el === e.target);
    if (at < 0) return;
    switch (e.key) {
      case "ArrowDown": e.preventDefault(); move(at + 1); break;
      case "ArrowUp": e.preventDefault(); move(at - 1); break;
      case "Home": e.preventDefault(); move(0); break;
      case "End": e.preventDefault(); move(options.length - 1); break;
      case "Enter":
      case " ": e.preventDefault(); pick(options[at].field); break;
    }
  };
  // Focus that leaves for another element closes the menu. A blur with no target (the window, or a
  // browser that does not focus a button on a click) does not: a press outside is its own handler.
  const onBlur = (e: React.FocusEvent<HTMLDivElement>): void => {
    if (open && e.relatedTarget instanceof Node && !wrap.current?.contains(e.relatedTarget)) setOpen(false);
  };

  const label = checked >= 0 ? options[checked].label : "";
  const name = buttonName(label);
  return (
    <div ref={wrap} className="relative inline-flex" onBlur={onBlur}>
      <button
        ref={button}
        type="button"
        data-group-by
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={name}
        onClick={toggle}
        {...(open ? {} : tip([name, "Each value of this field has one row. Press to open the list of fields."]))}
        className={`flex h-6 shrink-0 items-center whitespace-nowrap px-1.5 text-text ${BAR_FOCUS_RING}`}
        style={{ border: "1px solid rgb(var(--text-rgb) / 0.2)" }}
      >
        <span>Group</span>
        <FoldMark open className="ml-1" />
      </button>
      {open ? (
        <div data-group-menu role="menu" aria-label="Group by" onKeyDown={onKeyDown} className="absolute bottom-full left-0 z-30 mb-1">
          <Panel material="instrument" className="p-1">
            {options.map((option, i) => (
              <button
                key={option.field}
                ref={(el) => {
                  itemRefs.current[i] = el;
                }}
                type="button"
                role="menuitemradio"
                aria-checked={i === checked}
                data-group-option={option.field}
                tabIndex={i === cursor ? 0 : -1}
                onClick={() => pick(option.field)}
                {...tip([option.label, i === checked ? "The rows use this field." : "Press to group the rows by this field."])}
                className={`flex h-6 w-full items-center whitespace-nowrap px-2 text-left text-[10px] normal-case tracking-normal text-text ${BAR_FOCUS_RING}`}
                style={{ backgroundColor: i === checked ? FILL : "transparent" }}
              >
                {option.label}
              </button>
            ))}
          </Panel>
        </div>
      ) : null}
    </div>
  );
}
