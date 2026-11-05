import '../../liveshow.css';
import type {Metadata} from 'next';
import {Liveshow} from '@/components/liveshow/liveshow';
export const metadata:Metadata={title:'Liveshow',description:'Use VisDelta in real time through MCP.'};
export default function Page(){return <main className="min-w-0 flex-1"><Liveshow /></main>;}
