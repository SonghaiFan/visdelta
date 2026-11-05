import {existsSync} from 'node:fs';
const file=new URL('../.env.local',import.meta.url);
if(existsSync(file))process.loadEnvFile(file);
