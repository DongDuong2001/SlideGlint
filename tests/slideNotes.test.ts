import { describe, expect, it } from 'vitest';
import { getNotesStorageKey, readSlideNotesFromStorage } from '../src/lib/slideNotes';

describe('slide note helpers', () => {
  it('builds separate draft and file storage keys', () => {
    expect(getNotesStorageKey()).toBe('slideglint:notes:draft');
    expect(getNotesStorageKey('C:\\Decks\\Demo.md')).toContain(
      encodeURIComponent('C:\\Decks\\Demo.md'),
    );
  });

  it('returns empty notes when browser storage is unavailable', () => {
    expect(readSlideNotesFromStorage(undefined, 3)).toEqual(['', '', '']);
  });
});
