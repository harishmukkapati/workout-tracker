// Fitness data importers. Each returns { days: { 'YYYY-MM-DD': { active, basal, total, steps, weightLb } }, summary }
const fs = require('fs');
const readline = require('readline');
const yauzl = (global.shellRequire || require)('yauzl');

const KG_TO_LB = 2.20462;
const KJ_TO_KCAL = 0.239006;

// ---------- zip helpers ----------
function openZip(file) {
  return new Promise((res, rej) => yauzl.open(file, { lazyEntries: true, autoClose: false }, (e, z) => (e ? rej(e) : res(z))));
}
// Find the first entry matching `test` and return a readable stream for it.
async function zipStream(file, test) {
  const zip = await openZip(file);
  return new Promise((res, rej) => {
    let found = false;
    zip.on('entry', (entry) => {
      if (!found && test(entry.fileName)) {
        found = true;
        zip.openReadStream(entry, (e, stream) => {
          if (e) return rej(e);
          stream.on('end', () => zip.close());
          res({ stream, name: entry.fileName });
        });
      } else zip.readEntry();
    });
    zip.on('end', () => { if (!found) { zip.close(); rej(new Error('No matching file found inside the zip.')); } });
    zip.on('error', rej);
    zip.readEntry();
  });
}
async function zipListNames(file) {
  const zip = await openZip(file);
  return new Promise((res, rej) => {
    const names = [];
    zip.on('entry', (e) => { names.push(e.fileName); zip.readEntry(); });
    zip.on('end', () => { zip.close(); res(names); });
    zip.on('error', rej);
    zip.readEntry();
  });
}
function streamToString(stream) {
  return new Promise((res, rej) => { const parts = []; stream.on('data', c => parts.push(c)); stream.on('end', () => res(Buffer.concat(parts).toString('utf8'))); stream.on('error', rej); });
}

// ---------- Apple Health (export.zip / export.xml) ----------
const APPLE_TYPES = {
  HKQuantityTypeIdentifierActiveEnergyBurned: 'active',
  HKQuantityTypeIdentifierBasalEnergyBurned: 'basal',
  HKQuantityTypeIdentifierStepCount: 'steps',
  HKQuantityTypeIdentifierBodyMass: 'weightLb',
};
const attr = (line, name) => { const m = line.match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? m[1] : null; };

async function importApple(file) {
  let stream;
  if (file.toLowerCase().endsWith('.zip')) {
    ({ stream } = await zipStream(file, n => /(^|\/)export\.xml$/i.test(n)));
  } else stream = fs.createReadStream(file);

  // Per day, per metric, per source sums. Using the max source avoids double counting iPhone + Watch.
  const acc = {};
  const weights = {};
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let records = 0;
  for await (const line of rl) {
    const i = line.indexOf('<Record ');
    if (i < 0) continue;
    const type = attr(line, 'type');
    const key = APPLE_TYPES[type];
    if (!key) continue;
    const start = attr(line, 'startDate');
    const value = parseFloat(attr(line, 'value'));
    if (!start || !isFinite(value)) continue;
    const date = start.slice(0, 10);
    const unit = (attr(line, 'unit') || '').toLowerCase();
    records++;
    if (key === 'weightLb') {
      const lb = unit === 'kg' ? value * KG_TO_LB : unit === 'g' ? value / 1000 * KG_TO_LB : value;
      if (!weights[date] || start > weights[date].t) weights[date] = { t: start, v: lb };
      continue;
    }
    let v = value;
    if (key !== 'steps' && unit === 'kj') v = value * KJ_TO_KCAL;
    const src = attr(line, 'sourceName') || 'unknown';
    const day = (acc[date] ||= {});
    const m = (day[key] ||= {});
    m[src] = (m[src] || 0) + v;
  }
  const days = {};
  for (const [date, metrics] of Object.entries(acc)) {
    const d = (days[date] ||= {});
    for (const [key, bySrc] of Object.entries(metrics)) d[key] = Math.round(Math.max(...Object.values(bySrc)));
  }
  for (const [date, w] of Object.entries(weights)) (days[date] ||= {}).weightLb = Math.round(w.v * 10) / 10;
  return { days, summary: `${records.toLocaleString()} records across ${Object.keys(days).length} days`, source: 'Apple Health' };
}

