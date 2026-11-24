/**
 * The page's one transport: chosen once by the build (the static site keeps notes in memory,
 * the live app talks to the backend), never by a failed fetch, and handed to the store.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { currentTransport, resetNotesTransport, startNotesTransport } from "./session";
import { useMarksStore } from "../../store/marks";
import { useNotesStore } from "../../store/notes";

describe("startNotesTransport", () => {
  beforeEach(() => {
    resetNotesTransport();
    useNotesStore.getState().setBacking(null);
    useNotesStore.getState().clear();
  });

  it("the static build gets the memory backing and the store holds it", () => {
    expect(currentTransport()).toBeNull();
    const t = startNotesTransport(true);
    expect(t.kind).toBe("memory");
    expect(useNotesStore.getState().backing).toBe(t.backing);
    expect(currentTransport()).toBe(t);
  });

  it("the live app gets the api backing", () => {
    const t = startNotesTransport(false);
    expect(t.kind).toBe("api");
    expect(useNotesStore.getState().backing).toBe(t.backing);
  });

  it("both stores get the transport's backings: the marks store holds `marks` of the same transport", () => {
    for (const isStatic of [true, false]) {
      resetNotesTransport();
      useMarksStore.getState().setBacking(null);
      const t = startNotesTransport(isStatic);
      expect(useMarksStore.getState().backing).toBe(t.marks);
      expect(useNotesStore.getState().backing).toBe(t.backing);
    }
  });

  it("asking again returns the same transport: a second mount loses no notes", () => {
    const a = startNotesTransport(true);
    expect(startNotesTransport(true)).toBe(a);
  });
});
