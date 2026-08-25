# Phase 6 Testnet evidence

Date: 2026-08-19 (Asia/Seoul)

> 이 문서는 2026-08-19에 완료한 `1.0.0` 실행의 역사적 증거입니다.
> 당시 Walrus blob은 이후 만료되었습니다. 현재 팀 데모는 2026-08-25에
> 복구한 `1.0.1` release를 사용하며 최신 공개 ID는 `docs/demo-runbook.md`를
> 기준으로 합니다.

## Current demo recovery

- WorkflowRelease: `0x2a8560b9fc657f7e9ee280897a7f3f06fe9f53b271761d2bf0c36f7d29bfa523`
- Walrus blob: `RxMcj6lClRuLq2nwiCh7jK9sRENDYG3rRMaB-vBiDvA`
- Storage duration: 53 Testnet epochs
- Recovery check: wallet signature, license, Walrus integrity, decrypt, live RSS,
  result hash, and executor receipt signature all passed; 10 results were returned.

Scope: Sui Testnet, Walrus Testnet, the loopback-only local executor, and the
live `/app` path. Secret values, wallet signatures, decrypted bundle bytes, and
the local DEK are intentionally omitted.

## Public deployment

| Item | Public evidence |
| --- | --- |
| Package | `0x19fe5223d0045492ba45d88b5e9fc9d0be4bf05cd6def862c5faef10c6ed0124` (`Go62WuJqgnHRY4kxBj1yfMJdq5HuY6mMj9nVhZynw7xW`) |
| Marketplace | `0x8fc737d7538ba4db1507ec6728e8ff8a0ac9bf2cb7024e8697db0673431e7af8` (`2fcYT48rij8jPKUBkWyDi2f3WmsL4BfM4gWmtUEqcHx9`) |
| WorkflowRoot | `0x0378baa3b7aade01a7c0f046f5fb02893afc17ee97ef795dc4aca9c3a10a6f54` (`FQJnukPx3u24vmiZ5HuBomisV8PXgWaXESiWauqc14m4`) |
| WorkflowRelease | `0x44fef191572b5708684968c07a23acb18adee0e75f91e046e183263c0ef5e279` (`9AV2g2HbkEM76q3BjSM4MBcYBFWjmijZZYfJeSZd7dwr`) |
| Walrus blob | `KVPBG4K9JOrx6nI-AwmmIGB5YZzgm9LpdPdpxBqu6dY` |
| Envelope SHA-256 | `5ed861a0199ed06a05eb38db057b8ba5e46661cbbbb649ba52a3318272ced321` |
| Public manifest SHA-256 | `8b3f6c9c67f34b004c08580ead5f1654da43ab6c6c41546523fc0a05b4bdb200` |
| LicensePass | `0x75025979c2959b0650380133b192bb2e5751c0234f11d08522bf42758a130883` (`5iAu48mcusuTHCxczyyMFfMVivRDHYLxvwP2y31XNmZM`) |
| ExecutionReceipt | `0x8555af6ace69b25399ddd37af749cd3e8934c7b8ac5fcbcf42db8df9d2aecec5` (`9tpch5K78PNQW6Xbr97X7TxRQkTaoYyNB4EaFqVyg7TK`) |
| Runner/owner | `0xa801b9cff1d47161d9dfcb2e742617d38a6adbaa7c123f34edd2a5a8469344e3` |
| Executor key fingerprint | `a68e993e07c7778c` |
| Testnet genesis digest | `69WiPg3DAQiwdxfncX6wYQ2siKwAe6L9BZthQea3JNMD` (short ID `4c78adac`) |

The independently queried receipt is address-owned by the runner and binds the
exact Marketplace, release, and LicensePass above. Its input hash is
`82c471a8c7cde791abcb14138cf80106dd799b6033b87c456309d754a20fd791` and
its output hash is
`5e65f122e7b4721bfa0fa9be42e5367f3b040d53efcaa26d796265a62cbb4897`.

The Walrus aggregator returned the exact 853 uploaded bytes. The decoded JSON
contained only the AES-256-GCM envelope fields `aadBase64`, `cipher`,
`ciphertextBase64`, `envelopeVersion`, `keyId`, `nonceBase64`, and `tagBase64`;
neither the Google News endpoint nor private deduplication policy appeared as
plaintext.

