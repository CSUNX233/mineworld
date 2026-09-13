/** Visual state only. Never changes collision, velocity or input. */
export class HeroMotionState {
  state = 'Idle';
  airTime = 0;
  stateTime = 0;
  landing = 0;
  speed = 0;
  private grounded = true;
  private peakFall = 0;
  reset(grounded = true): void {
    this.state = 'Idle'; this.airTime = this.stateTime = this.landing = this.speed = this.peakFall = 0;
    this.grounded = grounded;
  }
  update(dt: number, grounded: boolean, vy: number, speed: number, input: number, alive: boolean): void {
    if (!alive) return;
    this.speed += (Math.min(16, speed) - this.speed) * (1 - Math.exp(-18 * dt));
    this.stateTime += dt;
    this.landing = Math.max(0, this.landing - dt);
    let next = this.state;
    if (!grounded) {
      this.airTime = this.grounded ? 0 : this.airTime + dt;
      this.peakFall = Math.max(this.peakFall, -vy);
      this.landing = 0;
      next = vy > 0 && this.airTime < .1 ? 'Jump_Start' : vy > 1.2 ? 'Jump_Rise' : vy < -1.2 ? 'Jump_Fall' : 'Jump_Apex';
    } else {
      if (!this.grounded && this.airTime > .10 && this.peakFall > 2.5) {
        next = this.peakFall > 10.5 ? 'Land_Heavy' : 'Land_Light';
        this.landing = next === 'Land_Heavy' ? .42 : .24;
      } else if (this.landing === 0) next = this.speed > .15 && input > .02 ? 'Move' : 'Idle';
      this.airTime = 0; this.peakFall = 0;
    }
    if (next !== this.state) { this.state = next; this.stateTime = 0; }
    this.grounded = grounded;
  }
}
