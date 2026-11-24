import { describe, it, expect, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { TimelineControls } from "./TimelineControls";
import { usePlayhead } from "../store/playhead";

// The transport icons fill with currentColor, so the button's text colour IS the icon colour.
// The raw accent over the glass is unreadable (1.0 to 2.61:1), so every transport button must
// rest in the text token and in no other text colour. happy-dom does not run Tailwind, so the
// class tokens are the only observable.
function textTokens(el: HTMLElement): string[] {
  return [...el.classList].filter((c) => /(^|:)text-/.test(c));
}

beforeEach(() => {
  usePlayhead.setState({
    isPlaying: false,
    minTime: 0,
    maxTime: 1000,
    windowMin: 0,
    windowMax: 1000,
    playhead: 500,
    playbackRate: 1,
  });
});

describe("transport icon colour", () => {
  // kills Z7 (text-text becomes text-accent on the case transport's buttons); closes G7.
  it("each case transport button rests in text-text and sets no other text colour", () => {
    render(<TimelineControls />);
    const names = [/^back to the start$/i, /^slower$/i, /^play$/i, /^faster$/i];
    expect(names).toHaveLength(4);
    for (const name of names) {
      const btn = screen.getByRole("button", { name });
      expect(btn.querySelector("svg")?.getAttribute("fill"), String(name)).toBe("currentColor");
      expect(textTokens(btn), String(name)).toEqual(["text-text"]);
    }
  });

  // The switch is a pill, which sets its colour inline (the text token) and a size class beside it,
  // so its class tokens are not the observable: its inline colour is.
  it("the clock's switch rests in the text token", () => {
    render(<TimelineControls showClock />);
    const btn = screen.getByRole("button", { name: /the clock shows the \d\d hour form\. press to show/i });
    expect(btn.style.color).toBe("var(--text)");
  });
});
