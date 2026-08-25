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

Status: complete (2026-08-19). Verified offline with strict TypeScript, 121 deterministic tests, web build, and the 20-test Move regression suite. No live Testnet call was used for this checkpoint.

- [x] Freeze canonical JSON, AES-GCM AAD/envelope/hash, receipt BCS, local keyring, and Walrus integrity boundaries
- [x] Add the server-only executor package and parent-owned crypto/keyring preparation core
- [x] Implement the frozen LocalDemoKeyProvider, Walrus HTTP adapters, and environment parsing
- [x] Add deterministic BCS, tamper, keyring, upload-shape, byte-limit, and bounded-retry tests
- [x] Complete reviewed bootstrap upload plumbing without Sui publication
- [x] Pass strict TypeScript and 121/121 deterministic offline tests
- [x] Rerun the interrupted final Move test regression and complete Phase 3 acceptance

## Phase 4 — Local executor

Status: complete (2026-08-19). Verified offline with strict TypeScript, 159 executor tests, 183 workspace tests, the web production build, and the 20-test Move regression suite. No live Sui, Walrus, or Google News call was used for this checkpoint.

- [x] Freeze canonical Sui personal-message bytes and an expiring, atomically consumed in-memory challenge flow
- [x] Verify exact configured-package LicensePass ownership/release binding and active shared WorkflowRelease BCS metadata
- [x] Enforce license-before-key ordering, Walrus hash-before-decrypt, reconstructed AES-GCM AAD, and strict `google_news_rss/v1` dispatch
- [x] Canonicalize result hashes and return independently verifiable Move-compatible raw Ed25519 receipt signatures
- [x] Add a local-only Fastify API with exact CORS, secret-safe errors, bounded RSS loading, and Testnet-only configuration
- [x] Pass deterministic wrong-wallet, expiry, replay, license, BCS, bundle-hash, RSS, API, and receipt integration tests with fakes
- [x] Pass read-only Sol security re-review with no remaining critical or major findings

## Phase 5 — Web app

Status: complete (2026-08-19). Verified offline with strict TypeScript, 56 deterministic web tests, 239 workspace tests, a production Vite build, the 159-test executor regression suite, and the 20-test Move regression suite. The live implementation was subsequently exercised against the real Phase 6 Testnet objects.

- [x] Add a clearly labeled local fixture presentation preview with no live wallet or network calls
- [x] Gate live mode on a complete Testnet package/Marketplace/release configuration and reject partial or non-loopback configuration
- [x] Integrate the Sui dApp Kit wallet button, exact-price license purchase, and exact owned `LicensePass` discovery
- [x] Validate canonical challenge semantics before wallet signing and bind displayed query/results to independently recomputed hashes
- [x] Verify receipt BCS, executor key, and raw Ed25519 signature before constructing `record_execution`
- [x] Show transaction/object success only after the exact Testnet object is discoverable
- [x] Implement the presentation UI, wallet/license flow, execution states, report, and receipt modal
- [x] Pass read-only Sol security re-review with no remaining critical or major findings

## Phase 6 — Testnet end-to-end

Status: complete (2026-08-19). Verified with the real Sui Testnet and Walrus
Testnet path, a seven-result live Google News RSS execution, strict TypeScript,
239 deterministic tests, a production web build, 20/20 Move tests, a tracked
secret scan, and read-only Sol security review with no critical or major
findings.

- [x] Publish the Move package and canonical Marketplace on Sui Testnet
- [x] Create the WorkflowRoot and publish the active `google_news_rss/v1` release
- [x] Upload and byte-verify the AES-256-GCM envelope on Walrus Testnet
- [x] Buy and independently discover the exact release-specific LicensePass
- [x] Run a real wallet-signed challenge and Google News RSS execution
- [x] Verify canonical result hashes and the executor-signed BCS receipt
- [x] Record and independently discover a real ExecutionReceipt
- [x] Demonstrate license, challenge, signature, and nonce rejection paths
- [x] Write the repeatable demo runbook and 24-item P0 evidence map
- [x] Pass the final TypeScript, web build, Move, secret-scan, and Sol review gates

## Phase 7 — Optional Seal

- [ ] Consider only after every P0 acceptance criterion passes; Nautilus remains out of scope

## Team collaboration readiness

Status: complete (2026-08-25). The repository now uses Korean as the primary
onboarding language while keeping the authoritative technical contracts intact.

- [x] Replace the stale Phase 1 README with the current Phase 1–6 project overview
- [x] Add a beginner-friendly Korean collaboration guide and simple branch/PR flow
- [x] Add memorable root commands for web, executor, build, and PR verification
- [x] Rename the CI job so it represents the whole TypeScript/web workspace
- [x] Remove duplicate Codex rule/brief copies and keep optional profiles under `tools/`
- [x] Update the active demo runbook to the recovered `1.0.1` release
- [x] Store new Walrus uploads for an explicit 53 Testnet epochs
- [x] Pass strict TypeScript, 245 deterministic tests, and the web production build

## Frozen Phase 1 boundaries

- Only `google_news_rss/v1` is accepted; the private bundle is strict and pins the HTTPS Google News host, Korean locale, 24-hour window, maximum of 10 results, and one dedupe strategy.
- `Clock.now()` is injected. The authoritative window is inclusive at exactly 24 hours and permits at most five minutes of future clock skew.
- Query normalization trims and collapses whitespace, then requires 2–200 Unicode code points. User-provided `when:`, `before:`, and `after:` operators are rejected with `INVALID_QUERY_OPERATOR`; the server appends exactly one `when:1d`.
- `NewsItem` is `{ title, source, publishedAt, url }`; dates are UTC ISO strings and URLs must be HTTP(S). No linked pages or redirects are fetched.
- Stable workflow error codes are `INVALID_QUERY`, `INVALID_QUERY_OPERATOR`, `RSS_TIMEOUT`, `RSS_UPSTREAM_ERROR`, and `RSS_PARSE_ERROR`.
- XML parsing must not expand custom entities. Malformed XML is a typed parse error.
- Phase 1 tests must be deterministic and must not contact Google News, Sui, Walrus, or Seal.
