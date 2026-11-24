// frontend/investigator/src/store/tag-menu.test.ts
// The tag menu's request store and its door helper (PLAN-tag-menu 4.4, C1.1). The store holds one open
// request in memory; a door's handler body prevents the page's own menu, never stops the event, and
// names where focus goes back to. Nothing here mounts a menu.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { lookupFromContext } from "../components/notes/record-lookup";
import type { PivotContext } from "../lib/matches";
import type { Place } from "../types";
import { markable, openTagMenuFrom, tickOf, useTagMenu } from "./tag-menu";

const place = (id: string): Place => ({ id, name: "Pier", category: "harbour", lat: 5, lng: 6 });
const CTX: PivotContext = { transactions: [], logins: [], places: [place("pl-1")] };

const reset = () => useTagMenu.setState({ req: null, seq: 0 });
const REC = { kind: "auth", id: "t1" } as const;

/** A button that can take focus. happy-dom reports tabIndex -1 for a bare button (a browser says 0), so the
 *  fixture says it in the markup; the rule under test (`tabIndex >= 0`) is not bent to the tag. */
const focusable = (): HTMLButtonElement => {
  const b = document.createElement("button");
  b.setAttribute("tabindex", "0");
  return b;
};

/** A fake door event: the three things the helper reads, and a stopPropagation that must stay unused. */
function fakeEvent(currentTarget: EventTarget | null, x = 40, y = 50) {
  return { preventDefault: vi.fn(), stopPropagation: vi.fn(), clientX: x, clientY: y, currentTarget };
}

beforeEach(() => {
  reset();
  document.body.replaceChildren();
});

describe("useTagMenu", () => {
  it("open sets the request with a seq one higher each time, and close clears it", () => {
    expect(useTagMenu.getState().req).toBeNull();
    useTagMenu.getState().open({ records: [REC], door: "tick", at: { x: 1, y: 2 }, rect: null, opener: null });
    const first = useTagMenu.getState().req;
    expect(first).toMatchObject({ seq: 1, door: "tick", at: { x: 1, y: 2 }, records: [REC], opener: null, rect: null });
    useTagMenu.getState().open({ records: [REC], door: "row", at: { x: 3, y: 4 }, rect: null, opener: null });
    expect(useTagMenu.getState().req?.seq).toBe(2);
    useTagMenu.getState().close();
    expect(useTagMenu.getState().req).toBeNull();
    // The counter is not reset by a close: the menu remounts on a new seq every opening.
    useTagMenu.getState().open({ records: [REC], door: "row", at: { x: 3, y: 4 }, rect: null, opener: null });
    expect(useTagMenu.getState().req?.seq).toBe(3);
  });
});

describe("openTagMenuFrom", () => {
  it("prevents the page's own menu once, never stops the event, and opens the request from the event's point", () => {
    const button = focusable();
    document.body.append(button);
    const e = fakeEvent(button, 120, 80);
    openTagMenuFrom(e, [REC], "inspector");
    expect(e.preventDefault).toHaveBeenCalledTimes(1);
    expect(e.stopPropagation).not.toHaveBeenCalled();
    expect(useTagMenu.getState().req).toMatchObject({ records: [REC], door: "inspector", at: { x: 120, y: 80 } });
  });

  it("takes the current target as the opener when it is a focusable element", () => {
    const button = focusable();
    document.body.append(button);
    openTagMenuFrom(fakeEvent(button), [REC], "tick");
    expect(useTagMenu.getState().req?.opener).toBe(button);
  });

  it("gives no opener for a hidden mirror, an element that cannot take focus, or a target that is not an element", () => {
    const hidden = focusable();
    hidden.setAttribute("aria-hidden", "true");
    const span = document.createElement("span");
    document.body.append(hidden, span);
    openTagMenuFrom(fakeEvent(hidden), [REC], "row");
    expect(useTagMenu.getState().req?.opener).toBeNull();
    openTagMenuFrom(fakeEvent(span), [REC], "row");
    expect(useTagMenu.getState().req?.opener).toBeNull();
    openTagMenuFrom(fakeEvent(window), [REC], "row");
    expect(useTagMenu.getState().req?.opener).toBeNull();
    openTagMenuFrom(fakeEvent(null), [REC], "row");
    expect(useTagMenu.getState().req?.opener).toBeNull();
  });

  it("takes the opener it is given over the current target, and a given null stays null", () => {
    const button = focusable();
    const other = focusable();
    document.body.append(button, other);
    openTagMenuFrom(fakeEvent(button), [REC], "row", other);
    expect(useTagMenu.getState().req?.opener).toBe(other);
    openTagMenuFrom(fakeEvent(button), [REC], "row", null);
    expect(useTagMenu.getState().req?.opener).toBeNull();
  });

  it("sets the door's box for a tick and for no other door", () => {
    const button = focusable();
    document.body.append(button);
    const box = { left: 10, top: 20, right: 30, bottom: 40, width: 20, height: 20, x: 10, y: 20, toJSON: () => ({}) };
    vi.spyOn(button, "getBoundingClientRect").mockReturnValue(box);
    openTagMenuFrom(fakeEvent(button), [REC], "tick");
    expect(useTagMenu.getState().req?.rect).toEqual({ left: 10, top: 20, right: 30, bottom: 40 });
    for (const door of ["row", "inspector", "globe", "plate"] as const) {
      openTagMenuFrom(fakeEvent(button), [REC], door);
      expect(useTagMenu.getState().req?.rect, door).toBeNull();
    }
  });
});

describe("tickOf", () => {
  it("finds the element whose data-tag-key is the key, and null for none", () => {
    const a = document.createElement("button");
    a.setAttribute("data-tag-key", "auth:t1");
    const b = document.createElement("button");
    b.setAttribute("data-tag-key", "login:l9");
    document.body.append(a, b);
    expect(tickOf("auth:t1")).toBe(a);
    expect(tickOf("login:l9")).toBe(b);
    expect(tickOf("auth:t2")).toBeNull();
  });

  it("compares values, so a key that would break a selector still matches only itself", () => {
    const odd = document.createElement("button");
    odd.setAttribute("data-tag-key", 'x:a"]b');
    document.body.append(odd);
    expect(tickOf('x:a"]b')).toBe(odd);
    expect(tickOf('x:a"')).toBeNull();
  });
});

describe("markable", () => {
  const lookup = lookupFromContext(CTX);

  it("is true for a place the lookup holds", () => {
    expect(markable({ kind: "place", id: "pl-1" }, lookup)).toBe(true);
  });
  it("is false for a record the lookup does not hold", () => {
    expect(markable({ kind: "place", id: "pl-2" }, lookup)).toBe(false);
    expect(markable({ kind: "auth", id: "t1" }, lookup)).toBe(false);
  });
  it("is false for a kind the link check refuses (a colon), without asking the lookup", () => {
    const ask = vi.fn(lookup);
    expect(markable({ kind: "a:b", id: "pl-1" }, ask)).toBe(false);
    expect(ask).not.toHaveBeenCalled();
  });
});
