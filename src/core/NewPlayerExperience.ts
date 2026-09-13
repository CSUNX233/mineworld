import { SaveManager } from './SaveManager';

const KEY = 'mineworld_new_player_v1';
interface Experience { view: 'first' | 'third' | null; mercyAvailable: boolean }

/** Device-wide onboarding, independent of the five adventure slots. */
export class NewPlayerExperience {
  private state: Experience;
  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (saved && (saved.view === null || saved.view === 'first' || saved.view === 'third') && typeof saved.mercyAvailable === 'boolean') {
        this.state = saved; return;
      }
    } catch { /* Fall back to existing adventure history. */ }
    let existing = true;
    try { existing = SaveManager.listSlots().some(slot => slot.exists); } catch { /* Do not overwrite inaccessible saves. */ }
    this.state = { view: existing ? 'third' : null, mercyAvailable: !existing };
    this.persist();
  }
  get needsViewChoice(): boolean { return this.state.view === null; }
  get firstPerson(): boolean { return this.state.view === 'first'; }
  get mercyAvailable(): boolean { return this.state.mercyAvailable; }
  chooseView(first: boolean): void { this.state.view = first ? 'first' : 'third'; this.persist(); }
  consumeMercy(): boolean {
    // Another tab may already have used this device's one rescue.
    try { if (JSON.parse(localStorage.getItem(KEY) ?? 'null')?.mercyAvailable === false) this.state.mercyAvailable = false; } catch { /* Session state still applies. */ }
    if (!this.state.mercyAvailable) return false;
    this.state.mercyAvailable = false; this.persist(); return true;
  }
  private persist(): void {
    try { localStorage.setItem(KEY, JSON.stringify(this.state)); } catch { /* Keep this session usable when browser storage is unavailable. */ }
  }
}
