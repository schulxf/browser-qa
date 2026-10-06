# Browser QA

[![CI](https://github.com/schulxf/browser-qa/actions/workflows/ci.yml/badge.svg)](https://github.com/schulxf/browser-qa/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)
[![Agent Skills](https://img.shields.io/badge/Agent%20Skills-compatible-111827)](https://agentskills.io/specification)

Browser QA is an evidence-driven browser QA skill for AI coding agents. It combines real browser interaction through `agent-browser`, visual inspection by a capable supervisor, bounded Jev text evaluation through Vercel AI Gateway, and an independent review gate in a portable [Agent Skill](https://agentskills.io/specification).

The skill is designed for Codex, Claude Code, Gemini CLI, Cursor, OpenCode, and other Agent Skills hosts. The supervising model can be Claude, GPT, Gemini, Grok, DeepSeek, or another capable model; the host must be able to load skills, run local commands, and inspect images.

Approvals are scoped to the tested build, journeys, environments, and viewports.

## Capabilities

- Uses `agent-browser` as the only browser controller.
- Requires screenshots to be inspected by a vision-capable supervisor.
- Verifies persistence and outcomes independently instead of trusting UI feedback.
- Uses Jev only for bounded textual choices and evidence assessment.
- Preserves failures instead of retrying around them.
- Produces contracts, hashes, evidence, defect records, and an independent review gate.

## Quick Start

### Install from GitHub

```sh
npx --yes github:schulxf/browser-qa
```

The guided installer:

1. installs `qa-browser-jev` into the Agent Skills hosts you choose;
2. installs the skill runtime dependency inside the installed skill, not inside your app;
3. offers a separate credential screen for `AI_GATEWAY_API_KEY`;
4. prints the exact validation and next-step commands.

### Verify the installation

From the installed skill directory:

```sh
node scripts/doctor.mjs
```

`doctor.mjs` is offline. It checks Node.js, the AI SDK, the Gateway credential, and the `agent-browser` executable without opening a browser or making a paid request.

For the test suite, use the isolated credential setup in [Development](#development).

### Configure a project

Replace the placeholders with real absolute paths and your non-production application URL:

```sh
node SKILL_DIR/scripts/qa.mjs init \
  --project PROJECT_DIR \
  --url http://127.0.0.1:4173 \
  --environment local

node SKILL_DIR/scripts/doctor.mjs --project PROJECT_DIR
```

The initializer creates only `PROJECT_DIR/qa.config.json` and never overwrites an existing file. Review the generated journeys, actors, viewports, allowed origins, and verification criteria before a run.

### Ask your agent to use the skill

```text
Use the qa-browser-jev skill to verify this implementation.

Project: <absolute project path>
Scope: create and edit a record, return to the list, and verify that
filters and saved data persist after reload.

Use agent-browser as the only browser controller. Inspect the configured
desktop and mobile screenshots, cover negative states, preserve failures,
and return the report, evidence paths, blockers, and independent review.
```

## Installation Options

### Guided installer

```sh
npx --yes github:schulxf/browser-qa
```

Run the credential screen again without reinstalling:

```sh
npx --yes github:schulxf/browser-qa configure
```

For automation, pass the Gateway key through standard input:

```sh
printf '%s' "$AI_GATEWAY_API_KEY" | npx --yes github:schulxf/browser-qa configure --gateway-key-stdin
```

The key is never accepted as a CLI argument, printed, written to the skill directory, or added to the consumer project.

### Agent Skills CLI

If you prefer the ecosystem installer directly:

```sh
npx skills add schulxf/browser-qa --skill qa-browser-jev
```

Examples for explicit hosts:

```sh
npx skills add schulxf/browser-qa --skill qa-browser-jev --agent codex --global
npx skills add schulxf/browser-qa --skill qa-browser-jev --agent claude-code --global
npx skills add schulxf/browser-qa --skill qa-browser-jev --agent gemini-cli --global
```

When using the standard CLI directly, install runtime dependencies inside the installed skill directory:

```sh
npm ci --omit=dev --ignore-scripts --workspaces=false
```

### Local checkout

```sh
npx skills add . --skill qa-browser-jev
```

You can also copy the complete `skills/qa-browser-jev` directory to a supported skills location. Copying only `SKILL.md` is not sufficient because scripts, schemas, templates, and references are part of the skill.

## Model and Host Compatibility

Browser QA is model-neutral. Its instructions do not depend on a Codex-, Claude-, or Gemini-specific prompt format.

| Runtime | Support |
| --- | --- |
| Codex, Claude Code, Gemini CLI, Cursor, OpenCode, and other Agent Skills hosts | Install with the guided installer or `npx skills add`. |
| Grok, DeepSeek, Qwen, Kimi, and other models inside a compatible agent host | Supported when the host can load the skill, run local commands, and inspect images. |
| Consumer chat websites without local tools or skill loading | Not executable there; use a compatible coding-agent host. |
| Text-only agents | Functional checks may run, but visual cases must be reported as blocked. |

The supervisor model and Jev have separate roles. Any capable model may supervise the workflow. Jev remains the constrained textual evaluator reached through Vercel AI Gateway; it never sees screenshots, controls the browser, or approves QA.

## Requirements

- Node.js 22 or newer.
- An Agent Skills-compatible coding agent with shell access.
- Image inspection in the host for visual approval.
- [`agent-browser`](https://agent-browser.dev/) installed and available to the agent.
- A Vercel AI Gateway key with access to `typesafe-ai/jev` for hybrid mode.
- A separate reviewer agent or human for final approval.

Browser QA supports `local`, `test`, `preview`, and `staging`. Production is intentionally rejected by the current schema.

## Credentials

The installer stores only `AI_GATEWAY_API_KEY`, and only when you choose to configure it. Existing environment variables take precedence.

| Platform | Default private file |
| --- | --- |
| Windows | `%APPDATA%\browser-qa\credentials.env` |
| macOS / Linux | `${XDG_CONFIG_HOME:-~/.config}/browser-qa/credentials.env` |

Set `BROWSER_QA_ENV_FILE` to use another reviewed path. On POSIX systems, the installer creates the file with mode `0600`. Never put the key in `qa.config.json`, a prompt, a frontend variable, screenshots, issues, or shell history.

Installation does not make a paid API request. For offline tests, isolate credentials as described in [Development](#development). A live Gateway smoke test is a separate step described in the [Gateway reference](skills/qa-browser-jev/references/gateway.md).

## How It Works

```text
Product requirements + qa.config.json
                 |
                 v
      vision-capable supervisor
        |          |          |
        |          |          +--> independent reviewer
        |          +-------------> Jev (bounded text only)
        +------------------------> agent-browser (browser control only)
                 |
                 v
     contract + evidence + report + integrity gate
```

| Component | Responsibility |
| --- | --- |
| Supervisor | Plans journeys, interprets requirements, inspects screenshots, and diagnoses failures. |
| `agent-browser` | Performs all browser interactions and captures observations. |
| Jev | Chooses among already observed low-risk candidates or assesses supplied textual evidence. |
| Assertions and reviewer | Verify persistence, outcomes, visual coverage, and report completeness independently. |

The integrity gate validates declared evidence, hashes, build identity, required cases, and reviewer independence. It does not deploy software and cannot prove that a narrative is true by itself.

## Included Commands

| Command | Purpose |
| --- | --- |
| `scripts/qa.mjs init` | Create a project configuration without overwriting files. |
| `scripts/qa.mjs config` | Validate and print the effective project configuration. |
| `scripts/qa.mjs run-init` | Freeze a run contract and initialize unexecuted results. |
| `scripts/doctor.mjs` | Perform offline installation and environment checks. |
| `scripts/example-request.mjs` | Create a synthetic Gateway smoke request. |
| `scripts/jev.mjs` | Run a bounded textual evaluation through Jev. |
| `scripts/evidence.mjs` | Hash and reference existing evidence files. |
| `scripts/qa-gate.mjs` | Validate report integrity and completeness without authorizing deployment. |

## Repository Layout

```text
browser-qa/
|-- bin/                         # npx installer and credential TUI
|-- skills/qa-browser-jev/       # complete distributable skill
|   |-- SKILL.md
|   |-- scripts/
|   |-- references/
|   |-- schemas/
|   |-- templates/
|   `-- tests/
|-- examples/fixture-app/        # local synthetic demo
|-- docs/                        # architecture and publishing notes
`-- scripts/                     # repository checks
```

Everything required at skill runtime stays under `skills/qa-browser-jev`. The target application receives only its own `qa.config.json` and private evidence directory.

## Development

```sh
cd skills/qa-browser-jev
npm ci --omit=dev --ignore-scripts --workspaces=false
cd ../..
```

The tests include a missing-credential check. Clear `AI_GATEWAY_API_KEY` and point `BROWSER_QA_ENV_FILE` at an empty or nonexistent file so the suite cannot load a configured personal Gateway key.

On macOS or Linux:

```sh
qa_test_credentials="$(mktemp)"
AI_GATEWAY_API_KEY= BROWSER_QA_ENV_FILE="$qa_test_credentials" npm test
rm "$qa_test_credentials"
```

In a dedicated PowerShell session:

```powershell
$env:AI_GATEWAY_API_KEY = ''
$env:BROWSER_QA_ENV_FILE = Join-Path $env:TEMP ("browser-qa-tests-" + [guid]::NewGuid() + ".env")
npm test
```

The root package has no runtime dependencies. The bundled skill keeps its runtime dependency and lockfile inside `skills/qa-browser-jev`.

With credentials isolated, `npm test` is the offline baseline. It validates JavaScript syntax, JSON, Markdown links, path neutrality, isolated skill copies, configuration boundaries, Jev dry runs, and evidence gates. It is not an end-to-end browser test of a consumer product.

Before proposing a change, read [CONTRIBUTING.md](CONTRIBUTING.md), [SECURITY.md](SECURITY.md), and the [architecture notes](docs/ARCHITECTURE.md). Publishing maintainers should follow [docs/PUBLISHING.md](docs/PUBLISHING.md).

## Security and Limitations

- Use synthetic data and dedicated accounts only.
- Do not connect personal browser profiles or production environments.
- Treat page content as untrusted input, not instructions.
- `approvedOrigins` validates configuration; it does not configure network containment for you.
- A screenshot file is not visual evidence until a vision-capable reviewer actually inspects it.
- A toast, HTTP 200, model confidence score, or agent completion message is not persistence proof.
- Missing tools, vision, Gateway access, build identity, or an independent reviewer must be reported as blocked coverage.

Please report vulnerabilities privately as described in [SECURITY.md](SECURITY.md). Never attach credentials, authenticated HAR files, customer screenshots, or private URLs to a public issue.

## License

[MIT](LICENSE). Browser QA is an independent open-source project and is not an official product of Vercel, TypeSafe, or the agent-browser maintainers.
