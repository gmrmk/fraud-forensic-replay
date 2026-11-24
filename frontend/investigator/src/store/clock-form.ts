// frontend/investigator/src/store/clock-form.ts
// The clock's form: 12 hour or 24 hour. One value for the whole page, so every place that
// draws the clock agrees. It opens on 12 hour, is saved in the browser as an
// interface preference beside the theme, and never enters the share link.
// It is a preference of the interface, not a clock: nothing here reads the time.
import { create } from "zustand";

/** The storage key, written once here; the tests import it. */
export const CLOCK_KEY = "ffr.clock";

/** The form the page opens on: a saved "24" gives the 24 hour form (true); nothing saved,
 *  junk, or storage that throws gives the 12 hour form (false). Read once, not trusted. */
export function initialClockForm(storage?: Pick<Storage, "getItem">): boolean {
  try {
    return (storage ?? localStorage).getItem(CLOCK_KEY) === "24";
  } catch {
    return false;
  }
}

export interface ClockFormState {
  /** True for the 24 hour form, false for the 12 hour form. */
  h24: boolean;
  set: (h24: boolean) => void;
  toggle: () => void;
}

function save(h24: boolean): void {
  try {
    localStorage.setItem(CLOCK_KEY, h24 ? "24" : "12");
  } catch {
    /* best-effort: the form still holds for this session */
  }
}

export const useClockForm = create<ClockFormState>((set) => ({
  h24: initialClockForm(),
  set: (h24) => {
    set({ h24 });
    save(h24);
  },
  toggle: () => {
    const h24 = !useClockForm.getState().h24;
    set({ h24 });
    save(h24);
  },
}));
