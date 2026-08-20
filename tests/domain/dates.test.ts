import { afterEach, beforeEach, describe, it, expect } from 'vitest';
import {
  PlainDate,
  toIso,
  fromIso,
  dayOfWeek,
  daysBetween,
  datesOfMonthMatching,
  isoWeekKey,
  monthKey,
  addMonths,
  MONTH_NAMES_ES,
  DAY_NAMES_ES,
} from '../../src/domain/dates';

describe('dates', () => {
  describe('toIso/fromIso roundtrip', () => {
    it('roundtrips single-digit day and month', () => {
      const date: PlainDate = { y: 2026, m: 1, d: 3 };
      const iso = toIso(date);
      expect(iso).toBe('2026-01-03');
      expect(fromIso(iso)).toEqual(date);
    });

    it('roundtrips double-digit day and month', () => {
      const date: PlainDate = { y: 2026, m: 12, d: 25 };
      const iso = toIso(date);
      expect(iso).toBe('2026-12-25');
      expect(fromIso(iso)).toEqual(date);
    });

    it('roundtrips with padding', () => {
      const date: PlainDate = { y: 2026, m: 8, d: 3 };
      const iso = toIso(date);
      expect(iso).toBe('2026-08-03');
      expect(fromIso(iso)).toEqual(date);
    });

    it('handles year 1', () => {
      const date: PlainDate = { y: 1, m: 1, d: 1 };
      const iso = toIso(date);
      expect(iso).toBe('0001-01-01');
      expect(fromIso(iso)).toEqual(date);
    });
  });

  describe('dayOfWeek', () => {
    it('2026-08-03 is Monday (1)', () => {
      const date: PlainDate = { y: 2026, m: 8, d: 3 };
      expect(dayOfWeek(date)).toBe(1);
    });

    it('2026-08-01 is Saturday (6)', () => {
      const date: PlainDate = { y: 2026, m: 8, d: 1 };
      expect(dayOfWeek(date)).toBe(6);
    });

    it('2026-08-02 is Sunday (0)', () => {
      const date: PlainDate = { y: 2026, m: 8, d: 2 };
      expect(dayOfWeek(date)).toBe(0);
    });

    it('0 is Sunday, 6 is Saturday', () => {
      // First Sunday of August 2026
      expect(dayOfWeek({ y: 2026, m: 8, d: 2 })).toBe(0);
      // First Saturday of August 2026
      expect(dayOfWeek({ y: 2026, m: 8, d: 1 })).toBe(6);
    });
  });

  describe('datesOfMonthMatching', () => {
    it('returns Mondays and Saturdays of August 2026', () => {
      const result = datesOfMonthMatching(2026, 8, [1, 6]);
      expect(result.length).toBe(10);
      expect(result.map(d => d.d)).toEqual([
        1, 3, 8, 10, 15, 17, 22, 24, 29, 31,
      ]);
    });

    it('handles month with 5 Mondays and 4 Saturdays', () => {
      // August 2026: 5 Mondays (3, 10, 17, 24, 31), 4 Saturdays (1, 8, 15, 22, 29)
      // Wait, let me count: Aug 1 is Sat, so Saturdays are 1, 8, 15, 22, 29 = 5!
      // Mondays: 3, 10, 17, 24, 31 = 5!
      // So August 2026 has 5 of each.

      // Let's find a month with 5 Mondays and 4 Saturdays
      // September 2026: starts on Tuesday (2nd is Tue)
      // Sep 7 is Monday, so Mondays: 7, 14, 21, 28 = 4
      // Sep 5, 12, 19, 26 would be Saturdays = 4
      // Hmm, let me think... June 2026 starts on Monday
      // June: M 1, 8, 15, 22, 29 = 5; S 6, 13, 20, 27 = 4
      const result = datesOfMonthMatching(2026, 6, [1]);
      const mondays = result.map(d => d.d);
      expect(mondays.length).toBe(5);
      expect(mondays).toEqual([1, 8, 15, 22, 29]);
    });

    it('handles month with 4 Mondays and 5 Saturdays', () => {
      // April 2026: starts on Wednesday
      // Mondays: 6, 13, 20, 27 = 4
      // Saturdays: 4, 11, 18, 25 = 4... wait, that's also 4
      // May 2026: starts on Friday
      // Mondays: 4, 11, 18, 25 = 4
      // Saturdays: 2, 9, 16, 23, 30 = 5
      const result = datesOfMonthMatching(2026, 5, [6]);
      const saturdays = result.map(d => d.d);
      expect(saturdays.length).toBe(5);
      expect(saturdays).toEqual([2, 9, 16, 23, 30]);
    });

    it('February leap year (2032) has 29 days and includes it', () => {
      // 2032 is a leap year
      // 2032-02-01 is a Sunday (verify: 2032 Feb 1, day 32 of year)
      const result = datesOfMonthMatching(2032, 2, [0]);
      const days = result.map(d => d.d);
      expect(days).toContain(29);
      expect(days.length).toBe(5); // 1, 8, 15, 22, 29
    });

    it('February non-leap year (2026) has 28 days, no 29', () => {
      // 2026 is not a leap year
      // 2026-02-01 is a Sunday
      const result = datesOfMonthMatching(2026, 2, [0]);
      const days = result.map(d => d.d);
      expect(days).not.toContain(29);
      expect(Math.max(...days)).toBe(22); // Last Sunday of Feb 2026
    });

    it('month that starts on Monday', () => {
      // June 2026 starts on Monday
      const result = datesOfMonthMatching(2026, 6, [1]);
      expect(result[0].d).toBe(1); // First Monday is the 1st
    });

    it('month that ends on Saturday', () => {
      // May 2026: 31 days, last day is Saturday
      const result = datesOfMonthMatching(2026, 5, [6]);
      expect(result[result.length - 1].d).toBe(30); // Last Saturday
    });

    it('empty daysOfWeek returns empty array', () => {
      const result = datesOfMonthMatching(2026, 8, []);
      expect(result).toEqual([]);
    });

    it('all days of week returns all days of month', () => {
      const result = datesOfMonthMatching(2026, 2, [0, 1, 2, 3, 4, 5, 6]);
      // February 2026 has 28 days
      expect(result.length).toBe(28);
      expect(result[0].d).toBe(1);
      expect(result[result.length - 1].d).toBe(28);
    });
  });

  describe('daysBetween', () => {
    it('same day is 0', () => {
      expect(daysBetween('2026-08-03', '2026-08-03')).toBe(0);
    });

    it('5 days between 2026-08-03 and 2026-08-08', () => {
      expect(daysBetween('2026-08-03', '2026-08-08')).toBe(5);
    });

    it('negative when b is before a', () => {
      expect(daysBetween('2026-08-08', '2026-08-03')).toBe(-5);
    });

    it('crosses end of month', () => {
      expect(daysBetween('2026-08-30', '2026-09-02')).toBe(3);
    });

    it('crosses end of year', () => {
      expect(daysBetween('2026-12-30', '2027-01-02')).toBe(3);
    });

    // This test MUST force a timezone that actually observes DST. The machine
    // running it may well not: Mexico abolished DST in 2022 and CI runs in UTC,
    // so an unforced "DST test" passes for the wrong reason and quietly covers
    // nothing. Under Europe/Madrid the raw millisecond division yields 1.958,
    // not 2 — Math.round is what saves it, and this is the only test that
    // exercises that. With Math.floor it would return 1 and nobody would notice.
    describe('across daylight saving time', () => {
      const originalTz = process.env.TZ;

      beforeEach(() => {
        process.env.TZ = 'Europe/Madrid';
      });

      afterEach(() => {
        if (originalTz === undefined) delete process.env.TZ;
        else process.env.TZ = originalTz;
      });

      it('the forced timezone really is in effect', () => {
        // Guard against this whole block silently going vacuous if Node ever
        // stops honouring a mutated process.env.TZ.
        const beforeChange = new Date(2026, 2, 28).getTimezoneOffset();
        const afterChange = new Date(2026, 2, 30).getTimezoneOffset();
        expect(beforeChange).not.toBe(afterChange);
      });

      it('spring forward: 2026-03-29 loses an hour in Madrid', () => {
        expect(daysBetween('2026-03-28', '2026-03-30')).toBe(2);
        expect(daysBetween('2026-03-29', '2026-03-30')).toBe(1);
      });

      it('fall back: 2026-10-25 gains an hour in Madrid', () => {
        expect(daysBetween('2026-10-24', '2026-10-26')).toBe(2);
        expect(daysBetween('2026-10-25', '2026-10-26')).toBe(1);
      });

      it('a whole month spanning the change still counts exactly', () => {
        expect(daysBetween('2026-03-01', '2026-04-01')).toBe(31);
        expect(daysBetween('2026-10-01', '2026-11-01')).toBe(31);
      });
    });
  });

  describe('monthKey', () => {
    it('returns YYYY-MM format with zero-padding', () => {
      expect(monthKey(2026, 8)).toBe('2026-08');
      expect(monthKey(2026, 1)).toBe('2026-01');
      expect(monthKey(2026, 12)).toBe('2026-12');
    });

    it('lexicographic order matches chronological order', () => {
      expect(monthKey(2026, 2) < monthKey(2026, 10)).toBe(true);
      expect(monthKey(2025, 12) < monthKey(2026, 1)).toBe(true);
      expect(monthKey(2026, 8) < monthKey(2026, 9)).toBe(true);
    });
  });

  describe('addMonths', () => {
    it('adds positive delta', () => {
      const result = addMonths(2026, 6, 3);
      expect(result).toEqual({ year: 2026, month: 9 });
    });

    it('crosses year boundary forward', () => {
      const result = addMonths(2026, 12, 1);
      expect(result).toEqual({ year: 2027, month: 1 });
    });

    it('crosses year boundary backward', () => {
      const result = addMonths(2026, 1, -1);
      expect(result).toEqual({ year: 2025, month: 12 });
    });

    it('delta of 0 returns same month', () => {
      const result = addMonths(2026, 8, 0);
      expect(result).toEqual({ year: 2026, month: 8 });
    });

    it('delta of 12 advances one year', () => {
      const result = addMonths(2026, 6, 12);
      expect(result).toEqual({ year: 2027, month: 6 });
    });

    it('delta of -12 goes back one year', () => {
      const result = addMonths(2026, 6, -12);
      expect(result).toEqual({ year: 2025, month: 6 });
    });

    it('large negative delta', () => {
      const result = addMonths(2026, 1, -13);
      expect(result).toEqual({ year: 2024, month: 12 });
    });

    it('large positive delta', () => {
      const result = addMonths(2026, 1, 24);
      expect(result).toEqual({ year: 2028, month: 1 });
    });
  });

  describe('isoWeekKey', () => {
    it('returns YYYY-Www format', () => {
      // August 3, 2026 (Monday) is in week 32
      const result = isoWeekKey({ y: 2026, m: 8, d: 3 });
      expect(result).toBe('2026-W32');
    });

    it('Monday 3 Aug and Saturday 8 Aug 2026 are in same ISO week', () => {
      // ISO week starts on Monday
      const mondayWeek = isoWeekKey({ y: 2026, m: 8, d: 3 });
      const saturdayWeek = isoWeekKey({ y: 2026, m: 8, d: 8 });
      expect(mondayWeek).toBe(saturdayWeek);
      expect(mondayWeek).toBe('2026-W32');
    });

    it('January 1 on Thursday belongs to week 1', () => {
      // If Jan 1 falls on Thursday, it belongs to ISO week 1
      // 2026-01-01 is a Thursday
      const result = isoWeekKey({ y: 2026, m: 1, d: 1 });
      expect(result).toMatch(/^2026-W01$/);
    });

    it('week boundaries work correctly', () => {
      // Sunday Aug 2, 2026 is end of week 31
      const sunday = isoWeekKey({ y: 2026, m: 8, d: 2 });
      // Monday Aug 3, 2026 is start of week 32
      const monday = isoWeekKey({ y: 2026, m: 8, d: 3 });
      expect(sunday).toBe('2026-W31');
      expect(monday).toBe('2026-W32');
    });
  });

  describe('MONTH_NAMES_ES', () => {
    it('has 12 months', () => {
      expect(MONTH_NAMES_ES.length).toBe(12);
    });

    it('starts with enero and ends with diciembre', () => {
      expect(MONTH_NAMES_ES[0]).toBe('enero');
      expect(MONTH_NAMES_ES[11]).toBe('diciembre');
    });

    it('contains all Spanish month names', () => {
      expect(MONTH_NAMES_ES).toEqual([
        'enero',
        'febrero',
        'marzo',
        'abril',
        'mayo',
        'junio',
        'julio',
        'agosto',
        'septiembre',
        'octubre',
        'noviembre',
        'diciembre',
      ]);
    });
  });

  describe('DAY_NAMES_ES', () => {
    it('has 7 days', () => {
      expect(DAY_NAMES_ES.length).toBe(7);
    });

    it('starts with domingo and follows getDay convention', () => {
      expect(DAY_NAMES_ES[0]).toBe('domingo');
      expect(DAY_NAMES_ES[1]).toBe('lunes');
      expect(DAY_NAMES_ES[6]).toBe('sábado');
    });

    it('contains all Spanish day names', () => {
      expect(DAY_NAMES_ES).toEqual([
        'domingo',
        'lunes',
        'martes',
        'miércoles',
        'jueves',
        'viernes',
        'sábado',
      ]);
    });
  });
});
