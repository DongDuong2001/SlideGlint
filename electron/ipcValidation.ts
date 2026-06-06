import path from 'node:path';

const MARKDOWN_EXTENSIONS = new Set(['.md', '.markdown']);
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.bmp']);

export const MAX_CLIPBOARD_IMAGE_BYTES = 15 * 1024 * 1024;
export const MAX_IMAGE_FILE_BYTES = 25 * 1024 * 1024;

const requireNonEmptyString = (value: unknown, label: string): string => {
  if (typeof value !== 'string' || value.trim().length === 0) {
    throw new Error(`${label} must be a non-empty string.`);
  }

  return value;
};

export const requireMarkdownFilePath = (value: unknown, label = 'filePath'): string => {
  const filePath = requireNonEmptyString(value, label);

  if (!MARKDOWN_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    throw new Error(`${label} must point to a Markdown file.`);
  }

  return filePath;
};

export const requireImageFilePath = (value: unknown, label = 'sourcePath'): string => {
  const filePath = requireNonEmptyString(value, label);

  if (!IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase())) {
    throw new Error(`${label} must point to a supported image file.`);
  }

  return filePath;
};

export const isSupportedImagePath = (filePath: string): boolean =>
  IMAGE_EXTENSIONS.has(path.extname(filePath).toLowerCase());

export const requireClipboardImageBytes = (value: unknown): number[] => {
  if (!Array.isArray(value) || value.length === 0) {
    throw new Error('Clipboard image bytes are required.');
  }

  if (value.length > MAX_CLIPBOARD_IMAGE_BYTES) {
    throw new Error('Clipboard image exceeds the 15 MB limit.');
  }

  if (value.some((byte) => !Number.isInteger(byte) || byte < 0 || byte > 255)) {
    throw new Error('Clipboard image contains invalid byte values.');
  }

  return value;
};

export const isPathInside = (rootPath: string, candidatePath: string): boolean => {
  const relativePath = path.relative(rootPath, candidatePath);
  return (
    relativePath.length === 0 ||
    (!relativePath.startsWith(`..${path.sep}`) &&
      relativePath !== '..' &&
      !path.isAbsolute(relativePath))
  );
};
