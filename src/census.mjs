#!/usr/bin/env node
// Agentic Web Census: which sites publish the discovery documents that AI agents use.
// Read-only. Fetches robots.txt, a handful of public well-known paths and the home page.
// Usage: node src/census.mjs --list data/tranco/top-1m.csv --top 10000 --out results/run.jsonl [--concurrency 64]

import { createReadStream, createWriteStream, existsSync, readFileSync } from 'node:fs';
import { createInterface } from 'node:readline';

const UA = 'AgenticWebCensus/0.1 (+https://github.com/frostyhand/agentic-web-census; research; read-only)';
const TIMEOUT_MS = 8000;
const MAX_BODY = 512 * 1024;

const args = Object.fromEntries(
  process.argv.slice(2).reduce((acc, v, i, a) => (v.startsWith('--') ? [...acc, [v.slice(2), a[i + 1]]] : acc), []),
);
const LIST = args.list;
const TOP = Number(args.top ?? 1000);
const OUT = args.out ?? 'results/run.jsonl';
const CONCURRENCY = Number(args.concurrency ?? 64);
const ONLY = args.domains ? args.domains.split(',') : null;

// Each probe: a path, how to validate a 200 response, and what to record.
const JSON_PROBES = {
  ucp: '/.well-known/ucp',
  acp: '/.well-known/acp.json',
  a2a: '/.well-known/agent-card.json',
  a2a_legacy: '/.well-known/agent.json',
  mcp_server_card: '/.well-known/mcp/server-card.json',
  webbotauth_directory: '/.well-known/http-message-signatures-directory',
  api_catalog: '/.well-known/api-catalog',
};
// A JSON document counts only if it carries keys its specification requires (filters catch-all JSON replies).
const has = (k, list) => list.some((x) => k.has(x));
const REQUIRED = {
  ucp: (k) => k.has('ucp'),
  acp: (k) => has(k, ['protocol', 'api_base_url', 'capabilities']),
  a2a: (k) => k.has('name') && has(k, ['capabilities', 'skills', 'url']),
  a2a_legacy: (k) => k.has('name') && has(k, ['capabilities', 'skills', 'url']),
  mcp_server_card: (k) => has(k, ['name', 'serverInfo']) && has(k, ['$schema', 'remotes', 'endpoint', 'capabilities', 'transport']),
  webbotauth_directory: (k) => k.has('keys'),
  api_catalog: (k) => k.has('linkset'),
};
const TEXT_PROBES = {
  llms_txt: '/llms.txt',
  auth_md: '/auth.md',
};

// AI agent and crawler user agents whose robots.txt rules we record.
const AI_AGENTS = [
  'gptbot', 'chatgpt-user', 'oai-searchbot', 'claudebot', 'claude-user', 'claude-searchbot', 'anthropic-ai',
  'perplexitybot', 'perplexity-user', 'google-extended', 'googleother', 'applebot-extended', 'meta-externalagent',
  'bytespider', 'ccbot', 'amazonbot', 'mistralai-user', 'duckassistbot',
];

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { 'user-agent': UA, accept: '*/*' },
    redirect: 'follow',
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const reader = res.body?.getReader();
  let size = 0;
  const chunks = [];
  if (reader) {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > MAX_BODY) { await reader.cancel(); break; }
      chunks.push(value);
    }
  }
  const body = Buffer.concat(chunks).toString('utf8');
  return { status: res.status, url: res.url, type: (res.headers.get('content-type') || '').toLowerCase(), body };
}

function sameSite(finalUrl, domain) {
  try {
    const h = new URL(finalUrl).hostname.toLowerCase();
    return h === domain || h.endsWith('.' + domain);
  } catch { return false; }
}

const looksHtml = (r) => r.type.includes('text/html') || /^\s*<(!doctype|html|head|body)/i.test(r.body);

function validJson(r, domain) {
  if (r.status !== 200 || !sameSite(r.url, domain) || looksHtml(r)) return null;
  try {
    const j = JSON.parse(r.body);
    return j && typeof j === 'object' ? j : null;
  } catch { return null; }
}

function validText(r, domain) {
  if (r.status !== 200 || !sameSite(r.url, domain) || looksHtml(r)) return false;
  return r.body.trim().length > 20;
}

// Minimal robots.txt parser: groups of user-agent lines followed by rules.
function parseRobots(text) {
  const groups = [];
  let cur = null;
  let lastWasAgent = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*/, '').trim();
    const m = line.match(/^([a-z-]+)\s*:\s*(.*)$/i);
    if (!m) continue;
    const key = m[1].toLowerCase();
    const val = m[2].trim();
    if (key === 'user-agent') {
      if (!cur || !lastWasAgent) { cur = { agents: [], disallow: [], allow: [] }; groups.push(cur); }
      cur.agents.push(val.toLowerCase());
      lastWasAgent = true;
    } else {
      lastWasAgent = false;
      if (!cur) continue;
      if (key === 'disallow') cur.disallow.push(val);
      if (key === 'allow') cur.allow.push(val);
    }
  }
  return groups;
}

