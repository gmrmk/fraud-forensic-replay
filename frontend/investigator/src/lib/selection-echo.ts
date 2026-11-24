/**
 * Bridge from EntityMatch (pivot-store / navigation-store concept) to
 * useSelection's kind-specific select actions. Shared by usePivotStore
 * (DetailWindow open path) and useNavigation (TARGET-click path) to
 * keep the echo semantics identical across both call sites.
 */
import { useSelection } from "../store/selection";
import type { EntityMatch } from "./matches";

export function echoSelection(entity: EntityMatch): void {
  const sel = useSelection.getState();
  if (entity.kind === "auth" || entity.kind === "fraud") sel.selectTransaction(entity.tx);
  else if (entity.kind === "login") sel.selectLogin(entity.login);
  else if (entity.kind === "account_event") sel.selectAccountEvent(entity.event);
  else if (entity.kind === "transfer") sel.selectTransfer(entity.transfer);
  else if (entity.kind === "entity") sel.selectEntity(entity.entity);
  else sel.selectPlace(entity.place);
}
