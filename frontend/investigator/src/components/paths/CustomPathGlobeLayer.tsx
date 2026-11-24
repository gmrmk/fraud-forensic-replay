/**
 * The investigator's paths on the globe: for each saved path (and the draft being drawn) one dashed
 * neutral line through the records' places, in the stops' order, and a numbered square plate left of each
 * place, the first plate carrying the lens. Lines, their casing, the hover's hit line and the clearance
 * symbols are one geojson source and four layers on the map (custom-path-map.ts); plates are maplibre
 * Markers (PlateMarker), which are real buttons: hover or focus words them, a press selects the record.
 *
 * The layer draws only while the investigator has something to draw. With no saved path and no draft it
 * renders nothing and calls no method of the map (the GlobeMap test mounts the real component on a fake
 * map that has no `addSource` or `isStyleLoaded`). Once a path has been drawn it keeps the layers: a
 * destructive style swap wipes them, and the map's next `idle` puts them back (only when they are
 * missing, so an idle with the layers in place does nothing).
 *
 * The playhead is the only clock, read through one string: which stops are after it (`aheadKey`), so the
 * layer renders when the playhead crosses a stop's time and not between two crossings. A stop is drawn
 * only when its record is found and shown (`pathStops` over the Layers switches); a stop with no place
 * has no plate and the line runs past it. A press on a plate calls `navigate` with the record's own match,
 * as a record link does.
 *
 * What this file does not do: it sets no type size, makes no map call without a path to draw, and draws
 * nothing outside a case. The draft's plates draw at full strength (only its line draws at 0.6, the
 * strength the plan gives the draft); a saved path's plates take its strength (0.35 while another path is
 * chosen).
 */
import { useEffect, useMemo, useRef, useState } from "react";
import type maplibregl from "maplibre-gl";
import { PlateMarker } from "./PlateMarker";
import { StopPlate } from "./StopPlate";
import {
  bindLineTip,
  ensureCustomPathLayers,
  hasCustomPathLayers,
  paintCustomPath,
  pathData,
  type CustomPathMap,
  type LineTipMap,
  type PathInk,
} from "./custom-path-map";
import {
  AHEAD_OPACITY,
  DRAFT_ID,
  aheadKey,
  drawnPaths,
  globePlates,
  lineFeatures,
  plateFeatures,
  type DrawnStops,
} from "./path-geometry";
import { plateWords } from "./plate-words";
import { lineTip, plateLabel } from "../../lib/tooltip-words/paths";
import { pathStops } from "../../lib/marks/select";
import { resolvePalette } from "../../theme/resolve";
import { useCaseLookup, useMarksStore, useShowInputs } from "../../store/marks";
import { useClockForm } from "../../store/clock-form";
import { useNavigation } from "../../store/navigation";
import { usePlayhead } from "../../store/playhead";
import { useSchema } from "../../store/schema";
import { useTheme } from "../../store/theme";
import { usePathSession } from "./path-session";

export function CustomPathGlobeLayer({ map }: { map: maplibregl.Map | null }) {
  const saved = useMarksStore((s) => s.paths);
  const scenario = useMarksStore((s) => s.scenario);
  const draft = usePathSession((s) => s.draft);
  const hidden = usePathSession((s) => s.hidden);
  const chosen = usePathSession((s) => s.chosen);
  const lookup = useCaseLookup();
  const show = useShowInputs();
  const nodes = useSchema((s) => s.nodes);
  const h24 = useClockForm((s) => s.h24);
  const theme = useTheme((s) => s.theme);
  const color = useTheme((s) => s.color);

  // The paths to draw with their stops as the surfaces draw them.
  const items = useMemo<DrawnStops[]>(() => {
    return drawnPaths(saved, hidden, draft, chosen, scenario ?? "").map((d) => ({ ...d, stops: pathStops(d.path, lookup, show) }));
  }, [saved, hidden, draft, chosen, scenario, lookup, show]);

  // The playhead, read only as which stops are after it: a string that changes at a crossing.
  const ahead = usePlayhead((s) => {
    const windowed = s.maxTime > s.minTime;
    return items.map((i) => aheadKey(i.stops, s.playhead, windowed)).join("|");
  });
  const plates = useMemo(() => {
    const p = usePlayhead.getState();
    return globePlates(items, p.playhead, p.maxTime > p.minTime);
    // `ahead` stands for the playhead: it is what changes when a plate's dimming does.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, ahead]);

  const data = useMemo(() => pathData(lineFeatures(items), plateFeatures(plates)), [items, plates]);
  const ink = useMemo<PathInk>(() => {
    const neutral = resolvePalette(theme, color).neutral;
    return { text: neutral.text, bg: neutral.bg };
  }, [theme, color]);

  // The layers are wanted from the first moment there is a path to draw, and from then on kept.
  const [wanted, setWanted] = useState(false);
  if (!wanted && items.length > 0) setWanted(true);

  const latest = useRef({ data, ink });
  useEffect(() => {
    latest.current = { data, ink };
  });

  // The map is a real maplibre Map here; the narrow types name the calls this layer makes.
  useEffect(() => {
    if (!map || !wanted) return;
    ensureCustomPathLayers(map as unknown as CustomPathMap, data, ink);
    // The colours are set when the layers are made and repainted below; a new ink is not a reason to set data.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, wanted, data]);

  useEffect(() => {
    if (!map || !wanted) return;
    paintCustomPath(map as unknown as CustomPathMap, ink);
  }, [map, wanted, ink]);

  // A destructive style swap wipes the source, the layers and the image: the next idle puts them back.
  useEffect(() => {
    if (!map || !wanted) return;
    const m = map as unknown as CustomPathMap;
    const onIdle = (): void => {
      if (hasCustomPathLayers(m)) return;
      ensureCustomPathLayers(m, latest.current.data, latest.current.ink);
    };
    map.on("idle", onIdle);
    return () => {
      map.off("idle", onIdle);
    };
  }, [map, wanted]);

  useEffect(() => {
    if (!map || !wanted) return;
    return bindLineTip(map as unknown as LineTipMap, lineTip);
  }, [map, wanted]);

  if (!map) return null;
  return (
    <>
      {plates.map((p) => {
        const words = plateWords(p.nums, p.total, p.pathName, p.stops, nodes, h24);
        const strength = (p.pathId === DRAFT_ID ? 1 : p.op) * (p.ahead ? AHEAD_OPACITY : 1);
        return (
          <PlateMarker
            key={p.key}
            map={map}
            lng={p.lngLat.lng}
            lat={p.lngLat.lat}
            offset={p.offset}
            name={words.name}
            lines={words.lines}
            onActivate={() => {
              const info = p.stops[0].info;
              if (info !== null) useNavigation.getState().navigate(info.match);
            }}
          >
            <StopPlate label={plateLabel(p.nums)} lens={p.lens} size="globe" opacity={strength === 1 ? undefined : strength} />
          </PlateMarker>
        );
      })}
    </>
  );
}
