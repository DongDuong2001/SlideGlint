import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ClipboardEvent,
  type ComponentPropsWithoutRef,
  type DragEvent,
} from 'react';
import ReactMarkdown, { type Components } from 'react-markdown';
import { polishCurrentSlideContent } from './lib/polish';
import {
  MAX_RECENT_FILES,
  pushRecentFile,
  removeRecentFile,
  toRecentFileLabel,
} from './lib/recentFiles';
import { getNotesStorageKey, readSlideNotesFromStorage } from './lib/slideNotes';
import {
  countWords,
  extractSlideTitle,
  getSuggestedPdfFileName,
  joinSlides,
  splitSlides,
} from './lib/slides';
import {
  DRAFT_STORAGE_KEY,
  PASTE_HINT_SEEN_KEY,
  PRESENTER_DISPLAY_STORAGE_KEY,
  RECENT_FILES_STORAGE_KEY,
  THEME_STORAGE_KEY,
} from './lib/storageKeys';
import {
  deckTemplates,
  getDeckTemplateById,
  NEW_SLIDE_TEMPLATE,
  themes,
  type DeckTemplateId,
  type ThemeKey,
} from './templates/deckTemplates';
import './App.css';

const presenterDisplayTargets = ['auto', 'display-1', 'display-2'] as const;
type PresenterDisplayTarget = (typeof presenterDisplayTargets)[number];

type PresenterDisplayOption = {
  target: PresenterDisplayTarget;
  label: string;
};

const defaultPresenterDisplayOptions: PresenterDisplayOption[] = [
  { target: 'auto', label: 'Auto (2nd Screen)' },
  { target: 'display-1', label: 'Display 1' },
  { target: 'display-2', label: 'Display 2' },
];

const isPresenterDisplayTarget = (value: string): value is PresenterDisplayTarget => {
  return presenterDisplayTargets.includes(value as PresenterDisplayTarget);
};

const slideCoachTips: string[] = [
  'Start each slide with a conclusion title, not a vague topic.',
  'Keep one idea per slide and use no more than three bullets.',
  'Use --- to separate sections into clean narrative beats.',
  'For code slides, show 6-10 lines and explain one key change.',
  'End each section with a takeaway or decision slide.',
  'Drag slide chips in the outline to quickly reorder your narrative.',
  'Use Polish My Slide to tighten only the current title and bullets.',
  'Insert device images with Add Image to make points visual and memorable.',
  'Paste screenshots directly with Ctrl/Cmd + V to auto-insert slide images.',
];

const resolveMarkdownImageSource = (
  src: string | undefined,
  markdownFilePath?: string,
): string | undefined => {
  void markdownFilePath;

  if (!src) {
    return undefined;
  }

  const trimmed = src.trim();

  if (trimmed.length === 0) {
    return undefined;
  }

  if (/^(https?:|data:|file:|blob:)/i.test(trimmed)) {
    return trimmed;
  }

  return trimmed;
};

