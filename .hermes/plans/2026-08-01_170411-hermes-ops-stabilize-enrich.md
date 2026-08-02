# Hermes Ops Stabilize & Subscription Continuity — Enriched Implementation Plan

> **For Hermes:** Use subagent-driven-development skill to implement this plan task-by-task.  
> **Mode:** Plan only — do not execute from this document until Bailey says go.  
> **Scope:** Hermes Agent host health + model/auth routing on M2. **Not** ACS production Brain. **Not** CCO product feature work (see `CCO_LONG_HORIZON_20.md` / CVP audit for that).

**Goal:** Leave Hermes in a durable, verified state: one strong local model, all paid subscriptions usable as failover, no silent error loops, no credit-walled primary, gateway healthy, and a short operator checklist Bailey can re-run after any reboot.

**Architecture:** Treat Hermes as three layers that must agree: (1) **credentials** (`hermes auth` / OAuth / env keys), (2) **routing config** (`model.*` + `fallback_providers` + auxiliary task providers), (3) **host hygiene** (Ollama disk, dead processes, cron, state.db, messaging integrations). Failover is **failure-triggered**, not task-routing — hard jobs need explicit `--provider/--model` or a deliberate primary change.

**Tech Stack:** Hermes CLI 0.19.1 · `~/.hermes/config.yaml` · `~/.hermes/auth.json` · Ollama · xAI OAuth · Anthropic OAuth · OpenAI Codex device OAuth · Kimi API · optional Nous Portal (credit-blocked)

---

## Current context (live snapshot 2026-08-01 ~17:04 CDT)

### Already done (treat as baseline — re-verify, don’t redo blindly)

| # | Item | Claimed state | Re-verify command |
|---|---|---|---|
| 1 | Kill abandoned Playwright + hung `node --test` | Gone | `pgrep -lf 'playwright|node --test' \|\| echo clean` |
| 2 | Pause dead 25‑min cron loop | Paused | `hermes cron list` → no active junk job |
| 3 | `state.db` optimize-storage | 1874→663 MB class win | `ls -lh ~/.hermes/state.db`; `sqlite3 ~/.hermes/state.db 'PRAGMA integrity_check;'` |
| 4 | Primary off broken Nous paid default | Primary `grok-build-0.1` / `xai-oauth` | `hermes config get model.default`; `hermes config get model.provider` |
| 5 | Disable bluebubbles (no creds) | Disabled | `hermes config get` / messaging section; logs stop spamming |
| 6 | Ollama trim to one chat + embed | `qwen3-coder:30b` + `nomic-embed-text` only | `ollama list` |
| 7 | Connect subscriptions | Claude OAuth, Codex OAuth, Kimi key, xAI OAuth | `hermes auth list` |
| 8 | Fallback chain wired | See live chain below | `hermes fallback list` |

### Live routing (authoritative right now)

```
Primary:   grok-build-0.1  (xai-oauth)

Fallback chain:
  1. grok-4.5        (xai-oauth)
  2. claude-sonnet-5 (anthropic)
  3. kimi-k3         (kimi-coding)
  4. gpt-5.5         (openai-codex)  [chatgpt backend]
  5. qwen3-coder:30b (custom)        [http://127.0.0.1:11434/v1]
```

### Live auth (authoritative right now)

| Provider | Status | Notes |
|---|---|---|
| xAI OAuth | ✓ logged in | Primary path |
| Anthropic | ✓ 2 creds (hermes_pkce + claude_code) | API key row may still show ✗ in status — OAuth is what matters |
| OpenAI Codex | ✓ logged in | Device code; refreshed earlier today |
| Kimi | ✓ `KIMI_API_KEY` | Was 401 earlier in session — must live-probe again |
| Nous Portal | ✓ logged in | **No usable paid credits** → managed web/image/TTS/STT/browser/Modal unavailable |
| OpenRouter | configured but **auth failed 401** | Re-auth or remove from any active path |
| Qwen OAuth | ✗ | Optional; not required if unused |
| MiniMax OAuth | ✗ | Optional |

### Live host

- Ollama models: **only** `qwen3-coder:30b` (18 GB) + `nomic-embed-text` (274 MB) ✓ matches “one great local”
- Doctor: SQLite WAL-reset advisory (3.50.4); no security advisories; state.db 4163 sessions present
- Nous tool gateway: credit-blocked (expected until billing)

