/**
 * The read-only body renderer draws React elements from data: a switch over five node types and
 * four marks gives p ul ol li blockquote br strong em u s, text as a child. No element outside
 * those ten, no attribute at all, whatever the data says.
 */
import { describe, it, expect } from "vitest";
import { render } from "@testing-library/react";
import { NoteBody } from "./NoteBody";
import { clone, doc, para, text } from "../../lib/notes/test-fixtures";
import type { Body } from "../../lib/notes/types";

const ALLOWED = ["p", "ul", "ol", "li", "blockquote", "br", "strong", "em", "u", "s"];

const rich: Body = doc(
  para(text("Plain "), text("b", "bold"), text("i", "italic"), text("u", "underline"), text("s", "strike"), text("all", "bold", "italic", "underline", "strike")),
  { type: "bullet_list", content: [{ type: "list_item", content: [para(text("one"))] }] },
  { type: "ordered_list", content: [{ type: "list_item", content: [para(text("first"))] }] },
  { type: "quote", content: [para(text("quoted"))] },
  para(text("a"), { type: "hard_break" }, text("b")),
);

function draw(body: unknown) {
  const box = document.createElement("div");
  document.body.appendChild(box);
  render(<NoteBody body={body} />, { container: box });
  return box;
}

describe("NoteBody", () => {
  it("draws every allowed element, and no element outside the allowed ten", () => {
    const box = draw(rich);
    const tags = new Set([...box.querySelectorAll("*")].map((e) => e.tagName.toLowerCase()));
    for (const t of ALLOWED) expect(tags.has(t), t).toBe(true);
    for (const t of tags) expect(ALLOWED, t).toContain(t);
  });

  it("writes no attribute on any element", () => {
    const box = draw(rich);
    for (const el of box.querySelectorAll("*")) expect(el.attributes.length, el.tagName).toBe(0);
  });

  it("draws the text as text", () => {
    const box = draw(rich);
    expect(box.textContent).toContain("Plain ");
    expect(box.textContent).toContain("quoted");
  });

  it("text that looks like markup stays text: no img, no a, no script, and no handler", () => {
    const evil = '<img src=x onerror=boom()><a href="javascript:boom()">x</a><script>boom()</script>';
    const box = draw(doc(para(text(evil))));
    expect(box.querySelector("img, a, script")).toBeNull();
    expect(box.textContent).toBe(evil);
    // happy-dom's innerHTML does not escape text, so the DOM itself is what is checked: the one
    // element is the paragraph, and the evil string is its plain text.
    expect(box.querySelectorAll("*").length).toBe(1);
    expect(box.firstElementChild?.tagName.toLowerCase()).toBe("p");
  });

  it("data that names an attribute, a node outside the set, or a style draws nothing", () => {
    const withAttr = clone(rich) as unknown as { content: Record<string, unknown>[] };
    withAttr.content[0].attrs = { href: "javascript:boom()" };
    const withStyle = clone(rich) as unknown as { content: Record<string, unknown>[] };
    withStyle.content[0].style = "background:url(x)";
    const withClass = clone(rich) as unknown as { content: Record<string, unknown>[] };
    withClass.content[0].className = "x";
    const withNode = { v: 1, content: [{ type: "heading", content: [] }] };
    const withLink = { v: 1, content: [{ type: "paragraph", content: [{ type: "text", text: "x", marks: [{ type: "link", href: "http://x" }] }] }] };
    const proto = JSON.parse('{"v":1,"content":[],"__proto__":{"polluted":true}}');
    for (const bad of [withAttr, withStyle, withClass, withNode, withLink, proto, null, "text", 5, [], { v: 1 }]) {
      const box = draw(bad);
      expect(box.innerHTML, JSON.stringify(bad)).toBe("");
    }
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });

  it("a body that holds a card number draws nothing", () => {
    const box = draw(doc(para(text("4111111111111111"))));
    expect(box.innerHTML).toBe("");
  });

  it("draws an empty body as nothing", () => {
    expect(draw({ v: 1, content: [] }).innerHTML).toBe("");
  });
});
