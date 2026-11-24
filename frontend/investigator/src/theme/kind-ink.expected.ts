// The expected colours of a story's own kinds, one table for each of three stories, two themes and
// six colour modes, in manifest order. Written from the designer's engine run (the oracle of test 1.0),
// never from theme/kind-ink.ts: the test compares the port against these rows. The floors were measured
// on the active mode's own surface in the light theme (rainbow's glass is 0.85, the rest 0.88). A pinned
// table: a new manifest colour or a change of the rule is a new run of the engine, not an edit here.
import type { ColorMode, Theme } from "./axes";

export interface ExpectedRow {
  kind: string;
  mark: string;
  text: string;
}

export const EXPECTED: Record<
  "platform-access" | "key-many-networks" | "card-fraud",
  Record<Theme, Record<ColorMode, ExpectedRow[]>>
> = {
  "platform-access": {
    dark: {
      rainbow: [
        { kind: "org", mark: "#6e8bb0", text: "#829bbb" },
        { kind: "console_signin", mark: "#bb7b35", text: "#ca8a44" },
        { kind: "key_event", mark: "#acbdd2", text: "#acbdd2" },
        { kind: "usage", mark: "#aca585", text: "#aca585" },
        { kind: "decision", mark: "#ff6b35", text: "#ff6b35" },
      ],
      neon: [
        { kind: "org", mark: "#4da3ff", text: "#4da3ff" },
        { kind: "console_signin", mark: "#7ee787", text: "#7ee787" },
        { kind: "key_event", mark: "#c4a1ff", text: "#c4a1ff" },
        { kind: "usage", mark: "#f5a623", text: "#f5a623" },
        { kind: "decision", mark: "#ff6b6b", text: "#ff6b6b" },
      ],
      deuteranopia: [
        { kind: "org", mark: "#61a3ff", text: "#61a3ff" },
        { kind: "console_signin", mark: "#e8d978", text: "#e8d978" },
        { kind: "key_event", mark: "#6b8bb3", text: "#7f9bbd" },
        { kind: "usage", mark: "#d6bd24", text: "#d6bd24" },
        { kind: "decision", mark: "#ff6b35", text: "#ff6b35" },
      ],
      protanopia: [
        { kind: "org", mark: "#61a3ff", text: "#61a3ff" },
        { kind: "console_signin", mark: "#e8d978", text: "#e8d978" },
        { kind: "key_event", mark: "#6b8bb3", text: "#7f9bbd" },
        { kind: "usage", mark: "#d6bd24", text: "#d6bd24" },
        { kind: "decision", mark: "#ff6b35", text: "#ff6b35" },
      ],
      tritanopia: [
        { kind: "org", mark: "#559dc8", text: "#599fc9" },
        { kind: "console_signin", mark: "#aadefd", text: "#aadefd" },
        { kind: "key_event", mark: "#9b9dca", text: "#9b9dca" },
        { kind: "usage", mark: "#b9bbda", text: "#b9bbda" },
        { kind: "decision", mark: "#ff6b35", text: "#ff6b35" },
      ],
      monochrome: [
        { kind: "org", mark: "#737373", text: "#979797" },
        { kind: "console_signin", mark: "#d4d4d4", text: "#d4d4d4" },
        { kind: "key_event", mark: "#8f8f8f", text: "#979797" },
        { kind: "usage", mark: "#b0b0b0", text: "#b0b0b0" },
        { kind: "decision", mark: "#ffffff", text: "#ffffff" },
      ],
    },
    light: {
      rainbow: [
        { kind: "org", mark: "#4e6e96", text: "#405a7b" },
        { kind: "console_signin", mark: "#795425", text: "#755124" },
        { kind: "key_event", mark: "#26364a", text: "#26364a" },
        { kind: "usage", mark: "#747152", text: "#5c5a41" },
        { kind: "decision", mark: "#c9221a", text: "#ae1d16" },
      ],
      neon: [
        { kind: "org", mark: "#0072eb", text: "#0057b3" },
        { kind: "console_signin", mark: "#198522", text: "#13671a" },
        { kind: "key_event", mark: "#8e4aff", text: "#6508ff" },
        { kind: "usage", mark: "#a16707", text: "#7a4e05" },
        { kind: "decision", mark: "#ea0000", text: "#b70000" },
      ],
      deuteranopia: [
        { kind: "org", mark: "#0048ad", text: "#0048ad" },
        { kind: "console_signin", mark: "#29250a", text: "#29250a" },
        { kind: "key_event", mark: "#55627c", text: "#4d5870" },
        { kind: "usage", mark: "#413b10", text: "#413b10" },
        { kind: "decision", mark: "#c9221a", text: "#ae1d16" },
      ],
      protanopia: [
        { kind: "org", mark: "#0048ad", text: "#0048ad" },
        { kind: "console_signin", mark: "#29250a", text: "#29250a" },
        { kind: "key_event", mark: "#55627c", text: "#4d5870" },
        { kind: "usage", mark: "#413b10", text: "#413b10" },
        { kind: "decision", mark: "#c9221a", text: "#ae1d16" },
      ],
      tritanopia: [
        { kind: "org", mark: "#437aaf", text: "#325b83" },
        { kind: "console_signin", mark: "#022940", text: "#022940" },
        { kind: "key_event", mark: "#59437f", text: "#59437f" },
        { kind: "usage", mark: "#42315d", text: "#42315d" },
        { kind: "decision", mark: "#c9221a", text: "#ae1d16" },
      ],
      monochrome: [
        { kind: "org", mark: "#2a2a2a", text: "#2a2a2a" },
        { kind: "console_signin", mark: "#757575", text: "#595959" },
        { kind: "key_event", mark: "#434343", text: "#434343" },
        { kind: "usage", mark: "#5c5c5c", text: "#595959" },
        { kind: "decision", mark: "#000000", text: "#000000" },
      ],
    },
  },
  "key-many-networks": {
    dark: {
      rainbow: [
        { kind: "org", mark: "#6e8bb0", text: "#829bbb" },
        { kind: "principal", mark: "#acbdd2", text: "#acbdd2" },
        { kind: "network_seen", mark: "#8ba3c0", text: "#8ba3c0" },
        { kind: "reset", mark: "#aca585", text: "#aca585" },
        { kind: "usage_day", mark: "#e6b189", text: "#e6b189" },
        { kind: "signin", mark: "#e48a7c", text: "#e48a7c" },
        { kind: "key_event", mark: "#ecd5bb", text: "#ecd5bb" },
        { kind: "request_sample", mark: "#bb7b35", text: "#ca8a44" },
        { kind: "decision", mark: "#ff6b35", text: "#ff6b35" },
      ],
      neon: [
        { kind: "org", mark: "#4da3ff", text: "#4da3ff" },
        { kind: "principal", mark: "#c4a1ff", text: "#c4a1ff" },
        { kind: "network_seen", mark: "#7ee787", text: "#7ee787" },
        { kind: "reset", mark: "#f5a623", text: "#f5a623" },
        { kind: "usage_day", mark: "#ffd166", text: "#ffd166" },
        { kind: "signin", mark: "#ff9bd2", text: "#ff9bd2" },
        { kind: "key_event", mark: "#a5d6ff", text: "#a5d6ff" },
        { kind: "request_sample", mark: "#56d4dd", text: "#56d4dd" },
        { kind: "decision", mark: "#ff6b6b", text: "#ff6b6b" },
      ],
      deuteranopia: [
        { kind: "org", mark: "#61a3ff", text: "#61a3ff" },
        { kind: "principal", mark: "#6b8bb3", text: "#7f9bbd" },
        { kind: "network_seen", mark: "#e8d978", text: "#e8d978" },
        { kind: "reset", mark: "#d6bd24", text: "#d6bd24" },
        { kind: "usage_day", mark: "#a1a1a1", text: "#a1a1a1" },
        { kind: "signin", mark: "#0068fa", text: "#4d97ff" },
        { kind: "key_event", mark: "#918963", text: "#9f9873" },
        { kind: "request_sample", mark: "#abbdd4", text: "#abbdd4" },
        { kind: "decision", mark: "#ff6b35", text: "#ff6b35" },
      ],
      protanopia: [
        { kind: "org", mark: "#61a3ff", text: "#61a3ff" },
        { kind: "principal", mark: "#6b8bb3", text: "#7f9bbd" },
        { kind: "network_seen", mark: "#e8d978", text: "#e8d978" },
        { kind: "reset", mark: "#d6bd24", text: "#d6bd24" },
        { kind: "usage_day", mark: "#a1a1a1", text: "#a1a1a1" },
        { kind: "signin", mark: "#0068fa", text: "#4d97ff" },
        { kind: "key_event", mark: "#918963", text: "#9f9873" },
        { kind: "request_sample", mark: "#abbdd4", text: "#abbdd4" },
        { kind: "decision", mark: "#ff6b35", text: "#ff6b35" },
      ],
      tritanopia: [
        { kind: "org", mark: "#559dc8", text: "#599fc9" },
        { kind: "principal", mark: "#9b9dca", text: "#9b9dca" },
        { kind: "network_seen", mark: "#aadefd", text: "#aadefd" },
        { kind: "reset", mark: "#8083bc", text: "#9193c5" },
        { kind: "usage_day", mark: "#b9bbda", text: "#b9bbda" },
        { kind: "signin", mark: "#d0d1e6", text: "#d0d1e6" },
        { kind: "key_event", mark: "#0477bc", text: "#059df8" },
        { kind: "request_sample", mark: "#8cc2df", text: "#8cc2df" },
        { kind: "decision", mark: "#ff6b35", text: "#ff6b35" },
      ],
      monochrome: [
        { kind: "org", mark: "#737373", text: "#979797" },
        { kind: "principal", mark: "#818181", text: "#989898" },
        { kind: "network_seen", mark: "#d4d4d4", text: "#d4d4d4" },
        { kind: "reset", mark: "#8f8f8f", text: "#979797" },
        { kind: "usage_day", mark: "#e9e9e9", text: "#e9e9e9" },
        { kind: "signin", mark: "#9f9f9f", text: "#9f9f9f" },
        { kind: "key_event", mark: "#c1c1c1", text: "#c1c1c1" },
        { kind: "request_sample", mark: "#b0b0b0", text: "#b0b0b0" },
        { kind: "decision", mark: "#ffffff", text: "#ffffff" },
      ],
    },
    light: {
      rainbow: [
        { kind: "org", mark: "#4e6e96", text: "#405a7b" },
        { kind: "principal", mark: "#26364a", text: "#26364a" },
        { kind: "network_seen", mark: "#344a65", text: "#344a65" },
        { kind: "reset", mark: "#747152", text: "#5c5a41" },
        { kind: "usage_day", mark: "#4d2f14", text: "#4d2f14" },
        { kind: "signin", mark: "#812b1d", text: "#812b1d" },
        { kind: "key_event", mark: "#2b1e0d", text: "#2b1e0d" },
        { kind: "request_sample", mark: "#795425", text: "#755124" },
        { kind: "decision", mark: "#c9221a", text: "#ae1d16" },
      ],
      neon: [
        { kind: "org", mark: "#0072eb", text: "#0057b3" },
        { kind: "principal", mark: "#8e4aff", text: "#6508ff" },
        { kind: "network_seen", mark: "#198522", text: "#13671a" },
        { kind: "reset", mark: "#a16707", text: "#7a4e05" },
        { kind: "usage_day", mark: "#755200", text: "#755200" },
        { kind: "signin", mark: "#e2007d", text: "#af0061" },
        { kind: "key_event", mark: "#0061b2", text: "#0059a3" },
        { kind: "request_sample", mark: "#1c8189", text: "#156167" },
        { kind: "decision", mark: "#ea0000", text: "#b70000" },
      ],
      deuteranopia: [
        { kind: "org", mark: "#0048ad", text: "#0048ad" },
        { kind: "principal", mark: "#55627c", text: "#4d5870" },
        { kind: "network_seen", mark: "#29250a", text: "#29250a" },
        { kind: "reset", mark: "#413b10", text: "#413b10" },
        { kind: "usage_day", mark: "#4b4e53", text: "#4b4e53" },
        { kind: "signin", mark: "#00204d", text: "#00204d" },
        { kind: "key_event", mark: "#686350", text: "#5c5847" },
        { kind: "request_sample", mark: "#323948", text: "#323948" },
        { kind: "decision", mark: "#c9221a", text: "#ae1d16" },
      ],
      protanopia: [
        { kind: "org", mark: "#0048ad", text: "#0048ad" },
        { kind: "principal", mark: "#55627c", text: "#4d5870" },
        { kind: "network_seen", mark: "#29250a", text: "#29250a" },
        { kind: "reset", mark: "#413b10", text: "#413b10" },
        { kind: "usage_day", mark: "#4b4e53", text: "#4b4e53" },
        { kind: "signin", mark: "#00204d", text: "#00204d" },
        { kind: "key_event", mark: "#686350", text: "#5c5847" },
        { kind: "request_sample", mark: "#323948", text: "#323948" },
        { kind: "decision", mark: "#c9221a", text: "#ae1d16" },
      ],
      tritanopia: [
        { kind: "org", mark: "#437aaf", text: "#325b83" },
        { kind: "principal", mark: "#59437f", text: "#59437f" },
        { kind: "network_seen", mark: "#022940", text: "#022940" },
        { kind: "reset", mark: "#6f539d", text: "#664c90" },
        { kind: "usage_day", mark: "#42315d", text: "#42315d" },
        { kind: "signin", mark: "#8369af", text: "#654c8f" },
        { kind: "key_event", mark: "#045a8d", text: "#045a8d" },
        { kind: "request_sample", mark: "#1d3d53", text: "#1d3d53" },
        { kind: "decision", mark: "#c9221a", text: "#ae1d16" },
      ],
      monochrome: [
        { kind: "org", mark: "#1a1a1a", text: "#1a1a1a" },
        { kind: "principal", mark: "#2a2a2a", text: "#2a2a2a" },
        { kind: "network_seen", mark: "#686868", text: "#595959" },
        { kind: "reset", mark: "#373737", text: "#373737" },
        { kind: "usage_day", mark: "#757575", text: "#595959" },
        { kind: "signin", mark: "#434343", text: "#434343" },
        { kind: "key_event", mark: "#5c5c5c", text: "#595959" },
        { kind: "request_sample", mark: "#4f4f4f", text: "#4f4f4f" },
        { kind: "decision", mark: "#000000", text: "#000000" },
      ],
    },
  },
  "card-fraud": {
    dark: {
      rainbow: [
        { kind: "decision", mark: "#ff6b35", text: "#ff6b35" },
      ],
      neon: [
        { kind: "decision", mark: "#ff6b6b", text: "#ff6b6b" },
      ],
      deuteranopia: [
        { kind: "decision", mark: "#ff6b35", text: "#ff6b35" },
      ],
      protanopia: [
        { kind: "decision", mark: "#ff6b35", text: "#ff6b35" },
      ],
      tritanopia: [
        { kind: "decision", mark: "#ff6b35", text: "#ff6b35" },
      ],
      monochrome: [
        { kind: "decision", mark: "#ffffff", text: "#ffffff" },
      ],
    },
    light: {
      rainbow: [
        { kind: "decision", mark: "#c9221a", text: "#ae1d16" },
      ],
      neon: [
        { kind: "decision", mark: "#ea0000", text: "#b70000" },
      ],
      deuteranopia: [
        { kind: "decision", mark: "#c9221a", text: "#ae1d16" },
      ],
      protanopia: [
        { kind: "decision", mark: "#c9221a", text: "#ae1d16" },
      ],
      tritanopia: [
        { kind: "decision", mark: "#c9221a", text: "#ae1d16" },
      ],
      monochrome: [
        { kind: "decision", mark: "#000000", text: "#000000" },
      ],
    },
  },
};
