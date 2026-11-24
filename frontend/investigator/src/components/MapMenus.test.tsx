import { afterEach, describe, expect, it } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import type { ComponentProps } from "react";
import { MapMenus } from "./MapMenus";
import { ThemeSwitcher } from "./ThemeSwitcher";
import type { LoginEvent, Place, Transaction, Transfer } from "../types";
import { makePath } from "../lib/notes/test-fixtures";
import { usePathSession } from "./paths/path-session";
import { useLayers } from "../store/layers";
import { useMarksStore } from "../store/marks";
import { useSchema } from "../store/schema";
import { usePlayhead } from "../store/playhead";

// The two map menus the top bar mounts in a case: a Layers button and a Paths button, each with
// its own menu. The rows themselves are tested where they live (LayerPanels, PathPanel); this
// file holds what the pair adds: both are always drawn, the empty Paths line, and one open at
// a time.
type Props = ComponentProps<typeof MapMenus>;

const NO_DATA: Props = {
  transactions: [],
  logins: [],
  places: [],
  transfers: [],
  visibleTransactions: [],
  visibleLogins: [],
  loadError: null,
};

// One fraud authorization, one login, one place: every layer and the fraud path have data.
const CARD_CASE: Props = {
  ...NO_DATA,
  transactions: [{ is_fraud: 1 } as unknown as Transaction],
  logins: [{ outcome: "success" } as unknown as LoginEvent],
  places: [{} as unknown as Place],
  transfers: [] as Transfer[],
};

const DEFAULT_PATHS = { fraud: true, auth: false, login: false, transfer: false };
const RESET = {
  showAuths: true,
  showLogins: true,
  showPlaces: false,
  showTimezone: false,
  pathKinds: DEFAULT_PATHS,
};
const playheadAtStart = usePlayhead.getState();

afterEach(() => {
  useMarksStore.getState().clear();
  usePathSession.setState({ draft: null, hidden: [], chosen: null });
  useLayers.setState(RESET);
  useSchema.setState({ nodes: [] });
  usePlayhead.setState(playheadAtStart);
});

const layersButton = () => screen.getByRole("button", { name: "Layers" });
const pathsButton = () => screen.getByRole("button", { name: "Paths" });

