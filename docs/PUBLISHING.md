# Publishing Browser QA

The public source of truth is `https://github.com/schulxf/browser-qa`. The Agent Skill is distributed from `skills/qa-browser-jev`; the root package provides the `browser-qa` installer.

## GitHub release checklist

1. Confirm the version matches in the root package, skill package, skill metadata, and changelog.
2. Run the offline baseline:

   ```sh
   npm test
   ```

3. Inspect the npm payload without publishing:

   ```sh
   npm pack --dry-run
   npm publish --dry-run
   ```

4. Confirm the payload contains `bin/`, the complete `skills/qa-browser-jev/` tree, and public documentation. It must not contain `.env`, credentials, `node_modules`, consumer artifacts, or real QA evidence.
5. Push the reviewed commit to `main` and wait for CI.
6. Test GitHub-backed discovery and the installer on an isolated host:

   ```sh
   npx skills add schulxf/browser-qa --list
   npx --yes github:schulxf/browser-qa doctor
   npx --yes github:schulxf/browser-qa install
   ```

7. Run the synthetic Gateway smoke only with explicit cost authorization. Run the fixture app through a real browser separately; neither step is part of the offline baseline.
8. Enable private vulnerability reporting before announcing the project broadly.

## npm release checklist

The unscoped package name is `browser-qa`, which enables the intended command:

```sh
npx browser-qa
```

An npm release is separate from a GitHub push. Before publishing:

1. confirm `npm view browser-qa` still represents the intended package ownership;
2. authenticate with the maintainer's npm account and require 2FA/provenance as appropriate;
3. run `npm test`, `npm pack --dry-run`, and `npm publish --dry-run` again from the exact release commit;
4. publish intentionally with `npm publish --access public`;
5. install the published version in a clean temporary environment and verify `browser-qa doctor` plus Agent Skills discovery;
6. tag the same commit and create GitHub release notes from the changelog.

Do not publish automatically from an untrusted pull request or expose npm/Gateway credentials to forked workflows.

## Versioning

Use semantic versioning for the public installer and skill together. A schema or contract change that consumers cannot read without migration is a breaking change. Update `references/migration-v2.md` or add the relevant migration document whenever stored project artifacts change.
