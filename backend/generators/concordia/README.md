# Concordia scenario generator

Generates frozen scenario packs (a SQLite DB + a `.scenario.json` manifest) by
running a Google DeepMind Concordia multi-agent simulation against a local LLM,
then translating the agents' constrained `ACT` lines into schema rows through a
deterministic pipeline. The sim invents the story; everything after the readback
is deterministic and TDD-covered. Design spec:
`docs/superpowers/specs/2026-06-08-concordia-scenario-generator-design.md`.

## SOP: generate and promote a scenario pack

Proven end-to-end 2026-06-10 (first promoted pack: `card-fraud-concordia`).

**0. Prerequisites**
- LM Studio serving at `http://localhost:1234/v1` with **`google/gemma-3-4b`**
  loaded (Gemma 3 specifically - Gemma 4 reintroduces a thinking mode that
  blows the CPU token budget). The CLI preflights `/v1/models` and fails
  loudly if the model is not loaded.
- The generator venv at `backend/generators/concordia/.venv` (isolated from
  the backend venv; built against gdm-concordia 2.4.0, which no file in this
  repository pins).

**1. Generate** (multi-minute CPU run; writes only to the review dir)

```powershell
cd backend
generators\concordia\.venv\Scripts\python.exe -m generators.concordia.cli --out generators\concordia\_out
```

Re-running replaces the pack in `_out/` (the writer unlinks before writing).
`--max-steps`, `--clock-start`, `--model`, `--safe-model`, and `--seed` (default
sampling seed for every completion - reproducible packs) are available.

Agent prompts are DERIVED from the registries in `sim/prompts.py` (places, ips,
devices) - to grow the vocabulary, extend `places.py` and the prompt follows;
`tests/test_prompts.py` enforces prompt/parser/registry agreement.

**2. Review - the freeze gate (human judgment, never automated)**
- Read the printed summary (actions read back / transactions / logins /
  dropped) and the `dropped action at step N: <reason>` log lines.
- Query the pack directly: transaction mix (`is_fraud` split, locations,
  amounts), `arcs` (at least one `is_hero=1` row), `login_events`.
- The bar: the pack must tell its story - a legitimate baseline, the fraud
  signature, and at least one firing arc. A thin roll (fraud-only, no arcs)
  gets re-rolled, not promoted.

**3. Promote** (destinations are relative to the repo root)

```powershell
cp backend\generators\concordia\_out\data\<id>.db data\<id>.db
cp backend\generators\concordia\_out\<id>.scenario.json backend\scenarios\<id>.scenario.json
```

The manifest's `"db"` field is resolved against the repo root
(`main.py: init_registry(..., base_dir=PROJECT_ROOT)`), so the DB goes in the
root `data/` directory - NOT `backend/data/`.

**4. Verify the registry serves it** (from `backend/`, backend venv)

```python
import sys; sys.path.insert(0, ".")
from pathlib import Path
import scenario_registry as sr, db
ROOT = Path(".").resolve().parent
sr.init_registry(ROOT / "backend" / "scenarios", base_dir=ROOT, default_id="card-fraud")
m = sr.set_active("<id>")            # raises on a malformed manifest
conn = db.connect()                  # the hot-swapped active DB
print(conn.execute("SELECT COUNT(*) FROM transactions WHERE is_fraud=1").fetchone())
print(conn.execute("SELECT COUNT(*) FROM arcs WHERE is_hero=1").fetchone())
```

**5. Commit the frozen pack.** The DB + manifest ARE the artifact - an LLM
generation is not reproducible, so the freeze is what preserves it. Run the
backend gate (`backend/check.ps1`) before the commit; run the generator gate
(`backend/generators/concordia/check.ps1`) whenever generator code changed.

## Deterministically authored scenarios (`priya-ato`)

Not every scenario is model-generated. The Priya account-takeover pack is AUTHORED
deterministically - the same fidelity tier as Marcus's hand-authored `seed.py` rows
- because PROFILES.md declares the ATO signature a fixed, known thing by design, and
a 4B local model could not reliably emit the load-bearing ordering (baseline login →
takeover login → cash-out) across four rolls (`docs/fixes/FIX-2026-06-10-concordia-gm-curly-quote-json.md`
records the engine crash that ended roll 4; the adherence ceiling is the deeper
reason). The signature lives in `sim/scripted.py` (`PRIYA_ATO_READBACK`) and flows
through the SAME parse → translate → validate → write pipeline a live roll would.
Nothing is mocked: real `ACT` lines, the canonical Priya identity, canonical registry
coordinates, the real freeze gate.

Generate it without LM Studio (a pure function of repo source, byte-identical every
run - no model, instant, none of the step-0 prerequisites apply):

```powershell
cd backend
.venv\Scripts\python.exe -m generators.concordia.cli --scenario priya-ato --out generators\concordia\_out
```

**Provenance, stated plainly:** Priya's ATO signature is AUTHORED, not "discovered by
the agents." Any writeup says so. The honest
framing is the stronger one - right tool per job: Concordia for the emergent
card-fraud case, deterministic authoring for the fixed-signature ATO, exactly like
Marcus.

**Shape (2026-06-10 realism program, research-grounded):** a 30-day, 134-event pack -
93 card transactions on her PROFILES weekly rhythm (coffee 5x/week, Nevgate commutes,
groceries, restaurants, six subscriptions on fixed days), 10 Tamsinmere transfers
(~$40 median, including the canon $47 to Jamie K. on Day 25), 26 logins on her two
trusted devices, then the Day-28 kill chain in one session: a CLEAN takeover login
(challenge_passed with the phished OTP on a never-seen device from a Frankfurt
datacenter exit), email change (+7 min), beneficiary add (+9 min), a $4,200 wire (+13 min), and
a $3,800 wire 30 minutes later authored BLOCKED with decline_reason=velocity_rule.
The phish SMS is a manifest ANNOTATION (customer-reported), never a data row - no
banking backend observes a text message.

**Scope still not claimed:** the biometric typing-cadence layer from PROFILES
Customer B needs schema the Phase-1 generator does not have; named debt
(`BACKLOG.md`), not claimed here.

## Troubleshooting the drop log

| Drop reason | Meaning | Action |
|---|---|---|
| `no parseable action in: ...` | Pure prose, no k=v payload | Normal; re-roll if it dominates |
| `unknown action kind '...'` | Model declared a kind outside `purchase\|login` (e.g. `contact`) | Vocabulary gap - see BACKLOG.md |
| `'<place_name>'` (KeyError) | Model invented a place outside `places.py` | Re-roll; do NOT fuzzy-map - the registry refusing to fabricate coordinates is by design |

ACT-less lines with an unambiguous k=v payload parse fine; pure prose still
drops - that is the prose firewall, not a bug.

## Adding a new scenario kind

The platform is schema-agnostic; a new scenario means new content, not new
plumbing: personae + premise (`sim/agents.py`), the place registry
(`places.py`), action kinds end-to-end if the domain needs new verbs
(`action_format.py` → `translators.py` → `validator.py`), and the manifest
template (`manifest.py`). The deterministic pipeline and freeze-gate flow are
unchanged.
