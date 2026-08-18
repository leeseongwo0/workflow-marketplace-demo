module workflow_marketplace::marketplace;

use std::bcs;
use std::option::{Self, Option};
use std::string::{Self, String};
use sui::clock::Clock;
use sui::coin::Coin;
use sui::ed25519;
use sui::sui::SUI;
use sui::table::{Self, Table};

const E_NOT_ADMIN: u64 = 0;
const E_NOT_CREATOR: u64 = 1;
const E_RELEASE_INACTIVE: u64 = 2;
const E_WRONG_PAYMENT: u64 = 3;
const E_DUPLICATE_LICENSE: u64 = 4;
const E_WRONG_RUNNER: u64 = 5;
const E_LICENSE_RELEASE_MISMATCH: u64 = 6;
const E_INVALID_SIGNATURE: u64 = 7;
const E_RECEIPT_REPLAY: u64 = 8;
const E_INVALID_HASH_LENGTH: u64 = 9;
const E_INVALID_EXECUTOR_KEY: u64 = 10;
const E_INVALID_RELEASE: u64 = 11;

const HASH_LENGTH: u64 = 32;
const ED25519_PUBLIC_KEY_LENGTH: u64 = 32;

/// The one P0 workflow handler supported by this package.
const GOOGLE_NEWS_WORKFLOW_TYPE: vector<u8> = b"google_news_rss/v1";

/// Shared state that enforces global license uniqueness and receipt replay protection.
public struct Marketplace has key {
    id: UID,
    admin: address,
    executor_public_key: vector<u8>,
    used_receipt_nonces: Table<vector<u8>, bool>,
    license_registry: Table<LicenseKey, ID>,
}

public struct LicenseKey has copy, drop, store {
    release_id: ID,
    owner: address,
}

/// Creator-owned root. Without `store`, outside modules cannot transfer it.
public struct WorkflowRoot has key {
    id: UID,
    creator: address,
    name: String,
    slug_hash: vector<u8>,
    latest_release_id: Option<ID>,
    created_at_ms: u64,
}

/// Public shared metadata for a versioned encrypted workflow bundle.
public struct WorkflowRelease has key {
    id: UID,
    root_id: ID,
    creator: address,
    version_major: u64,
    version_minor: u64,
    version_patch: u64,
    title: String,
    description: String,
    workflow_type: String,
    walrus_blob_id: String,
    encrypted_bundle_hash: vector<u8>,
    public_manifest_hash: vector<u8>,
    key_id: String,
    price_mist: u64,
    parent_release_id: Option<ID>,
    active: bool,
    created_at_ms: u64,
}

/// Address-owned and intentionally non-transferable outside this module.
public struct LicensePass has key {
    id: UID,
    release_id: ID,
    issued_at_ms: u64,
}

/// Address-owned proof of one accepted executor-signed result.
public struct ExecutionReceipt has key {
    id: UID,
    release_id: ID,
    license_id: ID,
    runner: address,
    input_hash: vector<u8>,
    output_hash: vector<u8>,
    executor_id: ID,
    executed_at_ms: u64,
    nonce_hash: vector<u8>,
}

/// This layout is the cross-language BCS contract. Field order and types are frozen.
public struct ReceiptMessage has copy, drop {
    domain: vector<u8>,
    release_id: address,
    license_id: address,
    runner: address,
    input_hash: vector<u8>,
    output_hash: vector<u8>,
    executed_at_ms: u64,
    nonce_hash: vector<u8>,
}

public fun create_marketplace(executor_public_key: vector<u8>, ctx: &mut TxContext) {
    assert!(executor_public_key.length() == ED25519_PUBLIC_KEY_LENGTH, E_INVALID_EXECUTOR_KEY);
    let marketplace = Marketplace {
        id: object::new(ctx),
        admin: ctx.sender(),
        executor_public_key,
        used_receipt_nonces: table::new(ctx),
        license_registry: table::new(ctx),
    };
    transfer::share_object(marketplace);
}

public fun create_workflow_root(
    name: vector<u8>,
    slug_hash: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(slug_hash.length() == HASH_LENGTH, E_INVALID_HASH_LENGTH);
    let creator = ctx.sender();
    let root = WorkflowRoot {
        id: object::new(ctx),
        creator,
        name: string::utf8(name),
        slug_hash,
        latest_release_id: option::none(),
        created_at_ms: clock.timestamp_ms(),
    };
    transfer::transfer(root, creator);
}

#[allow(lint(share_owned))]
public fun publish_release(
    root: &mut WorkflowRoot,
    version_major: u64,
    version_minor: u64,
    version_patch: u64,
    title: vector<u8>,
    description: vector<u8>,
    workflow_type: vector<u8>,
    walrus_blob_id: vector<u8>,
    encrypted_bundle_hash: vector<u8>,
    public_manifest_hash: vector<u8>,
    key_id: vector<u8>,
    price_mist: u64,
    active: bool,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let sender = ctx.sender();
    assert!(sender == root.creator, E_NOT_CREATOR);
    assert!(workflow_type == GOOGLE_NEWS_WORKFLOW_TYPE, E_INVALID_RELEASE);
    assert!(walrus_blob_id.length() > 0, E_INVALID_RELEASE);
    assert!(key_id.length() > 0, E_INVALID_RELEASE);
    assert!(encrypted_bundle_hash.length() == HASH_LENGTH, E_INVALID_HASH_LENGTH);
    assert!(public_manifest_hash.length() == HASH_LENGTH, E_INVALID_HASH_LENGTH);

    let release = WorkflowRelease {
        id: object::new(ctx),
        root_id: object::id(root),
        creator: sender,
        version_major,
        version_minor,
        version_patch,
        title: string::utf8(title),
        description: string::utf8(description),
        workflow_type: string::utf8(workflow_type),
        walrus_blob_id: string::utf8(walrus_blob_id),
        encrypted_bundle_hash,
        public_manifest_hash,
        key_id: string::utf8(key_id),
        price_mist,
        parent_release_id: root.latest_release_id,
        active,
        created_at_ms: clock.timestamp_ms(),
    };
    root.latest_release_id = option::some(object::id(&release));
    transfer::share_object(release);
}

