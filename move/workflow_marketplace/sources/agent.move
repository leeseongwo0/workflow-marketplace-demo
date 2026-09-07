module workflow_marketplace::agent {
    use std::string::String;
    use sui::clock::Clock;

    const ERoyaltyTooHigh: u64 = 0;

    public struct AgentProfile has key, store {
        id: UID,
        owner: address,
        name: String,
        created_at: u64,
    }

    public struct WorkflowRoot has key, store {
        id: UID,
        agent_id: ID,
        name: String,
        description: String,
        created_at: u64,
    }

    public struct WorkflowRelease has key, store {
        id: UID,
        root_id: ID,
        parent_release_id: Option<ID>,
        version: String,
        blob_id: String,
        price_license: u64,
        price_fork: u64,
        royalty_bps: u64,
        is_listed: bool,
        created_at: u64,
    }

    // ── public functions ──

    public fun create_agent_profile(
        name: String,
        clock: &Clock,
        ctx: &mut TxContext,
    ): AgentProfile {
        AgentProfile {
            id: object::new(ctx),
            owner: ctx.sender(),
            name,
            created_at: clock.timestamp_ms(),
        }
    }

    public fun create_workflow_root(
        profile: &AgentProfile,
        name: String,
        description: String,
        clock: &Clock,
        ctx: &mut TxContext,
    ): WorkflowRoot {
        WorkflowRoot {
            id: object::new(ctx),
            agent_id: object::id(profile),
            name,
            description,
            created_at: clock.timestamp_ms(),
        }
    }

    public fun create_workflow_release(
        root: &WorkflowRoot,
        parent_release_id: Option<ID>,
        version: String,
        blob_id: String,
        price_license: u64,
        price_fork: u64,
        royalty_bps: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): WorkflowRelease {
        assert!(royalty_bps <= 5000, ERoyaltyTooHigh);
        WorkflowRelease {
            id: object::new(ctx),
            root_id: object::id(root),
            parent_release_id,
            version,
            blob_id,
            price_license,
            price_fork,
            royalty_bps,
            is_listed: true,
            created_at: clock.timestamp_ms(),
        }
    }

    public fun set_listed(
        release: &mut WorkflowRelease,
        listed: bool,
        _ctx: &TxContext,
    ) {
        release.is_listed = listed;
    }

    public fun set_blob_id(release: &mut WorkflowRelease, blob_id: String) {
        release.blob_id = blob_id;
    }

    // ── accessors (cross-module reads) ──

    public fun release_root_id(release: &WorkflowRelease): ID { release.root_id }
    public fun release_parent_id(release: &WorkflowRelease): Option<ID> { release.parent_release_id }
    public fun release_blob_id(release: &WorkflowRelease): String { release.blob_id }
    public fun release_price_license(release: &WorkflowRelease): u64 { release.price_license }
    public fun release_price_fork(release: &WorkflowRelease): u64 { release.price_fork }
    public fun release_royalty_bps(release: &WorkflowRelease): u64 { release.royalty_bps }
    public fun release_is_listed(release: &WorkflowRelease): bool { release.is_listed }

    // ── package-internal constructor for fork releases ──

    public(package) fun create_fork_release(
        root_id: ID,
        parent_release_id: Option<ID>,
        version: String,
        blob_id: String,
        price_license: u64,
        price_fork: u64,
        royalty_bps: u64,
        clock: &Clock,
        ctx: &mut TxContext,
    ): WorkflowRelease {
        assert!(royalty_bps <= 5000, ERoyaltyTooHigh);
        WorkflowRelease {
            id: object::new(ctx),
            root_id,
            parent_release_id,
            version,
            blob_id,
            price_license,
            price_fork,
            royalty_bps,
            is_listed: false,
            created_at: clock.timestamp_ms(),
        }
    }
}
