'use client';

import dynamic from 'next/dynamic';

/**
 * Client-only, because the editor's state lives in the browser session. In a
 * production build the condition is constant, so the editor is not bundled.
 */
export const InlineEditorLoader =
  process.env.NODE_ENV === 'development'
    ? dynamic(() => import('./inline-editor').then((module) => module.InlineEditor), { ssr: false })
    : () => null;
