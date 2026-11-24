import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NotesBody } from "./NotesBody";
import { PileBody } from "./PileBody";
import { manifestRowToEntity } from "../../lib/adapters/manifest-row";
import { plainNode, recordNode, verdictNode } from "../../lib/verdict-fixtures";
import { useSchema } from "../../store/schema";
import { usePivotStore } from "../../store/pivot";
import { useMatches } from "../../store/matches";
import { useDecisionData } from "../../store/decision-data";
import type { Decision } from "../../lib/decisions";

const carol = manifestRowToEntity(verdictNode, {
  id: "d1", state: "FAIL", finding: "ATO", memo: "Account takeover. Line two.", who: "investigator",
  subject: "Carol · Branson, MO", acct: "a1", when: "2026-06-09T09:40:00-05:00", y: 36.6, x: -93.2,
});

beforeEach(() => {
  useSchema.setState({ nodes: [verdictNode, recordNode] });
  usePivotStore.setState({ windows: [], nextZ: 20 });
  useDecisionData.setState({ reached: [] });
});

describe("NotesBody", () => {
  it("a decision's notes show outcome, decided by, decided at in replay time, the note and the target", () => {
    render(<NotesBody entity={carol} node={verdictNode} />);
    expect(screen.getByText("ATO")).toHaveAttribute("data-tone", "fail");
    expect(screen.getByText("FAIL")).toBeInTheDocument();
    expect(screen.getByText("investigator")).toBeInTheDocument();
    expect(screen.getByText("Tue Jun 9 · 9:40a")).toHaveAttribute("title", "2026-06-09T09:40:00-05:00");
    expect(screen.getByText("Account takeover. Line two.")).toBeInTheDocument();
    expect(screen.getByText("Carol · Branson, MO")).toBeInTheDocument();
  });

  it("a status that only repeats its word is not printed: PASSED shows once, with no PASS beside it", () => {
    const cleared = manifestRowToEntity(verdictNode, {
      id: "d3", state: "PASS", finding: "PASSED", memo: "No action.", who: "investigator",
      subject: "Cora · Tahoe, CA", acct: "a2", when: "2026-06-09T10:30:00-05:00", y: 38.9, x: -120,
    });
    render(<NotesBody entity={cleared} node={verdictNode} />);
    expect(screen.getByText("PASSED")).toHaveAttribute("data-tone", "pass");
    expect(screen.queryByText("PASS")).toBeNull();
  });

  // A pin: the notes rows keep their own look and take no library icon (icons plan 6.2 task 12); it asserts an unchanged state.
  it("draws no library icon", () => {
    const { container } = render(<NotesBody entity={carol} node={verdictNode} />);
    expect(screen.getByText("FAIL")).toBeInTheDocument();
    expect(screen.getByText("investigator")).toBeInTheDocument();
    expect(container.querySelector("svg.lucide")).toBeNull();
  });

  it("a node without a decision mapping says so and invents nothing", () => {
    render(<NotesBody entity={carol} node={plainNode} />);
    expect(screen.getByText("This scenario has no notes.")).toBeInTheDocument();
    expect(screen.queryByText("investigator")).toBeNull();
  });
});

