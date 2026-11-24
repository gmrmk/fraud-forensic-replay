/**
 * The editor's closed schema (ProseMirror packages used directly, no starter kit and no React
 * wrapper) and the converters between its document and P1's body document.
 *
 *  - The schema declares eight nodes and four marks, with P1's names, and no attribute on any of
 *    them. A parse rule reads no attribute (no getAttrs); a serializer writes none.
 *  - A document reaches the editor only through `docFromBody`: P1's `checkBody` first, then the
 *    library's `Node.fromJSON`, then `node.check()`. It reaches the store only through
 *    `bodyFromDoc`: the document as JSON, made NFC, then `checkBody` again.
 *  - `flattenDoc` is the text the card guard reads, built the way P1's `flattenBody` builds it,
 *    and `caretOffset` maps a position in the document to an offset in that text.
 */
import { Node as PMNode, Schema, type MarkSpec, type NodeSpec } from "prosemirror-model";
import { checkBody } from "../../lib/notes/schema";
import { fail, ok, type Body, type Check } from "../../lib/notes/types";

/** The nodes and marks of the closed set. Anything else is refused by the schema. */
export const CLOSED_NODES = ["doc", "paragraph", "text", "bullet_list", "ordered_list", "list_item", "quote", "hard_break"] as const;
export const CLOSED_MARKS = ["bold", "italic", "underline", "strike"] as const;

const nodes: Record<(typeof CLOSED_NODES)[number], NodeSpec> = {
  doc: { content: "block+" },
  paragraph: { group: "block", content: "inline*", parseDOM: [{ tag: "p" }], toDOM: () => ["p", 0] },
  bullet_list: { group: "block", content: "list_item+", parseDOM: [{ tag: "ul" }], toDOM: () => ["ul", 0] },
  ordered_list: { group: "block", content: "list_item+", parseDOM: [{ tag: "ol" }], toDOM: () => ["ol", 0] },
  // One paragraph in an item: no nesting, no second block.
  list_item: { content: "paragraph", defining: true, parseDOM: [{ tag: "li" }], toDOM: () => ["li", 0] },
  quote: { group: "block", content: "paragraph+", defining: true, parseDOM: [{ tag: "blockquote" }], toDOM: () => ["blockquote", 0] },
  hard_break: { inline: true, group: "inline", selectable: false, parseDOM: [{ tag: "br" }], toDOM: () => ["br"] },
  text: { group: "inline" },
};

const marks: Record<(typeof CLOSED_MARKS)[number], MarkSpec> = {
  bold: { parseDOM: [{ tag: "strong" }, { tag: "b" }], toDOM: () => ["strong", 0] },
  italic: { parseDOM: [{ tag: "em" }, { tag: "i" }], toDOM: () => ["em", 0] },
  underline: { parseDOM: [{ tag: "u" }], toDOM: () => ["u", 0] },
  strike: { parseDOM: [{ tag: "s" }, { tag: "del" }, { tag: "strike" }], toDOM: () => ["s", 0] },
};

export const noteSchema = new Schema({ nodes, marks });

/** A document of one empty paragraph: what an empty body is to the editor. */
export function emptyDoc(): PMNode {
  return noteSchema.node("doc", null, [noteSchema.node("paragraph")]);
}

function docJson(body: Body): unknown {
  return { type: "doc", content: body.content.length > 0 ? body.content : [{ type: "paragraph" }] };
}

/** Body to document. Refuses what `checkBody` refuses, then what the library refuses. */
export function docFromBody(raw: unknown): Check<PMNode> {
  const checked = checkBody(raw);
  if (!checked.ok) return checked;
  try {
    const node = PMNode.fromJSON(noteSchema, docJson(checked.value));
    node.check();
    return ok(node);
  } catch {
    return fail("body_schema", "body");
  }
}

type Json = { type?: string; text?: string; content?: Json[]; marks?: unknown };

/** The document's content as body JSON, text made NFC. Unchecked: a draft may hold a number. */
function contentOf(doc: PMNode): Json[] {
  const walk = (n: Json): Json => {
    const out: Json = { ...n };
    // The break command lets a break inherit the marks at the cursor; the body schema allows none.
    if (out.type === "hard_break") delete out.marks;
    if (typeof out.text === "string") out.text = out.text.normalize("NFC");
    if (Array.isArray(out.content)) out.content = out.content.map(walk);
    return out;
  };
  const json = doc.toJSON() as { content?: Json[] };
  return (json.content ?? []).map(walk);
}

const isBlankContent = (c: Json[]): boolean => c.length === 1 && c[0].type === "paragraph" && !c[0].content;

/** The unchecked body of a document: one empty paragraph is an empty body. */
export function rawBody(doc: PMNode): unknown {
  const content = contentOf(doc);
  return { v: 1, content: isBlankContent(content) ? [] : content };
}

/** A string that is the same for two documents that hold the same body (the dirty check). */
export function bodySignature(doc: PMNode): string {
  return JSON.stringify(rawBody(doc));
}

/** Document to body, through `checkBody`: the Save rule, which judges every run as closed. */
export function bodyFromDoc(doc: PMNode): Check<Body> {
  return checkBody(rawBody(doc));
}

const blockText = (node: PMNode): string => {
  let s = "";
  node.forEach((child) => {
    s += child.isText ? (child.text as string) : "\n";
  });
  return s;
};

/** The text the guard reads: textblocks joined by one line feed, a hard break as a line feed. */
export function flattenDoc(doc: PMNode): string {
  const lines: string[] = [];
  doc.descendants((node) => {
    if (!node.isTextblock) return true;
    lines.push(blockText(node));
    return false;
  });
  return lines.join("\n");
}

/** The UTF-16 offset in `flattenDoc(doc)` of a position in the document. */
export function caretOffset(doc: PMNode, pos: number): number {
  let offset = 0;
  let first = true;
  let result: number | null = null;
  doc.descendants((node, nodePos) => {
    if (result !== null) return false;
    if (!node.isTextblock) return true;
    if (!first) offset += 1;
    first = false;
    const start = nodePos + 1;
    const end = start + node.content.size;
    if (pos < start) {
      result = offset;
      return false;
    }
    if (pos <= end) {
      let inside = 0;
      node.forEach((child, childOffset) => {
        const from = start + childOffset;
        const to = from + child.nodeSize;
        if (to <= pos) inside += child.isText ? (child.text as string).length : 1;
        else if (from < pos) inside += pos - from;
      });
      result = offset + inside;
      return false;
    }
    offset += blockText(node).length;
    return false;
  });
  return result ?? offset;
}
