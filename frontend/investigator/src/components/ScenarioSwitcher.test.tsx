import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { ScenarioSwitcher } from "./ScenarioSwitcher";
import { useTheme } from "../store/theme";

// The build flag is a getter so one case can be a static build and the rest the live app.
const flag = vi.hoisted(() => ({ isStatic: false }));
vi.mock("../lib/build-flags", () => ({
  get IS_STATIC_BUILD() {
    return flag.isStatic;
  },
}));

const LIST = [
  { id: "card-fraud", label: "Card · Houston→Lagos" },
  { id: "card-fraud-concordia", label: "Card · Concordia-generated" },
];
const HOME = { lat: 20.0, lng: -40.0, zoom: 2 };
const ACTIVE = {
  id: "card-fraud",
  label: "Card · Houston→Lagos",
  db: "data/replay.db",
  home: HOME,
};

function stubFetch({ selectFails = false } = {}) {
  let current: { id: string; label: string } = ACTIVE; // the backend's process-global active scenario
  const fetchMock = vi.fn((url: string, init?: RequestInit) => {
    if (url === "/api/scenarios") {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(LIST) });
    }
    if (url === "/api/scenario" && !init) {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(current) });
    }
    if (url === "/api/scenario/select") {
      if (selectFails) {
        return Promise.resolve({
          ok: false,
          status: 400,
          json: () => Promise.resolve({ detail: "unknown scenario: x" }),
        });
      }
      const body = JSON.parse(String(init?.body)) as { id: string };
      const picked = LIST.find((s) => s.id === body.id);
      if (picked) current = { ...ACTIVE, ...picked };
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(picked) });
    }
    return Promise.reject(new Error(`unexpected fetch: ${url}`));
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

beforeEach(() => {
  flag.isStatic = false;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // selectScenario persists the choice (ffr.scenario); without this clear, a
  // pick made in one test leaks into the next boot's ensureChosenScenario,
  // which would re-assert it with a surprise POST /api/scenario/select.
  localStorage.clear();
});

