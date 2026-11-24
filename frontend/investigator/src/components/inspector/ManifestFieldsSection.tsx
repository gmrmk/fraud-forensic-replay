import { useMemo } from "react";
import { useSchema } from "../../store/schema";
import { useMatches } from "../../store/matches";
import { usePivotData } from "../../store/pivot-data";
import { InspectorSection } from "./InspectorSection";
import { InspectorField } from "./InspectorField";
import { PopOutButton } from "./PopOutButton";
import { RecordRefValue } from "./RecordRefValue";
import { SharedValuesSection } from "./SharedValuesSection";
import { refsOf, resolveRefs } from "../../lib/record-refs";
import { buildFieldEntries, displayLabel, parseTemplateFields, sectionEntries, type ManifestFieldEntry } from "../../lib/manifest-fields";
import type { Entity } from "../../lib/entity";
import type { MatchableField } from "../../lib/matches";
import type { ScenarioNode } from "../../lib/scenarios";

interface Props {
  entity: Entity;
}

/** The pivot matches on `raw`, the stored value; `value` is only how it reads. */
function PivotableRow({ fieldKey, label, value, raw, ink }: { fieldKey: string; label: string; value: string; raw: string; ink: string; }) {
  const open = useMatches((s) => s.open);
  return (
    <InspectorField
      label={label}
      field={fieldKey}
      valueClass={ink}
      value={
        <>
          <button
            type="button"
            onClick={() => open(fieldKey as MatchableField, raw)}
            className="font-mono transition hover:text-[color:var(--r1-on-inspector)] focus:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-accent"
            title={`Find matches for ${fieldKey}=${raw}`}
          >
            {value}
          </button>
        </>
      }
    />
  );
}

function CurrencyRow({ fieldKey, label, value }: { fieldKey: string; label: string; value: string; }) {
  return <InspectorField label={label} field={fieldKey} value={value} valueClass="text-[color:var(--r1-on-inspector)]" />;
}

/** A field the node declares a ref for. Each value that names a record of a declared kind prints that
 *  record's name and opens it; a value that names none prints as the plain row does, with today's
 *  press. The records are the loaded rows (nothing is fetched). */
function RefFieldRow({ entry, kinds, openId, ink }: { entry: ManifestFieldEntry; kinds: readonly string[]; openId: string; ink: string }) {
  const nodes = useSchema((s) => s.nodes);
  const transactions = usePivotData((s) => s.transactions);
  const logins = usePivotData((s) => s.logins);
  const accountEvents = usePivotData((s) => s.accountEvents);
  const transfers = usePivotData((s) => s.transfers);
  const entities = usePivotData((s) => s.entities);
  const results = useMemo(
    () => resolveRefs(entry.raw, kinds, { transactions, logins, places: [], accountEvents, transfers, entities }, nodes, openId),
    [entry.raw, kinds, transactions, logins, accountEvents, transfers, entities, nodes, openId],
  );
  if (!results.some((r) => r !== null)) return <PlainFieldRow entry={entry} ink={ink} />;
  const list = Array.isArray(entry.raw);
  return (
    <InspectorField
      label={entry.label}
      field={entry.key}
      valueClass={ink}
      value={<RecordRefValue values={list ? (entry.raw as unknown[]) : [entry.raw]} results={results} list={list} />}
    />
  );
}

/** The Inspector's grey, for a value the manifest marks secondary (--text-faint-on-inspector, 6.0 or
 *  more on the panel in every theme and palette). Every other plain value takes the panel's ink. */
const SECONDARY_INK = "text-[color:var(--text-faint-on-inspector)]";
const NO_FIELDS: ReadonlySet<string> = new Set();

/** The fields only the node's `secondary` template names. A field the `primary` template also names is
 *  a primary field (the record's headline), and so is any field neither template names. Read from the
 *  manifest; no field name is written here. */
