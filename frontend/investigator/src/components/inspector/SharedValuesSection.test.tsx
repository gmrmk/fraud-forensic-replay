// The Inspector's Shared values section (components/inspector/SharedValuesSection.tsx). The fixture is a
// small pack of three timed kinds and a decision kind, built by manifestRowToEntity from manifest nodes,
// so the section reads everything it prints from the nodes and the loaded rows. It does not test which rows
// exist for a record (lib/shared-values.test.ts) or the section's place in the body
// (ManifestFieldsSection.test.tsx), and it takes no picture: how the rows look is the frames' to say.
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { SharedValuesSection } from "./SharedValuesSection";
import { manifestRowToEntity } from "../../lib/adapters/manifest-row";
import type { Entity } from "../../lib/entity";
import type { ScenarioNode } from "../../lib/scenarios";
import { sectionFoldName, sharedRowName, sharedRowWords, sharedDecisionWords } from "../../lib/tooltip-words/inspector";
import { when } from "../../lib/time-words";
import { useClockForm } from "../../store/clock-form";
import { useLayers } from "../../store/layers";
import { useMatches } from "../../store/matches";
import { useNavigation } from "../../store/navigation";
import { usePivotData } from "../../store/pivot-data";
import { usePlayhead } from "../../store/playhead";
import { useSchema } from "../../store/schema";
import { useSelection } from "../../store/selection";

const node = (kind: string, label: string, extra: Partial<ScenarioNode> = {}): ScenarioNode => ({
  kind, label, palette: "#4da3ff", source: "json", ...extra,
});
const NODES: ScenarioNode[] = [
  node("principal", "Key or seat", { palette: "#aa0001", pivotable: ["principal_id"] }),
  node("network_seen", "Network seen", { palette: "#aa0002", timestamp: "timestamp", pivotable: ["principal_id", "network_id"] }),
  node("request_sample", "Request", { palette: "", timestamp: "timestamp", pivotable: ["principal_id", "network_id"] }),
  node("decision", "Decision", {
    palette: "#aa0006", timestamp: "decided_at", pivotable: ["org_id"],
    decision: { status: "status", outcome: "outcome", note: "note", actor: "actor", target: "target", key: "org_id", event: "event_ids" },
  }),
];
const nodeOf = (kind: string): ScenarioNode => NODES.find((n) => n.kind === kind)!;
const T = (hour: number) => `2026-06-08T${String(hour).padStart(2, "0")}:00:00Z`;
const at = (hour: number) => Date.parse(T(hour));
const make = (kind: string, row: Record<string, unknown>): Entity => manifestRowToEntity(nodeOf(kind), row);

const N4 = make("network_seen", { id: "nw-0004", timestamp: T(10), principal_id: "pr-1", network_id: "net-1" });
const DECISION = make("decision", {
  id: "dc-1", decided_at: T(14), status: "WAITING", outcome: "FOR REVIEW", note: "", actor: "", target: "",
  org_id: "org-1", event_ids: ["nw-0004"],
});
const ENTITIES: Entity[] = [
  make("principal", { id: "pr-1", principal_id: "pr-1" }),
  N4,
  make("network_seen", { id: "nw-0005", timestamp: T(11), principal_id: "pr-1", network_id: "net-2" }),
  make("network_seen", { id: "nw-0006", timestamp: T(15), principal_id: "pr-1", network_id: "net-3" }),
  make("request_sample", { id: "rq-1", timestamp: T(10), principal_id: "pr-1", network_id: "net-1" }),
  make("request_sample", { id: "rq-2", timestamp: T(13), principal_id: "pr-1", network_id: "net-1" }),
  DECISION,
];

function load(entities: Entity[] = ENTITIES): void {
  useSchema.setState({ nodes: NODES });
  usePivotData.setState({ transactions: [], logins: [], accountEvents: [], transfers: [], entities });
}
// The section title is a button too (it folds the section); a row button is any other.
const rowButtons = () => screen.getAllByRole("button").filter((b) => !b.hasAttribute("aria-expanded"));

beforeEach(() => {
  load();
  useMatches.setState({ active: null });
  useClockForm.setState({ h24: false });
  usePlayhead.setState({ playhead: at(12), minTime: at(8), maxTime: at(20) });
});
const realNavigate = useNavigation.getState().navigate;
afterEach(() => {
  useNavigation.setState({ navigate: realNavigate });
});

