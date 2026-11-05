import { createHash } from 'node:crypto';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { relative } from 'node:path';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const source = new URL('../website/content/docs/', import.meta.url);
const target = new URL('../dist/docs/', import.meta.url);
const site = 'https://songhaifan.github.io/visdelta';

/** Website MDX is the editable source; package Markdown is a build artifact. */
export async function buildDocs() {
  await mkdir(target, {recursive:true});
  const pages = [];
  async function walk(directory) {
    for (const entry of await readdir(directory, {withFileTypes:true})) {
      const file = new URL(entry.name + (entry.isDirectory() ? '/' : ''), directory);
      if (entry.isDirectory()) await walk(file);
      else if (entry.name.endsWith('.mdx')) pages.push(file);
    }
  }
  await walk(source);
  pages.sort((a,b)=>a.href.localeCompare(b.href));
  const documents = [];
  const contents = new Map();
  async function emit(path, content, extra = {}) {
    const bytes = Buffer.from(content);
    await mkdir(new URL('./', new URL(path,target)), {recursive:true});
    await writeFile(new URL(path,target),bytes);
    documents.push({path:`visdelta/docs/${path}`,sha256:createHash('sha256').update(bytes).digest('hex'),...extra});
  }
  for (const file of pages) {
    const slug = relative(source.pathname,file.pathname).replace(/\.mdx$/,'');
    const text = await readFile(file,'utf8');
    const title = text.match(/^title:\s*(.+)$/m)?.[1]?.replace(/^['"]|['"]$/g,'') ?? slug;
    const url = `${site}/docs/${slug.replace(/\/?index$/,'')}/`.replace(/\/+/g,'/').replace('https:/','https://');
    let body = text.replace(/^---\n[\s\S]*?\n---\n/,'');
    for (const match of body.matchAll(/<auto-type-table path="([^"]+)" name="([^"]+)"\s*\/>/g)) {
      const code = await readFile(new URL(match[1],root),'utf8');
      const ast = ts.createSourceFile(match[1],code,ts.ScriptTarget.Latest,true);
      const declaration = ast.statements.find(node => node.name?.text === match[2]);
      if (!declaration) throw new Error(`Missing documented type ${match[2]} in ${match[1]}`);
      body = body.replace(match[0],`\n\`\`\`ts\n${declaration.getText(ast)}\n\`\`\`\n`);
    }
    // Preserve fenced code verbatim. Only documentation presentation tags are lowered.
    body = body.split(/(```[\s\S]*?```)/g).map((part,index)=>index%2 ? part : part
      .replace(/<Card\s+([^>]+)\/>/g,(_,attributes)=>{
        const title=attributes.match(/title="([^"]+)"/)?.[1];
        const href=attributes.match(/href="([^"]+)"/)?.[1];
        return title && href ? `- [${title}](${href})` : '';
      })
      .replace(/<Accordion\s+title="([^"]+)"[^>]*>/g,(_,title)=>`\n### ${title.replaceAll('&quot;','"')}\n`)
      .replace(/<Callout[^>]*title="([^"]+)"[^>]*>/g,'\n**$1**\n')
      .replace(/<[A-Z][\w]*\b[^>]*\/>/g,`[Interactive example](${url})`)
      .replace(/<\/?(?:Cards|Steps|Step|Accordions|Accordion|Callout)\b[^>]*>/g,'')
      .replace(/\]\((\/[^)]+)\)/g,(_,path)=>`](${site}${path})`)
    ).join('');
    const markdown = `# ${title}\n\n${body.trim()}\n`;
    contents.set(slug,markdown);
    await emit(`${slug}.md`,markdown,{source:`website/content/docs/${slug}.mdx`,sourceSha256:createHash('sha256').update(text).digest('hex'),url});
  }
  await emit('reference.md',[...contents.values()].join('\n\n---\n\n'));
  await emit('chart-types.md',[...contents].filter(([slug])=>slug.startsWith('charts/')).map(([,body])=>body).join('\n\n---\n\n'));
  await emit('data-sources-and-transforms.md',contents.get('concepts/data-and-transforms'));
  await emit('color-channel.schema.json',await readFile(new URL('../docs/color-channel.schema.json',import.meta.url),'utf8'));
  const fingerprint=createHash('sha256');
  async function hashSources(directory) {
    for(const entry of (await readdir(directory,{withFileTypes:true})).sort((a,b)=>a.name.localeCompare(b.name))) {
      const file=new URL(entry.name+(entry.isDirectory()?'/':''),directory);
      if(entry.isDirectory()) await hashSources(file);
      else {fingerprint.update(relative(root.pathname,file.pathname));fingerprint.update(await readFile(file));}
    }
  }
  await hashSources(new URL('src/',root));
  for(const document of documents) fingerprint.update(document.sha256);
  const buildSha256=fingerprint.digest('hex');
  const {version} = JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  await writeFile(new URL('index.json',target),JSON.stringify({schemaVersion:1,packageVersion:version,buildSha256,documents},null,2)+'\n');
  console.log(`Documentation: ${pages.length} pages from website/content/docs; package Markdown generated.`);
}
