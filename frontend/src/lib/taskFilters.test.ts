import { describe, expect, it } from 'vitest';
import { hasActiveFilters, parseTaskFilters, toSearchString } from './taskFilters';

const parse = (query: string) => parseTaskFilters(new URLSearchParams(query));

describe('parseTaskFilters', () => {
  it('reads valid values', () => {
    expect(parse('status=IN_PROGRESS&priority=HIGH&assigneeId=3&search=report&page=2')).toEqual({
      status: 'IN_PROGRESS',
      priority: 'HIGH',
      assigneeId: 3,
      search: 'report',
      page: 2,
    });
  });

  it('defaults to page 1 and no filters', () => {
    expect(parse('')).toEqual({ page: 1 });
  });

  it('ignores invalid values instead of breaking the page', () => {
    expect(parse('status=DONE&priority=URGENT&assigneeId=abc&page=-3&search=')).toEqual({ page: 1 });
    expect(parse('page=0')).toEqual({ page: 1 });
    expect(parse('assigneeId=-1')).toEqual({ page: 1 });
    expect(parse(`search=${'x'.repeat(101)}`)).toEqual({ page: 1 });
  });

  it('trims the search text', () => {
    expect(parse('search=%20%20budget%20%20')).toEqual({ page: 1, search: 'budget' });
  });
});

describe('toSearchString', () => {
  it('omits defaults and empty values', () => {
    expect(toSearchString({ page: 1 })).toBe('');
    expect(toSearchString({ page: 1, status: undefined, search: '' })).toBe('');
  });

  it('round-trips through parse', () => {
    const filters = { status: 'PENDING' as const, priority: 'LOW' as const, assigneeId: 4, search: '100% done', page: 3 };
    expect(parse(toSearchString(filters))).toEqual(filters);
  });
});

describe('hasActiveFilters', () => {
  it('ignores the page number', () => {
    expect(hasActiveFilters({ page: 5 })).toBe(false);
    expect(hasActiveFilters({ page: 1, priority: 'HIGH' })).toBe(true);
    expect(hasActiveFilters({ page: 1, search: 'x' })).toBe(true);
  });
});
