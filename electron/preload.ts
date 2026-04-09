import { contextBridge, ipcRenderer } from 'electron';

type OpenMarkdownResult = {
  filePath: string;
  content: string;
};

type SaveMarkdownPayload = {
  filePath?: string;
  content: string;
};

type SaveMarkdownResult = {
  filePath: string;
};

type ImportImagePayload = {
  markdownFilePath?: string;
};

type ImportImageFromPathPayload = {
  sourcePath: string;
  markdownFilePath?: string;
};

type ImportImageFromClipboardPayload = {
  bytes: number[];
  mimeType?: string;
  suggestedName?: string;
  markdownFilePath?: string;
};

type ImportImageResult = {
  markdownPath: string;
  absolutePath: string;
  displayName: string;
  relativeToDeck: boolean;
};

type ReadImageDataUrlPayload = {
  src: string;
  markdownFilePath?: string;
};

type ExportPdfPayload = {
  suggestedFileName?: string;
};

type ExportPdfResult = {
  filePath: string;
};

type PresenterStatePayload = {
  slides: string[];
  activeSlideIndex: number;
  slideNotes: string[];
  selectedTheme: 'modern-serif' | 'dark-pro' | 'rmit-blue';
  markdownFilePath?: string;
};

type PresenterCommand = 'next' | 'previous' | 'close';

type PresenterDisplayTarget = 'auto' | 'display-1' | 'display-2';

type PresenterDisplayOption = {
  target: PresenterDisplayTarget;
  label: string;
};

const slideglintApi = {
  readFile: (filePath: string): Promise<string> => ipcRenderer.invoke('fs:readFile', filePath),
  writeFile: (payload: SaveMarkdownPayload): Promise<boolean> =>
    ipcRenderer.invoke('fs:writeFile', payload),
  openMarkdownFile: (): Promise<OpenMarkdownResult | null> =>
    ipcRenderer.invoke('dialog:openMarkdown'),
  saveMarkdownFile: (payload: SaveMarkdownPayload): Promise<SaveMarkdownResult | null> =>
    ipcRenderer.invoke('dialog:saveMarkdown', payload),
  importImage: (payload: ImportImagePayload): Promise<ImportImageResult | null> =>
    ipcRenderer.invoke('assets:importImage', payload),
  importImageFromPath: (payload: ImportImageFromPathPayload): Promise<ImportImageResult | null> =>
    ipcRenderer.invoke('assets:importImageFromPath', payload),
  importImageFromClipboard: (
    payload: ImportImageFromClipboardPayload,
  ): Promise<ImportImageResult | null> => ipcRenderer.invoke('assets:importImageFromClipboard', payload),
  readImageDataUrl: (payload: ReadImageDataUrlPayload): Promise<string | null> =>
    ipcRenderer.invoke('assets:readImageDataUrl', payload),
  exportPdf: (payload: ExportPdfPayload): Promise<ExportPdfResult | null> =>
    ipcRenderer.invoke('export:pdf', payload),
  openPresenterWindow: (): Promise<boolean> => ipcRenderer.invoke('presenter:open'),
  closePresenterWindow: (): Promise<boolean> => ipcRenderer.invoke('presenter:close'),
  getPresenterState: (): Promise<PresenterStatePayload> => ipcRenderer.invoke('presenter:getState'),
  updatePresenterState: (payload: PresenterStatePayload): Promise<boolean> =>
    ipcRenderer.invoke('presenter:updateState', payload),
  setPresenterDisplayTarget: (target: PresenterDisplayTarget): Promise<PresenterDisplayTarget> =>
    ipcRenderer.invoke('presenter:setDisplayTarget', target),
  getPresenterDisplayOptions: (): Promise<PresenterDisplayOption[]> =>
    ipcRenderer.invoke('presenter:getDisplayOptions'),
  sendPresenterCommand: (command: PresenterCommand): void => {
    ipcRenderer.send('presenter:command', command);
  },
  onPresenterState: (listener: (payload: PresenterStatePayload) => void): (() => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, payload: PresenterStatePayload) => {
      listener(payload);
    };

    ipcRenderer.on('presenter:state', wrapped);
    return () => {
      ipcRenderer.removeListener('presenter:state', wrapped);
    };
  },
  onPresenterCommand: (listener: (command: PresenterCommand) => void): (() => void) => {
    const wrapped = (_event: Electron.IpcRendererEvent, command: PresenterCommand) => {
      listener(command);
    };

    ipcRenderer.on('presenter:command', wrapped);
    return () => {
      ipcRenderer.removeListener('presenter:command', wrapped);
    };
  },
  onPresenterWindowClosed: (listener: () => void): (() => void) => {
    const wrapped = () => {
      listener();
    };

    ipcRenderer.on('presenter:windowClosed', wrapped);
    return () => {
      ipcRenderer.removeListener('presenter:windowClosed', wrapped);
    };
  },
};

contextBridge.exposeInMainWorld('slideglint', slideglintApi);