### Assumptions

1. Bailey wants **Grok lead** (chosen) so Claude quota stays spare.
2. All paid subs should appear in **failover**, not sit idle.
3. Local = one chat model + keep embed model for knowledge search.
4. No secrets in plan files or chat; rotate anything pasted earlier.
5. Gateway restart is allowed when applying config; drain in-flight first.
6. CVP/ACS product work is **out of scope** for this plan’s execution tasks.

### Non-goals (YAGNI)

- Installing more Ollama chat models
- Making Nous primary while credits are zero
- Building a custom “smart router” that picks models per sentence (Hermes fallback is failure-only)
- Touching Bailey’s unrelated live Kimi ACS terminal sessions
- Silent security changes from deep-audit without Bailey decision

---

## Proposed approach

1. **Prove baseline** with a single verification script (read-only probes).  
2. **Close credential holes** that break chain members (Kimi live probe, OpenRouter 401, optional Codex refresh).  
3. **Normalize routing config** so there is one chain source of truth (`fallback_providers` YAML list — never `config set` JSON strings).  
4. **Auxiliary / MoA cleanup** so side-tasks don’t hammer a dead Nous or wrong provider.  
5. **Host hygiene lock-in** (bluebubbles stays off, cron stays paused unless named, Ollama stays trimmed).  
6. **Gateway health** after every config mutation.  
7. **Operator runbook** Bailey can re-run in 2 minutes.  
8. **Security findings park** — list for decision, don’t auto-apply.

---

## Step-by-step plan

### Task 1: Capture pre-flight snapshot (read-only)

**Objective:** Freeze “before” evidence so fixes are measurable.

**Files:**
- Create: `~/.hermes/ops/preflight-$(date +%Y%m%d-%H%M%S).txt` (or workspace `.hermes/plans/evidence/` if preferred)

**Steps:**
1. Run and save:
```bash
{
  echo "=== TIME ==="; date
  echo "=== MODEL ==="; hermes config get model.provider; hermes config get model.default
  echo "=== FALLBACK ==="; hermes fallback list
  echo "=== AUTH ==="; hermes auth list
  echo "=== STATUS HEAD ==="; hermes status 2>&1 | head -120
  echo "=== DOCTOR HEAD ==="; hermes doctor 2>&1 | head -80
  echo "=== OLLAMA ==="; ollama list
  echo "=== GATEWAY ==="; curl -sS -m 3 http://127.0.0.1:8642/health || echo health_fail
} | tee ~/.hermes/ops/preflight-$(date +%Y%m%d-%H%M%S).txt
```
2. Expected: primary grok-build-0.1; 5 fallbacks; ollama 2 models; auth rows as above.

**Commit:** N/A (ops evidence only). Do not commit secrets.

---

### Task 2: Live-probe each chain member (TDD for routing)

**Objective:** Every fallback entry must complete one tool-capable or text-capable call; remove or fix failures.

**Files:**
- Test log only under `~/.hermes/ops/probe-*.txt`
- No code changes yet

**Step 1: Write probe script**

Create `~/.hermes/ops/probe-models.sh`:
```bash
#!/usr/bin/env bash
set -euo pipefail
probe() {
  local label="$1"; shift
  echo "=== PROBE $label ==="
  if hermes chat -q "Reply with exactly: OK-$label" "$@" 2>&1 | tee /tmp/hermes-probe-$label.txt | tail -20
  then echo "RESULT $label: exit0"
  else echo "RESULT $label: FAIL exit$?"
  fi
}
# Primary
probe primary --provider xai-oauth --model grok-build-0.1
# Fallbacks in order
probe grok45 --provider xai-oauth --model grok-4.5
probe claude --provider anthropic --model claude-sonnet-5
probe kimi --provider kimi-coding --model kimi-k3
probe codex --provider openai-codex --model gpt-5.5
# Local last (needs ollama serve)
probe local --provider custom --model qwen3-coder:30b
```

**Step 2: Run probes**

