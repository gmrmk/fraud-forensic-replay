// frontend/investigator/src/components/timeline/ClockSwitch.tsx
// The clock's switch: one button on the bar, after the speed, that reads "12h" or "24h" in the
// speed's shape and turns the one value of the clock's form (calls 5, 11 and 12). The tab, the
// folded line's clock, the spoken value and the hours under the bar all read that value, so a
// press here turns every one of them. The form is an interface preference, not a clock.
//
// The tooltip sits on the button, as the four icon buttons carry theirs: Pill forwards the
// tooltip's attributes to it. The accessible name begins with exactly the text the button shows ("12h"), as WCAG 2.5.3 asks, and
// then says what a press does ("12h. The clock shows the 12 hour form. Press to show the 24 hour form."). The switch registers
// no key handler of its own: the button's own press is all it takes.
import { useClockForm } from "../../store/clock-form";
import { clockSwitch } from "../../lib/tooltip-words/transport";
import { tip } from "../ui/Tip";
import { Pill } from "../ui";

export function ClockSwitch() {
  const h24 = useClockForm((s) => s.h24);
  const toggle = useClockForm((s) => s.toggle);
  const now = h24 ? "24" : "12";
  const next = h24 ? "12" : "24";
  return (
    <span className="inline-flex">
      <Pill
        tone="text"
        size="md"
        {...tip(clockSwitch(h24))}
        aria-label={`${now}h. The clock shows the ${now} hour form. Press to show the ${next} hour form.`}
        onClick={toggle}
        className="min-w-[44px] h-7 justify-center tabular-nums !tracking-normal"
      >
        {`${now}h`}
      </Pill>
    </span>
  );
}
