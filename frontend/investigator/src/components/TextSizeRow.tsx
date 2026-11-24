import type { CSSProperties, ReactNode } from "react";
import { useTextSize } from "../store/text-size";
import { TEXT_SIZES, nextTextSize, prevTextSize } from "../lib/text-size";
import { textSizeWords, type TextSizePart } from "../lib/tooltip-words/text-size";
import { tip } from "./ui/Tip";
import { Eyebrow } from "./ui";

/**
 * The text size row of the gear menu: a button with a small letter A and a triangle that points
 * down, the step as a figure in percent, and a button with a large letter A and a triangle that
 * points up. The two letters are drawn at two sizes, so the pair shows the scale. They are paths,
 * not text, so this row writes no type size. A button at the end of the range is `aria-disabled`
 * and ignores the press, never the native `disabled`: a native disabled button that was just
 * pressed drops focus to the page body and takes its tooltip out of reach.
 */
export function TextSizeRow() {
  const size = useTextSize((s) => s.size);
  const setSize = useTextSize((s) => s.setSize);
  const atSmallest = size === TEXT_SIZES[0];
  const atLargest = size === TEXT_SIZES[TEXT_SIZES.length - 1];

  return (
    <div style={{ marginTop: 8 }}>
      <Eyebrow tone="muted">Text size</Eyebrow>
      <div
        role="group"
        aria-label="Text size"
        style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 2, marginTop: 4 }}
      >
        <StepButton
          label="Smaller text"
          part="smaller"
          size={size}
          atEnd={atSmallest}
          onPress={() => setSize(prevTextSize(size))}
        >
          <Letter height={9} name="small" />
          <Triangle down />
        </StepButton>
        <output {...tip(textSizeWords("figure", size))}>
          <Eyebrow tone="text">{`${size}%`}</Eyebrow>
        </output>
        <StepButton
          label="Larger text"
          part="larger"
          size={size}
          atEnd={atLargest}
          onPress={() => setSize(nextTextSize(size))}
        >
          <Letter height={14} name="large" />
          <Triangle down={false} />
        </StepButton>
      </div>
    </div>
  );
}

const BUTTON: CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 2,
  padding: "3px 6px",
  borderRadius: 6,
  border: "1px solid rgb(var(--hairline-rgb, 255 255 255) / 0.12)",
  background: "transparent",
  transition: "color 150ms, opacity 150ms",
};

function StepButton(props: {
  label: string;
  part: TextSizePart;
  size: (typeof TEXT_SIZES)[number];
  atEnd: boolean;
  onPress: () => void;
  children: ReactNode;
}) {
  const { label, part, size, atEnd, onPress, children } = props;
  return (
    <button
      type="button"
      aria-label={label}
      aria-disabled={atEnd}
      onClick={() => {
        if (!atEnd) onPress();
      }}
      {...tip(textSizeWords(part, size))}
      className="outline-none focus-visible:ring-1 focus-visible:ring-accent"
      style={{
        ...BUTTON,
        color: atEnd ? "var(--text-faint)" : "var(--text)",
        opacity: atEnd ? 0.6 : 1,
        cursor: atEnd ? "default" : "pointer",
      }}
    >
      {children}
    </button>
  );
}

/** A capital A drawn as a path, `height` px tall; the two heights are what show the scale. */
function Letter({ height, name }: { height: number; name: "small" | "large" }) {
  return (
    <svg
      data-letter={name}
      width={height}
      height={height}
      viewBox="0 0 10 10"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 9.5 L5 0.8 L9 9.5 M2.7 6.6 H7.3" />
    </svg>
  );
}

function Triangle({ down }: { down: boolean }) {
  return (
    <svg width="6" height="5" viewBox="0 0 6 5" fill="currentColor" aria-hidden="true">
      <path d={down ? "M0 0 H6 L3 5 Z" : "M0 5 H6 L3 0 Z"} />
    </svg>
  );
}