describe("ScenarioSwitcher", () => {
  it("shows the active scenario label after load", async () => {
    stubFetch();
    render(<ScenarioSwitcher reload={vi.fn()} />);
    expect(await screen.findByText("Card · Houston→Lagos")).toBeTruthy();
  });

  it("opens the list on click and marks the active row", async () => {
    stubFetch();
    render(<ScenarioSwitcher reload={vi.fn()} />);
    fireEvent.click(await screen.findByRole("button", { name: /scenario/i }));
    const activeRow = await screen.findByRole("option", { name: /Houston→Lagos/ });
    expect(activeRow.getAttribute("aria-selected")).toBe("true");
    const otherRow = screen.getByRole("option", { name: /Concordia-generated/ });
    expect(otherRow.getAttribute("aria-selected")).toBe("false");
  });

  it("selecting another scenario POSTs and reloads", async () => {
    const fetchMock = stubFetch();
    const reload = vi.fn();
    render(<ScenarioSwitcher reload={reload} />);
    fireEvent.click(await screen.findByRole("button", { name: /scenario/i }));
    fireEvent.click(await screen.findByRole("option", { name: /Concordia-generated/ }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/scenario/select",
      expect.objectContaining({ method: "POST" }),
    );
  });

  it("a pick drops the old scenario's share link before it reloads", async () => {
    // The address bar holds the moment, selection and scenario of the pack being left; kept,
    // the reload would reopen that scenario and undo the pick. (The test DOM ignores
    // history.replaceState, so what is checked is the address asked for by the time of the reload.)
    const replace = vi.spyOn(window.history, "replaceState");
    stubFetch();
    const seen: unknown[] = [];
    const reload = vi.fn(() => void seen.push(replace.mock.calls.at(-1)?.[2]));
    render(<ScenarioSwitcher reload={reload} />);
    fireEvent.click(await screen.findByRole("button", { name: /scenario/i }));
    fireEvent.click(await screen.findByRole("option", { name: /Concordia-generated/ }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    expect(seen).toHaveLength(1);
    expect(typeof seen[0]).toBe("string"); // an address was asked for before the reload
    expect(seen[0]).not.toMatch(/scenario=|t=|sel=/);
    replace.mockRestore();
  });

  it("clicking the already-active scenario closes without POSTing", async () => {
    const fetchMock = stubFetch();
    const reload = vi.fn();
    render(<ScenarioSwitcher reload={reload} />);
    fireEvent.click(await screen.findByRole("button", { name: /scenario/i }));
    fireEvent.click(await screen.findByRole("option", { name: /Houston→Lagos/ }));
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(reload).not.toHaveBeenCalled();
    const selectCalls = fetchMock.mock.calls.filter(
      ([url]) => url === "/api/scenario/select",
    );
    expect(selectCalls).toHaveLength(0);
  });

  it("reports the active scenario (with home) through onActive after load", async () => {
    stubFetch();
    const onActive = vi.fn();
    render(<ScenarioSwitcher reload={vi.fn()} onActive={onActive} />);
    await screen.findByText("Card · Houston→Lagos");
    await waitFor(() =>
      expect(onActive).toHaveBeenCalledWith(
        expect.objectContaining({ id: "card-fraud", home: HOME }),
      ),
    );
  });

  it("calls onError once and shows the error when the scenario fetch rejects", async () => {
    vi.stubGlobal("fetch", vi.fn(() => Promise.reject(new Error("backend down"))));
    const onError = vi.fn();
    const onActive = vi.fn();
    render(<ScenarioSwitcher reload={vi.fn()} onActive={onActive} onError={onError} />);
    expect(await screen.findByText(/backend down/)).toBeTruthy();
    expect(onError).toHaveBeenCalledTimes(1);
    expect(onActive).not.toHaveBeenCalled();
  });

  it("does not call onError when the scenario fetch resolves", async () => {
    stubFetch();
    const onError = vi.fn();
    render(<ScenarioSwitcher reload={vi.fn()} onError={onError} />);
    await screen.findByText("Card · Houston→Lagos");
    expect(onError).not.toHaveBeenCalled();
  });

  it("a failed select shows the error and does not reload", async () => {
    stubFetch({ selectFails: true });
    const reload = vi.fn();
    render(<ScenarioSwitcher reload={reload} />);
    fireEvent.click(await screen.findByRole("button", { name: /scenario/i }));
    fireEvent.click(await screen.findByRole("option", { name: /Concordia-generated/ }));
    expect(await screen.findByText(/unknown scenario/)).toBeTruthy();
    expect(reload).not.toHaveBeenCalled();
  });

  it("Escape closes the popup and returns focus to the trigger", async () => {
    stubFetch();
    render(<ScenarioSwitcher reload={vi.fn()} />);
    const trigger = await screen.findByRole("button", { name: /scenario/i });
    fireEvent.click(trigger);
    await screen.findByRole("listbox");
    fireEvent.keyDown(document, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });

  it("clicking outside closes the popup", async () => {
    stubFetch();
    render(
      <div>
        <button type="button">elsewhere</button>
        <ScenarioSwitcher reload={vi.fn()} />
      </div>,
    );
    fireEvent.click(await screen.findByRole("button", { name: /scenario/i }));
    await screen.findByRole("listbox");
    fireEvent.pointerDown(screen.getByRole("button", { name: "elsewhere" }));
    await waitFor(() => expect(screen.queryByRole("listbox")).toBeNull());
  });

  it("rapid double-select fires exactly one POST (switching guard)", async () => {
    const fetchMock = stubFetch();
    const reload = vi.fn();
    render(<ScenarioSwitcher reload={reload} />);
    fireEvent.click(await screen.findByRole("button", { name: /scenario/i }));
    const option = await screen.findByRole("option", { name: /Concordia-generated/ });
    fireEvent.click(option);
    fireEvent.click(option);
    await waitFor(() => expect(reload).toHaveBeenCalled());
    const selectCalls = fetchMock.mock.calls.filter(
      ([url]) => url === "/api/scenario/select",
    );
    expect(selectCalls).toHaveLength(1);
  });

  it("tags the header as synthetic data (D1)", async () => {
    stubFetch();
    render(<ScenarioSwitcher reload={vi.fn()} />);
    expect(await screen.findByText(/synthetic data/i)).toBeTruthy();
  });

  it("renders the load error when the initial fetches fail", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: () => Promise.resolve({}),
      }),
    );
    render(<ScenarioSwitcher reload={vi.fn()} />);
    expect(await screen.findByText(/HTTP 500/)).toBeTruthy();
  });

  // The case data loads on mount from whatever the backend has active. When the boot guard has to
  // re-assert this browser's persisted choice, that data belongs to the other pack: reload so it matches.
  it("re-asserting a different persisted scenario at boot reloads so the case data matches it", async () => {
    const replace = vi.spyOn(window.history, "replaceState");
    stubFetch();
    localStorage.setItem("ffr.scenario", "card-fraud-concordia");
    const reload = vi.fn();
    render(<ScenarioSwitcher reload={reload} />);
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    // This reload keeps the address: a share link that named the scenario still holds its moment.
    expect(replace).not.toHaveBeenCalled();
    replace.mockRestore();
  });

  it("a boot that already matches the persisted scenario does not reload", async () => {
    stubFetch();
    localStorage.setItem("ffr.scenario", "card-fraud");
    const reload = vi.fn();
    render(<ScenarioSwitcher reload={reload} />);
    await screen.findByText(/Houston→Lagos/);
    expect(reload).not.toHaveBeenCalled();
  });

  // The title card gives way when the top row is short of room. jsdom draws no layout, so this holds
  // the classes that cut the line with an ellipsis and the words that keep the whole line; the
  // layout itself is checked in a real browser.
  it("cuts the scenario line with an ellipsis, keeps the arrow, and keeps the whole line in its tooltip", async () => {
    stubFetch();
    render(<ScenarioSwitcher reload={vi.fn()} />);
    const label = await screen.findByText("Card · Houston→Lagos");
    const button = label.closest("button")!;
    const cut = label.parentElement!;
    expect(cut.className).toContain("truncate");
    expect(cut.className).toContain("min-w-0");
    // the label and its two neighbours are all inside the one cut cell; the arrow is not
    expect(cut.textContent).toBe("Scenario ·Card · Houston→Lagos· Synthetic data");
    expect(button.textContent).toContain("▾");
    expect(cut.contains(button.querySelector("[class*='rotate'], [class*='transition-transform']"))).toBe(false);
    expect(button.style.maxWidth).toBe("100%");
    expect(button.getAttribute("data-tip")).toBe("Scenario\nCard · Houston→Lagos · Synthetic data");
    // the accessible name still holds every word of the line
    expect(button.textContent).toContain("Scenario");
    expect(button.textContent).toContain("Synthetic data");
  });
});

