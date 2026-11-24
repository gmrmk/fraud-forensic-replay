import { describe, it, expect } from "vitest";
import appSource from "./App.tsx?raw";
import mapMenusSource from "./components/MapMenus.tsx?raw";

// App is mounted by no test, so the join between the top bar and the map menus is read from
// source, as App.root-clip.test.ts does for the shell class. The bar holds the Layers and Paths
// menus (MapMenus), then the gear (ThemeSwitcher), which carries no children. Anchored on the
// elements, not on how App places GlobeMap.
describe("App: the top bar mounts the map menus", () => {
  const group = appSource.indexOf('className="top-row-menu');
  const menus = appSource.indexOf("<MapMenus");
  const gear = appSource.indexOf("<ThemeSwitcher");

  it("imports MapMenus and no longer imports LayerPanels", () => {
    expect(appSource).toMatch(/import \{ MapMenus \} from "\.\/components\/MapMenus";/);
    expect(appSource).not.toMatch(/LayerPanels/);
  });

  it("renders no ViewToggle, and one MapMenus and one ThemeSwitcher, in that order", () => {
    expect(appSource).not.toMatch(/ViewToggle/);
    expect(group).toBeGreaterThan(-1);
    expect(menus).toBeGreaterThan(group);
    expect(gear).toBeGreaterThan(menus);
    expect(appSource.indexOf("<MapMenus", menus + 1)).toBe(-1);
    expect(appSource.indexOf("<ThemeSwitcher", gear + 1)).toBe(-1);
  });

  // closes G1.
  it("MapMenus is mounted in the menu group, ungated", () => {
    const between = appSource.slice(group, gear);
    expect(between).toMatch(/\n\s*<MapMenus\b/);
    expect(appSource).not.toContain('mode === "case"');
    expect(appSource.slice(0, group)).not.toMatch(/<MapMenus\b/);
    expect(appSource.slice(gear)).not.toMatch(/<MapMenus\b/);
  });

  it("MapMenus is given each of its eight props by name, with that prop's own value", () => {
    const open = appSource.indexOf("<MapMenus");
    const element = appSource.slice(open, appSource.indexOf("/>", open));
    const props = [
      "transactions",
      "logins",
      "places",
      "transfers",
      "visibleTransactions",
      "visibleLogins",
      "loadError",
      "genericByKind",
    ];
    for (const p of props) expect(element, p).toMatch(new RegExp(`\\b${p}=\\{${p}\\}`));
    // Nothing else is passed: every attribute of the element is one of the eight.
    const named = [...element.matchAll(/(\w+)=\{/g)].map((m) => m[1]);
    expect(named.sort()).toEqual([...props].sort());
  });

  it("the top-centre cluster stretches its children to one height", () => {
    // The gear is h-full inside a stretched flex item, so the three text controls and the gear
    // share the bar's height.
    const open = appSource.lastIndexOf("<div", group + 1);
    const cluster = appSource.slice(open, appSource.indexOf(">", open));
    // The cluster is the second column of the top row (App.top-row.test.ts holds the row itself).
    expect(cluster).toContain("col-start-2");
    expect(cluster).toContain("items-stretch");
    expect(cluster).not.toContain("items-center");
  });

  it("ThemeSwitcher is rendered with no children", () => {
    expect(appSource).toMatch(/<ThemeSwitcher\s*\/>/);
    expect(appSource).not.toMatch(/<\/ThemeSwitcher>/);
  });
});

// MapMenus is read as source for the same reason: the join between each menu and its body.
describe("MapMenus: each body sits in its own menu", () => {
  const layers = mapMenusSource.search(/<TopMenu\b[^>]*label="Layers"/);
  const paths = mapMenusSource.search(/<TopMenu\b[^>]*label="Paths"/);

  it("draws a Layers menu and then a Paths menu, both unconditionally", () => {
    expect(layers).toBeGreaterThan(-1);
    expect(paths).toBeGreaterThan(layers);
    const drawn = mapMenusSource.slice(layers);
    expect(drawn).not.toMatch(/&&|\?\s*</);
  });

  it("LayerPanels is mounted inside the Layers menu", () => {
    const body = mapMenusSource.slice(layers, paths);
    expect(body).toMatch(/<LayerPanels\b/);
    expect(body).toMatch(/<\/TopMenu>/);
    expect(body).not.toMatch(/<PathPanel\b/);
  });

  it("PathPanel is mounted inside the Paths menu", () => {
    const body = mapMenusSource.slice(paths);
    expect(body).toMatch(/<PathPanel\b/);
    expect(body).toMatch(/<\/TopMenu>/);
    expect(body).not.toMatch(/<LayerPanels\b/);
  });
});