describe("SharedValuesSection", () => {
  it("draws nothing for a record that shares no value", () => {
    const quiet = make("network_seen", { id: "nw-9", timestamp: T(10), principal_id: "pr-77", network_id: "net-77" });
    const { container } = render(<SharedValuesSection entity={quiet} />);
    expect(container.firstChild).toBeNull();
  });

  it("titles the section and gives one button for each row", () => {
    render(<SharedValuesSection entity={N4} />);
    expect(screen.getByText("Shared values")).toBeInTheDocument();
    // principal/principal_id, network_seen/principal_id, request_sample/principal_id,
    // request_sample/network_id, then the decision.
    expect(rowButtons()).toHaveLength(5);
  });

  it("prints a row's kind, its field's label and the count as 'r / n'", () => {
    render(<SharedValuesSection entity={N4} />);
    const row = screen.getByRole("button", { name: sharedRowName("Network seen", "Principal ID", 1, 2) });
    expect(row).toHaveTextContent("Network seen");
    expect(row).toHaveTextContent("Principal ID");
    expect(row).toHaveTextContent("1 / 2");
  });

  it("names each row for its text and holds the tooltip lines in data-tip", () => {
    render(<SharedValuesSection entity={N4} />);
    const row = screen.getByRole("button", { name: sharedRowName("Request", "Principal ID", 1, 2) });
    expect(row.getAttribute("data-tip")).toBe(sharedRowWords("Request", "Principal ID", "pr-1", 1, 2).join("\n"));
    const decision = screen.getByRole("button", { name: sharedRowName("Decision", "Event Ids", 0, 1) });
    expect(decision.getAttribute("data-tip")).toBe(
      sharedDecisionWords("Decision", "Event Ids", "nw-0004", "dc-1", at(14)).join("\n"),
    );
    expect(decision.getAttribute("data-tip")).toContain(`Time ${when(at(14))}`);
  });

  it("opens Matches for the field and the value when a pivot row is pressed", () => {
    render(<SharedValuesSection entity={N4} />);
    fireEvent.click(screen.getByRole("button", { name: sharedRowName("Request", "Network ID", 1, 2) }));
    expect(useMatches.getState().active).toMatchObject({ mode: "field", field: "network_id", value: "net-1" });
  });

  it("selects the decision when a decision row is pressed", () => {
    const navigate = vi.fn();
    useNavigation.setState({ navigate });
    render(<SharedValuesSection entity={N4} />);
    fireEvent.click(screen.getByRole("button", { name: sharedRowName("Decision", "Event Ids", 0, 1) }));
    expect(navigate).toHaveBeenCalledTimes(1);
    expect(navigate).toHaveBeenCalledWith({ kind: "entity", entity: DECISION });
  });

  it("returns the Inspector's scroll to the top and takes focus when a decision row is pressed inside the panel", () => {
    const navigate = vi.fn();
    useNavigation.setState({ navigate });
    const { container } = render(
      <aside aria-label="Inspector" tabIndex={-1}>
        <div data-inspector-scroll>
          <SharedValuesSection entity={N4} />
        </div>
      </aside>,
    );
    const scroller = container.querySelector<HTMLElement>("[data-inspector-scroll]")!;
    scroller.scrollTop = 120;
    fireEvent.click(screen.getByRole("button", { name: sharedRowName("Decision", "Event Ids", 0, 1) }));
    expect(scroller.scrollTop).toBe(0);
    expect(document.activeElement).toBe(container.querySelector("aside"));
  });

  it("counts the records the playhead has reached, and the figure follows the playhead", () => {
    render(<SharedValuesSection entity={N4} />);
    // nw-0005 (11:00) is before the playhead (12:00); nw-0006 (15:00) is after it.
    expect(screen.getByRole("button", { name: sharedRowName("Network seen", "Principal ID", 1, 2) })).toBeInTheDocument();
    act(() => usePlayhead.setState({ playhead: at(16) }));
    expect(screen.getByRole("button", { name: sharedRowName("Network seen", "Principal ID", 2, 2) })).toHaveTextContent("2 / 2");
  });

  it("counts every record before the playhead's bounds have loaded", () => {
    usePlayhead.setState({ playhead: at(9), minTime: 0, maxTime: 0 });
    render(<SharedValuesSection entity={N4} />);
    expect(screen.getByRole("button", { name: sharedRowName("Network seen", "Principal ID", 2, 2) })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: sharedRowName("Decision", "Event Ids", 1, 1) })).toBeInTheDocument();
  });

  it("draws the kind's icon in the node's colour, and none when the node gives none", () => {
    render(<SharedValuesSection entity={N4} />);
    const withColour = screen.getByRole("button", { name: sharedRowName("Network seen", "Principal ID", 1, 2) });
    const kindIcon = withColour.firstElementChild as SVGElement;
    expect(kindIcon.classList.contains("lucide-scan-eye")).toBe(true);
    expect(kindIcon.style.color).not.toBe("");
    const without = screen.getByRole("button", { name: sharedRowName("Request", "Principal ID", 1, 2) });
    const plain = without.firstElementChild as SVGElement;
    expect(plain.classList.contains("lucide-send")).toBe(true);
    expect(plain.style.color).toBe("");
  });

  it("draws the kind's icon, then the field's icon, before the words and the count", () => {
    render(<SharedValuesSection entity={N4} />);
    const row = screen.getByRole("button", { name: sharedRowName("Request", "Network ID", 1, 2) });
    const [kindIcon, fieldIcon, kindWords, fieldWords, count] = Array.from(row.children);
    expect(kindIcon.classList.contains("lucide-send")).toBe(true);
    expect(fieldIcon.classList.contains("lucide-network")).toBe(true);
    expect(kindWords.textContent).toBe("Request");
    expect(fieldWords.textContent).toBe("Network ID");
    expect(count.textContent).toBe("1 / 2");
    const decision = screen.getByRole("button", { name: sharedRowName("Decision", "Event Ids", 0, 1) });
    expect(decision.children[0].classList.contains("lucide-gavel")).toBe(true);
    expect(decision.children[1].classList.contains("lucide-logs")).toBe(true);
  });

  it("the icons add no word: the accessible names and the tooltips are as they were", () => {
    render(<SharedValuesSection entity={N4} />);
    for (const row of rowButtons()) {
      const [kindIcon, fieldIcon] = Array.from(row.children);
      for (const icon of [kindIcon, fieldIcon]) {
        expect(icon.tagName.toLowerCase()).toBe("svg");
        expect(icon.getAttribute("aria-hidden")).toBe("true");
        expect(icon.textContent).toBe("");
      }
      expect(row.getAttribute("aria-label")).not.toBeNull();
    }
    const row = screen.getByRole("button", { name: sharedRowName("Network seen", "Principal ID", 1, 2) });
    expect(row.getAttribute("data-tip")).toBe(sharedRowWords("Network seen", "Principal ID", "pr-1", 1, 2).join("\n"));
  });

  it("prints the time in the clock's form in a decision row's tooltip", () => {
    useClockForm.setState({ h24: true });
    render(<SharedValuesSection entity={N4} />);
    const decision = screen.getByRole("button", { name: sharedRowName("Decision", "Event Ids", 0, 1) });
    expect(decision.getAttribute("data-tip")).toBe(
      sharedDecisionWords("Decision", "Event Ids", "nw-0004", "dc-1", at(14), "24h").join("\n"),
    );
  });

  it("draws each row as a plain button with no rounded corner (no pill, no rounded box)", () => {
    render(<SharedValuesSection entity={N4} />);
    for (const b of rowButtons()) expect(b.className).not.toMatch(/\brounded/);
  });
});