// A static build has no server to hold a pick: the adapter reads the stored choice, and where the
// browser keeps no site data the reload's address is the only place the pick can travel.
describe("ScenarioSwitcher: a pick where the browser keeps no site data", () => {
  /** Opens the list, picks the second story, and returns the address asked for before the reload. */
  async function pickOther(): Promise<string> {
    const replace = vi.spyOn(window.history, "replaceState");
    stubFetch();
    useTheme.setState({ theme: "light", color: "neon" });
    let asked = "";
    const reload = vi.fn(() => {
      asked = String(replace.mock.calls.at(-1)?.[2]);
    });
    render(<ScenarioSwitcher reload={reload} />);
    fireEvent.click(await screen.findByRole("button", { name: /scenario/i }));
    fireEvent.click(await screen.findByRole("option", { name: /Concordia-generated/ }));
    await waitFor(() => expect(reload).toHaveBeenCalledTimes(1));
    return asked;
  }
  /** Storage whose write throws, as a browser that blocks site data does. */
  const refuseWrites = () =>
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
  /** Storage whose write is accepted and keeps nothing, so a read back does not give the id. */
  const dropWrites = () => vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => undefined);

  it("in a static build, reloads to an address that carries the picked story beside the theme and colour", async () => {
    flag.isStatic = true;
    refuseWrites();
    const address = await pickOther();
    expect(address).toMatch(/[?&]scenario=card-fraud-concordia(&|$)/);
    expect(address).toMatch(/theme=light/);
    expect(address).toMatch(/color=neon/);
    expect(address).not.toMatch(/t=|sel=/);
  });

  it("in a static build, does the same when the write is accepted and a read back does not give the id", async () => {
    flag.isStatic = true;
    dropWrites();
    expect(await pickOther()).toMatch(/scenario=card-fraud-concordia/);
  });

  it("in a static build where storage works, the address stays as it is today", async () => {
    flag.isStatic = true;
    const address = await pickOther();
    expect(localStorage.getItem("ffr.scenario")).toBe("card-fraud-concordia");
    expect(address).not.toMatch(/scenario=/);
    expect(address).toMatch(/theme=light/);
    expect(address).toMatch(/color=neon/);
  });

  it("in the live app, a pick does what it does today even where storage is refused", async () => {
    refuseWrites();
    const address = await pickOther();
    expect(address).not.toMatch(/scenario=/);
    expect(address).toMatch(/theme=light/);
  });
});
