// frontend/investigator/src/store/theme.test.ts
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  applyThemeAttrs,
  initialTheme,
  initialColor,
  useTheme,
} from "./theme";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetUrl() {
  // happy-dom 14.x: history.replaceState does not update location.search;
  // assign location.href directly instead.
  window.location.href = "http://localhost/";
}

function setUrlParam(key: string, value: string) {
  // happy-dom 14.x: location.search assignment is the reliable way to set
  // query params without a page navigation side-effect.
  window.location.search = `?${key}=${value}`;
}

// ---------------------------------------------------------------------------
// applyThemeAttrs
// ---------------------------------------------------------------------------

describe("applyThemeAttrs", () => {
  it('sets data-theme and data-color on <html>', () => {
    applyThemeAttrs("light", "neon");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(document.documentElement.getAttribute("data-color")).toBe("neon");
  });

  it('sets data-theme="dark" and data-color="rainbow"', () => {
    applyThemeAttrs("dark", "rainbow");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(document.documentElement.getAttribute("data-color")).toBe("rainbow");
  });
});

// ---------------------------------------------------------------------------
// initialTheme precedence
// ---------------------------------------------------------------------------

describe("initialTheme precedence", () => {
  afterEach(() => {
    resetUrl();
    localStorage.clear();
  });

  it("URL param wins over localStorage and default", () => {
    localStorage.setItem("ffr.theme", "dark");
    setUrlParam("theme", "light");
    expect(initialTheme()).toBe("light");
  });

  it("localStorage wins over default when no URL param", () => {
    resetUrl();
    localStorage.setItem("ffr.theme", "light");
    expect(initialTheme()).toBe("light");
  });

  it("returns DEFAULT_THEME ('dark') when no URL param and no localStorage", () => {
    resetUrl();
    localStorage.clear();
    expect(initialTheme()).toBe("dark");
  });

  it("ignores invalid URL param and falls back to localStorage", () => {
    setUrlParam("theme", "bogus");
    localStorage.setItem("ffr.theme", "light");
    expect(initialTheme()).toBe("light");
  });

  it("ignores invalid URL param and falls back to default when localStorage also absent", () => {
    setUrlParam("theme", "bogus");
    localStorage.clear();
    expect(initialTheme()).toBe("dark");
  });
});

// ---------------------------------------------------------------------------
// initialColor precedence
// ---------------------------------------------------------------------------

describe("initialColor precedence", () => {
  afterEach(() => {
    resetUrl();
    localStorage.clear();
  });

  it("URL param wins over localStorage and default", () => {
    localStorage.setItem("ffr.color", "rainbow");
    setUrlParam("color", "neon");
    expect(initialColor()).toBe("neon");
  });

  it("localStorage wins over default when no URL param", () => {
    resetUrl();
    localStorage.setItem("ffr.color", "monochrome");
    expect(initialColor()).toBe("monochrome");
  });

  it("returns DEFAULT_COLOR ('neon') when no URL param and no localStorage", () => {
    resetUrl();
    localStorage.clear();
    expect(initialColor()).toBe("neon");
  });

  it("ignores invalid URL param and falls back to localStorage", () => {
    setUrlParam("color", "bogus");
    localStorage.setItem("ffr.color", "neon");
    expect(initialColor()).toBe("neon");
  });

  it("ignores invalid URL param and falls back to default when localStorage also absent", () => {
    setUrlParam("color", "bogus");
    localStorage.clear();
    expect(initialColor()).toBe("neon");
  });
});

// ---------------------------------------------------------------------------
// useTheme store
// ---------------------------------------------------------------------------

describe("useTheme store", () => {
  beforeEach(() => {
    localStorage.clear();
    resetUrl();
    // Reset store to known defaults so tests don't bleed into each other
    useTheme.setState({ theme: "dark", color: "rainbow" });
    applyThemeAttrs("dark", "rainbow");
  });

  afterEach(() => {
    localStorage.clear();
    resetUrl();
  });

  it("setTheme updates state, localStorage, and <html> attribute", () => {
    useTheme.getState().setTheme("light");
    expect(useTheme.getState().theme).toBe("light");
    expect(localStorage.getItem("ffr.theme")).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    // Restore
    useTheme.getState().setTheme("dark");
  });

  it("setColor updates state, localStorage, and <html> attribute", () => {
    useTheme.getState().setColor("neon");
    expect(useTheme.getState().color).toBe("neon");
    expect(localStorage.getItem("ffr.color")).toBe("neon");
    expect(document.documentElement.getAttribute("data-color")).toBe("neon");

    // Restore
    useTheme.getState().setColor("rainbow");
  });

  it("setTheme does not clobber the existing color attribute", () => {
    useTheme.getState().setColor("deuteranopia");
    useTheme.getState().setTheme("light");
    expect(document.documentElement.getAttribute("data-color")).toBe(
      "deuteranopia"
    );

    // Restore
    useTheme.getState().setTheme("dark");
    useTheme.getState().setColor("rainbow");
  });

  it("setColor does not clobber the existing theme attribute", () => {
    useTheme.getState().setTheme("light");
    useTheme.getState().setColor("monochrome");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    // Restore
    useTheme.getState().setTheme("dark");
    useTheme.getState().setColor("rainbow");
  });
});