```bash
chmod +x ~/.hermes/ops/probe-models.sh
# ensure ollama up for local probe
pgrep -x ollama >/dev/null || (open -a Ollama || ollama serve &)
sleep 2
~/.hermes/ops/probe-models.sh | tee ~/.hermes/ops/probe-$(date +%Y%m%d-%H%M%S).txt
```

**Step 3: Pass criteria**
- Primary OK
- At least Claude + one of (Kimi, Codex, Grok-4.5) OK
- Local OK if Ollama running; if Ollama down, document as soft-fail not chain-delete

**Step 4: On Kimi 401**
```bash
# Prefer: refresh key in ~/.hermes/.env as KIMI_API_KEY (never print value)
# Or: kimi login / hermes auth add kimi-coding (per current CLI)
hermes auth list | grep -i kimi
# Re-run only kimi probe
```

**Step 5: On Codex stale**
```bash
hermes auth add openai-codex --type oauth
# complete device code in browser
# re-probe codex
```

**Step 6: On Claude fail**
```bash
hermes auth add anthropic --type oauth
# paste code into the CORRECT terminal (do not hijack other TTYs)
# re-probe claude
```

---

### Task 3: Normalize fallback_providers (single source of truth)

**Objective:** Config matches the verified working set; no duplicate/conflicting `fallback_model` vs `fallback_providers` surprises.

**Files:**
- Modify: `~/.hermes/config.yaml` (via `hermes fallback` CLI only — agents must not hand-patch secrets/config if policy blocks; human/`hermes fallback` is the safe path)
- Verify: `hermes fallback list`

**Critical rule (from hermes-fallback-llm-management skill):**  
**Never** `hermes config set fallback_providers '[{...}]'` — it stores a **string** and the chain silently ignores it. Use:
- `hermes fallback add` / interactive clear+add, **or**
- careful YAML list edit by operator

**Target chain (Bailey-approved Grok lead):**
```yaml
model:
  provider: xai-oauth
  default: grok-build-0.1

fallback_providers:
  - provider: xai-oauth
    model: grok-4.5
  - provider: anthropic
    model: claude-sonnet-5
  - provider: kimi-coding
    model: kimi-k3
  - provider: openai-codex
    model: gpt-5.5
    base_url: https://chatgpt.com/backend-api/codex
  - provider: custom
    model: qwen3-coder:30b
    base_url: http://127.0.0.1:11434/v1
```

**Steps:**
1. `hermes fallback list` — confirm current 5 entries match target.
2. If drift: `hermes fallback clear` then add in order (interactive), **or** operator YAML edit.
3. Remove/ignore stale keys if doctor warns (`fallback_model` legacy if present and conflicting — resolve per doctor/docs; prefer `fallback_providers` only).
4. `hermes fallback list` must print exactly the 5 entries above.
5. Optional: run `scripts/check-hermes-fallback.sh` from skill dir if available:
```bash
bash ~/.hermes/skills/autonomous-ai-agents/hermes-fallback-llm-management/scripts/check-hermes-fallback.sh
```

**Commit:** If config is git-tracked in a dotfiles repo Bailey owns — only with explicit approval. Default: no git commit of `~/.hermes`.

---

### Task 4: Primary stability smoke (tool-calling)

**Objective:** Prove default path can tool-call, not just chat text.

**Steps:**
```bash
hermes chat -q "Use a terminal tool to run: echo HERMES_TOOL_OK && date -u. Then quote the output."
```
Expected: tool call succeeds; output contains `HERMES_TOOL_OK`.

If fails on Grok only: temporarily test Claude primary **without saving**:
```bash
hermes chat --provider anthropic --model claude-sonnet-5 -q "..."
```
Do not change Bailey’s Grok-lead choice unless Grok remains broken after re-auth.

---

### Task 5: Auxiliary provider audit (side-tasks)

**Objective:** Vision/compression/title/etc. should not depend on Nous credits or broken OpenRouter.

**Live observation:** Many `auxiliary.*` providers point at `openai-codex`. That is OK **if** Codex OAuth works; bad if Codex quota exhausted.

