'use strict';
/* Workout Tracker renderer. Plain JS, no build step. */

// ======================================================================
// Utilities
// ======================================================================
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const pad = (n) => String(n).padStart(2, '0');
const fmtDate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const parseDate = (s) => { const [y, m, d] = s.split('-').map(Number); return new Date(y, m - 1, d); };
const todayStr = () => fmtDate(new Date());
const addDays = (s, n) => { const d = parseDate(s); d.setDate(d.getDate() + n); return fmtDate(d); };
const diffDays = (a, b) => Math.round((parseDate(b) - parseDate(a)) / 86400000);
const mod = (n, m) => ((n % m) + m) % m;
const uid = () => Math.random().toString(36).slice(2, 9);
const round = (n, p = 0) => { const f = 10 ** p; return Math.round(n * f) / f; };
const num = (n) => (n == null || !isFinite(n)) ? '–' : Math.round(n).toLocaleString();
const longDate = (s, o = { weekday: 'long', month: 'long', day: 'numeric' }) => parseDate(s).toLocaleDateString(undefined, o);
const shortDate = (s) => parseDate(s).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// ======================================================================
// Defaults: your program and meal plan
// ======================================================================
const ex = (id, name, o) => ({ id, name, sets: 3, perSide: true, drop: true, ...o });
const DEFAULT_PROGRAM = {
  blocks: [
    { id: 'b1', name: 'Chest and back', hue: 'b1', exercises: [
      ex('floor-press', 'One-arm dumbbell floor press', { repMin: 8, repMax: 12, wMin: 40, wMax: 45 }),
      ex('front-raise', 'Seated underhand front raise', { repMin: 12, repMax: 15, wMin: 15, wMax: 20 }),
      ex('row', 'Seated chest-supported single-arm row', { repMin: 10, repMax: 12, wMin: 40, wMax: 50 }),
    ] },
    { id: 'b2', name: 'Shoulders', hue: 'b2', exercises: [
      ex('shoulder-press', 'Seated single-arm shoulder press', { repMin: 8, repMax: 12, wMin: 30, wMax: 35 }),
      ex('lateral-raise', 'Seated single-arm lateral raise', { repMin: 12, repMax: 15, wMin: 15, wMax: 20 }),
    ] },
    { id: 'b3', name: 'Arms', hue: 'b3', exercises: [
      ex('bicep-curl', 'Seated bicep curl', { repMin: 8, repMax: 12 }),
      ex('hammer-curl', 'Seated hammer curl', { repMin: 8, repMax: 12 }),
      ex('oh-tricep', 'Seated overhead tricep extension', { repMin: 10, repMax: 15, perSide: false }),
      ex('wrist-curl', 'Seated forearm wrist curl', { repMin: 12, repMax: 15 }),
    ] },
    { id: 'b4', name: 'Cardio', hue: 'saber', type: 'cardio', items: [
      { id: 'beat-saber', name: 'Beat Saber', minMin: 30, maxMin: 60, met: 6 },
    ] },
  ],
};
const food = (name, qty, unit, kcal, protein, n = {}, o = {}) => ({ id: uid(), name, qty, unit, kcal, protein, n, ...o });
// Nutrition per unit. Labels: Lactaid 2% (1 cup), Lotus Biscoff (4 cookies), ON Gold Standard Whey (30 g scoop).
// Whole foods: USDA FoodData Central. Protein bar and fish oil are typical values; edit them to match your labels.
const NUT = {
  egg:      { carbs: .4, fat: 4.8, satFat: 1.6, sugar: .2, sodium: 71, chol: 186, potassium: 69, calcium: 28, iron: .9, magnesium: 6, vitD: 1.1, b12: .45, folate: 24, choline: 147, omega3: 30 },
  milk:     { carbs: 13, fat: 5, satFat: 3, sugar: 12, sodium: 125, chol: 20, potassium: 410, calcium: 300, magnesium: 27, vitD: 3, b12: 1.2, folate: 12, choline: 40 },
  biscoff:  { carbs: 5.75, fat: 1.5, satFat: .63, sugar: 3, sodium: 29 },
  fishoil:  { fat: 1, satFat: .3, chol: 5, omega3: 300 },
  chicken:  { fat: 16.4, satFat: 4.6, sodium: 114, chol: 160, potassium: 1017, calcium: 14, iron: 1.5, magnesium: 39, vitD: .2, b12: .77, folate: 12, choline: 110 },
  tortilla: { carbs: 24.5, fat: 3.6, satFat: .9, fiber: 1.7, sugar: 1, sodium: 330, potassium: 60, calcium: 60, iron: 1.6, magnesium: 11, folate: 58, choline: 5 },
  pickle:   { carbs: .8, fiber: .3, sugar: .4, sodium: 283, potassium: 40, calcium: 20, iron: .1, magnesium: 2, vitC: .3 },
  bar:      { carbs: 22, fat: 7, satFat: 3, fiber: 4, sugar: 4, sodium: 200, chol: 5, potassium: 150, calcium: 150, iron: 1.5, magnesium: 30 },
  oats:     { carbs: 28.1, fat: 3.6, satFat: .6, fiber: 4, sugar: .6, sodium: 9, potassium: 164, calcium: 21, iron: 2.1, magnesium: 63, folate: 14, choline: 17 },
  whey:     { carbs: 3, fat: 1, satFat: .5, sugar: 1, sodium: 130, chol: 30, calcium: 100, iron: .4 },
  banana:   { carbs: 27, fat: .4, satFat: .1, fiber: 3.1, sugar: 14.4, sodium: 1, potassium: 422, calcium: 6, iron: .3, magnesium: 32, vitC: 10.3, folate: 24, choline: 11.6 },
  berry:    { carbs: .9, fiber: .2, sugar: .6, potassium: 18, calcium: 2, magnesium: 1.6, vitC: 7.1, folate: 2.9 },
  spinach:  { carbs: 1.1, fiber: .7, sugar: .1, sodium: 24, potassium: 167, calcium: 30, iron: .8, magnesium: 24, vitC: 8.4, folate: 58, choline: 5.8 },
  salt:     { sodium: 145 },
};
const DEFAULT_MEALS = [
  { id: 'breakfast', name: 'Breakfast', items: [
    food('Eggs', 4, 'large egg', 72, 6.3, NUT.egg, { min: 3, max: 5 }),
    food('Lactaid 2% milk', 1, 'glass (1 cup)', 130, 8, NUT.milk),
    food('Biscoff cookies', 4, 'cookie', 37.5, .5, NUT.biscoff, { min: 3, max: 6 }),
    food('Omega-3 pill', 1, '1,000 mg fish oil', 10, 0, NUT.fishoil),
  ] },
  { id: 'lunch', name: 'Lunch', items: [
    food('Ground chicken', 1, 'fist (~150 g cooked)', 284, 35, NUT.chicken),
    food('Eggs', 4, 'large egg', 72, 6.3, NUT.egg),
    food('Flour tortilla', 1, 'medium (8")', 146, 3.9, NUT.tortilla),
    food('Pickles', 4, 'dill spear', 4, .2, NUT.pickle),
  ] },
  { id: 'snack', name: 'Snack', items: [food('Protein bar', 1, 'bar (typical)', 200, 20, NUT.bar)] },
  { id: 'dinner', name: 'Dinner', items: [food('Plain oatmeal', 2, 'cup cooked', 166, 5.9, NUT.oats)] },
  { id: 'shake', name: 'Protein shake', items: [
    food('Whey protein', 1, 'scoop (30 g)', 120, 24, NUT.whey),
    food('Creatine (ON)', 1, '5 g scoop', 0, 0, {}),
    food('Banana', 1, 'medium', 105, 1.3, NUT.banana),
    food('Strawberries', 2, 'berry', 4, .1, NUT.berry),
    food('Spinach', 1, 'handful (30 g)', 7, .9, NUT.spinach),
    food('Water and a pinch of salt', 1, 'serving', 0, 0, NUT.salt),
  ] },
];
// Name lookup used to fill nutrients into meal plans saved before nutrition existed.
const NUT_BY_NAME = Object.fromEntries(DEFAULT_MEALS.flatMap(m => m.items).map(it => [it.name.toLowerCase(), it]));
NUT_BY_NAME['whole eggs'] = NUT_BY_NAME.eggs;

// What we track, with FDA Daily Values (the % DV on US food labels).
const NUTRIENTS = [
  { k: 'protein', label: 'Protein', unit: 'g', dv: 50, macro: true },
  { k: 'carbs', label: 'Carbs', unit: 'g', dv: 275, macro: true },
  { k: 'fat', label: 'Fat', unit: 'g', dv: 78, macro: true },
  { k: 'satFat', label: 'Saturated fat', unit: 'g', dv: 20, limit: true },
  { k: 'fiber', label: 'Fiber', unit: 'g', dv: 28 },
  { k: 'sugar', label: 'Sugars', unit: 'g' },
  { k: 'sodium', label: 'Sodium', unit: 'mg', dv: 2300, limit: true },
  { k: 'chol', label: 'Cholesterol', unit: 'mg', dv: 300, limit: true },
  { k: 'potassium', label: 'Potassium', unit: 'mg', dv: 4700, micro: true },
  { k: 'calcium', label: 'Calcium', unit: 'mg', dv: 1300, micro: true },
  { k: 'iron', label: 'Iron', unit: 'mg', dv: 18, micro: true },
  { k: 'magnesium', label: 'Magnesium', unit: 'mg', dv: 420, micro: true },
  { k: 'vitD', label: 'Vitamin D', unit: 'mcg', dv: 20, micro: true },
  { k: 'vitC', label: 'Vitamin C', unit: 'mg', dv: 90, micro: true },
  { k: 'b12', label: 'Vitamin B12', unit: 'mcg', dv: 2.4, micro: true },
  { k: 'folate', label: 'Folate', unit: 'mcg', dv: 400, micro: true },
  { k: 'choline', label: 'Choline', unit: 'mg', dv: 550, micro: true },
  { k: 'omega3', label: 'Omega-3 (EPA + DHA)', unit: 'mg', target: 500, micro: true },
];
const NDEF = Object.fromEntries(NUTRIENTS.map(n => [n.k, n]));
const N_EXTRA = NUTRIENTS.filter(n => n.k !== 'protein').map(n => n.k);
const MISS_REASONS = [
  { id: 'vacation', label: 'Vacation', color: '#4285F4' },
  { id: 'laziness', label: 'Laziness', color: '#EA4335' },
  { id: 'prep', label: 'Exam or interview prep', color: '#A142F4' },
  { id: 'sick', label: 'Sick or injured', color: '#F9AB00' },
  { id: 'work', label: 'Work or school', color: '#12A4B9' },
  { id: 'other', label: 'Other', color: '#80868B' },
];
const reasonOf = (id) => MISS_REASONS.find(r => r.id === id);

function defaultData() {
  return {
    version: 1,
    settings: {
      startDate: todayStr(),
      resets: [],
      cycle: ['train', 'train', 'rest'],
      profile: { sex: 'male', age: null, heightIn: null },
      reminder: { on: true, time: '13:00' },
      theme: 'light',
      threshold: 0.5,
      liftMet: 3.5,
      minPerSetSide: 1.25,
      weightStep: 5,  // lb added when you're ready to go up
      dropMin: 0.5,   // extra minutes of work per drop set to failure
      dropMet: 6,     // vigorous resistance training (Compendium of Physical Activities)
      activityFactor: 1.2,
      healthSources: [],
      sync: { enabled: false, port: 47821, key: null },
      watchDir: null,
      background: false,
      goals: { move: 500, exercise: 30, stand: 12 },
      breaks: [],
      share: { enabled: false, workouts: true, cardio: true, food: true, weight: true, calories: true, foodAfter: '21:00' },
      lastNotified: null,
    },
    program: structuredClone(DEFAULT_PROGRAM),
    meals: structuredClone(DEFAULT_MEALS),
    days: {},
    health: {},
  };
}

// ======================================================================
// Storage (Electron file storage, browser fallback for previews)
// ======================================================================
const store = {
  async load() {
    if (window.api) return window.api.load();
    try { return JSON.parse(localStorage.getItem('wt-data')); } catch { return null; }
  },
  async save(d) {
    if (window.api) return window.api.save(d);
    try { localStorage.setItem('wt-data', JSON.stringify(d)); } catch {}
  },
};
let data;
let saveTimer;
function save() {
  memo.clear();
  workbookDirty = true;
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => store.save(data), 300);
}
window.addEventListener('beforeunload', () => { clearTimeout(saveTimer); store.save(data); });

const memo = new Map();
const memoize = (key, fn) => { if (!memo.has(key)) memo.set(key, fn()); return memo.get(key); };

// ======================================================================
// Program helpers
// ======================================================================
const liftBlocks = () => data.program.blocks.filter(b => b.type !== 'cardio');
const cardioBlocks = () => data.program.blocks.filter(b => b.type === 'cardio');
const allExercises = () => liftBlocks().flatMap(b => b.exercises);
const sidesOf = (e) => e.perSide ? ['L', 'R'] : ['B'];
const SIDE_LABEL = { L: 'Left', R: 'Right', B: 'Both' };

function getDay(date) {
  const d = (data.days[date] ||= {});
  d.sets ||= {}; d.exNotes ||= {}; d.cardio ||= {}; d.food ||= {}; d.custom ||= [];
  return d;
}
function cell(rec, exId, i, side) {
  return rec?.sets?.[exId]?.[i]?.[side];
}
function setCell(date, exId, i, side, patch) {
  const rec = getDay(date);
  const arr = (rec.sets[exId] ||= []);
  const row = (arr[i] ||= {});
  row[side] = { r: 0, w: null, d: false, c: false, ...(row[side] || {}), ...patch };
  if (!rec.startedAt) rec.startedAt = Date.now();
}

function progress(rec) {
  let total = 0, done = 0, sidesDone = 0;
  for (const e of allExercises()) {
    for (let i = 0; i < e.sets; i++) for (const s of sidesOf(e)) {
      total++;
      if (cell(rec, e.id, i, s)?.c) { done++; sidesDone++; }
    }
  }
  for (const b of cardioBlocks()) for (const it of b.items) { total++; if (rec?.cardio?.[it.id]?.done) done++; }
  return { total, done, pct: total ? done / total : 0, sidesDone };
}
function exProgress(rec, e) {
  let t = 0, d = 0;
  for (let i = 0; i < e.sets; i++) for (const s of sidesOf(e)) { t++; if (cell(rec, e.id, i, s)?.c) d++; }
  return { t, d };
}
const isDone = (rec) => !!rec && (rec.done || progress(rec).pct >= data.settings.threshold);
const hasActivity = (rec) => !!rec && progress(rec).done > 0;

// ======================================================================
// Schedule: derived from start date, manual restarts and what you logged.
// A training day that passes without a workout is a miss, and the next day becomes Day 1.
// ======================================================================
// Planned time off (surgery, vacation...): no training, not a miss, cycle restarts at Day 1 after.
const breakOn = (d) => (data.settings.breaks || []).find(b => b.start && b.end && d >= b.start && d <= b.end);
function schedule() {
  return memoize('schedule', () => {
    const s = data.settings, L = s.cycle.length, today = todayStr();
    const resets = new Set(s.resets);
    const out = {};
    let anchor = s.startDate;
    const end = addDays(today, 120);
    for (let d = s.startDate; d <= end; d = addDays(d, 1)) {
      if (resets.has(d)) anchor = d;
      const br = breakOn(d);
      if (br) { out[d] = { day: 0, kind: 'off', status: 'off', label: br.label || 'Time off', until: br.end, breakId: br.id }; anchor = addDays(d, 1); continue; }
      const idx = mod(diffDays(anchor, d), L);
      const kind = s.cycle[idx];
      const rec = data.days[d];
      let status;
      if (d <= today && rec?.skip) { status = 'missed'; out[d] = { day: idx + 1, kind, status }; anchor = addDays(d, 1); continue; }
      if (d < today) {
        if (kind === 'train') { if (isDone(rec)) status = 'done'; else { status = 'missed'; anchor = addDays(d, 1); } }
        else status = isDone(rec) ? 'extra' : 'rest';
      } else if (d === today) {
        status = kind === 'train' ? (isDone(rec) ? 'done' : 'today') : (isDone(rec) ? 'extra' : 'rest');
      } else status = kind === 'train' ? 'planned' : 'rest';
      out[d] = { day: idx + 1, kind, status };
    }
    return out;
  });
}
const sched = (d) => schedule()[d] || (d < data.settings.startDate ? { day: 0, kind: 'before', status: 'before' } : { day: 0, kind: 'train', status: 'planned' });

function stats() {
  return memoize('stats', () => {
    const sc = schedule(), today = todayStr();
    const dates = Object.keys(sc).filter(d => d <= today).sort();
    // Streak: consecutive on-plan days ending today (today counts once done) or yesterday.
    let streak = 0;
    for (let i = dates.length - 1; i >= 0; i--) {
      const st = sc[dates[i]].status;
      if (dates[i] === today && st === 'today') continue;
      if (st === 'off') continue;
      if (st === 'missed') break;
      streak++;
    }
    let longest = 0, run = 0;
    for (const d of dates) { const st = sc[d].status; if (st === 'missed') run = 0; else if (st !== 'today' && st !== 'off') { run++; longest = Math.max(longest, run); } }
    const workouts = dates.filter(d => ['done', 'extra'].includes(sc[d].status)).length;
    const last30 = dates.filter(d => diffDays(d, today) < 30);
    const done30 = last30.filter(d => sc[d].status === 'done' || sc[d].status === 'extra').length;
    const missed30 = last30.filter(d => sc[d].status === 'missed').length;
    const rate30 = done30 + missed30 ? done30 / (done30 + missed30) : null;
    const missed = dates.filter(d => sc[d].status === 'missed');
    const reasons = {};
    for (const d of missed) { const r = data.days[d]?.miss?.reason || 'unset'; reasons[r] = (reasons[r] || 0) + 1; }
    return { streak, longest, workouts, done30, missed30, rate30, missed, reasons };
  });
}

// ======================================================================
// Calories and body weight
// ======================================================================
function weightOn(date) {
  return data.days[date]?.weight ?? data.health[date]?.weightLb ?? null;
}
function latestWeight(date) {
  return memoize('w' + date, () => {
    const ds = new Set([...Object.keys(data.days).filter(d => data.days[d].weight), ...Object.keys(data.health).filter(d => data.health[d].weightLb)]);
    const sorted = [...ds].filter(d => d <= date).sort();
    return sorted.length ? weightOn(sorted[sorted.length - 1]) : null;
  });
}
function bmr(date) {
  const p = data.settings.profile, lb = latestWeight(date);
  if (!p.age || !p.heightIn || !lb) return null;
  const kg = lb / 2.20462, cm = p.heightIn * 2.54;
  return 10 * kg + 6.25 * cm - 5 * p.age + (p.sex === 'female' ? -161 : 5);
}
const kcalPerMin = (met, date) => met * 3.5 * ((latestWeight(date) || 170) / 2.20462) / 200;

