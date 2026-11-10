// Build the deployable site and the self-contained preview.
//   node tools/build.mjs
// dist/            the site as static files (index.html, join.html, src, vendor, assets): what gets hosted
// ../docs/         the same, for GitHub Pages
// dist/preview/    one self-contained wall page plus the phone page, for previews that cannot load sibling files
import { readFileSync, writeFileSync, mkdirSync, readdirSync, cpSync, rmSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const read = p => readFileSync(join(root, p), 'utf8');
const b64 = (p, type) => `data:${type};base64,` + readFileSync(join(root, p)).toString('base64');

// 1. static site
for (const out of [join(root, 'dist'), join(root, '..', 'docs')]){
  rmSync(out, { recursive: true, force: true }); mkdirSync(out, { recursive: true });
  for (const f of ['index.html', 'join.html']) writeFileSync(join(out, f), read(f));
  for (const d of ['src', 'vendor', 'assets']) cpSync(join(root, d), join(out, d), { recursive: true });
}
writeFileSync(join(root, '..', 'docs', '.nojekyll'), '');

// 2. self-contained preview
const fonts = css => css.replace(/url\((assets\/fonts\/[^)]+)\)/g, (_, p) => `url(${b64(p, 'font/woff2')})`);
const portraits = readdirSync(join(root, 'assets', 'portraits')).filter(f => /^portrait-\d+\.jpg$/.test(f)).sort().map(f => b64('assets/portraits/' + f, 'image/jpeg'));
const assets = `window.AC = window.AC || {}; AC.ASSETS = { night: ${JSON.stringify(b64('assets/earth-night.jpg', 'image/jpeg'))}, day: ${JSON.stringify(b64('assets/earth-day.jpg', 'image/jpeg'))}, portraits: ${JSON.stringify(portraits)} };`;
const inline = (html, files, extra) => html.replace(/<!-- scripts -->[\s\S]*?<!-- \/scripts -->/, files.map(f => `<script>\n${f === 'ASSETS' ? extra : read(f)}\n</script>`).join('\n'));
const stripShell = html => html.replace(/^[\s\S]*?<meta name="viewport"[^>]*>\s*/, '').replace(/<\/head>\s*<body>/, '').replace(/<\/body>\s*<\/html>\s*$/, '');
const preview = join(root, 'dist', 'preview'); mkdirSync(preview, { recursive: true });
const wall = inline(fonts(read('index.html')), ['vendor/three.min.js', 'ASSETS', 'src/data.js', 'src/store.js', 'src/orbit.js', 'src/sequencer.js', 'src/scene.js', 'src/app.js'], assets);
const phone = inline(fonts(read('join.html')), ['src/data.js', 'src/store.js', 'src/join.js']);
writeFileSync(join(preview, 'index.html'), stripShell(wall));     // the preview host supplies the document shell
writeFileSync(join(preview, 'join.html'), phone);
console.log('site -> dist/ and ../docs/ · preview wall', (wall.length/1048576).toFixed(2), 'MB · phone', (phone.length/1024).toFixed(0), 'KB ·', portraits.length, 'sample portraits');
