// Development only (`next dev` serves `*.dev.ts`; builds never see this file):
// read and write documentation source for the inline docs editor.
import { NextResponse, type NextRequest } from 'next/server';
import { readSource, SourceError, writeSource } from '@/lib/dev-source';

export const dynamic = 'force-dynamic';

const root = process.cwd();

/** Same-origin requests from the editor only; a cross-site page cannot send the header without CORS. */
function refuse(request: NextRequest) {
  if (process.env.NODE_ENV !== 'development') return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const origin = request.headers.get('origin');
  if (request.headers.get('x-vd-inline-edit') !== '1' || (origin && new URL(origin).host !== request.headers.get('host'))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  return null;
}

function failure(cause: unknown) {
  const status = cause instanceof SourceError ? cause.status : 500;
  return NextResponse.json({ error: cause instanceof Error ? cause.message : String(cause) }, { status });
}

export async function GET(request: NextRequest) {
  const refused = refuse(request);
  if (refused) return refused;
  try {
    return NextResponse.json({ text: await readSource(root, request.nextUrl.searchParams.get('ref') ?? '') });
  } catch (cause) {
    return failure(cause);
  }
}

export async function POST(request: NextRequest) {
  const refused = refuse(request);
  if (refused) return refused;
  try {
    const { ref, original, text } = (await request.json()) as { ref: string; original: string; text: string };
    if ([ref, original, text].some((value) => typeof value !== 'string')) throw new SourceError(400, 'Expected ref, original and text.');
    return NextResponse.json({ changed: await writeSource(root, ref, original, text) });
  } catch (cause) {
    return failure(cause);
  }
}
