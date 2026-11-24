import { Target } from "lucide-react";
import { useNavigation } from "../../store/navigation";
import type { EntityMatch } from "../../lib/matches";

interface Props {
  entity: EntityMatch;
  variant: "chrome" | "row";
}

// Inline rgba for cyan tint - Tailwind hex tokens (`accent: "#00e5ff"`)
// block the /N opacity modifier. Established workaround pattern across
// PivotBadge, PivotPopover, DetailWindow, WindowFrame.
const BG_DEFAULT: React.CSSProperties = { backgroundColor: "rgba(0, 229, 255, 0.10)" };

const SIZE_CLASS: Record<Props["variant"], string> = {
  chrome: "w-6 h-[22px]",
  row: "w-[18px] h-4",
};

const ICON_SIZE: Record<Props["variant"], number> = {
  chrome: 13,
  row: 10,
};

/** Universal "go to entity on map" affordance. Lives on every entity-anchored
 *  surface: Inspector header, DetailWindow header, Flyout header,
 *  PivotPopover rows, NarrativeLog rows. Click → useNavigation.navigate
 *  → pan + zoom + pulse + pause + silent selection echo. */
export function TargetButton({ entity, variant }: Props) {
  const navigate = useNavigation((s) => s.navigate);

  return (
    <button
      type="button"
      data-variant={variant}
      data-no-drag
      onClick={(e) => {
        e.stopPropagation();
        navigate(entity);
      }}
      style={BG_DEFAULT}
      className={`inline-flex items-center justify-center border border-accent/50 rounded-[2px] text-accent cursor-pointer flex-shrink-0 hover:bg-accent/20 hover:shadow-[0_0_0_2px_rgba(0,229,255,0.18)] focus:outline-none focus-visible:ring-1 focus-visible:ring-accent transition ${SIZE_CLASS[variant]}`}
      aria-label="Go to this event on the map"
      title="Go to this event on the map"
    >
      <Target size={ICON_SIZE[variant]} strokeWidth={2} />
    </button>
  );
}
