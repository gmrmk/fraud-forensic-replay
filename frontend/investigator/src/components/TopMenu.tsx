import { useEffect, useRef, useState, type FocusEvent, type ReactElement, type ReactNode } from "react";
import { Panel, Pill } from "./ui";

export interface TopMenuProps {
  /** The trigger's text, and the dialog's accessible name. */
  label: string;
  /** Panel width: 256 px (wide) or 176 px (narrow). */
  width: "wide" | "narrow";
  /** Rendered only while the menu is open. */
  children: ReactNode;
  /** Shows the `.foot-cue` shade at the scroller's foot while more lies below (index.css); none when the menu fits. */
  footCue?: boolean;
}

/**
 * A top-bar menu button: a glass trigger drawn as a glass Pill, and an
 * opaque dialog that opens 8 px under it. A pointer press anywhere outside the root
 * closes it, and so does focus moving to an element outside the root; together they make
 * opening one menu close another, by pointer and by keyboard. Focus moves to the dialog
 * when it opens. Nothing listens for keys.
 */
export function TopMenu({ label, width, children, footCue }: TopMenuProps): ReactElement {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);

  // pointerdown (not click) so a drag that starts outside also closes it. A press
  // inside the root does nothing, so the trigger's own toggle still wins. The listener
  // runs in the capture phase because the map's verdict badges stop their own
  // pointerdown, which a bubbling listener on the document would never hear.
  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: PointerEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  // React's onBlur bubbles, so this hears focus leaving any element in the root. Focus
  // moving to somewhere inside keeps the menu open; a blur with no related target is the
  // window losing focus, which also keeps it open.
  const onBlur = (e: FocusEvent<HTMLDivElement>) => {
    const next = e.relatedTarget;
    if (next instanceof Node && !e.currentTarget.contains(next)) setOpen(false);
  };

  // The dialog only takes script focus (tabIndex -1), so keyboard and screen reader
  // users land inside the menu when it opens.
  useEffect(() => {
    if (open) dialogRef.current?.focus();
  }, [open]);

  return (
    <div ref={rootRef} className="relative" onBlur={onBlur}>
      <Panel material="glass" radius="md" className="px-2 py-1.5">
        {/* The inner flex row keeps the trigger at the row's height. */}
        <div className="flex">
          <Pill
            tone="text"
            size="md"
            aria-haspopup="dialog"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            {/* An open menu underlines its label, so the state shows beside aria-expanded. */}
            <span className={open ? "underline underline-offset-4" : undefined}>{label}</span>
          </Pill>
        </div>
      </Panel>

      {open && (
        <div
          ref={dialogRef}
          role="dialog"
          aria-label={label}
          tabIndex={-1}
          className="absolute left-0 top-full z-50 mt-2 outline-none"
        >
          <Panel
            material="instrument"
            radius="md"
            className={width === "wide" ? "w-[256px]" : "w-[176px]"}
          >
            {/* The scroller is this inner div, never the Panel: the instrument's grain
                child is absolutely placed over the panel box and would scroll away. */}
            <div
              className={`px-2.5 py-2 max-h-[calc(var(--vh-c)_-_var(--bottom-stack-c)_-_64px)] overflow-y-auto${footCue ? " foot-cue" : ""}`}
            >
              {children}
            </div>
          </Panel>
        </div>
      )}
    </div>
  );
}
