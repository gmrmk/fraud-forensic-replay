import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { ManifestFieldsSection } from "./ManifestFieldsSection";
import { useSchema } from "../../store/schema";
import { useMatches } from "../../store/matches";
import { usePivotData } from "../../store/pivot-data";
import type { Entity } from "../../lib/entity";
import type { ScenarioNode } from "../../lib/scenarios";

const node: ScenarioNode = {
  kind: "account_change", label: "Account change", palette: "#ffb347", source: "json",
  coords: { lat: "lat", lng: "lng" }, timestamp: "timestamp",
  pivotable: ["member_id", "bank_account", "ip_address"],
  sections: [{ id: "account-change", label: "Bank-account change",
    fields: ["old_bank_account", "old_bank_name", "bank_account", "bank_name", "timestamp"] }],
};
const change: Entity = {
  id: "ch-0002", kind: "account_change", timestamp: Date.parse("2026-06-08T09:08:51-05:00"),
  coords: { lat: 52.3676, lng: 4.9041 },
  fields: {
    id: "ch-0002", member_id: "mem-5169", holder_name: "Dana Whitlow", timestamp: "2026-06-08T09:08:51-05:00",
    old_bank_account: "ACCT ****1685", old_bank_name: "Wrenholt Bank",
    bank_account: "ACCT ****4471", bank_name: "Vantrell Digital Bank", ip_address: "203.0.113.66",
    lat: 52.3676, lng: 4.9041,
  },
  displayMetadata: { primaryLabel: "Dana Whitlow", secondaryLabel: "", paletteKind: "account_change", pivotableFields: node.pivotable! },
};

beforeEach(() => {
  useSchema.setState({ nodes: [node] });
  useMatches.setState({ active: null });
});

