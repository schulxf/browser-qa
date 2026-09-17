# Validation record — 2.1.0

Validated on 17 September 2026 on Windows with Node.js 24.13.1 and npm 11.18.0.

## Verified

| Check | Result |
| --- | --- |
| `npm test` | 99 tests: 97 passed, 0 failed, 2 skipped because this Windows host denies unprivileged symlink creation. |
| Skill validator | The bundled `skill-creator` validator accepted `skills/qa-browser-jev`. |
| Installer unit tests | 9 passed without network calls. |
| Isolated Agent Skills install | `skills@1.7.0` copied the skill to the `universal` project target in a temporary directory. |
| Installed runtime | The installer resolved the skill path and installed the pinned dependency inside that copy; `experimental_evaluate` was available. |
| Installed-copy tests | 99 tests: 97 passed, 0 failed, the same 2 symlink checks skipped by the host. |
| Registry pin | `npm view ai@7.0.105 version` returned `7.0.105`. |
| Package preview | `npm pack --dry-run` and `npm publish --dry-run` completed without publishing. The whitelist excluded credentials, `node_modules`, and consumer artifacts. |
| Skill portability | The suite copied the complete skill into an isolated path containing spaces and ran `init`/`config` without root-repository files. |
| Credential store | Environment precedence, masked/stdin input, private file loading, redaction, and POSIX permission refusal are covered offline. |

The two skipped tests exercise rejection of symlinks that escape the project or evidence directory. On this Windows host, the operating system rejected creation with `EPERM` before application code ran. The same tests execute normally on hosts where symlink creation is permitted.

## Not executed

- No paid Vercel AI Gateway request was made because no credential was supplied.
- No browser was opened and no product journey was executed because `agent-browser` was not installed in this environment.
- No visual accuracy, defect-detection rate, or model quality claim was measured.
- No npm package or GitHub release was published by these checks.

The offline suite proves package structure, configuration boundaries, helper behavior, and integrity-gate behavior against synthetic fixtures. It is not end-to-end QA of a consumer application.
