# Testnet demo runbook

This is the repeatable Phase 6 walkthrough for the "google_news_rss/v1" demo.
It uses Sui Testnet, Walrus Testnet, a local executor, and the "/app" web UI.
It does not use Nautilus or a TEE: the UI must keep showing "Local server",
"Nautilus: Not implemented", and "TEE attestation: Disabled".

Run the commands from the repository root. Replace angle-bracket placeholders
locally; never paste their values into this document or into a terminal
transcript.

## Safety and prerequisites

Install the versions declared by the repository:

~~~sh
corepack enable
corepack pnpm install --frozen-lockfile
corepack pnpm check
~~~

You need Node.js 22.13 or newer, pnpm 11.22.0, Sui CLI 1.77.2, a Sui
Testnet browser wallet, a funded Testnet signer for administration, and
configured Walrus Testnet publisher and aggregator HTTPS endpoints.

Do not run commands that print ".env", private values, shell environment, or
shell traces. Do not commit ".env", "data/local-keyring.json", private bundles,
DEKs, wallet signatures, or executor private keys.

## Public Testnet evidence

These are public object identifiers from the known-good run:

| Item | ID or value |
| --- | --- |
| Network | testnet |
| Package | 0x19fe5223d0045492ba45d88b5e9fc9d0be4bf05cd6def862c5faef10c6ed0124 |
| Marketplace | 0x8fc737d7538ba4db1507ec6728e8ff8a0ac9bf2cb7024e8697db0673431e7af8 |
| WorkflowRoot | 0x0378baa3b7aade01a7c0f046f5fb02893afc17ee97ef795dc4aca9c3a10a6f54 |
| WorkflowRelease | 0x2a8560b9fc657f7e9ee280897a7f3f06fe9f53b271761d2bf0c36f7d29bfa523 |
| Walrus blob | RxMcj6lClRuLq2nwiCh7jK9sRENDYG3rRMaB-vBiDvA |
| Encrypted envelope SHA-256 | ac342f8ab7b986fc2b6cd90abda7265714efc649c46fca2bcc250f4213096b61 |
| Public manifest SHA-256 | 6651bfa5a474f1bc74df8a1979aeb31c43a0438ea3186639cf55324a5fdb32fa |
| Known LicensePass | 0xe5e84169542d8abc27b7902f9c19637b0dff65a2e3a8b52e75b5d96dd43ea6da |

The LicensePass belongs to the wallet used for this current demo release. A
different clean wallet will receive a different object ID. The historical
`1.0.0` receipt evidence remains in `docs/phase-6-evidence.md`.

## Configure the local environment

Create the ignored environment file without displaying it:

~~~sh
cp .env.example .env
chmod 600 .env
~~~

Set these names in ".env" using local values. Keep "SUI_NETWORK=testnet"; use
HTTPS Sui/Walrus endpoints without credentials, query strings, or fragments.
The "VITE_" values are public browser configuration only.

~~~text
SUI_NETWORK=testnet
SUI_GRPC_URL=<HTTPS Sui Testnet gRPC URL>
SUI_EXPLORER_BASE_URL=<HTTPS Sui explorer base URL>
SUI_PACKAGE_ID=0x19fe5223d0045492ba45d88b5e9fc9d0be4bf05cd6def862c5faef10c6ed0124
MARKETPLACE_ID=0x8fc737d7538ba4db1507ec6728e8ff8a0ac9bf2cb7024e8697db0673431e7af8
WORKFLOW_ROOT_ID=0x0378baa3b7aade01a7c0f046f5fb02893afc17ee97ef795dc4aca9c3a10a6f54
WORKFLOW_RELEASE_ID=0x2a8560b9fc657f7e9ee280897a7f3f06fe9f53b271761d2bf0c36f7d29bfa523
WALRUS_PUBLISHER_URL=<HTTPS Walrus Testnet publisher URL>
WALRUS_AGGREGATOR_URL=<HTTPS Walrus Testnet aggregator URL>
WALRUS_STORAGE_EPOCHS=53
LOCAL_KEYRING_PATH=./data/local-keyring.json
EXECUTOR_HOST=127.0.0.1
EXECUTOR_PORT=3001
CORS_ORIGIN=http://127.0.0.1:5173
CHALLENGE_TTL_MS=300000
EXECUTOR_PRIVATE_KEY=<generated locally; never document this value>
SUI_DEPLOYER_PRIVATE_KEY=<funded Testnet signer; never document this value>
VITE_EXECUTOR_BASE_URL=http://127.0.0.1:3001
VITE_SUI_NETWORK=testnet
VITE_SUI_GRPC_URL=<same public HTTPS Sui Testnet gRPC URL>
VITE_SUI_PACKAGE_ID=0x19fe5223d0045492ba45d88b5e9fc9d0be4bf05cd6def862c5faef10c6ed0124
VITE_MARKETPLACE_ID=0x8fc737d7538ba4db1507ec6728e8ff8a0ac9bf2cb7024e8697db0673431e7af8
VITE_WORKFLOW_RELEASE_ID=0x2a8560b9fc657f7e9ee280897a7f3f06fe9f53b271761d2bf0c36f7d29bfa523
VITE_SUI_EXPLORER_BASE_URL=<same public HTTPS explorer base URL>
~~~