public fun set_release_status(
    root: &WorkflowRoot,
    release: &mut WorkflowRelease,
    active: bool,
    ctx: &TxContext,
) {
    assert!(ctx.sender() == root.creator, E_NOT_CREATOR);
    assert!(release.root_id == object::id(root), E_INVALID_RELEASE);
    release.active = active;
}

public fun set_executor_public_key(
    marketplace: &mut Marketplace,
    executor_public_key: vector<u8>,
    ctx: &TxContext,
) {
    assert!(ctx.sender() == marketplace.admin, E_NOT_ADMIN);
    assert!(executor_public_key.length() == ED25519_PUBLIC_KEY_LENGTH, E_INVALID_EXECUTOR_KEY);
    marketplace.executor_public_key = executor_public_key;
}

public fun purchase_license(
    marketplace: &mut Marketplace,
    release: &WorkflowRelease,
    payment: Coin<SUI>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(release.active, E_RELEASE_INACTIVE);
    assert!(payment.value() == release.price_mist, E_WRONG_PAYMENT);

    let buyer = ctx.sender();
    let release_id = object::id(release);
    let key = LicenseKey { release_id, owner: buyer };
    assert!(!marketplace.license_registry.contains(key), E_DUPLICATE_LICENSE);

    let pass = LicensePass {
        id: object::new(ctx),
        release_id,
        issued_at_ms: clock.timestamp_ms(),
    };
    marketplace.license_registry.add(key, object::id(&pass));

    transfer::public_transfer(payment, release.creator);
    transfer::transfer(pass, buyer);
}

public fun record_execution(
    marketplace: &mut Marketplace,
    license: &LicensePass,
    release_id: address,
    runner: address,
    input_hash: vector<u8>,
    output_hash: vector<u8>,
    executed_at_ms: u64,
    nonce_hash: vector<u8>,
    signature: vector<u8>,
    ctx: &mut TxContext,
) {
    assert!(runner == ctx.sender(), E_WRONG_RUNNER);
    assert!(license.release_id.to_address() == release_id, E_LICENSE_RELEASE_MISMATCH);
    assert!(input_hash.length() == HASH_LENGTH, E_INVALID_HASH_LENGTH);
    assert!(output_hash.length() == HASH_LENGTH, E_INVALID_HASH_LENGTH);
    assert!(nonce_hash.length() == HASH_LENGTH, E_INVALID_HASH_LENGTH);
    assert!(!marketplace.used_receipt_nonces.contains(copy nonce_hash), E_RECEIPT_REPLAY);

    let license_id = object::id(license).to_address();
    let message = receipt_message_bytes(
        release_id,
        license_id,
        runner,
        copy input_hash,
        copy output_hash,
        executed_at_ms,
        copy nonce_hash,
    );
    assert!(
        ed25519::ed25519_verify(&signature, &marketplace.executor_public_key, &message),
        E_INVALID_SIGNATURE,
    );

    // The nonce is recorded only after every payload and signature check succeeds.
    marketplace.used_receipt_nonces.add(copy nonce_hash, true);
    let receipt = ExecutionReceipt {
        id: object::new(ctx),
        release_id: object::id_from_address(release_id),
        license_id: object::id(license),
        runner,
        input_hash,
        output_hash,
        executor_id: object::id(marketplace),
        executed_at_ms,
        nonce_hash,
    };
    transfer::transfer(receipt, runner);
}

public fun receipt_message_bytes(
    release_id: address,
    license_id: address,
    runner: address,
    input_hash: vector<u8>,
    output_hash: vector<u8>,
    executed_at_ms: u64,
    nonce_hash: vector<u8>,
): vector<u8> {
    bcs::to_bytes(&ReceiptMessage {
        domain: b"AIWF_RECEIPT_V1",
        release_id,
        license_id,
        runner,
        input_hash,
        output_hash,
        executed_at_ms,
        nonce_hash,
    })
}

public fun has_license(marketplace: &Marketplace, release_id: ID, owner: address): bool {
    marketplace.license_registry.contains(LicenseKey { release_id, owner })
}

public fun receipt_nonce_used(marketplace: &Marketplace, nonce_hash: vector<u8>): bool {
    marketplace.used_receipt_nonces.contains(nonce_hash)
}

public fun release_id(license: &LicensePass): ID { license.release_id }
public fun release_active(release: &WorkflowRelease): bool { release.active }
public fun release_price_mist(release: &WorkflowRelease): u64 { release.price_mist }
public fun release_creator(release: &WorkflowRelease): address { release.creator }
public fun latest_release_id(root: &WorkflowRoot): Option<ID> { root.latest_release_id }
public fun receipt_runner(receipt: &ExecutionReceipt): address { receipt.runner }
public fun receipt_nonce_hash(receipt: &ExecutionReceipt): &vector<u8> { &receipt.nonce_hash }
