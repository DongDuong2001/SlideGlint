import { app, BrowserWindow, dialog, ipcMain, screen, type Display, type IpcMainInvokeEvent } from 'electron';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

type SavePayload = {
  filePath?: string;
  content: string;
};

type PdfExportPayload = {
  suggestedFileName?: string;
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

let mainWindow: BrowserWindow | null = null;
let presenterWindow: BrowserWindow | null = null;

let presenterState: PresenterStatePayload = {
  slides: ['# SlideGlint'],
  activeSlideIndex: 0,
  slideNotes: [''],
  selectedTheme: 'modern-serif',
};

let presenterDisplayTarget: PresenterDisplayTarget = 'auto';

const isDev = Boolean(process.env.VITE_DEV_SERVER_URL);

const sanitizeBaseName = (value: string): string => {
  const cleaned = value
    .trim()
    .replace(/[^a-zA-Z0-9._-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|[-.]+$/g, '');

  return cleaned.length > 0 ? cleaned : 'image';
};

const ensureUniqueFilePath = async (targetPath: string): Promise<string> => {
  const parsed = path.parse(targetPath);
  let candidate = targetPath;
  let suffix = 1;

  while (true) {
    try {
      await fs.access(candidate);
      candidate = path.join(parsed.dir, `${parsed.name}-${suffix}${parsed.ext}`);
      suffix += 1;
    } catch {
      return candidate;
    }
  }
};

const toSuggestedPdfFileName = (fileName?: string): string => {
  if (!fileName || fileName.trim().length === 0) {
    return 'slides.pdf';
  }

  const trimmed = fileName.trim();
  return trimmed.toLowerCase().endsWith('.pdf') ? trimmed : `${trimmed}.pdf`;
};

const normalizePresenterState = (nextState: PresenterStatePayload): PresenterStatePayload => {
  const normalizedSlides =
    Array.isArray(nextState.slides) && nextState.slides.length > 0 ? nextState.slides : [''];

  const normalizedNotes = Array.from({ length: normalizedSlides.length }, (_, index) => {
    const note = nextState.slideNotes?.[index];
    return typeof note === 'string' ? note : '';
  });

  const maxIndex = Math.max(0, normalizedSlides.length - 1);
  const clampedIndex = Math.min(Math.max(0, nextState.activeSlideIndex ?? 0), maxIndex);

  return {
    slides: normalizedSlides,
    slideNotes: normalizedNotes,
    activeSlideIndex: clampedIndex,
    selectedTheme: nextState.selectedTheme,
    markdownFilePath: nextState.markdownFilePath,
  };
};

const sendPresenterStateToAudience = (): void => {
  if (presenterWindow && !presenterWindow.isDestroyed()) {
    presenterWindow.webContents.send('presenter:state', presenterState);
  }
};

const notifyControlWindow = (channel: string, payload?: unknown): void => {
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  if (typeof payload === 'undefined') {
    mainWindow.webContents.send(channel);
    return;
  }

  mainWindow.webContents.send(channel, payload);
};

const getControlDisplay = (): Display => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    return screen.getDisplayMatching(mainWindow.getBounds());
  }

  return screen.getPrimaryDisplay();
};

const getOrderedDisplays = (): Display[] => {
  return screen
    .getAllDisplays()
    .slice()
    .sort((left, right) => left.bounds.x - right.bounds.x || left.bounds.y - right.bounds.y);
};

const getDisplayName = (display: Display): string | null => {
  const withLabel = display as Display & { label?: string };
  const label = typeof withLabel.label === 'string' ? withLabel.label.trim() : '';

  if (label.length > 0) {
    return label;
  }

  if (display.internal) {
    return 'Built-in';
  }

  return null;
};

const formatDisplayLabel = (slotNumber: number, display?: Display): string => {
  if (!display) {
    return `Display ${slotNumber} - Not Connected`;
  }

  const resolution = `${display.size.width}x${display.size.height}`;
  const name = getDisplayName(display);

  if (name) {
    return `Display ${slotNumber} (${name}) - ${resolution}`;
  }

  return `Display ${slotNumber} - ${resolution}`;
};

const getPresenterDisplayOptions = (): PresenterDisplayOption[] => {
  const displays = getOrderedDisplays();

  return [
    { target: 'auto', label: 'Auto (2nd Screen)' },
    { target: 'display-1', label: formatDisplayLabel(1, displays[0]) },
    { target: 'display-2', label: formatDisplayLabel(2, displays[1]) },
  ];
};

const getForcedDisplayTarget = (): Display | null => {
  if (presenterDisplayTarget === 'auto') {
    return null;
  }

  const displays = getOrderedDisplays();
  const targetIndex = presenterDisplayTarget === 'display-1' ? 0 : 1;

  return displays[targetIndex] ?? null;
};

