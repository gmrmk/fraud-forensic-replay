import { useSelection } from "../store/selection";
import { TargetButton } from "./target/TargetButton";
import { DecisionsSection } from "./inspector/DecisionsSection";
import { paletteFor } from "../lib/entity-palette";
import { selectedToEntity } from "../lib/adapters/ffr-seed";
import { entityRendererRegistry } from "../lib/entity";
import type { EntityMatch } from "../lib/matches";
import { ManifestFieldsSection } from "./inspector/ManifestFieldsSection";
import { KindIcon } from "./inspector/LibraryIcon";
import { useStoryInk } from "../store/kind-ink";
import { Panel } from "./ui";
import { RecordWindowOpener } from "./record-window/RecordWindowOpener";

/** The Inspector's heading takes its kind's palette colour as text. The entity palette (shared with
 *  the other windows) names the raw slot class; on this panel that colour reads under 4.5 in several
 *  cells (BACKLOG item 16), so the heading takes the on-inspector form of the same slot. A kind whose
 *  palette class is not a raw slot (a muted kind, a fixed colour) keeps its class. */
const ON_INSPECTOR_TEXT: Record<string, string> = {
  accent: "text-[color:var(--r1-on-inspector)]",
  identity: "text-[color:var(--r2-on-inspector)]",
  elevated: "text-[color:var(--r3-on-inspector)]",
  signal: "text-[color:var(--alarm-on-inspector)]",
};
function headingTextClass(paletteClass: string): string {
  const raw = /^text-(accent|identity|elevated|signal)$/.exec(paletteClass);
  return raw ? ON_INSPECTOR_TEXT[raw[1]] : paletteClass;
}

/** Right-side Inspector panel. Slides in when a marker is selected;
 *  null/hidden otherwise. Registry-based dispatch (Spec 2 redesign
 *  Task 7) - kind→renderer lookup via entityRendererRegistry. The
 *  Esc key handler was removed per user directive - Esc closes nothing
 *  anywhere in the app (Task 9 cleanup). */
export function Inspector() {
  const selected = useSelection((s) => s.selected);
  const clear = useSelection((s) => s.clear);
  const storyInk = useStoryInk();

  if (!selected) return null;

  const entity = selectedToEntity(selected);
  const renderers = entityRendererRegistry.get(entity.kind);
  // paletteFor expects EntityMatch (the union); SelectedEntity maps 1:1.
  const palette = paletteFor(selected as unknown as EntityMatch);
  // A story's own kind takes the resolver's text ink (store/kind-ink.ts); a slot kind takes the word's class.
  const storyText = storyInk.get(entity.kind)?.text;

  // A kind with a bespoke (curated) renderer shows ONLY that body; a kind with
  // no bespoke renderer falls back to the generic schema-dump below. Never both
  // - so a curated body's fields are not duplicated by the schema dump beneath
  // it. (The dump is the platform-readiness fallback for not-yet-bespoke kinds.)

  return (
    <Panel
      as="aside"
      elevation="raised"
      aria-label="Inspector"
      // Script-focusable only: where focus lands when a popout closes after its pop-out
      // control left with the previous selection (window-focus.ts). Not a tab stop; a keyboard
      // arrival shows the global :focus-visible outline.
      tabIndex={-1}
      // The panel ends where its content ends: it is anchored at the top only and
      // capped by max-h at the viewport less the bottom stack (attribution +
      // ticker + timeline, published as --bottom-stack-h by App), the 12px top
      // gap and a 7px breathing gap (19px). A long record scrolls in the inner
      // div (min-h-0 lets that flex child shrink below its content). Tailwind
      // arbitrary value: underscores become spaces in the emitted calc(); the
      // 173px fallback matches the as-shipped stack height until the
      // ResizeObserver first fires.
      className="chrome-zoom absolute top-3 right-3 z-20 w-80 flex flex-col max-h-[calc(var(--vh-c)_-_var(--bottom-stack-c)_-_19px)]"
    >
      <div className="px-3 py-2 border-b border-panel-border-strong flex items-center justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <TargetButton entity={selected as unknown as EntityMatch} variant="chrome" />
          <RecordWindowOpener />
          <KindIcon
            kind={entity.kind}
            className={storyText === undefined ? headingTextClass(palette.textClass) : undefined}
            style={storyText === undefined ? undefined : { color: storyText }}
          />
          <span className={`font-mono text-[10px] uppercase tracking-ultra ${headingTextClass(palette.textClass)} truncate`}>
            Inspector
          </span>
        </div>
        <button
          type="button"
          onClick={clear}
          className="font-mono text-[10px] tracking-widest text-muted hover:text-text px-2"
          aria-label="Close inspector"
        >
          ×
        </button>
      </div>
      <div data-inspector-scroll className="flex-1 min-h-0 overflow-y-auto foot-cue">
        {/* Case decisions lead (verdict before detail) - one slot for every
            entity kind; pills open the rule-mode breakout. */}
        <DecisionsSection />
        {renderers ? (
          renderers.inspectorBody(entity)
        ) : (
          <ManifestFieldsSection entity={entity} />
        )}
      </div>
    </Panel>
  );
}