function planItemById(id) {
  for (const m of data.meals) for (const it of m.items) if (it.id === id) return { it, meal: m };
  return null;
}
// Everything eaten on a day, as entries { name, meal, qty, kcal, protein, n }.
function dayEntries(rec) {
  const out = [];
  for (const [id, f] of Object.entries(rec?.food || {})) {
    if (!f.on) continue;
    const p = planItemById(id);
    out.push({ name: f.name || p?.it.name || 'Food', meal: p?.meal.name || 'Other', qty: +f.qty || 0, kcal: +f.kcal || 0, protein: +f.protein || 0, n: f.n || p?.it.n || {} });
  }
  for (const c of rec?.custom || []) out.push({ name: c.name, meal: 'Extras', qty: 1, kcal: +c.kcal || 0, protein: +c.protein || 0, n: { carbs: +c.carbs || 0, fat: +c.fat || 0 } });
  return out;
}
// The meal plan as written, if you eat everything.
const planEntries = () => data.meals.flatMap(m => m.items.map(it => ({ name: it.name, meal: m.name, qty: +it.qty || 0, kcal: +it.kcal || 0, protein: +it.protein || 0, n: it.n || {} })));
function nutrition(entries) {
  const t = { kcal: 0, protein: 0 }, src = {}, meals = {};
  for (const k of N_EXTRA) t[k] = 0;
  const add = (k, name, v) => { if (!v) return; t[k] += v; ((src[k] ||= {})[name] = (src[k][name] || 0) + v); };
  for (const e of entries) {
    const m = (meals[e.meal] ||= { kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0 });
    t.kcal += e.qty * e.kcal; m.kcal += e.qty * e.kcal;
    add('protein', e.name, e.qty * e.protein); m.protein += e.qty * e.protein;
    for (const k of N_EXTRA) { const v = e.qty * (+e.n?.[k] || 0); add(k, e.name, v); if (k in m) m[k] += v; }
  }
  const top = (k) => Object.entries(src[k] || {}).sort((a, b) => b[1] - a[1]).map(([name, v]) => ({ name, v }));
  return { t, top, meals, count: entries.length };
}
function foodTotals(rec) {
  const { t } = nutrition(dayEntries(rec));
  return { kcal: t.kcal, protein: t.protein };
}
// Average daily nutrition over the last `days` days that have food logged.
function averageNutrition(days) {
  const today = todayStr(), logged = [];
  for (let i = 0; i < days; i++) { const d = addDays(today, -i); const e = dayEntries(data.days[d]); if (e.length) logged.push(e); }
  if (!logged.length) return { ...nutrition([]), days: 0 };
  const all = logged.flat().map(e => ({ ...e, qty: e.qty / logged.length }));
  return { ...nutrition(all), days: logged.length };
}
const snap = (it, on, qty) => ({ on, qty: qty ?? it.qty, kcal: it.kcal, protein: it.protein, n: it.n || {}, name: it.name });
// Drop sets: only the last set of an exercise has one.
function dropsDone(rec) {
  let n = 0;
  for (const e of allExercises()) {
    if (!e.drop) continue;
    for (const side of sidesOf(e)) if (cell(rec, e.id, e.sets - 1, side)?.d) n++;
  }
  return n;
}
// Lifting energy: logged sets at moderate effort, plus drop sets at vigorous effort.
// With a measured session length, the drop time is already inside it, so only the extra intensity is added.
function liftEnergy(rec, date, realMinutes) {
  const s = data.settings, drops = dropsDone(rec), dropTime = drops * (s.dropMin ?? 0.5);
  const kLift = kcalPerMin(s.liftMet, date), kDrop = kcalPerMin(s.dropMet ?? 6, date);
  if (realMinutes) return { minutes: realMinutes, kcal: realMinutes * kLift + dropTime * Math.max(0, kDrop - kLift), drops, dropK: dropTime * Math.max(0, kDrop - kLift) };
  const base = progress(rec).sidesDone * s.minPerSetSide;
  return { minutes: base + dropTime, kcal: base * kLift + dropTime * kDrop, drops, dropK: dropTime * kDrop };
}
function calories(date) {
  const rec = data.days[date], h = data.health[date], s = data.settings;
  const { kcal: inK, protein } = foodTotals(rec);
  const p = progress(rec);
  const lift = liftEnergy(rec, date);
  const liftK = lift.kcal;
  let cardioK = 0;
  for (const b of cardioBlocks()) for (const it of b.items) cardioK += (+rec?.cardio?.[it.id]?.min || 0) * kcalPerMin(it.met || 6, date);
  const b = bmr(date);
  let out = null, basis = '';
  if (rec?.outOverride) { out = +rec.outOverride; basis = 'Entered by you'; }
  else if (h?.total) { out = h.total; basis = `From ${h.source || 'imported data'}`; }
  else if (h?.active && (h.basal || b)) { out = (h.basal || b) + h.active; basis = `Active energy from ${h.source || 'imported data'}`; }
  else if (b) { out = b * s.activityFactor + liftK + cardioK; basis = 'Estimated from your profile and logged training'; }
  return { inK, protein, out, basis, liftK, cardioK, drops: lift.drops, dropK: lift.dropK, bmr: b, net: out != null ? inK - out : null, steps: h?.steps };
}

// ======================================================================
// Last session lookups (weight placeholders, "last time" line)
// ======================================================================
const loggedDates = () => memoize('logged', () => Object.keys(data.days).sort());
function lastSession(exId, before) {
  const ds = loggedDates();
  for (let i = ds.length - 1; i >= 0; i--) {
    const d = ds[i];
    if (d >= before) continue;
    const arr = data.days[d].sets?.[exId];
    if (arr && arr.some(r => r && Object.values(r).some(c => c?.c))) return { date: d, sets: arr };
  }
  return null;
}
function suggestWeight(e, date, i, side) {
  const prog = progression(e, date);
  if (prog?.kind === 'up') return prog.to;
  const last = lastSession(e.id, date);
  const c = last?.sets?.[i]?.[side] || last?.sets?.[i]?.L || last?.sets?.[i]?.B;
  return c?.w ?? e.wMin ?? '';
}
// Logged sessions of one exercise before a date, newest first.
function sessionsOf(exId, before, limit = 6) {
  const out = [], ds = loggedDates();
  for (let i = ds.length - 1; i >= 0 && out.length < limit; i--) {
    const d = ds[i];
    if (d >= before) continue;
    const arr = data.days[d].sets?.[exId];
    if (arr && arr.some(r => r && Object.values(r).some(c => c?.c))) out.push({ date: d, sets: arr });
  }
  return out;
}
// Double progression: once every set hits the top of the rep range, go up one weight jump.
function progression(e, date) {
  return memoize(`prog:${e.id}:${date}`, () => {
    const ss = sessionsOf(e.id, date);
    if (!ss.length) return null;
    const last = ss[0], top = e.repMax || e.repMin || 0;
    let allTop = true, below = false;
    const weights = [];
    for (let i = 0; i < e.sets; i++) for (const side of sidesOf(e)) {
      const c = last.sets?.[i]?.[side];
      if (!c?.c) { allTop = false; continue; }
      if ((+c.r || 0) < top) allTop = false;
      if ((+c.r || 0) < (e.repMin || 0)) below = true;
      if (c.w != null && c.w !== '') weights.push(+c.w);
    }
    if (!weights.length) return null;
    const w = Math.max(...weights);
    const step = +data.settings.weightStep || 5;
    const reps = sessionTop(last.sets).reps.join('/');
    if (allTop) return { kind: 'up', from: w, to: w + step, reps, date: last.date };
    // Stuck: same weight for 3 sessions and the total reps stopped climbing.
    const three = ss.slice(0, 3), repSum = (x) => sessionTop(x.sets).reps.reduce((a, r) => a + (+r || 0), 0);
    if (three.length === 3 && three.every(x => sessionTop(x.sets).top === w) && repSum(three[0]) <= repSum(three[2])) return { kind: 'stuck', at: w, reps, date: last.date };
    return { kind: below ? 'hold' : 'build', at: w, target: top, reps, date: last.date };
  });
}
function progressChip(e, date) {
  const p = progression(e, date);
  if (!p) return '';
  if (p.kind === 'up') return `<span class="prog-chip up">Ready to go up: ${p.to} lb today</span>`;
  if (p.kind === 'stuck') return `<span class="prog-chip stuck">Same ${p.at} lb for 3 sessions. Chase one more rep per set.</span>`;
  return `<span class="prog-chip build">${p.target} reps on every set at ${p.at} lb, then go up</span>`;
}
function sessionTop(arr) {
  let top = 0, vol = 0, reps = [];
  for (const r of arr || []) {
    if (!r) continue;
    for (const c of Object.values(r)) if (c?.c) { top = Math.max(top, +c.w || 0); vol += (+c.w || 0) * (+c.r || 0); }
    const first = r.L || r.B;
    if (first?.c) reps.push(first.r);
  }
  return { top, vol, reps };
}

// ======================================================================
// App state and routing
// ======================================================================
const ui = {
  view: 'today',
  date: todayStr(),
  open: {},          // exercise open/closed overrides for the current date
  notesOpen: {},
  month: todayStr().slice(0, 7),
  progEx: 'floor-press',
  range: 90,
  dismissedMisses: false,
};

function go(view, opts = {}) {
  Object.assign(ui, opts, { view });
  render();
  $('#view').scrollTop = 0;
}
function render() {
  memo.clear();
  $$('.nav-btn').forEach(b => b.classList.toggle('active', b.dataset.nav === ui.view));
  const v = $('#view');
  const scroll = v.scrollTop;
  v.innerHTML = ({ today: viewToday, calendar: viewCalendar, progress: viewProgress, nutrition: viewNutrition, history: viewHistory, settings: viewSettings })[ui.view]();
  v.scrollTop = scroll;
  if (ui.pop) { $(ui.pop)?.classList.add('pop'); ui.pop = null; }
  if (ui.view === 'progress') hydrateCharts();
  if (ui.view === 'settings' && window.api) {
    window.api.loginItem().then(on => { const t = $('#login-toggle'); if (t) t.checked = on; }).catch(() => {});
    window.api.info().then(i => { const el = $('#data-dir'); if (el) el.textContent = `Saved automatically to ${i.dataDir}, with 30 days of daily backups.`; }).catch(() => {});
  }
  renderNavFoot();
}
function renderNavFoot() {
  const st = stats();
  $('#nav-foot').innerHTML = `<div class="streak" title="Days in a row on plan"><strong>${st.streak}</strong><span>day streak</span></div>`;
}
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2200);
}

// ======================================================================
// Today view
// ======================================================================
function cycleWord(sc) {
  const L = data.settings.cycle.length;
  if (sc.kind === 'before') return 'Before your plan started';
  if (sc.kind === 'off') return sc.label;
  return `Day ${sc.day} of ${L}`;
}
function ring(pct, label) {
  const r = 26, c = 2 * Math.PI * r;
  return `<svg class="ring" viewBox="0 0 64 64" aria-label="${Math.round(pct * 100)}% done"><circle cx="32" cy="32" r="${r}" class="ring-track"/><circle cx="32" cy="32" r="${r}" class="ring-fill" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"/></svg><span class="ring-label">${label}</span>`;
}

function viewToday() {
  const date = ui.date, today = todayStr();
  const sc = sched(date);
  const rec = data.days[date];
  const p = progress(rec);
  const cal = calories(date);
  const st = stats();
  const isFuture = date > today;
  const isPast = date < today;
  const blocksTitle = liftBlocks().map(b => b.name.toLowerCase()).join(', ');
  let sub;
  if (sc.status === 'missed') sub = `Missed. ${rec?.miss?.reason ? reasonOf(rec.miss.reason)?.label + '.' : 'No reason logged yet.'} The next day restarted at Day 1.`;
  else if (sc.kind === 'off') sub = `No training scheduled. You're back on ${longDate(addDays(sc.until, 1), { weekday: 'long', month: 'long', day: 'numeric' })}, starting at Day 1.`;
  else if (sc.kind === 'rest') sub = 'Rest day. Eat well, sleep well, come back for Day 1 tomorrow.';
  else if (sc.kind === 'before') sub = 'Your plan starts on ' + longDate(data.settings.startDate) + '.';
  else sub = `Training: ${blocksTitle}, then ${cardioBlocks().flatMap(b => b.items).map(i => i.name).join(', ')}.`;

  const statusPill = {
    done: '<span class="pill ok">Workout done</span>', extra: '<span class="pill ok">Bonus session</span>',
    missed: '<span class="pill miss">Missed</span>', rest: '<span class="pill rest">Rest</span>',
    off: '',
    today: `<span class="pill live">${p.done ? 'In progress' : 'Not started'}</span>`, planned: '<span class="pill">Planned</span>',
    before: '',
  }[sc.status] || '';

  return `
  <div class="today ${isFuture ? 'is-future' : ''}">
    <header class="day-head">
      <div class="day-nav">
        <button class="icon-btn" data-action="day-prev" aria-label="Previous day">${ICON.left}</button>
        <button class="chip ${date === today ? 'chip-on' : ''}" data-action="day-today">Today</button>
        <button class="icon-btn" data-action="day-next" aria-label="Next day">${ICON.right}</button>
        <input type="date" class="date-jump" value="${date}" data-action="day-jump" aria-label="Jump to date">
      </div>
      <div class="day-title-row">
        <div>
          <h1 class="date-title"><span>${esc(longDate(date, { weekday: 'long' }))}</span>${esc(longDate(date, { month: 'long', day: 'numeric' }))}</h1>
          <p class="day-sub"><span class="cycle-tag tag-${sc.kind}">${cycleWord(sc)}</span>${statusPill}</p>
          <p class="day-desc">${esc(sub)}</p>
        </div>
        <div class="summary">
          <div class="sum-item sum-ring">${ring(sc.kind === 'rest' && !p.done ? 0 : p.pct, `${Math.round(p.pct * 100)}%`)}<div><b>${p.done}/${p.total}</b><small>checks done</small></div></div>
          <div class="sum-item"><b>${num(cal.inK)}</b><small>kcal in</small></div>
          <div class="sum-item"><b>${num(cal.out)}</b><small>kcal out</small></div>
          <div class="sum-item"><b class="${cal.net == null ? '' : cal.net > 0 ? 'pos' : 'neg'}">${cal.net == null ? '–' : (cal.net > 0 ? '+' : '') + num(cal.net)}</b><small>net</small></div>
          <div class="sum-item"><b>${num(cal.protein)}<i>g</i></b><small>protein</small></div>
          <div class="sum-item"><b>${st.streak}</b><small>day streak</small></div>
        </div>
      </div>
    </header>
    ${date === todayStr() ? backupNudge() : ''}
    ${nudge(date, sc, p)}
    <div class="cols">
      <section class="workout-col" aria-label="Workout">
        ${workoutSection(date, sc, rec, p, isFuture, isPast)}
      </section>
      <aside class="fuel-col" aria-label="Food and calories">
        ${activityCard(date)}
        ${caloriesCard(date, cal)}
        ${nutritionCard(date)}
        ${weightCard(date)}
        ${mealsCard(date)}
      </aside>
    </div>
  </div>`;
}

function nudge(date, sc, p) {
  if (date !== todayStr() || sc.status !== 'today' || p.done > 0) return '';
  const rec = data.days[date];
  const mealDone = (id) => { const m = data.meals.find(x => x.id === id); return m && m.items.length && m.items.every(it => rec?.food?.[it.id]?.on); };
  const after = mealDone('lunch') ? 'Lunch is in' : mealDone('breakfast') ? 'Breakfast is in' : null;
  if (!after) return '';
  return `<div class="nudge"><span class="nudge-dot"></span><p><b>${after}.</b> This is when you usually train. Block 1 is ready when you are.</p><button class="btn btn-small" data-action="start-workout">Start Block 1</button></div>`;
}

