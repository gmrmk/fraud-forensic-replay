# Fraud Forensic Replay

Built by Jonah Butterbaugh, a fraud investigator who works account takeover and payment fraud
cases. Fraud Forensic Replay shows how an investigator reads a case: you step through each event,
see which rules fired, and see the decision and the evidence behind it.

The three cases are card fraud, an account takeover, and a key takeover on an AI platform. In the
last one, one new device signs in to console seats at nine organizations, creates an API key in
each, and that night every key spends up to 58 times its organization's usual hourly rate.

Try it in 90 seconds: open the card fraud case
(https://gmrmk.github.io/fraud-forensic-replay/?scenario=card-fraud&theme=light) and follow section 4.

This is an independent project. All data is synthetic, and every person, merchant and organization
is fictional.

Built with [Claude Code](https://claude.com/claude-code).

## 1. What it is

A tool for fraud investigators. The investigator app puts cases on a 3D globe with a timeline: you
move the playhead (the marker of the current moment) through time and see what happened, which
rules fired and what was decided. The customer app is a mocked online-banking app that follows the
same playhead, so you see what the customer saw. All data is synthetic.

## 2. The link

https://gmrmk.github.io/fraud-forensic-replay/

## 3. Three of the eight stories

Eight stories ship in this copy, and the app's Scenario menu lists all eight. Three are described
here. Each story is a scenario: one case with its own data. Each opens in the investigator app at
its share link. The address bar keeps in step with the scenario, the moment, the camera, the
selection and the theme, so a copied address reopens the same view. In the Scenario menu the three
described here are listed as "Card · Houston→Lagos", "Account · Houston ATO" and "Platform · key
takeover".

**Card fraud** (`card-fraud`). A Houston cardholder, Marcus Chen, buys fuel at a pump that 30 of
the book's 301 cards used. All 30 later show fraud, and the investigator's notes name the pump as
the breach point. Seventeen days later a counterfeit copy of his card is swiped in Lekki, Lagos:
four stripe fallbacks in eight minutes (the first declined, then retried), after 69 chip reads in
Texas. The investigator's note records the cardholder saying the card was in his wallet. The notes
fail the Lekki swipes as fraud and pass the fuel purchase as genuine.
https://gmrmk.github.io/fraud-forensic-replay/?scenario=card-fraud&theme=light

**Account takeover** (`priya-ato`). Priya Patel's account is signed in to from a device it has
never seen, through a data center in Frankfurt, and the sign-in passes the one-time code. Within
half an hour the email on file changes, a new payee is added, and $4,200 goes to that payee by
wire. A second wire of $3,800 is blocked half an hour later. Its decline reason, a velocity rule,
is authored data: this tool does not compute it.
https://gmrmk.github.io/fraud-forensic-replay/?scenario=priya-ato&theme=light

**Token spend** (`platform-access`). On a fictional AI platform, one new device on an Amsterdam
hosting network signs in to nine console seats at nine organisations. Each session then creates an
API key, and that night each key spends from Singapore at up to about 58 times its organisation's
median hour. Two other cases are cleared or held: a new laptop on the company VPN, and a planned
batch run not yet confirmed.
https://gmrmk.github.io/fraud-forensic-replay/?scenario=platform-access&theme=light

The other five, one line each, under their names in the Scenario menu:

- **Platform · one key, many networks** (`key-many-networks`): one static API key and five seats
  change network again and again, seats of twelve organisations redeem a limit reset within four
  minutes of an offer opening, and a daily request count steps up more than sevenfold.
- **Platform · runs and a shared key** (`agent-runs-shared-key`): a swarm of workers runs five
  times in a week on shared API keys, and one key reaches two workspaces, one of which holds health
  data.
- **Platform · seats on two networks** (`seats-two-networks`): five seats send 1,122 requests in
  seven days, and 14 times a seat is seen on a second network.
- **Platform · daily volume and failed calls** (`volume-step`): one workspace's daily request count
  holds near 26,000 for seven days, then reads 83,810 and 129,660, and on three days a separate
  path of calls fails every time.
- **Platform · failed sign-ins, then a grant** (`seat-failed-signins`): failed sign-ins on one
  seat, then a sign-in, a credential grant, limit resets and a burst of requests, beside a steady
  seat of the same organisation.

## 4. The 90 second path

Use the card fraud story.

1. Open the card fraud link. The case opens on its top finding, selected. Look at the Inspector,
   the panel on the right: the decisions and the evidence for that event.
2. Tab to the timeline, or click it (a click also moves the playhead). Press `,` to step to the
   previous event and `.` to step to the next. The selection, the Inspector and the globe follow.
3. Press `m` to drop a mark at the playhead, step to another event and press `m` again. The
   timeline reads out the time between the two marks. `m` on a mark lifts it.
4. Open the "Scenario" menu at the top left and pick another story. The address bar changes with
   every step, so you can copy it at any point.
5. Press the "Flat map" button in the row at the top, just before "Reset view", to show the map
   flat. The same button, now "Globe", turns it back. The choice is kept for your next visit, and
   the address bar names it.

## 5. How to run it

You need Git, uv, Node and Windows PowerShell; uv installs Python 3.12. The commands below were run
on Windows 11 with uv 0.11, Node 24 and PowerShell 5.1. They use ports 8000, 5173 and 4173, and
5174 for the customer app. Each command is run from the repository root unless it names a folder.

The apps do not start without `data/replay.db`, and that file is not in the repository. Build it
first (command 3).

1. `uv venv --python 3.12 backend/.venv`
2. `uv pip install --python backend/.venv -r backend/requirements.txt -r backend/requirements-dev.txt`
3. In `backend/`: `.venv\Scripts\python.exe -m seed --with-population`, then
   `.venv\Scripts\python.exe -m ml.train --score-only`
4. `powershell -ExecutionPolicy Bypass -File backend/check.ps1` runs ruff, black, mypy and pytest.
   It takes about five minutes and ends with `CRAFT GATE: GREEN`.
5. In `frontend/investigator` and in `frontend/customer`: `npm ci`, `npm test`, `npm run build`;
   in `frontend/investigator` also `npm run lint`
6. `powershell -ExecutionPolicy Bypass -File scripts/dev.ps1` starts the backend and the
   investigator app and says when each is healthy. The investigator is then at
   `http://localhost:5173/`. The same script with `-Action stop` stops them; if it reports a held
   port, stop and start again. The customer app runs with `npm run dev` in `frontend/customer`,
   at `http://localhost:5174/`.
7. The static site, in four steps:
   - `node scripts/build-static.mjs` writes the site to `site/` (297 files, 6.3 MB).
   - In a second terminal, from the repository root, serve it and leave it running:
     `backend\.venv\Scripts\python.exe -m http.server 4173 --bind ::1`
   - Once, in `frontend/investigator`: `npx playwright install chromium`
   - `node frontend/investigator/scripts/static-crawl.mjs "http://[::1]:4173/site/"` opens the
     site in that browser and checks each story. It ends with
     `static-crawl: every check passed`.

If `data/replay.db` has not been built, pytest says so in its header and names the two commands
that build it. In this copy the pytest step of command 4 skips some tests, and each skipped test
prints its reason: it reads a file that is not part of the copy (the profiles document, or the
manifest or database of a data set the copy leaves out), it applies only to a scenario with a rule
that the scenario under test does not declare, or it asks something of a git checkout or of a
folder that this copy does not have. No test fails when the gate ends with `CRAFT GATE: GREEN`.

## 6. How the data is made

All data is seeded and deterministic. Command 3 builds `data/replay.db`, the card story's
database: on the machine it was checked on, the seed took 12 to 19 s and the scoring step 26 to
42 s. Rebuilt in a scratch folder, every table matched the original in row count and content,
43,617 model scores included, except one column: `customers.created_at` holds the time of the
build.

The scoring step finds its model by the database's file name, so the file must be called
`replay.db`.

The other seven stories are tracked files, not built by command 3: `data/priya-ato.db` for the
account takeover, the JSON files under `data/platform-access/` for the token spend story
(`data/platform-access.db` holds the tables and no rows), and `data/<story id>.db` with the folder
`data/<story id>/` for each of the five not described here. The authored decision notes for each
story are in `data/<story id>/decision.json`.

## 7. Honest limits

- All data is synthetic. Every person and merchant is fictional.
- The stories are authored. The app draws authored fraud rows as their own kind and opens on the
  finding with the highest severity, which for the travel rule is the authored risk score. It
  shows how an investigator reads a case. It does not show detection.
- The issuer risk score was authored together with the outcome. It is not evidence that a model
  finds fraud on its own.
- The model scores come from a logistic regression fitted to part of this same book, authored
  fraud rows included, and the app shows its score for every row, the rows it was fitted on among
  them. It learned the authored signature.
- The pump evidence is true by construction: every card that used the pump is a fraud card, and
  no clean card used it.
- Rule thresholds are authored constants, and the model rule's two thresholds are taken from the
  model's own scores on this book. None was validated on other data.
- Bank timestamps are all stored at UTC-5, the Lagos swipes included, and all amounts are in US
  dollars. The token spend story's timestamps are stored in UTC. The app shows every time in
  Houston time.
- `backend/places.py` can look up real businesses near a point, for map context. It needs a key
  that this copy does not have, none of the eight stories uses it, and the running app reads only
  its cache.
- Locations taken from network addresses are city level.
- Distances are great-circle distances.
- The token spend story mirrors no real provider's telemetry.
- Map tiles come from a free public host. On a first open the globe takes 3 to 6 s to fill.
- The tests were run on Windows 11 only.
- The model file under `backend/ml/artifacts/` is a pickle. Load it only from a copy you trust.
- Comments in the code, and one message of `scripts/dev.ps1`, cite internal documents (fix
  logs, notes, plans, specs and a model card, most by a path under `docs/`), capture scripts
  and work numbers (such as `ERR-050`, `TML-04`, `GLB-09` or `U4`). Those documents and
  scripts are not part of this copy. A comment that starts with `ponytail:` marks a
  deliberate shortcut and says where it stops holding.

## 8. How it is checked

- `backend/check.ps1` runs ruff, black, mypy and pytest on the backend.
- `npm test` runs the vitest suite in each app. `npm run lint` lints the investigator app.
- `static-crawl.mjs` opens the built static site in a browser and checks each story, including the
  map credit and the synthetic-data label.

## 9. Credits

See [CREDITS.md](CREDITS.md).

## 10. Rights

See [NOTICE.md](NOTICE.md).
