#[allow(lint(self_transfer, unused_object_with_fields))]
module ai_marketplace::marketplace {
    use sui::sui::SUI;
    use sui::coin::{Self, Coin};
    use sui::balance::{Self, Balance};
    use sui::clock::Clock;
    use sui::event;
    use std::string::String;
    use ai_marketplace::agent::{Self, WorkflowRelease};
    use ai_marketplace::license::{Self, ForkPermit, LicensePass};

    const EInsufficientPayment: u64 = 0;
    const ENotVaultOwner: u64 = 1;
    const ENotListed: u64 = 2;
    const ERoyaltyTooHigh: u64 = 3;
    const EWrongVault: u64 = 4;
    const EPermitReleaseMismatch: u64 = 5;
    const EForkRequiresRoyalty: u64 = 6;
    const EInsufficientBalance: u64 = 7;

    public struct MarketplaceConfig has key {
        id: UID,
        admin: address,
        fee_bps: u64,
        fee_recipient: address,
    }

    public struct RoyaltyVault has key {
        id: UID,
        release_id: ID,
        owner: address,
        balance: Balance<SUI>,
    }

    // ── events ──

    public struct LicensePurchasedEvent has copy, drop {
        release_id: ID,
        buyer: address,
        price: u64,
    }

    public struct ForkPermitPurchasedEvent has copy, drop {
        release_id: ID,
        buyer: address,
        price: u64,
    }

    public struct ForkReleaseRegisteredEvent has copy, drop {
        parent_release_id: ID,
        new_release_id: ID,
        creator: address,
    }

    public struct VaultWithdrawnEvent has copy, drop {
        vault_id: ID,
        owner: address,
        amount: u64,
    }

    public struct LicenseRefundedEvent has copy, drop {
        release_id: ID,
        buyer: address,
        refund_amount: u64,
    }

    public struct ForkPermitRefundedEvent has copy, drop {
        release_id: ID,
        buyer: address,
        refund_amount: u64,
    }

    // ── init (creates shared MarketplaceConfig on publish) ──

    fun init(ctx: &mut TxContext) {
        let sender = ctx.sender();
        transfer::share_object(MarketplaceConfig {
            id: object::new(ctx),
            admin: sender,
            fee_bps: 200,
            fee_recipient: sender,
        });
    }

    // ── vault creation (called alongside create_workflow_release) ──

    public fun create_royalty_vault(
        release: &WorkflowRelease,
        ctx: &mut TxContext,
    ) {
        transfer::share_object(RoyaltyVault {
            id: object::new(ctx),
            release_id: object::id(release),
            owner: ctx.sender(),
            balance: balance::zero<SUI>(),
        });
    }

    // ── buy LicensePass (non-fork releases only) ──

    public fun buy_license(
        config: &MarketplaceConfig,
        release: &WorkflowRelease,
        vault: &mut RoyaltyVault,
        payment: Coin<SUI>,
        remaining_runs: Option<u64>,
        expires_at: Option<u64>,
        _clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(agent::release_parent_id(release).is_none(), EForkRequiresRoyalty);
        assert!(agent::release_is_listed(release), ENotListed);
        let total = coin::value(&payment);
        assert!(total == agent::release_price_license(release), EInsufficientPayment);
        assert!(vault.release_id == object::id(release), EWrongVault);

        let mut payment_balance = coin::into_balance(payment);

        // platform fee
        let fee_amount = total * config.fee_bps / 10000;
        if (fee_amount > 0) {
            let fee_bal = balance::split(&mut payment_balance, fee_amount);
            transfer::public_transfer(coin::from_balance(fee_bal, ctx), config.fee_recipient);
        };

        // remainder → seller vault
        balance::join(&mut vault.balance, payment_balance);

        // issue LicensePass
        let buyer = ctx.sender();
        let pass = license::issue_license_pass(
            object::id(release),
            buyer,
            remaining_runs,
            expires_at,
            ctx,
        );
        transfer::public_transfer(pass, buyer);

        event::emit(LicensePurchasedEvent {
            release_id: object::id(release),
            buyer,
            price: total,
        });
    }

    // ── buy LicensePass for fork releases (with royalty distribution) ──