## P0 acceptance map

| # | Status | Evidence |
| --- | --- | --- |
| 1 | Live | The executor and web adapters loaded the real shared WorkflowRelease above from Sui Testnet. |
| 2 | Live | The Walrus bytes matched the release hash and contained only the encrypted envelope fields described above. |
| 3 | Deterministic UI proof | Disconnected live-mode actions are disabled and covered by web state/transaction tests. |
| 4 | Deterministic UI proof | The live configuration and action guards accept Testnet only; wrong-network states are covered offline. |
| 5 | Live | A signed challenge using an unknown pass returned `LICENSE_NOT_FOUND`. |
| 6 | Live | Transaction `5iAu48mcusuTHCxczyyMFfMVivRDHYLxvwP2y31XNmZM` minted the exact owned LicensePass. |
| 7 | Live VM resolution + Move regression | A duplicate purchase was rejected with Move abort 4 before submission; the 20-test Move suite fixes the invariant and abort code. |
| 8 | Live | The local executor verified a real wallet-signed, expiring personal-message challenge. |
| 9 | Live | Reusing the same challenge returned `CHALLENGE_ALREADY_USED`. |
| 10 | Live | Execution loaded the current pass owner and exact release before key access. |
| 11 | Deterministic security proof | Byte/hash and authenticated-decryption tampering tests return `BUNDLE_HASH_MISMATCH` or decryption failure. The shared live blob was not destructively altered. |
| 12 | Code boundary + response inspection | Browser DTOs contain neither DEKs nor decrypted bundles; the live response contained results, trace, and receipt data only. |
| 13 | Live + deterministic | The live RSS path ran through the server handler; URL tests assert exactly one server-appended `when:1d`. |
| 14 | Deterministic | Frozen-clock tests include the exact 24-hour boundary, older items, invalid dates, and future skew. |
| 15 | Live + deterministic | The live query returned seven newest-first items; fixture tests prove deduplication and the ten-item cap. |
| 16 | Live | Independent canonical JSON hashing reproduced both displayed input and output hashes. |
| 17 | Live | The executor returned BCS bytes with a raw Ed25519 signature that verified against the Marketplace key. |
| 18 | Live VM resolution + Move regression | A bit-flipped signature was rejected with Move abort 7 before submission; modified-message and invalid-signature Move tests also pass. |
| 19 | Live | Transaction `9tpch5K78PNQW6Xbr97X7TxRQkTaoYyNB4EaFqVyg7TK` minted the independently discovered receipt above. |
| 20 | Live VM resolution + Move regression | Reusing the receipt nonce was rejected with Move abort 8 before submission; the Move replay test also passes. |
| 21 | Live UI | `/app` displays `Execution mode: Local server`, `Nautilus: Not implemented`, and `TEE attestation: Disabled`. |
| 22 | Verified locally | Strict workspace typecheck/tests, web build, and Move build/test commands are rerun at final acceptance. |
| 23 | Documented | `docs/demo-runbook.md` contains prerequisites, environment, funding, publish/upload/start/journey commands, recovery, known IDs, and a visibly labeled fixture fallback. |
| 24 | Verified boundary | `.env` and `data/local-keyring.json` are ignored; live scripts print only public IDs, hashes, digests, counts, traces, and a key fingerprint. Final tracked-file scans are rerun before commit. |

For duplicate purchase, invalid executor signature, and nonce replay, the Sui
SDK resolved the Move abort before submitting a transaction, so no failed
transaction digest exists. This is recorded as `resolution-rejected`, not as a
fabricated on-chain digest. The actual successful purchase and receipt have the
public digests shown above.

## Live trace

The successful executor response contained this exact ordered trace:

1. `WALLET_SIGNATURE_VERIFIED`
2. `LICENSE_VERIFIED`
3. `WALRUS_BLOB_VERIFIED`
4. `BUNDLE_DECRYPTED_LOCAL_SERVER`
5. `RSS_FETCHED`
6. `RESULT_SIGNED`

This proves the P0 local-server path only. Nautilus and TEE attestation are not
implemented, and Seal remains optional Phase 7 work.
