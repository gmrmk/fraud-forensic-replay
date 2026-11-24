import { describe, it, expect, beforeEach, vi } from "vitest";
import { entityRendererRegistry, type Entity, type EntityRenderers } from "./entity";

describe("entityRendererRegistry", () => {
  beforeEach(() => entityRendererRegistry.clear());

  it("starts empty after clear", () => {
    expect(entityRendererRegistry.size).toBe(0);
  });

  it("set then get returns the renderers", () => {
    const renderers: EntityRenderers = { inspectorBody: () => null };
    entityRendererRegistry.set("test_kind", renderers);
    expect(entityRendererRegistry.get("test_kind")).toBe(renderers);
  });

  it("has returns true after set, false after clear", () => {
    entityRendererRegistry.set("test_kind", { inspectorBody: () => null });
    expect(entityRendererRegistry.has("test_kind")).toBe(true);
    entityRendererRegistry.clear();
    expect(entityRendererRegistry.has("test_kind")).toBe(false);
  });
});

describe("Entity type shape", () => {
  it("compiles with all required fields", () => {
    const e: Entity = {
      id: "test-1", kind: "auth", timestamp: 0,
      coords: { lat: 0, lng: 0 },
      fields: { merchant_name: "Test" },
      displayMetadata: {
        primaryLabel: "Test", secondaryLabel: "Test",
        paletteKind: "auth", pivotableFields: [],
      },
    };
    expect(e.kind).toBe("auth");
  });
});

describe("EntityRenderers.inspectorBody single-arg signature", () => {
  it("inspectorBody is called with only entity (no context argument)", () => {
    const mockRenderer = vi.fn(() => null);
    const renderers: EntityRenderers = { inspectorBody: mockRenderer };
    entityRendererRegistry.set("test_single_arg", renderers);

    const entity: Entity = {
      id: "test-1", kind: "auth", timestamp: 0,
      coords: { lat: 0, lng: 0 },
      fields: {},
      displayMetadata: {
        primaryLabel: "Test", secondaryLabel: "Test",
        paletteKind: "auth", pivotableFields: [],
      },
    };

    // Call with a single argument - should work without any RenderContext.
    const renderer = entityRendererRegistry.get("test_single_arg")!;
    renderer.inspectorBody(entity);

    expect(mockRenderer).toHaveBeenCalledWith(entity);
    expect(mockRenderer).toHaveBeenCalledTimes(1);
  });
});
