#!/usr/bin/env node
// Two-step release (no git tags needed; the manifest points at an exact commit):
//
//   1) node tools/release.js 1.2.3 "What changed"     -> bumps bundle/version.json + package.json
//      git add -A && git commit -m "Release 1.2.3"
//   2) node tools/release.js --publish                 -> writes update-manifest.json pointing at HEAD
//      git add -A && git commit -m "Publish 1.2.3" && git push origin main
//
// Installed apps read update-manifest.json from main, then download each bundle file from the
// commit in "ref" and check its SHA-256 before installing.
const fs = require('fs'), path = require('path'), crypto = require('crypto'), { execSync } = require('child_process');
const root = path.join(__dirname, '..'), bundle = path.join(root, 'bundle');
const vfile = path.join(bundle, 'version.json');
const git = (cmd) => execSync(`git ${cmd}`, { cwd: root, encoding: 'utf8' }).trim();
const cmp = (a, b) => { const x = a.split('.').map(Number), y = b.split('.').map(Number); for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] - y[i]; return 0; };
const args = process.argv.slice(2);

if (args[0] === '--publish') {
  if (git('status --porcelain -- bundle')) { console.error('Commit your bundle/ changes first.'); process.exit(1); }
  const ref = git('rev-parse HEAD');
  const info = JSON.parse(git(`show ${ref}:bundle/version.json`));
  const files = {};
  for (const rel of git(`ls-tree -r --name-only ${ref} -- bundle`).split('\n').filter(Boolean)) {
    const buf = execSync(`git show ${ref}:${rel}`, { cwd: root, maxBuffer: 64 * 1024 * 1024 });
    files[rel.replace(/^bundle\//, '')] = crypto.createHash('sha256').update(buf).digest('hex');
  }
  const manifest = { version: info.version, minShell: info.minShell || 1, ref, notes: info.notes || '', files };
  fs.writeFileSync(path.join(root, 'update-manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Manifest for ${info.version} -> ${ref.slice(0, 7)} (${Object.keys(files).length} files). Next:\n  git add -A && git commit -m "Publish ${info.version}" && git push origin main`);
  process.exit(0);
}

const [version, ...rest] = args;
if (!/^\d+\.\d+\.\d+$/.test(version || '')) { console.error('Usage: node tools/release.js 1.2.3 "What changed"   then   node tools/release.js --publish'); process.exit(1); }
const info = JSON.parse(fs.readFileSync(vfile, 'utf8'));
if (cmp(version, info.version) <= 0) { console.error(`Version must be higher than ${info.version}`); process.exit(1); }
info.version = version;
if (rest.length) info.notes = rest.join(' ');
fs.writeFileSync(vfile, JSON.stringify(info, null, 2) + '\n');
const pkgFile = path.join(root, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
pkg.version = version;
fs.writeFileSync(pkgFile, JSON.stringify(pkg, null, 2) + '\n');
console.log(`Bumped to ${version}. Next:\n  git add -A && git commit -m "Release ${version}"\n  node tools/release.js --publish`);