**Steps:**
1. Dump auxiliary map:
```bash
python3 - <<'PY'
import yaml
from pathlib import Path
c=yaml.safe_load(Path.home().joinpath('.hermes/config.yaml').read_text())
aux=c.get('auxiliary') or {}
for k,v in sorted(aux.items()):
    if isinstance(v,dict):
        print(f"{k}: provider={v.get('provider')} model={v.get('model')}")
PY
```
2. For each critical aux (vision, compression, session_search): one tiny real call or doctor path.
3. If Codex fails: set aux to `xai-oauth` / working Grok or `anthropic` via:
```bash
hermes config set auxiliary.vision.provider xai-oauth
# only if docs support; else use hermes setup tools
```
4. MoA presets currently mix Nous + others — **disable Nous-enabled MoA refs** while credits are 0:
   - Inspect `moa.reference_models` / presets
   - Set Nous entries `enabled: false` (operator YAML or supported CLI)
5. Verify no startup path calls Nous inference for defaults.

---

### Task 6: OpenRouter 401 cleanup

**Objective:** Stop auth-failed noise and accidental routing into a dead key.

**Steps:**
1. Confirm: `hermes auth list | grep -i openrouter`
2. Either re-auth OpenRouter **or** ensure nothing in primary/fallback/aux uses it.
3. If unused: leave key but document “stale 401 — ignore”; do not put in fallback chain.
4. Never print API key values.

---

### Task 7: Nous credits decision gate (Bailey-only)

**Objective:** Make the credit wall explicit so agents stop thrashing.

**Bailey chooses one:**
- **A.** Add Nous credits → `hermes model` refresh → optional managed tools back  
- **B.** Stay credit-zero → keep Nous logged in for future, never primary, disable Nous MoA refs  
- **C.** Log out Nous to reduce confusion

**Document choice** in `~/.hermes/ops/OWNER_DECISIONS.md` one line.

**Do not** set Nous as primary under B/C.

---

### Task 8: Messaging / bluebubbles lock

**Objective:** No credential-less integration error loops.

**Steps:**
1. Confirm bluebubbles disabled in config.
2. `tail -n 100 ~/.hermes/logs/* 2>/dev/null | grep -i bluebubbles || echo none`
3. Expected: no new errors after gateway restart.
4. Re-enable only when credentials exist:
```bash
# after creds present
hermes config set <bluebubbles.enable path per docs> true
```

---

### Task 9: Cron hygiene

**Objective:** No zombie “ok” jobs every 25 minutes.

**Steps:**
```bash
hermes cron list
```
1. Keep paused the 101-day dead loop (already paused).
2. For each remaining job: name, schedule, last success artifact path.
3. Delete only with Bailey approval if job is noise.
4. **Never** schedule CCO product loop crons (Bailey ruled file-recursion only for CCO).

---

### Task 10: Ollama permanence (“one great local”)

**Objective:** Prevent model creep; keep embed.

**Pass criteria:**
```bash
ollama list
# exactly:
# qwen3-coder:30b
# nomic-embed-text
```

**If extras reappear:**
```bash
ollama rm <name>   # only extras; never rm nomic-embed-text without replacing embed path
```

**Optional:** LaunchAgent/login note “don’t pull random models”.

**Disk check:**
```bash
du -sh ~/.ollama
# expect ~18–20GB class after trim (was ~49GB)
```

---

### Task 11: Process / RAM leak guard

**Objective:** No multi-day Playwright/node-test zombies.

**Steps:**
```bash
pgrep -lf 'playwright|chromium_headless|node --test' || echo clean
```
If found and age > 1h with no owner session:
```bash
# identify PID, confirm not active user browser
kill PID || kill -9 PID
```
Add to weekly doctor note — not a permanent killall cron without approval.

---

### Task 12: state.db health post-VACUUM

**Objective:** Confirm optimize didn’t corrupt search.

**Steps:**
```bash
sqlite3 ~/.hermes/state.db 'PRAGMA integrity_check;'
# expected: ok
sqlite3 ~/.hermes/state.db "SELECT COUNT(*) FROM sessions;"  # or equivalent schema
# FTS smoke:
# use hermes session search UI or documented FTS query
du -h ~/.hermes/state.db
```
If integrity not ok: **stop** and restore from Time Machine / known backup — do not continue “cleanup.”

**Doctor note:** SQLite 3.50.4 WAL-reset bug advisory — plan upgrade path:
```bash
hermes update   # when Bailey allows
# or document "known advisory, monitor"
```

