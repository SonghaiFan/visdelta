import type { Metadata } from 'next';
import { StoryEntry } from '@/components/story-entry';
export const metadata: Metadata = { title: 'VisDelta Story', description: 'Copy plain website examples that use VisDelta for efficient scrollytelling.' };
export default function StoryPage() { return <main><StoryEntry /></main>; }
