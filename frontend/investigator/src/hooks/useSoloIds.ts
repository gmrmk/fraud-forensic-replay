/**
 * The ids a solo keeps, over the whole case: the one derivation the two globe layers that App.tsx does
 * not narrow (the investigator's marks and the decision capsules) read, so a solo takes the same records
 * off the globe as it does off the globe's own dots. Null with no solo. Built from the solo store and the
 * pivot data store (the whole case, as `useBarTracks` builds it for the bar), memoised on the five lists
 * and the solo, so a playhead tick rebuilds nothing.
 *
 * What this file does not do: it narrows no list, reads no switch and no clock, and knows no field name
 * (the field is the solo's).
 */
import { useMemo } from "react";
import { soloIds } from "../lib/solo";
import { usePivotData } from "../store/pivot-data";
import { useSolo } from "../store/solo";

export function useSoloIds(): ReadonlySet<string> | null {
  const solo = useSolo((s) => s.solo);
  const transactions = usePivotData((s) => s.transactions);
  const logins = usePivotData((s) => s.logins);
  const accountEvents = usePivotData((s) => s.accountEvents);
  const transfers = usePivotData((s) => s.transfers);
  const entities = usePivotData((s) => s.entities);
  return useMemo(
    () => (solo ? soloIds(solo, { transactions, logins, places: [], accountEvents, transfers, entities }) : null),
    [solo, transactions, logins, accountEvents, transfers, entities],
  );
}