---

### Task 13: Gateway restart + health

**Objective:** Apply config safely.

**Steps:**
```bash
# graceful if supported
hermes gateway restart 2>/dev/null || launchctl kickstart -k gui/$(id -u)/ai.hermes.gateway
sleep 3
curl -sS -m 5 http://127.0.0.1:8642/health
hermes status 2>&1 | head -40
hermes fallback list
```
Expected: health OK; primary+chain unchanged; no bluebubbles spam in fresh logs.

---

### Task 14: Deep-audit findings triage (no silent apply)

**Objective:** Convert “26-agent audit” claims into a decision table.

**Create:** `~/.hermes/ops/AUDIT_TRIAGE_2026-08-01.md`

For each finding require:
- claim
- independent live re-check command
- severity
- action: apply / defer / reject
- Bailey needed? Y/N

**Known buckets from narrative (must re-verify):**
1. SQLite WAL corruption risk → doctor advisory (Task 12)
2. Skills collisions (~227/startup) → `hermes doctor` / skills list dedupe plan
3. openai-codex/copilot auth spam → logs grep; fix auth or disable noisy integration
4. ~5.6 GB redundant backups → `du` proof before delete; Bailey approves deletes
5. Any “real security hole” flagged for decision → **do not auto-fix**

**Security hole protocol:**  
Write finding + exploit preconditions + fix options. Wait for Bailey. Especially anything that widens network exposure or deletes data.

---

### Task 15: Skills collision pass (if doctor/audit confirms)

**Objective:** One skill name → one path; faster startup.

**Steps:**
1. List duplicate skill names across `~/.hermes/skills`, `~/.claude/skills`, project skills.
2. Prefer Hermes profile skills; don’t delete Claude-only skills still referenced by Claude Code without check.
3. Deduplicate by symlink or remove true orphans.
4. `hermes doctor` cleaner after.

**Bite-size:** process 10 collisions per sub-task; stop at 30 min or Bailey interrupt.

---

### Task 16: Operator runbook (durable)

**Objective:** Bailey (or any agent) can recover routing in <5 minutes.

**Create:** `~/.hermes/ops/RUNBOOK_MODEL_ROUTING.md`

```markdown
# Hermes routing runbook

## Who is primary?
hermes config get model.provider
hermes config get model.default
hermes fallback list

## Auth
hermes auth list

## Probe primary
hermes chat -q "Reply OK"

## Re-auth
hermes auth add anthropic --type oauth
hermes auth add openai-codex --type oauth
# Kimi: fix KIMI_API_KEY in ~/.hermes/.env or kimi login

## Never
- hermes config set fallback_providers '[...]'   # becomes dead string
- paste secrets into chat
- set Nous primary while credits=0

## Local models
ollama list   # only qwen3-coder:30b + nomic-embed-text

## Gateway
curl -sS http://127.0.0.1:8642/health
```

---

### Task 17: Final acceptance battery

**Objective:** One green checklist closes the work.

| Check | Command | Pass |
|---|---|---|
| Primary | `hermes config get model.default` | `grok-build-0.1` |
| Provider | `hermes config get model.provider` | `xai-oauth` |
| Chain length | `hermes fallback list` | 5 entries, order correct |
| Auth Claude | `hermes auth list` | anthropic oauth present |
| Auth Codex | `hermes auth list` | openai-codex logged in |
| Auth Kimi | probe | OK not 401 |
| Auth xAI | primary probe | OK |
| Local models | `ollama list` | exactly 2 |
| Tool call | primary tool probe | OK |
| Health | `curl :8642/health` | OK |
| Bluebubbles | log grep | quiet |
| Cron junk | `hermes cron list` | dead loop still paused |
| state.db | integrity_check | ok |
| Nous | status | credits note honest |
| OpenRouter | not in chain | true |

All pass → mark plan complete in ops log.

---

### Task 18: Optional hard-task escalation note (not auto-router)

**Objective:** Document how to use Claude/Kimi/Codex **on purpose** without fighting Grok-lead.

