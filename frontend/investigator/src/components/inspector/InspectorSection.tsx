import { useId, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Eyebrow } from "../ui";
import { tip } from "../ui/Tip";
import { sectionFoldName, sectionFoldWords } from "../../lib/tooltip-words/inspector";

interface Props {
  title: string;
  children: ReactNode;
  /** Optional inline trailing element shown on the section header line
   *  (e.g. a count badge or a small action button). */
  trailing?: ReactNode;
  /** Opts the section into the fold. The title becomes a button; folded, the body gives way to this
   *  one line (the section's first row as it prints), cut to the width with an ellipsis and whole in its
   *  tooltip. Left out, the section is the plain title row and body, with no control and no state. */
  foldSummary?: string;
  /** Visual-capture anchor for eyes-feature.mjs --select (per-feature screenshot framing). */
  "data-eyes"?: string;
}

/** Inspector section primitive - an Eyebrow-tier title (uppercase, tracked,
 *  mode-aware via the theme var, not mono) over a hairline-divided body. All
 *  Inspector content composes from these.
 *
 *  LIMIT: the fold state lives here and is not saved. A section starts open every time it mounts. The
 *  Inspector mounts a manifest body with no key, so a section that stays mounted keeps its fold through a
 *  move to another record: the same kind's sections do, and so do the remaining-fields and Shared values
 *  sections of any manifest kind (they sit in fixed places) and a declared section whose id another kind
 *  also uses. A section with an id new to the body mounts open. */
export function InspectorSection({ title, children, trailing, foldSummary, "data-eyes": eyesId }: Props) {
  const [folded, setFolded] = useState(false);
  const bodyId = useId();
  if (foldSummary === undefined) {
    return (
      <div className="border-t border-panel-border" data-eyes={eyesId}>
        <div className="px-3 py-1.5 flex items-baseline justify-between">
          <Eyebrow size="xs" tone="muted">
            {title}
          </Eyebrow>
          {trailing}
        </div>
        <div className="px-3 pb-2">{children}</div>
      </div>
    );
  }
  const open = !folded;
  const FoldIcon = open ? ChevronDown : ChevronRight;
  return (
    <div className="border-t border-panel-border" data-eyes={eyesId}>
      <div className="flex items-center justify-between pr-3">
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          aria-label={sectionFoldName(title, open)}
          {...tip(sectionFoldWords(title, open))}
          onClick={() => setFolded((f) => !f)}
          className="flex h-[26px] min-w-0 flex-1 items-center gap-1.5 px-3 text-left transition-colors hover:bg-text/10 focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent"
        >
          <FoldIcon size={12} aria-hidden="true" className="shrink-0 text-muted" />
          <Eyebrow size="xs" tone="muted">
            {title}
          </Eyebrow>
        </button>
        {trailing}
      </div>
      {open ? (
        <div id={bodyId} className="px-3 pb-2">
          {children}
        </div>
      ) : (
        <div
          id={bodyId}
          className="truncate px-3 pb-1.5 pl-[30px] text-[10px] leading-snug text-[color:var(--text-faint-on-inspector)]"
          {...tip([foldSummary])}
        >
          {foldSummary}
        </div>
      )}
    </div>
  );
}
