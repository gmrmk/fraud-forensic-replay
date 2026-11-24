import { createElement, type ReactNode } from "react";
import { NoteInspector } from "./noteInspector";
import type { Entity } from "../../lib/entity";

/** The Inspector's renderer for kind "note": `(entity) => ReactNode`, as the registry takes it. The body sits
 *  inside the side padding an InspectorSection gives its own body (px-3), so the rows and their icons start and
 *  end where an Authorization's rows do; the padding is set here so that NoteInspector's own lines stay as they are. */
export function noteInspectorBody(entity: Entity): ReactNode {
  return createElement("div", { className: "px-3" }, createElement(NoteInspector, { entity }));
}
