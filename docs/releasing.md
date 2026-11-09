# Releasing the npm packages

`open-optcg` (the engine) and `open-optcg-model` (the learned opponent) are
published by `.github/workflows/publish.yml`. Both packages always carry the same
version.

| Channel  | Trigger                           | Version          | Install with            |
| -------- | --------------------------------- | ---------------- | ----------------------- |
| `latest` | a `v*` tag, after approval        | `0.2.0`          | `npm i open-optcg`      |
| `next`   | every push to main that passes CI | `0.2.1-next.418` | `npm i open-optcg@next` |

## Cut a release

1. Open a PR that bumps `version` in `packages/open-optcg/package.json` and
   `packages/open-optcg-model/package.json` to the same value. For a new minor,
   also update the model's `peerDependencies` range to `~X.Y.0`.
2. Merge it, then tag that commit on main and push the tag:
   ```sh
   git tag v0.2.0 && git push origin v0.2.0
   ```
3. Approve the `npm` environment in the workflow run. It checks the tag against
   both versions, runs `pnpm packages:check`, then publishes the engine first
   and the model second.

A tag that does not match the committed versions fails before anything is
published. A version that is already on npm can never be published again, so a
bad release is fixed with a new one, not by re-tagging.

## Why this is safe

- **No npm token exists.** The workflow proves its identity to npm with a GitHub
  OIDC token (trusted publishing). npm accepts it only from this repository's
  `publish.yml`, and both packages are set to refuse token publishes.
- **Every version has provenance.** npm records which commit and workflow run
  built it, shown as a badge on npmjs.com.
- **A human approves each release.** The `npm` environment requires a reviewer
  and only accepts `v*` tags. The `npm-next` environment only accepts `main`.
- **Only checked code is published.** Prereleases run only after the whole CI
  workflow has passed on a push to main. Releases run the package check
  themselves. In both cases the tarball that was installed and tested is the
  one uploaded.
- **The publish job has least privilege.** It only gets `contents: read` and
  `id-token: write`, its actions are pinned to commits, it uses no dependency
  cache, and its checkout keeps no credentials.

## One-time setup

This was done for `0.1.0` and only needs repeating for a new package.

1. Publish the first version by hand. npm can only trust a workflow for a
   package that already exists.
2. On npmjs.com, for each package, go to **Settings → Trusted publishing** and
   add a GitHub Actions publisher: repository `daavoo/open-optcg`, workflow
   `publish.yml`, no environment. The environment is enforced on GitHub
   instead, because one workflow serves both channels.
3. In the same settings, under **Publishing access**, choose _Require two-factor
   authentication and disallow tokens_.
4. On GitHub, under **Settings → Environments**:
   - `npm`: required reviewers set to the maintainers, deployments limited to
     `v*` tags.
   - `npm-next`: deployments limited to the `main` branch.
5. Add a tag ruleset for `v*` so that only maintainers can create those tags.