```bash
# Deep reasoning / careful code review
hermes chat --provider anthropic --model claude-sonnet-5 -q "..."

# Fast build/comms if Kimi preferred later
hermes chat --provider kimi-coding --model kimi-k3 -q "..."

# Codex lane
hermes chat --provider openai-codex --model gpt-5.5 -q "..."
```

If Bailey later wants **Kimi primary** (skill’s alternate profile), swap only:
```bash
hermes config set model.provider kimi-coding
hermes config set model.default kimi-k3
# keep anthropic + xai in fallback via hermes fallback list verification
```
Do **not** do this unless Bailey changes the Grok-lead decision.

---

## Files likely to change

| Path | Why |
|---|---|
| `~/.hermes/config.yaml` | model, fallback_providers, auxiliary, messaging flags, moa enables |
| `~/.hermes/.env` | Kimi/OpenRouter keys only (never commit) |
| `~/.hermes/auth.json` | OAuth tokens via CLI only |
| `~/.hermes/ops/*` | preflight, probes, runbook, triage (create) |
| Ollama model store | already trimmed; only if drift |
| Gateway LaunchAgent | restart only |

**Do not touch:** ACS production repos, CCO product code, Bailey’s unrelated terminal sessions, CVP dirty tree (separate plan).

---

## Tests / validation

1. `hermes fallback list` matches target chain  
2. `~/.hermes/ops/probe-*.txt` shows OK for primary + ≥3 fallbacks  
3. Tool-calling primary smoke  
4. `hermes doctor` — no new criticals; known SQLite advisory acknowledged  
5. `curl http://127.0.0.1:8642/health`  
6. `ollama list` = 2 models  
7. Log quiet on bluebubbles  
8. state.db integrity ok  

---

## Risks, tradeoffs, open questions

| Risk | Mitigation |
|---|---|
| OAuth code pasted into wrong TTY (already happened once) | Map TTY→process before any keystrokes; never retitle foreign sessions |
| `config set` stringifies fallback list | Use `hermes fallback` only |
| Grok lead burns xAI quota | Bailey choice; Claude sits in fallback |
| Nous 404 loop returns if primary flipped back | Guardrail in runbook; credits check in status |
| Deleting “redundant backups” without proof | Task 14 requires `du` + Bailey OK |
| SQLite WAL bug | Update when allowed; don’t ignore integrity fail |
| Kimi env key vs managed login mismatch | Live probe decides; fix one path |
| Auxiliary all on Codex | Single point of failure — diversify if probes fail |
| Deep-audit “security hole” | Park for Bailey; no silent patch |
| Agent tools refuse writing config.yaml | Operator CLI path documented |

**Open questions for Bailey**
1. Confirm Grok-lead still desired after all probes (yes/no).  
2. Nous: add credits / stay logged-in idle / logout?  
3. Approve backup deletion if ≥5 GB confirmed redundant?  
4. Apply SQLite/`hermes update` now or later?  
5. Any security-hole fix from audit to apply this session?

---

## Relationship to other plans

| Doc | Role |
|---|---|
| This plan | Hermes host + model continuity |
| `CCO_LONG_HORIZON_20.md` | CCO/CVP product 20 phases |
| `docs/audits/CVP_DEEP_SURFACE_AUDIT_20260801.md` | Product surface/security audit |
| `CCO_GOAL.md` | Near-term CCO loop §0 |

Do not merge Hermes ops tasks into CCO product gates. Different machines of work.

---

## Execution handoff order (when Bailey says go)

1. Task 1 snapshot  
2. Task 2 probes → fix only failed auths (Tasks 2 substeps)  
3. Task 3 chain normalize if needed  
4. Tasks 4–6  
5. Task 7 Bailey decision  
6. Tasks 8–13  
7. Tasks 14–15 as time allows  
8. Tasks 16–17 acceptance  
9. Stop. Report pass/fail table.

**Estimated focused time:** 45–90 minutes if auths are healthy; +OAuth waits if not.

---

## Definition of done

Hermes on this Mac:
- leads with working Grok,
- fails over through Claude → Kimi → Codex → local Qwen without manual panic,
- keeps one local chat model + embed,
- doesn’t spam dead integrations,
- has a runbook and probe evidence on disk,
- and never again silently uses a credit-dead Nous primary.

---

*Plan saved. No execution performed in plan mode.*
