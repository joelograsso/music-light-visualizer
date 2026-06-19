# Next.js Conversion Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Convert the current Vite browser application into a Next.js web application without changing the visualizer behavior.

**Architecture:** Use the Next.js App Router for the document shell and a client-only React component for the visualizer mount point. Move the current top-level browser bootstrap out of `src/main.ts` into an exported `mountVisualizer(stage, ui)` function so Next server rendering never touches `window`, `document`, `AudioContext`, or canvas APIs.

**Tech Stack:** Next.js, React, TypeScript, Vitest, existing Canvas/Web Audio visualizer modules.

---

### Task 1: Define The Migration Contract

**Files:**
- Create: `tests/nextApp.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';

const read = (path: string) => readFileSync(path, 'utf8');

describe('Next.js app conversion', () => {
  it('uses Next.js scripts and dependencies instead of Vite', () => {
    const pkg = JSON.parse(read('package.json'));
    expect(pkg.scripts.dev).toBe('next dev');
    expect(pkg.scripts.build).toBe('next build');
    expect(pkg.scripts.start).toBe('next start');
    expect(pkg.dependencies.next).toBeTruthy();
    expect(pkg.dependencies.react).toBeTruthy();
    expect(pkg.dependencies['react-dom']).toBeTruthy();
    expect(pkg.devDependencies.vite).toBeUndefined();
  });

  it('has a Next App Router shell and client visualizer bootstrap', () => {
    expect(existsSync('app/layout.tsx')).toBe(true);
    expect(existsSync('app/page.tsx')).toBe(true);
    expect(existsSync('src/VisualizerApp.tsx')).toBe(true);
    expect(existsSync('src/visualizer.ts')).toBe(true);
    expect(existsSync('index.html')).toBe(false);
    expect(existsSync('vite.config.ts')).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/nextApp.test.ts`

Expected: fail because package scripts still point at Vite and the Next app files do not exist.

### Task 2: Add The Next Shell

**Files:**
- Create: `app/layout.tsx`
- Create: `app/page.tsx`
- Create: `src/VisualizerApp.tsx`
- Modify: `src/style.css`

- [ ] **Step 1: Create `app/layout.tsx`**

```tsx
import type { Metadata } from 'next';
import '../src/style.css';
import '../src/ui/hud.css';

export const metadata: Metadata = {
  title: 'Music Light Visualizer',
  description: 'A reactive music light visualizer for mic, file, display, and Spotify context.',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
```

- [ ] **Step 2: Create `app/page.tsx`**

```tsx
import { VisualizerApp } from '../src/VisualizerApp';

export default function Page() {
  return <VisualizerApp />;
}
```

- [ ] **Step 3: Create `src/VisualizerApp.tsx`**

```tsx
'use client';

import { useEffect, useRef } from 'react';
import { mountVisualizer } from './visualizer';

export function VisualizerApp() {
  const stageRef = useRef<HTMLCanvasElement>(null);
  const uiRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!stageRef.current || !uiRef.current) return;
    return mountVisualizer(stageRef.current, uiRef.current);
  }, []);

  return (
    <>
      <canvas id="stage" ref={stageRef} />
      <div id="ui" ref={uiRef} />
    </>
  );
}
```

### Task 3: Refactor Browser Bootstrap

**Files:**
- Create: `src/visualizer.ts`
- Delete: `src/main.ts`

- [ ] **Step 1: Move the current `src/main.ts` setup into `mountVisualizer(stage, ui)`**

The exported function constructs the existing `AudioEngine`, `InputManager`, visual layers, `Hud`, `Renderer`, `IdleHider`, and `SpotifyClient` using the provided DOM elements. It returns a cleanup function that stops the idle hider.

- [ ] **Step 2: Keep behavior unchanged**

Preserve the existing source selection callbacks, fullscreen shortcut, renderer startup, waveform visibility callbacks, and Spotify redirect polling.

### Task 4: Replace Vite Tooling With Next.js

**Files:**
- Modify: `package.json`
- Modify: `package-lock.json`
- Modify: `tsconfig.json`
- Create: `next-env.d.ts`
- Create: `next.config.mjs`
- Delete: `index.html`
- Delete: `vite.config.ts`
- Delete: `src/vite-env.d.ts`

- [ ] **Step 1: Install Next dependencies**

Run: `npm install next react react-dom && npm uninstall vite`

- [ ] **Step 2: Update scripts**

Set `dev` to `next dev`, `build` to `next build`, `start` to `next start`, and keep Vitest scripts unchanged.

- [ ] **Step 3: Update TypeScript config**

Add JSX/Next settings and include `app`, `src`, `tests`, and `next-env.d.ts`.

### Task 5: Verify The Conversion

**Files:**
- No source edits unless verification reveals a real failure.

- [ ] **Step 1: Run the migration test**

Run: `npm test -- tests/nextApp.test.ts`

Expected: pass.

- [ ] **Step 2: Run the full suite**

Run: `npm test`

Expected: pass.

- [ ] **Step 3: Run the production build**

Run: `npm run build`

Expected: Next.js production build completes successfully.

- [ ] **Step 4: Update graphify**

Run: `graphify update .`

Expected: code graph updates.
