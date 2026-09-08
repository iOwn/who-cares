import { beforeEach, describe, expect, it } from 'vitest';

import { PICKUP_REQUEST_STATES } from '@/domain';
import {
  ANCHOR_DATE,
  absence,
  makeTypicalHousehold,
  pattern,
  resetIdCounter,
} from './factories';

beforeEach(() => {
  resetIdCounter();
});

describe('makeTypicalHousehold', () => {
  it('has two members, one child, and a Mon-Fri pattern from the anchor', () => {
    const graph = makeTypicalHousehold();

    expect(graph.members).toHaveLength(2);
    expect(graph.household.memberIds).toEqual([
      graph.members[0].id,
      graph.members[1].id,
    ]);
    expect(graph.child.householdId).toBe(graph.household.id);

    expect(graph.pattern.versions).toHaveLength(1);
    expect(graph.pattern.versions[0].effectiveFrom).toBe(ANCHOR_DATE);
    expect(graph.pattern.versions[0].weekdays).toEqual([
      'mon',
      'tue',
      'wed',
      'thu',
      'fri',
    ]);

    expect(graph.closures).toEqual([]);
    expect(graph.absences).toEqual([]);
    expect(graph.pickupRequests).toEqual([]);
    expect(graph.assignments).toEqual([]);
  });
});

describe('pattern.versions', () => {
  it('accepts strictly-ascending effectiveFrom dates', () => {
    const p = pattern.versions([
      { weekdays: ['mon', 'wed', 'fri'], effectiveFrom: '2025-01-06' },
      { weekdays: ['mon', 'tue', 'wed', 'thu', 'fri'], effectiveFrom: '2025-03-01' },
    ]);

    expect(p.versions).toHaveLength(2);
  });

  it('throws when effectiveFrom dates are not strictly ascending', () => {
    expect(() =>
      pattern.versions([
        { weekdays: ['mon'], effectiveFrom: '2025-03-01' },
        { weekdays: ['tue'], effectiveFrom: '2025-01-06' },
      ]),
    ).toThrow(/ascending/i);

    expect(() =>
      pattern.versions([
        { weekdays: ['mon'], effectiveFrom: '2025-01-06' },
        { weekdays: ['tue'], effectiveFrom: '2025-01-06' },
      ]),
    ).toThrow(/ascending/i);
  });
});

describe('absence', () => {
  it('normalises { from, to } to an inclusive startDate/endDate range', () => {
    const a = absence({ from: '2025-01-06', to: '2025-01-08' });

    expect(a.startDate).toBe('2025-01-06');
    expect(a.endDate).toBe('2025-01-08');
  });

  it('treats { from, days: 1 } as a single day', () => {
    const a = absence({ from: '2025-01-06', days: 1 });

    expect(a.startDate).toBe('2025-01-06');
    expect(a.endDate).toBe('2025-01-06');
  });

  it('treats { from, days: 3 } as a three-day inclusive range', () => {
    const a = absence({ from: '2025-01-30', days: 3 });

    expect(a.startDate).toBe('2025-01-30');
    expect(a.endDate).toBe('2025-02-01');
  });
});

describe('domain invariants', () => {
  it('enumerates the four pickup-request states', () => {
    expect([...PICKUP_REQUEST_STATES]).toEqual([
      'Open',
      'Accepted',
      'Declined',
      'Withdrawn',
    ]);
  });

  it('models exactly two members per household', () => {
    const graph = makeTypicalHousehold();

    // Household.memberIds is a readonly 2-tuple at the type level; assert the
    // runtime shape the type promises.
    expect(graph.household.memberIds).toHaveLength(2);
  });
});
