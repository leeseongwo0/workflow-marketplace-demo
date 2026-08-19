# Phase 4 security design

This phase adds one local API path for the frozen `google_news_rss/v1`
workflow. It remains a local-server trust model, not a TEE.

## Wallet challenge

- The signed bytes are canonical UTF-8 JSON with domain
  `AIWF_EXECUTION_REQUEST_V1`.
- Addresses are normalized to 32-byte Sui hex strings. The normalized query is
  kept server-side; the message contains only its SHA-256 hash.
- Each challenge has a random UUID, 32-byte random nonce, and expiry of at most
  five minutes.
- The wallet signature is verified with Sui's personal-message intent and must
  derive the runner address in the challenge.
- Invalid signatures do not consume a challenge. After a valid signature, a
  synchronous compare-and-set consumes it before any Sui, Walrus, key, or RSS
  adapter runs. Later failures require a new challenge.

## On-chain authorization

- Only `LicensePass` and `WorkflowRelease` types from the configured package are
  accepted.
- The exact LicensePass object ID, address owner, and embedded release ID must
  match the challenge.
- Release metadata is read from BCS bytes, not trusted display data. The object
  must be the requested shared release and must still be active.
- The license check and release read happen before Walrus download and DEK
  access.

## Local execution and receipt

- Downloaded encrypted bytes are checked against the release hash before JSON
  parsing or decryption.
- AAD is reconstructed from on-chain root, version, and manifest hash. Only the
  strict `google_news_rss/v1` bundle is dispatched; no supplied code is run.
- The result hash is SHA-256 over canonical `{items}` output bytes.
- Each receipt gets a new 32-byte random nonce hash and uses the frozen Move BCS
  layout. The executor signs those raw BCS bytes with its separate Ed25519 key.
- Responses may expose the executor public key and signature, but never the
  private key, DEK, decrypted bundle, environment, stack, or error cause.

## Offline acceptance

Integration tests replace Sui, Walrus, and RSS with deterministic fakes. They
must cover wrong wallets, expired and replayed challenges, authorization
failure, bundle-hash failure, and a valid independently verified receipt. Live
Testnet and Walrus validation remains Phase 6.