const getPresenterTargetDisplay = (): Display => {
  const controlDisplay = getControlDisplay();
  const forcedDisplay = getForcedDisplayTarget();

  if (forcedDisplay) {
    return forcedDisplay;
  }

  const displays = getOrderedDisplays();

  if (displays.length <= 1) {
    return controlDisplay;
  }

  const secondaryDisplay = displays.find((display) => display.id !== controlDisplay.id);

  return secondaryDisplay ?? controlDisplay;
};

const placeWindowOnDisplay = (window: BrowserWindow, targetDisplay: Display): void => {
  const { x, y, width, height } = targetDisplay.workArea;
  window.setBounds({ x, y, width, height });
};

const imageMimeTypes: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.bmp': 'image/bmp',
};

const mimeTypeToExtension: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/bmp': '.bmp',
};

const extensionFromMimeType = (mimeType?: string): string => {
  if (!mimeType) {
    return '.png';
  }

  return mimeTypeToExtension[mimeType.toLowerCase()] ?? '.png';
};

const resolveLocalImagePath = (src: string, markdownFilePath?: string): string | null => {
  const trimmed = src.trim();

  if (trimmed.length === 0 || /^data:|^https?:|^blob:/i.test(trimmed)) {
    return null;
  }

  if (/^file:/i.test(trimmed)) {
    try {
      return fileURLToPath(trimmed);
    } catch {
      return null;
    }
  }

  if (path.isAbsolute(trimmed)) {
    return trimmed;
  }

  if (!markdownFilePath) {
    return null;
  }

  return path.resolve(path.dirname(markdownFilePath), trimmed);
};

const toImageDataUrl = async (src: string, markdownFilePath?: string): Promise<string | null> => {
  const localImagePath = resolveLocalImagePath(src, markdownFilePath);

  if (!localImagePath) {
    return null;
  }

  try {
    const ext = path.extname(localImagePath).toLowerCase();
    const mimeType = imageMimeTypes[ext] ?? 'application/octet-stream';
    const buffer = await fs.readFile(localImagePath);
    return `data:${mimeType};base64,${buffer.toString('base64')}`;
  } catch {
    return null;
  }
};

const copyImportedImage = async (
  sourcePath: string,
  markdownFilePath?: string,
): Promise<ImportImageResult> => {
  const sourceParts = path.parse(sourcePath);
  const baseName = sanitizeBaseName(sourceParts.name);
  const ext = sourceParts.ext || '.png';

  if (markdownFilePath) {
    try {
      const deckDirectory = path.dirname(markdownFilePath);
      const assetsDirectory = path.join(deckDirectory, 'assets');

      await fs.mkdir(assetsDirectory, { recursive: true });

      const destinationPath = await ensureUniqueFilePath(path.join(assetsDirectory, `${baseName}${ext}`));
      await fs.copyFile(sourcePath, destinationPath);

      return {
        markdownPath: path.posix.join('assets', path.basename(destinationPath)),
        absolutePath: destinationPath,
        displayName: path.basename(destinationPath),
        relativeToDeck: true,
      };
    } catch {
      // Fall back to draft assets if deck-relative copy fails.
    }
  }

  const draftAssetsDirectory = path.join(app.getPath('userData'), 'draft-assets');
  await fs.mkdir(draftAssetsDirectory, { recursive: true });

  const destinationPath = await ensureUniqueFilePath(path.join(draftAssetsDirectory, `${baseName}${ext}`));
  await fs.copyFile(sourcePath, destinationPath);

  return {
    markdownPath: pathToFileURL(destinationPath).toString(),
    absolutePath: destinationPath,
    displayName: path.basename(destinationPath),
    relativeToDeck: false,
  };
};

const createMainWindow = async (): Promise<void> => {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1080,
    minHeight: 700,
    title: 'SlideGlint',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  mainWindow.on('closed', () => {
    if (presenterWindow && !presenterWindow.isDestroyed()) {
      presenterWindow.close();
    }

    presenterWindow = null;
    mainWindow = null;
  });

  if (isDev) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL as string);
    return;
  }

  await mainWindow.loadFile(path.join(app.getAppPath(), 'dist', 'index.html'));
};

