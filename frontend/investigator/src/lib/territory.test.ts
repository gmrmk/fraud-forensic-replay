import { describe, test, expect } from "vitest";
import { territoryHull, type TerritoryNode } from "./territory";

const n = (ts: number, lng: number, lat: number): TerritoryNode => ({ ts, lng, lat });

describe("territoryHull", () => {
  test("returns null for fewer than 3 nodes within the playhead", () => {
    expect(territoryHull([n(1, 0, 0), n(2, 1, 1)], 10)).toBeNull();
  });

  test("hull of a square is its 4 corners", () => {
    const sq = [n(1, 0, 0), n(2, 2, 0), n(3, 2, 2), n(4, 0, 2)];
    const h = territoryHull(sq, 10);
    expect(h).not.toBeNull();
    expect(h!.ring.length).toBe(4);
    const corners = new Set(h!.ring.map((p) => p.join(",")));
    expect(corners.has("0,0")).toBe(true);
    expect(corners.has("2,0")).toBe(true);
    expect(corners.has("2,2")).toBe(true);
    expect(corners.has("0,2")).toBe(true);
  });

  test("an interior node does not change the hull", () => {
    const sq = [n(1, 0, 0), n(2, 2, 0), n(3, 2, 2), n(4, 0, 2), n(5, 1, 1)];
    const h = territoryHull(sq, 10);
    expect(h!.ring.length).toBe(4);
  });

  test("grows with the playhead and retracts on rewind", () => {
    const nodes = [n(1, 0, 0), n(2, 2, 0), n(3, 2, 2), n(4, 0, 2)];
    expect(territoryHull(nodes, 2)).toBeNull(); // only 2 nodes within playhead
    expect(territoryHull(nodes, 3)).not.toBeNull(); // 3 nodes -> triangle
    expect(territoryHull(nodes, 10)!.ring.length).toBe(4); // all 4 -> square
  });

  test("collinear nodes yield null (no area)", () => {
    expect(territoryHull([n(1, 0, 0), n(2, 1, 1), n(3, 2, 2)], 10)).toBeNull();
  });

  test("fan-triangulates the hull (n-2 triangles, 3 points each)", () => {
    const sq = [n(1, 0, 0), n(2, 2, 0), n(3, 2, 2), n(4, 0, 2)];
    const h = territoryHull(sq, 10)!;
    expect(h.triangles.length).toBe(2);
    expect(h.triangles[0].length).toBe(3);
  });
});
