// Builds dist/index.html: a single self-contained file (scripts inlined, demo portrait pool embedded as data URIs).
// Usage: node tools/build.mjs            -> dist/index.html for Cloudflare Pages or any static host
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const html = readFileSync(join(root, 'index.html'), 'utf8');
const scripts = ['data', 'layout', 'sequencer', 'scene', 'app'].map(n => readFileSync(join(root, 'src', n + '.js'), 'utf8'));
const pdir = join(root, 'assets', 'portraits');
const focus = readdirSync(pdir).filter(f => /^portrait-\d+\.jpg$/.test(f)).sort().map(f => 'data:image/jpeg;base64,' + readFileSync(join(pdir, f)).toString('base64'));
const atlas = 'data:image/jpeg;base64,' + readFileSync(join(pdir, 'atlas.jpg')).toString('base64');
const pool = `window.AC = window.AC || {}; AC.PORTRAIT_POOL = { size: ${focus.length}, atlas: ${JSON.stringify(atlas)}, focus: ${JSON.stringify(focus)} };`;
const inlined = '<script>\n' + pool + '\n' + scripts.join('\n') + '\n</script>';
const out = html.replace(/<!-- app-scripts -->[\s\S]*?<!-- \/app-scripts -->/, inlined);
mkdirSync(join(root, 'dist'), { recursive: true });
writeFileSync(join(root, 'dist', 'index.html'), out);
// Artifact variant: claude.ai wraps pages in its own skeleton, so strip ours.
const art = out.replace(/^[\s\S]*?<head>\s*<meta charset="utf-8">\s*<meta name="viewport"[^>]*>\s*/, '').replace(/<\/head>\s*<body>/, '').replace(/<\/body>\s*<\/html>\s*$/, '');
writeFileSync(join(root, 'dist', 'artifact.html'), art);
// GitHub Pages: the same single-file build is published from /docs at the repository root.
mkdirSync(join(root, '..', 'docs'), { recursive: true });
writeFileSync(join(root, '..', 'docs', 'index.html'), out);
writeFileSync(join(root, '..', 'docs', '.nojekyll'), '');
console.log('dist/index.html', (out.length/1024).toFixed(0) + ' KB,', focus.length, 'portraits embedded');
