/**
 * One maplibre Marker whose element is a real <button> holding React-portalled badge content.
 * Verified against maplibre-gl 5.24.0 (d.ts and dist source): MarkerOptions.element / anchor /
 * offset / opacityWhenCovered; addTo appends the element to map.getCanvasContainer() and gives
 * it role and aria-label only when absent; the class maplibregl-marker-covered toggles when the
 * point is on the back of the globe.
 *
 * The button stops the pointer events maplibre listens for, so a badge click never pans the map
 * or reaches a layer click beneath it. That also keeps the click from React's root listener, so
 * activation is a native listener (keyboard Enter/Space on the focused button fires the same click).
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import maplibregl from "maplibre-gl";

const STOPPED = ["mousedown", "pointerdown", "touchstart", "dblclick"] as const;
const MARKER_CLASS =
  "verdict-marker absolute left-0 top-0 block p-0 m-0 border-0 bg-transparent cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-accent";

interface Props {
  map: maplibregl.Map;
  lng: number;
  lat: number;
  anchor: "top" | "bottom-left";
  offsetY: number;
  /** The button's accessible name. */
  name: string;
  onActivate: (trigger: HTMLElement) => void;
  children: ReactNode;
}

export function BadgeMarker({ map, lng, lat, anchor, offsetY, name, onActivate, children }: Props) {
  const [el] = useState(() => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = MARKER_CLASS;
    for (const type of STOPPED) b.addEventListener(type, (e) => e.stopPropagation());
    return b;
  });
  const activate = useRef(onActivate);
  useEffect(() => { activate.current = onActivate; });

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      e.stopPropagation();
      activate.current(el);
    };
    el.addEventListener("click", onClick);
    return () => el.removeEventListener("click", onClick);
  }, [el]);

  useEffect(() => { el.setAttribute("aria-label", name); }, [el, name]);

  // A pile's key names its anchor item, so a mounted badge's spot never moves: these deps change
  // only with the map.
  useEffect(() => {
    const m = new maplibregl.Marker({ element: el, anchor, offset: [0, offsetY], opacityWhenCovered: 0 })
      .setLngLat([lng, lat])
      .addTo(map);
    return () => { m.remove(); };
  }, [map, el, anchor, offsetY, lng, lat]);

  return createPortal(children, el);
}
