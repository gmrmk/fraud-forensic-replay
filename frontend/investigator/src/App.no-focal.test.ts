import { describe, it, expect } from "vitest";
import appSource from "./App.tsx?raw";
import decisionsSource from "./store/decisions.ts?raw";
import { codeOf } from "./lib/code-text";

// The case reads its pack's own bundle: no card or account is ever put in an address, and no
// store holds one. These pin that the focal plumbing is gone from the app and the decisions read.
// App.tsx keeps a comment that names `&account_id=`, so its pins read the code with comments cut.

describe("App: no focal card plumbing", () => {
  // codeOf cuts a line comment only on a line that ends in "\n": a checkout with CRLF ends is joined first.
  const code = codeOf(appSource.replace(/\r\n/g, "\n"));

  it("asks for no card_id or account_id and reads no view store", () => {
    // The match is printed with its neighbours, so a failure shows where the name stands.
    expect(code.match(/.{0,60}card_id=.{0,40}/)?.[0]).toBeUndefined();
    expect(code.match(/.{0,60}account_id=.{0,40}/)?.[0]).toBeUndefined();
    expect(code).not.toContain("useView");
  });

  it("the decisions read puts no card_id or account_id in its address", () => {
    expect(decisionsSource).not.toContain("card_id");
    expect(decisionsSource).not.toContain("account_id");
  });

  it("the view store file is gone", () => {
    expect(Object.keys(import.meta.glob("./store/view.ts"))).toEqual([]);
  });
});
