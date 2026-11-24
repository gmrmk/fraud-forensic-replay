import { useEffect, useRef, type ReactElement } from "react";
import { GlobeIcon, MapIcon } from "lucide-react";
import { useMapMode } from "../store/map-mode";
import { mapModeWords } from "../lib/tooltip-words/map-mode";
import { showTipOn, tip } from "./ui/Tip";

/**
 * The top row's map shape button: a map icon while the map is a globe and a globe icon while it is
 * flat, drawn as the reset button is and placed just before it. A press asks the store for the other
 * shape and does nothing else; the map component applies it. It is one element through a flip, so the
 * keyboard focus stays on it, and it is never switched off. Its accessible name is the first line of
 * its tooltip, which names where a press goes; `data-map-switch` holds that shape for the checks.
 *
 * The tooltip layer reads an element's words only when it shows them, so after a press from the
 * keyboard (a click with detail 0) the button shows its tooltip again once the new words are drawn.
 * A press of the pointer hides the tooltip, and it stays hidden.
 */
export function MapModeButton(): ReactElement {
  const shape = useMapMode((s) => s.shape);
  const setShape = useMapMode((s) => s.setShape);
  const button = useRef<HTMLButtonElement | null>(null);
  const pressedByKey = useRef(false);
  const next = shape === "globe" ? "flat" : "globe";
  const words = mapModeWords(shape);

  useEffect(() => {
    if (!pressedByKey.current) return;
    pressedByKey.current = false;
    if (button.current) showTipOn(button.current);
  }, [shape]);

  return (
    <button
      ref={button}
      type="button"
      aria-label={words[0]}
      data-map-switch={next}
      onClick={(e) => {
        pressedByKey.current = e.detail === 0;
        setShape(next);
      }}
      {...tip(words)}
      className="glass grid h-[37px] w-[37px] place-items-center rounded-md outline-none transition-colors focus-visible:ring-1 focus-visible:ring-accent disabled:opacity-50"
      style={{ color: "var(--text-muted)" }}
    >
      {shape === "globe" ? (
        <MapIcon size={16} strokeWidth={1.6} aria-hidden="true" />
      ) : (
        <GlobeIcon size={16} strokeWidth={1.6} aria-hidden="true" />
      )}
    </button>
  );
}