describe("MapMenus", () => {
  it("draws a Layers button and a Paths button when the case has data", () => {
    render(<MapMenus {...CARD_CASE} />);
    expect(layersButton()).toBeTruthy();
    expect(pathsButton()).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("draws both buttons with no data at all and the default path kinds", () => {
    render(<MapMenus {...NO_DATA} />);
    expect(layersButton()).toBeTruthy();
    expect(pathsButton()).toBeTruthy();
  });

  it("opens the Paths menu on one line, with no toggle, when no path is on offer", () => {
    render(<MapMenus {...NO_DATA} />);
    fireEvent.click(pathsButton());
    const dialog = screen.getByRole("dialog", { name: "Paths" });
    expect(within(dialog).getByText("No paths in this case")).toBeTruthy();
    expect(dialog.querySelectorAll("button[aria-pressed]")).toHaveLength(0);
  });

  it("opens the Layers menu as a dialog named Layers holding the layer rows", () => {
    render(<MapMenus {...CARD_CASE} />);
    fireEvent.click(layersButton());
    const dialog = screen.getByRole("dialog", { name: "Layers" });
    // A layer switch is the button that carries a pressed state.
    const rows = within(dialog)
      .getAllByRole("button")
      .filter((b) => b.hasAttribute("aria-pressed"))
      .map((b) => b.textContent ?? "");
    for (const label of ["Authorizations", "Logins", "Places"]) {
      expect(rows.some((t) => t.startsWith(label)), label).toBe(true);
    }
  });

  it("opens the Paths menu with a toggle per offered path", () => {
    render(<MapMenus {...CARD_CASE} />);
    fireEvent.click(pathsButton());
    const dialog = screen.getByRole("dialog", { name: "Paths" });
    expect(within(dialog).getByRole("button", { name: "fraud path" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "auth path" })).toBeTruthy();
    expect(within(dialog).queryByText("No paths in this case")).toBeNull();
  });

  it("opening Paths by pointer while Layers is open leaves only Paths open", () => {
    render(<MapMenus {...CARD_CASE} />);
    fireEvent.click(layersButton());
    expect(screen.getAllByRole("dialog")).toHaveLength(1);

    fireEvent.pointerDown(pathsButton());
    fireEvent.click(pathsButton());

    const dialogs = screen.getAllByRole("dialog");
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0].getAttribute("aria-label")).toBe("Paths");
    expect(layersButton().getAttribute("aria-expanded")).toBe("false");
  });

  it("opening Paths by keyboard while Layers is open leaves only Paths open", () => {
    render(<MapMenus {...CARD_CASE} />);
    fireEvent.click(layersButton());
    expect(screen.getAllByRole("dialog")).toHaveLength(1);

    // A keyboard activation: focus moves to the Paths trigger, then a click with no pointerdown.
    act(() => pathsButton().focus());
    fireEvent.click(pathsButton());

    const dialogs = screen.getAllByRole("dialog");
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0].getAttribute("aria-label")).toBe("Paths");
    expect(layersButton().getAttribute("aria-expanded")).toBe("false");
  });

  it("opening Layers by keyboard while the gear menu is open leaves only Layers open", () => {
    render(
      <>
        <MapMenus {...CARD_CASE} />
        <ThemeSwitcher />
      </>,
    );
    const gear = screen.getByRole("button", { name: "Appearance" });
    fireEvent.click(gear);
    expect(screen.getByRole("dialog", { name: "Appearance" })).toBeTruthy();

    // A keyboard activation: focus moves to the Layers trigger, then a click with no pointerdown.
    act(() => layersButton().focus());
    fireEvent.click(layersButton());

    const dialogs = screen.getAllByRole("dialog");
    expect(dialogs).toHaveLength(1);
    expect(dialogs[0].getAttribute("aria-label")).toBe("Layers");
    expect(gear.getAttribute("aria-expanded")).toBe("false");
  });

  it("the Layers panel is 256px wide and the Paths panel 176px", () => {
    render(<MapMenus {...CARD_CASE} />);
    fireEvent.click(layersButton());
    const layers = screen.getByRole("dialog", { name: "Layers" }).firstElementChild as HTMLElement;
    expect(layers.classList.contains("w-[256px]")).toBe(true);
    expect(layers.classList.contains("w-[176px]")).toBe(false);

    fireEvent.pointerDown(pathsButton());
    fireEvent.click(pathsButton());
    const paths = screen.getByRole("dialog", { name: "Paths" }).firstElementChild as HTMLElement;
    expect(paths.classList.contains("w-[176px]")).toBe(true);
    expect(paths.classList.contains("w-[256px]")).toBe(false);
  });

  it("the Paths panel is 256px wide while the scenario holds a saved path of the investigator's", () => {
    useMarksStore.setState({ paths: [makePath()] });
    render(<MapMenus {...CARD_CASE} />);
    fireEvent.click(pathsButton());
    const paths = screen.getByRole("dialog", { name: "Paths" }).firstElementChild as HTMLElement;
    expect(paths.classList.contains("w-[256px]")).toBe(true);
    expect(paths.classList.contains("w-[176px]")).toBe(false);
  });

  it("the Paths panel goes back to 176px when the last saved path is removed", () => {
    useMarksStore.setState({ paths: [makePath()] });
    render(<MapMenus {...CARD_CASE} />);
    fireEvent.click(pathsButton());
    act(() => useMarksStore.setState({ paths: [] }));
    const paths = screen.getByRole("dialog", { name: "Paths" }).firstElementChild as HTMLElement;
    expect(paths.classList.contains("w-[176px]")).toBe(true);
  });

  it("the scroller of the Layers menu and the scroller of the Paths menu both show the foot shade", () => {
    render(<MapMenus {...CARD_CASE} />);
    fireEvent.click(layersButton());
    const layers = screen.getByRole("dialog", { name: "Layers" }).querySelector(".overflow-y-auto") as HTMLElement;
    expect(layers.classList.contains("foot-cue")).toBe(true);
    fireEvent.pointerDown(pathsButton());
    fireEvent.click(pathsButton());
    const paths = screen.getByRole("dialog", { name: "Paths" }).querySelector(".overflow-y-auto") as HTMLElement;
    expect(paths.classList.contains("foot-cue")).toBe(true);
  });

  it("a path toggled in the Paths menu changes pathKinds in the store", () => {
    render(<MapMenus {...CARD_CASE} />);
    fireEvent.click(pathsButton());
    fireEvent.click(screen.getByRole("button", { name: "auth path" }));
    expect(useLayers.getState().pathKinds.auth).toBe(true);
    expect(useLayers.getState().pathKinds.fraud).toBe(true);
  });
});

