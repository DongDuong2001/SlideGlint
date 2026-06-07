import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  isPathInside,
  MAX_CLIPBOARD_IMAGE_BYTES,
  requireClipboardImageBytes,
  requireImageFilePath,
  requireMarkdownFilePath,
} from '../electron/ipcValidation';

describe('IPC validation', () => {
  it('accepts only Markdown file extensions', () => {
    expect(requireMarkdownFilePath('deck.MARKDOWN')).toBe('deck.MARKDOWN');
    expect(() => requireMarkdownFilePath('secrets.txt')).toThrow(/Markdown file/);
  });

  it('accepts only supported image extensions', () => {
    expect(requireImageFilePath('diagram.PNG')).toBe('diagram.PNG');
    expect(() => requireImageFilePath('payload.exe')).toThrow(/supported image/);
  });

  it('validates clipboard bytes and size', () => {
    expect(requireClipboardImageBytes([0, 127, 255])).toEqual([0, 127, 255]);
    expect(() => requireClipboardImageBytes([256])).toThrow(/invalid byte/);
    expect(() =>
      requireClipboardImageBytes(new Array(MAX_CLIPBOARD_IMAGE_BYTES + 1).fill(0)),
    ).toThrow(/15 MB/);
  });

  it('detects paths that escape an allowed root', () => {
    const root = path.resolve('deck');

    expect(isPathInside(root, path.join(root, 'assets', 'image.png'))).toBe(true);
    expect(isPathInside(root, path.resolve(root, '..', 'secret.png'))).toBe(false);
  });
});
