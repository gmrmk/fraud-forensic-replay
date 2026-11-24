import { splitValue } from "../../lib/value-pieces";

/** A value drawn so its lines end only at its spaces: each hyphenated word, each arrow and each item of
 *  a " / " list is a no-break span (lib/value-pieces.ts says which and why); the rest is plain text. The
 *  spans are inline (not inline-block), so an underline on a pressable parent runs through them. A value
 *  with nothing to hold whole is its plain string. The text is the string, character for character. */
export function ValueText({ text }: { text: string }) {
  const spans = splitValue(text);
  if (spans.every((s) => !s.nowrap)) return <>{text}</>;
  return (
    <>
      {spans.map((s, i) =>
        s.nowrap ? (
          <span key={i} className="whitespace-nowrap">
            {s.text}
          </span>
        ) : (
          s.text
        ),
      )}
    </>
  );
}
