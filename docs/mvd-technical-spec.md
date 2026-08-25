# AI Workflow Asset Marketplace — MVD 기술 명세

**Version:** MVD v0.2  
**Target:** Presentation-ready local demo  
**Network:** Sui Testnet + Walrus Testnet  
**Execution:** Local server  
**Workflow:** Google News RSS search, strictly limited to the latest 24 hours

---

## 0. Product objective

Build the smallest reliable end-to-end demo proving this statement:

> A buyer purchases a `LicensePass` on Sui, then a local executor verifies that license, downloads an encrypted workflow package from Walrus, decrypts and runs a Google News RSS workflow without exposing the package to the browser, and returns a signed execution result that can be recorded on Sui as an `ExecutionReceipt`.

This document is the retained product and technical contract for the MVD. Current
completion state is tracked in `docs/implementation-status.md`.

---

## 1. Scope decision

### 1.1 P0 demo

The live demo must support this exact path:

1. A pre-registered workflow appears in the web app.
2. A wallet without a license is denied execution.
3. The wallet buys a release-specific `LicensePass` with Testnet SUI.
4. The web app requests an execution challenge from the local server.
5. The wallet signs the challenge.
6. The local server verifies the signature and on-chain license.
7. The server retrieves the encrypted workflow bundle from Walrus.
8. The server decrypts the bundle using a local demo key provider.
9. The server queries Google News RSS and enforces a rolling 24-hour cutoff.
10. The server returns normalized news items and a signed receipt payload.
11. The buyer submits the receipt to Sui.
12. An `ExecutionReceipt` object is created and displayed with its transaction digest.

### 1.2 Explicitly excluded from P0

Do not implement these unless every P0 acceptance criterion passes:

- Nautilus
- AWS Nitro Enclaves
- TEE attestation or PCR verification
- arbitrary workflow code execution
- arbitrary shell commands
- seller-facing workflow builder
- multiple marketplace listings
- live workflow Fork creation
- on-chain royalty splitting
- transferable licenses
- full article crawling or paywall bypass
- Google News article-page scraping
- production-grade key custody
- production database
- mainnet deployment

### 1.3 Optional P0.5

Seal is a stretch goal, not a condition for the demo.

P0 must use `LocalDemoKeyProvider`. Design a narrow `KeyProvider` interface so `SealKeyProvider` can replace it later without changing the execution API. Never label the P0 path as “Seal protected” unless a real Seal policy and key-server flow have been executed successfully.

### 1.4 Required disclosure in the UI

Always show:

```text
Execution mode: Local server
Nautilus: Not implemented
TEE attestation: Disabled
Key provider: Local demo key | Seal
Network: Sui Testnet / Walrus Testnet
```

The demo may prove on-chain ownership and encrypted storage. It must not claim that the local server is trustless or unable to inspect plaintext.

---

## 2. Product definition

### 2.1 Demo workflow

**Name:** Google News RSS Monitor  
**Workflow type:** `google_news_rss/v1`  
**Release:** `1.0.0`  
**Default locale:** Korean / South Korea  
**License:** Unlimited executions for one release; non-transferable  
**Default price:** Configurable Testnet SUI amount  
**Input:** Search query  
**Output:** Up to 10 normalized news items from the latest 24 hours

### 2.2 User value shown in the demo

The demo is not selling a sophisticated crawler. The crawler is deliberately simple and deterministic so the presentation can focus on the asset and license mechanism:

- the workflow configuration is versioned;
- its encrypted package is stored on Walrus;
- a buyer owns an on-chain execution license;
- the browser does not receive the workflow plaintext or DEK;
- each run produces a verifiable, release-specific receipt.

---

## 3. Trust and security model

### 3.1 What P0 protects

- The browser never receives the AES key.
- The browser never receives the decrypted private workflow bundle.
- Walrus stores ciphertext, not the private bundle plaintext.
- Execution requires a valid wallet signature and a current `LicensePass`.
- The local executor signs the result hash.
- Sui verifies the registered executor signature before minting a receipt.
- A challenge nonce prevents reusing the same signed execution request.
- A receipt nonce hash prevents recording the same receipt twice.

