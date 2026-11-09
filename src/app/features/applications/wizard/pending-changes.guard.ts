import { CanDeactivateFn } from '@angular/router';

export interface HasPendingChanges {
  hasPendingChanges(): boolean;
}

/** Warns before leaving the wizard while an auto-save is pending, in flight, or failed. */
export const pendingChangesGuard: CanDeactivateFn<HasPendingChanges> = (component) =>
  !component.hasPendingChanges() ||
  window.confirm('Some changes have not been saved yet. Leave anyway?');