function rootBlocked(groups, agent) {
  const exact = groups.filter((g) => g.agents.includes(agent));
  const use = exact.length ? exact : groups.filter((g) => g.agents.includes('*'));
  return use.some((g) => g.disallow.includes('/') && !g.allow.includes('/'));
}

const COMMERCE_SIGNS = [
  ['shopify', /cdn\.shopify\.com|shopify\.theme|myshopify\.com/i],
  ['woocommerce', /woocommerce/i],
  ['bigcommerce', /bigcommerce\.com|cdn\d*\.bigcommerce/i],
  ['magento', /mage\/cookies|magento/i],
  ['salesforce_commerce', /demandware\.(static|store)/i],
  ['storeware', /mystoreware\.com|storeware\.ai/i],
  ['schema_product', /"@type"\s*:\s*"(Product|Offer|AggregateOffer)"/i],
];

async function scanOrigin(domain) {
  const rec = { domain, ts: new Date().toISOString(), reachable: false };
  let base = null;
  for (const host of [domain, 'www.' + domain]) {
    try {
      const r = await fetchText(`https://${host}/robots.txt`);
      base = `https://${host}`;
      rec.host = host;
      rec.reachable = true;
      rec.robots_status = r.status;
      if (r.status === 200 && !looksHtml(r)) {
        const groups = parseRobots(r.body);
        rec.robots = {
          mentions: AI_AGENTS.filter((a) => groups.some((g) => g.agents.includes(a))),
          blocked: AI_AGENTS.filter((a) => rootBlocked(groups, a)),
          star_blocked: rootBlocked(groups, '*'),
          census_blocked: rootBlocked(groups, 'agenticwebcensus'),
        };
      }
      break;
    } catch (e) {
      rec.error = String(e?.cause?.code || e?.name || e).slice(0, 60);
    }
  }
  if (!base) return rec;
  if (rec.robots?.census_blocked) { rec.skipped = 'robots'; return rec; }

  rec.found = {};
  rec.denied = 0; // probes answered 401/403/429/503: likely a bot wall, so absence is not measured
  const note = (r) => { if ([401, 403, 429, 503].includes(r.status)) rec.denied++; return r; };
  for (const [name, path] of Object.entries(JSON_PROBES)) {
    try {
      const j = validJson(note(await fetchText(base + path)), domain);
      if (j && !Array.isArray(j) && REQUIRED[name](new Set(Object.keys(j)))) rec.found[name] = { keys: Object.keys(j).slice(0, 12) };
    } catch {}
  }
  for (const [name, path] of Object.entries(TEXT_PROBES)) {
    try {
      const r = note(await fetchText(base + path));
      // llms.txt must open with a Markdown H1, as its proposal requires.
      const h1 = name !== 'llms_txt' || /^\s*#\s+\S/.test(r.body.replace(/^﻿/, ''));
      if (validText(r, domain) && h1) rec.found[name] = true;
    } catch {}
  }
  // Home page: WebMCP signals and commerce platform, only if robots does not block '/'.
  if (!rec.robots?.star_blocked) {
    try {
      const r = note(await fetchText(base + '/'));
      rec.home_status = r.status;
      if (r.status === 200 && sameSite(r.url, domain)) {
        if (/navigator\.modelContext|document\.modelContext|\btoolname\s*=/.test(r.body)) rec.found.webmcp = true;
        rec.commerce = COMMERCE_SIGNS.filter(([, re]) => re.test(r.body)).map(([n]) => n);
      }
    } catch {}
  }
  return rec;
}

async function readList() {
  if (ONLY) return ONLY;
  const out = [];
  const rl = createInterface({ input: createReadStream(LIST) });
  for await (const line of rl) {
    const d = line.split(',')[1]?.trim().toLowerCase();
    if (d) out.push(d);
    if (out.length >= TOP) break;
  }
  rl.close();
  return out;
}

const domains = await readList();
const done = new Set();
if (existsSync(OUT)) for (const l of readFileSync(OUT, 'utf8').split('\n')) { try { done.add(JSON.parse(l).domain); } catch {} }
const todo = domains.filter((d) => !done.has(d));
const out = createWriteStream(OUT, { flags: 'a' });
let i = 0, n = 0;
const t0 = Date.now();
async function worker() {
  while (i < todo.length) {
    const d = todo[i++];
    const rec = await scanOrigin(d).catch((e) => ({ domain: d, error: String(e).slice(0, 80) }));
    out.write(JSON.stringify(rec) + '\n');
    if (++n % 250 === 0) console.error(`${n}/${todo.length} in ${Math.round((Date.now() - t0) / 1000)}s`);
  }
}
await Promise.all(Array.from({ length: CONCURRENCY }, worker));
out.end();
console.error(`done: ${n} domains in ${Math.round((Date.now() - t0) / 1000)}s -> ${OUT}`);