### 3.2 What P0 does not protect

- The local server can see the DEK, decrypted bundle, query, and results.
- Whoever controls the executor signing key can sign receipts.
- An in-memory challenge store is lost on restart.
- Google News RSS is an external dependency.
- RSS availability and result ordering are not guaranteed.
- The workflow package is simple enough that confidentiality is illustrative rather than commercially strong.

### 3.3 Hard rules

- Never send `EXECUTOR_PRIVATE_KEY`, DEKs, or decrypted bundles to the frontend.
- Never commit secrets, generated private keys, `.env`, or local keyrings.
- Never execute code contained in the workflow bundle.
- Treat the bundle as configuration validated by Zod.
- Allow only the `google_news_rss/v1` workflow handler.
- Use HTTPS endpoints for Sui, Walrus, and Google News.
- Use domain separation for executor-signed receipts.
- Do not accept a client-supplied execution timestamp as authoritative.
- Reject expired, unknown, already-used, or mismatched challenges.
- Unit tests must not require live Google News, Sui, Walrus, or Seal.

---

## 4. Technical stack

Use a TypeScript-first monorepo unless the existing repository already has a sound alternative.

- Node.js 20 or newer
- pnpm workspaces
- TypeScript strict mode
- Vite + React for the web app
- current Sui dApp Kit v2 React packages
- current `@mysten/sui`
- Fastify for the local executor API
- Zod for all external and cross-package schemas
- Vitest for TypeScript tests
- Sui Move package for marketplace objects
- native Node `crypto` for AES-256-GCM and SHA-256
- an XML parser with entity expansion disabled
- no database in P0

Do not pin package versions from memory. Use current stable compatible releases, commit the lockfile, and adapt to the installed SDK types rather than inventing deprecated APIs.

---

## 5. Target repository structure

```text
.
├── README.md
├── package.json
├── pnpm-lock.yaml
├── pnpm-workspace.yaml
├── tsconfig.base.json
├── .env.example
├── .gitignore
├── apps/
│   ├── web/
│   │   ├── src/
│   │   └── package.json
│   └── executor/
│       ├── src/
│       │   ├── api/
│       │   ├── config/
│       │   ├── crypto/
│       │   ├── key-provider/
│       │   ├── services/
│       │   └── server.ts
│       └── package.json
├── packages/
│   ├── shared/
│   │   ├── src/
│   │   │   ├── canonical-json.ts
│   │   │   ├── execution.ts
│   │   │   ├── receipt.ts
│   │   │   └── workflow.ts
│   │   └── package.json
│   └── workflow-google-news/
│       ├── src/
│       │   ├── build-feed-url.ts
│       │   ├── execute.ts
│       │   ├── normalize.ts
│       │   ├── parse-rss.ts
│       │   └── schema.ts
│       └── package.json
├── move/
│   └── workflow_marketplace/
│       ├── Move.toml
│       ├── sources/
│       └── tests/
├── scripts/
│   ├── bootstrap-demo.ts
│   ├── generate-executor-key.ts
│   ├── upload-walrus.ts
│   └── verify-demo-state.ts
├── fixtures/
│   └── google-news/
│       ├── mixed-age.xml
│       ├── duplicates.xml
│       ├── malformed.xml
│       └── empty.xml
├── data/
│   └── .gitkeep
└── docs/
    ├── mvd-technical-spec.md
    ├── implementation-status.md
    ├── demo-runbook.md
    └── trust-model.md
```

If this is an existing repository, adapt the layout instead of nesting a second project unnecessarily.

---

## 6. Workflow package format

### 6.1 Public manifest

This information may be shown before purchase and recorded by hash on Sui.

```json
{
  "schemaVersion": "public-manifest/v1",
  "title": "Google News RSS Monitor",
  "summary": "Searches Google News RSS and returns normalized results from the latest 24 hours.",
  "workflowType": "google_news_rss/v1",
  "version": "1.0.0",
  "inputSchema": {
    "query": {
      "type": "string",
      "minLength": 2,
      "maxLength": 200
    }
  },
  "outputSchema": {
    "maxItems": 10,
    "fields": [
      "title",
      "source",
      "publishedAt",
      "url"
    ]
  }
}
```

