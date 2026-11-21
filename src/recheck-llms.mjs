// Re-check llms.txt hits from a run with the stricter H1 rule; writes the run back with updated flags.
import { readFileSync, writeFileSync } from 'node:fs';

const UA = 'AgenticWebCensus/0.1 (research; read-only; checks public discovery files)';
const file = process.argv[2];
const rows = readFileSync(file, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
const hits = rows.filter((r) => r.found?.llms_txt);
let i = 0;
let kept = 0;

async function worker() {
  while (i < hits.length) {
    const r = hits[i++];
    let ok = false;
    try {
      const res = await fetch(`https://${r.host}/llms.txt`, { headers: { 'user-agent': UA }, signal: AbortSignal.timeout(8000) });
      const t = (await res.text()).replace(/^﻿/, '');
      ok = res.status === 200 && /^\s*#\s+\S/.test(t) && !/^\s*<(!doctype|html)/i.test(t);
    } catch {}
    if (ok) kept++;
    else delete r.found.llms_txt;
  }
}

await Promise.all(Array.from({ length: 48 }, worker));
writeFileSync(file, rows.map((r) => JSON.stringify(r)).join('\n') + '\n');
console.log(`llms.txt hits: ${hits.length} -> ${kept} after the H1 check`);
