/**
 * The pile under the Timeline's track, the component alone, with props built by hand: its one button
 * (name, aria-expanded, tooltip, placement), the press, the column of members it opens, and how focus
 * moves (a member press and Escape both end on the pile). A real Tab walk is a frame's job: this DOM
 * does not move focus on Tab, and no keyboard package is added.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TimelinePile, type TimelinePileProps } from "./TimelinePile";
import { GLYPH_ORIGIN_PX, ROW_STEP_PX, pileWidth, timelineLeft } from "./geometry";
import { pileFace, type PileMember } from "./mark-piles";
import { tip } from "../ui/Tip";
import { pileName } from "../../lib/tooltip-words/marks";
import { returnFocus, takeInitialFocus } from "../../lib/window-focus";

const counts = vi.hoisted(() => ({ plate: 0 }));
vi.mock("./MarkPlate", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./MarkPlate")>();
  return {
    MarkPlate: (p: Parameters<typeof actual.MarkPlate>[0]) => {
      counts.plate += 1;
      return actual.MarkPlate(p);
    },
  };
});

const PILE_KEY = "pile:stop:rec-1";
const PILE_LINES = ["Your marks on 3 records.", "Time: A to B", "You marked PASS: 1", "Press to show each one."];

function pm(key: string, over: Partial<PileMember> = {}): PileMember {
  return { key, time: 1, pinned: false, disposition: "none", dim: false, open: false, ...over };
}
const MEMBERS: TimelinePileProps["members"] = [
  { recordKey: "stop:rec-1", name: "Open your mark: stop: One", lines: ["Your mark on stop: One.", "Pinned."], notes: 1, disposition: "pass", pinned: true, dim: false, open: false },
  { recordKey: "stop:rec-2", name: "Open your mark: stop: Two", lines: ["Your mark on stop: Two."], notes: 0, disposition: "wait", pinned: false, dim: true, open: false },
  { recordKey: "stop:rec-3", name: "Open your mark: stop: Three", lines: ["Your mark on stop: Three.", "Notes: 2"], notes: 2, disposition: "none", pinned: false, dim: false, open: false },
];
const faceOf = (members: TimelinePileProps["members"]) =>
  pileFace(members.map((m) => pm(m.recordKey, { pinned: m.pinned, disposition: m.disposition, dim: m.dim, open: m.open })));

function props(over: Partial<TimelinePileProps> = {}): TimelinePileProps {
  const members = over.members ?? MEMBERS;
  const face = faceOf(members);
  return {
    pileKey: PILE_KEY,
    pct: 40,
    width: pileWidth({ lens: true, records: members.length, glyphs: face.glyphs.length, pinned: face.pinned }),
    face,
    name: pileName(members.length, false),
    lines: PILE_LINES,
    members,
    unfolded: false,
    onToggle: () => {},
    onFold: () => {},
    onMemberOpen: () => null,
    ...over,
  };
}

const pileButton = () => document.querySelector("[data-mark-pile]") as HTMLElement;
const memberButtons = () => Array.from(document.querySelectorAll("button[data-mark]")) as HTMLElement[];
/** A `top` as written: the DOM may keep a calc() in `style.top` or only in the style attribute. */
const topOf = (b: HTMLElement): string => b.style.top || /top:\s*([^;]+);/.exec(b.getAttribute("style") ?? "")?.[1].trim() || "";
const parts = (b: HTMLElement) => Array.from(b.querySelectorAll("[data-part]")).map((p) => p.getAttribute("data-part"));
let windowId = 0;
const freshId = () => `pile-test-window-${(windowId += 1)}`;

