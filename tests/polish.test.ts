import { describe, expect, it } from 'vitest';
import { polishCurrentSlideContent } from '../src/lib/polish';

describe('polishCurrentSlideContent', () => {
  it('tightens the first heading and bullet copy', () => {
    expect(
      polishCurrentSlideContent(
        '## Overview: shipping faster.\n\n- We will really reduce build times.',
      ),
    ).toEqual({
      nextSlide: '## Shipping Faster\n\n- Reduce build times',
      didChange: true,
    });
  });

  it('leaves already polished content unchanged', () => {
    expect(polishCurrentSlideContent('## Key Takeaway\n\n- Reduce build times')).toEqual({
      nextSlide: '## Key Takeaway\n\n- Reduce build times',
      didChange: false,
    });
  });
});
