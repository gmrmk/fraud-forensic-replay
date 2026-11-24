// frontend/investigator/src/components/inspector/RecordRefValue.tsx
// A field with a ref prints the record's name in the id's place, and a press on the name opens the
// record. Which
// fields do this is the manifest's: a node declares `refs`, `record-refs.ts` resolves a value, and
// this file draws what it got. Nothing here names a field or a kind of a pack.
import type { MouseEvent } from "react";
import { selectedToEntity } from "../../lib/adapters/ffr-seed";
import type { EntityMatch } from "../../lib/matches";
import type { ResolvedRef } from "../../lib/record-refs";
import { recordRefName, recordRefWords } from "../../lib/tooltip-words/inspector";
import type { TimeForm } from "../../lib/time-words";
import { useClockForm } from "../../store/clock-form";
import { useNavigation } from "../../store/navigation";
import { tip } from "../ui/Tip";

interface Props {
  /** The field's values: the members of a list, or the one value. */
  values: readonly unknown[];
  /** One result for each value, in the value's order; null where the value names no record. */
  results: readonly (ResolvedRef | null)[];
  /** True when the field's value is a list: each value then stands on a line of its own. */
  list: boolean;
}

// The pivot button's look (ManifestFieldsSection) with one dotted mark under the name, in the text's
// own colour. Each name line is 24 px tall (WCAG 2.5.8, the size route; design R7).
const LINK_CLASS =
  "inline-flex min-h-[24px] items-center text-right underline decoration-dotted underline-offset-2 transition hover:text-[color:var(--r1-on-inspector)] focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent";

export function RecordRefValue({ values, results, list }: Props) {
  const navigate = useNavigation((s) => s.navigate);
  const form: TimeForm = useClockForm((s) => s.h24) ? "24h" : "12h";

  // The press selects the record, pauses the playhead and flies the camera, as every other surface
  // that opens a record does (navigate). Inside the Inspector the scroll then returns to the top and
  // focus goes to the panel, since the pressed button leaves with the record it was in; the panel
  // and the scroll element are read first, while the button is still in them. In a pop-out window
  // there is no such panel, so the window keeps its scroll and its focus.
  const press = (event: MouseEvent<HTMLButtonElement>, match: EntityMatch) => {
    const panel = event.currentTarget.closest<HTMLElement>('aside[aria-label="Inspector"]');
    const scroller = event.currentTarget.closest<HTMLElement>("[data-inspector-scroll]");
    navigate(match);
    if (!panel) return;
    if (scroller) scroller.scrollTop = 0;
    panel.focus();
  };

  const items = results.map((r, i) => {
    if (!r) return <span>{String(values[i])}</span>;
    const at = selectedToEntity(r.match).timestamp;
    return (
      <button
        type="button"
        aria-label={recordRefName(r.kindLabel, r.name)}
        data-record-id={r.id}
        data-record-kind={r.kind}
        {...tip(recordRefWords(r.kindLabel, r.id, Number.isFinite(at) && at > 0 ? at : null, form))}
        onClick={(e) => press(e, r.match)}
        className={LINK_CLASS}
      >
        {r.name}
      </button>
    );
  });

  if (!list) return <>{items[0]}</>;
  return (
    <>
      {items.map((item, i) => (
        <span key={i} className="block">
          {item}
        </span>
      ))}
    </>
  );
}