function workoutSection(date, sc, rec, p, isFuture, isPast) {
  let pre = '';
  if (sc.status === 'missed') {
    pre = missCard(date, rec);
  } else if (sc.kind === 'rest' && !hasActivity(rec)) {
    return `
      <div class="rest-card">
        <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M40 10a22 22 0 1 0 14 38A24 24 0 0 1 40 10Z"/></svg>
        <div>
          <h2>Rest day</h2>
          <p>Day ${sc.day} of ${data.settings.cycle.length}. Recovery is where the growth happens. Hit your food and protein today.</p>
          ${date === todayStr() ? `<div class="row-gap"><button class="btn" data-action="train-anyway">Train today instead</button><span class="hint">Restarts your cycle at Day 1 today.</span></div>` : ''}
        </div>
      </div>`;
  } else if (sc.kind === 'off' && !hasActivity(rec)) {
    const left = diffDays(date, sc.until) + 1;
    return `
      <div class="rest-card off-card">
        <svg viewBox="0 0 64 64" aria-hidden="true"><path d="M32 6c2 9 9 16 18 18-9 2-16 9-18 18-2-9-9-16-18-18 9-2 16-9 18-18Z"/><circle cx="50" cy="48" r="6"/><circle cx="14" cy="50" r="4"/></svg>
        <div>
          <h2>${esc(sc.label)}</h2>
          <p>No workouts until ${esc(longDate(addDays(sc.until, 1), { weekday: 'long', month: 'long', day: 'numeric' }))}. ${left === 1 ? 'Last day off.' : `${left} days to go, counting today.`} These days don't count as misses or break your streak. Keep logging food and protein; it helps you recover.</p>
          <div class="row-gap"><button class="btn btn-small" data-action="edit-breaks">Edit time off</button></div>
        </div>
      </div>
      ${recoveryCard(date, sc)}`;
  } else if (sc.kind === 'before') {
    return `<div class="rest-card"><div><h2>Before your plan</h2><p>Your plan starts ${esc(longDate(data.settings.startDate))}. Change the start date in Settings.</p></div></div>`;
  }
  if (isFuture) pre += `<div class="preview-note">Preview of Day ${sc.day}. You can check things off on the day.</div>`;

  const blocks = data.program.blocks.map((b, bi) => b.type === 'cardio' ? cardioBlock(date, b, bi, rec) : liftBlock(date, b, bi, rec)).join('');
  const done = rec?.done;
  const finish = isFuture ? '' : `
    <div class="finish">
      <label class="field grow"><span>Workout notes</span>
        <textarea rows="2" data-input="day-note" placeholder="How did it feel? Anything to change next time?">${esc(rec?.note || '')}</textarea>
      </label>
      <div class="finish-actions">
        ${done
          ? `<span class="done-stamp">${ICON.check} Finished ${rec.finishedAt ? new Date(rec.finishedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' }) : ''}</span><button class="btn btn-ghost btn-small" data-action="unfinish">Undo</button>`
          : `<button class="btn btn-primary" data-action="finish" ${p.done ? '' : 'disabled'}>Finish workout</button>`}
        ${date === todayStr() && sc.status === 'today' && !p.done ? `<button class="btn btn-ghost btn-small" data-action="skip-today">Skip today</button>` : ''}
      </div>
    </div>`;
  return pre + `<div class="blocks ${isFuture ? 'readonly' : ''}">${blocks}</div>` + finish;
}

// ---------- Recovery checklist (time off) ----------
const PAIN_COLORS = ['#35A174', '#4BA86F', '#6AAE62', '#8FB352', '#B3B444', '#C9A815', '#D9902A', '#E07A3C', '#E0604E', '#D9485E', '#C4314B'];
function recoveryCard(date, sc) {
  const br = (data.settings.breaks || []).find(b => b.id === sc.breakId);
  if (!br) return '';
  const items = br.items || [], rec = data.days[date], done = rec?.rehab || {};
  const editing = ui.rehabEdit === br.id || !items.length;
  const future = date > todayStr();
  const total = items.reduce((a, it) => a + (+it.times || 1), 0), got = items.reduce((a, it) => a + Math.min(+done[it.id] || 0, +it.times || 1), 0);
  const list = items.map(it => {
    const times = +it.times || 1, n = Math.min(+done[it.id] || 0, times);
    return `<li class="rehab ${n >= times ? 'complete' : ''}" data-rehab="${it.id}">
      <div class="rehab-text"><b>${esc(it.name)}</b>${it.detail ? `<small>${esc(it.detail)}</small>` : ''}</div>
      <div class="rehab-ticks">${Array.from({ length: times }, (_, k) => `<button class="check ${k < n ? 'on' : ''}" data-action="rehab" data-n="${k + 1}" ${future ? 'disabled' : ''} aria-label="${esc(it.name)}, ${k + 1} of ${times}">${ICON.check}</button>`).join('')}</div>
      ${editing ? `<button class="icon-btn sm" data-action="rehab-del" aria-label="Remove">${ICON.x}</button>` : ''}
    </li>`;
  }).join('');
  return `<section class="card recovery-card">
    <header class="card-head"><h2>Recovery checklist</h2>${items.length ? `<span class="block-count">${got}/${total}</span>` : ''}</header>
    ${items.length ? `<ul class="rehab-list">${list}</ul>` : `<p class="hint">Add the exercises your physical therapist gives you, with how many times a day. They show up here to check off every day of your time off.</p>`}
    ${editing ? `<form class="rehab-add" data-form="rehab" data-break="${br.id}">
        <input name="name" placeholder="Exercise (e.g. quad sets)" required aria-label="Exercise">
        <input name="detail" placeholder="Details (e.g. 3 x 10, hold 5 s)" aria-label="Details">
        <label class="wt"><input name="times" type="number" min="1" max="12" value="1" aria-label="Times a day"><span>/day</span></label>
        <button class="btn btn-small" type="submit">Add</button>
      </form>` : ''}
    ${items.length ? `<button class="link-btn" data-action="rehab-edit" data-break="${br.id}">${editing ? 'Done editing' : 'Edit list'}</button>` : ''}
    ${!future ? `<div class="pain">
      <span>Pain today</span>
      <div class="pain-scale">${PAIN_COLORS.map((c, k) => `<button class="pain-dot ${rec?.pain === k ? 'on' : ''}" style="--pc:${c}" data-action="pain" data-n="${k}" aria-label="Pain ${k} of 10">${k}</button>`).join('')}</div>
    </div>
    <label class="field"><span>Notes for your PT</span><textarea rows="2" data-input="rehab-note" placeholder="Swelling, range of motion, how the knee felt">${esc(rec?.rehabNote || '')}</textarea></label>` : ''}
  </section>`;
}

function missCard(date, rec) {
  const r = rec?.miss?.reason;
  return `<div class="miss-card">
    <h2>${date === todayStr() ? 'You skipped today' : 'You missed this day'}</h2>
    <p>Why? This shows up in your consistency stats.</p>
    <div class="reason-chips">${MISS_REASONS.map(x => `<button class="reason ${r === x.id ? 'on' : ''}" style="--rc:${x.color}" data-action="set-reason" data-reason="${x.id}">${x.label}</button>`).join('')}</div>
    <label class="field"><span>Note</span><input type="text" data-input="miss-note" value="${esc(rec?.miss?.note || '')}" placeholder="Optional"></label>
    ${rec?.skip
      ? `<button class="btn btn-ghost btn-small" data-action="unskip">I'm training after all</button>`
      : `<p class="hint">Did you actually train? Log it below and this day counts as done.</p>`}
  </div>`;
}

function liftBlock(date, b, bi, rec) {
  const exs = b.exercises;
  let t = 0, d = 0;
  for (const e of exs) { const p = exProgress(rec, e); t += p.t; d += p.d; }
  return `
  <section class="block hue-${b.hue} ${t && d === t ? 'all-done' : ''}" id="block-${b.id}">
    <header class="block-head">
      <span class="block-num">${bi + 1}</span>
      <div class="block-name"><h2>${esc(b.name)}</h2><small>Block ${bi + 1}, ${exs.length} exercises</small></div>
      <div class="block-bar" aria-label="${d} of ${t}"><span style="width:${t ? d / t * 100 : 0}%"></span></div>
      <span class="block-count">${d}/${t}</span>
    </header>
    <div class="block-body">${exs.map(e => exerciseRow(date, e, rec)).join('')}</div>
  </section>`;
}

function exerciseRow(date, e, rec) {
  const p = exProgress(rec, e);
  const complete = p.d === p.t;
  const key = date + ':' + e.id;
  const open = ui.open[key] ?? !complete;
  const last = lastSession(e.id, date);
  const lastTxt = last ? (() => { const s = sessionTop(last.sets); return `Last time (${shortDate(last.date)}): ${s.top ? s.top + ' lb, ' : ''}${s.reps.join(' / ')} reps`; })() : '';
  const meta = [
    `${e.sets} sets`,
    `${e.repMin}${e.repMax && e.repMax !== e.repMin ? '–' + e.repMax : ''} reps${e.perSide ? ' per side' : ''}`,
    e.wMin ? `${e.wMin}${e.wMax && e.wMax !== e.wMin ? '–' + e.wMax : ''} lb` : null,
    e.drop ? 'dropset on the last set' : null,
  ].filter(Boolean).join(', ');
  const note = rec?.exNotes?.[e.id] || '';
  const noteOpen = ui.notesOpen[key] || !!note;
  let rows = '';
  for (let i = 0; i < e.sets; i++) {
    rows += `<div class="set"><div class="set-label">Set ${i + 1}</div><div class="set-sides">`;
    for (const s of sidesOf(e)) rows += sideRow(date, e, i, s, rec);
    rows += `</div></div>`;
  }
  return `
  <article class="ex ${complete ? 'complete' : ''} ${open ? 'open' : ''}" data-ex="${e.id}">
    <button class="ex-head" data-action="toggle-ex" data-ex="${e.id}" aria-expanded="${open}">
      <span class="ex-check">${complete ? ICON.check : ''}</span>
      <span class="ex-text"><span class="ex-name">${esc(e.name)}</span><span class="ex-meta">${esc(meta)}</span>${progression(e, date)?.kind === 'up' && !complete ? `<span class="up-flag">Go up to ${progression(e, date).to} lb</span>` : ''}</span>
      <span class="ex-count">${p.d}/${p.t}</span>
      <span class="chev">${ICON.down}</span>
    </button>
    <div class="ex-body">
      ${lastTxt || progressChip(e, date) ? `<div class="last-row">${lastTxt ? `<p class="last">${esc(lastTxt)}</p>` : ''}${progressChip(e, date)}</div>` : ''}
      ${rows}
      <div class="ex-note">
        ${noteOpen
          ? `<textarea rows="2" data-input="ex-note" data-ex="${e.id}" placeholder="Note for this exercise">${esc(note)}</textarea>`
          : `<button class="link-btn" data-action="open-note" data-ex="${e.id}">${ICON.note} Add a note</button>`}
      </div>
    </div>
  </article>`;
}

function sideRow(date, e, i, side, rec) {
  const c = cell(rec, e.id, i, side) || { r: 0, w: null, d: false, c: false };
  const max = Math.max(e.repMax || e.repMin || 12, c.r || 0);
  let dots = '';
  for (let k = 1; k <= max; k++) {
    const inRange = k >= (e.repMin || 0) && k <= (e.repMax || e.repMin || 0);
    dots += `<button class="rep ${k <= c.r ? 'on' : ''} ${inRange ? 'zone' : ''}" data-action="rep" data-n="${k}" aria-label="${k} reps" tabindex="${k === 1 ? 0 : -1}"></button>`;
  }
  const ph = suggestWeight(e, date, i, side);
  return `
  <div class="side ${c.c ? 'checked' : ''}" data-ex="${e.id}" data-set="${i}" data-side="${side}">
    <span class="side-tag">${SIDE_LABEL[side]}</span>
    <div class="reps" role="group" aria-label="Reps">${dots}<button class="rep-more" data-action="rep-more" aria-label="Add a rep">+</button></div>
    <span class="rep-num">${c.r || 0}</span>
    <label class="wt"><input type="number" inputmode="decimal" min="0" step="2.5" value="${c.w ?? ''}" placeholder="${ph}" data-input="weight" aria-label="Weight in pounds"><span>lb</span></label>
    ${e.drop ? (i === e.sets - 1 ? `<button class="drop ${c.d ? 'on' : ''}" data-action="drop" title="Drop set to failure done (about ${num((data.settings.dropMin ?? 0.5) * kcalPerMin(data.settings.dropMet ?? 6, date))} extra kcal)">Drop</button>` : '<span class="drop drop-spacer" aria-hidden="true">Drop</span>') : ''}
    <button class="check ${c.c ? 'on' : ''}" data-action="check" aria-label="Mark ${SIDE_LABEL[side].toLowerCase()} side done">${ICON.check}</button>
  </div>`;
}

function cardioBlock(date, b, bi, rec) {
  const items = b.items.map(it => {
    const c = rec?.cardio?.[it.id] || {};
    const k = (+c.min || 0) * kcalPerMin(it.met || 6, date);
    const quick = [it.minMin, Math.round((it.minMin + it.maxMin) / 2), it.maxMin].filter((v, i, a) => v && a.indexOf(v) === i);
    return `
    <div class="cardio-item ${c.done ? 'checked' : ''}" data-cardio="${it.id}">
      <div class="cardio-main">
        <div class="ex-name">${esc(it.name)}</div>
        <div class="ex-meta">${it.minMin}–${it.maxMin} minutes</div>
      </div>
      <div class="cardio-controls">
        <div class="quick">${quick.map(q => `<button class="chip ${+c.min === q ? 'chip-on' : ''}" data-action="cardio-min" data-min="${q}">${q} min</button>`).join('')}</div>
        <label class="wt"><input type="number" min="0" step="5" value="${c.min || ''}" placeholder="0" data-input="cardio-min" aria-label="Minutes"><span>min</span></label>
        <span class="kcal-est">${k ? '≈ ' + num(k) + ' kcal' : ''}</span>
        <button class="check ${c.done ? 'on' : ''}" data-action="cardio-done" aria-label="Mark done">${ICON.check}</button>
      </div>
    </div>`;
  }).join('');
  const total = b.items.length, d = b.items.filter(it => rec?.cardio?.[it.id]?.done).length;
  return `
  <section class="block hue-saber ${total && d === total ? 'all-done' : ''}" id="block-${b.id}">
    <header class="block-head">
      <span class="block-num">${bi + 1}</span>
      <div class="block-name"><h2>${esc(b.name)}</h2><small>Block ${bi + 1}</small></div>
      <div class="block-bar"><span style="width:${total ? d / total * 100 : 0}%"></span></div>
      <span class="block-count">${d}/${total}</span>
    </header>
    <div class="block-body">${items}</div>
  </section>`;
}

function caloriesCard(date, cal) {
  const rec = data.days[date];
  const p = data.settings.profile;
  const needsProfile = !cal.out && !(p.age && p.heightIn && latestWeight(date));
  const pct = cal.out ? clamp(cal.inK / cal.out, 0, 1.5) : 0;
  return `
  <section class="card cal-card">
    <header class="card-head"><h2>Calories</h2><button class="link-btn" data-action="edit-out">${rec?.outOverride ? 'Edit calories out' : 'Set calories out'}</button></header>
    <div class="cal-grid">
      <div><small>In</small><b>${num(cal.inK)}</b></div>
      <div><small>Out</small><b>${num(cal.out)}</b></div>
      <div><small>Net</small><b class="${cal.net == null ? '' : cal.net > 0 ? 'pos' : 'neg'}">${cal.net == null ? '–' : (cal.net > 0 ? '+' : '') + num(cal.net)}</b></div>
    </div>
    <div class="cal-bar"><span style="width:${Math.min(pct, 1) * 100}%"></span>${pct > 1 ? `<i style="left:${100 / pct}%"></i>` : ''}</div>
    <p class="hint">${needsProfile
      ? 'Add your age and height in Settings, and log your weight, to estimate calories out.'
      : esc(cal.basis) + (cal.liftK || cal.cardioK ? `. Lifting ≈ ${num(cal.liftK)}${cal.drops ? ` (${num(cal.dropK)} from ${cal.drops} drop set${cal.drops === 1 ? '' : 's'})` : ''}, cardio ≈ ${num(cal.cardioK)} kcal.` : '.')}
      ${cal.steps ? ` ${num(cal.steps)} steps.` : ''}</p>
    ${ui.editOut === date ? `<div class="inline-form"><input type="number" data-input="out-override" value="${rec?.outOverride || ''}" placeholder="Total kcal out"><button class="btn btn-small" data-action="save-out">Save</button><button class="btn btn-ghost btn-small" data-action="clear-out">Use estimate</button></div>` : ''}
  </section>`;
}

// ---------- Activity (Apple Fitness rings) ----------
function activityRings(rings) {
  const size = 120, stroke = 13, gap = 3;
  return `<svg class="rings" viewBox="0 0 ${size} ${size}" aria-hidden="true">${rings.map((r, i) => {
    const rad = size / 2 - stroke / 2 - i * (stroke + gap), c = 2 * Math.PI * rad, pct = Math.min(r.pct, 1);
    return `<circle cx="${size / 2}" cy="${size / 2}" r="${rad}" class="ring-bg" style="stroke:${r.bg}"/><circle cx="${size / 2}" cy="${size / 2}" r="${rad}" class="ring-val" style="stroke:${r.color}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - pct)}"/>`;
  }).join('')}</svg>`;
}
function activityCard(date) {
  const h = data.health[date];
  const connected = data.settings.sync?.enabled || data.settings.watchDir;
  const has = h && ['active', 'exercise', 'stand', 'steps'].some(k => h[k] != null);
  if (!has) {
    if (connected || date !== todayStr()) return '';
    return `<section class="card act-card act-empty"><header class="card-head"><h2>Activity</h2></header><p class="hint">Connect Apple Health to see your Move, Exercise and Stand rings, steps and synced weight here.</p><button class="btn btn-small" data-action="go-health">Connect Apple Health</button></section>`;
  }
  const g = data.settings.goals || { move: 500, exercise: 30, stand: 12 };
  const rings = [
    { label: 'Move', v: h.active, goal: g.move, unit: 'kcal', color: 'var(--red)', bg: 'var(--red-c)' },
    { label: 'Exercise', v: h.exercise, goal: g.exercise, unit: 'min', color: 'var(--green)', bg: 'var(--green-c)' },
    { label: 'Stand', v: h.stand, goal: g.stand, unit: 'hr', color: 'var(--blue)', bg: 'var(--blue-c)' },
  ].map(r => ({ ...r, pct: r.v != null && r.goal ? r.v / r.goal : 0 }));
  const extras = [
    h.steps != null && `<span><b>${num(h.steps)}</b> steps</span>`,
    h.restingHR && `<span><b>${h.restingHR}</b> resting bpm</span>`,
    h.sleepH && `<span><b>${h.sleepH}</b> h sleep</span>`,
  ].filter(Boolean).join('');
  const when = h.syncedAt ? `Synced ${new Date(h.syncedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : `From ${esc(h.source || 'imported data')}`;
  return `<section class="card act-card">
    <header class="card-head"><h2>Activity</h2><span class="hint">${when}</span></header>
    <div class="act-body">
      ${activityRings(rings)}
      <ul class="act-list">${rings.map(r => `<li><i style="background:${r.color}"></i><span>${r.label}</span><b>${r.v != null ? num(r.v) : '–'}</b><small>/ ${num(r.goal)} ${r.unit}</small></li>`).join('')}</ul>
    </div>
    ${extras ? `<div class="act-extras">${extras}</div>` : ''}
  </section>`;
}

function weightCard(date) {
  const w = data.days[date]?.weight;
  const prevDates = Object.keys(data.days).filter(d => d < date && data.days[d].weight).sort();
  const prev = prevDates.length ? data.days[prevDates[prevDates.length - 1]].weight : null;
  const delta = w && prev ? round(w - prev, 1) : null;
  return `
  <section class="card weight-card">
    <header class="card-head"><h2>Body weight</h2>${delta != null ? `<span class="delta ${delta > 0 ? 'up' : delta < 0 ? 'down' : ''}">${delta > 0 ? '+' : ''}${delta} lb</span>` : ''}</header>
    <div class="inline-form">
      <label class="wt big"><input type="number" step="0.1" min="0" data-input="body-weight" value="${w ?? ''}" placeholder="${latestWeight(date) ?? '0.0'}"><span>lb</span></label>
      ${!w && data.health[date]?.weightLb ? `<span class="hint">From Apple Health: ${data.health[date].weightLb} lb</span>` : prev ? `<span class="hint">Last: ${prev} lb</span>` : `<span class="hint">Weigh in after waking up for the cleanest trend.</span>`}
    </div>
  </section>`;
}

// ---------- Nutrition helpers ----------
function fmtN(v, unit) {
  if (v == null || !isFinite(v)) return '–';
  if (unit === 'g' || unit === 'mcg') return v < 10 ? round(v, 1).toLocaleString() : Math.round(v).toLocaleString();
  return Math.round(v).toLocaleString();
}
const pctOf = (def, v) => def.dv ? v / def.dv : def.target ? v / def.target : null;
function nutRow(def, v, topSrc) {
  const pct = pctOf(def, v);
  const state = pct == null || def.macro ? 'neutral' : def.limit ? (pct > 1 ? 'over' : '') : (pct >= 1 ? 'good' : pct < .5 ? 'low' : '');
  return `<div class="nut-row ${state}">
    <span class="nut-name">${esc(def.label)}</span>
    <span class="nut-val">${fmtN(v, def.unit)} ${def.unit}</span>
    <span class="nut-bar">${pct == null ? '' : `<i style="width:${Math.min(pct, 1) * 100}%"></i>${def.limit ? '<b class="cap"></b>' : ''}`}</span>
    <span class="nut-pct">${pct == null ? '' : Math.round(pct * 100) + '%'}</span>
    ${topSrc !== undefined ? `<span class="nut-src">${topSrc ? esc(topSrc) : ''}</span>` : ''}
  </div>`;
}
function macroSplit(t) {
  const pk = t.protein * 4, ck = t.carbs * 4, fk = t.fat * 9, sum = pk + ck + fk || 1;
  const parts = [['p', 'Protein', t.protein, pk], ['c', 'Carbs', t.carbs, ck], ['f', 'Fat', t.fat, fk]];
  return `<div class="macro-bar">${parts.map(([c, , , k]) => `<span class="m-${c}" style="width:${k / sum * 100}%"></span>`).join('')}</div>
    <div class="macro-legend">${parts.map(([c, l, g, k]) => `<span><i class="m-${c}"></i>${l}<b>${fmtN(g, 'g')} g</b><small>${Math.round(k / sum * 100)}%</small></span>`).join('')}</div>`;
}
function proteinGoal(date) {
  const w = latestWeight(date);
  return w ? { lo: Math.round(w * .7), hi: Math.round(w * 1), w } : null;
}
function nutritionCard(date) {
  const { t, top, count } = nutrition(dayEntries(data.days[date]));
  if (!count) return `<section class="card nut-card"><header class="card-head"><h2>Nutrition</h2><button class="link-btn" data-nav="nutrition">Full breakdown</button></header><p class="hint">Check off food below to see carbs, fat, fiber, sodium, vitamins and minerals.</p></section>`;
  const g = proteinGoal(date);
  const keys = ['fiber', 'sugar', 'satFat', 'sodium', 'chol'];
  return `<section class="card nut-card">
    <header class="card-head"><h2>Nutrition</h2><button class="link-btn" data-nav="nutrition">Full breakdown</button></header>
    ${macroSplit(t)}
    ${g ? `<div class="goal-row"><span>Protein goal</span><b>${num(t.protein)} of ${g.lo}–${g.hi} g</b><span class="nut-bar"><i style="width:${Math.min(t.protein / g.lo, 1) * 100}%"></i></span></div>` : ''}
    <div class="nut-list">${keys.map(k => nutRow(NDEF[k], t[k])).join('')}</div>
    <details class="nut-more"><summary>Vitamins and minerals</summary><div class="nut-list">${NUTRIENTS.filter(n => n.micro).map(n => nutRow(n, t[n.k])).join('')}</div></details>
    <p class="hint small">% of the daily value on US food labels.</p>
  </section>`;
}

function mealsCard(date) {
  const rec = data.days[date];
  const tot = foodTotals(rec);
  const meals = data.meals.map(m => {
    const on = m.items.filter(it => rec?.food?.[it.id]?.on).length;
    const all = m.items.length && on === m.items.length;
    const kc = m.items.reduce((a, it) => { const f = rec?.food?.[it.id]; return a + (f?.on ? f.qty * f.kcal : 0); }, 0);
    return `
    <div class="meal ${all ? 'complete' : ''}">
      <div class="meal-head">
        <button class="check sm ${all ? 'on' : ''}" data-action="meal-all" data-meal="${m.id}" aria-label="Check all of ${esc(m.name)}">${ICON.check}</button>
        <h3>${esc(m.name)}</h3>
        <span class="meal-kcal">${on ? num(kc) + ' kcal' : `${m.items.length} items`}</span>
      </div>
      <ul>${m.items.map(it => {
        const f = rec?.food?.[it.id];
        const qty = f?.qty ?? it.qty;
        return `<li class="food ${f?.on ? 'on' : ''}" data-meal="${m.id}" data-item="${it.id}">
          <button class="check sm ${f?.on ? 'on' : ''}" data-action="food" aria-label="Ate ${esc(it.name)}">${ICON.check}</button>
          <span class="food-name">${esc(it.name)}<small>${esc(it.unit)}</small></span>
          <span class="qty"><button data-action="qty" data-d="-1" aria-label="Less">−</button><b>${qty}</b><button data-action="qty" data-d="1" aria-label="More">+</button></span>
          <span class="food-kcal">${num(qty * it.kcal)}</span>
        </li>`;
      }).join('')}</ul>
    </div>`;
  }).join('');
  const custom = (rec?.custom || []).map(c => `<li class="food on"><span class="food-name">${esc(c.name)}<small>${num(c.protein)} g protein${c.carbs ? `, ${num(c.carbs)} g carbs` : ''}${c.fat ? `, ${num(c.fat)} g fat` : ''}</small></span><span class="food-kcal">${num(c.kcal)}</span><button class="icon-btn sm" data-action="del-custom" data-id="${c.id}" aria-label="Remove">${ICON.x}</button></li>`).join('');
  return `
  <section class="card meals-card">
    <header class="card-head"><h2>Food</h2><span class="hint">${num(tot.kcal)} kcal, ${num(tot.protein)} g protein</span></header>
    ${meals}
    <div class="meal">
      <div class="meal-head"><h3 class="no-check">Extras</h3></div>
      <ul>${custom}</ul>
      <form class="add-food" data-form="custom">
        <input name="name" placeholder="Add a food" aria-label="Food name" required class="af-name">
        <button class="btn btn-small" type="submit">Add</button>
        <input name="kcal" type="number" step="any" placeholder="kcal" aria-label="Calories" required>
        <input name="protein" type="number" step="any" placeholder="Protein g" aria-label="Protein grams">
        <input name="carbs" type="number" step="any" placeholder="Carbs g" aria-label="Carb grams">
        <input name="fat" type="number" step="any" placeholder="Fat g" aria-label="Fat grams">
      </form>
    </div>
  </section>`;
}

// ======================================================================
// Consistency view
// ======================================================================
function viewCalendar() {
  const st = stats(), sc = schedule(), today = todayStr();
  const [y, m] = ui.month.split('-').map(Number);
  const first = new Date(y, m - 1, 1);
  const startPad = (first.getDay() + 6) % 7; // Monday first
  const daysIn = new Date(y, m, 0).getDate();
  let cells = '';
  for (let i = 0; i < startPad; i++) cells += '<div class="cal-cell empty"></div>';
  for (let d = 1; d <= daysIn; d++) {
    const ds = `${y}-${pad(m)}-${pad(d)}`;
    const s = sched(ds);
    const rec = data.days[ds];
    const reason = s.status === 'missed' && rec?.miss?.reason ? reasonOf(rec.miss.reason) : null;
    const pct = progress(rec).pct;
    const label = s.kind === 'before' ? '' : s.kind === 'off' ? 'Off' : s.kind === 'rest' ? 'Rest' : `Day ${s.day}`;
    cells += `<button class="cal-cell st-${s.status} ${ds === today ? 'is-today' : ''}" data-action="open-day" data-date="${ds}" ${reason ? `style="--rc:${reason.color}"` : ''} title="${esc(longDate(ds))}: ${s.status}${reason ? ' (' + reason.label + ')' : ''}">
      <span class="cal-d">${d}</span><span class="cal-l">${label}</span>
      ${s.status === 'missed' ? `<span class="cal-r">${reason ? esc(reason.label) : 'No reason'}</span>` : ''}
      ${(s.status === 'today' || s.status === 'done') && pct ? `<span class="cal-p"><i style="width:${pct * 100}%"></i></span>` : ''}
    </button>`;
  }
  const reasonRows = Object.entries(st.reasons).sort((a, b) => b[1] - a[1]);
  const maxR = Math.max(1, ...reasonRows.map(r => r[1]));
  const recentMiss = st.missed.slice().reverse().slice(0, 8);
  return `
  <div class="page">
    <header class="page-head"><h1>Streaks</h1><p>Every training day you finish keeps the cycle going. Miss one and the next day restarts at Day 1.</p></header>
    <div class="stat-row">
      <div class="stat"><b>${st.streak}</b><span>Current streak (days on plan)</span></div>
      <div class="stat"><b>${st.longest}</b><span>Longest streak</span></div>
      <div class="stat"><b>${st.workouts}</b><span>Workouts done</span></div>
      <div class="stat"><b>${st.rate30 == null ? '–' : Math.round(st.rate30 * 100) + '%'}</b><span>Training days hit, last 30 days</span></div>
    </div>
    <div class="cal-layout">
      <section class="card">
        <header class="card-head">
          <h2>${first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' })}</h2>
          <div class="row-gap"><button class="icon-btn" data-action="month" data-d="-1" aria-label="Previous month">${ICON.left}</button><button class="icon-btn" data-action="month" data-d="1" aria-label="Next month">${ICON.right}</button></div>
        </header>
        <div class="cal-week">${['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<span>${d}</span>`).join('')}</div>
        <div class="cal-grid-m">${cells}</div>
        <div class="legend">
          <span><i class="lg st-done"></i>Done</span><span><i class="lg st-today"></i>Today</span><span><i class="lg st-planned"></i>Planned</span><span><i class="lg st-rest"></i>Rest</span><span><i class="lg st-missed"></i>Missed</span><span><i class="lg st-off"></i>Time off</span>
        </div>
      </section>
      <section class="card">
        <header class="card-head"><h2>Why you missed</h2></header>
        ${reasonRows.length ? `<div class="bars">${reasonRows.map(([id, n]) => { const r = reasonOf(id); return `<div class="bar-row"><span>${r ? r.label : 'No reason given'}</span><div class="bar"><i style="width:${n / maxR * 100}%;background:${r ? r.color : 'var(--faint)'}"></i></div><b>${n}</b></div>`; }).join('')}</div>` : '<p class="empty-msg">No missed days. Keep it that way.</p>'}
        ${recentMiss.length ? `<h3 class="sub-h">Recent misses</h3><ul class="miss-list">${recentMiss.map(d => { const r = reasonOf(data.days[d]?.miss?.reason); return `<li><button class="link-row" data-action="open-day" data-date="${d}"><span>${esc(longDate(d, { weekday: 'short', month: 'short', day: 'numeric' }))}</span><span class="reason-dot" style="--rc:${r?.color || 'var(--faint)'}">${r ? r.label : 'Add reason'}</span>${data.days[d]?.miss?.note ? `<small>${esc(data.days[d].miss.note)}</small>` : ''}</button></li>`; }).join('')}</ul>` : ''}
      </section>
    </div>
  </div>`;
}

// ======================================================================
// Progress view (charts)
// ======================================================================
function viewProgress() {
  const opts = allExercises().map(e => `<option value="${e.id}" ${e.id === ui.progEx ? 'selected' : ''}>${esc(e.name)}</option>`).join('');
  const sessions = exSessions(ui.progEx);
  const best = sessions.reduce((a, s) => s.top > (a?.top || 0) ? s : a, null);
  const ranges = [[30, '30 days'], [90, '90 days'], [365, '1 year'], [0, 'All']];
  return `
  <div class="page">
    <header class="page-head"><h1>Progress</h1><p>Body weight, strength and calories over time.</p></header>
    <div class="row-gap range">${ranges.map(([v, l]) => `<button class="chip ${ui.range === v ? 'chip-on' : ''}" data-action="range" data-v="${v}">${l}</button>`).join('')}</div>
    <div class="prog-grid">
      <section class="card span-2">
        <header class="card-head"><h2>Lifts</h2><span class="hint">Go up ${+data.settings.weightStep || 5} lb once every set reaches the top of its rep range</span></header>
        ${liftsTable()}
      </section>
      <section class="card">
        <header class="card-head"><h2>Body weight</h2><div class="inline-form"><label class="wt"><input type="number" step="0.1" data-input="quick-weight" placeholder="0.0" aria-label="Today's weight"><span>lb</span></label></div></header>
        <div class="chart" data-chart="weight"></div>
      </section>
      <section class="card">
        <header class="card-head"><h2>Strength</h2><select data-input="prog-ex" aria-label="Exercise">${opts}</select></header>
        <div class="chart" data-chart="strength"></div>
        <p class="hint">${best ? `Best: ${best.top} lb on ${shortDate(best.date)}. ${sessions.length} session${sessions.length === 1 ? '' : 's'} logged.` : 'Log weights on your sets to see your top weight per session.'}</p>
      </section>
      <section class="card span-2">
        <header class="card-head"><h2>Activity</h2><span class="hint">From Apple Health</span></header>
        <div class="chart" data-chart="activity"></div>
      </section>
      <section class="card span-2">
        <header class="card-head"><h2>Calories in and out</h2></header>
        <div class="chart" data-chart="calories"></div>
      </section>
    </div>
  </div>`;
}
function liftsTable() {
  const t = addDays(todayStr(), 1);
  const rows = liftBlocks().flatMap(b => b.exercises.map(e => {
    const p = progression(e, t);
    const status = !p ? '<span class="prog-chip none">No weights logged yet</span>'
      : p.kind === 'up' ? `<span class="prog-chip up">Ready: ${p.to} lb next time</span>`
      : p.kind === 'stuck' ? '<span class="prog-chip stuck">Stuck for 3 sessions</span>'
      : `<span class="prog-chip build">Building to ${p.target} reps</span>`;
    return `<tr class="hue-${b.hue}"><td><i class="dot"></i>${esc(e.name)}</td><td>${p ? (p.from ?? p.at) + ' lb' : '–'}</td><td>${p?.reps || '–'}</td><td>${e.repMin}–${e.repMax}</td><td>${status}</td></tr>`;
  })).join('');
  return `<table class="lifts"><thead><tr><th>Exercise</th><th>Working weight</th><th>Last reps</th><th>Range</th><th></th></tr></thead><tbody>${rows}</tbody></table>`;
}
function rangeStart() { return ui.range ? addDays(todayStr(), -ui.range + 1) : '0000-00-00'; }
function exSessions(exId) {
  const out = [];
  for (const d of Object.keys(data.days).sort()) {
    if (d < rangeStart()) continue;
    const s = sessionTop(data.days[d].sets?.[exId]);
    if (s.top || s.reps.length) out.push({ date: d, ...s });
  }
  return out;
}
function hydrateCharts() {
  const start = rangeStart(), today = todayStr();
  const weights = [];
  const dates = new Set([...Object.keys(data.days), ...Object.keys(data.health)]);
  for (const d of [...dates].sort()) { if (d < start || d > today) continue; const w = weightOn(d); if (w) weights.push({ x: d, y: w }); }
  drawChart($('[data-chart="weight"]'), [{ name: 'Weight', color: 'var(--primary)', points: weights }], { unit: 'lb', empty: 'Log your weight on the Today page or above.' });
  const ses = exSessions(ui.progEx);
  drawChart($('[data-chart="strength"]'), [
    { name: 'Top weight', color: 'var(--red)', points: ses.filter(s => s.top).map(s => ({ x: s.date, y: s.top })) },
  ], { unit: 'lb', empty: 'No sessions with weights yet.' });
  const inPts = [], outPts = [];
  const from = ui.range ? start : data.settings.startDate;
  for (let d = from < data.settings.startDate ? data.settings.startDate : from; d <= today; d = addDays(d, 1)) {
    const c = calories(d);
    if (c.inK) inPts.push({ x: d, y: Math.round(c.inK) });
    if (c.out && (c.inK || data.days[d])) outPts.push({ x: d, y: Math.round(c.out) });
  }
  const actPts = [], exPts = [];
  for (const d of Object.keys(data.health).sort()) {
    if (d < start || d > today) continue;
    if (data.health[d].active != null) actPts.push({ x: d, y: data.health[d].active });
    if (data.health[d].exercise != null) exPts.push({ x: d, y: data.health[d].exercise });
  }
  drawChart($('[data-chart="activity"]'), [
    { name: 'Move (active kcal)', color: 'var(--red)', points: actPts },
    { name: 'Exercise (min)', color: 'var(--green)', points: exPts },
  ], { unit: '', empty: 'Connect Apple Health in Settings to chart your Move and Exercise rings.' });
  drawChart($('[data-chart="calories"]'), [
    { name: 'In', color: 'var(--cyan)', points: inPts },
    { name: 'Out', color: 'var(--yellow)', points: outPts },
  ], { unit: 'kcal', empty: 'Check off food on the Today page to start this chart.' });
}

function drawChart(el, series, { unit = '', empty = 'No data yet.' } = {}) {
  if (!el) return;
  const all = series.flatMap(s => s.points);
  if (all.length < 1) { el.innerHTML = `<p class="empty-msg">${esc(empty)}</p>`; return; }
  const W = Math.max(320, el.clientWidth || 600), H = 220, P = { l: 44, r: 14, t: 14, b: 26 };
  const xs = all.map(p => parseDate(p.x).getTime());
  let x0 = Math.min(...xs), x1 = Math.max(...xs);
  if (x0 === x1) { x0 -= 86400000 * 3; x1 += 86400000 * 3; }
  let y0 = Math.min(...all.map(p => p.y)), y1 = Math.max(...all.map(p => p.y));
  const padY = (y1 - y0) * 0.15 || Math.max(1, y1 * 0.05);
  y0 -= padY; y1 += padY;
  const sx = (t) => P.l + (t - x0) / (x1 - x0) * (W - P.l - P.r);
  const sy = (v) => P.t + (1 - (v - y0) / (y1 - y0)) * (H - P.t - P.b);
  const ticks = niceTicks(y0, y1, 4);
  let g = ticks.map(v => `<line x1="${P.l}" x2="${W - P.r}" y1="${sy(v)}" y2="${sy(v)}" class="grid"/><text x="${P.l - 8}" y="${sy(v) + 4}" text-anchor="end" class="axis">${num(v)}</text>`).join('');
  const xt = Math.max(1, Math.min(4, Math.round((x1 - x0) / 864e5)));
  for (let i = 0; i <= xt; i++) { const t = x0 + (x1 - x0) * i / xt; const d = fmtDate(new Date(t)); g += `<text x="${sx(t)}" y="${H - 6}" text-anchor="${i === 0 ? 'start' : i === xt ? 'end' : 'middle'}" class="axis">${shortDate(d)}</text>`; }
  const paths = series.map(s => {
    if (!s.points.length) return '';
    const pts = s.points.map(p => [sx(parseDate(p.x).getTime()), sy(p.y)]);
    const d = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ');
    const dots = pts.length <= 60 ? pts.map(p => `<circle cx="${p[0]}" cy="${p[1]}" r="3" fill="${s.color}"/>`).join('') : '';
    return `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.25" stroke-linejoin="round" stroke-linecap="round"/>${dots}`;
  }).join('');
  const legend = series.length > 1 ? `<div class="chart-legend">${series.map(s => `<span><i style="background:${s.color}"></i>${esc(s.name)}</span>`).join('')}</div>` : '';
  el.innerHTML = `${legend}<div class="chart-wrap"><svg viewBox="0 0 ${W} ${H}" width="100%" height="${H}" preserveAspectRatio="none">${g}${paths}<line class="hover-line" y1="${P.t}" y2="${H - P.b}" x1="-10" x2="-10"/></svg><div class="tip"></div></div>`;
  const svg = $('svg', el), tip = $('.tip', el), line = $('.hover-line', el);
  svg.addEventListener('mousemove', (ev) => {
    const r = svg.getBoundingClientRect();
    const mx = (ev.clientX - r.left) / r.width * W;
    const t = x0 + (mx - P.l) / (W - P.l - P.r) * (x1 - x0);
    let best = null;
    for (const p of all) { const dt = Math.abs(parseDate(p.x).getTime() - t); if (!best || dt < best.dt) best = { dt, x: p.x }; }
    if (!best) return;
    const X = sx(parseDate(best.x).getTime());
    line.setAttribute('x1', X); line.setAttribute('x2', X);
    tip.innerHTML = `<b>${esc(longDate(best.x, { weekday: 'short', month: 'short', day: 'numeric' }))}</b>` + series.map(s => { const p = s.points.find(q => q.x === best.x); return p ? `<span><i style="background:${s.color}"></i>${esc(s.name)} ${num(p.y)} ${unit}</span>` : ''; }).join('');
    tip.style.left = clamp(X / W * r.width, 70, r.width - 70) + 'px';
    tip.classList.add('show');
  });
  svg.addEventListener('mouseleave', () => { tip.classList.remove('show'); line.setAttribute('x1', -10); line.setAttribute('x2', -10); });
}
function niceTicks(a, b, n) {
  const span = b - a, step0 = span / n, mag = 10 ** Math.floor(Math.log10(step0));
  const step = [1, 2, 2.5, 5, 10].map(m => m * mag).find(s => span / s <= n + 1) || mag * 10;
  const out = [];
  for (let v = Math.ceil(a / step) * step; v <= b; v += step) out.push(round(v, 4) || 0);
  return out;
}

