import { describe, expect, it } from 'vitest';
import {
  MAX_RECENT_FILES,
  normalizeFilePath,
  pushRecentFile,
  removeRecentFile,
  toRecentFileLabel,
} from '../src/lib/recentFiles';

describe('recent file helpers', () => {
  it('normalizes Windows paths case-insensitively', () => {
    expect(normalizeFilePath('C:\\Decks\\Demo.md')).toBe('c:/decks/demo.md');
  });

  it('moves an existing file to the front without duplicates', () => {
    expect(pushRecentFile(['C:\\Decks\\Demo.md', 'other.md'], 'c:/decks/demo.md')).toEqual([
      'c:/decks/demo.md',
      'other.md',
    ]);
  });

  it('caps the list and ignores blank paths', () => {
    const current = Array.from({ length: MAX_RECENT_FILES }, (_, index) => `deck-${index}.md`);

    expect(pushRecentFile(current, 'new.md')).toHaveLength(MAX_RECENT_FILES);
    expect(pushRecentFile(current, '   ')).toBe(current);
  });

  it('removes matching paths and shortens long labels', () => {
    expect(removeRecentFile(['C:\\Decks\\Demo.md'], 'c:/decks/demo.md')).toEqual([]);
    expect(toRecentFileLabel('C:\\work\\client\\decks\\demo.md')).toBe('C:\\...\\decks\\demo.md');
  });
});
