import {build} from 'esbuild';
import {copyFile,readFile,writeFile,readdir} from 'node:fs/promises';
const root=new URL('../',import.meta.url);
const target=new URL('../website/public/story/examples/',import.meta.url);
await build({entryPoints:[new URL('examples/story/weather/main.mjs',root).pathname],bundle:true,format:'esm',target:'es2022',outfile:new URL('weather/app.js',target).pathname});
await copyFile(new URL('dist/visdelta.css',root),new URL('weather/visdelta.css',target));
// Resolve the portable CDN example against this Studio build, without a second editable copy.
await build({stdin:{contents:"export * from 'visdelta';",resolveDir:root.pathname},bundle:true,format:'esm',target:'es2020',outfile:new URL('network/visdelta.js',target).pathname});
await copyFile(new URL('dist/visdelta.css',root),new URL('network/visdelta.css',target));
const html=await readFile(new URL('examples/story/network/index.html',root),'utf8');
await writeFile(new URL('network/index.html',target),html
  .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/visdelta@[^/]+\/dist\/visdelta\.css/g,'./visdelta.css')
  .replace(/https:\/\/cdn\.jsdelivr\.net\/npm\/visdelta@[^/]+\/\+esm/g,'./visdelta.js'));

// A local, inspectable source download also works before a commit is published.
for(const id of ['network','weather']){
  const folder=new URL(`examples/story/${id}/`,root);
  const files=(await readdir(folder)).filter(file=>/\.(html|mjs|md)$/.test(file)).sort();
  const sources=await Promise.all(files.map(async file=>`===== ${file} =====\n${await readFile(new URL(file,folder),'utf8')}`));
  await writeFile(new URL(`${id}/source.txt`,target),sources.join('\n\n'));
}
