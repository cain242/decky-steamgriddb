import { Navigation } from '@decky/ui';

let rerenderTimer: ReturnType<typeof setTimeout> | null = null;

/**
 * Triggers a navigation cycle to force Steam's UI to re-render with updated patches.
 *
 * Debounced: multiple calls within the cooldown window (e.g. from setPatches toggling
 * several patches in sequence) are coalesced into a single navigation event.
 * This prevents the jarring multi-refresh that occurred when each add/remove patch
 * independently triggered its own Navigate + NavigateBack.
 */
export function rerenderAfterPatchUpdate(): void {
  if (rerenderTimer !== null) {
    clearTimeout(rerenderTimer);
  }
  rerenderTimer = setTimeout(() => {
    rerenderTimer = null;
    Navigation.Navigate('/library');
    Navigation.NavigateBack();
  }, 80);
}
