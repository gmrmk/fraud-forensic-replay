/**
 * One maplibre Marker whose element is a real <button> holding a React-portalled stop plate, anchored
 * `right` so the plate stands left of the record's point, level with it. It follows BadgeMarker's
 * pattern (the verdict layer's badges): the button stops the pointer events the map listens for, so a
 * press on a plate never pans the map or reaches a layer beneath it, and activation is a native click
 * (the keyboard's Enter and Space fire the same click). The button also stops the pointer's moves, so
 * the map's own hover for the records beneath the plate never replaces the plate's words. BadgeMarker
 * itself is not edited: its anchors are the capsule's and the flag's.
 *
 * A plate on the far side of the globe is hidden by the Marker's own opacity and by the verdict
 * markers' class (`verdict-marker`, whose rule in index.css hides a covered marker, so it cannot be
 * pressed either). The plate's own opacity is set inside, on the plate, never on this element.
 *
 * What this file does not do: it words nothing and decides nothing; the layer gives it the name, the
 * point, the offset and the plate.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import maplibregl from "maplibre-gl";
import { tip } from "../ui/Tip";

// A pointer moving on a plate must not reach the map. maplibre listens for `mousemove` on the canvas
// container, which holds the markers. Without the stop, the map's tooltip for the records under the plate,
// and the path line's own hover, write over the plate's words on every move. `pointerover` and `pointerout`,
// which the tooltip layer reads, are not stopped, and neither is the native `mouseout`, so the map still
// hides a tooltip it had up when the pointer leaves the canvas for a plate. The map's drag reads `mousemove`
// on the document in the capture phase, which a stop at the plate does not reach, so a pan across a plate
// still pans.
const STOPPED = ["mousedown", "pointerdown", "touchstart", "dblclick", "mousemove"] as const;
const MARKER_CLASS =
  "verdict-marker absolute left-0 top-0 block p-0 m-0 border-0 bg-transparent cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-signal";

interface Props {
  map: maplibregl.Map;
  lng: number;
  lat: number;
  /** The marker's offset from the point in px: left of it, stepping down for a second path's plate. */
  offset: readonly [number, number];
  /** The button's accessible name. */
  name: string;
  /** The tooltip's lines: a name first, then values. */
  lines: readonly string[];
  onActivate: (trigger: HTMLElement) => void;
  children: ReactNode;
}

export function PlateMarker({ map, lng, lat, offset, name, lines, onActivate, children }: Props) {
  const [el] = useState(() => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = MARKER_CLASS;
    for (const type of STOPPED) b.addEventListener(type, (e) => e.stopPropagation());
    return b;
  });
  const activate = useRef(onActivate);
  useEffect(() => {
    activate.current = onActivate;
  });

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      e.stopPropagation();
      activate.current(el);
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [el]);

  useEffect(() => {
    el.setAttribute("aria-label", name);
  }, [el, name]);

  // The tooltip sits on the button itself, so hover on the plate and keyboard focus on the button
  // both find it (the tooltip layer looks for `data-tip` on the element and its ancestors).
  const text = lines.join("\n");
  useEffect(() => {
    for (const [k, v] of Object.entries(tip(text.split("\n")))) el.setAttribute(k, v);
    return () => {
      el.removeAttribute("data-tip");
      el.removeAttribute("aria-description");
    };
  }, [el, text]);

  // The offset goes in as two numbers, so a new array of the same values makes no new Marker.
  const [dx, dy] = offset;
  useEffect(() => {
    const m = new maplibregl.Marker({ element: el, anchor: "right", offset: [dx, dy], opacityWhenCovered: 0 })
      .setLngLat([lng, lat])
      .addTo(map);
    return () => {
      m.remove();
    };
  }, [map, el, dx, dy, lng, lat]);

  return createPortal(children, el);
}
