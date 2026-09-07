module workflow_marketplace::license {
    use sui::clock::Clock;

    const ELicenseExpired: u64 = 0;
    const ENoRunsRemaining: u64 = 1;
    const EForkPermitExpired: u64 = 2;

    public struct LicensePass has key, store {
        id: UID,
        release_id: ID,
        owner: address,
        remaining_runs: Option<u64>,
        expires_at: Option<u64>,
    }

    public struct ForkPermit has key, store {
        id: UID,
        release_id: ID,
        owner: address,
        expires_at: Option<u64>,
    }

    // ── package-internal issuers (called from marketplace) ──

    public(package) fun issue_license_pass(
        release_id: ID,
        recipient: address,
        remaining_runs: Option<u64>,
        expires_at: Option<u64>,
        ctx: &mut TxContext,
    ): LicensePass {
        LicensePass {
            id: object::new(ctx),
            release_id,
            owner: recipient,
            remaining_runs,
            expires_at,
        }
    }

    public(package) fun issue_fork_permit(
        release_id: ID,
        recipient: address,
        expires_at: Option<u64>,
        ctx: &mut TxContext,
    ): ForkPermit {
        ForkPermit {
            id: object::new(ctx),
            release_id,
            owner: recipient,
            expires_at,
        }
    }

    // ── package-internal destructors (called from marketplace for refunds) ──

    public(package) fun destroy_license_pass(pass: LicensePass): address {
        let LicensePass { id, release_id: _, owner, remaining_runs: _, expires_at: _ } = pass;
        object::delete(id);
        owner
    }

    public(package) fun destroy_fork_permit(permit: ForkPermit): address {
        let ForkPermit { id, release_id: _, owner, expires_at: _ } = permit;
        object::delete(id);
        owner
    }

    // ── public self-revoke (holder burns their own pass/permit) ──

    public fun burn_license_pass(pass: LicensePass) {
        let LicensePass { id, release_id: _, owner: _, remaining_runs: _, expires_at: _ } = pass;
        object::delete(id);
    }

    public fun burn_fork_permit(permit: ForkPermit) {
        let ForkPermit { id, release_id: _, owner: _, expires_at: _ } = permit;
        object::delete(id);
    }

    // ── public validators ──

    public fun assert_license_valid(pass: &LicensePass, clock: &Clock) {
        if (pass.expires_at.is_some()) {
            assert!(clock.timestamp_ms() < *pass.expires_at.borrow(), ELicenseExpired);
        };
        if (pass.remaining_runs.is_some()) {
            assert!(*pass.remaining_runs.borrow() > 0, ENoRunsRemaining);
        };
    }

    public fun consume_run(pass: &mut LicensePass) {
        if (pass.remaining_runs.is_some()) {
            let runs = *pass.remaining_runs.borrow();
            assert!(runs > 0, ENoRunsRemaining);
            pass.remaining_runs = option::some(runs - 1);
        };
    }

    public fun assert_fork_permit_valid(permit: &ForkPermit, clock: &Clock) {
        if (permit.expires_at.is_some()) {
            assert!(clock.timestamp_ms() < *permit.expires_at.borrow(), EForkPermitExpired);
        };
    }

    // ── accessors ──

    public fun license_release_id(pass: &LicensePass): ID { pass.release_id }
    public fun license_owner(pass: &LicensePass): address { pass.owner }
    public fun fork_permit_release_id(permit: &ForkPermit): ID { permit.release_id }
    public fun fork_permit_owner(permit: &ForkPermit): address { permit.owner }
}
