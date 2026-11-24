// frontend/investigator/src/components/inspector/RecordRefValue.test.tsx
// A field with a ref prints its record's
// name, and the name opens the record. The fixture is a pack nobody has (a claim that names a member
// and desks), so a ref is read from the node's declaration and no component names a field or a kind.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ManifestFieldsSection, SectionRows } from "./ManifestFieldsSection";
import { TipLayer, showTipAt } from "../ui/Tip";
import { useSchema } from "../../store/schema";
import { useMatches } from "../../store/matches";
import { usePivotData } from "../../store/pivot-data";
import { useSelection } from "../../store/selection";
import { usePlayhead } from "../../store/playhead";
import { useNavigation } from "../../store/navigation";
import { useClockForm } from "../../store/clock-form";
import { when, when24 } from "../../lib/time-words";
import type { Entity } from "../../lib/entity";
import type { RefNode } from "../../lib/record-refs";
import { fetchActiveScenario, type ScenarioNode } from "../../lib/scenarios";

const T = Date.parse("2026-06-08T09:08:51-05:00");

const claim: RefNode = {
  kind: "claim", label: "Claim", palette: "#ffb347", source: "json",
  coords: { lat: "lat", lng: "lng" }, timestamp: "filed_at",
  primary: "${title}", secondary: "",
  pivotable: ["member_id", "desk_ids", "branch_id"],
  refs: { member_id: ["member"], desk_ids: ["desk"], branch_id: ["branch"] },
  sections: [{ id: "filing", label: "Filing", fields: ["member_id", "filed_at"] }],
};
const member: ScenarioNode = { kind: "member", label: "Member", palette: "#4da3ff", source: "json", primary: "${name}", secondary: "" };
const desk: ScenarioNode = { kind: "desk", label: "Desk", palette: "#7ee787", source: "json", primary: "${name}", secondary: "" };

function entityOf(id: string, kind: string, name: string, timestamp = 0, coords: { lat: number; lng: number } | null = null): Entity {
  return {
    id, kind, timestamp, coords, fields: { id, name },
    displayMetadata: { primaryLabel: name, secondaryLabel: "", paletteKind: kind, pivotableFields: [] },
  };
}
const dana = entityOf("mem-5169", "member", "Dana Whitlow", T, { lat: 52.37, lng: 4.9 });
const north = entityOf("desk-1", "desk", "North desk", T + 60_000);
const south = entityOf("desk-2", "desk", "South desk");

function claimEntity(fields: Record<string, unknown>): Entity {
  return {
    id: "clm-1", kind: "claim", timestamp: T, coords: { lat: 1, lng: 2 },
    fields: { id: "clm-1", title: "Late claim", filed_at: "2026-06-08T09:08:51-05:00", lat: 1, lng: 2, ...fields },
    displayMetadata: { primaryLabel: "Late claim", secondaryLabel: "", paletteKind: "claim", pivotableFields: claim.pivotable! },
  };
}

beforeEach(() => {
  useSchema.setState({ nodes: [claim, member, desk] });
  usePivotData.setState({ transactions: [], logins: [], accountEvents: [], transfers: [], entities: [dana, north, south] });
  useMatches.setState({ active: null });
  useSelection.setState({ selected: null });
  useClockForm.setState({ h24: false });
  usePlayhead.setState({ playhead: 0, isPlaying: true, playbackRate: 1 });
});

