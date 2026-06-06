const TITLE_SMALL_WORDS = new Set([
  'a',
  'an',
  'and',
  'as',
  'at',
  'by',
  'for',
  'in',
  'of',
  'on',
  'or',
  'the',
  'to',
  'via',
  'vs',
]);

const toTitleCase = (source: string): string => {
  const words = source
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter((word) => word.length > 0);

  return words
    .map((word, index) => {
      if (index > 0 && TITLE_SMALL_WORDS.has(word)) {
        return word;
      }

      return `${word.charAt(0).toUpperCase()}${word.slice(1)}`;
    })
    .join(' ');
};

const polishTitle = (title: string): string => {
  let cleaned = title
    .replace(/^\s*(overview|intro(?:duction)?|summary|agenda|notes?)\s*:?\s*/i, '')
    .replace(/[.!?\s]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  if (cleaned.length === 0) {
    cleaned = 'Key Takeaway';
  }

  return toTitleCase(cleaned);
};

const polishBullet = (bullet: string): string => {
  const withoutFiller = bullet
    .replace(/^\s*(we\s+will|we\s+can|you\s+can|let'?s|i\s+will)\s+/i, '')
    .replace(/\b(really|very|just|basically|simply|actually|kind\s+of|sort\s+of)\b/gi, '')
    .replace(/\s+/g, ' ')
    .replace(/[;,.!?\s]+$/g, '')
    .trim();

  if (withoutFiller.length === 0) {
    return 'Clarify the key point';
  }

  return `${withoutFiller.charAt(0).toUpperCase()}${withoutFiller.slice(1)}`;
};

export const polishCurrentSlideContent = (
  slide: string,
): { nextSlide: string; didChange: boolean } => {
  const lines = slide.split('\n');
  let changed = false;
  let headingHandled = false;

  const nextLines = lines.map((line) => {
    const headingMatch = line.match(/^(\s{0,3}#{1,6}\s+)(.+)$/);

    if (headingMatch && !headingHandled) {
      headingHandled = true;
      const [, prefix, headingText] = headingMatch;
      const polishedHeading = polishTitle(headingText);

      if (polishedHeading !== headingText.trim()) {
        changed = true;
      }

      return `${prefix}${polishedHeading}`;
    }

    const bulletMatch = line.match(/^(\s*(?:[-*+]|\d+\.)\s+)(.+)$/);

    if (!bulletMatch) {
      return line;
    }

    const [, prefix, bulletText] = bulletMatch;
    const polishedBullet = polishBullet(bulletText);

    if (polishedBullet !== bulletText.trim()) {
      changed = true;
    }

    return `${prefix}${polishedBullet}`;
  });

  return {
    nextSlide: nextLines.join('\n'),
    didChange: changed,
  };
};
