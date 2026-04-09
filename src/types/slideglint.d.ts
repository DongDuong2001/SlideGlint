type SlideGlintOpenMarkdownResult = {
  filePath: string;
  content: string;
};

type SlideGlintSaveMarkdownPayload = {
  filePath?: string;
  content: string;
};

type SlideGlintSaveMarkdownResult = {
  filePath: string;
};

type SlideGlintImportImagePayload = {
  markdownFilePath?: string;
};

type SlideGlintImportImageFromPathPayload = {
  sourcePath: string;
  markdownFilePath?: string;
};

type SlideGlintImportImageFromClipboardPayload = {
  bytes: number[];
  mimeType?: string;
  suggestedName?: string;
  markdownFilePath?: string;
};

type SlideGlintImportImageResult = {
  markdownPath: string;
  absolutePath: string;
  displayName: string;
  relativeToDeck: boolean;
};

type SlideGlintReadImageDataUrlPayload = {
  src: string;
  markdownFilePath?: string;
};

type SlideGlintExportPdfPayload = {
  suggestedFileName?: string;
};

type SlideGlintExportPdfResult = {
  filePath: string;
};

type SlideGlintPresenterStatePayload = {
  slides: string[];
  activeSlideIndex: number;
  slideNotes: string[];
  selectedTheme: 'modern-serif' | 'dark-pro' | 'rmit-blue';
  markdownFilePath?: string;
};

type SlideGlintPresenterCommand = 'next' | 'previous' | 'close';

type SlideGlintPresenterDisplayTarget = 'auto' | 'display-1' | 'display-2';

type SlideGlintPresenterDisplayOption = {
  target: SlideGlintPresenterDisplayTarget;
  label: string;
};

interface SlideGlintApi {
  readFile: (filePath: string) => Promise<string>;
  writeFile: (payload: SlideGlintSaveMarkdownPayload) => Promise<boolean>;
  openMarkdownFile: () => Promise<SlideGlintOpenMarkdownResult | null>;
  saveMarkdownFile: (
    payload: SlideGlintSaveMarkdownPayload,
  ) => Promise<SlideGlintSaveMarkdownResult | null>;
  importImage: (
    payload: SlideGlintImportImagePayload,
  ) => Promise<SlideGlintImportImageResult | null>;
  importImageFromPath: (
    payload: SlideGlintImportImageFromPathPayload,
  ) => Promise<SlideGlintImportImageResult | null>;
  importImageFromClipboard: (
    payload: SlideGlintImportImageFromClipboardPayload,
  ) => Promise<SlideGlintImportImageResult | null>;
  readImageDataUrl: (payload: SlideGlintReadImageDataUrlPayload) => Promise<string | null>;
  exportPdf: (payload: SlideGlintExportPdfPayload) => Promise<SlideGlintExportPdfResult | null>;
  openPresenterWindow: () => Promise<boolean>;
  closePresenterWindow: () => Promise<boolean>;
  getPresenterState: () => Promise<SlideGlintPresenterStatePayload>;
  updatePresenterState: (payload: SlideGlintPresenterStatePayload) => Promise<boolean>;
  setPresenterDisplayTarget: (
    target: SlideGlintPresenterDisplayTarget,
  ) => Promise<SlideGlintPresenterDisplayTarget>;
  getPresenterDisplayOptions: () => Promise<SlideGlintPresenterDisplayOption[]>;
  sendPresenterCommand: (command: SlideGlintPresenterCommand) => void;
  onPresenterState: (listener: (payload: SlideGlintPresenterStatePayload) => void) => () => void;
  onPresenterCommand: (listener: (command: SlideGlintPresenterCommand) => void) => () => void;
  onPresenterWindowClosed: (listener: () => void) => () => void;
}

declare global {
  interface Window {
    slideglint: SlideGlintApi;
  }
}

export {};
