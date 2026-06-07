import { describe, expect, it } from 'vitest';
import {
  countWords,
  extractSlideTitle,
  getSuggestedPdfFileName,
  joinSlides,
  splitSlides,
} from '../src/lib/slides';

describe('slide helpers', () => {
  it('splits and trims markdown slides', () => {
    expect(splitSlides('# One\n\n---\n\n## Two')).toEqual(['# One', '## Two']);
  });

  it('returns one empty slide for empty markdown', () => {
    expect(splitSlides(' \n---\n ')).toEqual(['']);
  });

  it('joins slides with the canonical separator', () => {
    expect(joinSlides(['# One', '## Two'])).toBe('# One\n\n---\n\n## Two');
  });

  it('extracts a heading or a stable fallback title', () => {
    expect(extractSlideTitle('Text\n## Decision', 0)).toBe('Decision');
    expect(extractSlideTitle('First content line', 1)).toBe('First content line');
    expect(extractSlideTitle('', 2)).toBe('Slide 3');
  });

  it('derives PDF names from Windows and POSIX paths', () => {
    expect(getSuggestedPdfFileName()).toBe('slideglint-deck.pdf');
    expect(getSuggestedPdfFileName('C:\\decks\\demo.markdown')).toBe('demo.pdf');
    expect(getSuggestedPdfFileName('/decks/demo.md')).toBe('demo.pdf');
  });

  it('counts words used by the presentation estimate', () => {
    expect(countWords("Ship fast, don't break builds.")).toBe(5);
  });
});
