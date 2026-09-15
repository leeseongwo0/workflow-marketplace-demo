#[test_only]
module workflow_marketplace::core_tests;

use sui::clock::Clock;
use sui::coin;
use sui::object;
use sui::sui::SUI;
use sui::test_scenario;
use sui::transfer;
use workflow_marketplace::agent::{Self, WorkflowRelease};
use workflow_marketplace::license::{Self, LicensePass};
use workflow_marketplace::marketplace::{Self, MarketplaceConfig, RoyaltyVault};

const CREATOR: address = @0xC0FFEE;
const BUYER: address = @0xB0B;
const PRICE_LICENSE: u64 = 1_000_000;
const PRICE_FORK: u64 = 2_000_000;
const ROYALTY_BPS: u64 = 1000;
const FEE_BPS: u64 = 200;

fun setup(scenario: &mut test_scenario::Scenario) {
    test_scenario::create_system_objects(scenario);
    marketplace::init_for_testing(scenario.ctx());
    scenario.next_tx(CREATOR);

    let clock = scenario.take_shared<Clock>();
    let profile = agent::create_agent_profile(
        b"TestAgent".to_string(), &clock, scenario.ctx(),
    );
    let root = agent::create_workflow_root(
        &profile, b"Test".to_string(), b"Desc".to_string(),
        &clock, scenario.ctx(),
    );
    let release = agent::create_workflow_release(
        &root, option::none(), b"1.0.0".to_string(), b"blob".to_string(),
        PRICE_LICENSE, PRICE_FORK, ROYALTY_BPS,
        option::none(), option::none(),
        &clock, scenario.ctx(),
    );
    marketplace::create_royalty_vault(&release, scenario.ctx());
    transfer::public_transfer(profile, CREATOR);
    transfer::public_transfer(root, CREATOR);
    transfer::public_share_object(release);
    test_scenario::return_shared(clock);
    scenario.next_tx(CREATOR);
}

#[test]
fun test_create_release() {
    let mut scenario = test_scenario::begin(CREATOR);
    setup(&mut scenario);

    let release = scenario.take_shared<WorkflowRelease>();
    assert!(agent::release_is_listed(&release));
    assert!(agent::release_price_license(&release) == PRICE_LICENSE);
    assert!(agent::release_price_fork(&release) == PRICE_FORK);
    assert!(agent::release_royalty_bps(&release) == ROYALTY_BPS);
    assert!(agent::release_parent_id(&release).is_none());
    test_scenario::return_shared(release);
    scenario.end();
}

#[test]
fun test_buy_license() {
    let mut scenario = test_scenario::begin(CREATOR);
    setup(&mut scenario);

    scenario.next_tx(BUYER);
    let config = scenario.take_shared<MarketplaceConfig>();
    let release = scenario.take_shared<WorkflowRelease>();
    let expected_id = object::id(&release);
    let mut vault = scenario.take_shared<RoyaltyVault>();
    let clock = scenario.take_shared<Clock>();
    let payment = coin::mint_for_testing<SUI>(PRICE_LICENSE, scenario.ctx());
    marketplace::buy_license(
        &config, &release, &mut vault, payment,
        option::some(10u64), option::none(),
        &clock, scenario.ctx(),
    );
    test_scenario::return_shared(clock);
    test_scenario::return_shared(vault);
    test_scenario::return_shared(release);
    test_scenario::return_shared(config);

    scenario.next_tx(BUYER);
    let pass = scenario.take_from_sender<LicensePass>();
    assert!(license::license_release_id(&pass) == expected_id);
    test_scenario::return_to_sender(&scenario, pass);
    scenario.end();
}

#[test, expected_failure(abort_code = 0)]
fun test_underpayment_fails() {
    let mut scenario = test_scenario::begin(CREATOR);
    setup(&mut scenario);

    scenario.next_tx(BUYER);
    let config = scenario.take_shared<MarketplaceConfig>();
    let release = scenario.take_shared<WorkflowRelease>();
    let mut vault = scenario.take_shared<RoyaltyVault>();
    let clock = scenario.take_shared<Clock>();
    let payment = coin::mint_for_testing<SUI>(PRICE_LICENSE - 1, scenario.ctx());
    marketplace::buy_license(
        &config, &release, &mut vault, payment,
        option::none(), option::none(),
        &clock, scenario.ctx(),
    );

    abort 1337
}

