export const MAX_RECENT_FILES = 8;

export const normalizeFilePath = (filePath: string): string =>
  filePath.replace(/\\/g, '/').toLowerCase();

export const pushRecentFile = (current: string[], filePath: string): string[] => {
  const trimmed = filePath.trim();

  if (trimmed.length === 0) {
    return current;
  }

  const normalized = normalizeFilePath(trimmed);

  return [trimmed, ...current.filter((entry) => normalizeFilePath(entry) !== normalized)].slice(
    0,
    MAX_RECENT_FILES,
  );
};

export const removeRecentFile = (current: string[], filePath: string): string[] => {
  const normalized = normalizeFilePath(filePath);
  return current.filter((entry) => normalizeFilePath(entry) !== normalized);
};

export const toRecentFileLabel = (filePath: string): string => {
  const parts = filePath.split(/[\\/]+/).filter((part) => part.length > 0);

  if (parts.length <= 3) {
    return filePath;
  }

  return `${parts[0]}\\...\\${parts.slice(-2).join('\\')}`;
};
