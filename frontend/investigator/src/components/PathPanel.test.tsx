import { afterEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { PathPanel, offeredPathKinds } from "./PathPanel";
import type { LoginEvent, Transaction, Transfer } from "../types";
import { usePathSession } from "./paths/path-session";
import { makePath } from "../lib/notes/test-fixtures";
import { useLayers } from "../store/layers";
import { useMarksStore } from "../store/marks";
import { useSchema } from "../store/schema";
import { useTheme } from "../store/theme";
import { kindOnPanelVar } from "../lib/entity-palette";
import { COLOR_MODES, THEMES } from "../theme/axes";
import { contrastRatio } from "../theme/legibility";
import { resolvePalette } from "../theme/resolve";

const DEFAULT_PATHS = { fraud: true, auth: false, login: false, transfer: false };
const savedTheme = { theme: useTheme.getState().theme, color: useTheme.getState().color };

afterEach(() => {
  useMarksStore.getState().clear();
  usePathSession.setState({ draft: null, hidden: [], chosen: null });
  useLayers.setState({ pathKinds: DEFAULT_PATHS });
  useSchema.setState({ nodes: [] });
  useTheme.setState(savedTheme);
});

const tx = (is_fraud: number) => ({ is_fraud }) as unknown as Transaction;
const login = {} as unknown as LoginEvent;
const transfer = {} as unknown as Transfer;
const none = { transactions: [], logins: [], transfers: [] };

const node = (kind: string, label: string, palette: string) => ({
  kind, label, palette, source: "sql", coords: null, timestamp: "at", primary: "${id}",
});

// Every path toggle is a button that carries a pressed state.
const toggles = () => document.querySelectorAll("button[aria-pressed]");

describe("offeredPathKinds", () => {
  const all = { fraud: true, auth: true, login: true, transfer: true };

  it("offers every kind when the case has the data behind each", () => {
    expect(
      offeredPathKinds(all, { transactions: [tx(1)], logins: [login], transfers: [transfer] }),
    ).toEqual(["fraud", "auth", "login", "transfer"]);
  });

  it("withholds transfer unless there are transfers", () => {
    const data = { transactions: [tx(1)], logins: [login], transfers: [] };
    expect(offeredPathKinds(all, data)).not.toContain("transfer");
    expect(offeredPathKinds(all, { ...data, transfers: [transfer] })).toContain("transfer");
  });

  it("withholds fraud unless some transaction is fraud (a case with none draws no fraud arc)", () => {
    const data = { transactions: [tx(0)], logins: [login], transfers: [transfer] };
    expect(offeredPathKinds(all, data)).not.toContain("fraud");
    expect(offeredPathKinds(all, { ...data, transactions: [tx(0), tx(1)] })).toContain("fraud");
  });

  it("withholds auth unless there are transactions", () => {
    expect(offeredPathKinds(all, { ...none, logins: [login] })).not.toContain("auth");
    expect(offeredPathKinds(all, { ...none, transactions: [tx(0)] })).toContain("auth");
  });

  it("withholds login unless there are logins", () => {
    expect(offeredPathKinds(all, { ...none, transactions: [tx(1)] })).not.toContain("login");
    expect(offeredPathKinds(all, { ...none, logins: [login] })).toContain("login");
  });

  it("always offers a manifest kind, and keeps the store's order", () => {
    expect(offeredPathKinds({ shipment: true, fraud: true }, none)).toEqual(["shipment"]);
    expect(offeredPathKinds({ fraud: true, shipment: false, console_signin: true }, { ...none, transactions: [tx(1)] })).toEqual([
      "fraud",
      "shipment",
      "console_signin",
    ]);
  });

  it("offers nothing for a case with no path data", () => {
    expect(offeredPathKinds(DEFAULT_PATHS, none)).toEqual([]);
  });
});

describe("PathPanel", () => {
  it("with no kind on offer, draws the line in place of rows, and the only buttons are New path and Join pinned", () => {
    render(<PathPanel kinds={[]} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons.map((b) => b.textContent?.replace(/\d+$/, ""))).toEqual(["New path", "Join pinned"]);
    expect(toggles()).toHaveLength(0);
    const line = screen.getByText("No paths in this case");
    expect(line.tagName).toBe("DIV");
    expect(line.classList.contains("text-dim")).toBe(true);
  });

  it("with a saved path and no data kind, drops the empty line and shows Your paths", () => {
    useMarksStore.setState({ paths: [makePath()] });
    render(<PathPanel kinds={[]} />);
    expect(screen.queryByText("No paths in this case")).toBeNull();
    expect(screen.getByRole("heading", { name: "Your paths" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Path 1, your path" })).toBeTruthy();
  });

  it("with data kinds and a saved path, the hairline sits between the data rows and the heading, and another above the buttons", () => {
    useMarksStore.setState({ paths: [makePath()] });
    render(<PathPanel kinds={["fraud"]} />);
    const lines = screen.getAllByRole("separator");
    expect(lines).toHaveLength(2);
    const after = (a: Element, b: Element) => Boolean(a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING);
    const row = screen.getByRole("button", { name: "fraud path" });
    const heading = screen.getByRole("heading", { name: "Your paths" });
    const join = screen.getByRole("button", { name: /^Join pinned/ });
    expect(after(row, lines[0]) && after(lines[0], heading)).toBe(true);
    expect(after(heading, lines[1]) && after(lines[1], join)).toBe(true);
  });

  it("with no data kind and no saved path, one hairline separates the empty line from the buttons", () => {
    render(<PathPanel kinds={[]} />);
    expect(screen.getAllByRole("separator")).toHaveLength(1);
  });

  it("with a kind on offer, draws no empty line", () => {
    render(<PathPanel kinds={["fraud"]} />);
    expect(screen.queryByText("No paths in this case")).toBeNull();
  });

  it("renders one pressed-state button per kind, with no count or chevron on them, and the path button follows", () => {
    useLayers.setState({ pathKinds: { fraud: true, auth: false, login: false, transfer: false } });
    render(<PathPanel kinds={["fraud", "auth"]} />);
    expect(toggles()).toHaveLength(2);
    const all = screen.getAllByRole("button");
    expect(all).toHaveLength(4);
    expect(all[2].textContent).toBe("New path");
    expect(all[3].textContent).toContain("Join pinned");
    expect(all[2].hasAttribute("aria-pressed")).toBe(false);
    expect(all[3].hasAttribute("aria-pressed")).toBe(false);
    for (const t of toggles()) expect(t.querySelector(".tabular-nums")).toBeNull();
    expect(screen.getByRole("button", { name: "fraud path" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "auth path" }).getAttribute("aria-pressed")).toBe("false");
  });

  it("keeps an off path's text at full strength: no fade of any strength on any row", () => {
    // An off path reads as off through its ring square and aria-pressed, not through opacity.
    useLayers.setState({ pathKinds: { fraud: false, auth: false, login: false, transfer: false } });
    const { container } = render(<PathPanel kinds={["fraud", "auth", "login", "transfer"]} />);
    const faded = [...container.querySelectorAll<HTMLElement>("*")].filter(
      (el) => [...el.classList].some((c) => /(^|:)opacity-/.test(c)) || el.style.opacity !== "",
    );
    expect(faded.map((el) => el.outerHTML.slice(0, 80))).toEqual([]);
    expect(toggles()).toHaveLength(4);
  });

  it("toggles that path in the store on a click", () => {
    render(<PathPanel kinds={["fraud", "auth"]} />);
    fireEvent.click(screen.getByRole("button", { name: "auth path" }));
    expect(useLayers.getState().pathKinds.auth).toBe(true);
    expect(useLayers.getState().pathKinds.fraud).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "fraud path" }));
    expect(useLayers.getState().pathKinds.fraud).toBe(false);
  });

  it("shows the scenario node's label for a kind that has one, with no underscore", () => {
    useSchema.setState({ nodes: [node("console_signin", "Console sign-in", "#7ee787")] });
    useLayers.setState({ pathKinds: { ...DEFAULT_PATHS, console_signin: true } });
    render(<PathPanel kinds={["console_signin"]} />);
    expect(screen.getByText("Console sign-in")).toBeTruthy();
    const button = screen.getByRole("button", { name: "Console sign-in path" });
    expect(button.textContent).not.toContain("_");
  });

  it("shows the kind with spaces for a kind without a node", () => {
    useSchema.setState({ nodes: [] });
    useLayers.setState({ pathKinds: { ...DEFAULT_PATHS, account_event_log: false, transfer: false } });
    render(<PathPanel kinds={["account_event_log", "transfer"]} />);
    expect(screen.getByRole("button", { name: "account event log path" })).toBeTruthy();
    expect(screen.getByText("account event log")).toBeTruthy();
    expect(screen.getByRole("button", { name: "transfer path" })).toBeTruthy();
  });

  it("fills a slotted kind's square with its on-panel var when on, and rings it when off", () => {
    useLayers.setState({ pathKinds: { ...DEFAULT_PATHS, auth: true, login: false } });
    render(<PathPanel kinds={["auth", "login"]} />);
    const square = (name: string) =>
      screen.getByRole("button", { name }).querySelector("span[aria-hidden]") as HTMLElement;
    const on = square("auth path");
    expect(on.style.backgroundColor).toBe("var(--r1-on-panel)");
    expect(on.classList.contains("border-dim")).toBe(false);
    const off = square("login path");
    expect(off.classList.contains("border-dim")).toBe(true);
    expect(off.style.backgroundColor).toBe("");
  });

  it("fills each default kind's square with the on-panel var of its own kind", () => {
    const kinds = ["fraud", "auth", "login", "transfer"];
    useLayers.setState({ pathKinds: { fraud: true, auth: true, login: true, transfer: true } });
    render(<PathPanel kinds={kinds} />);
    const vars = new Set<string>();
    for (const kind of kinds) {
      const square = screen
        .getByRole("button", { name: `${kind} path` })
        .querySelector("span[aria-hidden]") as HTMLElement;
      expect(square.style.backgroundColor, kind).toBe(`var(${kindOnPanelVar(kind)})`);
      vars.add(kindOnPanelVar(kind));
    }
    // The kinds do not all share one slot, so the loop above tells them apart.
    expect(vars.size).toBeGreaterThan(1);
  });

  it("fills another kind's square with its declared colour where that reads on the menu", () => {
    useTheme.setState({ theme: "dark", color: "neon" });
    useSchema.setState({ nodes: [node("shipment", "Shipment", "#ffb347")] });
    useLayers.setState({ pathKinds: { ...DEFAULT_PATHS, shipment: true } });
    render(<PathPanel kinds={["shipment"]} />);
    const sq = screen.getByRole("button", { name: "Shipment path" }).querySelector("span[aria-hidden]") as HTMLElement;
    expect(sq.style.backgroundColor).toMatch(/#ffb347|rgb\(255, 179, 71\)/i);
  });

  it("steps a declared colour to 3:1 on the menu in every theme and colour mode", () => {
    const rgbOf = (css: string): [number, number, number] => {
      const hex = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(css);
      const m = hex ?? /rgba?\((\d+),\s*(\d+),\s*(\d+)/.exec(css);
      if (!m) throw new Error(`unparsed colour ${css}`);
      return [1, 2, 3].map((i) => (hex ? parseInt(m[i], 16) : Number(m[i])) / 255) as [number, number, number];
    };
    const failures: string[] = [];
    useSchema.setState({ nodes: [node("console_signin", "Console sign-in", "#7ee787")] });
    useLayers.setState({ pathKinds: { ...DEFAULT_PATHS, console_signin: true } });
    for (const theme of THEMES) {
      for (const color of COLOR_MODES) {
        useTheme.setState({ theme, color });
        const { unmount } = render(<PathPanel kinds={["console_signin"]} />);
        const sq = screen
          .getByRole("button", { name: "Console sign-in path" })
          .querySelector("span[aria-hidden]") as HTMLElement;
        const surface = resolvePalette(theme, color)
          .material.panelBase.split(/\s+/)
          .map((n) => Number(n) / 255) as [number, number, number];
        const c = contrastRatio(rgbOf(sq.style.backgroundColor), surface);
        if (c < 3) failures.push(`${theme}.${color} ${sq.style.backgroundColor} ${c.toFixed(2)}:1`);
        unmount();
      }
    }
    expect(failures).toEqual([]);
  });

  it("re-steps its squares when the theme changes under the mounted panel", () => {
    useSchema.setState({ nodes: [node("console_signin", "Console sign-in", "#7ee787")] });
    useLayers.setState({ pathKinds: { ...DEFAULT_PATHS, console_signin: true } });
    useTheme.setState({ theme: "dark", color: "rainbow" });
    render(<PathPanel kinds={["console_signin"]} />);
    const sq = () =>
      screen.getByRole("button", { name: "Console sign-in path" }).querySelector("span[aria-hidden]") as HTMLElement;
    const dark = sq().style.backgroundColor;
    act(() => useTheme.setState({ theme: "light", color: "rainbow" }));
    expect(sq().style.backgroundColor).not.toBe(dark);
  });

  // Test 4.3 (theme follow, C4.T2): a story's own kind's path square is the resolver's mark for the live
  // theme and colour mode, in one mount. The manifest is the real one.
  it("fills the square of a story's own kind with the drawn mark, and follows a live switch", () => {
    const hexOf = (css: string): string => {
      if (css.startsWith("#")) return css.toLowerCase();
      const m = css.match(/\d+/g) ?? [];
      return `#${m.slice(0, 3).map((n) => Number(n).toString(16).padStart(2, "0")).join("")}`;
    };
    const platform = Object.values(
      import.meta.glob<string>("../../../../backend/scenarios/*.scenario.json", { query: "?raw", import: "default", eager: true }),
    )
      .map((raw) => JSON.parse(raw) as { id: string; nodes: ReturnType<typeof node>[] })
      .find((m) => m.id === "platform-access")!.nodes;
    useSchema.setState({ nodes: platform });
    useLayers.setState({ pathKinds: { ...DEFAULT_PATHS, console_signin: true } });
    useTheme.setState({ theme: "light", color: "neon" });
    render(<PathPanel kinds={["console_signin"]} />);
    const sq = () =>
      screen.getByRole("button", { name: "Console sign-in path" }).querySelector("span[aria-hidden]") as HTMLElement;
    expect(hexOf(sq().style.backgroundColor)).toBe("#198522");
    act(() => useTheme.setState({ theme: "light", color: "deuteranopia" }));
    expect(hexOf(sq().style.backgroundColor)).toBe("#29250a");
    act(() => useTheme.setState({ theme: "dark", color: "neon" }));
    expect(hexOf(sq().style.backgroundColor)).toBe("#7ee787");
  });
});
