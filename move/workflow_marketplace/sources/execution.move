module workflow_marketplace::execution {
    use sui::clock::Clock;
    use sui::event;
    use std::bcs;
    use workflow_marketplace::license::{Self, LicensePass};
    use workflow_marketplace::agent::WorkflowRelease;

    const EReleaseMismatch: u64 = 0;
    const ESealIdentityMismatch: u64 = 1;

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

    /// Seal key-server verification gate.
    /// Key servers simulate a PTB containing this call;
    /// success means the caller may receive decryption shares.
    public fun seal_approve(
        id: vector<u8>,
        pass: &LicensePass,
        release: &WorkflowRelease,
        clock: &Clock,
    ) {
        let expected = bcs::to_bytes(&object::id(release));
        assert!(id == expected, ESealIdentityMismatch);
        assert!(license::license_release_id(pass) == object::id(release), EReleaseMismatch);
        license::assert_license_valid(pass, clock);
    }

    /// Validates license, consumes one run, mints an ExecutionReceipt,
    /// and emits an ExecutionEvent.
    public fun record_execution(
        pass: &mut LicensePass,
        release: &WorkflowRelease,
        clock: &Clock,
        ctx: &mut TxContext,
    ): ExecutionReceipt {
        let release_id = object::id(release);
        assert!(license::license_release_id(pass) == release_id, EReleaseMismatch);
        license::assert_license_valid(pass, clock);
        license::consume_run(pass);

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
