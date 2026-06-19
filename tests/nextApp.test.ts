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

  it('uses Next public environment variables instead of import.meta.env', () => {
    const config = read('src/config.ts');
    expect(config).not.toContain('import.meta.env');
    expect(config).toContain('NEXT_PUBLIC_SPOTIFY_CLIENT_ID');
    expect(config).toContain('NEXT_PUBLIC_SPOTIFY_REDIRECT_URI');
  });
});
