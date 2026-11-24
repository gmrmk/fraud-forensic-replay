// components/inspector/LibraryIcon.tsx
// One library icon of a kind or of an attribute, as the Inspector draws it: 16 px, the library's line at
// 1.5 on its 24 unit grid (1 px at 16 px), in the ink of the text around it (currentColor), hidden from
// assistive technology because the words beside it name the thing. Which icon is lib/icons.ts's. It draws
// no word, takes no press and sizes by no class: the size is the component's own.
import type { CSSProperties } from "react";
import { ICONS, fieldIconName, kindIconName } from "../../lib/icons";
import { useSchema } from "../../store/schema";

interface DrawProps {
  className?: string;
  style?: CSSProperties;
}

function Drawn({ name, className, style }: DrawProps & { name: string }) {
  const Icon = ICONS[name];
  return <Icon size={16} strokeWidth={1.5} aria-hidden="true" className={`inline-block shrink-0 ${className ?? ""}`} style={style} />;
}

export function KindIcon({ kind, ...rest }: DrawProps & { kind: string }) {
  const nodes = useSchema((s) => s.nodes);
  return <Drawn name={kindIconName(kind, nodes)} {...rest} />;
}

export function FieldIcon({ field, ...rest }: DrawProps & { field: string }) {
  const fields = useSchema((s) => s.fields);
  return <Drawn name={fieldIconName(field, fields)} {...rest} />;
}
