# Implementation status

Baseline: the supplied directory contained planning/configuration documents but no Git metadata, package manifest, application code, or dependency lockfile. After Phase 1 verification, the workspace was initialized as a Git repository on `main` and connected to the public GitHub collaboration remote. The root project rules and implementation brief were derived from the retained preparation bundle.

## Phase 1 — Repository and deterministic workflow core

Status: complete (2026-08-17). Verified with pnpm 11.22.0, strict TypeScript, and 24 deterministic Vitest cases.

- [x] Inspect repository, dependency files, branch, and Git status
- [x] Freeze the Phase 1 package boundaries and shared schemas
- [x] Add the minimal pnpm workspace and strict TypeScript/Vitest configuration
- [x] Implement Google News query normalization and feed URL construction
- [x] Implement RSS-only parsing, normalization, 24-hour filtering, sorting, deduplication, and truncation
- [x] Add deterministic XML fixtures and frozen-clock tests
- [x] Generate `pnpm-lock.yaml`
- [x] Initialize Git on `main` with project-local ignore rules
- [x] Add contributor documentation, shared editor/Git rules, a PR template, and Phase 1 CI
- [x] Create a reviewed Phase 1 baseline commit (remote connection remains pending)
- [x] Pass `pnpm typecheck`
- [x] Pass `pnpm test` without network access

## Phase 2 — Move package

Status: complete (2026-08-18). Verified with Sui 1.77.2, a real deterministic Ed25519/BCS receipt vector, and 20 Move tests.

- [x] Restrict production to one canonical shared `Marketplace` using a publisher-owned, one-use, non-transferable creation cap
- [x] Implement creator-owned roots, shared releases, and non-transferable address-owned licenses and receipts
- [x] Enforce active release, exact-price payment to the creator, and one license per buyer/release
- [x] Enforce sender/runner, exact release/pass registry membership, 32-byte hashes, executor signature, and global nonce replay prevention
- [x] Test creator authorization, release status, both payment directions, payment transfer, duplicate licenses, and workflow-type restriction
- [x] Test valid and modified Ed25519 receipts, wrong runner, wrong release/pass, foreign-market pass, all hash lengths, and nonce replay
- [x] Pass `sui move build`
- [x] Pass `sui move test` with 20/20 tests
- [x] Pass read-only Sol security review with no remaining critical or major findings

## Phase 3 — Crypto, Walrus, and bootstrap

- [ ] Freeze AES-GCM AAD/hash/key-provider boundaries
- [ ] Implement and offline-test crypto, Walrus adapters, and bootstrap plumbing

## Phase 4 — Local executor

- [ ] Implement and integration-test challenge, license, bundle, execution, and receipt flows with fakes

## Phase 5 — Web app

- [x] Add a clearly labeled local fixture presentation preview with no live wallet or network calls
- [ ] Implement the presentation UI, wallet/license flow, execution states, and receipt recording

## Phase 6 — Testnet end-to-end

- [ ] Run the real Sui Testnet/Walrus Testnet path and write the repeatable demo runbook

## Phase 7 — Optional Seal

- [ ] Consider only after every P0 acceptance criterion passes; Nautilus remains out of scope

## Frozen Phase 1 boundaries

- Only `google_news_rss/v1` is accepted; the private bundle is strict and pins the HTTPS Google News host, Korean locale, 24-hour window, maximum of 10 results, and one dedupe strategy.
- `Clock.now()` is injected. The authoritative window is inclusive at exactly 24 hours and permits at most five minutes of future clock skew.
- Query normalization trims and collapses whitespace, then requires 2–200 Unicode code points. User-provided `when:`, `before:`, and `after:` operators are rejected with `INVALID_QUERY_OPERATOR`; the server appends exactly one `when:1d`.
- `NewsItem` is `{ title, source, publishedAt, url }`; dates are UTC ISO strings and URLs must be HTTP(S). No linked pages or redirects are fetched.
- Stable workflow error codes are `INVALID_QUERY`, `INVALID_QUERY_OPERATOR`, `RSS_TIMEOUT`, `RSS_UPSTREAM_ERROR`, and `RSS_PARSE_ERROR`.
- XML parsing must not expand custom entities. Malformed XML is a typed parse error.
- Phase 1 tests must be deterministic and must not contact Google News, Sui, Walrus, or Seal.