describe("a field with a ref", () => {
  it("a field with a ref keeps its icon", () => {
    // The row drawn through RefFieldRow starts with the library icon of its record key.
    render(<ManifestFieldsSection entity={claimEntity({ member_id: "mem-5169" })} />);
    const name = screen.getByRole("button", { name: "Open Member Dana Whitlow" });
    const row = name.closest("div.text-right") as HTMLElement;
    const label = row.querySelector("span.float-left") as HTMLElement;
    expect(label.firstElementChild?.getAttribute("class") ?? "").toContain("lucide-square-dashed");
    expect(label.querySelector("svg.lucide")).not.toBeNull();
  });

  it("prints the record's name for the id, and no id", () => {
    render(<ManifestFieldsSection entity={claimEntity({ member_id: "mem-5169" })} />);
    expect(screen.getByRole("button", { name: "Open Member Dana Whitlow" })).toHaveTextContent("Dana Whitlow");
    expect(screen.queryByText("mem-5169")).toBeNull();
    // The press that lists the matches is replaced on a value that opens its record.
    expect(screen.queryByTitle("Find matches for member_id=mem-5169")).toBeNull();
  });

  it("is a native, enabled button that carries the record's id and kind for a probe, with a dotted line under it", () => {
    render(<ManifestFieldsSection entity={claimEntity({ member_id: "mem-5169" })} />);
    const button = screen.getByRole("button", { name: "Open Member Dana Whitlow" });
    expect(button.tagName).toBe("BUTTON");
    expect(button).toHaveAttribute("type", "button");
    expect(button).toBeEnabled();
    expect(button).toHaveAttribute("data-record-id", "mem-5169");
    expect(button).toHaveAttribute("data-record-kind", "member");
    expect(button.className).toContain("underline");
    expect(button.className).toContain("decoration-dotted");
    expect(button.className).toContain("min-h-[24px]");
  });

  it("prints an unresolved id as today, with today's pivot and no underline", () => {
    render(<ManifestFieldsSection entity={claimEntity({ member_id: "mem-0000" })} />);
    fireEvent.click(screen.getByTitle("Find matches for member_id=mem-0000"));
    expect(useMatches.getState().active).toMatchObject({ field: "member_id", value: "mem-0000" });
    expect(document.querySelector("[data-record-id]")).toBeNull();
    expect(screen.getByTitle("Find matches for member_id=mem-0000").className).not.toContain("underline");
  });

  it("prints an id whose record is of a kind the field does not declare as today", () => {
    render(<ManifestFieldsSection entity={claimEntity({ member_id: "desk-1" })} />);
    expect(screen.getByTitle("Find matches for member_id=desk-1")).toHaveTextContent("desk-1");
    expect(document.querySelector("[data-record-id]")).toBeNull();
  });

  it("prints an absent value as today: a dash and no link", () => {
    render(<ManifestFieldsSection entity={claimEntity({ member_id: null })} />);
    expect(document.querySelector("[data-record-id]")).toBeNull();
    expect(screen.getAllByText("-").length).toBeGreaterThan(0);
  });

  it("a record's own id prints as today: no link to itself", () => {
    const selfNode: RefNode = { ...claim, refs: { member_id: ["member", "claim"] } };
    useSchema.setState({ nodes: [selfNode, member, desk] });
    usePivotData.setState({ entities: [dana, claimEntity({})] });
    render(<ManifestFieldsSection entity={claimEntity({ member_id: "clm-1" })} />);
    expect(document.querySelector("[data-record-id]")).toBeNull();
    expect(screen.getByTitle("Find matches for member_id=clm-1")).toBeInTheDocument();
  });

  it("a list prints one name for each resolved id and a bare id line for the rest", () => {
    render(<ManifestFieldsSection entity={claimEntity({ desk_ids: ["desk-1", "desk-9", "desk-2"] })} />);
    const links = [...document.querySelectorAll("[data-record-id]")];
    expect(links.map((l) => l.getAttribute("data-record-id"))).toEqual(["desk-1", "desk-2"]);
    expect(screen.getByRole("button", { name: "Open Desk North desk" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Open Desk South desk" })).toBeInTheDocument();
    // The id that names no record is a line of text, not a control.
    expect(screen.getByText("desk-9").closest("button")).toBeNull();
  });

  it("a list of ids none of which resolves prints as today", () => {
    render(<ManifestFieldsSection entity={claimEntity({ desk_ids: ["desk-8", "desk-9"] })} />);
    expect(document.querySelector("[data-record-id]")).toBeNull();
    expect(screen.getByTitle("Find matches for desk_ids=desk-8,desk-9")).toHaveTextContent("desk-8, desk-9");
  });

  it("prints the name where a declared section lists the field, in the pop-out's rows", () => {
    const entity = claimEntity({ member_id: "mem-5169" });
    render(<SectionRows entity={entity} node={claim} fields={["member_id", "filed_at"]} />);
    expect(screen.getByRole("button", { name: "Open Member Dana Whitlow" })).toBeInTheDocument();
  });

  it("reads a ref from the node and from nowhere else: a node with no refs links nothing", () => {
    const bare: ScenarioNode = { ...claim };
    delete (bare as RefNode).refs;
    useSchema.setState({ nodes: [bare, member, desk] });
    render(<ManifestFieldsSection entity={claimEntity({ member_id: "mem-5169" })} />);
    expect(document.querySelector("[data-record-id]")).toBeNull();
    expect(screen.getByTitle("Find matches for member_id=mem-5169")).toBeInTheDocument();
  });

  it("a ref to a kind with no declared node still prints the kind's name for its label", () => {
    useSchema.setState({ nodes: [claim, desk] });
    render(<ManifestFieldsSection entity={claimEntity({ member_id: "mem-5169" })} />);
    expect(screen.getByRole("button", { name: "Open member Dana Whitlow" })).toBeInTheDocument();
  });
});

describe("a ref reaches the row from the served manifest", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("passes the declaration through the app's loader to the schema store, and the row prints the name", async () => {
    // The manifest as the endpoint serves it: the node carries `refs` as written in the file.
    const served = { id: "pack", label: "Pack", home: { lat: 0, lng: 0, zoom: 2 }, nodes: [claim, member, desk] };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(served), { status: 200 })));
    const active = await fetchActiveScenario();
    expect(active.nodes.find((n) => n.kind === "claim")).toMatchObject({ refs: { member_id: ["member"] } });
    useSchema.setState({ nodes: [] });
    useSchema.getState().setActive(active.id, active.nodes);
    render(<ManifestFieldsSection entity={claimEntity({ member_id: "mem-5169" })} />);
    expect(screen.getByRole("button", { name: "Open Member Dana Whitlow" })).toBeInTheDocument();
  });
});