describe("TimelinePile, folded", () => {
  beforeEach(() => {
    counts.plate = 0;
  });

  it("is one button named by pileName, not expanded, with the tooltip lines, the pile face and the mark's placement", () => {
    render(<TimelinePile {...props()} />);
    expect(screen.getAllByRole("button")).toHaveLength(1);
    const b = screen.getByRole("button", { name: "Your marks on 3 records. Show each one." });
    expect(b).toBe(pileButton());
    expect(b.getAttribute("aria-expanded")).toBe("false");
    for (const [k, v] of Object.entries(tip(PILE_LINES))) expect(b.getAttribute(k), k).toBe(v);
    // The face: lens, the sign and the figure, one glyph each for pass and wait, the pin. No count.
    expect(parts(b)).toEqual(["lens", "pile", "disposition", "disposition", "pin"]);
    const width = pileWidth({ lens: true, records: 3, glyphs: 2, pinned: true });
    expect(b.style.getPropertyValue("--mark-x")).toBe(timelineLeft(40, width));
    expect(b.style.left).toBe("var(--mark-x)");
    expect(b.style.top).toBe("100%");
    expect(b.style.transform).toBe(`translateX(-${GLYPH_ORIGIN_PX}px)`);
    const cls = b.className.split(/\s+/);
    for (const c of ["pointer-events-auto", "absolute", "z-[8]", "flex", "items-start", "hover:z-10", "focus-visible:ring-1", "focus-visible:ring-signal"]) {
      expect(cls, c).toContain(c);
    }
    expect(b.style.minWidth).toBe("14px");
    expect(b.style.minHeight).toBe("14px");
  });

  it("holds the group wrapper that owns the unfolded state's keys, and draws no member while folded", () => {
    render(<TimelinePile {...props()} />);
    const group = document.querySelector("[data-mark-pile-group]") as HTMLElement;
    expect(group.getAttribute("data-mark-pile-group")).toBe(PILE_KEY);
    expect(group.className.split(/\s+/)).toContain("contents");
    expect(memberButtons()).toHaveLength(0);
  });

  it("a press calls onToggle with the key, and starts no scrub of the track under it", () => {
    const onToggle = vi.fn();
    let down = 0;
    let click = 0;
    render(
      <div onMouseDown={() => (down += 1)} onClick={() => (click += 1)}>
        <TimelinePile {...props({ onToggle })} />
      </div>,
    );
    fireEvent.mouseDown(pileButton());
    fireEvent.click(pileButton());
    expect(onToggle).toHaveBeenCalledTimes(1);
    expect(onToggle).toHaveBeenCalledWith(PILE_KEY);
    expect(down).toBe(0);
    expect(click).toBe(0);
  });

  it("carries data-open only while a member's window is open", () => {
    const { rerender } = render(<TimelinePile {...props()} />);
    expect(pileButton().hasAttribute("data-open")).toBe(false);
    const opened = MEMBERS.map((m, i) => (i === 1 ? { ...m, open: true } : m));
    rerender(<TimelinePile {...props({ members: opened })} />);
    expect(pileButton().getAttribute("data-open")).toBe("true");
    expect(pileButton().querySelector("[data-mark-plate]")?.getAttribute("data-open")).toBe("true");
  });
});

