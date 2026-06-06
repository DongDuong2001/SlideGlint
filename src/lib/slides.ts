export const getSuggestedPdfFileName = (filePath?: string): string => {
  if (!filePath) {
    return 'slideglint-deck.pdf';
  }

  const fileName = filePath.split(/[\\/]/).pop() ?? 'slides.md';
  const baseName = fileName.replace(/\.[^.]+$/, '').trim();
  return `${baseName.length > 0 ? baseName : 'slides'}.pdf`;
};

export const splitSlides = (source: string): string[] => {
  const chunks = source
    .split(/^\s*---\s*$/gm)
    .map((chunk) => chunk.trim())
    .filter((chunk) => chunk.length > 0);

  return chunks.length > 0 ? chunks : [''];
};

export const joinSlides = (slides: string[]): string => slides.join('\n\n---\n\n');

export const countWords = (source: string): number => source.match(/[A-Za-z0-9_'-]+/g)?.length ?? 0;

export const extractSlideTitle = (slide: string, index: number): string => {
  const heading = slide.match(/^\s{0,3}#{1,6}\s+(.+)$/m)?.[1]?.trim();

  if (heading) {
    return heading;
  }

  const firstContentLine = slide
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);

  if (!firstContentLine) {
    return `Slide ${index + 1}`;
  }

  return firstContentLine.slice(0, 48);
};