const createPresenterWindow = async (): Promise<void> => {
  const targetDisplay = getPresenterTargetDisplay();

  if (presenterWindow && !presenterWindow.isDestroyed()) {
    placeWindowOnDisplay(presenterWindow, targetDisplay);
    presenterWindow.maximize();
    presenterWindow.focus();
    sendPresenterStateToAudience();
    return;
  }

  presenterWindow = new BrowserWindow({
    x: targetDisplay.workArea.x,
    y: targetDisplay.workArea.y,
    width: targetDisplay.workArea.width,
    height: targetDisplay.workArea.height,
    minWidth: 900,
    minHeight: 600,
    title: 'SlideGlint Presenter',
    autoHideMenuBar: true,
    backgroundColor: '#000000',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  presenterWindow.on('closed', () => {
    presenterWindow = null;
    notifyControlWindow('presenter:windowClosed');
  });

  presenterWindow.once('ready-to-show', () => {
    if (!presenterWindow || presenterWindow.isDestroyed()) {
      return;
    }

    placeWindowOnDisplay(presenterWindow, targetDisplay);
    presenterWindow.show();
    presenterWindow.maximize();
    presenterWindow.focus();
  });

  if (isDev) {
    await presenterWindow.loadURL(`${process.env.VITE_DEV_SERVER_URL as string}?view=presenter`);
  } else {
    const presenterUrl = `${pathToFileURL(path.join(app.getAppPath(), 'dist', 'index.html')).toString()}?view=presenter`;
    await presenterWindow.loadURL(presenterUrl);
  }

  presenterWindow.webContents.once('did-finish-load', () => {
    sendPresenterStateToAudience();
  });
};

const registerIpcHandlers = (): void => {
  ipcMain.removeHandler('fs:readFile');
  ipcMain.removeHandler('fs:writeFile');
  ipcMain.removeHandler('dialog:openMarkdown');
  ipcMain.removeHandler('dialog:saveMarkdown');
  ipcMain.removeHandler('assets:importImage');
  ipcMain.removeHandler('assets:importImageFromPath');
  ipcMain.removeHandler('assets:importImageFromClipboard');
  ipcMain.removeHandler('assets:readImageDataUrl');
  ipcMain.removeHandler('export:pdf');
  ipcMain.removeHandler('presenter:open');
  ipcMain.removeHandler('presenter:close');
  ipcMain.removeHandler('presenter:getState');
  ipcMain.removeHandler('presenter:updateState');
  ipcMain.removeHandler('presenter:setDisplayTarget');
  ipcMain.removeHandler('presenter:getDisplayOptions');
  ipcMain.removeAllListeners('presenter:command');

  ipcMain.handle('fs:readFile', async (_event: IpcMainInvokeEvent, filePath: string) => {
    return fs.readFile(filePath, 'utf-8');
  });

  ipcMain.handle('fs:writeFile', async (_event: IpcMainInvokeEvent, payload: SavePayload) => {
    if (!payload.filePath) {
      throw new Error('A file path is required for fs:writeFile.');
    }

    await fs.writeFile(payload.filePath, payload.content, 'utf-8');
    return true;
  });

  ipcMain.handle('dialog:openMarkdown', async () => {
    if (!mainWindow) {
      return null;
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Open Markdown File',
      properties: ['openFile'],
      filters: [{ name: 'Markdown', extensions: ['md', 'markdown'] }],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    const filePath = result.filePaths[0];
    const content = await fs.readFile(filePath, 'utf-8');

    return {
      filePath,
      content,
    };
  });

  ipcMain.handle('dialog:saveMarkdown', async (_event: IpcMainInvokeEvent, payload: SavePayload) => {
    if (!mainWindow) {
      return null;
    }

    let targetPath = payload.filePath;

    if (!targetPath) {
      const result = await dialog.showSaveDialog(mainWindow, {
        title: 'Save Markdown File',
        defaultPath: 'slides.md',
        filters: [{ name: 'Markdown', extensions: ['md'] }],
      });

      if (result.canceled || !result.filePath) {
        return null;
      }

      targetPath = result.filePath;
    }

    await fs.writeFile(targetPath, payload.content, 'utf-8');

    return {
      filePath: targetPath,
    };
  });

  ipcMain.handle('assets:importImage', async (_event: IpcMainInvokeEvent, payload?: ImportImagePayload) => {
    if (!mainWindow) {
      return null;
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Insert Image Into Slide',
      properties: ['openFile'],
      filters: [
        {
          name: 'Images',
          extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp'],
        },
      ],
    });

    if (result.canceled || result.filePaths.length === 0) {
      return null;
    }

    return copyImportedImage(result.filePaths[0], payload?.markdownFilePath);
  });

  ipcMain.handle(
    'assets:importImageFromPath',
    async (_event: IpcMainInvokeEvent, payload: ImportImageFromPathPayload) => {
      if (!payload?.sourcePath) {
        return null;
      }

      return copyImportedImage(payload.sourcePath, payload.markdownFilePath);
    },
  );

  ipcMain.handle(
    'assets:importImageFromClipboard',
    async (_event: IpcMainInvokeEvent, payload: ImportImageFromClipboardPayload) => {
      if (!payload || !Array.isArray(payload.bytes) || payload.bytes.length === 0) {
        return null;
      }

      const suggestedName = payload.suggestedName?.trim() || `pasted-image-${Date.now()}`;
      const parsedName = path.parse(suggestedName);
      const baseName = sanitizeBaseName(parsedName.name || 'pasted-image');
      const ext = parsedName.ext || extensionFromMimeType(payload.mimeType);

      if (payload.markdownFilePath) {
        const deckDirectory = path.dirname(payload.markdownFilePath);
        const assetsDirectory = path.join(deckDirectory, 'assets');

        await fs.mkdir(assetsDirectory, { recursive: true });

        const destinationPath = await ensureUniqueFilePath(path.join(assetsDirectory, `${baseName}${ext}`));
        await fs.writeFile(destinationPath, Buffer.from(payload.bytes));

        return {
          markdownPath: path.posix.join('assets', path.basename(destinationPath)),
          absolutePath: destinationPath,
          displayName: path.basename(destinationPath),
          relativeToDeck: true,
        };
      }

      const draftAssetsDirectory = path.join(app.getPath('userData'), 'draft-assets');
      await fs.mkdir(draftAssetsDirectory, { recursive: true });

      const destinationPath = await ensureUniqueFilePath(path.join(draftAssetsDirectory, `${baseName}${ext}`));
      await fs.writeFile(destinationPath, Buffer.from(payload.bytes));

      return {
        markdownPath: pathToFileURL(destinationPath).toString(),
        absolutePath: destinationPath,
        displayName: path.basename(destinationPath),
        relativeToDeck: false,
      };
    },
  );

  ipcMain.handle(
    'assets:readImageDataUrl',
    async (_event: IpcMainInvokeEvent, payload: ReadImageDataUrlPayload) => {
      return toImageDataUrl(payload.src, payload.markdownFilePath);
    },
  );

  ipcMain.handle('export:pdf', async (_event: IpcMainInvokeEvent, payload: PdfExportPayload) => {
    if (!mainWindow) {
      return null;
    }

    const suggestedName = toSuggestedPdfFileName(payload?.suggestedFileName);

    const saveResult = await dialog.showSaveDialog(mainWindow, {
      title: 'Export Slides to PDF',
      defaultPath: suggestedName,
      filters: [{ name: 'PDF', extensions: ['pdf'] }],
    });

    if (saveResult.canceled || !saveResult.filePath) {
      return null;
    }

    const pdfBuffer = await mainWindow.webContents.printToPDF({
      printBackground: true,
      preferCSSPageSize: true,
      pageSize: 'A4',
      landscape: true,
    });

    await fs.writeFile(saveResult.filePath, pdfBuffer);

    return {
      filePath: saveResult.filePath,
    };
  });

  ipcMain.handle('presenter:open', async () => {
    await createPresenterWindow();
    return true;
  });

  ipcMain.handle('presenter:close', async () => {
    if (presenterWindow && !presenterWindow.isDestroyed()) {
      presenterWindow.close();
    }

    presenterWindow = null;
    return true;
  });

  ipcMain.handle('presenter:getState', async () => {
    return presenterState;
  });

  ipcMain.handle('presenter:updateState', async (_event: IpcMainInvokeEvent, nextState: PresenterStatePayload) => {
    presenterState = normalizePresenterState(nextState);
    sendPresenterStateToAudience();
    return true;
  });

  ipcMain.handle('presenter:setDisplayTarget', async (_event: IpcMainInvokeEvent, target: PresenterDisplayTarget) => {
    if (target === 'display-1' || target === 'display-2') {
      presenterDisplayTarget = target;
    } else {
      presenterDisplayTarget = 'auto';
    }

    if (presenterWindow && !presenterWindow.isDestroyed()) {
      const targetDisplay = getPresenterTargetDisplay();
      placeWindowOnDisplay(presenterWindow, targetDisplay);
      presenterWindow.maximize();
      presenterWindow.focus();
    }

    return presenterDisplayTarget;
  });

  ipcMain.handle('presenter:getDisplayOptions', async () => {
    return getPresenterDisplayOptions();
  });

  ipcMain.on('presenter:command', (_event, command: PresenterCommand) => {
    if (command === 'close') {
      if (presenterWindow && !presenterWindow.isDestroyed()) {
        presenterWindow.close();
      }

      presenterWindow = null;
      notifyControlWindow('presenter:command', 'close');
      return;
    }

    if (command === 'next' || command === 'previous') {
      notifyControlWindow('presenter:command', command);
    }
  });
};

app.whenReady().then(() => {
  registerIpcHandlers();
  void createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