// ======================================================================
// Nutrition view
// ======================================================================
const FOOD_HINT = {
  fiber: 'Beans, lentils, berries, chia seeds or a whole-wheat tortilla add fiber.',
  vitC: 'An orange, a kiwi or some bell pepper covers this easily.',
  potassium: 'A potato, beans, Greek yogurt or more spinach help.',
  calcium: 'Greek yogurt, cheese or another glass of milk help.',
  vitD: 'Sunlight, salmon and fortified milk help. Many people take a supplement.',
  magnesium: 'Pumpkin seeds, almonds, black beans and dark chocolate help.',
  folate: 'Leafy greens, beans and lentils help.',
  iron: 'Red meat, beans, lentils and fortified cereal help.',
};
function insights(t, top, date) {
  const out = [];
  const g = proteinGoal(date);
  if (g) {
    if (t.protein < g.lo) out.push({ tone: 'low', text: `Protein is ${num(t.protein)} g. Lifters commonly aim for 0.7 to 1 g per lb of body weight, which is ${g.lo}–${g.hi} g for you at ${g.w} lb.` });
    else out.push({ tone: 'good', text: `Protein is ${num(t.protein)} g, inside or above the 0.7 to 1 g per lb range lifters commonly aim for (${g.lo}–${g.hi} g at ${g.w} lb).` });
  } else out.push({ tone: '', text: `Protein is ${num(t.protein)} g. Log your body weight to compare it with a lifting target (0.7 to 1 g per lb).` });
  for (const k of ['sodium', 'chol', 'satFat']) {
    const d = NDEF[k], p = t[k] / d.dv, src = top(k);
    if (p > 1) {
      const s1 = src[0], share = s1 ? Math.round(s1.v / t[k] * 100) : 0;
      let extra = '';
      if (k === 'chol') extra = ' Dietary cholesterol affects people differently. If your blood cholesterol is high, ask your doctor how many eggs make sense.';
      if (k === 'sodium' && s1 && /pickle/i.test(s1.name)) extra = ' Low-sodium pickles or fewer spears would cut most of it.';
      out.push({ tone: 'over', text: `${d.label} is ${fmtN(t[k], d.unit)} ${d.unit}, ${Math.round(p * 100)}% of the daily value. ${s1 ? `${s1.name} supply ${share}% of it.` : ''}${extra}` });
    }
  }
  for (const k of ['fiber', 'vitC', 'potassium', 'calcium', 'vitD', 'magnesium', 'folate', 'iron']) {
    const d = NDEF[k], p = t[k] / d.dv;
    if (p < .6) out.push({ tone: 'low', text: `${d.label} is ${fmtN(t[k], d.unit)} ${d.unit}, ${Math.round(p * 100)}% of the daily value. ${FOOD_HINT[k]}` });
  }
  if (t.omega3 && t.omega3 < 250) out.push({ tone: 'low', text: `Omega-3 (EPA + DHA) is ${num(t.omega3)} mg. 250–500 mg a day is a common target.` });
  const covered = NUTRIENTS.filter(n => !n.limit && !n.macro && n.dv && t[n.k] / n.dv >= 1).map(n => n.label);
  return { list: out, covered };
}

function viewNutrition() {
  const scopes = [['plan', 'Full meal plan'], ['today', 'Today'], ['week', '7-day average'], ['month', '30-day average']];
  const sc = ui.nutScope || 'plan';
  let res, note;
  if (sc === 'plan') { res = nutrition(planEntries()); note = 'Your meal plan as written, if you eat everything on it.'; }
  else if (sc === 'today') { res = nutrition(dayEntries(data.days[todayStr()])); note = 'What you have checked off today.'; }
  else { const n = sc === 'week' ? 7 : 30; res = averageNutrition(n); note = res.days ? `Average of the ${res.days} day${res.days === 1 ? '' : 's'} with food logged in the last ${n} days.` : `No food logged in the last ${n} days yet.`; }
  const { t, top, meals, count } = res;
  const head = `
  <div class="page nutrition">
    <header class="page-head"><h1>Nutrition</h1><p>What your diet adds up to. Percentages use the FDA daily values printed on US food labels.</p></header>
    <div class="row-gap wrap range">${scopes.map(([v, l]) => `<button class="chip ${sc === v ? 'chip-on' : ''}" data-action="nut-scope" data-v="${v}">${l}</button>`).join('')}</div>
    <p class="hint scope-note">${esc(note)}</p>`;
  if (!count) return head + `<div class="card"><p class="empty-msg">Check off food on the Today page and it shows up here.</p></div></div>`;
  const pk = t.protein * 4, ck = t.carbs * 4, fk = t.fat * 9, sum = pk + ck + fk || 1;
  const ins = insights(t, top, todayStr());
  const mealRows = Object.entries(meals).map(([name, m]) => `<tr><td>${esc(name)}</td><td>${num(m.kcal)}</td><td>${fmtN(m.protein, 'g')}</td><td>${fmtN(m.carbs, 'g')}</td><td>${fmtN(m.fat, 'g')}</td><td>${fmtN(m.fiber, 'g')}</td><td>${num(m.sodium)}</td></tr>`).join('');
  const topName = (k) => { const s1 = top(k)[0]; return s1 && t[k] ? `${s1.name} ${Math.round(s1.v / t[k] * 100)}%` : ''; };
  return head + `
    <div class="stat-row macro-tiles">
      <div class="stat t-kcal"><b>${num(t.kcal)}</b><span>Calories</span></div>
      <div class="stat t-p"><b>${num(t.protein)}<i>g</i></b><span>Protein, ${Math.round(pk / sum * 100)}% of calories</span></div>
      <div class="stat t-c"><b>${num(t.carbs)}<i>g</i></b><span>Carbs, ${Math.round(ck / sum * 100)}% of calories</span></div>
      <div class="stat t-f"><b>${num(t.fat)}<i>g</i></b><span>Fat, ${Math.round(fk / sum * 100)}% of calories</span></div>
    </div>
    <div class="nut-layout">
      <section class="card">
        <header class="card-head"><h2>Nutrients</h2><span class="hint">Biggest source</span></header>
        <div class="macro-wrap">${macroSplit(t)}</div>
        <div class="nut-list wide">${NUTRIENTS.map(n => nutRow(n, t[n.k], topName(n.k))).join('')}</div>
      </section>
      <div class="nut-side">
        <section class="card">
          <header class="card-head"><h2>Worth knowing</h2></header>
          <ul class="insights">${ins.list.map(i => `<li class="${i.tone}">${esc(i.text)}</li>`).join('')}</ul>
          ${ins.covered.length ? `<p class="covered-h">Fully covered</p><div class="covered">${ins.covered.map(c => `<span>${esc(c)}</span>`).join('')}</div>` : ''}
          <p class="hint small">Estimates from food labels and USDA data, not medical advice. Edit any food's numbers in Settings.</p>
        </section>
        <section class="card">
          <header class="card-head"><h2>By meal</h2></header>
          <table class="meal-table"><thead><tr><th></th><th>kcal</th><th>Protein</th><th>Carbs</th><th>Fat</th><th>Fiber</th><th>Sodium</th></tr></thead>
          <tbody>${mealRows}</tbody>
          <tfoot><tr><td>Total</td><td>${num(t.kcal)}</td><td>${fmtN(t.protein, 'g')}</td><td>${fmtN(t.carbs, 'g')}</td><td>${fmtN(t.fat, 'g')}</td><td>${fmtN(t.fiber, 'g')}</td><td>${num(t.sodium)}</td></tr></tfoot></table>
          <p class="hint small">Grams, except sodium in mg.</p>
        </section>
      </div>
    </div>
  </div>`;
}

