import { describe, it, expect } from "vitest";
import appSource from "./App.tsx?raw";

// happy-dom has no layout, so the scroll behavior itself cannot run here; this pins the
// class that causes it. `overflow-hidden` leaves the shell a scroll container, so focusing
// a control that sits outside it (a tall floating window's lower badge) scrolls the whole
// app up. `overflow-clip` clips the same way but cannot be scrolled at all.
describe("App shell", () => {
  it("clips its overflow instead of hiding it (never a scroll container)", () => {
    const shell = appSource.match(/className="([^"]*\bh-screen\b[^"]*\bw-screen\b[^"]*)"/);
    expect(shell, "the h-screen w-screen root container").not.toBeNull();
    const classes = shell![1].split(/\s+/);
    expect(classes).toContain("overflow-clip");
    expect(classes).not.toContain("overflow-hidden");
  });
});