describe("ManifestFieldsSection declared sections", () => {
  it("renders the section in declared order with a pop-out control", () => {
    render(<ManifestFieldsSection entity={change} />);
    expect(screen.getByText("Bank-account change")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Pop out Bank-account change beside its pin" })).toBeInTheDocument();
    const text = document.body.textContent ?? "";
    expect(text.indexOf("ACCT ****1685")).toBeLessThan(text.indexOf("ACCT ****4471"));
    expect(text).toContain("Mon Jun 8 · 9:08a");
    expect(text).not.toContain("2026-06-08T09:08:51-05:00");
    expect(screen.getByTitle("2026-06-08T09:08:51-05:00")).toHaveTextContent("Mon Jun 8 · 9:08a");
  });

  it("a pivotable datetime shows Houston time and pivots on the raw value", () => {
    const pivotNode = { ...node, pivotable: [...node.pivotable!, "changed_at"] };
    useSchema.setState({ nodes: [pivotNode] });
    render(<ManifestFieldsSection entity={{ ...change, fields: { ...change.fields, changed_at: "2026-06-08T09:08:51-05:00" } }} />);
    fireEvent.click(screen.getByTitle("Find matches for changed_at=2026-06-08T09:08:51-05:00"));
    expect(screen.getByTitle("Find matches for changed_at=2026-06-08T09:08:51-05:00")).toHaveTextContent("Mon Jun 8 · 9:08a");
    expect(useMatches.getState().active).toMatchObject({ field: "changed_at", value: "2026-06-08T09:08:51-05:00" });
  });

  it("does not repeat section fields in the remaining list, and keeps the rest", () => {
    render(<ManifestFieldsSection entity={change} />);
    expect(screen.getAllByText("ACCT ****4471")).toHaveLength(1);
    expect(screen.getByText("Account change Fields")).toBeInTheDocument();
    expect(screen.getByText("203.0.113.66")).toBeInTheDocument();
  });

  it("a pivotable field with no value shows a dash and offers no pivot", () => {
    render(<ManifestFieldsSection entity={{ ...change, fields: { ...change.fields, ip_address: null } }} />);
    expect(screen.queryByTitle(/^Find matches for ip_address=/)).toBeNull();
    expect(screen.getByText("-")).toBeInTheDocument();
  });

  // The ink of a plain field's value. The decision record's Outcome, Decided By and the label of its
  // target all sat in text-dim (raw --text-faint, 4.96 to 1 on the light panel), so the outcome was the faintest line
  // of its panel while the card id read in full ink. The reading of "secondary": the node's own
  // `secondary` template. A field the primary template names, or neither template names, takes the
  // panel's ink; a field only the secondary template names takes the Inspector's grey.
  describe("a plain field's value ink", () => {
    const decisionNode: ScenarioNode = {
      kind: "decision", label: "Decision", palette: "#ffb347", source: "json",
      primary: "${outcome} · ${target_label}", secondary: "${decided_by} · ${note_kind}",
      pivotable: ["card_id"],
    };
    const decision: Entity = {
      id: "dec-1", kind: "decision", timestamp: Date.parse("2026-06-08T09:08:51-05:00"), coords: null,
      fields: {
        id: "dec-1", card_id: "card-1", decided_by: "investigator", outcome: "PASSED",
        target_label: "Marcus Chen", note_kind: "memo", note: "A note.",
      },
      displayMetadata: { primaryLabel: "PASSED", secondaryLabel: "", paletteKind: "decision", pivotableFields: ["card_id"] },
    } as unknown as Entity;
    const valueOf = (text: string) => screen.getByText(text).closest(".font-mono") as HTMLElement;

    it("the primary template's fields and the unnamed ones take the panel's ink", () => {
      useSchema.setState({ nodes: [decisionNode] });
      render(<ManifestFieldsSection entity={decision} />);
      for (const text of ["PASSED", "Marcus Chen", "A note."]) {
        expect(valueOf(text).className, text).toContain("text-text");
        expect(valueOf(text).className, text).not.toContain("text-dim");
        expect(valueOf(text).className, text).not.toContain("--text-faint");
      }
    });

    it("a field only the secondary template names takes the Inspector's grey, not raw text-dim", () => {
      useSchema.setState({ nodes: [decisionNode] });
      render(<ManifestFieldsSection entity={decision} />);
      for (const text of ["investigator", "memo"]) {
        expect(valueOf(text).className, text).toContain("text-[color:var(--text-faint-on-inspector)]");
        expect(valueOf(text).className, text).not.toContain("text-dim");
      }
    });

    it("a field both templates name is a primary field", () => {
      useSchema.setState({ nodes: [{ ...decisionNode, secondary: "${outcome} · ${decided_by}" }] });
      render(<ManifestFieldsSection entity={decision} />);
      expect(valueOf("PASSED").className).toContain("text-text");
      expect(valueOf("investigator").className).toContain("text-[color:var(--text-faint-on-inspector)]");
    });
  });

  it("a pivotable field inside a section still pivots", () => {
    render(<ManifestFieldsSection entity={change} />);
    fireEvent.click(screen.getByTitle("Find matches for bank_account=ACCT ****4471"));
    expect(useMatches.getState().active).toMatchObject({ mode: "field", field: "bank_account", value: "ACCT ****4471" });
  });
});

// The Shared values section closes the body: the record's declared sections first, then the leftover
// fields, then Shared values last, and only when some other record shares a pivotable value.
describe("ManifestFieldsSection Shared values", () => {
  const other: Entity = {
    ...change, id: "ch-0003", timestamp: Date.parse("2026-06-09T09:08:51-05:00"),
    fields: { ...change.fields, id: "ch-0003" },
  };

  afterEach(() => usePivotData.setState({ transactions: [], logins: [], accountEvents: [], transfers: [], entities: [] }));

  it("comes last, after the declared sections and the remaining fields", () => {
    usePivotData.setState({ transactions: [], logins: [], accountEvents: [], transfers: [], entities: [change, other] });
    render(<ManifestFieldsSection entity={change} />);
    const text = document.body.textContent ?? "";
    expect(text).toContain("Shared values");
    expect(text.indexOf("Shared values")).toBeGreaterThan(text.indexOf("Account change Fields"));
    expect(text.indexOf("Account change Fields")).toBeGreaterThan(text.indexOf("Bank-account change"));
    const sections = [...document.querySelectorAll("div.border-t.border-panel-border")];
    expect(sections.at(-1)?.textContent).toMatch(/^Shared values/);
  });

  it("is not drawn when no other record shares a value", () => {
    usePivotData.setState({ transactions: [], logins: [], accountEvents: [], transfers: [], entities: [change] });
    render(<ManifestFieldsSection entity={change} />);
    expect(screen.queryByText("Shared values")).toBeNull();
  });

  it("is not drawn when the rows are not loaded", () => {
    render(<ManifestFieldsSection entity={change} />);
    expect(screen.queryByText("Shared values")).toBeNull();
  });
});

// Each section of the manifest body folds to its first row, as that row prints. Every section starts open.
describe("ManifestFieldsSection fold", () => {
  const other: Entity = {
    ...change, id: "ch-0003", timestamp: Date.parse("2026-06-09T09:08:51-05:00"),
    fields: { ...change.fields, id: "ch-0003" },
  };

  afterEach(() => usePivotData.setState({ transactions: [], logins: [], accountEvents: [], transfers: [], entities: [] }));

  it("starts every section open, each with a fold button", () => {
    render(<ManifestFieldsSection entity={change} />);
    expect(screen.getByRole("button", { name: "Fold the Bank-account change section" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("button", { name: "Fold the Account change Fields section" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Vantrell Digital Bank")).toBeInTheDocument();
  });

  it("folds a declared section to its first row and opens it again", () => {
    render(<ManifestFieldsSection entity={change} />);
    fireEvent.click(screen.getByRole("button", { name: "Fold the Bank-account change section" }));
    const line = screen.getByText("Old Bank Account: ACCT ****1685");
    expect(line.getAttribute("data-tip")).toBe("Old Bank Account: ACCT ****1685");
    expect(screen.queryByText("Vantrell Digital Bank")).toBeNull();
    // The remaining fields are another section and stay open.
    expect(screen.getByText("203.0.113.66")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open the Bank-account change section" }));
    expect(screen.getByText("Vantrell Digital Bank")).toBeInTheDocument();
    expect(screen.queryByText("Old Bank Account: ACCT ****1685")).toBeNull();
  });

  it("folds the remaining-fields section to its first row", () => {
    render(<ManifestFieldsSection entity={change} />);
    fireEvent.click(screen.getByRole("button", { name: "Fold the Account change Fields section" }));
    expect(screen.queryByText("203.0.113.66")).toBeNull();
    expect(screen.getByText("IP Address: 203.0.113.66")).toBeInTheDocument();
    // The declared section stays open.
    expect(screen.getByText("Vantrell Digital Bank")).toBeInTheDocument();
  });

  it("keeps the pop-out control outside the fold button", () => {
    render(<ManifestFieldsSection entity={change} />);
    const fold = screen.getByRole("button", { name: "Fold the Bank-account change section" });
    expect(fold).not.toContainElement(screen.getByRole("button", { name: "Pop out Bank-account change beside its pin" }));
    fireEvent.click(fold);
    expect(screen.getByRole("button", { name: "Pop out Bank-account change beside its pin" })).toBeInTheDocument();
  });

  it("folds Shared values too, last, and a folded section keeps its own state apart from the others", () => {
    usePivotData.setState({ transactions: [], logins: [], accountEvents: [], transfers: [], entities: [change, other] });
    render(<ManifestFieldsSection entity={change} />);
    fireEvent.click(screen.getByRole("button", { name: "Fold the Shared values section" }));
    const sections = [...document.querySelectorAll("div.border-t.border-panel-border")];
    expect(sections.at(-1)?.textContent).toMatch(/^Shared values/);
    expect(screen.getByRole("button", { name: "Open the Shared values section" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("button", { name: "Fold the Bank-account change section" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Vantrell Digital Bank")).toBeInTheDocument();
  });

  // What the page does (Inspector.tsx mounts the body with no key): a fold is the section component's
  // state, so it stays through a move to another record of the same kind, and is not saved anywhere.
  it("keeps a fold through a move to another record of the same kind, and lets a section of another id start open", () => {
    const { rerender } = render(<ManifestFieldsSection entity={change} />);
    fireEvent.click(screen.getByRole("button", { name: "Fold the Bank-account change section" }));
    rerender(<ManifestFieldsSection entity={other} />);
    expect(screen.getByRole("button", { name: "Open the Bank-account change section" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Vantrell Digital Bank")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Fold the Account change Fields section" }));
    const otherKind: ScenarioNode = { ...node, kind: "payee", label: "Payee", sections: [{ id: "payee", label: "Payee details", fields: ["bank_name"] }] };
    useSchema.setState({ nodes: [node, otherKind] });
    rerender(<ManifestFieldsSection entity={{ ...other, kind: "payee" }} />);
    expect(screen.getByRole("button", { name: "Fold the Payee details section" })).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Vantrell Digital Bank")).toBeInTheDocument();
    // The remaining-fields section sits in a fixed place, so its fold goes with it to another kind.
    expect(screen.getByRole("button", { name: "Open the Payee Fields section" })).toHaveAttribute("aria-expanded", "false");
    useSchema.setState({ nodes: [node] });
  });

  it("a section with no row has nothing to fold to and gets no fold button", () => {
    useSchema.setState({ nodes: [{ ...node, sections: [{ id: "empty", label: "Nothing here", fields: [] }] }] });
    render(<ManifestFieldsSection entity={change} />);
    expect(screen.getByText("Nothing here")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Nothing here section/ })).toBeNull();
    useSchema.setState({ nodes: [node] });
  });
});

// The manifest key `omit` reaches the screen through buildFieldEntries: a node that omits the filler
// timestamp prints no Timestamp row and, when nothing else is left, no remaining-fields section.
describe("ManifestFieldsSection omit", () => {
  const untimed: ScenarioNode = {
    kind: "org", label: "Organisation", palette: "#4da3ff", source: "json", pivotable: ["org_id"],
    sections: [{ id: "account", label: "Account", fields: ["org_id", "name"] }],
  };
  const org: Entity = {
    id: "org-1", kind: "org", timestamp: 0, coords: null,
    fields: { id: "org-1", org_id: "org-1", name: "Example Org", timestamp: 0 },
    displayMetadata: { primaryLabel: "Example Org", secondaryLabel: "", paletteKind: "org", pivotableFields: ["org_id"] },
  };
  const withOmit = (omit: unknown) => ({ ...untimed, omit }) as unknown as ScenarioNode;

  it("prints the filler Timestamp row today, when the node declares no omit", () => {
    useSchema.setState({ nodes: [untimed] });
    render(<ManifestFieldsSection entity={org} />);
    expect(screen.getByText("Organisation Fields")).toBeInTheDocument();
    expect(screen.getByText("Timestamp")).toBeInTheDocument();
  });

  it("prints no Timestamp row and no empty Organisation Fields section when the node omits it", () => {
    useSchema.setState({ nodes: [withOmit(["timestamp"])] });
    render(<ManifestFieldsSection entity={org} />);
    expect(screen.queryByText("Timestamp")).toBeNull();
    expect(screen.queryByText("Organisation Fields")).toBeNull();
    expect(screen.getByText("Account")).toBeInTheDocument();
  });
});

// Ship list entry 30: every row of a manifest body starts with the library icon of its record key,
// inside the label's own span and before its words. The key, never the label, finds the icon.
describe("ManifestFieldsSection row icons", () => {
  const firstIconOf = (label: string | RegExp) =>
    ((screen.getByText(label).parentElement as HTMLElement).firstElementChild as Element).getAttribute("class") ?? "";

  it("every row starts with the icon of its record key", () => {
    const { container } = render(<ManifestFieldsSection entity={{ ...change, fields: { ...change.fields, holder_name: "Dana Whitlow" } }} />);
    const labels = container.querySelectorAll("span.float-left");
    expect(labels.length).toBe(8);
    for (const label of labels) expect(label.querySelector("svg.lucide"), label.textContent ?? "").not.toBeNull();
    expect(firstIconOf("IP Address")).toContain("lucide-ethernet-port");
    expect(firstIconOf("Timestamp")).toContain("lucide-clock");
    // a key the vocabulary does not hold takes the library's square-dashed
    expect(firstIconOf("Holder Name")).toContain("lucide-square-dashed");
  });

  it("a record key that is an alias takes the vocabulary id's icon", () => {
    const sample: ScenarioNode = {
      kind: "sample", label: "Sample", palette: "#4da3ff", source: "json", timestamp: "timestamp",
      pivotable: ["ip"],
    };
    useSchema.setState({ nodes: [sample] });
    const entity: Entity = {
      id: "s-1", kind: "sample", timestamp: 0, coords: null,
      fields: { id: "s-1", ip: "203.0.113.9", spend_usd: 12, timestamp: "2026-06-08T09:08:51-05:00" },
      displayMetadata: { primaryLabel: "s-1", secondaryLabel: "", paletteKind: "sample", pivotableFields: ["ip"] },
    };
    render(<ManifestFieldsSection entity={entity} />);
    // a pivotable value (PivotableRow) and a money value (CurrencyRow)
    expect(firstIconOf("IP")).toContain("lucide-ethernet-port");
    expect(firstIconOf(/^Spend Usd$|^Spend USD$/i)).toContain("lucide-dollar-sign");
  });
});
