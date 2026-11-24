/**
 * Piles: badges that land on the same spot merge into one capsule that counts distinct decisions
 * (or queued events) per word. Greedy in time order: an item joins the first pile of its family
 * whose anchor lies within `reach`, else starts one. Pure; positions are screen pixels.
 */
import type { Entity } from "./entity";
import { TONE_ORDER, type VerdictTone } from "./verdicts";

export type PileFamily = "decision" | "queue";
export interface PileItem {
  id: string; family: PileFamily; x: number; y: number; at: number; countKey: string;
  word: string; tone: VerdictTone | "queue"; lit: boolean; entity: Entity; lngLat: { lng: number; lat: number };
}
export interface PileSegment { word: string; tone: VerdictTone | "queue"; count: number }
export interface Pile { key: string; family: PileFamily; anchor: PileItem; members: PileItem[]; segments: PileSegment[]; lit: boolean }

const order = (t: VerdictTone | "queue") => (t === "queue" ? 0 : TONE_ORDER[t]);

export function pileItems(items: readonly PileItem[], reach: { x: number; y: number }): Pile[] {
  const sorted = [...items].sort((a, b) => a.family.localeCompare(b.family) || a.at - b.at || a.id.localeCompare(b.id));
  const piles: { anchor: PileItem; byKey: Map<string, PileItem> }[] = [];
  for (const it of sorted) {
    const home = piles.find((p) => p.anchor.family === it.family
      && Math.abs(p.anchor.x - it.x) <= reach.x && Math.abs(p.anchor.y - it.y) <= reach.y);
    if (!home) {
      piles.push({ anchor: it, byKey: new Map([[it.countKey, it]]) });
      continue;
    }
    const prior = home.byKey.get(it.countKey);
    home.byKey.set(it.countKey, prior ? { ...prior, lit: prior.lit || it.lit } : it);
  }
  return piles.map(({ anchor, byKey }) => {
    const members = [...byKey.values()];
    const counts = new Map<string, PileSegment>();
    for (const m of members) {
      const s = counts.get(m.word) ?? { word: m.word, tone: m.tone, count: 0 };
      counts.set(m.word, { ...s, count: s.count + 1 });
    }
    return {
      key: `${anchor.family}:${anchor.id}`, family: anchor.family, anchor, members,
      segments: [...counts.values()].sort((a, b) => order(a.tone) - order(b.tone) || a.word.localeCompare(b.word)),
      lit: members.some((m) => m.lit),
    };
  });
}