Leave the private-key placeholders absent until the corresponding local
signers are ready. "EXECUTOR_PRIVATE_KEY" must match the 32-byte public key
stored in the on-chain Marketplace. The executor never sends that private key
to the browser.

## Generate or reuse the executor key

Run this from the repository root:

~~~sh
corepack pnpm --filter @aiwf/executor generate-key
~~~

The script creates or reuses "EXECUTOR_PRIVATE_KEY" in ".env" and prints only
public key metadata. If the existing Marketplace was created with a different
executor public key, do not silently replace the local key: use the matching
local key or publish a fresh Marketplace through the reviewed Move deployment
process. The browser receipt verifier must see the same key in both places.

## Fund the Testnet wallets

Switch the Sui CLI to Testnet and inspect balances without printing secrets:

~~~sh
sui client switch --env testnet
sui client active-env
sui client gas
~~~

Use the Sui Testnet faucet for the deployer and the clean browser wallet. The
browser wallet needs gas plus the exact release price for "purchase_license";
the deployer also needs package/bootstrap gas. Recheck with "sui client gas"
after funding. Never use a mainnet account or mainnet endpoint.

## Build, test, and publish Move

Run the deterministic Move checks before any publish:

~~~sh
sui move build --path move/workflow_marketplace
sui move test --path move/workflow_marketplace
~~~

For a new deployment, publish only on Testnet with the funded deployer:

~~~sh
sui client publish --gas-budget 100000000 move/workflow_marketplace
~~~

Record only the public package ID, published transaction digest, and the
admin-cap object ID from the CLI result. The package "init" creates one
"MarketplaceAdminCap"; the reviewed deployment owner must consume it once to
create the shared Marketplace with the executor's public key. The repository
does not ship an unreviewed generic "sui client call" bootstrap script for
"create_marketplace", "create_workflow_root", or "publish_release"; use the
parent-approved transaction builder/deployment procedure for those calls.

Before putting new IDs in ".env", verify that Marketplace is shared and has
the published package type and matching executor key, WorkflowRoot is owned by
the creator, and WorkflowRelease is shared, belongs to the exact root, is
active, uses "google_news_rss/v1", and records the Walrus blob and both
32-byte hashes. For this runbook's known-good evidence, use the public IDs
above instead of republishing.

## Prepare and upload the encrypted workflow

Create two local JSON files that satisfy the frozen schemas. Keep both files
outside version control and do not paste their contents into logs:

- The public manifest has schema "public-manifest/v1", version "1.0.1",
  workflow type "google_news_rss/v1", a strict query input, and the four output
  fields.
- The private bundle has schema "google_news_rss/v1", the HTTPS Google News RSS
  endpoint, Korean "hl=ko", "gl=KR", "ceid=KR:ko", a 24-hour window, at most
  10 results, a bounded timeout, and
  "normalized_title_and_source" deduplication.

Run the root upload script with its exact argument names:

~~~sh
corepack pnpm upload:walrus -- \
  --root-id=0x0378baa3b7aade01a7c0f046f5fb02893afc17ee97ef795dc4aca9c3a10a6f54 \
  --version=1.0.1 \
  --public-manifest=<local-public-manifest.json> \
  --private-bundle=<local-private-bundle.json>
~~~

The script validates the environment, encrypts locally, stores the DEK in the
ignored local keyring, uploads to the configured publisher, retries bounded
aggregator reads, and compares retrieved bytes with the uploaded envelope.
Save only its public "walrus.blobId", "publicManifestHash",
"encryptedBundleHash", and "keyId". It does not publish the Sui release. The
release publication must record those exact values under the exact root.

If the known-good release is used, verify that its Walrus blob is
"RxMcj6lClRuLq2nwiCh7jK9sRENDYG3rRMaB-vBiDvA" before starting the executor.

## Start the local services

Use separate terminals, all from the repository root. Start the executor
first; it validates Testnet-only environment configuration and binds to
loopback:

~~~sh
corepack pnpm dev:executor
~~~

In a second terminal start the web app:

~~~sh
corepack pnpm dev:web
~~~

Open http://127.0.0.1:5173/app. The live page must show a top-right wallet
button, "Live · Testnet", "Local server", "Nautilus: Not implemented", and
"TEE attestation: Disabled". There is no browser-side DEK, decrypted bundle,
executor private key, or workflow-code execution.

## Run the clean-wallet journey

Use a fresh Testnet wallet that does not already own a LicensePass for the
configured release. If using the known evidence wallet, the existing
LicensePass may be found immediately and the purchase step will be skipped.

1. Connect the wallet with the top-right button. The first card must remain
   "LicensePass" while Marketplace and WorkflowRelease BCS are loaded.
2. Confirm the UI finds the exact address-owned LicensePass for the configured
   release. If none exists, approve the frozen exact-price "purchase_license"
   transaction. The UI must not show purchase success until the exact pass is
   found again on Testnet.
