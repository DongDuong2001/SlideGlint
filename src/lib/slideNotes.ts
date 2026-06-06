export const getNotesStorageKey = (filePath?: string): string =>
  filePath ? `slideglint:notes:${encodeURIComponent(filePath)}` : 'slideglint:notes:draft';

export const readSlideNotesFromStorage = (
  filePath: string | undefined,
  slideCount: number,
): string[] => {
  if (typeof window === 'undefined') {
    return Array.from({ length: slideCount }, () => '');
  }

  try {
    const raw = window.localStorage.getItem(getNotesStorageKey(filePath));

    if (!raw) {
      return Array.from({ length: slideCount }, () => '');
    }

    const parsed: unknown = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      return Array.from({ length: slideCount }, () => '');
    }

    return Array.from({ length: slideCount }, (_, index) => {
      const note = parsed[index];
      return typeof note === 'string' ? note : '';
    });
  } catch {
    return Array.from({ length: slideCount }, () => '');
  }
};
