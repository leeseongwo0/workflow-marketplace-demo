# AI Workflow Asset Marketplace

Presentation-focused MVD for a licensed `google_news_rss/v1` workflow on Sui Testnet and Walrus Testnet.

Phase 1 is complete: the shared schemas and Google News RSS workflow core are strictly typed and tested entirely offline. Later phases are intentionally not scaffolded as finished; see [the implementation status](docs/implementation-status.md).

## Requirements

- Node.js 22.13 or newer
- pnpm 11.22.0 (declared in `package.json`)

## Local setup

```bash
corepack enable
pnpm install --frozen-lockfile
pnpm check
```

`pnpm check` runs strict TypeScript checking and all deterministic tests. Unit tests must not contact Google News, Sui, Walrus, or Seal.

## Local presentation demo

```bash
corepack pnpm --filter web dev
```

Open `http://127.0.0.1:5173/`. This page is visibly labeled `Fixture mode`; wallet, license, RSS, Walrus, and receipt actions are simulated and do not submit network transactions.

## Current workspace

```text
packages/shared                 Shared schemas and contracts
packages/workflow-google-news   RSS URL, parsing, normalization, and execution core
apps/web                        Local fixture presentation page
fixtures/google-news            Deterministic RSS fixtures
docs/implementation-status.md   Phase 1–7 progress and frozen boundaries
```

## Security and scope

- Never commit `.env`, private keys, DEKs, or `data/local-keyring.json`.
- Never execute workflow-supplied code or fetch full Google News article pages.
- Nautilus and TEE support are not part of this MVD.
- Seal is optional Phase 7 work and must not be claimed before real integration.
- Architecture, Move invariants, cryptographic formats, and key-custody boundaries require technical-owner review.

See [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request and [CODEX_IMPLEMENTATION_BRIEF.md](CODEX_IMPLEMENTATION_BRIEF.md) for the authoritative product contract.