describe("a press on the name", () => {
  it("selects the record, pauses and seeks the playhead, and flies the camera", () => {
    render(<ManifestFieldsSection entity={claimEntity({ member_id: "mem-5169" })} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Member Dana Whitlow" }));
    expect(useSelection.getState().selected).toMatchObject({ kind: "entity", entity: { id: "mem-5169" } });
    expect(usePlayhead.getState().isPlaying).toBe(false);
    expect(usePlayhead.getState().playhead).toBe(T);
    expect(useNavigation.getState().panTarget).toEqual({ lat: 52.37, lng: 4.9 });
    expect(useNavigation.getState().pulseEntityId).toBe("mem-5169");
  });

  it("on a record with no time pauses and leaves the playhead where it is", () => {
    usePlayhead.setState({ playhead: 12345, isPlaying: true });
    render(<ManifestFieldsSection entity={claimEntity({ desk_ids: ["desk-2"] })} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Desk South desk" }));
    expect(useSelection.getState().selected).toMatchObject({ entity: { id: "desk-2" } });
    expect(usePlayhead.getState().isPlaying).toBe(false);
    expect(usePlayhead.getState().playhead).toBe(12345);
  });

  it("opens the record the press names when a list holds more than one", () => {
    render(<ManifestFieldsSection entity={claimEntity({ desk_ids: ["desk-1", "desk-2"] })} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Desk North desk" }));
    expect(useSelection.getState().selected).toMatchObject({ entity: { id: "desk-1" } });
    expect(usePlayhead.getState().playhead).toBe(T + 60_000);
  });
});

/** The scroll element's writes are recorded: jsdom has no layout, so the test reads what was assigned. */
function inPanel(children: React.ReactNode, order: string[] = []) {
  const writes: number[] = [];
  const view = render(
    <aside aria-label="Inspector" tabIndex={-1}>
      <button type="button">header control</button>
      <div data-inspector-scroll>{children}</div>
    </aside>,
  );
  const scroller = view.container.querySelector<HTMLElement>("[data-inspector-scroll]")!;
  Object.defineProperty(scroller, "scrollTop", { configurable: true, get: () => 80, set: (v: number) => void (writes.push(v), order.push("scroll")) });
  return { ...view, writes, aside: view.container.querySelector<HTMLElement>("aside")! };
}

describe("a press inside the Inspector", () => {
  it("sets the scroll to the top and puts focus on the panel", () => {
    const { writes, aside } = inPanel(<ManifestFieldsSection entity={claimEntity({ member_id: "mem-5169" })} />);
    const button = screen.getByRole("button", { name: "Open Member Dana Whitlow" });
    button.focus();
    fireEvent.click(button);
    expect(writes).toEqual([0]);
    expect(document.activeElement).toBe(aside);
  });

  it("selects first, then returns the scroll to the top and moves focus to the panel, in one handler", () => {
    const order: string[] = [];
    const real = useNavigation.getState().navigate;
    useNavigation.setState({
      navigate: (match, options) => {
        order.push("navigate");
        real(match, options);
      },
    });
    const { writes } = inPanel(<ManifestFieldsSection entity={claimEntity({ member_id: "mem-5169" })} />, order);
    const original = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "focus")!;
    const spy = vi.spyOn(HTMLElement.prototype, "focus").mockImplementation(function (this: HTMLElement) {
      order.push(`focus:${this.tagName.toLowerCase()}`);
      original.value.call(this);
    });
    fireEvent.click(screen.getByRole("button", { name: "Open Member Dana Whitlow" }));
    spy.mockRestore();
    useNavigation.setState({ navigate: real });
    expect(order).toEqual(["navigate", "scroll", "focus:aside"]);
    expect(writes).toEqual([0]);
  });
});

describe("a press outside the Inspector (a pop-out window)", () => {
  it("selects and flies, and leaves the scroll and the focus alone", () => {
    const outside = document.createElement("button");
    document.body.appendChild(outside);
    outside.focus();
    render(<SectionRows entity={claimEntity({ member_id: "mem-5169" })} node={claim} fields={["member_id"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Open Member Dana Whitlow" }));
    expect(useSelection.getState().selected).toMatchObject({ entity: { id: "mem-5169" } });
    expect(useNavigation.getState().pulseEntityId).toBe("mem-5169");
    expect(document.activeElement).toBe(outside);
    outside.remove();
  });
});

describe("the name's tooltip", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    act(() => void showTipAt(null));
    vi.useRealTimers();
  });

  it("carries the kind, the id, the time and what a press does, through the shared layer", () => {
    render(
      <>
        <ManifestFieldsSection entity={claimEntity({ member_id: "mem-5169" })} />
        <TipLayer />
      </>,
    );
    const button = screen.getByRole("button", { name: "Open Member Dana Whitlow" });
    expect(button.getAttribute("data-tip")).toBe(["Member", "Record mem-5169", `Time ${when(T)}`, "Press to open this record."].join("\n"));
    expect(button.hasAttribute("title")).toBe(false);
    fireEvent.pointerOver(button);
    act(() => void vi.advanceTimersByTime(300));
    const layer = document.querySelector("[data-tip-layer]") as HTMLElement;
    expect(within(layer).getByText("Record mem-5169")).toBeInTheDocument();
    expect(within(layer).getByText("Press to open this record.")).toBeInTheDocument();
  });

  it("leaves the time line out for a record with no time, and takes the clock's 24 hour form when it is set", () => {
    render(<ManifestFieldsSection entity={claimEntity({ desk_ids: ["desk-2", "desk-1"] })} />);
    expect(screen.getByRole("button", { name: "Open Desk South desk" }).getAttribute("data-tip")).not.toContain("Time ");
    act(() => useClockForm.setState({ h24: true }));
    expect(screen.getByRole("button", { name: "Open Desk North desk" }).getAttribute("data-tip")).toContain(`Time ${when24(T + 60_000)}`);
  });
});

describe("the files carry no field of a pack and no clock", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const read = (rel: string) => readFileSync(resolve(here, rel), "utf8");
  it("names no field or kind of a pack", () => {
    for (const rel of ["RecordRefValue.tsx", "ManifestFieldsSection.tsx", "../../lib/tooltip-words/inspector.ts", "../../lib/record-refs.ts"]) {
      expect(read(rel), rel).not.toMatch(/org_id|event_ids|key_event/);
    }
  });
  it("reads no clock", () => {
    for (const rel of ["RecordRefValue.tsx", "../../lib/tooltip-words/inspector.ts", "../../lib/record-refs.ts"]) {
      expect(read(rel), rel).not.toMatch(/Date\.now|new Date\(\)|setTimeout|requestAnimationFrame/);
    }
  });
});
