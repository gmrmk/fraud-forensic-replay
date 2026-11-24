/**
 * Generic Entity interface - the platform-readiness seam.
 *
 * Every new component consumes Entity, not concrete FFR seed types
 * (Transaction | LoginEvent | Place). The seed schema is the FIRST
 * adapter; future Websocket-ingested schemas register additional
 * adapters via the same shape. See spec § Generic Entity interface.
 */
import type { ReactNode } from "react";

/** Open-ended entity kind. Type stays `string` to keep the seam
 *  unsealed for future ingested schemas. */
export type EntityKind = string;

export interface Entity {
  id: string;
  kind: EntityKind;
  timestamp: number;
  /** null = a behavioral entity with NO geography (account events, transfers).
   *  Such entities live on the timeline and never render on the map - an
   *  honest absence, not a Null-Island sentinel. */
  coords: { lat: number; lng: number } | null;
  fields: Record<string, unknown>;
  displayMetadata: EntityDisplayMetadata;
}

export interface EntityDisplayMetadata {
  primaryLabel: string;
  secondaryLabel: string;
  paletteKind: string;
  pivotableFields: readonly string[];
  detailFieldOrder?: readonly string[];
}

export interface EntityRenderers {
  /** Renders the inspector panel body for this entity.
   *  Context-passing (e.g., related transactions) is deferred to Task 7,
   *  which will use Zustand stores or closure-at-registration. */
  inspectorBody: (entity: Entity) => ReactNode;
}

export const entityRendererRegistry = new Map<EntityKind, EntityRenderers>();
