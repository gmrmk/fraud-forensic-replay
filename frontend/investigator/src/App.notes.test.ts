import { describe, it, expect } from "vitest";
import appSource from "./App.tsx?raw";

// App.tsx holds the notes wiring in a few lines of its own; the logic is in lib/notes-io
// (useNotesBoot, tested there) and components/notes-menu. These pin where the lines sit.

describe("App: custom notes wiring", () => {
  const at = (s: string) => {
    const i = appSource.indexOf(s);
    expect(i, `${s} is in App.tsx`).toBeGreaterThan(-1);
    return i;
  };

  it("calls the one notes hook, once, after the share link hook", () => {
    expect(appSource.match(/useNotesBoot\(\)/g)).toHaveLength(1);
    expect(at("useNotesBoot()")).toBeGreaterThan(at("useShareLink({"));
  });

  it("mounts the Notes menu in the top row's menu group, after Layers and Paths and before Reset view", () => {
    const group = at('className="top-row-menu');
    const menus = at("<MapMenus");
    const notes = at("<NotesMenu");
    const reset = at("<ResetViewButton");
    expect(group).toBeLessThan(menus);
    expect(menus).toBeLessThan(notes);
    expect(notes).toBeLessThan(reset);
    expect(appSource).toContain("<NotesMenu lookup={noteLookup} />");
  });

  it("mounts the map shape button between the Notes menu and Reset view", () => {
    const notes = at("<NotesMenu");
    const shape = at("<MapModeButton");
    const reset = at("<ResetViewButton");
    expect(notes).toBeLessThan(shape);
    expect(shape).toBeLessThan(reset);
    expect(appSource).toContain("<MapModeButton />");
  });

  it("mounts the globe layer of marks with the record lookup, beside the pivot windows", () => {
    expect(appSource).toContain("<NoteGlobeLayer map={mapInstance} lookup={noteLookup} />");
    expect(appSource).toContain("lookupFromContext(matchContext)");
  });

  it("holds no notes logic of its own: no store call, no backing, no file", () => {
    expect(appSource).not.toMatch(/useNotesStore|createMemoryBacking|createApiBacking|setBacking|saveNotesFile|loadNotesFile/);
  });
});