// ======================================================================
// History view
// ======================================================================
function viewHistory() {
  const today = todayStr(), sc = schedule();
  const dates = Object.keys(sc).filter(d => d <= today).sort().reverse();
  const rows = dates.map(d => {
    const s = sc[d], rec = data.days[d], p = progress(rec), c = calories(d);
    const r = rec?.miss?.reason ? reasonOf(rec.miss.reason) : null;
    const brk = s.kind === 'off' ? (data.settings.breaks || []).find(b => b.id === s.breakId) : null;
    const rehabTotal = brk ? (brk.items || []).reduce((a, it) => a + (+it.times || 1), 0) : 0;
    const rehabDone = brk ? (brk.items || []).reduce((a, it) => a + Math.min(+rec?.rehab?.[it.id] || 0, +it.times || 1), 0) : 0;
    const notes = [rec?.rehabNote, rec?.note, ...Object.entries(rec?.exNotes || {}).filter(([, v]) => v).map(([k, v]) => `${allExercises().find(e => e.id === k)?.name || k}: ${v}`), rec?.miss?.note].filter(Boolean);
    const status = { done: 'Done', extra: 'Bonus', missed: 'Missed', rest: 'Rest', today: 'Today', off: 'Time off' }[s.status] || s.status;
    return `<button class="hist-row" data-action="open-day" data-date="${d}">
      <span class="h-date"><b>${esc(longDate(d, { weekday: 'short', month: 'short', day: 'numeric' }))}</b><small>${s.kind === 'rest' ? 'Rest day' : s.kind === 'off' ? esc(s.label) : 'Day ' + s.day}</small></span>
      <span class="pill st-${s.status}">${status}</span>
      <span class="h-work">${rehabTotal ? `<span class="mini-bar rehab-bar"><i style="width:${rehabDone / rehabTotal * 100}%"></i></span>${rehabDone}/${rehabTotal}${rec?.pain != null ? `, pain ${rec.pain}` : ''}` : p.done ? `<span class="mini-bar"><i style="width:${p.pct * 100}%"></i></span>${Math.round(p.pct * 100)}%` : r ? `<span class="reason-dot" style="--rc:${r.color}">${r.label}</span>` : ''}</span>
      <span class="h-cal">${c.inK ? num(c.inK) + ' in' : ''}${c.out && c.inK ? ' / ' + num(c.out) + ' out' : ''}</span>
      <span class="h-w">${weightOn(d) ? weightOn(d) + ' lb' : ''}</span>
      <span class="h-notes">${esc(notes.join('  |  '))}</span>
    </button>`;
  }).join('');
  return `
  <div class="page">
    <header class="page-head"><h1>History</h1><p>Every day since you started. Open a day to see or edit it.</p></header>
    <div class="card hist">${rows || '<p class="empty-msg">Nothing yet.</p>'}</div>
  </div>`;
}

// ======================================================================
// Settings view
// ======================================================================
function viewSettings() {
  const s = data.settings, p = s.profile;
  const ft = p.heightIn ? Math.floor(p.heightIn / 12) : '', inch = p.heightIn ? round(p.heightIn % 12, 1) : '';
  const progEditor = data.program.blocks.map((b, bi) => b.type === 'cardio' ? `
    <div class="edit-block hue-saber"><h3>Block ${bi + 1}: ${esc(b.name)}</h3>
      <div class="edit-table cardio-t"><span>Activity</span><span>Min minutes</span><span>Max minutes</span><span>Intensity (MET)</span><span></span>
      ${b.items.map(it => `<input data-edit="cardio" data-b="${b.id}" data-id="${it.id}" data-k="name" value="${esc(it.name)}"><input type="number" data-edit="cardio" data-b="${b.id}" data-id="${it.id}" data-k="minMin" value="${it.minMin}"><input type="number" data-edit="cardio" data-b="${b.id}" data-id="${it.id}" data-k="maxMin" value="${it.maxMin}"><input type="number" step="0.5" data-edit="cardio" data-b="${b.id}" data-id="${it.id}" data-k="met" value="${it.met}"><button class="icon-btn sm" data-action="del-cardio" data-b="${b.id}" data-id="${it.id}" aria-label="Remove">${ICON.x}</button>`).join('')}
      </div><button class="link-btn" data-action="add-cardio" data-b="${b.id}">+ Add cardio</button></div>` : `
    <div class="edit-block hue-${b.hue}"><h3>Block ${bi + 1}: <input class="inline-name" data-edit="block" data-b="${b.id}" value="${esc(b.name)}" aria-label="Block name"></h3>
      <div class="edit-table"><span>Exercise</span><span>Sets</span><span>Reps min</span><span>Reps max</span><span>lb min</span><span>lb max</span><span>Per side</span><span>Dropset</span><span></span>
      ${b.exercises.map(e => `<input data-edit="ex" data-b="${b.id}" data-id="${e.id}" data-k="name" value="${esc(e.name)}">${['sets', 'repMin', 'repMax', 'wMin', 'wMax'].map(k => `<input type="number" data-edit="ex" data-b="${b.id}" data-id="${e.id}" data-k="${k}" value="${e[k] ?? ''}">`).join('')}<input type="checkbox" data-edit="ex" data-b="${b.id}" data-id="${e.id}" data-k="perSide" ${e.perSide ? 'checked' : ''}><input type="checkbox" data-edit="ex" data-b="${b.id}" data-id="${e.id}" data-k="drop" ${e.drop ? 'checked' : ''}><button class="icon-btn sm" data-action="del-ex" data-b="${b.id}" data-id="${e.id}" aria-label="Remove">${ICON.x}</button>`).join('')}
      </div><button class="link-btn" data-action="add-ex" data-b="${b.id}">+ Add exercise</button></div>`).join('');
  const mealEditor = data.meals.map(m => `
    <div class="edit-block"><h3><input class="inline-name" data-edit="meal" data-m="${m.id}" value="${esc(m.name)}" aria-label="Meal name"></h3>
      <div class="edit-table meal-t"><span>Food</span><span>Default qty</span><span>Unit</span><span>kcal</span><span>Protein g</span><span>Carbs g</span><span>Fat g</span><span></span><span></span>
      ${m.items.map(it => `<input data-edit="food" data-m="${m.id}" data-id="${it.id}" data-k="name" value="${esc(it.name)}"><input type="number" step="0.5" data-edit="food" data-m="${m.id}" data-id="${it.id}" data-k="qty" value="${it.qty}"><input data-edit="food" data-m="${m.id}" data-id="${it.id}" data-k="unit" value="${esc(it.unit)}"><input type="number" step="any" data-edit="food" data-m="${m.id}" data-id="${it.id}" data-k="kcal" value="${it.kcal}"><input type="number" step="any" data-edit="food" data-m="${m.id}" data-id="${it.id}" data-k="protein" value="${it.protein}">${['carbs', 'fat'].map(k => `<input type="number" step="any" data-edit="food-n" data-m="${m.id}" data-id="${it.id}" data-k="${k}" value="${it.n?.[k] ?? ''}" placeholder="0">`).join('')}<button class="link-btn more-btn" data-action="food-more" data-id="${it.id}" aria-expanded="${ui.nutEdit === it.id}">${ui.nutEdit === it.id ? 'Less' : 'More'}</button><button class="icon-btn sm" data-action="del-food" data-m="${m.id}" data-id="${it.id}" aria-label="Remove">${ICON.x}</button>${ui.nutEdit === it.id ? `<div class="nut-edit"><p class="hint">Per ${esc(it.unit)}</p>${NUTRIENTS.filter(n => !['protein', 'carbs', 'fat'].includes(n.k)).map(n => `<label class="field"><span>${esc(n.label)} (${n.unit})</span><input type="number" step="any" data-edit="food-n" data-m="${m.id}" data-id="${it.id}" data-k="${n.k}" value="${it.n?.[n.k] ?? ''}" placeholder="0"></label>`).join('')}</div>` : ''}`).join('')}
      </div><button class="link-btn" data-action="add-food" data-m="${m.id}">+ Add food</button></div>`).join('');
  return `
  <div class="page settings">
    <header class="page-head"><h1>Settings</h1></header>

    <section class="card"><header class="card-head"><h2>You</h2></header>
      <div class="form-grid">
        <label class="field"><span>Sex (for calorie math)</span><select data-set="sex"><option value="male" ${p.sex === 'male' ? 'selected' : ''}>Male</option><option value="female" ${p.sex === 'female' ? 'selected' : ''}>Female</option></select></label>
        <label class="field"><span>Age</span><input type="number" data-set="age" value="${p.age ?? ''}"></label>
        <label class="field"><span>Height (ft)</span><input type="number" data-set="ft" value="${ft}"></label>
        <label class="field"><span>Height (in)</span><input type="number" step="0.5" data-set="in" value="${inch}"></label>
        <label class="field"><span>Extra work per drop set (minutes)</span><input type="number" step="0.25" min="0" data-set="dropMin" value="${s.dropMin ?? 0.5}"></label>
      </div>
      <p class="hint">Calories out = resting burn (Mifflin-St Jeor) × ${s.activityFactor} for daily life, plus lifting (each logged set side ≈ ${s.minPerSetSide} min at moderate effort, each drop set ≈ ${s.dropMin ?? 0.5} min at vigorous effort) and cardio from what you log. Imported fitness data replaces the estimate on days it covers.</p>
    </section>

    <section class="card"><header class="card-head"><h2>Schedule</h2></header>
      <div class="form-grid">
        <label class="field"><span>Plan start date</span><input type="date" data-set="startDate" value="${s.startDate}"></label>
        <label class="field"><span>A training day counts when you finish it or reach</span><select data-set="threshold">${[0.25, 0.5, 0.75, 1].map(v => `<option value="${v}" ${s.threshold === v ? 'selected' : ''}>${v * 100}% of checks</option>`).join('')}</select></label>
      </div>
      <p class="hint">Cycle: Day 1 train, Day 2 train, Day 3 rest. Miss a training day and the next day becomes Day 1.</p>
      <div class="row-gap"><button class="btn" data-action="restart-today">Restart at Day 1 today</button></div>
      <div class="breaks" id="breaks">
        <h3 class="sub-h">Time off</h3>
        <p class="hint">Days with no training planned, like surgery recovery or a trip. They don't count as misses or break your streak, and you restart at Day 1 the day after.</p>
        ${(s.breaks || []).map(b => `<div class="break-row"><input data-break="label" data-id="${b.id}" value="${esc(b.label || '')}" placeholder="Time off" aria-label="Name"><label class="field"><span>From</span><input type="date" data-break="start" data-id="${b.id}" value="${b.start}"></label><label class="field"><span>Through</span><input type="date" data-break="end" data-id="${b.id}" value="${b.end}"></label><span class="hint">${b.start && b.end ? `${diffDays(b.start, b.end) + 1} days` : ''}</span><button class="icon-btn sm" data-action="del-break" data-id="${b.id}" aria-label="Remove">${ICON.x}</button></div>`).join('')}
        <button class="link-btn" data-action="add-break">+ Add time off</button>
      </div>
    </section>

    <section class="card"><header class="card-head"><h2>Reminders</h2></header>
      <div class="form-grid">
        <label class="toggle"><input type="checkbox" data-set="remOn" ${s.reminder.on ? 'checked' : ''}><span>Remind me to train if I haven't started</span></label>
        <label class="field"><span>At</span><input type="time" data-set="remTime" value="${s.reminder.time}"></label>
        <label class="toggle"><input type="checkbox" data-set="login" id="login-toggle"><span>Open when I sign in to Windows</span></label>
      </div>
    </section>

    <section class="card" id="health-card">${healthCard()}</section>

    <section class="card"><header class="card-head"><h2>Workout plan</h2><label class="field inline-field"><span>Weight jump</span><span class="wt"><input type="number" step="2.5" min="1" data-set="weightStep" value="${+s.weightStep || 5}"><span>lb</span></span></label></header>${progEditor}</section>
    <section class="card"><header class="card-head"><h2>Meal plan</h2></header><p class="hint">Numbers are per unit. Defaults come from your product labels and USDA data. Click More on any food for vitamins and minerals, and adjust them to match what you buy.</p>${mealEditor}</section>

    <section class="card" id="update-card">${updateCard()}</section>

    <section class="card" id="backup-card">${backupCard()}</section>

    <section class="card"><header class="card-head"><h2>Look and data</h2></header>
      <div class="row-gap wrap">
        <button class="chip ${s.theme === 'dark' ? 'chip-on' : ''}" data-action="theme" data-v="dark">Dark</button>
        <button class="chip ${s.theme === 'light' ? 'chip-on' : ''}" data-action="theme" data-v="light">Light</button>
      </div>
      <div class="row-gap wrap" style="margin-top:14px">
        <button class="btn" data-action="export">Export backup</button>
        <button class="btn" data-action="restore">Restore from backup</button>
        ${window.api ? '<button class="btn btn-ghost" data-action="open-folder">Open data folder</button>' : ''}
      </div>
      <p class="hint" id="data-dir">The app saves automatically and keeps 30 days of daily backups.</p>
    </section>
  </div>`;
}

// ======================================================================
// Updates
// ======================================================================
function updateLine(u) {
  if (!u) return 'Updates work in the desktop app.';
  const when = u.checkedAt ? ` Checked ${new Date(u.checkedAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.` : '';
  return ({
    idle: 'Checks for updates shortly after the app opens, then every few hours.',
    'no-source': 'Add your GitHub repo below to turn on automatic updates.',
    checking: 'Checking for updates…',
    downloading: `Downloading version ${u.latest}…`,
    'up-to-date': `You're on the latest version.${when}`,
    ready: `Version ${u.latest} is downloaded. Restart to use it.`,
    'needs-download': `Version ${u.latest} needs a fresh download of the whole app.`,
    skipped: `Version ${u.latest} didn't start correctly, so it was skipped.`,
    error: `${u.error || 'Update check failed.'}${when}`,
  })[u.state] || '';
}
function updateCard() {
  const u = ui.update;
  const cfg = u?.config || {};
  return `<header class="card-head"><h2>Updates</h2><span class="ver-pill">Version ${esc(u?.current || ui.version || '')}</span></header>
    <p class="upd-line ${u?.state || ''}">${esc(updateLine(u))}</p>
    ${u?.rolledBack ? `<p class="hint">The last update ${esc(u.rolledBack)}, so the app went back to the version that worked.</p>` : ''}
    ${u?.state === 'ready' && u.notes ? `<p class="upd-notes">${esc(u.notes)}</p>` : ''}
    ${window.api?.update ? `<div class="form-grid upd-form">
      <label class="field"><span>GitHub repo with updates</span><input data-upd="source" value="${esc(cfg.source || u?.source || '')}" placeholder="yourname/workout-tracker" spellcheck="false"></label>
      <label class="field"><span>Access token (only for a private repo)</span><input data-upd="token" type="password" placeholder="${cfg.hasToken ? 'Saved. Type to replace.' : 'Leave empty for a public repo'}" autocomplete="off"></label>
    </div>
    <div class="row-gap wrap">
      <button class="btn" data-action="upd-save">Save and check</button>
      <button class="btn btn-ghost" data-action="upd-check" ${u?.state === 'checking' || u?.state === 'downloading' ? 'disabled' : ''}>Check now</button>
      ${u?.state === 'ready' ? '<button class="btn btn-primary" data-action="upd-restart">Restart to update</button>' : ''}
    </div>` : ''}`;
}
function renderUpdateBar() {
  let bar = $('#update-bar');
  const u = ui.update;
  const show = u && (u.state === 'ready' || u.state === 'needs-download') && ui.updateBarDismissed !== u.latest;
  if (!show) { bar?.remove(); return; }
  if (!bar) { bar = document.createElement('div'); bar.id = 'update-bar'; bar.setAttribute('role', 'status'); document.body.appendChild(bar); }
  bar.innerHTML = u.state === 'ready'
    ? `<div><b>Update ready: version ${esc(u.latest)}</b>${u.notes ? `<span>${esc(u.notes)}</span>` : ''}</div><button class="btn btn-ghost btn-small" data-action="upd-later">Later</button><button class="btn btn-primary btn-small" data-action="upd-restart">Restart</button>`
    : `<div><b>Version ${esc(u.latest)} needs a fresh download</b><span>Ask Claude for the new app zip. Your data stays put.</span></div><button class="btn btn-ghost btn-small" data-action="upd-later">OK</button>`;
}
function onUpdateStatus(st) {
  ui.update = { ...(ui.update || {}), ...st };
  renderUpdateBar();
  const card = $('#update-card');
  if (card && !card.contains(document.activeElement)) card.innerHTML = updateCard();
  else if (card) { const line = $('.upd-line', card); if (line) { line.textContent = updateLine(ui.update); line.className = `upd-line ${ui.update.state}`; } }
}

// ======================================================================
// Missed-day prompt
// ======================================================================
function pendingMisses() {
  const sc = schedule(), today = todayStr();
  return Object.keys(sc).filter(d => d < today && sc[d].status === 'missed' && !data.days[d]?.miss?.reason).sort();
}
function ranges(dates) {
  const out = [];
  for (const d of dates) { const last = out[out.length - 1]; if (last && addDays(last[1], 1) === d) last[1] = d; else out.push([d, d]); }
  return out.map(([a, b]) => a === b ? longDate(a, { weekday: 'short', month: 'short', day: 'numeric' }) : `${shortDate(a)} to ${shortDate(b)}`);
}
function showMissModal(dates, { skipToday = false } = {}) {
  let chosen = null;
  const n = dates.length;
  const title = skipToday ? 'Skip today' : n === 1 ? 'You missed a training day' : `You missed ${n} days`;
  const body = skipToday
    ? 'Tomorrow becomes Day 1. What got in the way?'
    : `${ranges(dates).join(', ')}. Your cycle restarted at Day 1 ${sched(todayStr()).day === 1 ? 'today' : 'after that'}. What happened?`;
  openModal(`
    <h2>${title}</h2>
    <p>${esc(body)}</p>
    <div class="reason-chips">${MISS_REASONS.map(x => `<button class="reason" style="--rc:${x.color}" data-reason="${x.id}">${x.label}</button>`).join('')}</div>
    <label class="field"><span>Note (optional)</span><input type="text" id="miss-note" placeholder="e.g. Amazon interview Thursday"></label>
    <div class="modal-actions"><button class="btn btn-ghost" data-close>${skipToday ? 'Cancel' : 'Later'}</button><button class="btn btn-primary" id="miss-save" disabled>${skipToday ? 'Skip today' : 'Save'}</button></div>
  `, (root, close) => {
    root.addEventListener('click', (e) => {
      const r = e.target.closest('[data-reason]');
      if (r) { chosen = r.dataset.reason; $$('.reason', root).forEach(b => b.classList.toggle('on', b === r)); $('#miss-save', root).disabled = false; }
    });
    $('#miss-save', root).addEventListener('click', () => {
      const note = $('#miss-note', root).value.trim();
      for (const d of dates) { const rec = getDay(d); rec.miss = { reason: chosen, note }; if (skipToday) rec.skip = true; }
      save(); close(); render();
      toast(skipToday ? 'Skipped. Tomorrow is Day 1.' : 'Saved');
    });
  }, () => { if (!skipToday) ui.dismissedMisses = true; });
}
function openModal(html, wire, onClose) {
  const root = $('#modal-root');
  root.innerHTML = `<div class="modal-back"><div class="modal" role="dialog" aria-modal="true">${html}</div></div>`;
  const close = () => { root.innerHTML = ''; document.removeEventListener('keydown', onKey); };
  const onKey = (e) => { if (e.key === 'Escape') { close(); onClose?.(); } };
  document.addEventListener('keydown', onKey);
  root.querySelector('.modal-back').addEventListener('click', (e) => { if (e.target.classList.contains('modal-back') || e.target.closest('[data-close]')) { close(); onClose?.(); } });
  wire?.(root, close);
  root.querySelector('button, input')?.focus();
}
function checkMisses() {
  if (ui.dismissedMisses || $('#modal-root').innerHTML) return;
  const p = pendingMisses().filter(d => diffDays(d, todayStr()) <= 60);
  if (p.length) showMissModal(p);
}

