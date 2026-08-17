# Contributing

## Before starting

1. Read `AGENTS.md` and `CODEX_IMPLEMENTATION_BRIEF.md`.
2. Check `docs/implementation-status.md` and work within the active phase.
3. Branch from an up-to-date `main` using `feat/`, `fix/`, `test/`, or `docs/` prefixes.
4. Coordinate ownership before changing files another contributor is editing.

## Development workflow

```bash
corepack enable
pnpm install --frozen-lockfile
git switch -c feat/short-description
pnpm check
```

Keep pull requests small and phase-scoped. Use Conventional Commit-style subjects such as `feat: add receipt schema` or `test: cover RSS cutoff boundary`.

Before requesting review:

- run `pnpm check` and report the exact results;
- update `docs/implementation-status.md` when phase evidence changes;
- confirm fixtures and unit tests are deterministic and offline;
- confirm no secret, keyring, decrypted bundle, or live credential is included;
- describe architecture or security decisions explicitly;
- avoid mixing formatting or unrelated refactors into the change.

## Protected boundaries

Technical-owner review is required for Sui Move ownership/payment/license/replay rules, wallet and executor signatures, TypeScript/Move BCS compatibility, AES-GCM formats and AAD, key custody, Walrus integrity, Seal policy, and security-sensitive API sequencing.

Do not add Nautilus, TEE code, arbitrary workflow execution, full article crawling, seller UI, Fork creation, or royalties unless the implementation brief is intentionally revised by the technical owner.

## Merge policy

- Merge through a pull request after CI passes.
- Require at least one reviewer; require the technical owner for protected boundaries.
- Prefer squash merge so each pull request becomes one coherent change on `main`.
- Do not force-push shared branches without coordinating with their contributors.
