import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MatchBadge } from "./MatchBadge";

// The badge's box is load-bearing: the Inspector's value cell is 19 px tall with overflow hidden,
// so the hit area is the badge itself (no 24 px pseudo-element). Its padding, border and line
// height set that box, in both tones. Before the plate the box was a 13.5 px line (1.5 of 9 px)
// with no padding and no border; the plate keeps it 13.5 px: 9.5 px of line, 1 px of padding and
// 1 px of border above and below.
describe("MatchBadge box", () => {
  // closes G5.
  it("is 13.5 px tall: a 9.5 px line, 1 px padding and 1 px border above and below, in both tones", () => {
    for (const [count, baseline] of [[3, 0], [5, 3]] as const) {
      const { unmount } = render(<MatchBadge field="mcc" value="5411" count={count} baseline={baseline} />);
      const btn = screen.getByRole("button");
      const tone = btn.dataset.tone;
      expect(btn.style.lineHeight, `${tone} lineHeight`).toBe("9.5px");
      expect(btn.style.paddingTop, `${tone} paddingTop`).toBe("1px");
      expect(btn.style.paddingBottom, `${tone} paddingBottom`).toBe("1px");
      expect(btn.style.borderTopWidth, `${tone} borderTop`).toBe("1px");
      expect(btn.style.borderBottomWidth, `${tone} borderBottom`).toBe("1px");
      const px = (v: string) => parseFloat(v);
      const height =
        px(btn.style.lineHeight) +
        px(btn.style.paddingTop) + px(btn.style.paddingBottom) +
        px(btn.style.borderTopWidth) + px(btn.style.borderBottomWidth);
      expect(height, `${tone} box height`).toBe(13.5);
      unmount();
    }
  });

  it("keeps 3 px of room at each side of the count, in both tones", () => {
    for (const [count, baseline] of [[3, 0], [5, 3]] as const) {
      const { unmount } = render(<MatchBadge field="mcc" value="5411" count={count} baseline={baseline} />);
      const btn = screen.getByRole("button");
      expect(btn.style.paddingLeft, `${btn.dataset.tone} paddingLeft`).toBe("3px");
      expect(btn.style.paddingRight, `${btn.dataset.tone} paddingRight`).toBe("3px");
      unmount();
    }
  });
});