// ======================================================================
// Events
// ======================================================================
document.addEventListener('click', async (e) => {
  const nav = e.target.closest('[data-nav]');
  if (nav) { if (nav.dataset.nav === 'today') ui.date = todayStr(); return go(nav.dataset.nav); }
  const a = e.target.closest('[data-action]');
  if (!a) return;
  const act = a.dataset.action;
  const date = ui.date;
  const side = a.closest('.side');
  const ctx = side ? { exId: side.dataset.ex, i: +side.dataset.set, s: side.dataset.side } : null;
  const exDef = ctx ? allExercises().find(x => x.id === ctx.exId) : null;
  const readonly = a.closest('.readonly');
  if (readonly) return;

  switch (act) {
    case 'day-prev': ui.date = addDays(date, -1); ui.open = {}; return render();
    case 'day-next': ui.date = addDays(date, 1); ui.open = {}; return render();
    case 'day-today': ui.date = todayStr(); ui.open = {}; return render();
    case 'open-day': ui.date = a.dataset.date; ui.open = {}; return go('today');
    case 'toggle-ex': {
      const key = date + ':' + a.dataset.ex;
      const el = a.closest('.ex');
      ui.open[key] = !el.classList.contains('open');
      el.classList.toggle('open', ui.open[key]);
      a.setAttribute('aria-expanded', ui.open[key]);
      return;
    }
    case 'rep': {
      const n = +a.dataset.n;
      const cur = cell(data.days[date], ctx.exId, ctx.i, ctx.s);
      const r = cur?.r === n ? n - 1 : n;
      const patch = { r };
      if (r >= (exDef.repMin || 1)) patch.c = true;
      if (patch.c && (cur?.w == null)) { const w = suggestWeight(exDef, date, ctx.i, ctx.s); if (w !== '') patch.w = +w; }
      setCell(date, ctx.exId, ctx.i, ctx.s, patch);
      ui.pop = `${sideSel(ctx)} .rep[data-n="${r}"]`;
      break;
    }
    case 'rep-more': {
      const cur = cell(data.days[date], ctx.exId, ctx.i, ctx.s);
      const r = Math.max(cur?.r || 0, exDef.repMax || 0) + 1;
      setCell(date, ctx.exId, ctx.i, ctx.s, { r, c: true });
      break;
    }
    case 'drop': {
      const cur = cell(data.days[date], ctx.exId, ctx.i, ctx.s);
      setCell(date, ctx.exId, ctx.i, ctx.s, { d: !cur?.d });
      break;
    }
    case 'check': {
      const cur = cell(data.days[date], ctx.exId, ctx.i, ctx.s);
      const on = !cur?.c;
      const patch = { c: on };
      if (on && cur?.w == null) { const w = suggestWeight(exDef, date, ctx.i, ctx.s); if (w !== '') patch.w = +w; }
      if (on && !cur?.r) patch.r = exDef.repMax || exDef.repMin || 0;
      setCell(date, ctx.exId, ctx.i, ctx.s, patch);
      if (on) { ui.pop = `${sideSel(ctx)} .check`; maybeCollapse(date, ctx.exId); }
      break;
    }
    case 'cardio-min': {
      const id = a.closest('[data-cardio]').dataset.cardio;
      const rec = getDay(date); rec.cardio[id] = { ...(rec.cardio[id] || {}), min: +a.dataset.min };
      break;
    }
    case 'cardio-done': {
      const id = a.closest('[data-cardio]').dataset.cardio;
      const rec = getDay(date); const c = rec.cardio[id] ||= {};
      c.done = !c.done;
      if (c.done) ui.pop = `[data-cardio="${id}"] .check`;
      if (c.done && !c.min) { const it = cardioBlocks().flatMap(b => b.items).find(x => x.id === id); c.min = it?.minMin || 30; }
      break;
    }
    case 'open-note': ui.notesOpen[date + ':' + a.dataset.ex] = true; render(); $(`textarea[data-ex="${a.dataset.ex}"]`)?.focus(); return;
    case 'start-workout': {
      const first = liftBlocks()[0];
      $(`#block-${first.id}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    case 'finish': { const rec = getDay(date); rec.done = true; rec.finishedAt = Date.now(); save(); render(); confetti(); toast('Workout done. Nice work.'); return; }
    case 'unfinish': { const rec = getDay(date); rec.done = false; delete rec.finishedAt; break; }
    case 'skip-today': return showMissModal([date], { skipToday: true });
    case 'unskip': { const rec = getDay(date); delete rec.skip; delete rec.miss; break; }
    case 'set-reason': { const rec = getDay(date); rec.miss = { ...(rec.miss || {}), reason: a.dataset.reason }; break; }
    case 'train-anyway': {
      const s = data.settings; if (!s.resets.includes(date)) s.resets.push(date);
      save(); render(); toast('Today is now Day 1'); return;
    }
    case 'restart-today': {
      const t = todayStr(), s = data.settings; if (!s.resets.includes(t)) s.resets.push(t);
      save(); toast('Restarted. Today is Day 1.'); return render();
    }
    case 'food': {
      const li = a.closest('.food'); const m = data.meals.find(x => x.id === li.dataset.meal); const it = m.items.find(x => x.id === li.dataset.item);
      const rec = getDay(date); const f = rec.food[it.id];
      rec.food[it.id] = f ? { ...f, on: !f.on, n: f.n || it.n } : snap(it, true);
      if (rec.food[it.id].on) ui.pop = `.food[data-item="${it.id}"] .check`;
      break;
    }
    case 'qty': {
      const li = a.closest('.food'); const m = data.meals.find(x => x.id === li.dataset.meal); const it = m.items.find(x => x.id === li.dataset.item);
      const rec = getDay(date); const f = rec.food[it.id] || snap(it, false); f.n ||= it.n;
      f.qty = Math.max(0, round((+f.qty || 0) + (+a.dataset.d) * (it.unit.includes('cup') ? 0.5 : 1), 1));
      if (f.qty > 0 && !f.on) f.on = true;
      if (f.qty === 0) f.on = false;
      rec.food[it.id] = f;
      break;
    }
    case 'meal-all': {
      const m = data.meals.find(x => x.id === a.dataset.meal); const rec = getDay(date);
      const all = m.items.every(it => rec.food[it.id]?.on);
      for (const it of m.items) { const f = rec.food[it.id]; rec.food[it.id] = f ? { ...f, on: !all, n: f.n || it.n } : snap(it, !all); }
      break;
    }
    case 'del-custom': { const rec = getDay(date); rec.custom = rec.custom.filter(c => c.id !== a.dataset.id); break; }
    case 'edit-out': ui.editOut = ui.editOut === date ? null : date; return render();
    case 'save-out': { const v = +$('[data-input="out-override"]').value; const rec = getDay(date); rec.outOverride = v > 0 ? v : null; ui.editOut = null; break; }
    case 'clear-out': { const rec = getDay(date); rec.outOverride = null; ui.editOut = null; break; }
    case 'month': { const [y, m] = ui.month.split('-').map(Number); const d = new Date(y, m - 1 + (+a.dataset.d), 1); ui.month = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`; return render(); }
    case 'range': ui.range = +a.dataset.v; return render();
    case 'nut-scope': ui.nutScope = a.dataset.v; return render();
    case 'food-more': ui.nutEdit = ui.nutEdit === a.dataset.id ? null : a.dataset.id; return render();
    case 'theme': data.settings.theme = a.dataset.v; applyTheme(); break;
    case 'add-ex': { const b = data.program.blocks.find(x => x.id === a.dataset.b); b.exercises.push(ex('ex-' + uid(), 'New exercise', { repMin: 8, repMax: 12 })); break; }
    case 'del-ex': { const b = data.program.blocks.find(x => x.id === a.dataset.b); if (!confirmInline(a)) return; b.exercises = b.exercises.filter(e => e.id !== a.dataset.id); break; }
    case 'add-cardio': { const b = data.program.blocks.find(x => x.id === a.dataset.b); b.items.push({ id: 'c-' + uid(), name: 'New cardio', minMin: 20, maxMin: 40, met: 6 }); break; }
    case 'del-cardio': { const b = data.program.blocks.find(x => x.id === a.dataset.b); if (!confirmInline(a)) return; b.items = b.items.filter(e => e.id !== a.dataset.id); break; }
    case 'add-food': { const m = data.meals.find(x => x.id === a.dataset.m); const it = food('New food', 1, 'serving', 100, 0, {}); m.items.push(it); ui.nutEdit = it.id; break; }
    case 'del-food': { const m = data.meals.find(x => x.id === a.dataset.m); if (!confirmInline(a)) return; m.items = m.items.filter(e => e.id !== a.dataset.id); break; }
    case 'import': return doImport(a.dataset.kind, a);
    case 'go-health': go('settings'); setTimeout(() => $('#health-card')?.scrollIntoView({ behavior: 'smooth' }), 50); return;
    case 'copy': {
      const t = a.dataset.text;
      (navigator.clipboard?.writeText(t) || Promise.reject()).then(() => toast('Copied')).catch(() => toast(t));
      return;
    }
    case 'rehab': {
      const id = a.closest('[data-rehab]').dataset.rehab, n = +a.dataset.n, r = getDay(date);
      r.rehab ||= {};
      r.rehab[id] = (+r.rehab[id] || 0) === n ? n - 1 : n;
      if (r.rehab[id] >= n) ui.pop = `[data-rehab="${id}"] .check:nth-child(${n})`;
      break;
    }
    case 'pain': { const r = getDay(date); r.pain = r.pain === +a.dataset.n ? undefined : +a.dataset.n; break; }
    case 'rehab-edit': ui.rehabEdit = ui.rehabEdit === a.dataset.break ? null : a.dataset.break; return render();
    case 'rehab-del': {
      const id = a.closest('[data-rehab]').dataset.rehab;
      if (!confirmInline(a)) return;
      for (const b of data.settings.breaks || []) b.items = (b.items || []).filter(it => it.id !== id);
      break;
    }
    case 'backup-use': setBackupDir(a.dataset.dir); return;
    case 'backup-pick': { const dir = await window.api?.backup?.pick(); if (dir) setBackupDir(dir); return; }
    case 'backup-off': setBackupDir(null); return;
    case 'backup-now': window.api?.backup?.now().then(st => { ui.backup = st; writeWorkbook(true); refreshBackupCard(); toast(st.error ? st.error : 'Backed up'); }); return;
    case 'backup-nudge-off': data.settings.backupNudgeOff = true; break;
    case 'add-break': { const t = todayStr(); (data.settings.breaks ||= []).push({ id: 'b-' + uid(), label: 'Time off', start: t, end: addDays(t, 6) }); break; }
    case 'del-break': { if (!confirmInline(a)) return; data.settings.breaks = (data.settings.breaks || []).filter(b => b.id !== a.dataset.id); break; }
    case 'edit-breaks': go('settings'); setTimeout(() => $('#breaks')?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 50); return;
    case 'resend-week': {
      const from = addDays(todayStr(), -6);
      for (const k of Object.keys(data.exportLog || {})) { const d = k.split(':')[1]; if (d >= from) delete data.exportLog[k]; }
      save(); refreshHealthCard(); toast('The last 7 days will be sent again on the next sync'); return;
    }
    case 'new-key': data.settings.sync.key = newKey(); save(); applySync(); toast('New key made. Update it on your iPhone.'); return;
    case 'pick-watch': {
      const dir = await window.api?.sync?.pickFolder();
      if (dir) { data.settings.watchDir = dir; save(); window.api.sync.watch(dir).then(st => { ui.sync = st; refreshHealthCard(); }); }
      return;
    }
    case 'unwatch': data.settings.watchDir = null; save(); window.api?.sync?.watch(null).then(st => { ui.sync = st; refreshHealthCard(); }); return;
    case 'del-source': data.settings.healthSources.splice(+a.dataset.i, 1); break;
    case 'export': {
      if (window.api) { const p = await window.api.exportBackup(data); if (p) toast('Backup saved'); }
      else { const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const u = URL.createObjectURL(blob); const l = document.createElement('a'); l.href = u; l.download = 'workout-tracker-backup.json'; l.click(); }
      return;
    }
    case 'restore': {
      if (!window.api) return toast('Restore works in the desktop app');
      const d = await window.api.importBackup();
      if (d && d.settings && d.days) { data = migrate(d); save(); applyTheme(); render(); toast('Backup restored'); }
      else if (d) toast('That file is not a Workout Tracker backup');
      return;
    }
    case 'open-folder': window.api?.openDataFolder(); return;
    case 'upd-check': window.api?.update?.check().then(onUpdateStatus); return;
    case 'upd-restart': window.api?.update?.restart(); return;
    case 'upd-later': ui.updateBarDismissed = ui.update?.latest; renderUpdateBar(); return;
    case 'upd-save': {
      const src = $('[data-upd="source"]')?.value.trim() || '';
      const tok = $('[data-upd="token"]')?.value;
      a.disabled = true;
      window.api?.update?.setConfig({ source: src, ...(tok ? { token: tok } : {}) })
        .then(st => window.api.update.get().then(full => { document.activeElement?.blur(); onUpdateStatus({ ...full, ...st }); }))
        .finally(() => { a.disabled = false; });
      return;
    }
    default: return;
  }
  save();
  render();
});

const sideSel = (c) => `.side[data-ex="${c.exId}"][data-set="${c.i}"][data-side="${c.s}"]`;

// Confetti in Google colors, once, when you finish a workout.
function confetti() {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return;
  const cv = $('#confetti'), ctx = cv.getContext('2d');
  const W = cv.width = innerWidth * devicePixelRatio, H = cv.height = innerHeight * devicePixelRatio;
  const colors = ['#4285F4', '#EA4335', '#FBBC04', '#34A853'];
  const btn = $('.done-stamp') || $('.finish');
  const r = btn ? btn.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 2, width: 0, height: 0 };
  const ox = (r.left + r.width / 2) * devicePixelRatio, oy = (r.top + r.height / 2) * devicePixelRatio;
  const parts = Array.from({ length: 160 }, () => {
    const a = -Math.PI / 2 + (Math.random() - .5) * 2.2, v = (8 + Math.random() * 14) * devicePixelRatio;
    return { x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, s: (5 + Math.random() * 7) * devicePixelRatio, c: colors[Math.random() * 4 | 0], rot: Math.random() * 6, vr: (Math.random() - .5) * .4, shape: Math.random() < .5 };
  });
  const t0 = performance.now();
  (function frame(t) {
    const k = (t - t0) / 1800;
    ctx.clearRect(0, 0, W, H);
    for (const p of parts) {
      p.vy += .45 * devicePixelRatio; p.vx *= .985; p.vy *= .985; p.x += p.vx; p.y += p.vy; p.rot += p.vr;
      ctx.globalAlpha = Math.max(0, 1 - k * k);
      ctx.fillStyle = p.c; ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot);
      if (p.shape) { ctx.beginPath(); ctx.arc(0, 0, p.s / 2, 0, 7); ctx.fill(); } else ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
      ctx.restore();
    }
    if (k < 1) requestAnimationFrame(frame); else ctx.clearRect(0, 0, W, H);
  })(t0);
}

// Ask for a second click before deleting plan items.
function confirmInline(btn) {
  if (btn.dataset.armed) return true;
  btn.dataset.armed = '1'; btn.classList.add('armed'); btn.title = 'Click again to remove';
  setTimeout(() => { delete btn.dataset.armed; btn.classList.remove('armed'); }, 2500);
  return false;
}

function maybeCollapse(date, exId) {
  const e = allExercises().find(x => x.id === exId);
  const p = exProgress(data.days[date], e);
  if (p.d === p.t) delete ui.open[date + ':' + exId];
}

// Text and number inputs: save without re-rendering on every keystroke.
document.addEventListener('input', (e) => {
  const el = e.target, k = el.dataset.input, date = ui.date;
  if (!k) return;
  if (k === 'day-note') { getDay(date).note = el.value; save(); }
  if (k === 'ex-note') { getDay(date).exNotes[el.dataset.ex] = el.value; save(); }
  if (k === 'rehab-note') { getDay(date).rehabNote = el.value; save(); }
  if (k === 'miss-note') { const r = getDay(date); r.miss = { ...(r.miss || {}), note: el.value }; save(); }
});
document.addEventListener('change', (e) => {
  const el = e.target, date = ui.date;
  const k = el.dataset.input;
  if (k === 'weight') {
    const side = el.closest('.side');
    const v = el.value === '' ? null : +el.value;
    setCell(date, side.dataset.ex, +side.dataset.set, side.dataset.side, { w: v });
    save(); return render();
  }
  if (k === 'cardio-min') {
    const id = el.closest('[data-cardio]').dataset.cardio; const rec = getDay(date);
    rec.cardio[id] = { ...(rec.cardio[id] || {}), min: +el.value || 0 }; save(); return render();
  }
  if (k === 'body-weight') { const rec = getDay(date); rec.weight = el.value ? round(+el.value, 1) : undefined; rec.weightAt = Date.now(); save(); return render(); }
  if (k === 'quick-weight') { if (el.value) { const r = getDay(todayStr()); r.weight = round(+el.value, 1); r.weightAt = Date.now(); save(); render(); toast('Weight logged for today'); } return; }
  if (k === 'day-jump') { if (el.value) { ui.date = el.value; ui.open = {}; render(); } return; }
  if (k === 'prog-ex') { ui.progEx = el.value; return render(); }

  // Apple Health settings
  const hk = el.dataset.health;
  if (hk) {
    const s = data.settings; s.sync ||= { enabled: false, port: 47821, key: null };
    if (hk === 'wifi') { s.sync.enabled = el.checked; if (el.checked && !s.sync.key) s.sync.key = newKey(); save(); applySync(); el.blur(); setTimeout(refreshHealthCard, 50); }
    if (hk === 'port') { const v = +el.value; if (v >= 1024 && v <= 65535) { s.sync.port = v; save(); applySync(); } else toast('Use a port between 1024 and 65535'); }
    if (hk === 'background') { s.background = el.checked; save(); window.api?.background(el.checked); toast(el.checked ? 'Closing the window now keeps the app in the tray' : 'Closing the window quits the app'); }
    return;
  }
  if (el.dataset.break) {
    const b = (data.settings.breaks || []).find(x => x.id === el.dataset.id);
    if (!b) return;
    b[el.dataset.break] = el.value;
    if (b.start && b.end && b.end < b.start) b.end = b.start;
    save(); toast('Saved'); if (el.type === 'date') render(); return;
  }
  if (el.dataset.share) {
    const sh = data.settings.share, k = el.dataset.share;
    sh[k] = el.type === 'checkbox' ? el.checked : el.value;
    if (k === 'enabled' && el.checked && !data.settings.sync?.enabled) { data.settings.sync.enabled = true; data.settings.sync.key ||= newKey(); applySync(); }
    save(); el.blur(); setTimeout(refreshHealthCard, 30); return;
  }
  if (el.dataset.goal) { const g = (data.settings.goals ||= { move: 500, exercise: 30, stand: 12 }); g[el.dataset.goal] = Math.max(1, +el.value || 1); save(); toast('Saved'); return; }

  // Settings
  const sk = el.dataset.set, s = data.settings;
  if (sk) {
    if (sk === 'sex') s.profile.sex = el.value;
    if (sk === 'age') s.profile.age = +el.value || null;
    if (sk === 'ft' || sk === 'in') {
      const ft = +$('[data-set="ft"]').value || 0, inch = +$('[data-set="in"]').value || 0;
      s.profile.heightIn = ft * 12 + inch || null;
    }
    if (sk === 'startDate' && el.value) s.startDate = el.value;
    if (sk === 'threshold') s.threshold = +el.value;
    if (sk === 'dropMin') s.dropMin = Math.max(0, +el.value || 0);
    if (sk === 'weightStep') s.weightStep = Math.max(1, +el.value || 5);
    if (sk === 'remOn') s.reminder.on = el.checked;
    if (sk === 'remTime') s.reminder.time = el.value;
    if (sk === 'login') { window.api?.loginItem(el.checked); return; }
    save(); toast('Saved'); return;
  }
  // Plan editors
  const ed = el.dataset.edit;
  if (ed) {
    const val = el.type === 'checkbox' ? el.checked : el.type === 'number' ? (el.value === '' ? null : +el.value) : el.value;
    if (ed === 'block') data.program.blocks.find(b => b.id === el.dataset.b).name = val;
    if (ed === 'ex') { const e2 = data.program.blocks.find(b => b.id === el.dataset.b).exercises.find(x => x.id === el.dataset.id); e2[el.dataset.k] = el.dataset.k === 'sets' ? clamp(val || 1, 1, 10) : val; }
    if (ed === 'cardio') { const it = data.program.blocks.find(b => b.id === el.dataset.b).items.find(x => x.id === el.dataset.id); it[el.dataset.k] = val; }
    if (ed === 'meal') data.meals.find(m => m.id === el.dataset.m).name = val;
    if (ed === 'food') { const it = data.meals.find(m => m.id === el.dataset.m).items.find(x => x.id === el.dataset.id); it[el.dataset.k] = val; }
    if (ed === 'food-n') { const it = data.meals.find(m => m.id === el.dataset.m).items.find(x => x.id === el.dataset.id); (it.n ||= {})[el.dataset.k] = val || 0; }
    save(); toast('Saved');
  }
});
document.addEventListener('submit', (e) => {
  const f = e.target;
  if (f.dataset.form === 'rehab') {
    e.preventDefault();
    const fd = new FormData(f), br = (data.settings.breaks || []).find(b => b.id === f.dataset.break);
    if (!br) return;
    (br.items ||= []).push({ id: 'r-' + uid(), name: String(fd.get('name')).trim(), detail: String(fd.get('detail') || '').trim(), times: clamp(+fd.get('times') || 1, 1, 12) });
    ui.rehabEdit = br.id; save(); render();
    $('.rehab-add input[name="name"]')?.focus();
    return;
  }
  if (f.dataset.form !== 'custom') return;
  e.preventDefault();
  const fd = new FormData(f);
  getDay(ui.date).custom.push({ id: uid(), name: fd.get('name'), kcal: +fd.get('kcal') || 0, protein: +fd.get('protein') || 0, carbs: +fd.get('carbs') || 0, fat: +fd.get('fat') || 0 });
  save(); render();
});
// Keyboard: arrow keys move across rep dots.
document.addEventListener('keydown', (e) => {
  const r = e.target.closest?.('.rep');
  if (!r || !['ArrowLeft', 'ArrowRight'].includes(e.key)) return;
  const sib = e.key === 'ArrowRight' ? r.nextElementSibling : r.previousElementSibling;
  if (sib?.classList.contains('rep')) { e.preventDefault(); sib.focus(); }
});

