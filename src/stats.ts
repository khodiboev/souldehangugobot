import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { z } from 'zod';

const storedUser = z.object({ firstSeen: z.string().datetime(), lastSeen: z.string().datetime() });
const storedStats = z.object({ version: z.literal(1), users: z.record(z.string().regex(/^\d+$/), storedUser) });
type StoredStats = z.infer<typeof storedStats>;

export type StatsSnapshot = { total: number; last24Hours: number; last7Days: number; last30Days: number };

export function createStats(file = 'state/users.json') {
  let state: StoredStats = { version: 1, users: {} };
  try {
    state = storedStats.parse(JSON.parse(readFileSync(file, 'utf8')));
  } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error;
  }

  function record(userId: number, at = new Date()) {
    const id = String(userId);
    const now = at.toISOString();
    const existing = state.users[id];
    if (existing?.lastSeen === now) return;
    const nextState: StoredStats = {
      version: 1,
      users: { ...state.users, [id]: { firstSeen: existing?.firstSeen ?? now, lastSeen: now } }
    };
    mkdirSync(dirname(file), { recursive: true });
    const temporary = `${file}.${process.pid}.tmp`;
    writeFileSync(temporary, JSON.stringify(nextState), { mode: 0o600 });
    renameSync(temporary, file);
    state = nextState;
  }

  function snapshot(at = new Date()): StatsSnapshot {
    const now = at.getTime();
    const lastSeen = Object.values(state.users).map(user => new Date(user.lastSeen).getTime());
    const within = (days: number) => lastSeen.filter(time => time <= now && now - time < days * 86400000).length;
    return { total: lastSeen.length, last24Hours: within(1), last7Days: within(7), last30Days: within(30) };
  }

  return { record, snapshot };
}

export type UserStats = ReturnType<typeof createStats>;
