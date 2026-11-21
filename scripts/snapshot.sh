#!/bin/bash
# Monthly census snapshot on the fixed panel (Tranco list 46YVX, top 10k), so editions compare like with like.
# Run by launchd on the 1st of each month; safe to rerun (the scanner resumes an unfinished output file).
set -euo pipefail
cd "$(dirname "$0")/.."
NODE=/opt/homebrew/opt/node/bin/node
PY=/opt/homebrew/Caskroom/miniconda/base/bin/python3
D=$(date -u +%Y-%m-%d)
M=$(date -u +%Y-%m)
OUT="results/snapshots/${M}-tranco-46YVX-top10k.jsonl"
mkdir -p results/snapshots
echo "[$D] start $OUT" >> results/snapshots/snapshot.log
"$NODE" src/census.mjs --list data/panel/tranco-46YVX-top10k.csv --top 10000 --out "$OUT" --concurrency 64 2>> results/snapshots/snapshot.log
"$PY" src/summarise.py "$OUT" data/panel/tranco-46YVX-top10k.csv > "results/snapshots/${M}-summary.md"
echo "[$(date -u +%Y-%m-%dT%H:%MZ)] done $OUT" >> results/snapshots/snapshot.log