// ---------- CSV ----------
function parseCSV(text) {
  const rows = []; let row = []; let cur = ''; let q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cur); rows.push(row); row = []; cur = '';
    } else cur += c;
  }
  if (cur.length || row.length) { row.push(cur); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim() !== ''));
}

function normDate(s) {
  s = (s || '').trim().replace(/^﻿/, '');
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/); // M/D/YYYY
  if (m) return `${m[3]}-${m[1].padStart(2, '0')}-${m[2].padStart(2, '0')}`;
  const d = new Date(s);
  if (!isNaN(d)) return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return null;
}

// Map loosely-named columns (Google Fit, Health Auto Export, Fitbit, your own sheet) onto our fields.
function mapHeader(h) {
  const s = h.toLowerCase().replace(/^﻿/, '').trim();
  if (/^(date|day)\b/.test(s) || s === 'start date') return { field: 'date' };
  if (/resting energy|basal/.test(s)) return { field: 'basal', kj: /kj/.test(s) };
  if (/active (energy|cal)|active_kcal|activity cal|calories burned \(active\)/.test(s)) return { field: 'active', kj: /kj/.test(s) };
  if (/^calories \(kcal\)$|total (energy|cal)|calories[ _]out|^calories burned|total_kcal/.test(s)) return { field: 'total', kj: /kj/.test(s) };
  if (/step/.test(s) && !/max|min/.test(s)) return { field: 'steps' };
  if (/(average weight|^weight|body mass)/.test(s) && !/max|min/.test(s)) return { field: 'weight', kg: /kg/.test(s) };
  return null;
}

function rowsToDays(rows) {
  if (rows.length < 2) throw new Error('The CSV has no data rows.');
  const header = rows[0];
  const map = header.map(mapHeader);
  const dateIdx = map.findIndex(m => m && m.field === 'date');
  if (dateIdx < 0) throw new Error('Could not find a Date column.');
  const days = {};
  for (const r of rows.slice(1)) {
    const date = normDate(r[dateIdx]);
    if (!date) continue;
    const d = {};
    map.forEach((m, i) => {
      if (!m || m.field === 'date') return;
      const v = parseFloat(String(r[i] || '').replace(/,/g, ''));
      if (!isFinite(v) || v === 0) return;
      if (m.field === 'weight') d.weightLb = Math.round((m.kg ? v * KG_TO_LB : v) * 10) / 10;
      else if (m.field === 'steps') d.steps = Math.round((d.steps || 0) + v);
      else d[m.field] = Math.round((d[m.field] || 0) + (m.kj ? v * KJ_TO_KCAL : v));
    });
    if (Object.keys(d).length) {
      const prev = days[date] || {};
      for (const [k, v] of Object.entries(d)) prev[k] = k === 'weightLb' ? v : (prev[k] || 0) + v;
      days[date] = prev;
    }
  }
  return days;
}

async function importCSV(file) {
  const days = rowsToDays(parseCSV(fs.readFileSync(file, 'utf8')));
  return { days, summary: `${Object.keys(days).length} days`, source: 'CSV' };
}

// ---------- Google Fit (Takeout) ----------
async function importGoogle(file) {
  let text;
  if (file.toLowerCase().endsWith('.zip')) {
    const names = await zipListNames(file);
    const pick = names.find(n => /Daily activity metrics\/Daily activity metrics\.csv$/i.test(n))
      || names.find(n => /Daily Aggregations\/Daily Summaries\.csv$/i.test(n))
      || names.find(n => /Fit\/.*daily.*\.csv$/i.test(n) && !/\d{4}-\d{2}-\d{2}/.test(n));
    if (!pick) throw new Error('No Google Fit daily summary found in this zip. Export "Fit" from Google Takeout.');
    const { stream } = await zipStream(file, n => n === pick);
    text = await streamToString(stream);
  } else text = fs.readFileSync(file, 'utf8');
  const days = rowsToDays(parseCSV(text));
  return { days, summary: `${Object.keys(days).length} days`, source: 'Google Fit' };
}

async function importFile(kind, file) {
  if (kind === 'apple') return importApple(file);
  if (kind === 'google') return importGoogle(file);
  return importCSV(file);
}

module.exports = { importFile, importApple, importGoogle, importCSV, parseCSV, rowsToDays };
