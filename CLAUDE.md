# SocratEase

## Agent skills

### Issue tracker

Issues live in GitHub Issues (chasacademy-sandra-larsson/socratease), via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

Default vocabulary: needs-triage, needs-info, ready-for-agent, ready-for-human, wontfix. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `GLOSSARY.md` and `docs/adr/` at the repo root. See `docs/agents/domain.md`.

## Git workflow

- **One branch per ticket**, named after the issue: `<issue-number>-<short-slug>` (e.g. `3-walking-skeleton`), always branched from an up-to-date `main`.
- **Never push directly to `main`.** Every change goes through a pull request; the Teacher (repo owner) reviews and merges. Use squash merge.
- **PR body**: `Closes #<issue>`, a short summary, how each acceptance criterion is met, and how to test it manually.
- **Checks before merge**: CI (typecheck, lint, tests) must pass. Each PR gets a Vercel preview deployment. PRs that touch answering behaviour must also pass the Evaluation Set; any leaked Assignment solution blocks the merge.
- **Parallel work**: when several tickets are unblocked at once, each agent works in its own git worktree.
- **No `dev` branch.** `main` is the integration branch, and Vercel previews serve as staging. Revisit once real Students use the tool (e.g. release tags for production).