### 6.2 Private bundle

Validate this with Zod after decryption. Unknown keys must be rejected or stripped according to one explicit policy.

```json
{
  "schemaVersion": "google_news_rss/v1",
  "feedBaseUrl": "https://news.google.com/rss/search",
  "locale": {
    "hl": "ko",
    "gl": "KR",
    "ceid": "KR:ko"
  },
  "windowHours": 24,
  "maxResults": 10,
  "requestTimeoutMs": 8000,
  "dedupeStrategy": "normalized_title_and_source"
}
```

The client cannot override `feedBaseUrl`, locale, `windowHours`, maximum results, timeout, or deduplication policy.

### 6.3 Encrypted envelope

Use AES-256-GCM:

- DEK: 32 bytes
- nonce: 12 bytes, random per encryption
- authentication tag: 16 bytes
- ciphertext hash: SHA-256 of the serialized encrypted envelope bytes
- plaintext bundle hash: optional local verification only; do not expose if unnecessary

Use AAD encoded from a canonical object:

```json
{
  "domain": "AIWF_BUNDLE_V1",
  "rootId": "0x...",
  "version": "1.0.0",
  "publicManifestHash": "hex..."
}
```

Envelope:

```json
{
  "envelopeVersion": 1,
  "cipher": "AES-256-GCM",
  "keyId": "root:<rootId>:release:1.0.0",
  "nonceBase64": "...",
  "tagBase64": "...",
  "ciphertextBase64": "...",
  "aadBase64": "..."
}
```

The DEK is stored only in a local keyring referenced by `keyId`. The keyring file must be ignored by Git.

---

## 7. Google News RSS workflow rules

### 7.1 Feed request

Construct a Google News RSS search URL server-side with:

```text
https://news.google.com/rss/search
  ?q=<encoded query plus "when:1d">
  &hl=ko
  &gl=KR
  &ceid=KR:ko
```

The `when:1d` operator is only a first filter. It is not the authoritative security or product boundary.

### 7.2 Enforce the latest 24 hours on the server

Given executor time `now`:

```text
cutoff = now - 24 hours
keep item only when:
  publishedAt is valid
  publishedAt >= cutoff
  publishedAt <= now + 5 minutes
```

Use an injected `Clock` interface. Tests must freeze the clock.

### 7.3 Query normalization and operator policy

- Trim outer whitespace.
- Collapse repeated internal whitespace.
- Require 2–200 Unicode characters after normalization.
- Remove or reject user-supplied `when:`, `before:`, and `after:` operators.
- The server appends exactly one `when:1d`.
- Do not permit a user parameter to change the feed host.
- Encode with `URL` and `URLSearchParams`; do not concatenate unescaped query strings.

Prefer rejecting reserved time operators with a clear `INVALID_QUERY_OPERATOR` error so behavior is visible and testable.

### 7.4 RSS parsing

Return:

```ts
type NewsItem = {
  title: string;
  source: string | null;
  publishedAt: string; // ISO 8601 UTC
  url: string;         // Google News result URL
};
```

Rules:

- Parse RSS XML only.
- Do not fetch linked article pages.
- Do not resolve Google redirect URLs in P0.
- Strip HTML tags from titles if present.
- Normalize Unicode and whitespace.
- Reject non-HTTP(S) item URLs.
- Drop items with invalid dates.
- Deduplicate by normalized title + normalized source.
- Sort newest first.
- Truncate after filtering and deduplication.
- Return an empty successful list when no current items exist.
- Treat malformed XML, timeout, and non-2xx responses as typed upstream errors.

### 7.5 Deterministic tests

At minimum test:

1. exact 24-hour boundary is included;
2. item older than 24 hours is excluded;
3. future timestamp over five minutes is excluded;
4. invalid date is excluded;
5. duplicates collapse;
6. maximum result count is enforced;
7. reserved time operator is rejected;
8. query encoding is correct;
9. malformed XML returns typed failure;
10. empty feed returns an empty list;
11. live network is never required by unit tests.