// The Layers switches (C3 c, C5 b): a row counts like a Layers row, by the one function, so a switched-off
// kind reads 0 of its total and a switched-off value lowers only its own records. Nothing here asserts a
// pin's win (PIN_WINS is false before item 1).
describe("SharedValuesSection under the Layers switches", () => {
  beforeEach(() => {
    useLayers.setState({ hiddenKinds: [], hiddenValues: {} });
    useSelection.setState({ selected: null });
  });
  afterEach(() => {
    useLayers.setState({ hiddenKinds: [], hiddenValues: {} });
  });

  it("reads 0 of the total for a row whose records are all of a switched-off kind", () => {
    useLayers.setState({ hiddenKinds: ["network_seen"] });
    render(<SharedValuesSection entity={N4} />);
    expect(screen.getByRole("button", { name: sharedRowName("Network seen", "Principal ID", 0, 2) })).toHaveTextContent("0 / 2");
    // The other kinds' rows keep their figures.
    expect(screen.getByRole("button", { name: sharedRowName("Request", "Principal ID", 1, 2) })).toBeInTheDocument();
  });

  it("lowers only the records of a switched-off value, and gives them back when it is on again", () => {
    // nw-0005 (net-2, 11:00, reached) and nw-0006 (net-3, 15:00, ahead of the playhead at 12:00).
    useSchema.setState({ nodes: NODES.map((n) => (n.kind === "network_seen" ? { ...n, filter: { field: "network_id", label: "Network" } } : n)) });
    useLayers.setState({ hiddenValues: { network_seen: ["net-2"] } });
    render(<SharedValuesSection entity={N4} />);
    expect(screen.getByRole("button", { name: sharedRowName("Network seen", "Principal ID", 0, 2) })).toBeInTheDocument();
    act(() => usePlayhead.setState({ playhead: at(16) }));
    expect(screen.getByRole("button", { name: sharedRowName("Network seen", "Principal ID", 1, 2) })).toBeInTheDocument();
    act(() => useLayers.setState({ hiddenValues: {} }));
    expect(screen.getByRole("button", { name: sharedRowName("Network seen", "Principal ID", 2, 2) })).toBeInTheDocument();
  });

  it("keeps the folded line's figure on the switches too", () => {
    useLayers.setState({ hiddenKinds: ["principal"] });
    render(<SharedValuesSection entity={N4} />);
    fireEvent.click(screen.getByRole("button", { name: "Fold the Shared values section" }));
    expect(screen.getByText("Key or seat Principal ID 0 / 1")).toBeInTheDocument();
  });
});

