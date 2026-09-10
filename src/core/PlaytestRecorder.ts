const SCHEMA_VERSION = 1;
const MAX_RETAINED_EVENTS = 2_000;

export type PlaytestPhase = 'combat' | 'exploration' | 'menu';

type JsonPrimitive = string | number | boolean | null;
type JsonValue = JsonPrimitive | JsonValue[] | { [key: string]: JsonValue };
type JsonObject = { [key: string]: JsonValue };

export interface PlaytestEvent {
  type: string;
  sessionSeconds: number;
  data: JsonObject;
}

export interface PlaytestSnapshot {
  schemaVersion: number;
  scope: 'current-page-session';
  persistsAcrossRefresh: false;
  startedAt: string | null;
  sessionSeconds: number;
  metadata: JsonObject;
  events: PlaytestEvent[];
  eventCounts: Record<string, number>;
  phaseDurations: Record<PlaytestPhase, number>;
  goldSummary: PlaytestGoldSummary;
  droppedEventCount: number;
  maxRetainedEvents: number;
}

export interface PlaytestGoldTotals {
  income: number;
  spending: number;
  net: number;
}

export interface PlaytestGoldSummary extends PlaytestGoldTotals {
  bySource: Record<string, PlaytestGoldTotals>;
}

function toJsonValue(value: unknown, seen: WeakSet<object>): JsonValue | undefined {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value !== 'object') return undefined;

  if (seen.has(value)) return '[Circular]';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value.toISOString();

  seen.add(value);
  if (Array.isArray(value)) {
    const result = value.map((item) => toJsonValue(item, seen) ?? null);
    seen.delete(value);
    return result;
  }

  const result: JsonObject = {};
  for (const [key, item] of Object.entries(value)) {
    const jsonValue = toJsonValue(item, seen);
    if (jsonValue !== undefined) result[key] = jsonValue;
  }
  seen.delete(value);
  return result;
}

function toJsonObject(value: Record<string, unknown>): JsonObject {
  return toJsonValue(value, new WeakSet()) as JsonObject;
}

export class PlaytestRecorder {
  private startedAt: string | null = null;
  private sessionSeconds = 0;
  private metadata: JsonObject = {};
  private events: PlaytestEvent[] = [];
  private eventCounts: Record<string, number> = Object.create(null) as Record<string, number>;
  private phaseDurations: Record<PlaytestPhase, number> = {
    combat: 0,
    exploration: 0,
    menu: 0,
  };
  private goldSummary: PlaytestGoldSummary = {
    income: 0,
    spending: 0,
    net: 0,
    bySource: Object.create(null) as Record<string, PlaytestGoldTotals>,
  };
  private droppedEventCount = 0;

  startSession(metadata: Record<string, unknown>): void {
    this.startedAt = new Date().toISOString();
    this.sessionSeconds = 0;
    this.metadata = toJsonObject(metadata);
    this.events = [];
    this.eventCounts = Object.create(null) as Record<string, number>;
    this.phaseDurations = { combat: 0, exploration: 0, menu: 0 };
    this.goldSummary = {
      income: 0,
      spending: 0,
      net: 0,
      bySource: Object.create(null) as Record<string, PlaytestGoldTotals>,
    };
    this.droppedEventCount = 0;
  }

  record(type: string, data: Record<string, unknown> = {}): void {
    if (this.startedAt === null) return;

    this.eventCounts[type] = (this.eventCounts[type] ?? 0) + 1;
    if (type === 'gold_changed') this.recordGoldChange(data);
    this.events.push({
      type,
      sessionSeconds: this.sessionSeconds,
      data: toJsonObject(data),
    });

    if (this.events.length > MAX_RETAINED_EVENTS) {
      this.events.shift();
      this.droppedEventCount += 1;
    }
  }

  tick(seconds: number, phase: PlaytestPhase): void {
    if (!Number.isFinite(seconds) || seconds < 0) return;
    if (this.startedAt === null) return;

    this.sessionSeconds += seconds;
    this.phaseDurations[phase] += seconds;
  }

  snapshot(): PlaytestSnapshot {
    return {
      schemaVersion: SCHEMA_VERSION,
      scope: 'current-page-session',
      persistsAcrossRefresh: false,
      startedAt: this.startedAt,
      sessionSeconds: this.sessionSeconds,
      metadata: toJsonObject(this.metadata),
      events: this.events.map((event) => ({
        type: event.type,
        sessionSeconds: event.sessionSeconds,
        data: toJsonObject(event.data),
      })),
      eventCounts: { ...this.eventCounts },
      phaseDurations: { ...this.phaseDurations },
      goldSummary: {
        income: this.goldSummary.income,
        spending: this.goldSummary.spending,
        net: this.goldSummary.net,
        bySource: Object.fromEntries(
          Object.entries(this.goldSummary.bySource).map(([source, totals]) => [source, { ...totals }]),
        ),
      },
      droppedEventCount: this.droppedEventCount,
      maxRetainedEvents: MAX_RETAINED_EVENTS,
    };
  }

  download(): void {
    if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') {
      throw new Error('PlaytestRecorder.download is only available in a browser');
    }

    const json = JSON.stringify(this.snapshot(), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const objectUrl = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    const timestamp = (this.startedAt ?? new Date().toISOString()).replace(/[:.]/g, '-');

    anchor.href = objectUrl;
    anchor.download = `mineworld-playtest-${timestamp}.json`;
    anchor.style.display = 'none';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();

    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1_000);
  }

  private recordGoldChange(data: Record<string, unknown>): void {
    const amount = data.amount;
    if (typeof amount !== 'number' || !Number.isFinite(amount)) return;

    const source = typeof data.source === 'string' && data.source.length > 0 ? data.source : 'unknown';
    const sourceTotals = this.goldSummary.bySource[source] ?? { income: 0, spending: 0, net: 0 };
    const income = amount > 0 ? amount : 0;
    const spending = amount < 0 ? -amount : 0;

    this.goldSummary.income += income;
    this.goldSummary.spending += spending;
    this.goldSummary.net += amount;
    sourceTotals.income += income;
    sourceTotals.spending += spending;
    sourceTotals.net += amount;
    this.goldSummary.bySource[source] = sourceTotals;
  }
}
