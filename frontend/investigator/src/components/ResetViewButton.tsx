import type { ReactElement } from "react";
import { RotateCw } from "lucide-react";
import { resetView, type HomeView, type ResetViewMap } from "../hooks/useBarPadding";
import { resetViewWords } from "../lib/tooltip-words/reset-view";
import { tip } from "./ui/Tip";

export interface ResetViewButtonProps {
  /** The map; null until it is built. */
  map: ResetViewMap | null;
  /** The scenario's home; null or undefined while it is not known. */
  home: HomeView | null | undefined;
}

/**
 * The top bar's reset button: a refresh arrow, drawn as the gear is (a glass square of 37 px, the
 * height of the bar's text controls), placed just before it. It stays in the bar, switched off,
 * while there is no map or no home, because a control that appeared later would shift every control
 * beside it. A button in the tab order; it holds no shortcut. A press moves the camera whether or not
 * a link named one; the camera lock holds only the app's own opening jump.
 */
export function ResetViewButton({ map, home }: ResetViewButtonProps): ReactElement {
  const ready = map !== null && home !== null && home !== undefined;
  return (
    <button
      type="button"
      aria-label="Reset view"
      disabled={!ready}
      onClick={() => {
        if (map && home) resetView(map, home);
      }}
      {...tip(resetViewWords())}
      className="glass grid h-[37px] w-[37px] place-items-center rounded-md outline-none transition-colors focus-visible:ring-1 focus-visible:ring-accent disabled:opacity-50"
      style={{ color: "var(--text-muted)" }}
    >
      <RotateCw size={16} strokeWidth={1.6} aria-hidden="true" />
    </button>
  );
}
