export type ThemeKey = 'modern-serif' | 'dark-pro' | 'rmit-blue';

export type DeckTemplateId = 'starter' | 'blank' | 'agenda' | 'code-demo' | 'project-update';

export type DeckTemplate = {
  id: DeckTemplateId;
  label: string;
  description: string;
  markdown: string;
};

export const themes: Array<{ key: ThemeKey; label: string }> = [
  { key: 'modern-serif', label: 'Modern Serif' },
  { key: 'dark-pro', label: 'Dark Pro' },
  { key: 'rmit-blue', label: 'RMIT Blue' },
];

export const deckTemplates: DeckTemplate[] = [
  {
    id: 'starter',
    label: 'Starter Deck',
    description: 'Your current SlideGlint starter story',
    markdown: `# SlideGlint

The Developer's Presentation Engine

---

## Live Editor MVP

- Write markdown on the left.
- See instant rendered output on the right.
- Save files locally with Ctrl/Cmd + S.
`,
  },
  {
    id: 'blank',
    label: 'Blank Deck',
    description: 'Start from an empty slide outline',
    markdown: `# New Deck

---

## Slide 2

- Point one
- Point two
`,
  },
  {
    id: 'agenda',
    label: 'Agenda Deck',
    description: 'A classic meeting or workshop outline',
    markdown: `# Agenda

- Context
- Goals
- Timeline
- Decisions

---

## Today

1. What changed
2. Why it matters
3. What comes next
`,
  },
  {
    id: 'code-demo',
    label: 'Code Demo',
    description: 'A slide structure for implementation walkthroughs',
    markdown: `# Implementation Walkthrough

- Problem
- Approach
- Result

---

## Example

\`\`\`ts
const example = 'SlideGlint';
console.log(example);
\`\`\`
`,
  },
  {
    id: 'project-update',
    label: 'Project Update',
    description: 'For weekly status, risks, and next steps',
    markdown: `# Project Update

- Done
- In progress
- Risks

---

## Next Steps

- Plan
- Build
- Ship
`,
  },
];

export const NEW_SLIDE_TEMPLATE = `## New Slide

- Core message
- Evidence
- Next action`;

export const getDeckTemplateById = (templateId: DeckTemplateId): DeckTemplate =>
  deckTemplates.find((template) => template.id === templateId) ?? deckTemplates[0];