---

## 8. Sui Move design

Keep Move state minimal and test every invariant.

### 8.1 `Marketplace`

A shared object holding:

```text
id
admin
executor_public_key
used_receipt_nonces
license_registry
```

Responsibilities:

- register the executor Ed25519 public key;
- prevent duplicate licenses for the same buyer and release;
- prevent receipt replay;
- act as the shared mutable object for purchases and receipt recording.

Use a typed key such as `(release_id, owner)` for the license registry. Do not rely only on frontend duplicate checks.

### 8.2 `WorkflowRoot`

Creator-controlled object:

```text
id
creator
name
slug_hash
latest_release_id
created_at_ms
```

Only the creator may publish a release under this root.

### 8.3 `WorkflowRelease`

Publicly readable object:

```text
id
root_id
creator
version_major
version_minor
version_patch
title
description
workflow_type
walrus_blob_id
encrypted_bundle_hash
public_manifest_hash
key_id
price_mist
parent_release_id
status
created_at_ms
```

P0 supports one active original release. Keep `parent_release_id` for lineage display, but do not implement protected forking.

### 8.4 `LicensePass`

Address-owned and non-transferable outside the module:

```text
id
release_id
issued_at_ms
```

Do not add `store` unless transferability is intentionally introduced. The sender must own the pass used for execution/receipt recording.

### 8.5 `ExecutionReceipt`

Address-owned and non-transferable outside the module:

```text
id
release_id
license_id
runner
input_hash
output_hash
executor_id
executed_at_ms
nonce_hash
```

Do not store the raw query, raw RSS data, or result URLs on-chain.

### 8.6 Required entry functions

Names may adapt to Move conventions, but behavior must remain:

```text
create_marketplace(executor_public_key)
create_workflow_root(name, slug_hash)
publish_release(...)
purchase_license(marketplace, release, payment)
record_execution(marketplace, license, receipt_fields, executor_signature)
```

### 8.7 Payment and license invariants

- Release must be active.
- Payment amount must equal the configured price or safely split/refund excess according to a tested rule.
- Funds go to the release creator.
- One buyer cannot obtain duplicate P0 licenses for the same release.
- The minted pass goes to `tx_context::sender`.
- A pass is valid only for its exact release.

### 8.8 Receipt signature schema

The executor signs BCS bytes for a fixed Move/TypeScript-compatible struct:

```text
domain: bytes("AIWF_RECEIPT_V1")
release_id: address
license_id: address
runner: address
input_hash: vector<u8> length 32
output_hash: vector<u8> length 32
executed_at_ms: u64
nonce_hash: vector<u8> length 32
```

Requirements:

- Construct bytes in one shared TypeScript helper.
- Reconstruct the same struct in Move and call Sui Ed25519 verification.
- Require the registered executor public key.
- Require `runner == tx_context::sender`.
- Require the sender-owned `LicensePass` ID and release ID to match.
- Require each hash to be exactly 32 bytes.
- Reject a used `nonce_hash`.
- Add the nonce only after all validation passes.
- Mint the receipt to the runner.

### 8.9 Move tests

Cover at least:

- creator can publish;
- non-creator cannot publish;
- inactive release cannot sell;
- wrong payment fails;
- purchase transfers funds;
- purchase creates pass for sender;
- duplicate license fails;
- receipt with valid signature succeeds;
- invalid signature fails;
- wrong runner fails;
- wrong release/license pairing fails;
- reused receipt nonce fails;
- malformed hash length fails.

Do not weaken an invariant merely to make TypeScript integration easier.

---

## 9. Local executor design

### 9.1 Interfaces

Create narrow, mockable interfaces:

```ts
interface Clock {
  now(): Date;
}

interface WorkflowBlobStore {
  get(blobId: string): Promise<Uint8Array>;
}

interface KeyProvider {
  getDek(input: {
    keyId: string;
    releaseId: string;
    licenseId: string;
    runnerAddress: string;
  }): Promise<Uint8Array>;
}

interface LicenseVerifier {
  verify(input: {
    releaseId: string;
    licenseId: string;
    runnerAddress: string;
  }): Promise<void>;
}

interface ReceiptSigner {
  publicKey(): Uint8Array;
  sign(message: Uint8Array): Promise<Uint8Array>;
}
```

Implement:

- `WalrusBlobStore`
- `LocalDemoKeyProvider`
- `SuiLicenseVerifier`
- `Ed25519ReceiptSigner`
- `SystemClock`

Keep adapters separate from domain logic.

### 9.2 Challenge flow

#### `POST /api/execution/challenges`

Request:

```json
{
  "runnerAddress": "0x...",
  "releaseId": "0x...",
  "licenseId": "0x...",
  "query": "Sui blockchain"
}
```

Server:

1. validates all fields;
2. normalizes and validates the query;
3. generates a cryptographically random nonce;
4. sets an expiry no later than five minutes;
5. stores the challenge in memory;
6. returns a canonical personal-message string or bytes.

Challenge payload:

```json
{
  "domain": "AIWF_EXECUTION_REQUEST_V1",
  "challengeId": "uuid",
  "runnerAddress": "0x...",
  "releaseId": "0x...",
  "licenseId": "0x...",
  "inputHash": "hex",
  "issuedAtMs": 0,
  "expiresAtMs": 0,
  "nonce": "base64"
}
```

The server stores the normalized query but signs only its hash. The returned human-readable preview may include the query.

#### `POST /api/executions`

Request:

```json
{
  "challengeId": "uuid",
  "walletSignature": "serialized Sui personal-message signature"
}
```

Server order:

1. load challenge;
2. reject unknown, expired, or consumed challenge;
3. verify wallet personal-message signature and derive/confirm address;
4. atomically mark challenge consumed;
5. verify current on-chain license ownership and release match;
6. load release metadata from Sui;
7. fetch encrypted bundle from Walrus;
8. verify encrypted bundle hash against the release;
9. obtain DEK from `KeyProvider`;
10. decrypt and authenticate AES-GCM;
11. validate bundle schema;
12. dispatch only to `google_news_rss/v1`;
13. execute RSS request;
14. canonicalize result;
15. calculate input and output SHA-256 hashes;
16. create and sign BCS receipt payload;
17. return results, trace, and receipt.

Do not mark a challenge consumed before signature verification. After a valid signature, consumption should prevent replay even when later external execution fails; the user may request a new challenge.

### 9.3 API response

```json
{
  "executionId": "uuid",
  "workflow": {
    "releaseId": "0x...",
    "version": "1.0.0",
    "workflowType": "google_news_rss/v1"
  },
  "input": {
    "query": "Sui blockchain",
    "inputHash": "hex"
  },
  "result": {
    "items": [
      {
        "title": "...",
        "source": "...",
        "publishedAt": "2026-08-17T09:00:00.000Z",
        "url": "https://news.google.com/..."
      }
    ],
    "outputHash": "hex"
  },
  "trace": [
    "WALLET_SIGNATURE_VERIFIED",
    "LICENSE_VERIFIED",
    "WALRUS_BLOB_VERIFIED",
    "BUNDLE_DECRYPTED_LOCAL_SERVER",
    "RSS_FETCHED",
    "RESULT_SIGNED"
  ],
  "receipt": {
    "payload": {
      "releaseId": "0x...",
      "licenseId": "0x...",
      "runner": "0x...",
      "inputHash": "hex",
      "outputHash": "hex",
      "executedAtMs": 0,
      "nonceHash": "hex"
    },
    "bcsBase64": "...",
    "signatureBase64": "...",
    "executorPublicKeyBase64": "..."
  },
  "security": {
    "executionMode": "local_server",
    "nautilus": false,
    "teeAttestation": false,
    "keyProvider": "local_demo"
  }
}
```

### 9.4 Error model

Return stable machine codes:

```text
INVALID_REQUEST
INVALID_QUERY
INVALID_QUERY_OPERATOR
CHALLENGE_NOT_FOUND
CHALLENGE_EXPIRED
CHALLENGE_ALREADY_USED
INVALID_WALLET_SIGNATURE
LICENSE_NOT_FOUND
LICENSE_OWNER_MISMATCH
LICENSE_RELEASE_MISMATCH
RELEASE_INACTIVE
WALRUS_FETCH_FAILED
BUNDLE_HASH_MISMATCH
KEY_NOT_FOUND
BUNDLE_DECRYPT_FAILED
BUNDLE_SCHEMA_INVALID
RSS_TIMEOUT
RSS_UPSTREAM_ERROR
RSS_PARSE_ERROR
RECEIPT_SIGN_FAILED
INTERNAL_ERROR
```

Never expose stack traces, DEKs, private keys, raw decrypted bundles, or secret environment values to the client.

---

## 10. Walrus integration

### 10.1 Upload

The bootstrap script must:

1. serialize the encrypted envelope as UTF-8 JSON bytes;
2. upload bytes to a configured Walrus Testnet publisher;
3. handle both “newly created” and “already certified” response shapes;
4. extract the Blob ID;
5. retry aggregator reads with bounded exponential backoff because immediate availability may lag;
6. compare downloaded bytes with the uploaded bytes;
7. record the Blob ID and encrypted bundle hash.

Do not hardcode a community publisher into source code. Put publisher and aggregator endpoints in environment configuration.

### 10.2 Download

At execution:

1. build the aggregator URL from configured base + Blob ID;
2. enforce timeout and maximum response size;
3. require a successful HTTP status;
4. hash raw bytes;
5. compare with `encrypted_bundle_hash` from Sui before parsing/decrypting.

---

## 11. Demo bootstrap

Create `scripts/bootstrap-demo.ts` as an idempotent guided script.

### 11.1 Inputs

- Sui Testnet signer
- marketplace package ID
- marketplace object ID or permission to create one
- workflow name/version/price
- public manifest file
- private bundle file
- Walrus publisher/aggregator endpoints
- local keyring path
- executor public key

### 11.2 Sequence

1. Validate environment and network is Testnet.
2. Create or reuse `Marketplace`.
3. Create or reuse `WorkflowRoot`.
4. Canonicalize and hash public manifest.
5. Generate a random 32-byte DEK.
6. Encrypt the private bundle with AES-256-GCM and required AAD.
7. Store DEK in ignored local keyring under `keyId`.
8. Upload encrypted envelope to Walrus.
9. Verify Walrus retrieval.
10. Publish `WorkflowRelease` on Sui with Blob ID and hashes.
11. Write non-secret IDs to `data/demo-state.json`.
12. Print explorer-ready object and transaction IDs.
13. Never print the DEK or private key.

Idempotency may be state-file based for P0. On rerun, verify existing state before reusing it.

### 11.3 `data/demo-state.json`

```json
{
  "network": "testnet",
  "packageId": "0x...",
  "marketplaceId": "0x...",
  "workflowRootId": "0x...",
  "workflowReleaseId": "0x...",
  "walrusBlobId": "...",
  "publicManifestHash": "hex",
  "encryptedBundleHash": "hex",
  "keyId": "root:0x...:release:1.0.0",
  "priceMist": "100000000"
}
```

This file contains IDs only and may be committed if useful. Never put secrets in it.

---

## 12. Web application

Build one presentation-focused page, not a general marketplace.

### 12.1 Required sections

1. **Workflow card**
   - title, version, creator, price
   - workflow type
   - Root and Release IDs
   - Walrus Blob ID
   - public manifest hash

2. **Security disclosure**
   - local server
   - Nautilus disabled
   - TEE attestation disabled
   - actual key provider
   - Testnet labels

3. **Wallet and license**
   - wallet connect
   - network guard
   - current address
   - detected `LicensePass`
   - Buy License button
   - purchase transaction and object links

4. **Execution**
   - query input
   - `Run Workflow`
   - challenge/signing status
   - execution trace
   - typed error display