#[test, expected_failure(abort_code = 0)]
fun test_overpayment_fails() {
    let mut scenario = test_scenario::begin(CREATOR);
    setup(&mut scenario);

    scenario.next_tx(BUYER);
    let config = scenario.take_shared<MarketplaceConfig>();
    let release = scenario.take_shared<WorkflowRelease>();
    let mut vault = scenario.take_shared<RoyaltyVault>();
    let clock = scenario.take_shared<Clock>();
    let payment = coin::mint_for_testing<SUI>(PRICE_LICENSE + 1, scenario.ctx());
    marketplace::buy_license(
        &config, &release, &mut vault, payment,
        option::none(), option::none(),
        &clock, scenario.ctx(),
    );

    abort 1337
}

#[test, expected_failure(abort_code = 2)]
fun test_not_listed_fails() {
    let mut scenario = test_scenario::begin(CREATOR);
    setup(&mut scenario);

    let mut release = scenario.take_shared<WorkflowRelease>();
    agent::set_listed(&mut release, false, scenario.ctx());
    test_scenario::return_shared(release);
    scenario.next_tx(BUYER);

    let config = scenario.take_shared<MarketplaceConfig>();
    let release = scenario.take_shared<WorkflowRelease>();
    let mut vault = scenario.take_shared<RoyaltyVault>();
    let clock = scenario.take_shared<Clock>();
    let payment = coin::mint_for_testing<SUI>(PRICE_LICENSE, scenario.ctx());
    marketplace::buy_license(
        &config, &release, &mut vault, payment,
        option::none(), option::none(),
        &clock, scenario.ctx(),
    );

    abort 1337
}

#[test]
fun test_set_listed() {
    let mut scenario = test_scenario::begin(CREATOR);
    setup(&mut scenario);

    let mut release = scenario.take_shared<WorkflowRelease>();
    assert!(agent::release_is_listed(&release));
    agent::set_listed(&mut release, false, scenario.ctx());
    assert!(!agent::release_is_listed(&release));
    agent::set_listed(&mut release, true, scenario.ctx());
    assert!(agent::release_is_listed(&release));
    test_scenario::return_shared(release);
    scenario.end();
}

#[test]
fun test_withdraw_vault() {
    let mut scenario = test_scenario::begin(CREATOR);
    setup(&mut scenario);

    scenario.next_tx(BUYER);
    let config = scenario.take_shared<MarketplaceConfig>();
    let release = scenario.take_shared<WorkflowRelease>();
    let mut vault = scenario.take_shared<RoyaltyVault>();
    let clock = scenario.take_shared<Clock>();
    let payment = coin::mint_for_testing<SUI>(PRICE_LICENSE, scenario.ctx());
    marketplace::buy_license(
        &config, &release, &mut vault, payment,
        option::none(), option::none(),
        &clock, scenario.ctx(),
    );
    test_scenario::return_shared(clock);
    test_scenario::return_shared(vault);
    test_scenario::return_shared(release);
    test_scenario::return_shared(config);

    scenario.next_tx(CREATOR);
    let mut vault = scenario.take_shared<RoyaltyVault>();
    let withdrawn = marketplace::withdraw_vault(&mut vault, scenario.ctx());
    let expected_amount = PRICE_LICENSE - (PRICE_LICENSE * FEE_BPS / 10000);
    assert!(coin::value(&withdrawn) == expected_amount);
    transfer::public_transfer(withdrawn, CREATOR);
    test_scenario::return_shared(vault);
    scenario.end();
}

fun setup_with_limits(
    scenario: &mut test_scenario::Scenario,
    max_runs: Option<u64>,
    max_duration_ms: Option<u64>,
) {
    test_scenario::create_system_objects(scenario);
    marketplace::init_for_testing(scenario.ctx());
    scenario.next_tx(CREATOR);

    let clock = scenario.take_shared<Clock>();
    let profile = agent::create_agent_profile(
        b"TestAgent".to_string(), &clock, scenario.ctx(),
    );
    let root = agent::create_workflow_root(
        &profile, b"Test".to_string(), b"Desc".to_string(),
        &clock, scenario.ctx(),
    );
    let release = agent::create_workflow_release(
        &root, option::none(), b"1.0.0".to_string(), b"blob".to_string(),
        PRICE_LICENSE, PRICE_FORK, ROYALTY_BPS,
        max_runs, max_duration_ms,
        &clock, scenario.ctx(),
    );
    marketplace::create_royalty_vault(&release, scenario.ctx());
    transfer::public_transfer(profile, CREATOR);
    transfer::public_transfer(root, CREATOR);
    transfer::public_share_object(release);
    test_scenario::return_shared(clock);
    scenario.next_tx(CREATOR);
}

