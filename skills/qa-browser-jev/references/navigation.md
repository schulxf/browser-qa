# Jev during navigation — experimental, opt-in

This path uses Jev **before browser actions**, not just to agree with an existing QA report. It is still a supervised skill, not autonomous product approval. Keep the existing manual agent-browser path available.

## Responsibilities

The supervisor reviews a short capability plan and the actual initial image. Code matches those capabilities against fresh agent-browser JSON refs. One eligible target executes directly; two or more eligible targets ask Jev in `decide` mode. The code validates the answer and page freshness, then executes a single typed command through agent-browser. A segment has at most three actions and always returns to visual inspection and independent assertions.

`assess` remains optional for genuinely ambiguous textual evidence. Do not call it merely to repeat an assertion that already failed. A successful API smoke, correct agreement, or extra opinion is not proof of new bug discovery or avoided false approval.

## Limits and trust boundaries

Only reviewed navigation clicks and synthetic textbox/searchbox fills are supported automatically. No arbitrary selectors, shell strings, JavaScript, key presses, uploads, native-select shortcuts, payment, publication, permission changes or destructive operations are delegated. Capability labels are an allowlist chosen by the supervisor, **not proof that the application's handler is read-only**. Review the app behavior and use an isolated synthetic environment.

Exact role/name collisions stop instead of guessing. An action timeout has an unknown outcome and is never replayed. A failed postcondition stops the case, preserving the first attempt. A bounded read-only readiness wait is allowed (default 1500 ms, maximum 5000 ms); it does not retry a click or erase a failure. A final screenshot is not evidence that there was no intermediate flicker: use separate recording when transitions are under test.

The initial image acceptance is a host assertion, not cryptographic proof of inspection. Independent final review and product verifiers remain required. The new runner never writes `passed` to `result.json`, never approves deployment, and does not fix the previously documented general integrity-gate limitations.

## Workflow

All paths below are placeholders. Quote them for your shell. Runtime files and credentials stay outside the application bundle.

1. Load the installed agent-browser instructions. Run the existing doctor and make a normal QA run with `qa.mjs run-init`. Keep the approved `contractSha256` in the supervising host. Do not recompute it from a modified contract to force acceptance.
2. Copy [navigation-session.json](../templates/navigation-session.json), fill `runId`, the **flow** `caseId` and approved `contractSha256`. Explicitly approve synthetic data and browser actions.
3. Open a fresh isolated session:

```text
node SKILL_DIR/scripts/navigation.mjs open SESSION_REQUEST.json --project PROJECT_DIR
```

The response contains `session`, `browserConfig`, `artifactDirectory` and an initial checkpoint. The launcher uses explicit configuration, origin-derived domain containment, no inherited attach/profile/plugin flags and no inherited Gateway key. It does not attach to a personal Chrome profile. This is browser-level containment, not an OS firewall or an assertion that an environment labelled staging really is staging.

If authentication or a fixture precondition is needed, prepare it explicitly in **this exact session and config** using the trusted agent-browser/auth mechanism. Never put credentials in plans. Do not import personal profiles or saved state to bypass containment. Preparation is outside the measured journey and does not count as login or component-interaction coverage. Use authorized sandbox services only. For actions not supported by the restrictive setup, use the existing manual skill path rather than silently weakening policy.

After preparation, collect the checkpoint again:

```text
node SKILL_DIR/scripts/navigation.mjs capture SESSION_REQUEST.json --project PROJECT_DIR
```

4. Open the checkpoint PNG as an image and inspect it. Read the adjacent `.snapshot.json` to see exact roles/names. Copy [navigation-plan.json](../templates/navigation-plan.json), bind the current checkpoint ID, observation hash, screenshot hash and reviewer. Review the step goals, eligible alternatives, exact routes and postconditions **against the original task**. No secrets or real customer data.
5. Execute the approved segment:

```text
node SKILL_DIR/scripts/navigation.mjs run APPROVED_PLAN.json --project PROJECT_DIR
```

No supervisor round-trip is needed for each eligible choice within this segment. All browser actions still go through agent-browser. The supervisor and any other agent must not drive that session while the command holds the session lock. Snapshots are re-read after inference; a stale decision is a handoff, not an automatic retry.

6. Inspect the returned checkpoint and perform the independent verifier. `CHECKPOINT` and exit 0 mean a normal **handoff**, not QA approval. `FAILED` exits 1; `BLOCKED`/`ESCALATE` exit 2. Unknown outcomes stop. A consumed checkpoint cannot run twice. A stopped case cannot resume with a new segment ID; diagnose without mutating and create an explicitly authorized retest run. Never relabel a retest as the original success.
7. Another segment requires a newly inspected checkpoint and a new plan. Close the dedicated session when finished:

