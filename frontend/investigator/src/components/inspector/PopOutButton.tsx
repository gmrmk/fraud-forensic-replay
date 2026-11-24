import { usePivotStore, type PopoutView } from "../../store/pivot";
import { popoutOpened } from "../../lib/window-focus";
import type { Entity } from "../../lib/entity";

interface Props {
  entity: Entity;
  view: PopoutView;
}

/** Inspector section control: opens the section as a window pinned beside the entity's pin.
 *  Absent for a geography-less entity (nothing on the globe to pin to). */
export function PopOutButton({ entity, view }: Props) {
  const openPopout = usePivotStore((s) => s.openPopout);
  if (!entity.coords) return null;
  const name = `Pop out ${view.label} beside its pin`;
  return (
    <button
      type="button"
      aria-label={name}
      title={name}
      onClick={(e) => {
        const id = openPopout(entity, view);
        if (id) popoutOpened(id, e.currentTarget);
      }}
      // self-center: the section header row aligns on the text baseline, and a glyph-only
      // button has none, so it would otherwise hang below the title. -my-[1.5px]: the 18px hit
      // area keeps the header at the 15px line box of the 10px eyebrow beside it, so a section
      // with this control is as tall as one without.
      className="self-center -my-[1.5px] w-[18px] h-[18px] rounded flex items-center justify-center text-[color:var(--text-faint)] hover:text-[color:var(--text-muted)] hover:bg-text/5 focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent"
    >
      <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-[11px] h-[11px]">
        <path d="M14 4h6v6M20 4l-8 8M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
      </svg>
    </button>
  );
}
