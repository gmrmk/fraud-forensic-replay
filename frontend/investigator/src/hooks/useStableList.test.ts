import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useStableList } from "./useStableList";

// The globe sends a source to the map's worker whenever the list it is given changes identity.
// The playhead hands it a new array at every tick, so the hook keeps the earlier array while the
// new one holds the same members in the same order.
describe("useStableList", () => {
  const a = { id: "a" };
  const b = { id: "b" };
  const c = { id: "c" };

  it("returns the first array's identity for a new array with the same members", () => {
    const first = [a, b];
    const { result, rerender } = renderHook(({ list }) => useStableList(list), {
      initialProps: { list: first },
    });
    expect(result.current).toBe(first);
    rerender({ list: [a, b] });
    expect(result.current).toBe(first);
    rerender({ list: [a, b] });
    expect(result.current).toBe(first);
  });

  it("returns the new array when one member is new", () => {
    const first = [a, b];
    const { result, rerender } = renderHook(({ list }) => useStableList(list), {
      initialProps: { list: first },
    });
    const next = [a, c];
    rerender({ list: next });
    expect(result.current).toBe(next);
  });

  it("returns the new array when a member is added or removed", () => {
    const first = [a];
    const { result, rerender } = renderHook(({ list }) => useStableList(list), {
      initialProps: { list: first },
    });
    const grown = [a, b];
    rerender({ list: grown });
    expect(result.current).toBe(grown);
    const shrunk = [a];
    rerender({ list: shrunk });
    expect(result.current).toBe(shrunk);
  });

  it("returns the new array when the same members come in another order", () => {
    const first = [a, b];
    const { result, rerender } = renderHook(({ list }) => useStableList(list), {
      initialProps: { list: first },
    });
    const swapped = [b, a];
    rerender({ list: swapped });
    expect(result.current).toBe(swapped);
  });

  it("holds the latest array after a change, so the next equal array maps to it", () => {
    const first = [a];
    const { result, rerender } = renderHook(({ list }) => useStableList(list), {
      initialProps: { list: first },
    });
    const second = [a, b];
    rerender({ list: second });
    rerender({ list: [a, b] });
    expect(result.current).toBe(second);
  });
});