5. **Results**
   - title
   - source
   - published time
   - Google News URL
   - latest-first order
   - result count
   - input/output hashes

6. **Receipt**
   - signed payload preview
   - executor public key fingerprint
   - `Record Receipt`
   - receipt object ID
   - transaction digest
   - explorer link

### 12.2 UX states

Handle:

- wallet disconnected;
- wrong network;
- release loading;
- no license;
- purchase pending/success/failure;
- challenge pending;
- wallet signature rejected;
- execution pending/success/failure;
- zero current news results;
- receipt pending/already recorded/success/failure.

Do not display a fake success state. Every object ID shown must come from a real transaction or configured demo state.

---

## 13. Environment configuration

Create `.env.example` with descriptions and no real values.

```dotenv
# Shared
SUI_NETWORK=testnet
SUI_GRPC_URL=
SUI_EXPLORER_BASE_URL=

# Published objects
SUI_PACKAGE_ID=
MARKETPLACE_ID=
WORKFLOW_ROOT_ID=
WORKFLOW_RELEASE_ID=

# Walrus Testnet
WALRUS_PUBLISHER_URL=
WALRUS_AGGREGATOR_URL=
WALRUS_READ_TIMEOUT_MS=10000
WALRUS_MAX_BLOB_BYTES=1048576

# Local executor
EXECUTOR_HOST=127.0.0.1
EXECUTOR_PORT=3001
EXECUTOR_PRIVATE_KEY=
LOCAL_KEYRING_PATH=./data/local-keyring.json
CHALLENGE_TTL_MS=300000
GOOGLE_NEWS_REQUEST_TIMEOUT_MS=8000
GOOGLE_NEWS_WINDOW_HOURS=24
GOOGLE_NEWS_MAX_RESULTS=10

# Web; only public values may use VITE_ prefix
VITE_EXECUTOR_BASE_URL=http://127.0.0.1:3001
VITE_SUI_NETWORK=testnet
VITE_MARKETPLACE_ID=
VITE_WORKFLOW_RELEASE_ID=
VITE_SUI_EXPLORER_BASE_URL=
```

Validate configuration on process startup with Zod and fail fast with secret-safe errors.

---

## 14. Implementation phases and checkpoints

### Phase 1 — Repository and deterministic workflow core

Architecture and contracts:

- inspect architecture;
- lock schemas and boundaries;
- create the workspace structure and shared contracts;
- decide the installed Sui SDK APIs based on current types.

Workflow implementation:

- Google News URL builder;
- RSS parser;
- normalization;
- deduplication;
- 24-hour filter.

Deterministic tests:

- XML fixtures;
- frozen-clock tests;
- query/operator tests.

Checkpoint:

```bash
pnpm install
pnpm typecheck
pnpm test
```

All Google News workflow tests pass without network.

### Phase 2 — Move package

Keep object, payment, ownership, replay, and signature invariants explicit in the
Move module and its tests.

Checkpoint:

```bash
cd move/workflow_marketplace
sui move build
sui move test
```

### Phase 3 — Crypto, Walrus, and bootstrap

Define AAD, hashes, key boundaries, receipt BCS schema, and state transitions
before implementing adapters and script plumbing.

Checkpoint:

- AES-GCM encrypt/decrypt round trip;
- tampered ciphertext, tag, nonce, or AAD fails;
- upload parser handles all documented response shapes;
- Walrus fetch retries are bounded;
- no secret appears in logs or generated state.

### Phase 4 — Local executor

Implement challenge flow, wallet signature verification, on-chain license verification, encrypted bundle execution, RSS fetch, result hashing, and executor signature.

Checkpoint:

- API integration tests use fake Sui/Walrus/RSS adapters;
- unlicensed execution fails;
- wrong wallet fails;
- challenge replay fails;
- wrong bundle hash fails;
- valid run returns a verifiable receipt signature.

### Phase 5 — Web app

Implement presentational React components and state wiring after transaction
contracts are fixed. Review all transaction construction and wallet signing.

Checkpoint:

```bash
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
```

### Phase 6 — Testnet end-to-end