```text
node SKILL_DIR/scripts/navigation.mjs close SESSION_REQUEST.json --project PROJECT_DIR
```

The approved configuration and contract are checked before each command. Changes to URL policy, budget, contract or browser launch policy block execution. Jev navigation and legacy assessments share `RUN_DIR/jev.jsonl` and its lock/budget. Missing SDK or credential blocks an ambiguous decision before browser input; a single deterministic candidate needs no API call. Do not count this as a Jev-driven success.

## Example: filter persistence

With the bundled local catalog fixture, prepare Category A as a fixture precondition, then capture and inspect it. The sample plan asks Jev which of the observed `Ajuda`/`Catálogo` navigation controls opens Help; the return step has one exact target and therefore skips Jev. It expects the Help text and then `2 itens` after returning.

Never put a filter reapplication into the return step. The `broken-state` variant must fail the persistence criterion instead of being recovered. For the `broken-layout` variant, a successful navigation still says nothing about overflow: the vision supervisor must inspect the mobile image and independently record the defect. The sample only tests navigation/persistence, not the select widget itself.

Adjust sample `at` URLs to the variant and actual port, with matching approved configuration. Do not compare builds/variants as if they were the same input. A poor Jev selection can itself stop a run; distinguish agent/setup failure from a demonstrated product bug.

## What is recorded

Under `RUN_DIR/navigation/CASE_ID`:

- Dedicated session/configuration, checkpoint PNGs and snapshots.
- Reviewed segment plans, single-use checkpoint receipts and append-only action-intent/action-completed events.
- Segment results: direct actions, successful Jev decisions, decision attempts, executed Jev-selected actions, browser commands and available token usage.

`loopMs` covers the segment loop. `commandMs` also includes local preparation and final checkpoint capture (not initial session open, other segments, supervisor thinking, independent verification or final review). **Neither is full QA duration or app render latency.** Host-level timing is required for comparison. Unknown token usage stays marked incomplete; total billed cost is not inferred from tokens. The shared ledger distinguishes `purpose: navigation` from old assessment records. Inspect `mode` on legacy records, not merely their existence.

Reports must separate: API connectivity, navigation contribution, assessment contribution, independent findings, inconclusive outcomes and missing measurements. `newBugsDiscovered` and `avoidedIncorrectApproval` are null unless a separate controlled evaluation supports those claims.

## Paired comparison

Use [navigation-measurement.json](../templates/navigation-measurement.json) as the host's receipt format. It is **not generated measurement data**. Fill one baseline and one hybrid sample after real runs. Same app build/source, fixture state, actor, viewport, tested cases, supervisor model, host/browser versions and protocol; separate run IDs. Reset fixture/session between arms. Alternate A/B and B/A over repeated pairs. Do not give only one arm a pre-solved path or skip vision/review work.

The baseline uses supervisor + agent-browser + the same product verifiers, without Jev. The hybrid adds the bounded navigation path. Measure total wall time from the same start/end boundaries including model time, checkpoints, verifiers and review; record all supervisor calls and all billed costs, or set `totalCostUsd` to null. Use independent ground truth for confirmed defects/false approvals. Never place the defect answer key in the model prompt.

```text
node SKILL_DIR/scripts/navigation-compare.mjs baseline.json hybrid.json
```

The comparator rejects mismatched context and flags incomplete coverage, no exercised Jev navigation and quality regression. It reports deltas without claiming statistical significance or general superiority. It checks **host-reported receipts**, not their authenticity. Faster but less reliable is not an improvement. Finding the same bugs with less time/cost may be useful; finding no additional bugs is not by itself failure.

## Validation status for this addition

Offline unit and orchestration tests use explicit injected doubles. No live agent-browser/Gateway execution or speed/defect-detection benchmark is claimed by this addition. Before using it as the normal route, run both correct and deliberately broken fixture variants on an authorized host, inspect real screenshots and preserve the actual receipts. Do not publish mock results as live evidence.

Primary integration contracts consulted:

- [agent-browser snapshots](https://agent-browser.dev/snapshots)
- [agent-browser commands](https://agent-browser.dev/commands)
- [agent-browser security](https://agent-browser.dev/security)
- [agent-browser configuration](https://agent-browser.dev/configuration)
- [Vercel Jev evaluation API announcement](https://vercel.com/changelog/typesafe-ai-jev-now-available-on-ai-gateway)