describe("TimelinePile, unfolded", () => {
  it("draws one member button for each member, in the given order, at 15, 30 and 45 px, lifted, after the pile", () => {
    render(<TimelinePile {...props({ unfolded: true, name: pileName(3, true) })} />);
    const group = document.querySelector("[data-mark-pile-group]") as HTMLElement;
    const all = Array.from(group.querySelectorAll("button"));
    expect(all[0]).toBe(pileButton());
    expect(pileButton().getAttribute("aria-expanded")).toBe("true");
    expect(pileButton().getAttribute("aria-label")).toBe("Your marks on 3 records. Fold them.");
    const members = memberButtons();
    expect(members.map((b) => b.getAttribute("data-mark"))).toEqual(["stop:rec-1", "stop:rec-2", "stop:rec-3"]);
    expect(all.slice(1)).toEqual(members);
    members.forEach((b, i) => {
      expect(ROW_STEP_PX).toBe(15);
      expect(topOf(b), `row ${i + 1}`).toBe(`calc(100% + ${ROW_STEP_PX * (i + 1)}px)`);
      expect(b.className.split(/\s+/)).toContain("z-10");
      expect(b.className.split(/\s+/)).not.toContain("z-[8]");
    });
    // Every member hangs at the pile's own percent.
    expect(members[0].style.getPropertyValue("--mark-x")).toContain("40%");
  });

  it("the pile and each member carry the attributes tip(lines) returns for their own lines", () => {
    render(<TimelinePile {...props({ unfolded: true })} />);
    for (const [k, v] of Object.entries(tip(PILE_LINES))) expect(pileButton().getAttribute(k), k).toBe(v);
    memberButtons().forEach((b, i) => {
      for (const [k, v] of Object.entries(tip(MEMBERS[i].lines))) expect(b.getAttribute(k), `${i} ${k}`).toBe(v);
      expect(b.getAttribute("aria-label")).toBe(MEMBERS[i].name);
    });
  });

  it("each member is its own plate: its own dim and its own open", () => {
    const members = MEMBERS.map((m, i) => (i === 2 ? { ...m, open: true } : m));
    render(<TimelinePile {...props({ unfolded: true, members })} />);
    const [one, two, three] = memberButtons();
    expect(one.getAttribute("data-open")).toBe("false");
    expect(two.getAttribute("data-open")).toBe("false");
    expect(three.getAttribute("data-open")).toBe("true");
    // The dim member's lens is below full ink, the lit member's is not set below 1.
    const lens = (b: HTMLElement) => Number((b.querySelector('[data-part="lens"]') as HTMLElement).style.opacity || "1");
    expect(lens(two)).toBeLessThan(1);
    expect(lens(one)).toBe(1);
  });

  it("a member press calls onMemberOpen, then focus is on the pile, onFold is called, and the pile is recorded as the window's opener", () => {
    const id = freshId();
    const order: string[] = [];
    const onMemberOpen = vi.fn((_k: string, _x: number) => {
      order.push("open");
      return id;
    });
    const onFold = vi.fn(() => order.push(`fold:${String(document.activeElement === pileButton())}`));
    render(<TimelinePile {...props({ unfolded: true, onMemberOpen, onFold })} />);
    fireEvent.click(memberButtons()[1], { clientX: 321 });
    expect(onMemberOpen).toHaveBeenCalledWith("stop:rec-2", 321);
    // Focus was moved to the pile before the fold removed the member's button.
    expect(order).toEqual(["open", "fold:true"]);
    expect(onFold).toHaveBeenCalledWith(PILE_KEY);
    // The opener is the pile: move focus away, then close the window the way its close control does.
    (document.body as HTMLElement).focus();
    const other = document.createElement("button");
    document.body.appendChild(other);
    other.focus();
    expect(document.activeElement).toBe(other);
    returnFocus(id);
    expect(document.activeElement).toBe(pileButton());
    other.remove();
  });

  it("a press on a member whose window is already open files no opener", () => {
    const id = freshId();
    const members = MEMBERS.map((m, i) => (i === 0 ? { ...m, open: true } : m));
    const onMemberOpen = vi.fn(() => id);
    render(<TimelinePile {...props({ unfolded: true, members, onMemberOpen })} />);
    fireEvent.click(memberButtons()[0]);
    expect(onMemberOpen).toHaveBeenCalledTimes(1);
    // A filed opener would also have filed one focus request for the window's next mount.
    expect(takeInitialFocus(id)).toBe(false);
  });

  it("a press on a member whose window was not open files the opener and one focus request", () => {
    const id = freshId();
    render(<TimelinePile {...props({ unfolded: true, onMemberOpen: () => id })} />);
    fireEvent.click(memberButtons()[2]);
    expect(takeInitialFocus(id)).toBe(true);
    expect(takeInitialFocus(id)).toBe(false);
  });

  it("a member press with no window id (no scenario) files no opener but still folds", () => {
    const onFold = vi.fn();
    render(<TimelinePile {...props({ unfolded: true, onMemberOpen: () => null, onFold })} />);
    fireEvent.click(memberButtons()[0]);
    expect(onFold).toHaveBeenCalledTimes(1);
  });

  it("a member press is not a press on the track", () => {
    let down = 0;
    let click = 0;
    render(
      <div onMouseDown={() => (down += 1)} onClick={() => (click += 1)}>
        <TimelinePile {...props({ unfolded: true })} />
      </div>,
    );
    fireEvent.mouseDown(memberButtons()[0]);
    fireEvent.click(memberButtons()[0]);
    expect(down).toBe(0);
    expect(click).toBe(0);
  });

  it("Escape on a member calls onFold and puts focus on the pile, and the key still reaches a parent listener", () => {
    const onFold = vi.fn();
    let heard = 0;
    render(
      <div onKeyDown={(e) => e.key === "Escape" && (heard += 1)}>
        <TimelinePile {...props({ unfolded: true, onFold })} />
      </div>,
    );
    const first = memberButtons()[0];
    first.focus();
    expect(document.activeElement).toBe(first);
    fireEvent.keyDown(first, { key: "Escape" });
    expect(onFold).toHaveBeenCalledWith(PILE_KEY);
    expect(document.activeElement).toBe(pileButton());
    expect(heard).toBe(1);
  });

  it("Escape on the pile itself folds it too, and no other key does anything", () => {
    const onFold = vi.fn();
    render(<TimelinePile {...props({ unfolded: true, onFold })} />);
    fireEvent.keyDown(pileButton(), { key: "ArrowDown" });
    fireEvent.keyDown(pileButton(), { key: "a" });
    expect(onFold).not.toHaveBeenCalled();
    fireEvent.keyDown(pileButton(), { key: "Escape" });
    expect(onFold).toHaveBeenCalledTimes(1);
  });

  it("Escape on a folded pile does nothing (nothing is open to fold)", () => {
    const onFold = vi.fn();
    render(<TimelinePile {...props({ onFold })} />);
    fireEvent.keyDown(pileButton(), { key: "Escape" });
    expect(onFold).not.toHaveBeenCalled();
  });

  it("the members follow the pile in DOM order, so a Tab goes pile first, then each member", () => {
    render(<TimelinePile {...props({ unfolded: true })} />);
    const order = Array.from(document.querySelectorAll("[data-mark-pile-group] button")).map((b) => b.getAttribute("data-mark-pile") ?? b.getAttribute("data-mark"));
    expect(order).toEqual([PILE_KEY, "stop:rec-1", "stop:rec-2", "stop:rec-3"]);
  });
});

