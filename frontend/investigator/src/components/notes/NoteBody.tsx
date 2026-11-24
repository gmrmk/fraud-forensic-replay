/**
 * The read-only body renderer. It draws React elements from data, and only these: a switch over
 * the five node types and the four marks gives p ul ol li blockquote br strong em u s, with the
 * text as a child. No element comes from the data's own words, and no attribute is written on any
 * element: no href, no style, no class. The look comes from the parent (see note-style.ts).
 *
 * The body is checked here again (`checkBody`: closed schema and the card number guard), whatever
 * called, because a body is data until it has passed. A body that fails draws nothing.
 */
import { Fragment, type ReactNode } from "react";
import { checkBody } from "../../lib/notes/schema";
import type { Block, Inline, MarkType, Paragraph } from "../../lib/notes/types";

function mark(type: MarkType, child: ReactNode): ReactNode {
  switch (type) {
    case "bold":
      return <strong>{child}</strong>;
    case "italic":
      return <em>{child}</em>;
    case "underline":
      return <u>{child}</u>;
    case "strike":
      return <s>{child}</s>;
  }
}

function inline(n: Inline, key: number): ReactNode {
  if (n.type === "hard_break") return <br key={key} />;
  let el: ReactNode = n.text;
  for (const m of n.marks ?? []) el = mark(m.type, el);
  return <Fragment key={key}>{el}</Fragment>;
}

/** The inline content of a paragraph, with a break in an empty one so that it keeps its line. */
function runs(p: Paragraph): ReactNode {
  const content = p.content ?? [];
  return content.length === 0 ? <br /> : content.map(inline);
}

function block(b: Block, key: number): ReactNode {
  switch (b.type) {
    case "paragraph":
      return <p key={key}>{runs(b)}</p>;
    case "bullet_list":
      return <ul key={key}>{b.content.map((item, i) => <li key={i}>{runs(item.content[0])}</li>)}</ul>;
    case "ordered_list":
      return <ol key={key}>{b.content.map((item, i) => <li key={i}>{runs(item.content[0])}</li>)}</ol>;
    case "quote":
      return <blockquote key={key}>{b.content.map((p, i) => <p key={i}>{runs(p)}</p>)}</blockquote>;
  }
}

export function NoteBody({ body }: { body: unknown }) {
  const checked = checkBody(body);
  if (!checked.ok) return null;
  return <>{checked.value.content.map(block)}</>;
}
