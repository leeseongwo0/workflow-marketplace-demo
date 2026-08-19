# Phase 5 web integration

Phase 5 keeps the presentation flow intentionally small: connect a Testnet wallet, obtain the configured `LicensePass`, enter one Google News query, view the report, and inspect or record its receipt. The landing page remains informational; `/app` is the functional surface.

## Operating modes

- `live`: enabled only when the package, canonical `Marketplace`, and `WorkflowRelease` IDs are all present and valid. The network is fixed to Sui Testnet and the executor URL must resolve to loopback.
- `fixture`: enabled only when all three published-object IDs are absent. Results and success states are explicitly labeled as fixtures and make no live calls.
- `configuration_error`: used for partial or malformed live configuration. Actions remain disabled instead of silently falling back to fixture behavior.

## Live state sequence

1. Load the configured shared `Marketplace` and `WorkflowRelease` from their BCS bytes and reject unexpected package types, owners, IDs, workflow types, or executor keys.
2. Look for an exact address-owned `LicensePass` for the connected wallet and configured release.
3. If absent, submit the fixed `purchase_license` transaction with the exact positive `price_mist`; show success only after the exact pass is discoverable from Testnet.
4. Request a local executor challenge, strictly parse and canonically re-encode its `AIWF_EXECUTION_REQUEST_V1` payload, and require exact domain, challenge, runner, release, license, normalized-query hash, nonce, and bounded timestamps before asking the connected wallet to sign those exact personal-message bytes.
5. Submit only the challenge ID and wallet signature. Validate the strict response before rendering the report.
6. Independently recompute SHA-256 over canonical normalized input and displayed result items, then require both hashes to match the response and signed receipt. Re-encode the receipt payload with the shared Move-compatible BCS contract, compare it with the returned signed bytes, require the executor key to equal the current on-chain `Marketplace` key, and verify its raw Ed25519 signature.
7. Build `record_execution` only from that locally verified receipt. Show an on-chain receipt success only after the exact address-owned object is discoverable.

## Security boundaries

- No private key, decrypted workflow bundle, DEK, or executor secret enters the browser.
- The browser never executes workflow-supplied code and never crawls linked article pages.
- Wallet signatures, executor signatures, and full environment objects are not logged.
- A server response cannot choose the package, marketplace, release, license, runner, price, or executor public key used by a transaction.
- Phase 5 is offline/fixture acceptance only. Real Sui Testnet, Walrus Testnet, and Google News evidence belongs to Phase 6.