    public fun buy_license_with_royalty(
        config: &MarketplaceConfig,
        release: &WorkflowRelease,
        vault: &mut RoyaltyVault,
        parent_vault: &mut RoyaltyVault,
        payment: Coin<SUI>,
        remaining_runs: Option<u64>,
        expires_at: Option<u64>,
        _clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(agent::release_is_listed(release), ENotListed);
        let total = coin::value(&payment);
        assert!(total == agent::release_price_license(release), EInsufficientPayment);
        assert!(vault.release_id == object::id(release), EWrongVault);

        let mut payment_balance = coin::into_balance(payment);

        // platform fee
        let fee_amount = total * config.fee_bps / 10000;
        if (fee_amount > 0) {
            let fee_bal = balance::split(&mut payment_balance, fee_amount);
            transfer::public_transfer(coin::from_balance(fee_bal, ctx), config.fee_recipient);
        };

        // royalty → parent vault
        distribute_royalty(release, parent_vault, &mut payment_balance);

        // remainder → seller vault
        balance::join(&mut vault.balance, payment_balance);

        // issue LicensePass
        let buyer = ctx.sender();
        let pass = license::issue_license_pass(
            object::id(release),
            buyer,
            remaining_runs,
            expires_at,
            ctx,
        );
        transfer::public_transfer(pass, buyer);

        event::emit(LicensePurchasedEvent {
            release_id: object::id(release),
            buyer,
            price: total,
        });
    }

    // ── buy ForkPermit (non-fork releases only) ──

    public fun buy_fork_permit(
        config: &MarketplaceConfig,
        release: &WorkflowRelease,
        vault: &mut RoyaltyVault,
        payment: Coin<SUI>,
        expires_at: Option<u64>,
        _clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(agent::release_parent_id(release).is_none(), EForkRequiresRoyalty);
        assert!(agent::release_is_listed(release), ENotListed);
        let total = coin::value(&payment);
        assert!(total == agent::release_price_fork(release), EInsufficientPayment);
        assert!(vault.release_id == object::id(release), EWrongVault);

        let mut payment_balance = coin::into_balance(payment);

        // platform fee
        let fee_amount = total * config.fee_bps / 10000;
        if (fee_amount > 0) {
            let fee_bal = balance::split(&mut payment_balance, fee_amount);
            transfer::public_transfer(coin::from_balance(fee_bal, ctx), config.fee_recipient);
        };

        // remainder → seller vault
        balance::join(&mut vault.balance, payment_balance);

        // issue ForkPermit
        let buyer = ctx.sender();
        let permit = license::issue_fork_permit(
            object::id(release),
            buyer,
            expires_at,
            ctx,
        );
        transfer::public_transfer(permit, buyer);

        event::emit(ForkPermitPurchasedEvent {
            release_id: object::id(release),
            buyer,
            price: total,
        });
    }

    // ── buy ForkPermit for fork releases (with royalty distribution) ──

    public fun buy_fork_permit_with_royalty(
        config: &MarketplaceConfig,
        release: &WorkflowRelease,
        vault: &mut RoyaltyVault,
        parent_vault: &mut RoyaltyVault,
        payment: Coin<SUI>,
        expires_at: Option<u64>,
        _clock: &Clock,
        ctx: &mut TxContext,
    ) {
        assert!(agent::release_is_listed(release), ENotListed);
        let total = coin::value(&payment);
        assert!(total == agent::release_price_fork(release), EInsufficientPayment);
        assert!(vault.release_id == object::id(release), EWrongVault);

        let mut payment_balance = coin::into_balance(payment);

        // platform fee
        let fee_amount = total * config.fee_bps / 10000;
        if (fee_amount > 0) {
            let fee_bal = balance::split(&mut payment_balance, fee_amount);
            transfer::public_transfer(coin::from_balance(fee_bal, ctx), config.fee_recipient);
        };

        // royalty → parent vault
        distribute_royalty(release, parent_vault, &mut payment_balance);

        // remainder → seller vault
        balance::join(&mut vault.balance, payment_balance);

        // issue ForkPermit
        let buyer = ctx.sender();
        let permit = license::issue_fork_permit(
            object::id(release),
            buyer,
            expires_at,
            ctx,
        );
        transfer::public_transfer(permit, buyer);

        event::emit(ForkPermitPurchasedEvent {
            release_id: object::id(release),
            buyer,
            price: total,
        });
    }

    // ── register fork release ──