const desktopUrlTransform = (url: string): string => {
  const trimmed = url.trim();

  if (/^(?:https?:|mailto:|tel:|data:|file:|blob:)/i.test(trimmed)) {
    return trimmed;
  }

  if (/^(?:\.?\.?\/|#|\?|[A-Za-z0-9_-])/i.test(trimmed)) {
    return trimmed;
  }

  return '';
};

const isLikelyImageFile = (file: File): boolean => {
  if (file.type.startsWith('image/')) {
    return true;
  }

  return /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(file.name);
};

const getClipboardImageName = (mimeType?: string, index = 0): string => {
  const suffix = Date.now() + index;

  switch ((mimeType ?? '').toLowerCase()) {
    case 'image/jpeg':
    case 'image/jpg':
      return `pasted-image-${suffix}.jpg`;
    case 'image/gif':
      return `pasted-image-${suffix}.gif`;
    case 'image/webp':
      return `pasted-image-${suffix}.webp`;
    case 'image/svg+xml':
      return `pasted-image-${suffix}.svg`;
    case 'image/bmp':
      return `pasted-image-${suffix}.bmp`;
    default:
      return `pasted-image-${suffix}.png`;
  }
};

const getDroppedFilePath = (file: File): string | undefined => {
  const withPath = file as File & { path?: string };
  return typeof withPath.path === 'string' && withPath.path.length > 0 ? withPath.path : undefined;
};

const getSlideIndexAtPosition = (source: string, position: number): number => {
  const safePosition = Math.max(0, Math.min(position, source.length));
  const prefix = source.slice(0, safePosition);
  return Math.max(0, prefix.split(/^\s*---\s*$/gm).length - 1);
};

type PresenterSyncState = {
  slides: string[];
  activeSlideIndex: number;
  slideNotes: string[];
  selectedTheme: ThemeKey;
  markdownFilePath?: string;
};

const formatDuration = (totalSeconds: number): string => {
  const safeTotal = Math.max(0, totalSeconds);
  const minutes = Math.floor(safeTotal / 60)
    .toString()
    .padStart(2, '0');
  const seconds = Math.floor(safeTotal % 60)
    .toString()
    .padStart(2, '0');
  return `${minutes}:${seconds}`;
};

type LocalMarkdownImageProps = ComponentPropsWithoutRef<'img'> & {
  markdownFilePath?: string;
  hasDesktopApi: boolean;
};

const LocalMarkdownImage = ({
  src,
  alt,
  markdownFilePath,
  hasDesktopApi,
  ...props
}: LocalMarkdownImageProps) => {
  const sourceValue = typeof src === 'string' ? src : undefined;
  const [resolvedSrc, setResolvedSrc] = useState<string | undefined>(() =>
    resolveMarkdownImageSource(sourceValue, markdownFilePath),
  );

  useEffect(() => {
    const baseSrc = resolveMarkdownImageSource(sourceValue, markdownFilePath);

    setResolvedSrc(baseSrc);

    if (!baseSrc || !hasDesktopApi || /^data:|^https?:|^blob:/i.test(baseSrc)) {
      return;
    }

    let disposed = false;

    void window.slideglint
      .readImageDataUrl({
        src: sourceValue ?? baseSrc,
        markdownFilePath,
      })
      .then((dataUrl) => {
        if (!disposed && dataUrl) {
          setResolvedSrc(dataUrl);
        }
      })
      .catch(() => {
        // Keep the fallback source if conversion fails.
      });

    return () => {
      disposed = true;
    };
  }, [hasDesktopApi, markdownFilePath, sourceValue]);

  if (!resolvedSrc) {
    return null;
  }

  return <img {...props} src={resolvedSrc} alt={alt ?? 'Slide image'} loading="lazy" />;
};

const starterMarkdown = `# SlideGlint

The Developer's Presentation Engine

---

## Live Editor MVP

- Write markdown on the left.
- See instant rendered output on the right.
- Save files locally with Ctrl/Cmd + S.

\`\`\`ts
const pace = 'fast';
console.log(\`Ship with \${pace} feedback loops.\`);
\`\`\`
`;

function App() {
  const isPresenterView = useMemo(() => {
    if (typeof window === 'undefined') {
      return false;
    }

    return new URLSearchParams(window.location.search).get('view') === 'presenter';
  }, []);

  const [markdown, setMarkdown] = useState<string>(starterMarkdown);
  const [renderedMarkdown, setRenderedMarkdown] = useState<string>(starterMarkdown);
  const [activeFilePath, setActiveFilePath] = useState<string | undefined>(undefined);
  const [activeSlideIndex, setActiveSlideIndex] = useState<number>(0);
  const [isPresenterWindowOpen, setIsPresenterWindowOpen] = useState<boolean>(false);
  const [presenterTimerRunning, setPresenterTimerRunning] = useState<boolean>(false);
  const [presenterElapsedSeconds, setPresenterElapsedSeconds] = useState<number>(0);
  const [presenterViewState, setPresenterViewState] = useState<PresenterSyncState>({
    slides: ['# SlideGlint'],
    activeSlideIndex: 0,
    slideNotes: [''],
    selectedTheme: 'modern-serif',
  });
  const [selectedTheme, setSelectedTheme] = useState<ThemeKey>('modern-serif');
  const [selectedDeckTemplateId, setSelectedDeckTemplateId] = useState<DeckTemplateId>('starter');
  const [presenterDisplayTarget, setPresenterDisplayTarget] =
    useState<PresenterDisplayTarget>('auto');
  const [presenterDisplayOptions, setPresenterDisplayOptions] = useState<PresenterDisplayOption[]>(
    defaultPresenterDisplayOptions,
  );
  const [showTips, setShowTips] = useState<boolean>(true);
  const [recentFiles, setRecentFiles] = useState<string[]>([]);
  const [isRecentMenuOpen, setIsRecentMenuOpen] = useState<boolean>(false);
  const [presenterNotesQuery, setPresenterNotesQuery] = useState<string>('');
  const [isFocusPreview, setIsFocusPreview] = useState<boolean>(false);
  const [isEditorDragOver, setIsEditorDragOver] = useState<boolean>(false);
  const [showPasteHint, setShowPasteHint] = useState<boolean>(false);
  const [slideNotes, setSlideNotes] = useState<string[]>(() =>
    Array.from({ length: splitSlides(starterMarkdown).length }, () => ''),
  );
  const [status, setStatus] = useState<string>('Unsaved draft');

  const lastPersistedContentRef = useRef<string>(starterMarkdown);
  const hasSeenPasteHintRef = useRef<boolean>(false);
  const editorTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const recentMenuRef = useRef<HTMLDivElement | null>(null);
  const dragFromIndexRef = useRef<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const hasDesktopApi = typeof window !== 'undefined' && typeof window.slideglint !== 'undefined';
  const slides = useMemo(() => splitSlides(renderedMarkdown), [renderedMarkdown]);
  const slideOutline = useMemo(
    () =>
      slides.map((slide, index) => ({
        title: extractSlideTitle(slide, index),
      })),
    [slides],
  );
  const totalWords = useMemo(() => countWords(renderedMarkdown), [renderedMarkdown]);
  const estimatedMinutes = useMemo(() => Math.max(1, Math.ceil(totalWords / 130)), [totalWords]);
  const notesCount = useMemo(
    () => slideNotes.filter((note) => note.trim().length > 0).length,
    [slideNotes],
  );
  const selectedThemeLabel = useMemo(
    () => themes.find((theme) => theme.key === selectedTheme)?.label ?? 'Theme',
    [selectedTheme],
  );
  const presenterDisplayLabel = useMemo(
    () =>
      presenterDisplayOptions.find((option) => option.target === presenterDisplayTarget)?.label ??
      'Auto (2nd Screen)',
    [presenterDisplayOptions, presenterDisplayTarget],
  );
  const selectedDeckTemplate = useMemo(
    () => getDeckTemplateById(selectedDeckTemplateId),
    [selectedDeckTemplateId],
  );
  const presenterNoteMatches = useMemo(() => {
    const query = presenterNotesQuery.trim().toLowerCase();

    if (query.length === 0) {
      return [];
    }

    return slides
      .map((slide, index) => {
        const note = slideNotes[index] ?? '';
        const title = slideOutline[index]?.title ?? `Slide ${index + 1}`;
        const haystack = `${title} ${slide} ${note}`.toLowerCase();

        if (!haystack.includes(query)) {
          return null;
        }

        return {
          index,
          title,
          note,
        };
      })
      .filter((entry): entry is { index: number; title: string; note: string } => entry !== null)
      .slice(0, 8);
  }, [presenterNotesQuery, slideNotes, slideOutline, slides]);
  const hasUnsavedChanges = useMemo(
    () => Boolean(activeFilePath) && markdown !== lastPersistedContentRef.current,
    [activeFilePath, markdown],
  );
  const currentSlideNote = slideNotes[activeSlideIndex] ?? '';
  const nextSlideTitle = slideOutline[activeSlideIndex + 1]?.title ?? 'End of deck';
  const formattedPresenterTimer = useMemo(
    () => formatDuration(presenterElapsedSeconds),
    [presenterElapsedSeconds],
  );
  const markdownFilePathForRender = isPresenterView
    ? presenterViewState.markdownFilePath
    : activeFilePath;
  const markdownComponents = useMemo<Components>(
    () => ({
      img: ({ src, alt, ...props }) => {
        return (
          <LocalMarkdownImage
            {...props}
            src={typeof src === 'string' ? src : undefined}
            alt={alt ?? 'Slide image'}
            markdownFilePath={markdownFilePathForRender}
            hasDesktopApi={hasDesktopApi}
          />
        );
      },
    }),
    [hasDesktopApi, markdownFilePathForRender],
  );

  const rememberRecentFile = useCallback((filePath: string) => {
    setRecentFiles((currentFiles) => {
      const nextFiles = pushRecentFile(currentFiles, filePath);

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(RECENT_FILES_STORAGE_KEY, JSON.stringify(nextFiles));
      }

      return nextFiles;
    });
  }, []);

  const forgetRecentFile = useCallback((filePath: string) => {
    setRecentFiles((currentFiles) => {
      const nextFiles = removeRecentFile(currentFiles, filePath);

      if (typeof window !== 'undefined') {
        window.localStorage.setItem(RECENT_FILES_STORAGE_KEY, JSON.stringify(nextFiles));
      }

      return nextFiles;
    });
  }, []);

  const confirmDiscardUnsavedChanges = useCallback((): boolean => {
    if (!hasUnsavedChanges || typeof window === 'undefined') {
      return true;
    }

    return window.confirm('You have unsaved file changes. Continue and discard them?');
  }, [hasUnsavedChanges]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    hasSeenPasteHintRef.current = window.localStorage.getItem(PASTE_HINT_SEEN_KEY) === '1';

    const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

    if (savedTheme && themes.some((theme) => theme.key === savedTheme)) {
      setSelectedTheme(savedTheme as ThemeKey);
    }

    const savedPresenterDisplayTarget = window.localStorage.getItem(PRESENTER_DISPLAY_STORAGE_KEY);

    if (savedPresenterDisplayTarget && isPresenterDisplayTarget(savedPresenterDisplayTarget)) {
      setPresenterDisplayTarget(savedPresenterDisplayTarget);
    }

    try {
      const recentRaw = window.localStorage.getItem(RECENT_FILES_STORAGE_KEY);

      if (recentRaw) {
        const parsed: unknown = JSON.parse(recentRaw);

        if (Array.isArray(parsed)) {
          const normalized = parsed
            .filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
            .slice(0, MAX_RECENT_FILES);
          setRecentFiles(normalized);
        }
      }
    } catch {
      setRecentFiles([]);
    }

    const draft = window.localStorage.getItem(DRAFT_STORAGE_KEY);

    const initialContent = draft ?? starterMarkdown;
    setSlideNotes(readSlideNotesFromStorage(undefined, splitSlides(initialContent).length));

    if (draft) {
      setMarkdown(draft);
      setRenderedMarkdown(draft);
      lastPersistedContentRef.current = draft;
      setStatus('Restored autosaved draft');
    }
  }, []);

  useEffect(() => {
    if (!showPasteHint) {
      return;
    }

    const timer = window.setTimeout(() => {
      setShowPasteHint(false);
    }, 5600);

    return () => {
      window.clearTimeout(timer);
    };
  }, [showPasteHint]);

  useEffect(() => {
    if (typeof window === 'undefined' || !hasUnsavedChanges || isPresenterView) {
      return;
    }

    const onBeforeUnload = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', onBeforeUnload);

    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [hasUnsavedChanges, isPresenterView]);

  useEffect(() => {
    if (!isRecentMenuOpen || typeof window === 'undefined') {
      return;
    }

    const onPointerDown = (event: PointerEvent): void => {
      const targetNode = event.target as Node | null;

      if (targetNode && recentMenuRef.current && !recentMenuRef.current.contains(targetNode)) {
        setIsRecentMenuOpen(false);
      }
    };

    window.addEventListener('pointerdown', onPointerDown);

    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
    };
  }, [isRecentMenuOpen]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(THEME_STORAGE_KEY, selectedTheme);
  }, [selectedTheme]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(PRESENTER_DISPLAY_STORAGE_KEY, presenterDisplayTarget);
  }, [presenterDisplayTarget]);

  useEffect(() => {
    if (!hasDesktopApi || isPresenterView) {
      return;
    }

    let disposed = false;

    const applyDisplayOptions = (options: PresenterDisplayOption[]): void => {
      if (disposed || !Array.isArray(options) || options.length === 0) {
        return;
      }

      const normalized = defaultPresenterDisplayOptions.map((fallbackOption) => {
        const incoming = options.find((option) => option.target === fallbackOption.target);

        if (!incoming || typeof incoming.label !== 'string' || incoming.label.trim().length === 0) {
          return fallbackOption;
        }

        return {
          target: fallbackOption.target,
          label: incoming.label.trim(),
        };
      });

      setPresenterDisplayOptions(normalized);
    };

    const loadDisplayOptions = async (): Promise<void> => {
      try {
        const options = await window.slideglint.getPresenterDisplayOptions();
        applyDisplayOptions(options);
      } catch {
        // Keep fallback labels when display metadata is unavailable.
      }
    };

    void loadDisplayOptions();

    const onFocus = () => {
      void loadDisplayOptions();
    };

    window.addEventListener('focus', onFocus);

    return () => {
      disposed = true;
      window.removeEventListener('focus', onFocus);
    };
  }, [hasDesktopApi, isPresenterView]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setRenderedMarkdown(markdown);
    }, 100);

    return () => {
      window.clearTimeout(timer);
    };
  }, [markdown]);

  useEffect(() => {
    setActiveSlideIndex((currentIndex) => Math.min(currentIndex, slides.length - 1));
  }, [slides.length]);

  useEffect(() => {
    setSlideNotes((currentNotes) => {
      if (currentNotes.length === slides.length) {
        return currentNotes;
      }

      return Array.from({ length: slides.length }, (_, index) => currentNotes[index] ?? '');
    });
  }, [slides.length]);

  useEffect(() => {
    if (typeof window === 'undefined' || activeFilePath) {
      return;
    }

    window.localStorage.setItem(DRAFT_STORAGE_KEY, markdown);
  }, [activeFilePath, markdown]);

  useEffect(() => {
    if (typeof window === 'undefined') {
      return;
    }

    window.localStorage.setItem(getNotesStorageKey(activeFilePath), JSON.stringify(slideNotes));
  }, [activeFilePath, slideNotes]);

  useEffect(() => {
    if (!hasDesktopApi || !activeFilePath || markdown === lastPersistedContentRef.current) {
      return;
    }

    const timer = window.setTimeout(async () => {
      try {
        await window.slideglint.writeFile({
          filePath: activeFilePath,
          content: markdown,
        });
        lastPersistedContentRef.current = markdown;
        setStatus(`Auto-saved ${activeFilePath}`);
      } catch {
        setStatus(`Auto-save failed for ${activeFilePath}`);
      }
    }, 900);

    return () => {
      window.clearTimeout(timer);
    };
  }, [activeFilePath, hasDesktopApi, markdown]);

  useEffect(() => {
    if (isPresenterView || !presenterTimerRunning) {
      return;
    }

    const timer = window.setInterval(() => {
      setPresenterElapsedSeconds((current) => current + 1);
    }, 1000);

    return () => {
      window.clearInterval(timer);
    };
  }, [isPresenterView, presenterTimerRunning]);

  const openMarkdownFile = useCallback(async () => {
    if (!hasDesktopApi) {
      setStatus('Desktop file API is unavailable in browser mode.');
      return;
    }

    if (!confirmDiscardUnsavedChanges()) {
      setStatus('Open cancelled');
      return;
    }

    const result = await window.slideglint.openMarkdownFile();

    if (!result) {
      return;
    }

    setMarkdown(result.content);
    setRenderedMarkdown(result.content);
    setActiveFilePath(result.filePath);
    setActiveSlideIndex(0);
    setSlideNotes(readSlideNotesFromStorage(result.filePath, splitSlides(result.content).length));
    lastPersistedContentRef.current = result.content;
    rememberRecentFile(result.filePath);
    setIsRecentMenuOpen(false);
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    window.localStorage.removeItem(getNotesStorageKey(undefined));
    setStatus(`Opened ${result.filePath}`);
  }, [confirmDiscardUnsavedChanges, hasDesktopApi, rememberRecentFile]);

  const saveMarkdownFile = useCallback(async () => {
    if (!hasDesktopApi) {
      setStatus('Desktop file API is unavailable in browser mode.');
      return;
    }

    const result = await window.slideglint.saveMarkdownFile({
      filePath: activeFilePath,
      content: markdown,
    });

    if (!result) {
      setStatus('Save cancelled');
      return;
    }

    if (!activeFilePath) {
      window.localStorage.removeItem(getNotesStorageKey(undefined));
    }

    setActiveFilePath(result.filePath);
    lastPersistedContentRef.current = markdown;
    rememberRecentFile(result.filePath);
    setIsRecentMenuOpen(false);
    window.localStorage.removeItem(DRAFT_STORAGE_KEY);
    setStatus(`Saved ${result.filePath}`);
  }, [activeFilePath, hasDesktopApi, markdown, rememberRecentFile]);

  const createDeckFromTemplate = useCallback(
    (templateId: DeckTemplateId) => {
      if (!confirmDiscardUnsavedChanges()) {
        setStatus('New deck cancelled');
        return;
      }

      const template = getDeckTemplateById(templateId);
      const nextMarkdown = template.markdown.trimEnd();

      setSelectedDeckTemplateId(templateId);
      setMarkdown(nextMarkdown);
      setRenderedMarkdown(nextMarkdown);
      setActiveFilePath(undefined);
      setActiveSlideIndex(0);
      setSlideNotes(readSlideNotesFromStorage(undefined, splitSlides(nextMarkdown).length));
      lastPersistedContentRef.current = nextMarkdown;
      window.localStorage.setItem(DRAFT_STORAGE_KEY, nextMarkdown);
      window.localStorage.removeItem(getNotesStorageKey(undefined));
      setStatus(`Started ${template.label}`);
    },
    [confirmDiscardUnsavedChanges],
  );

  const insertTemplateSlide = useCallback(
    (templateId: DeckTemplateId) => {
      const template = getDeckTemplateById(templateId);
      const templateSlides = splitSlides(template.markdown);

      if (templateSlides.length === 0) {
        setStatus('Template has no slides');
        return;
      }

      const sourceSlides = splitSlides(markdown);
      const insertionIndex = Math.min(activeSlideIndex + 1, sourceSlides.length);
      const templateSlide = templateSlides[0] ?? NEW_SLIDE_TEMPLATE;

      sourceSlides.splice(insertionIndex, 0, templateSlide);

      const nextMarkdown = joinSlides(sourceSlides);
      setMarkdown(nextMarkdown);
      setSlideNotes((currentNotes) => {
        const nextNotes = [...currentNotes];
        nextNotes.splice(insertionIndex, 0, '');
        return nextNotes;
      });
      setActiveSlideIndex(insertionIndex);
      setStatus(`Inserted ${template.label} slide`);
    },
    [activeSlideIndex, markdown],
  );

  const jumpToNotesMatch = useCallback((index: number) => {
    setActiveSlideIndex(index);
    setStatus(`Jumped to slide ${index + 1}`);
  }, []);

  const openRecentFile = useCallback(
    async (filePath: string) => {
      if (!hasDesktopApi) {
        setStatus('Recent file open is unavailable in browser mode.');
        return;
      }

      if (!confirmDiscardUnsavedChanges()) {
        setStatus('Open cancelled');
        return;
      }

      try {
        const content = await window.slideglint.readFile(filePath);
        setMarkdown(content);
        setRenderedMarkdown(content);
        setActiveFilePath(filePath);
        setActiveSlideIndex(0);
        setSlideNotes(readSlideNotesFromStorage(filePath, splitSlides(content).length));
        lastPersistedContentRef.current = content;
        rememberRecentFile(filePath);
        setIsRecentMenuOpen(false);
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
        window.localStorage.removeItem(getNotesStorageKey(undefined));
        setStatus(`Opened ${filePath}`);
      } catch {
        forgetRecentFile(filePath);
        setStatus(`Could not open recent file: ${filePath}`);
      }
    },
    [confirmDiscardUnsavedChanges, forgetRecentFile, hasDesktopApi, rememberRecentFile],
  );

  const insertTextAtCursor = useCallback(
    (text: string, revealInsertedSlide = false) => {
      const editor = editorTextareaRef.current;

      if (!editor) {
        const nextMarkdown = `${markdown}\n${text}`;
        setMarkdown(nextMarkdown);

        if (revealInsertedSlide) {
          setActiveSlideIndex(splitSlides(nextMarkdown).length - 1);
        }

        return;
      }

      const start = editor.selectionStart;
      const end = editor.selectionEnd;

      const nextMarkdown = `${markdown.slice(0, start)}${text}${markdown.slice(end)}`;

      setMarkdown(nextMarkdown);

      if (revealInsertedSlide) {
        setActiveSlideIndex(getSlideIndexAtPosition(nextMarkdown, start + text.length));
      }

      window.requestAnimationFrame(() => {
        editor.focus();
        const nextCursor = start + text.length;
        editor.setSelectionRange(nextCursor, nextCursor);
      });
    },
    [markdown],
  );

  const handleEditorFocus = useCallback(() => {
    if (hasSeenPasteHintRef.current || typeof window === 'undefined') {
      return;
    }

    hasSeenPasteHintRef.current = true;
    window.localStorage.setItem(PASTE_HINT_SEEN_KEY, '1');
    setShowPasteHint(true);
  }, []);

  const resetTipsHints = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.removeItem(PASTE_HINT_SEEN_KEY);
    }

    hasSeenPasteHintRef.current = false;
    setShowTips(true);
    setShowPasteHint(true);
    setStatus('Tips reset. Paste hint is visible again.');
  }, []);

  const importImageFromDevice = useCallback(async () => {
    if (!hasDesktopApi) {
      setStatus('Desktop image import is unavailable in browser mode.');
      return;
    }

    try {
      const result = await window.slideglint.importImage({ markdownFilePath: activeFilePath });

      if (!result) {
        setStatus('Image import cancelled');
        return;
      }

      const imageSnippet = `\n\n![${result.displayName}](${result.markdownPath})\n\n`;
      insertTextAtCursor(imageSnippet, true);
      setStatus(
        result.relativeToDeck
          ? `Inserted image: ${result.markdownPath}`
          : 'Inserted image into draft assets',
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      setStatus(`Image import failed: ${message}`);
    }
  }, [activeFilePath, hasDesktopApi, insertTextAtCursor]);

  const exportSlidesToPdf = useCallback(async () => {
    if (!hasDesktopApi) {
      setStatus('Desktop PDF export is unavailable in browser mode.');
      return;
    }

    try {
      // Allow a short frame for preview updates and image data resolution before printing.
      await new Promise<void>((resolve) => {
        window.setTimeout(() => resolve(), 180);
      });

      const result = await window.slideglint.exportPdf({
        suggestedFileName: getSuggestedPdfFileName(activeFilePath),
      });

      if (!result) {
        setStatus('PDF export cancelled');
        return;
      }

      setStatus(`Exported PDF: ${result.filePath}`);
    } catch {
      setStatus('PDF export failed. Please try again.');
    }
  }, [activeFilePath, hasDesktopApi]);

  const handleEditorDragEnter = useCallback((event: DragEvent<HTMLElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsEditorDragOver(true);
  }, []);

  const handleEditorDragOver = useCallback((event: DragEvent<HTMLElement>) => {
    if (!Array.from(event.dataTransfer.types).includes('Files')) {
      return;
    }

    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleEditorDragLeave = useCallback((event: DragEvent<HTMLElement>) => {
    const nextTarget = event.relatedTarget as Node | null;

    if (nextTarget && event.currentTarget.contains(nextTarget)) {
      return;
    }

    setIsEditorDragOver(false);
  }, []);

  const handleEditorDrop = useCallback(
    async (event: DragEvent<HTMLElement>) => {
      event.preventDefault();
      setIsEditorDragOver(false);

      if (!hasDesktopApi) {
        setStatus('Drag-and-drop image import is unavailable in browser mode.');
        return;
      }

      const droppedFiles = Array.from(event.dataTransfer.files);
      const imageFiles = droppedFiles.filter(isLikelyImageFile);

      if (imageFiles.length === 0) {
        setStatus('Drop image files only (png, jpg, gif, webp, svg, bmp).');
        return;
      }

      const snippets: string[] = [];
      let importedCount = 0;
      let failedCount = 0;

      for (const imageFile of imageFiles) {
        const sourcePath = getDroppedFilePath(imageFile);
        let imported: { displayName: string; markdownPath: string } | null = null;

        try {
          if (sourcePath) {
            imported = await window.slideglint.importImageFromPath({
              sourcePath,
              markdownFilePath: activeFilePath,
            });
          }

          if (!imported) {
            const bytes = Array.from(new Uint8Array(await imageFile.arrayBuffer()));
            imported = await window.slideglint.importImageFromClipboard({
              bytes,
              mimeType: imageFile.type,
              suggestedName: imageFile.name,
              markdownFilePath: activeFilePath,
            });
          }

          if (!imported) {
            failedCount += 1;
            continue;
          }

          snippets.push(`![${imported.displayName}](${imported.markdownPath})`);
          importedCount += 1;
        } catch {
          failedCount += 1;
        }
      }

      if (snippets.length > 0) {
        const markdownBlock = `\n\n${snippets.join('\n\n')}\n\n`;
        insertTextAtCursor(markdownBlock, true);
      }

      if (importedCount > 0 && failedCount === 0) {
        setStatus(`Dropped ${importedCount} image${importedCount === 1 ? '' : 's'} into slides`);
        return;
      }

      if (importedCount > 0 && failedCount > 0) {
        setStatus(`Imported ${importedCount} image(s); ${failedCount} failed`);
        return;
      }

      setStatus('Could not import dropped image files.');
    },
    [activeFilePath, hasDesktopApi, insertTextAtCursor],
  );

  const handleEditorPaste = useCallback(
    async (event: ClipboardEvent<HTMLTextAreaElement>) => {
      const imageItems = Array.from(event.clipboardData.items).filter((item) =>
        item.type.startsWith('image/'),
      );

      if (imageItems.length === 0) {
        return;
      }

      if (!hasDesktopApi) {
        setStatus('Clipboard image paste is unavailable in browser mode.');
        return;
      }

      event.preventDefault();

      const snippets: string[] = [];
      let importedCount = 0;
      let failedCount = 0;

      for (let index = 0; index < imageItems.length; index += 1) {
        const imageItem = imageItems[index];
        const file = imageItem.getAsFile();

        if (!file) {
          failedCount += 1;
          continue;
        }

        try {
          const bytes = Array.from(new Uint8Array(await file.arrayBuffer()));
          const imported = await window.slideglint.importImageFromClipboard({
            bytes,
            mimeType: file.type,
            suggestedName: file.name?.trim() || getClipboardImageName(file.type, index),
            markdownFilePath: activeFilePath,
          });

          if (!imported) {
            failedCount += 1;
            continue;
          }

          snippets.push(`![${imported.displayName}](${imported.markdownPath})`);
          importedCount += 1;
        } catch {
          failedCount += 1;
        }
      }

      if (snippets.length > 0) {
        insertTextAtCursor(`\n\n${snippets.join('\n\n')}\n\n`, true);
      }

      if (importedCount > 0 && failedCount === 0) {
        setStatus(`Pasted ${importedCount} image${importedCount === 1 ? '' : 's'} into slides`);
        return;
      }

      if (importedCount > 0 && failedCount > 0) {
        setStatus(`Pasted ${importedCount} image(s); ${failedCount} failed`);
        return;
      }

      setStatus('No clipboard images were imported.');
    },
    [activeFilePath, hasDesktopApi, insertTextAtCursor],
  );

  const insertSlideAfterCurrent = useCallback(() => {
    const sourceSlides = splitSlides(markdown);
    const insertionIndex = Math.min(activeSlideIndex + 1, sourceSlides.length);

    sourceSlides.splice(insertionIndex, 0, NEW_SLIDE_TEMPLATE);

    const nextMarkdown = joinSlides(sourceSlides);
    setMarkdown(nextMarkdown);
    setSlideNotes((currentNotes) => {
      const nextNotes = [...currentNotes];
      nextNotes.splice(insertionIndex, 0, '');
      return nextNotes;
    });
    setActiveSlideIndex(insertionIndex);
    setStatus(`Inserted slide ${insertionIndex + 1}`);
  }, [activeSlideIndex, markdown]);

  const duplicateCurrentSlide = useCallback(() => {
    const sourceSlides = splitSlides(markdown);
    const duplicateSource = sourceSlides[activeSlideIndex] ?? NEW_SLIDE_TEMPLATE;
    const insertionIndex = Math.min(activeSlideIndex + 1, sourceSlides.length);

    sourceSlides.splice(insertionIndex, 0, duplicateSource);

    const nextMarkdown = joinSlides(sourceSlides);
    setMarkdown(nextMarkdown);
    setSlideNotes((currentNotes) => {
      const nextNotes = [...currentNotes];
      nextNotes.splice(insertionIndex, 0, currentNotes[activeSlideIndex] ?? '');
      return nextNotes;
    });
    setActiveSlideIndex(insertionIndex);
    setStatus(`Duplicated slide ${activeSlideIndex + 1}`);
  }, [activeSlideIndex, markdown]);

  const reorderSlides = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (fromIndex === toIndex) {
        return;
      }

      const sourceSlides = splitSlides(markdown);

      if (
        fromIndex < 0 ||
        toIndex < 0 ||
        fromIndex >= sourceSlides.length ||
        toIndex >= sourceSlides.length
      ) {
        return;
      }

      const [movedSlide] = sourceSlides.splice(fromIndex, 1);
      sourceSlides.splice(toIndex, 0, movedSlide);
      setMarkdown(joinSlides(sourceSlides));

      setSlideNotes((currentNotes) => {
        const paddedNotes = Array.from(
          { length: sourceSlides.length },
          (_, index) => currentNotes[index] ?? '',
        );
        const [movedNote] = paddedNotes.splice(fromIndex, 1);
        paddedNotes.splice(toIndex, 0, movedNote ?? '');
        return paddedNotes;
      });

      setActiveSlideIndex((currentIndex) => {
        if (currentIndex === fromIndex) {
          return toIndex;
        }

        if (fromIndex < currentIndex && currentIndex <= toIndex) {
          return currentIndex - 1;
        }

        if (toIndex <= currentIndex && currentIndex < fromIndex) {
          return currentIndex + 1;
        }

        return currentIndex;
      });

      setStatus(`Moved slide ${fromIndex + 1} to position ${toIndex + 1}`);
    },
    [markdown],
  );

  const handleOutlineDragStart = useCallback((index: number) => {
    dragFromIndexRef.current = index;
    setDragOverIndex(index);
  }, []);

  const handleOutlineDragOver = useCallback(
    (event: DragEvent<HTMLButtonElement>, index: number) => {
      event.preventDefault();

      if (dragOverIndex !== index) {
        setDragOverIndex(index);
      }
    },
    [dragOverIndex],
  );

  const handleOutlineDrop = useCallback(
    (index: number) => {
      const fromIndex = dragFromIndexRef.current;
      dragFromIndexRef.current = null;
      setDragOverIndex(null);

      if (fromIndex === null) {
        return;
      }

      reorderSlides(fromIndex, index);
    },
    [reorderSlides],
  );

  const handleOutlineDragEnd = useCallback(() => {
    dragFromIndexRef.current = null;
    setDragOverIndex(null);
  }, []);

  const polishCurrentSlide = useCallback(() => {
    const sourceSlides = splitSlides(markdown);
    const currentSlide = sourceSlides[activeSlideIndex] ?? '';
    const { nextSlide, didChange } = polishCurrentSlideContent(currentSlide);

    if (!didChange) {
      setStatus(`Slide ${activeSlideIndex + 1} is already clear`);
      return;
    }

    sourceSlides[activeSlideIndex] = nextSlide;
    setMarkdown(joinSlides(sourceSlides));
    setStatus(`Polished slide ${activeSlideIndex + 1}`);
  }, [activeSlideIndex, markdown]);

  const updateActiveSlideNote = useCallback(
    (nextNote: string) => {
      setSlideNotes((currentNotes) => {
        const nextNotes = [...currentNotes];
        nextNotes[activeSlideIndex] = nextNote;
        return nextNotes;
      });
    },
    [activeSlideIndex],
  );

  const goToPreviousSlide = useCallback(() => {
    setActiveSlideIndex((currentIndex) => Math.max(currentIndex - 1, 0));
  }, []);

  const goToNextSlide = useCallback(() => {
    setActiveSlideIndex((currentIndex) => Math.min(currentIndex + 1, slides.length - 1));
  }, [slides.length]);

  const toggleFocusPreview = useCallback(() => {
    setIsFocusPreview((current) => {
      const next = !current;
      setStatus(next ? 'Focus preview enabled' : 'Focus preview disabled');
      return next;
    });
  }, []);

  const createPresenterStatePayload = useCallback(
    (): PresenterSyncState => ({
      slides,
      activeSlideIndex,
      slideNotes,
      selectedTheme,
      markdownFilePath: activeFilePath,
    }),
    [activeFilePath, activeSlideIndex, selectedTheme, slideNotes, slides],
  );

  const openPresenterWindow = useCallback(async () => {
    if (!hasDesktopApi) {
      setStatus('Presenter mode is unavailable in browser mode.');
      return;
    }

    try {
      await window.slideglint.setPresenterDisplayTarget(presenterDisplayTarget);
      await window.slideglint.updatePresenterState(createPresenterStatePayload());
      await window.slideglint.openPresenterWindow();
      setIsPresenterWindowOpen(true);
      setStatus(`Presenter window opened (${presenterDisplayLabel})`);
    } catch {
      setStatus('Unable to open presenter window');
    }
  }, [createPresenterStatePayload, hasDesktopApi, presenterDisplayLabel, presenterDisplayTarget]);

  const handlePresenterDisplayTargetChange = useCallback(
    (nextTarget: PresenterDisplayTarget) => {
      setPresenterDisplayTarget(nextTarget);
      const nextLabel =
        presenterDisplayOptions.find((option) => option.target === nextTarget)?.label ??
        'Auto (2nd Screen)';
      setStatus(`Presenter display target set to ${nextLabel}`);

      if (!hasDesktopApi || isPresenterView) {
        return;
      }

      void window.slideglint.setPresenterDisplayTarget(nextTarget).catch(() => {
        setStatus('Could not update presenter display target.');
      });
    },
    [hasDesktopApi, isPresenterView, presenterDisplayOptions],
  );

  const closePresenterWindow = useCallback(async () => {
    if (!hasDesktopApi) {
      return;
    }

    try {
      await window.slideglint.closePresenterWindow();
      setIsPresenterWindowOpen(false);
      setStatus('Presenter window closed');
    } catch {
      setStatus('Unable to close presenter window');
    }
  }, [hasDesktopApi]);

  const togglePresenterWindow = useCallback(async () => {
    if (isPresenterWindowOpen) {
      await closePresenterWindow();
      return;
    }

    await openPresenterWindow();
  }, [closePresenterWindow, isPresenterWindowOpen, openPresenterWindow]);

  const togglePresenterTimer = useCallback(() => {
    setPresenterTimerRunning((current) => !current);
  }, []);

  const resetPresenterTimer = useCallback(() => {
    setPresenterTimerRunning(false);
    setPresenterElapsedSeconds(0);
  }, []);

  useEffect(() => {
    if (!hasDesktopApi || isPresenterView) {
      return;
    }

    void window.slideglint.updatePresenterState(createPresenterStatePayload()).catch(() => {
      // Keep editing uninterrupted if presenter sync is unavailable.
    });
  }, [createPresenterStatePayload, hasDesktopApi, isPresenterView]);

  useEffect(() => {
    if (!hasDesktopApi || isPresenterView) {
      return;
    }

    void window.slideglint.setPresenterDisplayTarget(presenterDisplayTarget).catch(() => {
      // Keep editing uninterrupted if display targeting sync is unavailable.
    });
  }, [hasDesktopApi, isPresenterView, presenterDisplayTarget]);

  useEffect(() => {
    if (!hasDesktopApi || isPresenterView) {
      return;
    }

    const unsubscribeCommand = window.slideglint.onPresenterCommand((command) => {
      if (command === 'next') {
        goToNextSlide();
        return;
      }

      if (command === 'previous') {
        goToPreviousSlide();
        return;
      }

      if (command === 'close') {
        setIsPresenterWindowOpen(false);
      }
    });

    const unsubscribeClosed = window.slideglint.onPresenterWindowClosed(() => {
      setIsPresenterWindowOpen(false);
      setStatus('Presenter window closed');
    });

    return () => {
      unsubscribeCommand();
      unsubscribeClosed();
    };
  }, [goToNextSlide, goToPreviousSlide, hasDesktopApi, isPresenterView]);

  useEffect(() => {
    if (!hasDesktopApi || !isPresenterView) {
      return;
    }

    let disposed = false;

    const applyState = (state: PresenterSyncState) => {
      if (!disposed) {
        setPresenterViewState(state);
      }
    };

    void window.slideglint
      .getPresenterState()
      .then((state) => applyState(state))
      .catch(() => {
        // Presenter can still listen for live updates.
      });

    const unsubscribeState = window.slideglint.onPresenterState((state) => {
      applyState(state);
    });

    const onPresenterKeyDown = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();

      if (key === 'arrowright' || key === 'pagedown' || key === ' ') {
        event.preventDefault();
        window.slideglint.sendPresenterCommand('next');
      }

      if (key === 'arrowleft' || key === 'pageup') {
        event.preventDefault();
        window.slideglint.sendPresenterCommand('previous');
      }

      if (key === 'escape') {
        event.preventDefault();
        window.slideglint.sendPresenterCommand('close');
      }
    };

    window.addEventListener('keydown', onPresenterKeyDown);

    return () => {
      disposed = true;
      unsubscribeState();
      window.removeEventListener('keydown', onPresenterKeyDown);
    };
  }, [hasDesktopApi, isPresenterView]);

  useEffect(() => {
    if (isPresenterView) {
      return;
    }

    const onKeyDown = (event: KeyboardEvent): void => {
      const key = event.key.toLowerCase();
      const targetElement = event.target instanceof HTMLElement ? event.target : null;
      const isEditableTarget =
        targetElement instanceof HTMLTextAreaElement ||
        targetElement instanceof HTMLInputElement ||
        targetElement?.tagName === 'SELECT' ||
        targetElement?.isContentEditable === true;

      if (key === 'escape' && isRecentMenuOpen) {
        setIsRecentMenuOpen(false);
      }

      if (event.ctrlKey || event.metaKey) {
        if (key === 's') {
          event.preventDefault();
          void saveMarkdownFile();
        }

        if (key === 'o') {
          event.preventDefault();
          void openMarkdownFile();
        }

        if (key === 'e') {
          event.preventDefault();
          void exportSlidesToPdf();
        }

        if (key === 'i') {
          event.preventDefault();
          void importImageFromDevice();
        }

        if (key === 'enter') {
          event.preventDefault();
          insertSlideAfterCurrent();
        }

        if (key === 'd') {
          event.preventDefault();
          duplicateCurrentSlide();
        }

        if (key === 'l' && event.shiftKey) {
          event.preventDefault();
          polishCurrentSlide();
        }

        if (key === 'p' && event.shiftKey) {
          event.preventDefault();
          void togglePresenterWindow();
        }

        if (key === 'p' && !event.shiftKey) {
          event.preventDefault();
          toggleFocusPreview();
        }

        if (key === '/') {
          event.preventDefault();
          setShowTips((current) => !current);
        }

        return;
      }

      if (isEditableTarget) {
        return;
      }

      if (key === 'arrowleft' || key === 'pageup') {
        event.preventDefault();
        goToPreviousSlide();
      }

      if (key === 'arrowright' || key === 'pagedown') {
        event.preventDefault();
        goToNextSlide();
      }
    };

    window.addEventListener('keydown', onKeyDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [
    duplicateCurrentSlide,
    exportSlidesToPdf,
    goToNextSlide,
    goToPreviousSlide,
    importImageFromDevice,
    insertSlideAfterCurrent,
    isPresenterView,
    openMarkdownFile,
    polishCurrentSlide,
    saveMarkdownFile,
    togglePresenterWindow,
    toggleFocusPreview,
    isRecentMenuOpen,
  ]);

  if (isPresenterView) {
    const presenterSlides =
      presenterViewState.slides.length > 0 ? presenterViewState.slides : ['# SlideGlint'];
    const presenterIndex = Math.min(
      Math.max(0, presenterViewState.activeSlideIndex),
      presenterSlides.length - 1,
    );

    return (
      <div className={`app-shell presenter-root theme-${presenterViewState.selectedTheme}`}>
        <article className="presenter-slide-shell" role="presentation">
          <div className="presenter-slide-inner">
            <ReactMarkdown components={markdownComponents} urlTransform={desktopUrlTransform}>
              {presenterSlides[presenterIndex]}
            </ReactMarkdown>
          </div>
        </article>
        <footer className="presenter-footer">
          <span>
            Slide {presenterIndex + 1} / {presenterSlides.length}
          </span>
        </footer>
      </div>
    );
  }

  return (
    <div className={`app-shell theme-${selectedTheme}`}>
      <header className="topbar">
        <div>
          <h1>SlideGlint</h1>
          <p>The Developer&apos;s Presentation Engine</p>
          {hasUnsavedChanges && <span className="dirty-indicator">Unsaved changes</span>}
        </div>
        <div className="toolbar">
          <div className="recent-menu" ref={recentMenuRef}>
            <button
              type="button"
              className="btn-recent"
              onClick={() => setIsRecentMenuOpen((current) => !current)}
              disabled={!hasDesktopApi || recentFiles.length === 0}
              aria-haspopup="menu"
            >
              Recent
            </button>
            {isRecentMenuOpen && recentFiles.length > 0 && (
              <div className="recent-popover" role="menu" aria-label="Recent files">
                {recentFiles.map((filePath) => (
                  <button
                    key={filePath}
                    type="button"
                    className="recent-file-item"
                    role="menuitem"
                    title={filePath}
                    onClick={() => void openRecentFile(filePath)}
                  >
                    {toRecentFileLabel(filePath)}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button
            type="button"
            className="btn-presenter-window"
            onClick={() => void togglePresenterWindow()}
          >
            {isPresenterWindowOpen ? 'Close Presenter' : 'Open Presenter'}
          </button>
          <button type="button" className="btn-present" onClick={toggleFocusPreview}>
            {isFocusPreview ? 'Exit Focus' : 'Focus'}
          </button>
          <button type="button" className="btn-reset" onClick={resetTipsHints}>
            Reset Tips
          </button>
          <button type="button" className="btn-export" onClick={() => void exportSlidesToPdf()}>
            Export PDF
          </button>
          <button
            type="button"
            className="btn-new-deck"
            onClick={() => createDeckFromTemplate(selectedDeckTemplateId)}
          >
            New Deck
          </button>
          <button type="button" className="btn-open" onClick={() => void openMarkdownFile()}>
            Open
          </button>
          <button type="button" className="btn-save" onClick={() => void saveMarkdownFile()}>
            Save
          </button>
        </div>
      </header>

      <main className={`workspace${isFocusPreview ? ' focus-preview' : ''}`}>
        {!isFocusPreview && (
          <section
            className={`pane editor-pane${isEditorDragOver ? ' drag-over' : ''}`}
            onDragEnter={handleEditorDragEnter}
            onDragOver={handleEditorDragOver}
            onDragLeave={handleEditorDragLeave}
            onDrop={(event) => void handleEditorDrop(event)}
          >
            <div className="pane-header editor-header">
              <span>Markdown Source</span>
              <span>
                {totalWords} words · {slides.length} slides
              </span>
            </div>
            <div className="editor-actions">
              <button type="button" className="editor-action" onClick={insertSlideAfterCurrent}>
                Add Slide
              </button>
              <button type="button" className="editor-action" onClick={duplicateCurrentSlide}>
                Duplicate
              </button>
              <label
                htmlFor="template-select"
                className="template-control"
                title={selectedDeckTemplate.description}
              >
                Template
                <select
                  id="template-select"
                  className="template-select"
                  value={selectedDeckTemplateId}
                  onChange={(event) =>
                    setSelectedDeckTemplateId(event.target.value as DeckTemplateId)
                  }
                >
                  {deckTemplates.map((template) => (
                    <option key={template.id} value={template.id}>
                      {template.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="editor-action"
                onClick={() => insertTemplateSlide(selectedDeckTemplateId)}
              >
                Insert Template
              </button>
              <button
                type="button"
                className="editor-action"
                onClick={() => void importImageFromDevice()}
              >
                Add Image
              </button>
              <button type="button" className="editor-action emphasis" onClick={polishCurrentSlide}>
                Polish My Slide
              </button>
              <label htmlFor="theme-select" className="theme-control">
                Theme
                <select
                  id="theme-select"
                  className="theme-select"
                  value={selectedTheme}
                  onChange={(event) => setSelectedTheme(event.target.value as ThemeKey)}
                >
                  {themes.map((theme) => (
                    <option key={theme.key} value={theme.key}>
                      {theme.label}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="editor-action ghost"
                onClick={() => setShowTips((current) => !current)}
              >
                {showTips ? 'Hide Tips' : 'Show Tips'}
              </button>
            </div>

            <aside
              className={`slide-coach${showTips ? '' : ' collapsed'}`}
              aria-label="Slide writing coach"
            >
              <h3>Slide Coach</h3>
              <ul>
                {slideCoachTips.map((tip) => (
                  <li key={tip}>{tip}</li>
                ))}
              </ul>
            </aside>

            <textarea
              ref={editorTextareaRef}
              value={markdown}
              onChange={(event) => setMarkdown(event.target.value)}
              onFocus={handleEditorFocus}
              onPaste={(event) => void handleEditorPaste(event)}
              spellCheck={false}
              className="editor"
              aria-label="Markdown editor"
            />

            {showPasteHint && (
              <div className="paste-hint-toast" role="status" aria-live="polite">
                <span>Tip: Paste screenshots with Ctrl/Cmd + V.</span>
                <button
                  type="button"
                  className="paste-hint-close"
                  onClick={() => setShowPasteHint(false)}
                >
                  Got it
                </button>
              </div>
            )}
          </section>
        )}

        <section className="pane preview-pane">
          <div className="pane-header preview-header">
            <span>Presentation Preview</span>
            <span>
              {selectedThemeLabel} · Slide {activeSlideIndex + 1} / {slides.length}
            </span>
          </div>
          <nav className="slide-outline" aria-label="Slide outline">
            {slideOutline.map((slide, index) => (
              <button
                type="button"
                key={`${slide.title}-${index}`}
                className={`outline-chip${index === activeSlideIndex ? ' active' : ''}${
                  dragOverIndex === index && dragFromIndexRef.current !== index
                    ? ' drop-target'
                    : ''
                }`}
                onClick={() => setActiveSlideIndex(index)}
                draggable={slides.length > 1}
                onDragStart={() => handleOutlineDragStart(index)}
                onDragOver={(event) => handleOutlineDragOver(event, index)}
                onDrop={() => handleOutlineDrop(index)}
                onDragEnd={handleOutlineDragEnd}
              >
                <span className="outline-index">{index + 1}</span>
                <span className="outline-title">{slide.title}</span>
              </button>
            ))}
          </nav>
          <div className="slide-stage">
            <article className="preview-content slide-card">
              <ReactMarkdown components={markdownComponents} urlTransform={desktopUrlTransform}>
                {slides[activeSlideIndex]}
              </ReactMarkdown>
            </article>
          </div>
          <div className="slide-controls">
            <button
              type="button"
              className="slide-nav"
              onClick={goToPreviousSlide}
              disabled={activeSlideIndex === 0}
            >
              Previous
            </button>
            <button
              type="button"
              className="slide-nav"
              onClick={goToNextSlide}
              disabled={activeSlideIndex === slides.length - 1}
            >
              Next
            </button>
          </div>
          <section className="presenter-control-panel" aria-label="Presenter controls">
            <div className="presenter-control-line">
              <strong>Presenter</strong>
              <span>
                {isPresenterWindowOpen ? 'Audience window live' : 'Audience window closed'}
              </span>
            </div>
            <div className="presenter-control-line presenter-display-line">
              <label htmlFor="presenter-display-select" className="presenter-display-label">
                Audience Display
              </label>
              <select
                id="presenter-display-select"
                className="presenter-display-select"
                value={presenterDisplayTarget}
                onChange={(event) =>
                  handlePresenterDisplayTargetChange(event.target.value as PresenterDisplayTarget)
                }
              >
                {presenterDisplayOptions.map((option) => (
                  <option key={option.target} value={option.target}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="presenter-control-line">
              <span>Timer {formattedPresenterTimer}</span>
              <div className="presenter-timer-actions">
                <button type="button" className="slide-nav" onClick={togglePresenterTimer}>
                  {presenterTimerRunning ? 'Pause' : 'Start'}
                </button>
                <button type="button" className="slide-nav" onClick={resetPresenterTimer}>
                  Reset
                </button>
              </div>
            </div>
            <div className="presenter-control-line">
              <span>Next Slide</span>
              <span>{nextSlideTitle}</span>
            </div>
            <div className="presenter-control-line presenter-notes-search-line">
              <label htmlFor="presenter-notes-search" className="presenter-display-label">
                Jump to Notes
              </label>
              <input
                id="presenter-notes-search"
                className="presenter-notes-search"
                type="search"
                value={presenterNotesQuery}
                onChange={(event) => setPresenterNotesQuery(event.target.value)}
                placeholder="Search slides, titles, or notes"
              />
            </div>
            {presenterNoteMatches.length > 0 && (
              <div className="presenter-notes-results" aria-label="Matching slides">
                {presenterNoteMatches.map((entry) => (
                  <button
                    key={`${entry.index}-${entry.title}`}
                    type="button"
                    className={`presenter-note-match${entry.index === activeSlideIndex ? ' active' : ''}`}
                    onClick={() => jumpToNotesMatch(entry.index)}
                  >
                    <span>{entry.title}</span>
                    <small>Slide {entry.index + 1}</small>
                  </button>
                ))}
              </div>
            )}
          </section>
          <section className="notes-panel" aria-label="Presenter notes">
            <div className="notes-header">
              <span>Presenter Notes</span>
              <span>Slide {activeSlideIndex + 1}</span>
            </div>
            <textarea
              className="notes-editor"
              value={currentSlideNote}
              onChange={(event) => updateActiveSlideNote(event.target.value)}
              onBlur={() => setStatus(`Updated notes for slide ${activeSlideIndex + 1}`)}
              placeholder="Add talking points, reminders, timing cues, and transitions for this slide..."
              aria-label="Presenter notes editor"
            />
            <p className="notes-hint">
              Notes are stored locally per slide and ready for Presenter Mode wiring.
            </p>
          </section>
        </section>
      </main>

      <section className="pdf-export-root" aria-hidden="true">
        {slides.map((slide, index) => (
          <article className="pdf-slide" key={`pdf-slide-${index}`}>
            <div className="pdf-slide-inner">
              <ReactMarkdown components={markdownComponents} urlTransform={desktopUrlTransform}>
                {slide}
              </ReactMarkdown>
            </div>
          </article>
        ))}
      </section>

      <footer className="statusbar">
        <span>{status}</span>
        <span>
          {hasUnsavedChanges ? 'Unsaved' : 'Synced'} · {activeFilePath ?? 'Untitled.md'} ·{' '}
          {slides.length} slides · {notesCount} notes · ~{estimatedMinutes} min talk · Auto-save{' '}
          {activeFilePath ? 'file' : 'draft'}
        </span>
      </footer>
    </div>
  );
}

export default App;
