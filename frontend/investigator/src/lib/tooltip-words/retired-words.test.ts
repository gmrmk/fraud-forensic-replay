// The words the 2026-11-19 words pass retired (the rows of its list that gave one thing two names or used a
// word that is not the term table's or not plain). Each pair is a file under src and a piece of text that
// file must not hold again. The old text is held here as plain strings; none holds a long dash.
import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// RETIRED_WORDS_SRC points the test at another copy of src, to show it fails on the tree before the pass.
const SRC = process.env.RETIRED_WORDS_SRC ?? resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

const RETIRED: readonly (readonly [file: string, words: readonly string[]])[] = [
  ["components/TimelineControls.tsx", ["Snap playhead", "Step slower", "Step faster", "Pause playback", "Play playback"]],
  ["lib/tooltip-words/solo.ts", [": show every row"]],
  ["components/timeline/SpeedMenu.tsx", ['"Paused"', '"reverse"']],
  ["components/timeline/SpeedFlyout.tsx", ["speed picker"]],
  ["components/timeline/ClockSwitch.tsx", ["h clock"]],
  ["components/NarrativeLog.tsx", ["Expand rail", "Collapse rail"]],
  ["components/pivot/WindowFrame.tsx", ['"Expand"', "Collapse to bar", "Pin window", "persist across"]],
  ["components/timeline/CaseTimelineLayer.tsx", ["${a.label} - ${a.note}"]],
  ["components/ui/Tip.tsx", ["marks here"]],
  // The helper lines taken off the Inspector: nothing replaces them.
  ["components/inspector/FraudInspector.tsx", ["rule line", "stand-in", "issuer-authorized", "chip was not read", "./captions"]],
  ["components/inspector/AuthInspector.tsx", ['"CNP"', "Card Present", "Auth Details", "Avg Daily", 'title="Geo"', "Lat / Lng", '"Running"', "prior to this txn"]],
  ["components/inspector/PlaceInspector.tsx", ["Auths within", "Nearby auths", 'label="Geo"', "not in txn DB"]],
  ["components/inspector/LoginInspector.tsx", ["Network Intel", 'label="Geo"']],
  ["components/inspector/ManifestFieldsSection.tsx", ["Pivot on"]],
  ["components/pivot/PivotBadge.tsx", ["Quick-look"]],
  ["components/pivot/DetailWindow.tsx", ["not in this pack"]],
  ["components/verdict/NotesBody.tsx", ["not in this pack"]],
  ["components/DecisionPill.tsx", ["rule breakout"]],
  ["components/ThemeSwitcher.tsx", ["Visual settings"]],
  ["components/target/TargetButton.tsx", ["event node"]],
  ["lib/row-ticks.ts", ["${heading}, ${count}"]],
  ["lib/timeline-lanes.ts", ["0 buckets", '"bucket"', "${above} above", "max ${formatScaleNumber", "every ${step}"]],
  ["lib/time-words.ts", ["${h} h,", "${m} min,"]],
  ["lib/tooltip-words/rows.ts", ["in all.", "unfold", "close its lines", "Drawn cut", "carry no", "Busiest first", "One row for each"]],
  ["lib/tooltip-words/lane-depth.ts", ["${total} in all"]],
  ["lib/tooltip-words/head.ts", ["moment of the replay", "that moment", "waits at this edge"]],
  ["lib/tooltip-words/transport.ts", ["what the bar shows", "one step down", "one step up"]],
  // The Layers menu's row for the investigator's own records was named for a lens and renamed on 2026-11-21.
  ["lib/tooltip-words/layers.ts", ["Yours only"]],
  ["components/LayerPanels.tsx", ["Yours only"]],
  ["store/layers.ts", ["Yours only"]],
];

describe("the words the 2026-11-19 pass retired", () => {
  for (const [file, words] of RETIRED) {
    it(`${file} holds none of them`, () => {
      const source = readFileSync(resolve(SRC, file), "utf8");
      for (const w of words) expect(source, `${file} holds "${w}"`).not.toContain(w);
    });
  }

  it("holds no long dash in its own list", () => {
    const own = readFileSync(fileURLToPath(import.meta.url), "utf8");
    const dashes = new RegExp(`[${String.fromCharCode(0x2013, 0x2014)}]`);
    expect(own).not.toMatch(dashes);
  });
});
