/**
 * Helpers for tests that pin a name against source text. A pin on the whole text stays green when a
 * comment holds the name and the code does not, so these cut the comments first and match whole names.
 */

/**
 * The text of a source with its block comments (JSX ones too) and line comments cut.
 * SHORTCUT: a `/*` or a ` //` inside a string is taken for a comment (the crawl's route glob
 * `'**\/static-api/*\/decisions/_.json'` holds one), so a pin must sit above such a string.
 */
export const codeOf = (text: string): string =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .map((l) => l.replace(/(^|\s)\/\/.*$/, ""))
    .join("\n");

/** Whether `name` stands in `code` as a whole name: `data-lane-small` is not found in `data-lane-small-plot`. */
export const holdsToken = (code: string, name: string): boolean => new RegExp(`(?<![\\w-])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\w-])`).test(code);
