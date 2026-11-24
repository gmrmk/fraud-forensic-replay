/**
 * Helpers over the closed body document: counting characters, flattening it to the text the
 * guard reads, building one from plain text, and the label. Pure, and no clock.
 */
import { isBidiOverrideCp, isControlCp } from "./digits";
import { LIMITS, type Body, type Paragraph } from "./types";

const ELLIPSIS = String.fromCodePoint(0x2026);

/** Characters as code points, the way Python's len counts them (UTF-16 length would differ). */
export function charCount(s: string): number {
  let n = 0;
  for (const _ of s) n += 1;
  return n;
}

function paragraphText(p: Paragraph): string {
  let s = "";
  for (const n of p.content ?? []) s += n.type === "hard_break" ? "\n" : n.text;
  return s;
}

/**
 * The text of a document as the guard reads it: text joined across marks; every paragraph (also
 * those in list items and quotes) and every hard break joined by one line feed. An empty
 * paragraph counts as an empty line, so three empty paragraphs between two groups are four
 * line feeds.
 */
export function flattenBody(body: Body): string {
  const lines: string[] = [];
  for (const b of body.content) {
    if (b.type === "paragraph") lines.push(paragraphText(b));
    else if (b.type === "quote") for (const p of b.content) lines.push(paragraphText(p));
    else for (const item of b.content) lines.push(paragraphText(item.content[0]));
  }
  return lines.join("\n");
}

export function emptyBody(): Body {
  return { v: 1, content: [] };
}

/**
 * Plain text to a document, one paragraph per line (the paste rule: line breaks become
 * paragraphs, control characters are dropped). Text is made NFC. The result still goes through
 * the schema and the guard before anything stores it.
 */
export function bodyFromPlainText(plain: string): Body {
  const lines = plain.replace(/\r\n?/g, "\n").split("\n").map((line) => {
    let out = "";
    for (const ch of line) {
      const cp = ch.codePointAt(0) as number;
      if (!isControlCp(cp) && !isBidiOverrideCp(cp)) out += ch;
    }
    // Normalise last: dropping a control character can leave a base letter next to a combining mark.
    return out.normalize("NFC");
  });
  return {
    v: 1,
    content: lines.map((line): Paragraph => (line ? { type: "paragraph", content: [{ type: "text", text: line }] } : { type: "paragraph" })),
  };
}

/**
 * The label of a note: its first non-empty line, at most 60 characters (code points; a longer
 * line is cut to 59 and an ellipsis), or the category when the text is empty. There is no title.
 */
export function noteLabel(note: { body: Body; category: string }): string {
  const first = flattenBody(note.body)
    .split("\n")
    .map((l) => l.trim())
    .find((l) => l !== "");
  if (first === undefined) return note.category;
  const chars = Array.from(first);
  if (chars.length <= LIMITS.labelChars) return first;
  return chars.slice(0, LIMITS.labelChars - 1).join("") + ELLIPSIS;
}