function secondaryOnlyFields(node: ScenarioNode): ReadonlySet<string> {
  const primary = new Set(parseTemplateFields(node.primary));
  return new Set(parseTemplateFields(node.secondary).filter((k) => !primary.has(k)));
}

function FieldRow({ entry, refs, openId, secondary }: { entry: ManifestFieldEntry; refs: Record<string, string[]>; openId: string; secondary: ReadonlySet<string> }) {
  const kinds = refs[entry.key];
  const ink = secondary.has(entry.key) ? SECONDARY_INK : "text-text";
  if (kinds && entry.raw != null) return <RefFieldRow entry={entry} kinds={kinds} openId={openId} ink={ink} />;
  return <PlainFieldRow entry={entry} ink={ink} />;
}

function PlainFieldRow({ entry, ink }: { entry: ManifestFieldEntry; ink: string }) {
  // An absent value ("-") is never offered as a pivot.
  if (entry.fieldClass === "pivotable" && entry.raw != null) return <PivotableRow fieldKey={entry.key} label={entry.label} value={entry.value} raw={String(entry.raw)} ink={ink} />;
  if (entry.fieldClass === "currency") return <CurrencyRow fieldKey={entry.key} label={entry.label} value={entry.value} />;
  // A reformatted string (an ISO datetime shown in Houston time) keeps its raw text on hover.
  const value = typeof entry.raw === "string" && entry.raw !== entry.value ? <span title={entry.raw}>{entry.value}</span> : entry.value;
  return <InspectorField label={entry.label} field={entry.key} value={value} valueClass={ink} />;
}

/** One declared section's rows, in the section's order. Shared by the inspector section and
 *  its popout window, so both read the same schema metadata. */
export function SectionRows({ entity, node, fields }: { entity: Entity; node: ScenarioNode; fields: readonly string[] }) {
  const entries = useMemo(() => sectionEntries(entity.fields, node, fields), [entity.fields, node, fields]);
  const refs = useMemo(() => refsOf(node), [node]);
  const secondary = useMemo(() => secondaryOnlyFields(node), [node]);
  return <>{entries.map((entry) => <FieldRow key={entry.key} entry={entry} refs={refs} openId={entity.id} secondary={secondary} />)}</>;
}

/** The line a folded section keeps: its first row as the row prints it, "Label: value". A section with no
 *  row has nothing to fold to, so it gets none and stays a plain title (no fold control). */
function foldLine(entry: ManifestFieldEntry | undefined): string | undefined {
  return entry ? `${displayLabel(entry.label)}: ${entry.value}` : undefined;
}

export function ManifestFieldsSection({ entity }: Props) {
  const nodeFor = useSchema((s) => s.nodeFor);
  const node = nodeFor(entity.kind);
  const entries = useMemo(() => (node ? buildFieldEntries(entity.fields, node) : []), [entity.fields, node]);
  const refs = useMemo(() => refsOf(node), [node]);
  const secondary = useMemo(() => (node ? secondaryOnlyFields(node) : NO_FIELDS), [node]);
  if (!node) return null;
  return (
    <>
      {(node.sections ?? []).map((s) => (
        <InspectorSection
          key={s.id}
          title={s.label}
          foldSummary={foldLine(sectionEntries(entity.fields, node, s.fields.slice(0, 1))[0])}
          trailing={<PopOutButton entity={entity} view={{ type: "section", sectionId: s.id, label: s.label }} />}
        >
          <SectionRows entity={entity} node={node} fields={s.fields} />
        </InspectorSection>
      ))}
      {entries.length > 0 && (
        <InspectorSection title={`${node.label} Fields`} foldSummary={foldLine(entries[0])}>
          {entries.map((entry) => <FieldRow key={entry.key} entry={entry} refs={refs} openId={entity.id} secondary={secondary} />)}
        </InspectorSection>
      )}
      {/* Shared values close the body (C2 a): what the record shares with others, after its own fields. */}
      <SharedValuesSection entity={entity} />
    </>
  );
}
