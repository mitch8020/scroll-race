# Production-readiness bug log

All bugs were reproduced with synthetic local data. No production request or
real user record was used.

## PR-BUG-001 — Repository formatting gate was red

- Severity: release-blocking quality gate.
- Reproduction: run `npm run check` on the starting commit.
- Evidence: Prettier reported
  `.smoke/badge-check.mjs`, `.smoke/board-check.mjs`,
  `.smoke/events-check.mjs`, and `.smoke/style-check.mjs`.
- Cause: checked-in smoke utilities drifted from the repository formatter.
- Fix: format the smoke directory and include it in the final full check.
- Regression: `npm run check` passes.

## PR-BUG-002 — Browser smoke checks could print failures and exit zero

- Severity: high false-green risk.
- Reproduction: the legacy scripts accumulated `pageerror`/`console.error`
  strings and ended with `console.log`, so CI or a human shell could not use
  the exit code as a gate.
- Cause: the scripts were created as visual probes rather than acceptance
  tests.
- Fix: add one assertion-driven campaign that continues through finite
  scenarios, records each failure, writes JSON/screenshots, and exits nonzero
  when any scenario fails.
- Regression: deliberately failing an assertion produces a failure screenshot,
  a failed report row, and exit 1; the final report is 12 passed / 0 failed.

## PR-BUG-003 — Blocking intro lacked modal accessibility semantics

- Severity: high accessibility.
- Reproduction:
  1. Open `/`.
  2. Inspect the blocking `.introScreen`.
  3. It had `role=dialog` but no `aria-modal`; the inactive 100-foot course
     remained exposed behind it.
- Cause: visual/body-scroll locking was not mirrored in the accessibility tree.
- Fix: add `aria-modal=true` and hide the course from assistive technology in
  `intro` and `countdown`, restoring it in `racing` and `finished`.
- Regression: `PR-UI-01` and `PR-RACE-01`.

## PR-BUG-004 — Hostile world-board rows crossed the client trust boundary

- Severity: high data integrity and display correctness.
- Reproduction:
  1. Fulfill `GET /api/leaderboard?event=100` with a negative time, a valid
     250-foot row, an unsafe name/device/country, an unsorted valid row, and
     `total: -50`.
  2. Open the world board.
  3. The starting build rendered the negative and wrong-event rows, preserved
     the markup-like name locally, trusted row order, and accepted the negative
     total.
- Evidence:
  `.smoke/readiness-evidence/PR-BOARD-01-failure.png` and the first campaign
  output showing actual names `Negative`, `Wrong Event`, and
  `<script>Slow</scri`.
- Shared cause: response validation checked only primitive field types while
  comments and UI behavior assumed server invariants.
- Fix: centralize response parsing; enforce sanctioned matching event and
  eligible bounded time, de-duplicate, sort, sanitize display fields, validate
  country, truncate device, and clamp total to a nonnegative integer at least
  as large as accepted rows.
- Regression: `src/globalBoard.test.ts` plus `PR-BOARD-01`.

## PR-BUG-005 — Native share failure silently did nothing

- Severity: medium workflow failure.
- Reproduction:
  1. Finish an eligible race in a browser that exposes `navigator.share`.
  2. Make the platform share promise reject with a non-cancellation error.
  3. Press **Share this run**.
  4. The starting build swallowed the rejection and displayed no result.
- Evidence: `.smoke/readiness-evidence/PR-SHARE-01-failure.png` and the first
  campaign assertion “A failed native share should expose copyable text.”
- Cause: native share had an empty catch while clipboard failures used the
  manual-copy fallback.
- Fix: preserve intentional `AbortError` cancellation and expose the same
  selectable fallback text for every other native-share failure.
- Regression: `PR-SHARE-01`, `PR-SHARE-02`, and `PR-WIND-01`.

## PR-BUG-006 — Direct Vite install carried current Windows advisories

- Severity: high local-development exposure; build dependency.
- Reproduction: `npm audit --omit=dev` on the starting lockfile reported Vite
  8.0.14 with the Windows alternate-path file disclosure advisory plus
  vulnerable transitive `js-yaml` and `esbuild`.
- Cause: the lockfile had not been refreshed within its already-declared
  compatible ranges.
- Fix: refresh allowed dependencies to Vite 8.1.5 and pin the safe esbuild
  0.28.1 patch through npm overrides.
- Regression: `npm run audit:prod` reports zero vulnerabilities, followed by a
  clean production build and full browser campaign.

## Test findings that were not product bugs

These are recorded to avoid reintroducing incorrect fixes:

- A malformed challenge event correctly falls back to the last valid stored
  event, not always 100 ft.
- Sound persistence updates in a mount effect; the browser assertion must wait
  for hydration after reload.
- The title briefly scales during its entrance animation; responsive geometry
  must be measured after the animation settles.
- Wind-assisted share copy intentionally says the player “cheated” and includes
  an asterisk rather than the literal words “wind-assisted.”
- Rebuilding while an already-running Vite preview is serving can leave cached
  HTML pointing at replaced hashed assets. The local campaign now owns a fresh
  preview lifecycle.
