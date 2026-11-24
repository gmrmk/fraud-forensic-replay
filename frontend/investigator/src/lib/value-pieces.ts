/** How the rule trace window lets a value break across lines: only at its spaces, never inside a word
 *  or a mark, and, for a list joined by " / ", between the items before anywhere else.
 *
 *  A value is cut into spans that, joined, give the string back exactly (no character added or
 *  dropped, so every word on screen stays the payload's). A span with `nowrap` is drawn
 *  `white-space: nowrap`: the browser cannot end a line inside it. The rest is plain text and breaks at
 *  its spaces. Cut by hand because CSS has no switch that stops a break after a hyphen or between "-"
 *  and ">".
 *
 *  LIMIT: a piece wider than a line must still break somewhere, so only pieces of KEEP_MAX characters
 *  or fewer are held whole (the window's text line is about 42 characters of the mono face); a longer
 *  one stays plain and may break after a hyphen. A piece of 39 or 40 characters in a value that carries
 *  20 px of padding (a crossed threshold's actual) could be clipped by the row; none of the captured
 *  rules has one. */

/** The most characters held whole: a line of the window holds about 42 mono characters. */
export const KEEP_MAX = 40;

export interface Span {
  text: string;
  nowrap: boolean;
}

/** A mark that gives the browser a break chance inside a word: a hyphen, ">" (so "->" does not part)
 *  and "/". */
const MARK = /[-/>]/;
const SEP = " / ";

function push(out: Span[], text: string, nowrap: boolean): void {
  if (text === "") return;
  const last = out[out.length - 1];
  if (last && !last.nowrap && !nowrap) last.text += text;
  else out.push({ text, nowrap });
}

/** The tokens of a run of text: each hyphen- or mark-bearing token of KEEP_MAX or fewer is held whole. */
function tokens(text: string, out: Span[]): void {
  // Only the plain breakable spaces split a text: a no-break space stays inside its token.
  for (const part of text.split(/([ \t\r\n]+)/)) {
    if (part === "") continue;
    const space = /^[ \t\r\n]+$/.test(part);
    push(out, part, !space && MARK.test(part) && part.length <= KEEP_MAX);
  }
}

export function splitValue(value: string): Span[] {
  const out: Span[] = [];
  const items = value.split(SEP);
  if (items.length < 2) {
    tokens(value, out);
    return out;
  }
  items.forEach((item, i) => {
    const text = i < items.length - 1 ? item + " /" : item;
    if (text.length <= KEEP_MAX) push(out, text, true);
    else tokens(text, out);
    if (i < items.length - 1) push(out, " ", false);
  });
  return out;
}

/** The spans joined: the string they were cut from. */
export function spansText(spans: Span[]): string {
  return spans.map((s) => s.text).join("");
}

/** The length in characters of the first piece that cannot break: what must fit beside a label on the
 *  value's first line. */
export function firstPieceChars(value: string): number {
  const first = splitValue(value)[0];
  if (!first) return 0;
  if (first.nowrap) return Math.min(first.text.length, KEEP_MAX);
  const word = first.text.replace(/^[ \t\r\n]+/, "").split(/[ \t\r\n]/)[0] ?? "";
  return Math.min(word.length, KEEP_MAX);
}
