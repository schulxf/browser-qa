# Audit hardening — migration for existing runs

These changes address F01–F07 from the initial audit. They intentionally tighten the existing version-2 run format: **old evidence packages do not acquire approval by being relabeled**. Perform a new reviewed run, or supply the missing real evidence. No dependency or consumer application is modified.

## Host-approved contract

`run-init` still outputs the contract SHA-256. The supervisor/reviewer must approve the actual scope before execution and retain the approved digest outside the executor's editable evidence bundle. Use that value with `--approved-contract-sha256` for the textual helper and final gate; bounded navigation already carries it in the request.

The gate will not infer the approved digest by hashing whichever file is presented. A digest in a CLI argument is **not a signature**: an agent that controls the supervising host can still forge approval. Enforcing reviewer isolation and protecting the reference are host responsibilities. Do not create a second editable file beside the report and call it a trust anchor.

The snapshot must be valid project configuration. The minimum journey × viewport × flow/visual matrix must remain in the contract with its expected behavior, required path, prohibited recovery and evidence requirements. Additional cases are permitted. Legitimate exclusions must be recorded in `scopeExclusions` before approval:

```json
{"caseId":"FILTER-01-mobile-visual","reason":"This explicitly desktop-only release excludes mobile layout.","approvedBy":"independent-reviewer","approvedAt":"2026-09-17T12:00:00Z"}
```

The approved digest covers those exclusions. An exclusion cannot name an unknown case, repeat another exclusion or coexist with the included case. Once testing starts, a new scope needs a new reviewed run; do not erase a failure.

## Textual Jev helper

Product evaluation requires an existing run and a `scenarioId` equal to an included case ID:

```text
node SKILL_DIR/scripts/jev.mjs REQUEST.json --project APP --approved-contract-sha256 APPROVED_SHA
```

Configuration changes (including before the first call), missing contracts, changed approved contracts and unknown cases block before transport. Product calls count in `RUN_DIR/jev.jsonl`. A pending attempt is an unknown outcome, not authorization to repeat it. The ledger's attempt/result/error context, call budget, model and count must agree with the report. Connectivity receipts cannot be copied into this ledger to claim product coverage.

A separate explicit diagnostic is available:

```text
node SKILL_DIR/scripts/jev.mjs SYNTHETIC_REQUEST.json --project APP --smoke --dry-run
node SKILL_DIR/scripts/jev.mjs SYNTHETIC_REQUEST.json --project APP --smoke
```

Regenerate the short-lived observation before the paid call. Connectivity uses a separate directory and only one attempt per diagnostic ID. To repeat it, deliberately choose a new diagnostic ID; do not call it a product run. Dry-run loads known private credentials for the same filtering as live mode and prints metadata only, never a full payload.

## Assertions are structured results, not filenames

Use [the assertion template](../templates/assertion.json) for an actual verifier's observations. Each receipt is bound to run, case, build, verifier and observation time. A nonzero `exitCode`, negative `passed`, failed status or failed check overrides a positive summary. Unknown/custom formats are blocked rather than inferred successful. For example, a measured check can be `{ "id": "filter", "operator": "equals", "expected": "A", "actual": "A", "passed": true }`. Checks support `equals`, `not-equals`, `includes`, `gte` and `lte`; the gate recomputes these comparisons. It never executes commands or scripts found in an artifact.

This validates the supplied values, **not their provenance from the real app**. A verifier or reviewer still must observe the app independently. Copying expected values into actual values is not testing. Human accessibility observations can also be recorded explicitly; this does not certify accessibility compliance.

## Screenshots and measured capture context

Use [the capture template](../templates/capture.json) and record actual viewport, DPR, URL, timestamp and build. The supported format is static, non-interlaced PNG, 8/16-bit grayscale/RGB with optional alpha. JPEG/WebP, indexed/interlaced PNG and animation are explicitly blocked pending a reviewed decoder; they are not silently accepted as images.

PNG checks cover chunk boundaries, CRCs, ordering, bounded decompression, decoded row sizes and filter validity. Limits: 50 MiB file, 64 MiB inflated scanlines, 32 megapixels and 32768 pixels per edge. Viewport, full-page and clipped captures are checked using the declared CSS geometry × measured DPR. A clipped detail alone cannot satisfy a whole-screen visual case.

```text
node SKILL_DIR/scripts/evidence.mjs RUN_DIR artifacts/page.png screenshot --capture CAPTURE.json
```

The helper does not invent DPR, mark an image inspected or prove that a screenshot came from the claimed browser. Open the actual image and keep original capture evidence. Do not alter metadata just to make dimensions fit. Other artifacts still use the three-argument form.

## Separate review receipt and final gate

Materialize [the independent review](../templates/independent-review.json), referring to the covered case IDs and exact visual evidence hashes. Hash it with `evidence.mjs ... independent-review`, then put that reference in `result.reviewer.evidence`. The reviewer must differ from the executor; Jev is not a reviewer. This receipt is not cryptographically authenticated by this package.

```text
node SKILL_DIR/scripts/qa-gate.mjs RUN_DIR/contract.json RUN_DIR/result.json RUN_DIR RUN_DIR/subject-current.json --approved-contract-sha256 APPROVED_SHA
```

Negative assertions win; missing/contradictory evidence blocks. Missing or inconsistent product Jev ledger cannot substantiate live hybrid QA. The gate still returns `approvesDeployment=false`, `integrityCheckOnly=true`, `validatesStructuredResults=true` and `authenticatesExecution=false`. It validates structure, internal consistency and supported comparisons, not fabricated narratives.

## Credential and installer behavior

Read and write share one resolver: explicit configure `--config-dir` (this command only), then `BROWSER_QA_ENV_FILE`, then `BROWSER_QA_CONFIG_DIR`, then the OS default. A custom env filename is preserved. A command-line directory is not persisted; the installer prints how to set `BROWSER_QA_ENV_FILE` for later processes. `AI_GATEWAY_API_KEY` always overrides file loading. POSIX file permissions are checked; Windows ACL guarantees are not claimed.

An empty skill discovery or a copy without package metadata fails installation. `--skip-deps` is reported as skipped, not runtime-ready. Both doctor entry points use the same prerequisite checks; the installer checks discovered installed copies, not its npx cache. `READY` means offline prerequisites only; missing SDK/browser/key returns `BLOCKED`. The package smoke uses `--help`, not a doctor that pretends every clean CI host has live prerequisites.

## Still requires a real pilot

F08 is validation work, not an offline code fix. Run the correct fixture and the state/layout defects with real agent-browser, authorized Gateway access, actual visual inspection and an independent reviewer. Compare with the same no-Jev baseline. No live integration, performance or defect-detection claim is established by the synthetic regression suite.