Use real Testnet objects, Walrus Blob, wallet, local server, and receipt transaction.

Checkpoint against every acceptance criterion in Section 15. Create `docs/demo-runbook.md` with exact recovery steps.

### Phase 7 — Optional Seal

Only after P0 succeeds:

- add `SealKeyProvider`;
- add a real Move approval policy;
- ensure the local executor is the approved decrypting principal;
- run a real Seal integration test;
- change the UI label to `Seal` only after successful verification.

Do not add Nautilus in this release.

---

## 15. P0 acceptance criteria

The MVD is complete only when all conditions are demonstrably true:

1. The web app reads a real Sui Testnet `WorkflowRelease`.
2. The displayed Walrus Blob contains an encrypted envelope, not private-bundle plaintext.
3. A disconnected wallet cannot buy or execute.
4. A wallet on the wrong network is blocked.
5. A wallet without a matching pass receives `LICENSE_NOT_FOUND`.
6. The wallet buys a real `LicensePass` with Testnet SUI.
7. Duplicate purchase is rejected on-chain.
8. The local server verifies a wallet-signed, expiring challenge.
9. Reusing the same challenge fails.
10. The server verifies the pass’s current owner and exact release.
11. Tampering with the Walrus bytes causes `BUNDLE_HASH_MISMATCH` or authenticated-decryption failure.
12. The private bundle and DEK never appear in browser network responses.
13. The RSS query includes a server-controlled one-day filter.
14. The server independently drops items older than 24 hours.
15. The response contains at most 10 deduplicated, newest-first items.
16. The result hash is reproducible from canonical result JSON.
17. The executor returns an Ed25519-signed BCS receipt payload.
18. Sui rejects a modified payload or invalid executor signature.
19. Sui mints a real `ExecutionReceipt` for a valid payload.
20. Re-recording the same receipt nonce fails.
21. The UI states plainly that execution is local and Nautilus/TEE is disabled.
22. `pnpm typecheck`, `pnpm test`, web build, `sui move build`, and `sui move test` pass.
23. `docs/demo-runbook.md` allows the demo to be repeated from a clean terminal session.
24. No secret is committed or printed.

---

## 16. Demo runbook requirements

The final `docs/demo-runbook.md` must include:

- required installed tools;
- environment setup;
- executor-key generation;
- Sui Testnet funding check;
- Move build/test/publish commands;
- bootstrap command;
- web and executor start commands;
- clean-wallet purchase path;
- execution and receipt path;
- expected IDs and UI states;
- failure recovery for:
  - Google News timeout;
  - Walrus temporary read failure;
  - stale object ID;
  - wrong network;
  - lost local server;
  - challenge expiry;
- a pre-recorded fixture mode for presentation fallback.

Fixture fallback must be visibly labeled `Fixture mode`. It may demonstrate UI and receipt plumbing but must not be presented as a live Google News fetch.

---

## 17. Coding rules

- Keep TypeScript strict; avoid `any`.
- Parse all external data through Zod.
- Use dependency injection for clock and network adapters.
- Use typed domain errors and centralized HTTP error mapping.
- Use `AbortController` for network timeouts.
- Limit response/body sizes.
- Canonicalize JSON in one shared package.
- Use byte arrays internally for hashes and signatures; convert only at boundaries.
- Compare hashes in constant time when practical.
- Never log request signatures, keys, decrypted bundles, or full environment objects.
- Add comments for security invariants, not obvious syntax.
- Prefer small commits or checkpoints by phase.
- Run the narrowest relevant test first, then the complete required suite.
- Do not mark work complete while tests are skipped.
- Do not change the product scope without documenting the reason.

---

## 18. Phase completion record

At each phase, report:

```text
Phase:
Status:
Files changed:
Architecture/security decisions:
Commands run:
Tests passed:
Tests failed:
Known limitations:
Next phase:
```

For the final report, map evidence to every P0 acceptance criterion and clearly separate:

- implemented and live;
- implemented but fixture-tested;
- optional Seal work;
- intentionally not implemented, including Nautilus.