#[test]
fun test_buy_license_within_max_runs() {
    let mut scenario = test_scenario::begin(CREATOR);
    setup_with_limits(&mut scenario, option::some(10u64), option::none());

    scenario.next_tx(BUYER);
    let config = scenario.take_shared<MarketplaceConfig>();
    let release = scenario.take_shared<WorkflowRelease>();
    let mut vault = scenario.take_shared<RoyaltyVault>();
    let clock = scenario.take_shared<Clock>();
    let payment = coin::mint_for_testing<SUI>(PRICE_LICENSE, scenario.ctx());
    marketplace::buy_license(
        &config, &release, &mut vault, payment,
        option::some(5u64), option::none(),
        &clock, scenario.ctx(),
    );
    test_scenario::return_shared(clock);
    test_scenario::return_shared(vault);
    test_scenario::return_shared(release);
    test_scenario::return_shared(config);
    scenario.end();
}

#[test, expected_failure(abort_code = 8)]
fun test_runs_exceed_max_fails() {
    let mut scenario = test_scenario::begin(CREATOR);
    setup_with_limits(&mut scenario, option::some(10u64), option::none());

    scenario.next_tx(BUYER);
    let config = scenario.take_shared<MarketplaceConfig>();
    let release = scenario.take_shared<WorkflowRelease>();
    let mut vault = scenario.take_shared<RoyaltyVault>();
    let clock = scenario.take_shared<Clock>();
    let payment = coin::mint_for_testing<SUI>(PRICE_LICENSE, scenario.ctx());
    marketplace::buy_license(
        &config, &release, &mut vault, payment,
        option::some(11u64), option::none(),
        &clock, scenario.ctx(),
    );

    abort 1337
}

#[test, expected_failure(abort_code = 8)]
fun test_unlimited_runs_when_max_set_fails() {
    let mut scenario = test_scenario::begin(CREATOR);
    setup_with_limits(&mut scenario, option::some(10u64), option::none());

    scenario.next_tx(BUYER);
    let config = scenario.take_shared<MarketplaceConfig>();
    let release = scenario.take_shared<WorkflowRelease>();
    let mut vault = scenario.take_shared<RoyaltyVault>();
    let clock = scenario.take_shared<Clock>();
    let payment = coin::mint_for_testing<SUI>(PRICE_LICENSE, scenario.ctx());
    marketplace::buy_license(
        &config, &release, &mut vault, payment,
        option::none(), option::none(),
        &clock, scenario.ctx(),
    );

    abort 1337
}

#[test, expected_failure(abort_code = 9)]
fun test_duration_exceed_max_fails() {
    let mut scenario = test_scenario::begin(CREATOR);
    setup_with_limits(&mut scenario, option::none(), option::some(60_000u64));

    scenario.next_tx(BUYER);
    let config = scenario.take_shared<MarketplaceConfig>();
    let release = scenario.take_shared<WorkflowRelease>();
    let mut vault = scenario.take_shared<RoyaltyVault>();
    let clock = scenario.take_shared<Clock>();
    let payment = coin::mint_for_testing<SUI>(PRICE_LICENSE, scenario.ctx());
    marketplace::buy_license(
        &config, &release, &mut vault, payment,
        option::none(), option::some(60_001u64),
        &clock, scenario.ctx(),
    );

    abort 1337
}

#[test, expected_failure(abort_code = 0)]
fun test_royalty_too_high() {
    let mut scenario = test_scenario::begin(CREATOR);
    test_scenario::create_system_objects(&mut scenario);
    marketplace::init_for_testing(scenario.ctx());
    scenario.next_tx(CREATOR);

    let clock = scenario.take_shared<Clock>();
    let profile = agent::create_agent_profile(
        b"Agent".to_string(), &clock, scenario.ctx(),
    );
    let root = agent::create_workflow_root(
        &profile, b"R".to_string(), b"D".to_string(),
        &clock, scenario.ctx(),
    );
    let _release = agent::create_workflow_release(
        &root, option::none(), b"1.0.0".to_string(), b"b".to_string(),
        PRICE_LICENSE, PRICE_FORK, 5001,
        option::none(), option::none(),
        &clock, scenario.ctx(),
    );

    abort 1337
}
