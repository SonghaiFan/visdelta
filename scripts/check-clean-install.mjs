import { execFileSync, spawn } from 'node:child_process';
import { copyFile, lstat, mkdir, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve, sep } from 'node:path';
import { createServer } from 'node:net';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const [major,minor]=process.versions.node.split('.').map(Number);
if (major < 22 || (major === 22 && minor < 18)) {
  throw new Error('Release tooling requires Node 22.18+ (Playwright). Node 18 package consumption is checked separately with pack:check.');
}
const target = await mkdtemp(join(tmpdir(), 'visdelta-clean-release-'));
const env = { ...process.env, CI: '1', npm_config_cache: join(tmpdir(), 'visdelta-npm-cache') };
try {
  // Include current staged/unstaged/untracked source, not just HEAD. Exclude
  // generated dist so a successful run proves that the build recreates it.
  const paths = [...new Set(execFileSync('git', ['ls-files', '-c', '-o', '--exclude-standard', '-z'], { cwd: root, encoding: 'utf8' }).split('\0').filter(Boolean))];
  for (const path of paths) {
    if (/^(?:dist|node_modules|test-results|playwright-report|\.git|\.env|\.claude)(?:\/|\.|$)/.test(path) || path.endsWith('.tgz')) continue;
    const source = resolve(root, path);
    if (!source.startsWith(resolve(root) + sep)) throw new Error(`Unexpected source path: ${path}`);
    if (!(await lstat(source).catch(() => null))?.isFile()) continue;
    const destination = join(target, path);
    await mkdir(dirname(destination), { recursive: true });
    await copyFile(source, destination);
  }
  const server = createServer();
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  env.VISDELTA_TEST_PORT = String(server.address().port);
  await new Promise(resolve => server.close(resolve));
  console.log(`Clean candidate workspace: ${target} (Node ${process.version})`);
  await run(['ci', '--ignore-scripts', '--no-audit', '--no-fund']);
  await run(['run', 'release:check']);
  await run(['run', 'studio:build']);
  await run(['run', 'test:studio:server']);
  env.SITE_TEST_PORT = env.VISDELTA_TEST_PORT;
  await run(['run', 'test', '--workspace', 'website', '--', 'tests/mcp.spec.ts', 'tests/liveshow.spec.ts', 'tests/story-entry.spec.ts', 'tests/voice.spec.ts']);
  console.log('Clean workspace install, library and Studio builds, browser and installed-consumer gates passed.');
} finally {
  await rm(target, { recursive: true, force: true });
}

function run(args) {
  return new Promise((resolve, reject) => {
    const child = spawn('npm', args, { cwd: target, env, stdio: 'inherit' });
    child.once('error', reject);
    child.once('exit', code => code === 0 ? resolve() : reject(new Error(`npm ${args.join(' ')} exited ${code}`)));
  });
}