3. Enter a focused query such as "Sui 블록체인". The browser requests a fresh
   challenge, decodes the returned base64 bytes, signs exactly those bytes on
   Testnet, verifies the wallet-returned bytes, and submits only the challenge
   ID plus wallet signature.
4. Wait for the report. It must show latest-first items, count, input/output
   hashes, and execution trace only after the executor receipt is independently
   verified against the on-chain Marketplace key and exact runner, release, and
   LicensePass.
5. Open "Receipt 확인하기". The modal shows a payload preview and executor key
   fingerprint, never the raw signature or public-key bytes. Choose
   "Record Receipt" and approve the transaction.
6. Treat receipt success as valid only when the exact address-owned
   "ExecutionReceipt" matching release, LicensePass, runner, Marketplace, and
   nonce is discoverable. Explorer links appear only when they come from real
   transaction/object data and configured public explorer metadata.

With the known evidence wallet, the expected public objects are the
LicensePass and ExecutionReceipt in the table above. A clean wallet produces
new IDs; record those IDs and transaction digests as public evidence only.

## Optional automated Testnet regression

After the executor is running and ".env" contains the local deployer signer,
run the repository's end-to-end script:

~~~sh
corepack pnpm --filter @aiwf/executor e2e:testnet
~~~

It exercises the real Testnet/Walrus-backed executor path, including
unlicensed rejection, purchase or reuse, duplicate-purchase rejection,
challenge execution, replay rejection, receipt signature verification,
tampered-receipt rejection, receipt recording, and nonce replay rejection.
The current Sui SDK may reject a transaction during Move-call resolution before
submission when the abort is already deterministic. In that case the script
reports `resolution-rejected`; the matching Move unit test supplies the stable
abort-code regression proof, and no failed transaction digest exists.
Its JSON output contains public IDs, hashes, a key fingerprint, and trace
metadata; do not redirect private environment values into the output.
Before it loads objects or signs any transaction, it also requires a strict
credential-free HTTPS RPC URL and verifies the RPC-reported Sui Testnet chain
identifier. Sui gRPC reports the full base58 genesis digest
`69WiPg3DAQiwdxfncX6wYQ2siKwAe6L9BZthQea3JNMD`; its short CLI and
`Published.toml` identifier is `4c78adac`.

## Recovery guide

| Symptom | Safe recovery |
| --- | --- |
| RSS timeout or Google News timeout | Confirm the executor is running, keep the bounded timeout, and submit a fresh query. Do not crawl linked articles or disable the timeout. |
| RSS upstream or Walrus fetch failure | Check the configured HTTPS aggregator/publisher and Testnet availability, then retry. Do not bypass byte limits or integrity checks. |
| Bundle hash mismatch | Stop. Recheck the release blob ID and encrypted bundle hash against upload output; never decrypt or substitute a different blob. |
| Stale package, Marketplace, root, release, or blob ID | Stop the executor/UI, verify object package/type/owner/identity, and update all related public IDs together. Partial IDs produce configuration error, not fixture success. |
| Wrong wallet network | Switch the wallet to Sui Testnet, keep both network variables set to testnet, then reload "/app". |
| Lost local executor | Restart the executor command; the browser must show a typed unavailable/timeout error and must not simulate a report. |
| Challenge expired | Submit the query again for a new challenge. Never reuse an expired challenge or signature. |
| Receipt object not found after a successful transaction | Wait briefly for Testnet indexing and retry the exact lookup. Do not claim receipt success from a digest alone. |

For a deliberate offline presentation fallback, remove all three public object
IDs ("VITE_SUI_PACKAGE_ID", "VITE_MARKETPLACE_ID", and
"VITE_WORKFLOW_RELEASE_ID") from the local ".env", leave other public defaults
intact, and restart the web dev server. The page must visibly say "Fixture
mode"; it must not show real IDs, claim a live success, or make live
Sui/Walrus/executor calls. A partial or malformed set of IDs is
"configuration_error" with disabled actions, not a silent fallback.

## Evidence checklist for the recorded run

- [x] "sui move build" and "sui move test" passed for
  "move/workflow_marketplace".
- [x] Package, Marketplace, WorkflowRoot, WorkflowRelease, and Walrus blob were
  checked on Testnet.
- [x] Executor key fingerprint matches the on-chain Marketplace key.
- [x] Executor and web services ran on loopback with Testnet configuration.
- [x] A funded Testnet wallet purchased the exact release LicensePass.
- [x] The report returned seven latest-first results, hashes, and trace.
- [x] Receipt BCS/signature/key/identity checks passed before recording.
- [x] Exact LicensePass and exact ExecutionReceipt objects were found after
  their transactions.
- [x] Only public IDs, hashes, digests, and key fingerprint were recorded.
- [x] No private key, DEK, raw signature, decrypted bundle, or private bundle
  content was written to the repository or evidence.

The full public transaction/object record and all 24 P0 checks are mapped in
`docs/phase-6-evidence.md`.
