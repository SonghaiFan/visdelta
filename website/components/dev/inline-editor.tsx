'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, PencilLine, X } from 'lucide-react';
import { basePath } from '@/lib/shared';
import { cn } from '@/lib/cn';

interface Session {
  element: HTMLElement;
  host: HTMLElement;
  ref: string;
  original: string;
  text: string;
}

const API = `${basePath}/api/dev/source/`;
const HEADERS = { 'x-vd-inline-edit': '1' };
const STORAGE_KEY = 'vd-inline-edit';

async function request<T>(input: string, init?: RequestInit): Promise<T> {
  const response = await fetch(input, { ...init, headers: { ...HEADERS, ...init?.headers } });
  const body = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(body.error ?? `Request failed (${response.status})`);
  return body;
}

/**
 * Development only. Edit mode makes every paragraph, heading, table, title and
 * description on a docs page clickable: its Markdown opens in place, and
 * saving writes it back to the `.mdx` file. Fast Refresh then redraws the page.
 */
export function InlineEditor() {
  const [enabled, setEnabled] = useState(() => {
    try {
      return sessionStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [session, setSession] = useState<Session | null>(null);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const sessionRef = useRef<Session | null>(null);

  const close = useCallback(() => {
    const current = sessionRef.current;
    if (!current) return;
    current.host.remove();
    current.element.removeAttribute('data-vd-hidden');
    sessionRef.current = null;
    setSession(null);
    setSaving(false);
  }, []);

  const open = useCallback(
    async (element: HTMLElement) => {
      close();
      const ref = element.dataset.vdSrc!;
      try {
        const { text } = await request<{ text: string }>(`${API}?ref=${encodeURIComponent(ref)}`);
        const host = document.createElement('div');
        host.dataset.vdEditor = '';
        element.after(host);
        element.setAttribute('data-vd-hidden', '');
        sessionRef.current = { element, host, ref, original: text, text };
        setSession(sessionRef.current);
        setMessage(null);
      } catch (cause) {
        setMessage({ text: cause instanceof Error ? cause.message : String(cause), error: true });
      }
    },
    [close],
  );

  const save = useCallback(async () => {
    const current = sessionRef.current;
    if (!current || saving) return;
    if (current.text === current.original) return close();
    setSaving(true);
    try {
      await request(API, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ref: current.ref, original: current.original, text: current.text }),
      });
      setMessage({ text: `Saved ${current.ref.split('#')[0]}` });
      // Keep the editor until Fast Refresh redraws the block, so the old text never flashes back.
      const done = () => {
        observer.disconnect();
        window.clearTimeout(timer);
        if (sessionRef.current === current) close();
      };
      const observer = new MutationObserver(done);
      observer.observe(current.element, { childList: true, characterData: true, subtree: true, attributes: true, attributeFilter: ['data-vd-src'] });
      const timer = window.setTimeout(done, 4000);
    } catch (cause) {
      setSaving(false);
      setMessage({ text: cause instanceof Error ? cause.message : String(cause), error: true });
    }
  }, [close, saving]);

  useEffect(() => {
    try {
      sessionStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
    } catch {}
    document.documentElement.toggleAttribute('data-vd-editing', enabled);
    if (!enabled) {
      close();
      return;
    }
    const onClick = (event: MouseEvent) => {
      const target = event.target as Element | null;
      if (!target || target.closest('[data-vd-editor], [data-vd-inline-toolbar]')) return;
      const block = target.closest<HTMLElement>('[data-vd-src]');
      if (!block) return;
      event.preventDefault();
      event.stopPropagation();
      void open(block);
    };
    document.addEventListener('click', onClick, true);
    return () => {
      document.removeEventListener('click', onClick, true);
      document.documentElement.removeAttribute('data-vd-editing');
    };
  }, [close, enabled, open]);

  useEffect(() => {
    if (!message || message.error) return;
    const timer = window.setTimeout(() => setMessage(null), 2500);
    return () => window.clearTimeout(timer);
  }, [message]);

  return (
    <>
      <div
        data-vd-inline-toolbar=""
        className="fixed right-4 bottom-4 z-50 flex max-w-[calc(100vw-2rem)] items-center gap-3 rounded-md border bg-fd-background/95 px-2 py-1.5 text-sm shadow-sm backdrop-blur"
      >
        <button
          type="button"
          aria-pressed={enabled}
          onClick={() => setEnabled((value) => !value)}
          className={cn(
            'inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors',
            enabled ? 'bg-[var(--color-delta)] text-black' : 'hover:bg-fd-accent',
          )}
        >
          <PencilLine className="size-3.5" />
          {enabled ? 'Editing' : 'Edit text'}
        </button>
        {(message || enabled) && (
          <span role="status" className={cn('truncate text-xs', message?.error ? 'text-fd-error' : 'text-fd-muted-foreground')}>
            {message?.text ?? 'Click any text to edit its source · dev only'}
          </span>
        )}
      </div>
      {session &&
        createPortal(
          <SourceBox
            key={session.ref}
            value={session.text}
            saving={saving}
            onChange={(text) => {
              sessionRef.current = { ...session, text };
              setSession(sessionRef.current);
            }}
            onSave={() => void save()}
            onCancel={close}
          />,
          session.host,
        )}
    </>
  );
}

function SourceBox({
  value,
  saving,
  onChange,
  onSave,
  onCancel,
}: {
  value: string;
  saving: boolean;
  onChange: (text: string) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const area = ref.current;
    if (!area) return;
    area.focus();
    area.setSelectionRange(area.value.length, area.value.length);
  }, []);
  useEffect(() => {
    const area = ref.current;
    if (!area) return;
    area.style.height = 'auto';
    area.style.height = `${area.scrollHeight + 2}px`;
  }, [value]);

  return (
    <div className="not-prose my-4 rounded-md border border-[var(--color-delta)] bg-fd-card shadow-[0_0_0_3px_color-mix(in_srgb,var(--color-delta)_18%,transparent)]">
      <textarea
        ref={ref}
        value={value}
        aria-label="Markdown source"
        spellCheck
        onChange={(event) => onChange(event.currentTarget.value)}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && (event.key === 's' || event.key === 'Enter')) {
            event.preventDefault();
            onSave();
          } else if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
        }}
        className="block w-full resize-none bg-transparent px-3.5 py-3 font-mono text-[13px] leading-relaxed text-fd-foreground outline-none focus-visible:outline-none"
      />
      <div className="flex items-center gap-2 border-t px-2 py-1.5 text-xs text-fd-muted-foreground">
        <span className="mr-auto pl-1.5">Markdown · ⌘S saves · Esc cancels</span>
        <button type="button" onClick={onCancel} className="inline-flex items-center gap-1 rounded px-2 py-1 hover:bg-fd-accent hover:text-fd-foreground">
          <X className="size-3.5" />
          Cancel
        </button>
        <button
          type="button"
          onClick={onSave}
          disabled={saving}
          className="inline-flex items-center gap-1 rounded bg-fd-primary px-2 py-1 text-fd-primary-foreground disabled:opacity-60"
        >
          <Check className="size-3.5" />
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </div>
  );
}