// The fold: the title is a button, and folded the section shows its first row as it prints.
describe("SharedValuesSection fold", () => {
  const FIRST = "Key or seat Principal ID 1 / 1";

  it("folds to its first row's text, and no row button is left", () => {
    render(<SharedValuesSection entity={N4} />);
    expect(rowButtons()).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: sectionFoldName("Shared values", true) }));
    const line = screen.getByText(FIRST);
    expect(line.getAttribute("data-tip")).toBe(FIRST);
    expect(screen.queryByRole("button", { name: sharedRowName("Network seen", "Principal ID", 1, 2) })).toBeNull();
    expect(screen.getByRole("button", { name: sectionFoldName("Shared values", false) })).toHaveAttribute("aria-expanded", "false");
  });

  it("opens again to every row", () => {
    render(<SharedValuesSection entity={N4} />);
    fireEvent.click(screen.getByRole("button", { name: "Fold the Shared values section" }));
    fireEvent.click(screen.getByRole("button", { name: "Open the Shared values section" }));
    expect(rowButtons()).toHaveLength(5);
    expect(screen.queryByText(FIRST)).toBeNull();
  });

  it("keeps the folded line's figure on the playhead", () => {
    // A record whose first row is a timed kind: pr-2 has no principal record, so its first row is the one
    // other Network seen record that shares it (10:00 is the record, 15:00 is the member).
    const own = make("network_seen", { id: "nw-20", timestamp: T(10), principal_id: "pr-2", network_id: "net-90" });
    const member = make("network_seen", { id: "nw-21", timestamp: T(15), principal_id: "pr-2", network_id: "net-91" });
    load([own, member]);
    usePlayhead.setState({ playhead: at(12), minTime: at(8), maxTime: at(20) });
    render(<SharedValuesSection entity={own} />);
    fireEvent.click(screen.getByRole("button", { name: "Fold the Shared values section" }));
    expect(screen.getByText("Network seen Principal ID 0 / 1")).toBeInTheDocument();
    act(() => usePlayhead.setState({ playhead: at(16) }));
    expect(screen.getByText("Network seen Principal ID 1 / 1")).toBeInTheDocument();
    expect(screen.queryByText("Network seen Principal ID 0 / 1")).toBeNull();
  });
});
