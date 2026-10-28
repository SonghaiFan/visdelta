import type { Metadata } from 'next';
import { StoryEntry } from '@/components/story-entry';
export const metadata: Metadata = { title: 'VisDelta Story', description: 'Open the independent MDX scrollytelling studio built on VisDelta.' };
export default function StoryPage() { return <main><StoryEntry /></main>; }
