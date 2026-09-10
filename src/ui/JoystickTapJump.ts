/** Strict double-tap recognizer. Only the second release can confirm a jump. */
export class JoystickTapJump {
  private active: { x: number; y: number; lastX: number; lastY: number; time: number; travel: number; dragged: boolean } | null = null;
  private previous: { x: number; y: number; released: number } | null = null;

  begin(x: number, y: number, time: number): void {
    if (this.active) { this.cancel(); return; }
    if (this.previous && (time - this.previous.released > 240 || Math.hypot(x - this.previous.x, y - this.previous.y) > 24)) this.previous = null;
    this.active = { x, y, lastX: x, lastY: y, time, travel: 0, dragged: false };
  }

  move(x: number, y: number): void {
    const tap = this.active;
    if (!tap) return;
    tap.travel += Math.hypot(x - tap.lastX, y - tap.lastY);
    tap.lastX = x; tap.lastY = y;
    // Tolerance is below the movement dead zone. Track the entire path, not just release position.
    if (Math.hypot(x - tap.x, y - tap.y) > 3 || tap.travel > 5) {
      tap.dragged = true;
      this.previous = null;
    }
  }

  end(x: number, y: number, time: number): boolean {
    this.move(x, y);
    const tap = this.active;
    this.active = null;
    if (!tap || tap.dragged || time - tap.time > 160 || time < tap.time) {
      this.previous = null;
      return false;
    }
    const previous = this.previous;
    if (previous && time - previous.released <= 320 && Math.hypot(tap.x - previous.x, tap.y - previous.y) <= 24) {
      this.previous = null;
      return true;
    }
    this.previous = { x: tap.x, y: tap.y, released: time };
    return false;
  }

  cancel(): void { this.active = null; this.previous = null; }
}
