# Phase 2 Move design

This document freezes the initial on-chain boundaries for `workflow_marketplace` before TypeScript transaction wiring.

## Ownership

- `Marketplace` is shared because license uniqueness and used receipt nonces must be globally serialized on-chain.
- `WorkflowRoot` is creator-owned and has no `store` ability, so outside modules cannot transfer it.
- `WorkflowRelease` is shared public metadata. Its active flag can change only when the creator-owned root is supplied.
- `LicensePass` and `ExecutionReceipt` are address-owned and intentionally omit `store`; only this module can transfer them.

## Purchase invariants

- A release must be active.
- Payment must equal `price_mist` exactly; overpayment and underpayment both abort.
- The entire payment coin is transferred directly to the release creator.
- `(release_id, buyer)` is stored in `Marketplace.license_registry` before the pass is transferred.
- A buyer can own at most one P0 pass for a release.

## Receipt invariants

- The transaction sender must equal the signed runner and must supply the owned `LicensePass`.
- The pass release must equal the signed release.
- Input hash, output hash, and nonce hash are exactly 32 bytes.
- The executor signs BCS bytes for `ReceiptMessage` in its declared field order with domain `AIWF_RECEIPT_V1`.
- The registered 32-byte Ed25519 public key verifies the signature.
- A nonce is inserted only after every validation succeeds, and a used nonce aborts.
- Raw queries, RSS content, and result URLs are never stored on-chain.

## Deliberate limits

- Payment uses an exact-price rule; there is no change-making path.
- The package supports only `google_news_rss/v1`.
- Forks, royalties, transferable licenses, Nautilus, TEE, and Seal policy are not implemented.
- The deployment wallet key is separate from the executor receipt-signing key.
