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
  HKQuantityTypeIdentifierAppleExerciseTime: 'exercise',
};
const attr = (line, name) => { const m = line.match(new RegExp(`\\s${name}="([^"]*)"`)); return m ? m[1] : null; };
// "2026-10-27 23:40:00 -0400" -> Date
const appleTime = (s) => { const m = String(s || '').match(/^(\d{4}-\d{2}-\d{2}) (\d{2}:\d{2}:\d{2}) ([+-]\d{2})(\d{2})$/); return m ? new Date(`${m[1]}T${m[2]}${m[3]}:${m[4]}`) : new Date(s); };
const pad2 = (n) => String(n).padStart(2, '0');
const localDay = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const hhmm = (d) => `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
// Sleep that ends between noon yesterday and noon today is "last night" for today.
const nightOf = (end) => localDay(new Date(end.getTime() + 12 * 3600e3));
const SLEEP_STAGE = { HKCategoryValueSleepAnalysisAsleepCore: 'core', HKCategoryValueSleepAnalysisAsleepDeep: 'deep', HKCategoryValueSleepAnalysisAsleepREM: 'rem', HKCategoryValueSleepAnalysisAsleepUnspecified: 'asleep', HKCategoryValueSleepAnalysisAsleep: 'asleep' };

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
  const nights = {};
  for await (const line of rl) {
    const i = line.indexOf('<Record ');
    if (i < 0) continue;
    const type = attr(line, 'type');
    if (type === 'HKCategoryTypeIdentifierSleepAnalysis') {
      const stage = SLEEP_STAGE[attr(line, 'value')];
      if (!stage) continue;
      const a = appleTime(attr(line, 'startDate')), b = appleTime(attr(line, 'endDate'));
      if (!(b > a)) continue;
      records++;
      const n = ((nights[nightOf(b)] ||= {})[attr(line, 'sourceName') || 'unknown'] ||= { min: 0, core: 0, deep: 0, rem: 0, bed: a, wake: b });
      const m = (b - a) / 60000;
      n.min += m; if (stage !== 'asleep') n[stage] += m;
      if (a < n.bed) n.bed = a; if (b > n.wake) n.wake = b;
      continue;
    }
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
  for (const [date, bySrc] of Object.entries(nights)) {
    const n = Object.values(bySrc).sort((x, y) => y.min - x.min)[0]; // the source that saw the most sleep (Watch over iPhone)
    if (!n || n.min < 60) continue;
    Object.assign((days[date] ||= {}), sleepFields(n.min / 60, n.bed, n.wake, n.deep / 60, n.rem / 60, n.core / 60));
  }
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
  if (/exercise time|exercise_time|exercise min/.test(s)) return { field: 'exercise' };
  if (/stand hour|stand_hour/.test(s)) return { field: 'stand' };
  if (/resting heart|resting_heart/.test(s)) return { field: 'restingHR', avg: true };
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
      else if (m.avg) d[m.field] = Math.round(v);
      else d[m.field] = Math.round((d[m.field] || 0) + (m.kj ? v * KJ_TO_KCAL : v));
    });
    if (Object.keys(d).length) {
      const prev = days[date] || {};
      for (const [k, v] of Object.entries(d)) prev[k] = k === 'weightLb' || k === 'restingHR' ? v : (prev[k] || 0) + v;
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

// ---------- Apple Health JSON (Health Auto Export, or an Apple Shortcut) ----------
// Health Auto Export sends { data: { metrics: [ { name, units, data: [ { qty, date } ] } ], workouts: [...] } }.
// A Shortcut can send { date: "2026-10-26", active, basal, steps, exercise, stand, weight } or an array of those.
const HAE_NAMES = [
  [/^active_energy$|^active_energy_burned$/, 'active'],
  [/^basal_energy_burned$|^resting_energy$/, 'basal'],
  [/^step_count$|^steps$/, 'steps'],
  [/^weight_body_mass$|^body_mass$|^weight$/, 'weightLb'],
  [/^apple_exercise_time$|^exercise_time$/, 'exercise'],
  [/^apple_stand_hour$|^stand_hours?$/, 'stand'],
  [/^resting_heart_rate$/, 'restingHR'],
  [/^sleep_analysis$/, 'sleepH'],
];
const SIMPLE_KEYS = { active: 'active', activeenergy: 'active', move: 'active', basal: 'basal', resting: 'basal', restingenergy: 'basal', steps: 'steps', exercise: 'exercise', exerciseminutes: 'exercise', stand: 'stand', standhours: 'stand', weight: 'weightLb', weightlb: 'weightLb', weightkg: 'weightKg', restinghr: 'restingHR', restingheartrate: 'restingHR', sleep: 'sleepH', sleephours: 'sleepH', total: 'total' };
const toNum = (v) => { const n = parseFloat(String(v ?? '').replace(/,/g, '')); return isFinite(n) ? n : null; };
const r1 = (v) => Math.round(v * 10) / 10;
function sleepFields(h, bed, wake, deep, rem, core) {
  const o = { sleepH: r1(h) };
  if (bed instanceof Date && !isNaN(bed)) o.sleepBed = hhmm(bed);
  if (wake instanceof Date && !isNaN(wake)) o.sleepWake = hhmm(wake);
  if (deep) o.sleepDeep = r1(deep); if (rem) o.sleepRem = r1(rem); if (core) o.sleepCore = r1(core);
  return o;
}
const anyTime = (v) => { if (!v) return null; const d = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2} [+-]\d{4}$/.test(v) ? appleTime(v) : new Date(v); return isNaN(d) ? null : d; };

function parseHealthJSON(obj) {
  const days = {};
  const put = (date, k, v) => { if (date && v != null && isFinite(v)) (days[date] ||= {})[k] = v; };
  // Simple format (Shortcut)
  const simple = Array.isArray(obj) ? obj : Array.isArray(obj?.entries) ? obj.entries : (obj && !obj.data && (obj.date || obj.day)) ? [obj] : null;
  if (simple) {
    for (const e of simple) {
      const date = normDate(String(e.date || e.day || ''));
      if (!date) continue;
      for (const [k, v] of Object.entries(e)) {
        const lk = k.toLowerCase().replace(/[^a-z]/g, '');
        if (['bedtime', 'sleepstart', 'bed'].includes(lk) || ['waketime', 'sleepend', 'wake'].includes(lk)) {
          const t = /^\d{1,2}:\d{2}$/.test(String(v)) ? String(v).padStart(5, '0') : anyTime(v) ? hhmm(anyTime(v)) : null;
          if (t) (days[date] ||= {})[['bedtime', 'sleepstart', 'bed'].includes(lk) ? 'sleepBed' : 'sleepWake'] = t;
          continue;
        }
        const key = SIMPLE_KEYS[lk];
        const n = toNum(v);
        if (!key || n == null) continue;
        if (key === 'weightKg') put(date, 'weightLb', Math.round(n * KG_TO_LB * 10) / 10);
        else if (key === 'weightLb') put(date, 'weightLb', Math.round((/kg/i.test(e.weightUnit || '') ? n * KG_TO_LB : n) * 10) / 10);
        else put(date, key, key === 'sleepH' ? Math.round(n * 10) / 10 : Math.round(n));
      }
    }
    return { days, summary: `${Object.keys(days).length} day${Object.keys(days).length === 1 ? '' : 's'}`, source: 'Apple Health' };
  }
  const metrics = obj?.data?.metrics || obj?.metrics;
  if (!Array.isArray(metrics)) throw new Error('This file is not Health Auto Export or Shortcut data.');
  const sums = {}, last = {}, avg = {}, sleep = {}, sleepBest = {};
  let points = 0;
  for (const m of metrics) {
    const name = String(m.name || '').toLowerCase();
    const key = HAE_NAMES.find(([re]) => re.test(name))?.[1];
    if (!key) continue;
    const unit = String(m.units || '').toLowerCase();
    for (const p of m.data || []) {
      const date = normDate(String(p.date || p.startDate || p.start || ''));
      if (!date) continue;
      points++;
      if (key === 'sleepH') {
        const k = unit === 'min' ? 1 / 60 : 1;
        const h = toNum(p.totalSleep ?? p.asleep ?? p.qty);
        if (h == null || h * k <= (sleepBest[date] || 0)) continue;
        sleepBest[date] = h * k;
        Object.assign((sleep[date] ||= {}), sleepFields(h * k, anyTime(p.sleepStart || p.inBedStart), anyTime(p.sleepEnd || p.inBedEnd), toNum(p.deep) * k, toNum(p.rem) * k, toNum(p.core) * k));
        continue;
      }
      let v = toNum(p.qty ?? p.Avg ?? p.avg);
      if (v == null) continue;
      if (key === 'weightLb') { v = unit === 'kg' ? v * KG_TO_LB : unit === 'g' ? v / 1000 * KG_TO_LB : v; const t = String(p.date || ''); if (!last[date] || t >= last[date].t) last[date] = { t, v }; continue; }
      if (key === 'restingHR') { const a = (avg[date] ||= { s: 0, n: 0 }); a.s += v; a.n++; continue; }
      if ((key === 'active' || key === 'basal') && unit === 'kj') v *= KJ_TO_KCAL;
      if (key === 'exercise' && unit === 'hr') v *= 60;
      const d = (sums[date] ||= {});
      d[key] = (d[key] || 0) + v;
    }
  }
  for (const [date, d] of Object.entries(sums)) for (const [k, v] of Object.entries(d)) put(date, k, k === 'sleepH' ? Math.round(v * 10) / 10 : Math.round(v));
  for (const [date, w] of Object.entries(last)) put(date, 'weightLb', Math.round(w.v * 10) / 10);
  for (const [date, a] of Object.entries(avg)) put(date, 'restingHR', Math.round(a.s / a.n));
  for (const [date, f] of Object.entries(sleep)) Object.assign((days[date] ||= {}), f);
  return { days, summary: `${points.toLocaleString()} reading${points === 1 ? '' : 's'} across ${Object.keys(days).length} day${Object.keys(days).length === 1 ? '' : 's'}`, source: 'Apple Health' };
}

async function importJSON(file) {
  return parseHealthJSON(JSON.parse(fs.readFileSync(file, 'utf8')));
}

async function importFile(kind, file) {
  if (/\.json$/i.test(file)) return importJSON(file);
  if (kind === 'apple') return importApple(file);
  if (kind === 'google') return importGoogle(file);
  return importCSV(file);
}

module.exports = { importFile, importApple, importGoogle, importCSV, importJSON, parseHealthJSON, parseCSV, rowsToDays };
