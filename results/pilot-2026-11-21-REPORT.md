# Agentic Web Census: pilot, 21 November 2026

**Sample:** Tranco top 10,000 (list `46YVX`, downloaded 21 Nov 2026). **Reachable over HTTPS:** 7,781. **Measured** (not behind a bot wall): 6,478. **Bot wall on most probes:** 1,017 (counted, not guessed). **Commerce sites** (platform markers or schema.org product markup on the home page): 374.

Full tables: `pilot-2026-11-21-summary.md`. Raw per-site records: `pilot-2026-11-21-tranco-46YVX-top10k.jsonl`.

## Headline findings

1. **Agent protocol discovery is still rare.** 2.0% of measured top-10,000 sites (129 of 6,478) publish at least one agent protocol document beyond llms.txt. Among the top 1,000 it is 3.7% (22 of 592).
2. **Shops lead.** Among the 374 commerce sites:
   - 5.3% publish a UCP business profile;
   - 5.1% publish an MCP server card;
   - 6.1% publish an RFC 9727 API catalog;
   - 4.0% publish auth.md for agent self-registration.
   All of these are several times the rate for the web as a whole.
3. **UCP has real retail adoption.** 41 measured sites serve a valid UCP profile, including IKEA, Zara, HP, Lululemon, Chewy, Farfetch, Barnes & Noble, Argos, Mattel, Verizon, Anker and Groupon. Most declare UCP version `2026-04-08`.
4. **llms.txt is the most common signal by far.** 13.6% of measured sites serve one with a proper Markdown heading, rising to 45.7% of commerce sites.
5. **Few sites publish Web Bot Auth key directories** (10 sites). That's expected, because directories are published by agent operators, not by the sites that verify them. Verification itself can't be seen from outside, so this census can't measure it.
6. **ACP leaves almost no public trace** (1 site with `/.well-known/acp.json`). ACP merchants usually integrate through the agent platform rather than a discovery file, so a low count here doesn't mean low ACP use.
7. **Sites block AI training crawlers far more than agents acting for a user.** Among the 5,308 measured sites with a robots.txt:

   | Agent | Whole site disallowed |
   |---|---|
   | GPTBot | 14.5% |
   | ClaudeBot | 13.4% |
   | CCBot | 15.4% |
   | ChatGPT-User | 6.2% |
   | Claude-User | 4.5% |
   | OAI-SearchBot | 4.4% |

   Sites increasingly treat "train on my content" and "shop for my customer" differently.

## Method and quality checks

- About ten read-only GET requests per site. The user agent says what it is, and robots.txt is respected (see README).
- A document counts only if it answers 200 on the same site, is not HTML, parses, and carries keys its specification requires (for example `ucp` in a UCP profile, `keys` in a key directory, `linkset` in an API catalog). This rule removed false positives from sites that answer every path with the same JSON. Six UCP, five ACP, eight A2A, eight MCP, six key-directory and eight API-catalog hits were dropped.
- llms.txt hits were re-fetched and kept only if the file opens with a Markdown H1, as the proposal requires: 1,033 hits became 958, of which 879 are in the measured set.
- Spot checks by hand: UCP profiles at ikea.com, zara.com, hp.com and paypalobjects.com confirmed. 7 of 8 randomly sampled llms.txt hits were real files.

## Limits

- A list of popular sites under-represents small shops. A shop-focused sample is the next step.
- Discovery files show intent to be found, not traffic or orders.
- The 1,017 walled sites and 2,219 unreachable domains (many Tranco entries are infrastructure domains with no website) are excluded from percentages.
