"""Summarise an Agentic Web Census run (JSONL) into a Markdown table. Usage: python3 src/summarise.py results/run.jsonl"""
import json
import sys
from collections import Counter

SIGNALS = [
    ("ucp", "UCP business profile", "/.well-known/ucp"),
    ("acp", "ACP discovery document", "/.well-known/acp.json"),
    ("a2a", "A2A agent card", "/.well-known/agent-card.json"),
    ("a2a_legacy", "A2A agent card (older path)", "/.well-known/agent.json"),
    ("mcp_server_card", "MCP server card", "/.well-known/mcp/server-card.json"),
    ("webbotauth_directory", "Web Bot Auth key directory", "/.well-known/http-message-signatures-directory"),
    ("api_catalog", "API catalog (RFC 9727)", "/.well-known/api-catalog"),
    ("llms_txt", "llms.txt", "/llms.txt"),
    ("auth_md", "auth.md (agent self-registration)", "/auth.md"),
    ("webmcp", "WebMCP tools on the home page", "home page script or markup"),
]
AGENTS = ["gptbot", "chatgpt-user", "oai-searchbot", "claudebot", "claude-user", "perplexitybot", "google-extended", "ccbot", "bytespider", "meta-externalagent"]

rows = [json.loads(l) for l in open(sys.argv[1]) if l.strip()]
total = len(rows)
reach = [r for r in rows if r.get("reachable")]
measured = [r for r in reach if r.get("found") is not None and r.get("denied", 0) < 4]
walled = [r for r in reach if r.get("found") is not None and r.get("denied", 0) >= 4]
commerce = [r for r in measured if r.get("commerce")]
shops = [r for r in commerce if set(r["commerce"]) - {"schema_product"}]


def pct(n, d):
    return f"{100 * n / d:.1f}%" if d else "n/a"


REQUIRED = {  # a JSON document counts only if it has keys its specification requires
    "ucp": lambda k: "ucp" in k,
    "acp": lambda k: bool(k & {"protocol", "api_base_url", "capabilities"}),
    "a2a": lambda k: "name" in k and bool(k & {"capabilities", "skills", "url"}),
    "a2a_legacy": lambda k: "name" in k and bool(k & {"capabilities", "skills", "url"}),
    "mcp_server_card": lambda k: bool(k & {"name", "serverInfo"}) and bool(k & {"$schema", "remotes", "endpoint", "capabilities", "transport"}),
    "webbotauth_directory": lambda k: "keys" in k,
    "api_catalog": lambda k: "linkset" in k,
}


def clean(found):
    out = {}
    for sig, v in (found or {}).items():
        if sig in REQUIRED and not REQUIRED[sig](set(v.get("keys", []))):
            continue
        out[sig] = v
    return out


for r in rows:
    if r.get("found") is not None:
        r["found"] = clean(r["found"])


def count(group, key):
    return sum(1 for r in group if key in (r.get("found") or {}))


out = []
out.append(f"Domains scanned: {total}. Reachable over HTTPS: {len(reach)}. Measured (not behind a bot wall): {len(measured)}. "
           f"Bot wall on most probes: {len(walled)}. Home page shows a commerce platform or product markup: {len(commerce)} "
           f"(of which a named platform: {len(shops)}).\n")
out.append("| Signal | Path | All measured sites | Commerce sites |")
out.append("|---|---|---|---|")
for key, label, path in SIGNALS:
    a, c = count(measured, key), count(commerce, key)
    out.append(f"| {label} | `{path}` | {a} ({pct(a, len(measured))}) | {c} ({pct(c, len(commerce))}) |")
any_agent = sum(1 for r in measured if set((r.get("found") or {})) - {"llms_txt"})
out.append(f"\nSites with at least one agent protocol document (anything beyond llms.txt): {any_agent} ({pct(any_agent, len(measured))}).")

# Census 0.2 and later record each document's first status and redirect hops (UCP profiles MUST NOT redirect).
hop_rows = [(k, v) for r in measured for k, v in (r.get("found") or {}).items() if isinstance(v, dict) and "hops" in v]
if hop_rows:
    out.append("\n**Served directly or through a redirect** (census 0.2 and later)\n")
    out.append("| Signal | Direct 200 | Through a redirect |")
    out.append("|---|---|---|")
    for key, label, _ in SIGNALS:
        d = sum(1 for k, v in hop_rows if k == key and v["hops"] == 0)
        rd = sum(1 for k, v in hop_rows if k == key and v["hops"] > 0)
        if d or rd:
            out.append(f"| {label} | {d} | {rd} |")

with_robots = [r for r in measured if r.get("robots")]
out.append(f"\n**robots.txt** ({len(with_robots)} measured sites serve one)\n")
out.append("| Agent | Named in robots.txt | Whole site disallowed |")
out.append("|---|---|---|")
for a in AGENTS:
    m = sum(1 for r in with_robots if a in r["robots"]["mentions"])
    b = sum(1 for r in with_robots if a in r["robots"]["blocked"])
    out.append(f"| {a} | {m} ({pct(m, len(with_robots))}) | {b} ({pct(b, len(with_robots))}) |")

plat = Counter(p for r in commerce for p in r["commerce"])
out.append("\n**Commerce signals on home pages:** " + ", ".join(f"{k} {v}" for k, v in plat.most_common()))

bands = [(1, 1000), (1001, 10000)]
rank = {}
with open(sys.argv[2] if len(sys.argv) > 2 else "data/tranco/top-1m.csv") as f:
    for line in f:
        n, d = line.strip().split(",", 1)
        rank[d] = int(n)
        if int(n) >= 1_000_000 or len(rank) >= max(10000, total):
            break
out.append("\n**By rank band** (share of measured sites with at least one agent protocol document)\n")
for lo, hi in bands:
    g = [r for r in measured if lo <= rank.get(r["domain"], 10**9) <= hi]
    k = sum(1 for r in g if set((r.get("found") or {})) - {"llms_txt"})
    out.append(f"- Ranks {lo} to {hi}: {k} of {len(g)} ({pct(k, len(g))})")

ucp = [r["domain"] for r in measured if "ucp" in (r.get("found") or {})]
out.append(f"\nUCP profiles found on: {', '.join(ucp[:40]) or 'none'}")
print("\n".join(out))
