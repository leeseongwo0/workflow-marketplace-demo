module workflow_marketplace::execution {
    use sui::clock::Clock;
    use sui::event;
    use std::bcs;
    use workflow_marketplace::license::{Self, LicensePass};
    use workflow_marketplace::agent::WorkflowRelease;
    use workflow_marketplace::enclave::{Self, Enclave};

    const EReleaseMismatch: u64 = 0;
    const ESealIdentityMismatch: u64 = 1;
    const ERequestReleaseMismatch: u64 = 2;
    const ERequestExpired: u64 = 3;
    const ERequestAlreadyClaimed: u64 = 4;

    const REQUEST_TTL_MS: u64 = 600_000;

    public struct WORKFLOW_MARKETPLACE has drop {}

    public fun init_enclave_config(ctx: &mut TxContext) {
        enclave::create_config(WORKFLOW_MARKETPLACE {}, ctx);
    }

    public struct ExecutionRequest has key {
        id: UID,
        license_id: ID,
        release_id: ID,
        runner: address,
        created_at: u64,
        expires_at: u64,
        claimed: bool,
    }

    public struct ExecutionRequestCreatedEvent has copy, drop {
        request_id: ID,
        license_id: ID,
        release_id: ID,
        runner: address,
        expires_at: u64,
    }

    public struct ExecutionReceipt has key, store {
        id: UID,
        release_id: ID,
        executor: address,
        executed_at: u64,
    }

    public struct ExecutionEvent has copy, drop {
        receipt_id: ID,
        release_id: ID,
        executor: address,
        executed_at: u64,
    }

    // ── ExecutionRequest ──

    public fun create_execution_request(
        pass: &LicensePass,
        release: &WorkflowRelease,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        let release_id = object::id(release);
        assert!(license::license_release_id(pass) == release_id, ERequestReleaseMismatch);
        license::assert_license_valid(pass, clock);

        let now = clock.timestamp_ms();
        let expires_at = now + REQUEST_TTL_MS;
        let runner = ctx.sender();
        let license_id = object::id(pass);

        let request = ExecutionRequest {
            id: object::new(ctx),
            license_id,
            release_id,
            runner,
            created_at: now,
            expires_at,
            claimed: false,
        };

        event::emit(ExecutionRequestCreatedEvent {
            request_id: object::id(&request),
            license_id,
            release_id,
            runner,
            expires_at,
        });

        transfer::share_object(request);
    }

    public fun assert_request_valid(request: &ExecutionRequest, clock: &Clock) {
        assert!(!request.claimed, ERequestAlreadyClaimed);
        assert!(clock.timestamp_ms() < request.expires_at, ERequestExpired);
    }

    public(package) fun claim_request(request: &mut ExecutionRequest) {
        assert!(!request.claimed, ERequestAlreadyClaimed);
        request.claimed = true;
    }

    public fun request_release_id(request: &ExecutionRequest): ID { request.release_id }
    public fun request_license_id(request: &ExecutionRequest): ID { request.license_id }
    public fun request_runner(request: &ExecutionRequest): address { request.runner }
    public fun request_claimed(request: &ExecutionRequest): bool { request.claimed }
    public fun request_expires_at(request: &ExecutionRequest): u64 { request.expires_at }

    /// Seal key-server verification gate.
    /// Key servers simulate a PTB containing this call;
    /// success means the caller may receive decryption shares.
    public fun seal_approve(
        id: vector<u8>,
        request: &ExecutionRequest,
        release: &WorkflowRelease,
        enclave: &Enclave<WORKFLOW_MARKETPLACE>,
        signature: vector<u8>,
        clock: &Clock,
    ) {
        assert_request_valid(request, clock);
        assert!(request.release_id == object::id(release), ERequestReleaseMismatch);
        let expected = bcs::to_bytes(&object::id(release));
        assert!(id == expected, ESealIdentityMismatch);
        enclave::verify_signature(enclave, &signature, &id);
    }

    #[test_only]
    public fun seal_approve_for_testing(
        id: vector<u8>,
        request: &ExecutionRequest,
        release: &WorkflowRelease,
        clock: &Clock,
    ) {
        assert_request_valid(request, clock);
        assert!(request.release_id == object::id(release), ERequestReleaseMismatch);
        let expected = bcs::to_bytes(&object::id(release));
        assert!(id == expected, ESealIdentityMismatch);
    }

    /// Validates license + request, consumes one run, claims the request,
    /// mints an ExecutionReceipt, and emits an ExecutionEvent.
    public fun record_execution(
        pass: &mut LicensePass,
        release: &WorkflowRelease,
        request: &mut ExecutionRequest,
        clock: &Clock,
        ctx: &mut TxContext,
    ): ExecutionReceipt {
        let release_id = object::id(release);
        assert!(license::license_release_id(pass) == release_id, EReleaseMismatch);
        assert!(request.release_id == release_id, ERequestReleaseMismatch);
        assert_request_valid(request, clock);
        license::assert_license_valid(pass, clock);
        license::consume_run(pass);
        claim_request(request);

        let executor = ctx.sender();
        let executed_at = clock.timestamp_ms();

        let receipt = ExecutionReceipt {
            id: object::new(ctx),
            release_id,
            executor,
            executed_at,
        };

        event::emit(ExecutionEvent {
            receipt_id: object::id(&receipt),
            release_id,
            executor,
            executed_at,
        });

        receipt
    }

    public fun receipt_release_id(receipt: &ExecutionReceipt): ID { receipt.release_id }
    public fun receipt_executor(receipt: &ExecutionReceipt): address { receipt.executor }
    public fun receipt_executed_at(receipt: &ExecutionReceipt): u64 { receipt.executed_at }
}
