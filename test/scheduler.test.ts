import { describe, it, expect } from 'vitest';
import { computeReminderDate } from '../src/scheduler/scheduler.js';

describe('computeReminderDate', () => {
  it('schedules N days BEFORE the end date, not N days from now', () => {
    const reminderDate = computeReminderDate('2026-08-01T00:00:00Z', 3);
    expect(reminderDate.toISOString().slice(0, 10)).toBe('2026-07-29');
  });

  it('handles zero days (remind on the end date itself)', () => {
    const reminderDate = computeReminderDate('2026-08-01T00:00:00Z', 0);
    expect(reminderDate.toISOString().slice(0, 10)).toBe('2026-08-01');
  });
});