    public fun register_fork_release(
        permit: &ForkPermit,
        parent_release: &WorkflowRelease,
        parent_vault: &mut RoyaltyVault,
        new_blob_id: String,
        new_version: String,
        new_price_license: u64,
        new_price_fork: u64,
        new_royalty_bps: u64,
        payment: Coin<SUI>,
        clock: &Clock,
        ctx: &mut TxContext,
    ) {
        // validate permit
        license::assert_fork_permit_valid(permit, clock);
        assert!(
            license::fork_permit_release_id(permit) == object::id(parent_release),
            EPermitReleaseMismatch,
        );
        assert!(
            coin::value(&payment) == agent::release_price_fork(parent_release),
            EInsufficientPayment,
        );
        assert!(new_royalty_bps <= 5000, ERoyaltyTooHigh);

        // fork registration fee → parent vault
        balance::join(&mut parent_vault.balance, coin::into_balance(payment));

        // create forked WorkflowRelease (is_listed = false)
        let parent_id = object::id(parent_release);
        let release = agent::create_fork_release(
            agent::release_root_id(parent_release),
            option::some(parent_id),
            new_version,
            new_blob_id,
            new_price_license,
            new_price_fork,
            new_royalty_bps,
            clock,
            ctx,
        );

        let new_release_id = object::id(&release);

        // create vault for the new release
        let new_vault = RoyaltyVault {
            id: object::new(ctx),
            release_id: new_release_id,
            owner: ctx.sender(),
            balance: balance::zero<SUI>(),
        };

        transfer::share_object(new_vault);
        transfer::public_transfer(release, ctx.sender());

        event::emit(ForkReleaseRegisteredEvent {
            parent_release_id: parent_id,
            new_release_id,
            creator: ctx.sender(),
        });
    }

    // ── royalty distribution (internal helper) ──

    fun distribute_royalty(
        child_release: &WorkflowRelease,
        parent_vault: &mut RoyaltyVault,
        amount: &mut Balance<SUI>,
    ) {
        let royalty_bps = agent::release_royalty_bps(child_release);
        let total = balance::value(amount);
        let royalty_amount = total * royalty_bps / 10000;
        if (royalty_amount > 0) {
            let royalty = balance::split(amount, royalty_amount);
            balance::join(&mut parent_vault.balance, royalty);
        };
    }

    // ── vault withdrawal (full) ──

    public fun withdraw_vault(
        vault: &mut RoyaltyVault,
        ctx: &mut TxContext,
    ): Coin<SUI> {
        assert!(vault.owner == ctx.sender(), ENotVaultOwner);
        let amount = balance::value(&vault.balance);
        let withdrawn = balance::split(&mut vault.balance, amount);

        event::emit(VaultWithdrawnEvent {
            vault_id: object::id(vault),
            owner: ctx.sender(),
            amount,
        });

        coin::from_balance(withdrawn, ctx)
    }

    // ── vault withdrawal (partial) ──

    public fun withdraw_vault_partial(
        vault: &mut RoyaltyVault,
        amount: u64,
        ctx: &mut TxContext,
    ): Coin<SUI> {
        assert!(vault.owner == ctx.sender(), ENotVaultOwner);
        assert!(amount <= balance::value(&vault.balance), EInsufficientBalance);
        let withdrawn = balance::split(&mut vault.balance, amount);

        event::emit(VaultWithdrawnEvent {
            vault_id: object::id(vault),
            owner: ctx.sender(),
            amount,
        });

        coin::from_balance(withdrawn, ctx)
    }

    // ── refund license (vault owner burns pass and refunds buyer) ──

    public fun refund_license(
        vault: &mut RoyaltyVault,
        pass: LicensePass,
        refund_amount: u64,
        ctx: &mut TxContext,
    ) {
        assert!(vault.owner == ctx.sender(), ENotVaultOwner);
        assert!(license::license_release_id(&pass) == vault.release_id, EWrongVault);
        assert!(refund_amount <= balance::value(&vault.balance), EInsufficientBalance);

        let buyer = license::destroy_license_pass(pass);

        if (refund_amount > 0) {
            let refund = balance::split(&mut vault.balance, refund_amount);
            transfer::public_transfer(coin::from_balance(refund, ctx), buyer);
        };

        event::emit(LicenseRefundedEvent {
            release_id: vault.release_id,
            buyer,
            refund_amount,
        });
    }

    // ── refund fork permit (vault owner burns permit and refunds buyer) ──

    public fun refund_fork_permit(
        vault: &mut RoyaltyVault,
        permit: ForkPermit,
        refund_amount: u64,
        ctx: &mut TxContext,
    ) {
        assert!(vault.owner == ctx.sender(), ENotVaultOwner);
        assert!(license::fork_permit_release_id(&permit) == vault.release_id, EWrongVault);
        assert!(refund_amount <= balance::value(&vault.balance), EInsufficientBalance);

        let buyer = license::destroy_fork_permit(permit);

        if (refund_amount > 0) {
            let refund = balance::split(&mut vault.balance, refund_amount);
            transfer::public_transfer(coin::from_balance(refund, ctx), buyer);
        };

        event::emit(ForkPermitRefundedEvent {
            release_id: vault.release_id,
            buyer,
            refund_amount,
        });
    }
}
