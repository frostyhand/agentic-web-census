# Agentic Web Census

How many websites actually publish the documents AI agents use to find, trust and buy from them?

The census visits the most popular sites on the web and records which agent protocol discovery files each one serves. It runs on a fixed, published list of domains, so every edition can be compared with the last.

## What it checks

For each domain (trying `https://domain` and then `https://www.domain`):

| Signal | Path |
|---|---|
| UCP business profile | `/.well-known/ucp` |
| ACP discovery document | `/.well-known/acp.json` |
| A2A agent card | `/.well-known/agent-card.json`, and the older `/.well-known/agent.json` |
| MCP server card | `/.well-known/mcp/server-card.json` |
| Web Bot Auth key directory | `/.well-known/http-message-signatures-directory` |
| API catalog (RFC 9727) | `/.well-known/api-catalog` |
| llms.txt | `/llms.txt` |
| auth.md | `/auth.md` |
| WebMCP | `document.modelContext`, `navigator.modelContext` or a `toolname` attribute on the home page |
| AI agent rules | `robots.txt` groups for 18 AI agents and crawlers: whether each is named, and whether the whole site is disallowed |
| Commerce | Platform markers (Shopify, WooCommerce, BigCommerce, Magento, Salesforce Commerce, Storeware) or schema.org product markup on the home page |

A file counts only when it answers 200 on the same site (after redirects), is not an HTML page, and parses: JSON documents must be JSON objects, and text files must have real content. That removes "soft 404" pages that return 200 for every path.

Some of these paths are fixed by a published specification and some are proposals in active use. The table reports each one separately, so readers can weigh them as they see fit.

## How it behaves

- **Read-only.** It sends about ten GET requests per site and nothing else.
- **It says what it is.** The user agent is `AgenticWebCensus/0.1 (+https://github.com/frostyhand/agentic-web-census; research; read-only)`. The 21 Nov 2026 pilot ran before this repository existed, with `AgenticWebCensus/0.1 (research; read-only; checks public discovery files)`.
- **Opting out.** Add `User-agent: AgenticWebCensus` and `Disallow: /` to robots.txt, or open an issue here.
- **It respects robots.txt.** A site that disallows `/` for `agenticwebcensus` is skipped after robots.txt is read. The home page is fetched only where robots.txt does not disallow `/` for all agents.
- **It doesn't count what it can't see.** Sites that answer most probes with 401, 403, 429 or 503 (bot walls) are reported apart from the measured set.
- 8-second timeout per request, 512 KB cap per response.

## Run it

Requires Node.js 22 or later, and Python 3 for the summary.

```bash
node src/census.mjs --list data/tranco/top-1m.csv --top 10000 --out results/run.jsonl
```

```bash
python3 src/summarise.py results/run.jsonl
```

The domain list is the [Tranco](https://tranco-list.eu/) top 1M. Each run records the list ID: the pilot used `46YVX`, downloaded 21 Nov 2026.

## Monthly editions

From census 0.2 (21 Nov 2026), every response records its first HTTP status and the number of redirect hops, so documents served directly can be told apart from documents reached through a redirect. The UCP specification says business profiles MUST NOT redirect. The summary reports both.

Monthly editions run on a fixed panel, the top 10,000 domains of Tranco list 46YVX (`data/panel/tranco-46YVX-top10k.csv`), so each edition compares like with like:

```bash
bash scripts/snapshot.sh
```

## Limits

- It sees discovery files, not behaviour. A site can verify Web Bot Auth signatures, or accept agent orders through a platform, without publishing anything checked here.
- Popular-site lists over-represent large platforms and under-represent small shops. A shop-focused sample (platform storefronts) is the planned second list.
- Bot walls hide some sites. They are counted, not guessed.

## Results

- [Pilot, 21 Nov 2026: Tranco top 10,000](results/pilot-2026-11-21-REPORT.md)

## Licence

Code: MIT. Results in `results/`: CC BY 4.0. Please cite as: Suresh, T. (2026). *Agentic Web Census*. https://github.com/frostyhand/agentic-web-census