// Drawing mode (T34): the strip is mounted beside the Paths menu, whether or not a draft is open.
describe("MapMenus: drawing mode", () => {
  const strip = () => screen.getByRole("group", { name: "Drawing Path 1" });

  it("with no draft there is no strip", () => {
    render(<MapMenus {...CARD_CASE} />);
    expect(screen.queryByRole("group")).toBeNull();
  });

  it("New path closes the Paths menu, shows the strip and puts the focus inside it", () => {
    render(<MapMenus {...CARD_CASE} />);
    fireEvent.click(pathsButton());
    fireEvent.click(screen.getByRole("button", { name: "New path" }));
    expect(screen.queryByRole("dialog", { name: "Paths" })).toBeNull();
    expect(pathsButton().getAttribute("aria-expanded")).toBe("false");
    expect(strip().contains(document.activeElement)).toBe(true);
  });

  it("Cancel with no stop removes the strip and puts the focus on the Paths button", () => {
    render(<MapMenus {...CARD_CASE} />);
    fireEvent.click(pathsButton());
    fireEvent.click(screen.getByRole("button", { name: "New path" }));
    fireEvent.click(within(strip()).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("group")).toBeNull();
    expect(document.activeElement).toBe(pathsButton());
  });

  it("Discard after Cancel with stops also puts the focus on the Paths button", () => {
    render(<MapMenus {...CARD_CASE} />);
    fireEvent.click(pathsButton());
    fireEvent.click(screen.getByRole("button", { name: "New path" }));
    act(() => void usePathSession.getState().addStop({ kind: "stop", id: "rec-1" }));
    fireEvent.click(within(strip()).getByRole("button", { name: "Cancel" }));
    fireEvent.click(within(strip()).getByRole("button", { name: "Discard" }));
    expect(screen.queryByRole("group")).toBeNull();
    expect(document.activeElement).toBe(pathsButton());
  });

  it("the strip shows again after the menus unmount and mount, since the draft is session state", () => {
    const first = render(<MapMenus {...CARD_CASE} />);
    fireEvent.click(pathsButton());
    fireEvent.click(screen.getByRole("button", { name: "New path" }));
    first.unmount();
    expect(screen.queryByRole("group")).toBeNull();
    render(<MapMenus {...CARD_CASE} />);
    expect(strip()).toBeTruthy();
  });

  it("the strip's band and its group are children of the element the menus mount in, the band first (the menu group in the app)", () => {
    const { container } = render(<MapMenus {...CARD_CASE} />);
    fireEvent.click(pathsButton());
    fireEvent.click(screen.getByRole("button", { name: "New path" }));
    const band = container.querySelector<HTMLElement>("[data-path-strip-band]");
    expect(band).not.toBeNull();
    expect(band?.parentElement).toBe(container);
    expect(strip().parentElement).toBe(container);
    expect(band?.nextElementSibling).toBe(strip());
  });

  it("while a draft is open, New path and Join pinned in the reopened menu are disabled", () => {
    render(<MapMenus {...CARD_CASE} />);
    fireEvent.click(pathsButton());
    fireEvent.click(screen.getByRole("button", { name: "New path" }));
    fireEvent.pointerDown(pathsButton());
    fireEvent.click(pathsButton());
    expect(screen.getByRole("button", { name: "New path" }).getAttribute("aria-disabled")).toBe("true");
    expect(screen.getByRole("button", { name: /^Join pinned/ }).getAttribute("aria-disabled")).toBe("true");
  });
});