describe("PileBody", () => {
  const later = manifestRowToEntity(verdictNode, {
    id: "d2", state: "PASS", finding: "PASSED", memo: "No action.", who: "investigator",
    subject: "Cora · Tahoe, CA", acct: "a2", when: "2026-06-09T10:30:00-05:00", y: 38.9, x: -120,
  });

  it("lists its members in the given order and each row opens that member's notes at the pile's spot", () => {
    render(<PileBody memberIds={["d1", "d2"]} byKind={{ verdict_export: [later, carol] }} at={{ lng: 4.9, lat: 52.4 }} />);
    const rows = screen.getAllByRole("button", { name: /Open notes/ });
    expect(rows.map((r) => r.textContent)).toEqual([
      expect.stringContaining("Carol · Branson, MO"), expect.stringContaining("Cora · Tahoe, CA"),
    ]);
    fireEvent.click(rows[1]);
    const w = usePivotStore.getState().windows[0];
    expect(w).toMatchObject({ kind: "detail", view: { type: "notes" }, anchor: { lngLat: { lng: 4.9, lat: 52.4 } } });
    if (w.kind === "detail" && w.entity.kind === "entity") expect(w.entity.entity.id).toBe("d2");
  });

  it("a queued event's row shows the rule's flag and opens the rule that queued it", () => {
    const ev = manifestRowToEntity(recordNode, { id: "r1", acct: "a1", when: "2026-06-08T09:08:51-05:00", y: 52.37, x: 4.9 });
    const rule = { id: "rule-x:r1", rule: { id: "rule-x", label: "rule-x", kind: "k" }, triggerEntityIds: ["s1", "r1"] } as Decision;
    useDecisionData.setState({ reached: [rule] });
    render(<PileBody memberIds={["r1"]} byKind={{ login_like: [ev] }} />);
    expect(screen.getByText("rule-x")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open rule: r1" }));
    expect(useMatches.getState().active).toEqual({ mode: "rule", decisionId: "rule-x:r1" });
  });

  describe("a target the rows share", () => {
    const row = (id: string, subject: string, when: string) =>
      manifestRowToEntity(verdictNode, { id, state: "FAIL", finding: "ATO", memo: "m", who: "investigator", subject, acct: id, when, y: 1, x: 2 });
    const labelSpans = (c: HTMLElement) => [...c.querySelectorAll("span.flex-1")];

    it("two decision rows with the same target print it once and keep their button names", () => {
      const { container } = render(
        <PileBody memberIds={["a", "b"]} byKind={{ verdict_export: [row("a", "Host H1", "2026-06-09T09:00:00-05:00"), row("b", "Host H1", "2026-06-09T09:05:00-05:00")] }} />,
      );
      expect(screen.getAllByText("Host H1")).toHaveLength(1);
      expect(screen.getAllByRole("button", { name: "Open notes: Host H1" })).toHaveLength(2);
      expect(labelSpans(container)).toHaveLength(0);
      const hoisted = screen.getByText("Host H1");
      expect(hoisted.closest("li")).toBeNull();
      expect(hoisted.classList.contains("truncate")).toBe(true);
      expect(hoisted.classList.contains("py-1")).toBe(true);
    });

    it("two decision rows with different targets print each in its row", () => {
      const { container } = render(
        <PileBody memberIds={["a", "b"]} byKind={{ verdict_export: [row("a", "Host H1", "2026-06-09T09:00:00-05:00"), row("b", "Host H2", "2026-06-09T09:05:00-05:00")] }} />,
      );
      expect(screen.getAllByText("Host H1")).toHaveLength(1);
      expect(screen.getAllByText("Host H2")).toHaveLength(1);
      expect(labelSpans(container)).toHaveLength(2);
    });

    it("a pile of one row prints its label in the row", () => {
      const { container } = render(
        <PileBody memberIds={["a"]} byKind={{ verdict_export: [row("a", "Host H1", "2026-06-09T09:00:00-05:00")] }} />,
      );
      expect(screen.getAllByText("Host H1")).toHaveLength(1);
      expect(labelSpans(container)).toHaveLength(1);
    });

    it("a decision row and a queued-event row with equal labels print it twice: mixed families do not hoist", () => {
      const ev = manifestRowToEntity(recordNode, { id: "r1", acct: "a1", when: "2026-06-08T09:08:51-05:00", y: 52.37, x: 4.9 });
      const rule = { id: "rule-x:r1", rule: { id: "rule-x", label: "rule-x", kind: "k" }, triggerEntityIds: ["s1", "r1"] } as Decision;
      useDecisionData.setState({ reached: [rule] });
      const { container } = render(
        <PileBody memberIds={["a", "r1"]} byKind={{ verdict_export: [row("a", "r1", "2026-06-09T09:00:00-05:00")], login_like: [ev] }} />,
      );
      expect(screen.getAllByText("r1")).toHaveLength(2);
      expect(labelSpans(container)).toHaveLength(2);
    });

    it("two decision rows with empty targets hoist nothing", () => {
      const { container } = render(
        <PileBody memberIds={["a", "b"]} byKind={{ verdict_export: [row("a", "", "2026-06-09T09:00:00-05:00"), row("b", "", "2026-06-09T09:05:00-05:00")] }} />,
      );
      expect(screen.getAllByRole("button")).toHaveLength(2);
      expect(labelSpans(container)).toHaveLength(2);
      expect(container.querySelectorAll("li")).toHaveLength(2);
      expect(container.querySelector("ul")?.previousElementSibling).toBeNull();
    });
  });

  describe("queued events that share one rule", () => {
    const ev = (id: string, when: string) => manifestRowToEntity(recordNode, { id, acct: "a1", when, y: 52.37, x: 4.9 });
    const queuedBy = (ruleId: string, eventId: string) =>
      ({ id: `${ruleId}:${eventId}`, rule: { id: ruleId, label: ruleId, kind: "k" }, triggerEntityIds: ["s1", eventId] }) as Decision;
    const events = { login_like: [ev("r1", "2026-06-08T09:08:51-05:00"), ev("r2", "2026-06-08T09:09:51-05:00")] };

    it("show the rule's flag once above the rows; each row keeps its label and its name", () => {
      // Measured 2026-11-15: a 182 px flag in every row of a 300 px pile window left the label 0 px.
      useDecisionData.setState({ reached: [queuedBy("rule-x", "r1"), queuedBy("rule-x", "r2")] });
      const { container } = render(<PileBody memberIds={["r1", "r2"]} byKind={events} />);
      expect(screen.getAllByText("rule-x")).toHaveLength(1);
      expect(container.querySelectorAll("[data-queue-flag]")).toHaveLength(1);
      expect(container.querySelector("li [data-queue-flag]")).toBeNull();
      expect(screen.getByText("r1")).toBeInTheDocument();
      expect(screen.getByText("r2")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Open rule: r1" })).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Open rule: r2" })).toBeInTheDocument();
    });

    it("a pile of one queued event keeps its flag in its row", () => {
      useDecisionData.setState({ reached: [queuedBy("rule-x", "r1")] });
      const { container } = render(<PileBody memberIds={["r1"]} byKind={{ login_like: [events.login_like[0]] }} />);
      expect(container.querySelector("li [data-queue-flag]")).not.toBeNull();
      expect(container.querySelector("ul")?.previousElementSibling).toBeNull();
    });

    it("queued events of different rules are listed under one flag per rule, in the order each rule first appears", () => {
      // Measured 2026-11-15: a pile of ten events of one rule and one of another repeated the long
      // flag ten times, each of those rows on two lines.
      useDecisionData.setState({ reached: [queuedBy("rule-x", "r1"), queuedBy("rule-y", "r2"), queuedBy("rule-x", "r3")] });
      const three = { login_like: [...events.login_like, ev("r3", "2026-06-08T09:10:51-05:00")] };
      const { container } = render(<PileBody memberIds={["r1", "r2", "r3"]} byKind={three} />);
      const flags = [...container.querySelectorAll("[data-queue-flag]")] as HTMLElement[];
      expect(flags.map((f) => f.textContent)).toEqual(["rule-x", "rule-y"]);
      const listed = flags.map((f) =>
        [...(f.parentElement?.nextElementSibling?.querySelectorAll("li") ?? [])].map((li) => li.querySelector("span.flex-1")?.textContent),
      );
      expect(listed).toEqual([["r1", "r3"], ["r2"]]);
      expect(container.querySelector("li [data-queue-flag]")).toBeNull();
      expect(screen.getByRole("button", { name: "Open rule: r3" })).toBeInTheDocument();
    });
  });

  it("the label is the part that gives way and the mark never shrinks", () => {
    const { container } = render(<PileBody memberIds={["d1", "d2"]} byKind={{ verdict_export: [later, carol] }} />);
    const label = screen.getByText("Carol · Branson, MO");
    // At least 3rem, so a long mark wraps the label to a second line instead of leaving it 0 px.
    expect(label.classList.contains("min-w-[3rem]")).toBe(true);
    expect(label.classList.contains("flex-1")).toBe(true);
    expect(label.classList.contains("truncate")).toBe(true);
    const row = screen.getByRole("button", { name: "Open notes: Carol · Branson, MO" });
    expect(row.classList.contains("flex-wrap")).toBe(true);
    const time = row.lastElementChild as HTMLElement;
    expect(time.classList.contains("shrink-0")).toBe(true);
    expect(time.classList.contains("ml-auto")).toBe(true);
    for (const mark of container.querySelectorAll("[data-verdict-capsule]")) expect(mark.classList.contains("shrink-0")).toBe(true);
  });

  it("a queued event's flag never shrinks either", () => {
    const ev = manifestRowToEntity(recordNode, { id: "r1", acct: "a1", when: "2026-06-08T09:08:51-05:00", y: 52.37, x: 4.9 });
    useDecisionData.setState({ reached: [{ id: "rule-x:r1", rule: { id: "rule-x", label: "rule-x", kind: "k" }, triggerEntityIds: ["s1", "r1"] } as Decision] });
    const { container } = render(<PileBody memberIds={["r1"]} byKind={{ login_like: [ev] }} />);
    expect(container.querySelector("[data-queue-flag]")?.classList.contains("shrink-0")).toBe(true);
  });
});
