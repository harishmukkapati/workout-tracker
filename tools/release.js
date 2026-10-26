#!/usr/bin/env node
// Prepare an update: node tools/release.js <version> "<what changed>"
// Writes bundle/version.json and update-manifest.json (file list + SHA-256 hashes).
// Then commit, tag v<version>, and push both:  git push origin main --tags
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..'), bundle = path.join(root, 'bundle');
const [version, ...rest] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(version || '')) { console.error('Usage: node tools/release.js 1.2.3 "What changed"'); process.exit(1); }
const vfile = path.join(bundle, 'version.json');
const info = JSON.parse(fs.readFileSync(vfile, 'utf8'));
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
if (cmp(version, info.version) <= 0) { console.error(`Version must be higher than ${info.version}`); process.exit(1); }
info.version = version;
if (rest.length) info.notes = rest.join(' ');
fs.writeFileSync(vfile, JSON.stringify(info, null, 2) + '\n');

const files = {};
(function walk(dir) {
  for (const f of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, f);
    if (fs.statSync(full).isDirectory()) walk(full);
    else files[path.relative(bundle, full).split(path.sep).join('/')] = crypto.createHash('sha256').update(fs.readFileSync(full)).digest('hex');
  }
})(bundle);

const pkgFile = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
pkg.version = version;
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');

const manifest = { version, minShell: info.minShell || 1, ref: `v${version}`, notes: info.notes || '', files };
fs.writeFileSync(path.join(root, 'update-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(`Prepared ${version} (${Object.keys(files).length} files). Next:\n  git add -A && git commit -m "Release ${version}" && git tag v${version} && git push origin main --tags`);