describe("TimelinePile, what a tick re-renders", () => {
  beforeEach(() => {
    counts.plate = 0;
  });

  it("the same values in new objects re-render no plate", () => {
    const fns = { onToggle: vi.fn(), onFold: vi.fn(), onMemberOpen: vi.fn(() => null) };
    const base = props({ unfolded: true, ...fns });
    const { rerender } = render(<TimelinePile {...base} />);
    const first = counts.plate;
    expect(first).toBeGreaterThan(0);
    rerender(
      <TimelinePile
        {...base}
        lines={[...base.lines]}
        face={{ ...base.face, glyphs: base.face.glyphs.map((g) => ({ ...g })) }}
        members={base.members.map((m) => ({ ...m, lines: [...m.lines] }))}
      />,
    );
    expect(counts.plate).toBe(first);
  });

  it("one member's dim flipping re-renders", () => {
    const fns = { onToggle: vi.fn(), onFold: vi.fn(), onMemberOpen: vi.fn(() => null) };
    const base = props({ unfolded: true, ...fns });
    const { rerender } = render(<TimelinePile {...base} />);
    const first = counts.plate;
    rerender(<TimelinePile {...base} members={base.members.map((m, i) => (i === 2 ? { ...m, dim: true } : m))} />);
    expect(counts.plate).toBeGreaterThan(first);
  });

  it("one glyph's dim flipping re-renders the pile's plate", () => {
    const fns = { onToggle: vi.fn(), onFold: vi.fn(), onMemberOpen: vi.fn(() => null) };
    const base = props(fns);
    const { rerender } = render(<TimelinePile {...base} />);
    const first = counts.plate;
    rerender(<TimelinePile {...base} face={{ ...base.face, glyphs: base.face.glyphs.map((g, i) => (i === 0 ? { ...g, dim: !g.dim } : g)) }} />);
    expect(counts.plate).toBeGreaterThan(first);
  });

  it("a new unfolded flag, name or width re-renders", () => {
    const fns = { onToggle: vi.fn(), onFold: vi.fn(), onMemberOpen: vi.fn(() => null) };
    const base = props(fns);
    const { rerender } = render(<TimelinePile {...base} />);
    const first = counts.plate;
    rerender(<TimelinePile {...base} unfolded name={pileName(3, true)} />);
    expect(counts.plate).toBeGreaterThan(first);
    expect(pileButton().getAttribute("aria-expanded")).toBe("true");
    const second = counts.plate;
    rerender(<TimelinePile {...base} unfolded name={pileName(3, true)} width={base.width + 9} />);
    expect(pileButton().style.getPropertyValue("--mark-x")).toBe(timelineLeft(40, base.width + 9));
    expect(counts.plate).toBeGreaterThanOrEqual(second);
  });
});