// ======================================================================
// Cloud backup
// ======================================================================
function backupCard() {
  const dir = data.settings.backupDir, st = ui.backup || {}, sug = ui.backupSuggest || [];
  if (!window.api?.backup) return `<header class="card-head"><h2>Cloud backup</h2></header><p class="hint">Cloud backup works in the desktop app.</p>`;
  const when = st.lastAt ? new Date(st.lastAt).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;
  return `<header class="card-head"><h2>Cloud backup</h2>${dir && !st.error ? `<span class="pill ok">${when ? 'Backed up ' + esc(when) : 'On'}</span>` : ''}</header>
    <p>Keeps a copy of your history in a cloud folder, so a dead drive or a new PC doesn't lose it. Saves every 10 minutes while you use the app, keeps one file per day for 60 days, and <code>latest.json</code> is always current.</p>
    <p><b>Workout Tracker Data.xlsx</b> sits next to it: your full history as readable tabs (Guide, Summary, Daily, Sets, Food, Plans). Open it in Google Sheets or Excel, or point an AI assistant like Claude at it to ask questions about your training.</p>
    ${dir ? `<div class="copy-row"><span>Folder</span><code>${esc(dir)}\\Workout Tracker Backups</code><button class="btn btn-small btn-ghost" data-action="backup-off">Turn off</button></div>
      ${st.error ? `<p class="sync-status bad">${esc(st.error)}</p>` : ''}
      ${st.workbookError ? `<p class="sync-status bad">${esc(st.workbookError)}</p>` : st.workbookAt ? `<p class="sync-status ok">Workout Tracker Data.xlsx updated ${new Date(st.workbookAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</p>` : ''}
      <div class="row-gap wrap"><button class="btn btn-small" data-action="backup-now">Back up now</button><span class="hint">To restore on another PC, use Restore from backup below and pick latest.json.</span></div>`
    : `<div class="row-gap wrap">${sug.map(x => `<button class="btn" data-action="backup-use" data-dir="${esc(x.dir)}">Use ${esc(x.name)}</button>`).join('')}<button class="btn ${sug.length ? 'btn-ghost' : ''}" data-action="backup-pick">Choose a folder</button></div>
      ${sug.length ? '' : '<p class="hint">No OneDrive or iCloud Drive folder found on this PC. Install one of them, or choose any synced folder.</p>'}`}`;
}
// ---------- Readable workbook (Excel) for people and AI tools ----------
const yn = (v) => v ? 'yes' : 'no';
const r1 = (v) => v == null || !isFinite(v) ? '' : Math.round(v * 10) / 10;
const r0 = (v) => v == null || !isFinite(v) ? '' : Math.round(v);
function planDayLabel(sc) { return sc.kind === 'off' ? `Time off (${sc.label})` : sc.kind === 'rest' ? 'Rest' : sc.kind === 'before' ? 'Before plan' : `Day ${sc.day}`; }
function workbookSheets() {
  const s = data.settings, today = todayStr(), sc = schedule(), st = stats();
  const allDates = [...new Set([...Object.keys(data.days), ...Object.keys(data.health), ...Object.keys(sc).filter(d => d <= today)])].filter(d => d <= today).sort();
  const exName = (id) => allExercises().find(e => e.id === id)?.name || id;
  const blockOf = (id) => liftBlocks().find(b => b.exercises.some(e => e.id === id))?.name || '';
  const fmtRange = (a, b, u = '') => a == null ? '' : `${a}${b != null && b !== a ? '–' + b : ''}${u}`;

  // Daily
  const daily = [['date', 'weekday', 'plan_day', 'status', 'workout_completion_pct', 'workout_finished', 'side_sets_logged', 'drop_sets', 'lifting_kcal_est', 'cardio_minutes', 'cardio_kcal_est', 'kcal_in', 'kcal_out', 'kcal_out_source', 'net_kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg', 'body_weight_lb', 'apple_active_kcal', 'apple_resting_kcal', 'steps', 'exercise_min', 'stand_hours', 'resting_hr_bpm', 'sleep_hours', 'missed_reason', 'missed_note', 'pain_0_10', 'recovery_done', 'recovery_total', 'workout_note', 'recovery_note']];
  for (const d of allDates) {
    const rec = data.days[d], h = data.health[d] || {}, sd = sched(d), p = progress(rec), c = calories(d), n = nutrition(dayEntries(rec)).t;
    const cardioMin = cardioBlocks().flatMap(b => b.items).reduce((a, it) => a + (rec?.cardio?.[it.id]?.done ? +rec.cardio[it.id].min || 0 : 0), 0);
    const brk = sd.kind === 'off' ? (s.breaks || []).find(b => b.id === sd.breakId) : null;
    const rTot = brk ? (brk.items || []).reduce((a, it) => a + (+it.times || 1), 0) : '';
    const rDone = brk ? (brk.items || []).reduce((a, it) => a + Math.min(+rec?.rehab?.[it.id] || 0, +it.times || 1), 0) : '';
    const hasFood = dayEntries(rec).length > 0;
    daily.push([d, longDate(d, { weekday: 'short' }), planDayLabel(sd), sd.status, Math.round(p.pct * 100), yn(rec?.done), p.sidesDone, dropsDone(rec), r0(c.liftK), cardioMin || '', r0(c.cardioK) || '',
      hasFood ? r0(c.inK) : '', r0(c.out), c.out ? (c.basis || '') : '', hasFood && c.out ? r0(c.net) : '',
      hasFood ? r1(n.protein) : '', hasFood ? r1(n.carbs) : '', hasFood ? r1(n.fat) : '', hasFood ? r1(n.fiber) : '', hasFood ? r1(n.sugar) : '', hasFood ? r0(n.sodium) : '',
      weightOn(d) ?? '', h.active ?? '', h.basal ?? '', h.steps ?? '', h.exercise ?? '', h.stand ?? '', h.restingHR ?? '', h.sleepH ?? '',
      rec?.miss?.reason ? reasonOf(rec.miss.reason)?.label || rec.miss.reason : '', rec?.miss?.note || '', rec?.pain ?? '', rDone, rTot, rec?.note || '', rec?.rehabNote || '']);
  }

  // Sets
  const sets = [['date', 'plan_day', 'block', 'exercise', 'set', 'side', 'reps', 'weight_lb', 'drop_set_to_failure', 'completed', 'target_reps', 'exercise_note']];
  for (const d of Object.keys(data.days).sort()) {
    const rec = data.days[d];
    for (const e of allExercises()) {
      const arr = rec.sets?.[e.id];
      if (!arr) continue;
      arr.forEach((row, i) => {
        if (!row) return;
        for (const side of sidesOf(e)) {
          const cc = row[side];
          if (!cc || (!cc.c && !cc.r)) continue;
          sets.push([d, planDayLabel(sched(d)), blockOf(e.id), e.name, i + 1, SIDE_LABEL[side].toLowerCase(), +cc.r || 0, cc.w ?? '', yn(i === e.sets - 1 && cc.d), yn(cc.c), fmtRange(e.repMin, e.repMax), i === 0 && side === sidesOf(e)[0] ? rec.exNotes?.[e.id] || '' : '']);
        }
      });
    }
  }

  // Food
  const food = [['date', 'meal', 'food', 'quantity', 'unit', 'kcal', 'protein_g', 'carbs_g', 'fat_g', 'fiber_g', 'sugar_g', 'sodium_mg']];
  for (const d of Object.keys(data.days).sort()) {
    for (const e of dayEntries(data.days[d])) {
      const unit = data.meals.flatMap(m => m.items).find(it => it.name === e.name)?.unit || (e.meal === 'Extras' ? 'entry' : '');
      food.push([d, e.meal, e.name, e.qty, unit, r0(e.qty * e.kcal), r1(e.qty * e.protein), r1(e.qty * (+e.n.carbs || 0)), r1(e.qty * (+e.n.fat || 0)), r1(e.qty * (+e.n.fiber || 0)), r1(e.qty * (+e.n.sugar || 0)), r0(e.qty * (+e.n.sodium || 0))]);
    }
  }

  // Summary
  const tmr = addDays(today, 1);
  const avg = (days) => { const a = averageNutrition(days); return a.days ? a : null; };
  const a7 = avg(7), a30 = avg(30);
  const wDates = allDates.filter(d => weightOn(d) != null);
  const lastW = wDates.length ? weightOn(wDates[wDates.length - 1]) : null;
  const w30 = wDates.filter(d => diffDays(d, today) <= 30);
  const summary = [['metric', 'value'],
    ['Exported', new Date().toLocaleString()], ['Plan start date', s.startDate], ['Days tracked', allDates.length],
    ['Workouts completed', st.workouts], ['Current streak (days on plan)', st.streak], ['Longest streak', st.longest],
    ['Training days hit, last 30 days', st.rate30 == null ? '' : Math.round(st.rate30 * 100) + '%'],
    ['Missed days, all time', st.missed.length],
    ...Object.entries(st.reasons).map(([k, v]) => [`  missed because: ${reasonOf(k)?.label || 'no reason given'}`, v]),
    ...(s.breaks || []).map(b => [`Time off: ${b.label || 'Time off'}`, `${b.start} to ${b.end}`]),
    ['Latest body weight (lb)', lastW ?? ''],
    ['Body weight change, last 30 days (lb)', w30.length > 1 ? r1(weightOn(w30[w30.length - 1]) - weightOn(w30[0])) : ''],
    ...[['7-day', a7], ['30-day', a30]].flatMap(([label, a]) => a ? [
      [`${label} average calories in (${a.days} days logged)`, r0(a.t.kcal)], [`${label} average protein (g)`, r0(a.t.protein)],
      [`${label} average carbs (g)`, r0(a.t.carbs)], [`${label} average fat (g)`, r0(a.t.fat)],
      [`${label} average fiber (g)`, r0(a.t.fiber)], [`${label} average sodium (mg)`, r0(a.t.sodium)]] : []),
    [], ['Exercise', 'Working weight, last reps, status, best'],
    ...allExercises().map(e => {
      const pr = progression(e, tmr), all = sessionsOf(e.id, tmr, 9999);
      const best = all.reduce((m, x) => Math.max(m, sessionTop(x.sets).top), 0);
      const status = !pr ? 'no weights logged yet' : pr.kind === 'up' ? `ready to go up to ${pr.to} lb` : pr.kind === 'stuck' ? 'stuck for 3 sessions' : `building to ${pr.target} reps on every set`;
      return [e.name, pr ? `${pr.from ?? pr.at} lb, last reps ${pr.reps}, ${status}, best ${best} lb, ${all.length} sessions` : 'no sessions logged'];
    })];

  // Plans
  const plan = [['block', 'exercise', 'sets', 'reps_min', 'reps_max', 'per_side', 'weight_min_lb', 'weight_max_lb', 'drop_set_on_last_set']];
  for (const b of data.program.blocks) {
    if (b.type === 'cardio') for (const it of b.items) plan.push([b.name, it.name, '', '', '', '', '', '', '', ]);
    else for (const e of b.exercises) plan.push([b.name, e.name, e.sets, e.repMin, e.repMax, yn(e.perSide), e.wMin ?? '', e.wMax ?? '', yn(e.drop)]);
  }
  plan.push([], ['meal', 'food', 'default_qty', 'unit', 'kcal_per_unit', 'protein_g_per_unit', 'carbs_g_per_unit', 'fat_g_per_unit', 'fiber_g_per_unit', 'sodium_mg_per_unit']);
  for (const m of data.meals) for (const it of m.items) plan.push([m.name, it.name, it.qty, it.unit, it.kcal, it.protein, it.n?.carbs ?? 0, it.n?.fat ?? 0, it.n?.fiber ?? 0, it.n?.sodium ?? 0]);

  // Guide
  const blocksText = data.program.blocks.map((b, i) => b.type === 'cardio'
    ? `Block ${i + 1} (${b.name}): ${b.items.map(it => `${it.name} ${it.minMin}–${it.maxMin} min`).join(', ')}`
    : `Block ${i + 1} (${b.name}): ${b.exercises.map(e => `${e.name} ${e.sets}x${fmtRange(e.repMin, e.repMax)}${e.perSide ? ' per side' : ''}${e.wMin ? ' at ' + fmtRange(e.wMin, e.wMax, ' lb') : ''}${e.drop ? ', drop set to failure on the last set' : ''}`).join('; ')}`);
  const guide = [['topic', 'details'],
    ['What this is', `Personal training, nutrition and health log from the Workout Tracker app for one person. Updated automatically. Exported ${new Date().toLocaleString()}.`],
    ['Units', 'Weights in pounds (lb), energy in kcal, macros in grams (g), sodium in milligrams (mg). Dates are local, YYYY-MM-DD.'],
    ['Schedule rules', 'Repeating 3-day cycle: Day 1 train, Day 2 train (same workout), Day 3 rest. If a training day passes without the workout, it is a miss and the next day restarts at Day 1. A training day counts when finished or at least ' + Math.round(s.threshold * 100) + '% of checks are done. Planned time off is not a miss and does not break the streak.'],
    ...blocksText.map((t, i) => [i === 0 ? 'Workout' : '', t]),
    ['Progression rule', `Double progression: when every set of an exercise reaches the top of its rep range, the next session goes up ${+s.weightStep || 5} lb.`],
    ['Calorie estimates', `Calories out is from Apple Health when synced (see kcal_out_source); otherwise estimated: resting burn (Mifflin-St Jeor) x ${s.activityFactor}, plus lifting (${s.minPerSetSide} min per logged side-set at MET ${s.liftMet}, drop sets ${s.dropMin ?? 0.5} min at MET ${s.dropMet ?? 6}) and cardio (Beat Saber at MET ${cardioBlocks()[0]?.items[0]?.met ?? 6}). Food values come from product labels and USDA data and are estimates.`],
    ['Tab: Summary', 'Headline stats, averages, and each exercise\'s working weight, last reps, progression status and best weight.'],
    ['Tab: Daily', 'One row per day. Key columns: plan_day, status (done, missed, rest, off, today, extra = trained on a rest day), workout_completion_pct, kcal_in/kcal_out/net_kcal, macros, body_weight_lb, Apple Health activity (apple_active_kcal, steps, exercise_min, stand_hours, resting_hr_bpm, sleep_hours), missed_reason, pain_0_10 and recovery_* during time off.'],
    ['Tab: Sets', 'One row per logged set and side (left, right or both). drop_set_to_failure applies only to the last set. completed = the set was checked off.'],
    ['Tab: Food', 'One row per food eaten per day, with totals for the quantity eaten.'],
    ['Tab: Plans', 'The current workout plan and meal plan (per-unit nutrition).'],
  ];

  return [
    { name: 'Guide', rows: guide, widths: [22, 140] },
    { name: 'Summary', rows: summary, widths: [46, 90] },
    { name: 'Daily', rows: daily, widths: [12, 9, 22, 9, ...Array(daily[0].length - 4).fill(14)] },
    { name: 'Sets', rows: sets, widths: [12, 22, 16, 38, 6, 8, 7, 10, 18, 11, 12, 40] },
    { name: 'Food', rows: food, widths: [12, 14, 28, 9, 22, 8, 10, 9, 8, 8, 8, 10] },
    { name: 'Plans', rows: plan, widths: [16, 38, 10, 22, 13, 18, 16, 16, 18, 18] },
  ];
}
let workbookAt = 0, workbookDirty = true;
function writeWorkbook(force) {
  if (!window.api?.backup || !data.settings.backupDir) return;
  if (!force && (!workbookDirty || Date.now() - workbookAt < 10 * 60 * 1000)) return;
  workbookAt = Date.now(); workbookDirty = false;
  try { window.api.backup.workbook(workbookSheets()).then(st => { ui.backup = st; refreshBackupCard(); }); }
  catch (err) { console.error(err); }
}

function refreshBackupCard() { const c = $('#backup-card'); if (c) c.innerHTML = backupCard(); }
function setBackupDir(dir) {
  data.settings.backupDir = dir || null; save();
  window.api?.backup?.configure(dir || null).then(st => { ui.backup = st; refreshBackupCard(); if (dir && !st.error) { toast('Cloud backup is on'); writeWorkbook(true); } render(); });
}
function backupNudge() {
  if (!window.api?.backup || data.settings.backupDir || data.settings.backupNudgeOff) return '';
  const sug = ui.backupSuggest?.[0];
  return `<div class="nudge backup-nudge"><span class="nudge-dot"></span><p><b>Your history only lives on this PC.</b> Back it up to ${sug ? esc(sug.name) : 'a cloud folder'} so you never lose it.</p>${sug ? `<button class="btn btn-small" data-action="backup-use" data-dir="${esc(sug.dir)}">Use ${esc(sug.name)}</button>` : `<button class="btn btn-small" data-action="backup-pick">Choose folder</button>`}<button class="btn btn-small btn-ghost" data-action="backup-nudge-off">Not now</button></div>`;
}

