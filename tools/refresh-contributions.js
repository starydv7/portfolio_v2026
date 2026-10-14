#!/usr/bin/env node
/*
 * Refreshes the GitHub contribution snapshot used by the "Code activity"
 * section of index.html.
 *
 * Usage:
 *   node tools/refresh-contributions.js [from] [to] [path/to/saved.html]
 *
 * Fetches https://github.com/users/starydv7/contributions?from=…&to=…
 * (or reads a saved copy of that page), parses every <td data-date data-level>
 * plus its <tool-tip> ("N contributions on …") and prints the arrays that are
 * hard-coded in index.html (search for `GH_DATA`).
 */
const fs = require('fs');

const USER = 'starydv7';
const from = process.argv[2] || '2025-10-05';
const to = process.argv[3] || '2026-10-09';
const file = process.argv[4];

async function load() {
  if (file) return fs.readFileSync(file, 'utf8');
  const url = `https://github.com/users/${USER}/contributions?from=${from}&to=${to}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'text/html' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${url}`);
  return res.text();
}

function parse(html) {
  const cells = {};
  let m;
  const td = /<td([^>]*)>/g;
  while ((m = td.exec(html))) {
    const a = m[1];
    const d = /data-date="(\d{4}-\d{2}-\d{2})"/.exec(a);
    const l = /data-level="(\d)"/.exec(a);
    const i = /id="([^"]+)"/.exec(a);
    if (d && l && i) cells[i[1]] = { date: d[1], level: +l[1], count: 0 };
  }
  const tip = /<tool-tip[^>]*for="([^"]+)"[^>]*>([^<]*)<\/tool-tip>/g;
  while ((m = tip.exec(html))) {
    const c = cells[m[1]];
    if (!c) continue;
    const n = /^(\d+) contribution/.exec(m[2].trim());
    c.count = n ? +n[1] : 0;
  }
  return Object.values(cells).sort((a, b) => a.date.localeCompare(b.date));
}

load()
  .then((html) => {
    const days = parse(html);
    if (!days.length) throw new Error('No calendar cells found');
    const total = days.reduce((s, d) => s + d.count, 0);
    const active = days.filter((d) => d.count > 0).length;
    const months = {};
    for (const d of days) {
      const k = d.date.slice(0, 7);
      months[k] = (months[k] || 0) + d.count;
    }
    let best = 0, cur = 0;
    for (const d of days) {
      if (d.count > 0) { cur++; best = Math.max(best, cur); } else cur = 0;
    }
    const busiest = days.reduce((a, b) => (b.count > a.count ? b : a), days[0]);
    console.log(`range      : ${days[0].date} -> ${days[days.length - 1].date} (${days.length} days)`);
    console.log(`total      : ${total}   active days: ${active}   best streak: ${best}`);
    console.log(`busiest    : ${busiest.date} with ${busiest.count}`);
    console.log(`months     : ${JSON.stringify(months)}`);
    console.log('');
    console.log(`start  : '${days[0].date}'`);
    console.log(`counts : [${days.map((d) => d.count).join(',')}]`);
    console.log(`levels : '${days.map((d) => d.level).join('')}'`);
  })
  .catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
