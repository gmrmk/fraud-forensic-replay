import { formatMoney, odometerDigits, rollDurationMs } from "../lib/money";

const WHEEL_H = 48; // px per digit cell (matches the inline height below)

interface Props {
  value: number;
  /** Playback rate from the shared clock. Scales the roll so the odometer tracks
   *  the playhead: 1x = base, slowmo = long leisurely roll, fast = quick, paused
   *  = base. Direction is carried by the value (rises -> rolls up; the playhead
   *  rewinding drops the balance -> rolls down). */
  rate?: number;
}

/** Balance odometer. Each digit is a wheel (a 0-9 strip); the displayed digit is
 *  selected by `transform: translateY` set declaratively from `value`, and rolled
 *  with a CSS transition whose DURATION tracks the playhead pace (rollDurationMs).
 *  Because the position is declarative + the transition is interruptible, it
 *  re-targets from wherever it is when the value changes mid-roll (no fire-once
 *  animation to thrash, which is why the prior anime.js version snapped during
 *  continuous playback).
 *
 *  NOTE: this intentionally rolls regardless of `prefers-reduced-motion` - the
 *  balance roll is the demo's signature moment, a deliberate product call
 *  (user decision, 2026-06-04). Most components should still honor the setting. */
export function BalanceOdometer({ value, rate = 1 }: Props) {
  const digits = odometerDigits(value);
  const duration = rollDurationMs(rate);

  return (
    <div
      className="flex items-start tnum font-bold text-ink select-none"
      aria-hidden="true"
      style={{ fontSize: 42, lineHeight: "48px", height: 48 }}
    >
      <span>$</span>
      {digits.map((d, i) => (
        <span key={i} className="flex items-start">
          {i === 1 && <span>,</span>}
          {i === 4 && <span>.</span>}
          <span className="inline-block overflow-hidden align-top" style={{ width: "0.62em", height: 48 }}>
            <div
              data-wheel
              className="flex flex-col will-change-transform"
              style={{
                transform: `translateY(${-d * WHEEL_H}px)`,
                transition: `transform ${duration}ms cubic-bezier(0.22, 1, 0.36, 1)`,
              }}
            >
              {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => (
                <span key={n} className="flex items-center justify-center" style={{ height: 48 }}>{n}</span>
              ))}
            </div>
          </span>
        </span>
      ))}
      <span className="sr-only">${formatMoney(value)}</span>
    </div>
  );
}
