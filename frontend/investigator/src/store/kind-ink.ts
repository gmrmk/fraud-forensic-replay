// frontend/investigator/src/store/kind-ink.ts
//
// The hook that gives a surface the colours of a story's own kinds in the theme and colour mode that are
// live: the active manifest's nodes (the schema store), the theme and the colour mode (the theme store),
// resolved by theme/kind-ink.ts. A surface that draws a story kind asks `useStoryInk().get(kind)?.mark`
// and falls back to what it drew before; a slot kind has no entry, so it is never changed.
//
// What it does not do: it keeps no state of its own and writes no store. `storyInkNow` is the same value
// for code that runs outside a render (a map style rebuild, a click handler).

import { useMemo } from "react";
import { storyInk, type KindInk } from "../theme/kind-ink";
import { useSchema } from "./schema";
import { useTheme } from "./theme";

/** The story's own kinds' marks and text inks for the live manifest, theme and colour mode. The map is the
 *  resolver's memoised one, so it keeps its identity until the manifest, the theme or the mode changes. */
export function useStoryInk(): ReadonlyMap<string, KindInk> {
  const nodes = useSchema((s) => s.nodes);
  const theme = useTheme((s) => s.theme);
  const color = useTheme((s) => s.color);
  return useMemo(() => storyInk(nodes, theme, color), [nodes, theme, color]);
}

/** The same value as `useStoryInk`, read from the stores as they are now. */
export function storyInkNow(): ReadonlyMap<string, KindInk> {
  const { theme, color } = useTheme.getState();
  return storyInk(useSchema.getState().nodes, theme, color);
}
