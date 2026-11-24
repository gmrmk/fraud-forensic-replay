import { PLATE } from "./tone-style";

interface Props { text: string; count?: number }

/** A queued event's flag: the rule's label on the same square neutral plate as a decision's mark,
 *  behind a dotted 2 px rule in the queue colour (a broken rule reads as "not yet decided" without
 *  colour). Dotted, not the board's dashed: a 2 px dashed rule 9 px tall renders as one dash and
 *  looks solid. No pole, no notch. Visual only; the caller wraps it in the button that owns the
 *  name and the action. */
export function QueueFlag({ text, count = 1 }: Props) {
  return (
    <span
      data-queue-flag
      className="inline-flex shrink-0 whitespace-nowrap font-mono text-[9px] leading-none tracking-[0.18em] uppercase font-semibold"
      style={{ background: PLATE, padding: "3px 0" }}
    >
      <span
        style={{
          color: "var(--verdict-queue-on-panel)",
          borderLeftWidth: 2,
          borderLeftStyle: "dotted",
          borderLeftColor: "var(--verdict-queue-on-panel)",
          padding: "0 6px",
        }}
      >
        {count > 1 ? `${text} ×${count}` : text}
      </span>
    </span>
  );
}