// ======================================================================
// Apple Health settings card
// ======================================================================
const newKey = () => Array.from(crypto.getRandomValues(new Uint8Array(15)), b => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
function healthCard() {
  const s = data.settings, sy = s.sync || {}, st = ui.sync || {};
  const desktop = !!window.api?.sync;
  const ip = st.addresses?.[0] || 'YOUR-PC-IP';
  const port = st.port || sy.port || 47821;
  const url = `http://${ip}:${port}/health`;
  const g = s.goals || { move: 500, exercise: 30, stand: 12 };
  const last = s.lastHealthSync ? new Date(s.lastHealthSync).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;
  const sources = s.healthSources.map((src, i) => `<li><b>${({ apple: 'Apple Health', google: 'Google Fit', csv: 'CSV' })[src.kind] || 'File'}</b><span class="path">${esc(src.path)}</span><small>${esc(src.summary || '')}${src.at ? ', imported ' + new Date(src.at).toLocaleString() : ''}</small><button class="icon-btn sm" data-action="del-source" data-i="${i}" aria-label="Stop syncing">${ICON.x}</button></li>`).join('');
  let wifiStatus = '';
  if (sy.enabled) wifiStatus = st.error ? `<p class="sync-status bad">${esc(st.error)}</p>` : st.listening ? `<p class="sync-status ok">Ready for your iPhone on port ${port}.${st.lastAt ? ` Last received ${new Date(st.lastAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}: ${esc(st.lastSummary || '')}.` : ''}</p>` : '<p class="sync-status">Starting…</p>';
  return `<header class="card-head"><h2>Apple Health and Fitness</h2>${last ? `<span class="pill ok">Last sync ${esc(last)}</span>` : ''}</header>
    <p>Your iPhone sends Apple Health data here automatically: Move, Exercise and Stand, steps, active and resting calories, weight, resting heart rate and sleep. Synced days replace the calorie estimate, and synced weight fills in your weigh-ins.</p>
    ${!desktop ? '<p class="hint">Syncing works in the desktop app.</p>' : `
    <div class="sync-grid">
      <div class="sync-opt">
        <label class="toggle"><input type="checkbox" data-health="wifi" ${sy.enabled ? 'checked' : ''}><span><b>Sync over Wi-Fi</b><small>Instant. Your iPhone and this PC need to be on the same Wi-Fi, with this app open.</small></span></label>
        ${sy.enabled ? `
        <div class="copy-row"><span>Address</span><code>${esc(url)}</code><button class="btn btn-small" data-action="copy" data-text="${esc(url)}">Copy</button></div>
        <div class="copy-row"><span>Key</span><code>${esc(sy.key || '')}</code><button class="btn btn-small" data-action="copy" data-text="${esc(sy.key || '')}">Copy</button></div>
        ${wifiStatus}
        <p class="hint">Test it: open <code>${esc(`http://${ip}:${port}/ping?key=${sy.key}`)}</code> in Safari on your iPhone. If Windows asks about network access, allow it on private networks.${st.addresses?.length > 1 ? ` Other addresses for this PC: ${st.addresses.slice(1).map(esc).join(', ')}.` : ''}</p>
        <div class="row-gap wrap"><label class="field port-field"><span>Port</span><input type="number" data-health="port" value="${port}"></label><button class="link-btn" data-action="new-key">Make a new key</button></div>` : ''}
      </div>
      <div class="sync-opt">
        <div class="toggle"><span><b>Watch an iCloud Drive folder</b><small>Works even if this PC was off when your iPhone synced. Needs iCloud for Windows.</small></span></div>
        ${s.watchDir ? `<div class="copy-row"><span>Folder</span><code>${esc(s.watchDir)}</code><button class="btn btn-small btn-ghost" data-action="unwatch">Stop</button></div>
          ${st.watch?.error ? `<p class="sync-status bad">${esc(st.watch.error)}</p>` : st.watch?.lastAt ? `<p class="sync-status ok">Last file: ${esc(st.watch.lastFile)} at ${new Date(st.watch.lastAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}.</p>` : '<p class="sync-status">Watching for new files.</p>'}`
        : `<button class="btn" data-action="pick-watch">Choose folder</button>`}
      </div>
    </div>
    <label class="toggle bg-toggle"><input type="checkbox" data-health="background" ${s.background ? 'checked' : ''}><span><b>Keep syncing when the window is closed</b><small>Closing the window hides the app in the system tray instead of quitting. Pair it with "Open when I sign in to Windows" under Reminders.</small></span></label>
    ${shareSection(url, sy.key)}
    <div class="form-grid goals"><label class="field"><span>Move goal (kcal)</span><input type="number" data-goal="move" value="${g.move}"></label><label class="field"><span>Exercise goal (min)</span><input type="number" data-goal="exercise" value="${g.exercise}"></label><label class="field"><span>Stand goal (hours)</span><input type="number" data-goal="stand" value="${g.stand}"></label></div>
    <details class="howto"><summary>Set up with Health Auto Export (easiest)</summary>
      <ol>
        <li>On your iPhone, install <b>Health Auto Export - JSON+CSV</b> from the App Store and allow Health access. Background syncing needs its Premium plan.</li>
        <li>Open <b>Automations</b>, add a new automation, and choose <b>REST API</b>.</li>
        <li>URL: <code>${esc(url)}</code>. Add a header named <code>Authorization</code> with the value <code>Bearer ${esc(sy.key || 'YOUR-KEY')}</code>. Turn on Wi-Fi sync above first to get these.</li>
        <li>Export format <b>JSON</b>. Pick Active Energy, Resting Energy, Step Count, Apple Exercise Time, Apple Stand Hour, Weight & Body Mass, Resting Heart Rate and Sleep Analysis.</li>
        <li>Group data by <b>day</b> and include at least today and yesterday in each sync, so totals are always complete. Set it to sync every hour or so.</li>
        <li>Tap <b>Manual export</b> once to test. The Activity card on Today fills in within a second.</li>
      </ol>
      <p>Prefer the folder route? Choose <b>iCloud Drive</b> as the automation type with JSON format, then click Choose folder above and pick that folder inside your iCloud Drive on this PC.</p>
    </details>
    <details class="howto"><summary>Set up with a free Apple Shortcut</summary>
      <ol>
        <li>In the <b>Shortcuts</b> app, create a shortcut. For each of Active Energy, Resting Energy, Steps, Exercise Minutes and Stand Hours, add <b>Find Health Samples</b> (type, start date is today), then <b>Calculate Statistics</b> → Sum.</li>
        <li>For weight, add <b>Find Health Samples</b> for Weight, sorted by start date, latest first, limit 1.</li>
        <li>Add a <b>Dictionary</b> with keys <code>date</code> (Current Date, formatted yyyy-MM-dd), <code>active</code>, <code>basal</code>, <code>steps</code>, <code>exercise</code>, <code>stand</code>, <code>weight</code>.</li>
        <li>Add <b>Get Contents of URL</b>: <code>${esc(url)}</code>, method POST, header <code>Authorization: Bearer ${esc(sy.key || 'YOUR-KEY')}</code>, request body JSON set to the Dictionary.</li>
        <li>In <b>Automation</b>, run it at a few times each day (for example 9 AM, 1 PM, 6 PM and 10 PM) with <b>Run Immediately</b> on.</li>
      </ol>
    </details>`}
    <details class="howto"><summary>Import a file instead</summary>
      <div class="row-gap wrap" style="margin-top:10px">
        <button class="btn" data-action="import" data-kind="apple">Apple Health export (.zip)</button>
        <button class="btn" data-action="import" data-kind="google">Google Fit (Takeout)</button>
        <button class="btn" data-action="import" data-kind="csv">CSV or JSON</button>
      </div>
      ${sources ? `<ul class="sources">${sources}</ul>` : ''}
      <p><b>Full Apple Health export:</b> Health app → your profile picture → Export All Health Data. Imported files re-sync automatically when they change.</p>
    </details>`;
}
// ---------- Send to Apple Health ----------
function isoLocal(ms) {
  const d = new Date(ms), off = -d.getTimezoneOffset(), sign = off >= 0 ? '+' : '-';
  return `${fmtDate(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:00${sign}${pad(Math.floor(Math.abs(off) / 60))}:${pad(Math.abs(off) % 60)}`;
}
const at = (date, h, m = 0) => { const d = parseDate(date); d.setHours(h, m, 0, 0); return d.getTime(); };
const sameDay = (ms, date) => ms && fmtDate(new Date(ms)) === date;
// Everything not yet sent, from the last 30 days.
function exportCandidates() {
  const sh = data.settings.share, log = (data.exportLog ||= {}), today = todayStr(), out = { workouts: [], cardio: [], food: [], weights: [] }, keys = [];
  const now = new Date(), [fh, fm] = (sh.foodAfter || '21:00').split(':').map(Number);
  const foodReadyToday = now.getHours() * 60 + now.getMinutes() >= fh * 60 + fm;
  let from = addDays(today, -29); if (from < data.settings.startDate) from = data.settings.startDate;
  for (let d = from; d <= today; d = addDays(d, 1)) {
    const rec = data.days[d];
    if (!rec) continue;
    const finished = rec.done || d < today;
    const p = progress(rec);
    // Lifting session
    let liftEnd = at(d, 12);
    if (p.sidesDone > 0) {
      const start = sameDay(rec.startedAt, d) ? rec.startedAt : at(d, 12);
      const real = sameDay(rec.finishedAt, d) ? (rec.finishedAt - start) / 60000 : null;
      const measured = real && real >= 10 && real <= 240 ? real : null;
      const energy = liftEnergy(rec, d, measured);
      const minutes = Math.round(Math.max(10, energy.minutes));
      liftEnd = start + minutes * 60000;
      if (sh.workouts && finished && !log['w:' + d]) {
        out.workouts.push({ start: isoLocal(start), minutes, kcal: sh.calories ? Math.round(energy.kcal) : 0, day: d });
        keys.push('w:' + d);
      }
    }
    // Cardio (Beat Saber), right after lifting
    for (const b of cardioBlocks()) for (const it of b.items) {
      const c = rec.cardio?.[it.id], k = `c:${d}:${it.id}`;
      if (!sh.cardio || !c?.done || !(+c.min > 0) || !finished || log[k]) continue;
      out.cardio.push({ name: it.name, start: isoLocal(liftEnd), minutes: +c.min, kcal: sh.calories ? Math.round(+c.min * kcalPerMin(it.met || 6, d)) : 0, day: d });
      keys.push(k);
    }
    // Food: complete days, plus today after the cutoff time
    if (sh.food && !log['f:' + d] && (d < today || foodReadyToday)) {
      const { t, count } = nutrition(dayEntries(rec));
      if (count) {
        out.food.push({ date: isoLocal(d < today ? at(d, 20) : Date.now()), kcal: Math.round(t.kcal), protein: Math.round(t.protein), carbs: Math.round(t.carbs), fat: Math.round(t.fat), fiber: Math.round(t.fiber), sugar: Math.round(t.sugar), sodium: Math.round(t.sodium), day: d });
        keys.push('f:' + d);
      }
    }
    // Weigh-ins you typed (skip ones that came from Apple Health in the first place)
    if (sh.weight && rec.weight && !log['wt:' + d] && data.health[d]?.weightLb !== rec.weight) {
      out.weights.push({ date: isoLocal(sameDay(rec.weightAt, d) ? rec.weightAt : at(d, 7)), lb: rec.weight, day: d });
      keys.push('wt:' + d);
    }
  }
  return { out, keys };
}
function buildExport(mark) {
  if (!data.settings.share?.enabled) return { error: 'Sending to Apple Health is turned off in Workout Tracker settings.' };
  const { out, keys } = exportCandidates();
  const count = keys.length;
  if (mark && count) {
    const now = Date.now();
    for (const k of keys) data.exportLog[k] = now;
    data.settings.lastExport = now;
    save();
    refreshHealthCard();
    toast(`Sent ${count} item${count === 1 ? '' : 's'} to Apple Health`);
  }
  return { ...out, count };
}
function pendingSummary() {
  const { out } = exportCandidates();
  const parts = [[out.workouts.length, 'workout'], [out.cardio.length, 'cardio session'], [out.food.length, 'day of food', 'days of food'], [out.weights.length, 'weigh-in']]
    .filter(([n]) => n).map(([n, one, many]) => `${n} ${n === 1 ? one : many || one + 's'}`);
  return parts.length ? parts.join(', ') : 'nothing new';
}
function shareSection(url, key) {
  const sh = data.settings.share, wifi = data.settings.sync?.enabled;
  const exportUrl = url.replace(/\/health$/, '/export') + `?key=${key || 'YOUR-KEY'}`;
  const last = data.settings.lastExport ? new Date(data.settings.lastExport).toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : null;
  const opt = (k, label) => `<label class="check-opt"><input type="checkbox" data-share="${k}" ${sh[k] ? 'checked' : ''}><span>${label}</span></label>`;
  return `<div class="share-box">
    <label class="toggle"><input type="checkbox" data-share="enabled" ${sh.enabled ? 'checked' : ''}><span><b>Send my workouts and food to Apple Health</b><small>An Apple Shortcut on your iPhone picks up anything new and saves it into Health. Each item is sent once.</small></span></label>
    ${sh.enabled ? `
      ${!wifi ? '<p class="sync-status bad">Turn on Sync over Wi-Fi above. Sending uses the same connection.</p>' : ''}
      <div class="check-opts">${opt('workouts', 'Lifting sessions (Strength Training)')}${opt('cardio', 'Beat Saber (Mixed Cardio)')}${opt('food', 'Daily food: calories, protein, carbs, fat, fiber, sugar, sodium')}${opt('weight', 'Weigh-ins you enter here')}${opt('calories', 'Include calories burned in workouts')}</div>
      <p class="hint">Waiting to send: <b>${esc(pendingSummary())}</b>.${last ? ` Last sent ${esc(last)}.` : ''} Today's food is sent after <input class="mini-time" type="time" data-share="foodAfter" value="${esc(sh.foodAfter)}">. If you wear an Apple Watch while training, turn off "Include calories burned" so they aren't counted twice.</p>
      <div class="row-gap wrap"><button class="btn btn-small btn-ghost" data-action="resend-week">Send the last 7 days again</button></div>
      <details class="howto"><summary>Set up the "Save to Apple Health" Shortcut</summary>
        <ol>
          <li>In <b>Shortcuts</b>, make a new shortcut named Save to Apple Health.</li>
          <li><b>Get Contents of URL</b>: <code>${esc(exportUrl)}</code> (method GET).</li>
          <li><b>Get Dictionary Value</b>: Value for <code>workouts</code> in Contents of URL. Then <b>Repeat with Each</b> item in it. Inside the repeat, add three <b>Get Dictionary Value</b> actions on Repeat Item for <code>start</code>, <code>minutes</code> and <code>kcal</code>, then <b>Log Workout</b>: type Traditional Strength Training, Start Date = start, Duration = minutes (min), Calories = kcal (kcal).</li>
          <li>Do the same for <code>cardio</code> with workout type Mixed Cardio.</li>
          <li>Repeat over <code>food</code>. Inside, get <code>date</code>, then add <b>Log Health Sample</b> once per item: Dietary Energy = <code>kcal</code>, Protein = <code>protein</code> (g), Carbohydrates = <code>carbs</code> (g), Total Fat = <code>fat</code> (g), Fiber = <code>fiber</code> (g), Dietary Sugar = <code>sugar</code> (g), Sodium = <code>sodium</code> (mg), each with Date = date.</li>
          <li>Repeat over <code>weights</code>: <b>Log Health Sample</b> Weight = <code>lb</code> (lb), Date = <code>date</code>.</li>
          <li>Under <b>Automation</b>, run it every night (for example 10 PM) with <b>Run Immediately</b> on. Your phone needs to be on the same Wi-Fi as this PC, with the app open or in the tray.</li>
        </ol>
        <p>Test without sending anything: open <code>${esc(exportUrl)}&peek</code> in Safari on your iPhone to see what's waiting.</p>
      </details>` : ''}
  </div>`;
}

function refreshHealthCard() {
  const card = $('#health-card');
  if (card && !card.contains(document.activeElement)) card.innerHTML = healthCard();
}
function applySync() {
  if (!window.api?.sync) return;
  const s = data.settings;
  window.api.sync.configure({ enabled: !!s.sync?.enabled, port: +s.sync?.port || 47821, key: s.sync?.key }).then(st => { ui.sync = st; refreshHealthCard(); });
}
// Data pushed from the iPhone (Wi-Fi or folder).
function onHealthPush(p) {
  let n = 0;
  for (const [d, v] of Object.entries(p.days || {})) { data.health[d] = { ...(data.health[d] || {}), ...v, source: p.source || 'Apple Health', syncedAt: p.at || Date.now() }; n++; }
  if (!n) return;
  data.settings.lastHealthSync = p.at || Date.now();
  save();
  const typing = document.activeElement && /INPUT|TEXTAREA|SELECT/.test(document.activeElement.tagName);
  if (!typing && ui.view !== 'settings') render(); else refreshHealthCard();
  toast(`Apple Health synced (${n} day${n === 1 ? '' : 's'})`);
}

// ======================================================================
// Fitness data import
// ======================================================================
function mergeHealth(res) {
  let n = 0;
  for (const [d, v] of Object.entries(res.days || {})) { data.health[d] = { ...(data.health[d] || {}), ...v, source: res.source }; n++; }
  const srcs = data.settings.healthSources;
  const i = srcs.findIndex(s => s.path === res.path);
  const entry = { kind: res.kind, path: res.path, mtime: res.mtime, summary: res.summary, at: Date.now() };
  if (i >= 0) srcs[i] = entry; else srcs.push(entry);
  return n;
}
async function doImport(kind, btn) {
  if (!window.api) return toast('Importing works in the desktop app');
  const label = btn.textContent;
  btn.disabled = true; btn.textContent = 'Importing…';
  try {
    const res = await window.api.pickHealth(kind);
    if (res) { const n = mergeHealth(res); save(); render(); toast(`Imported ${n} days from ${res.source}`); }
  } catch (err) {
    toast(String(err.message || err).replace(/^Error invoking remote method '[^']+': (Error: )?/, ''));
  } finally { btn.disabled = false; btn.textContent = label; }
}
async function refreshHealth() {
  if (!window.api || !data.settings.healthSources.length) return;
  try {
    const results = await window.api.refreshHealth(data.settings.healthSources);
    let n = 0;
    for (const r of results) if (!r.error) n += mergeHealth(r);
    if (n) { save(); render(); toast(`Synced fitness data (${n} days)`); }
  } catch {}
}

// ======================================================================
// Clock: day rollover, reminders
// ======================================================================
let lastToday = todayStr();
function tick() {
  const t = todayStr();
  if (t !== lastToday) {
    if (ui.date === lastToday) ui.date = t;
    lastToday = t; ui.dismissedMisses = false; render(); checkMisses();
  }
  const s = data.settings;
  if (s.reminder.on && s.lastNotified !== t) {
    const now = new Date(), [hh, mm] = s.reminder.time.split(':').map(Number);
    if (now.getHours() * 60 + now.getMinutes() >= hh * 60 + mm) {
      const sc = sched(t);
      if (sc.status === 'today' && progress(data.days[t]).done === 0) {
        window.api?.notify('Time to train', `Day ${sc.day} is waiting. Block 1: ${liftBlocks()[0]?.name || ''}.`);
      }
      s.lastNotified = t; save();
    }
  }
}

function applyTheme() {
  document.documentElement.dataset.theme = data.settings.theme;
  window.api?.setTheme(data.settings.theme);
}

function migrate(d) {
  const base = defaultData();
  d.settings = { ...base.settings, ...d.settings, profile: { ...base.settings.profile, ...(d.settings?.profile || {}) }, reminder: { ...base.settings.reminder, ...(d.settings?.reminder || {}) } };
  d.program ||= base.program; d.meals ||= base.meals; d.days ||= {}; d.health ||= {};
  d.settings.sync = { ...base.settings.sync, ...(d.settings.sync || {}) };
  d.settings.goals = { ...base.settings.goals, ...(d.settings.goals || {}) };
  d.settings.share = { ...base.settings.share, ...(d.settings.share || {}) };
  d.exportLog ||= {};
  d.settings.breaks ||= [];
  // One-time: time off the user asked for (Nov 13-26, 2026). Rename or change it in Settings.
  d.settings.seeded ||= {};
  if (!d.settings.seeded.timeOff1) {
    if (!d.settings.breaks.some(b => b.start === '2026-11-13')) d.settings.breaks.push({ id: 'b-nov13', label: 'Time off', start: '2026-11-13', end: '2026-11-26' });
    d.settings.seeded.timeOff1 = true;
  }
  // Fill nutrients into meal plans saved before nutrition tracking existed.
  for (const m of d.meals) for (const it of m.items) if (!it.n) it.n = { ...(NUT_BY_NAME[it.name.toLowerCase()]?.n || {}) };
  return d;
}

// ======================================================================
// Icons
// ======================================================================
const ICON = {
  check: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12.5 4.5 4.5L19 7.5"/></svg>',
  left: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m14.5 6-6 6 6 6"/></svg>',
  right: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m9.5 6 6 6-6 6"/></svg>',
  down: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9.5 6 6 6-6"/></svg>',
  x: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 7l10 10M17 7 7 17"/></svg>',
  note: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 4h10l4 4v12H5z"/><path d="M9 12h6M9 16h4"/></svg>',
};

// ======================================================================
// Boot
// ======================================================================
(async function boot() {
  const loaded = await store.load();
  data = loaded ? migrate(loaded) : defaultData();
  if (!loaded) save();
  applyTheme();
  render();
  if (window.api) {
    window.api.loginItem().then(on => { const t = $('#login-toggle'); if (t) t.checked = on; }).catch(() => {});
    window.api.info().then(i => { window.__dataDir = i.dataDir; }).catch(() => {});
  }
  checkMisses();
  refreshHealth();
  setInterval(tick, 30000);
  tick();
  setInterval(() => writeWorkbook(false), 60 * 1000);
  if (window.api?.backup) {
    window.api.backup.onState(st => { ui.backup = st; refreshBackupCard(); });
    window.api.backup.suggest().then(sg => { ui.backupSuggest = sg; if (ui.view === 'today' || ui.view === 'settings') render(); }).catch(() => {});
    if (data.settings.backupDir) window.api.backup.configure(data.settings.backupDir).then(st => { ui.backup = st; refreshBackupCard(); writeWorkbook(true); });
  }
  if (window.api?.sync) {
    window.api.sync.onPush(onHealthPush);
    window.api.sync.onAsk(async (q) => { if (q.kind === 'export') return buildExport(!!q.arg?.mark); return { error: 'Unknown request' }; });
    window.api.sync.onState(st => { ui.sync = st; refreshHealthCard(); });
    applySync();
    if (data.settings.watchDir) window.api.sync.watch(data.settings.watchDir);
    if (data.settings.background) window.api.background(true);
    window.api.sync.ready().then(queued => queued.forEach(onHealthPush)).catch(() => {});
  }
  if (window.api?.update) {
    window.api.update.onStatus(onUpdateStatus);
    window.api.update.healthy().catch(() => {});
    try {
      const [st, info] = await Promise.all([window.api.update.get(), window.api.info()]);
      ui.version = info.version;
      onUpdateStatus(st);
      if (data.settings.lastVersion && data.settings.lastVersion !== info.version && cmpVer(info.version, data.settings.lastVersion) > 0) {
        toast(`Updated to version ${info.version}${st.notes ? `. ${st.notes}` : ''}`);
      }
      if (data.settings.lastVersion !== info.version) { data.settings.lastVersion = info.version; save(); }
    } catch {}
  }
})();
function cmpVer(a, b) {
  const pa = String(a).split('.').map(Number), pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) { const d = (pa[i] || 0) - (pb[i] || 0); if (d) return Math.sign(d); }
  return 0;
}
