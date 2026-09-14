#[test_only]
module workflow_marketplace::receipt_tests;

use std::bcs;
use sui::clock::{Self, Clock};
use sui::coin;
use sui::object;
use sui::sui::SUI;
use sui::test_scenario;
use sui::transfer;
use workflow_marketplace::agent::{Self, WorkflowRelease};
use workflow_marketplace::execution;
use workflow_marketplace::license::LicensePass;
use workflow_marketplace::marketplace::{Self, MarketplaceConfig, RoyaltyVault};

const CREATOR: address = @0xC0FFEE;
const BUYER: address = @0xB0B;
const PRICE_LICENSE: u64 = 1_000_000;
const PRICE_FORK: u64 = 2_000_000;
const ROYALTY_BPS: u64 = 1000;

fun setup_with_license(
    scenario: &mut test_scenario::Scenario,
    remaining_runs: Option<u64>,
    expires_at: Option<u64>,
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
        option::none(), option::none(),
        &clock, scenario.ctx(),
    );
    marketplace::create_royalty_vault(&release, scenario.ctx());
    transfer::public_transfer(profile, CREATOR);
    transfer::public_transfer(root, CREATOR);
    transfer::public_share_object(release);
    test_scenario::return_shared(clock);
    scenario.next_tx(CREATOR);

    scenario.next_tx(BUYER);
    let config = scenario.take_shared<MarketplaceConfig>();
    let release = scenario.take_shared<WorkflowRelease>();
    let mut vault = scenario.take_shared<RoyaltyVault>();
    let clock = scenario.take_shared<Clock>();
    let payment = coin::mint_for_testing<SUI>(PRICE_LICENSE, scenario.ctx());
    marketplace::buy_license(
        &config, &release, &mut vault, payment,
        remaining_runs, expires_at,
        &clock, scenario.ctx(),
    );
    test_scenario::return_shared(clock);
    test_scenario::return_shared(vault);
    test_scenario::return_shared(release);
    test_scenario::return_shared(config);
    scenario.next_tx(BUYER);
}

#[test]
fun test_record_execution() {
    let mut scenario = test_scenario::begin(CREATOR);
    setup_with_license(&mut scenario, option::some(10u64), option::none());

    let mut pass = scenario.take_from_sender<LicensePass>();
    let release = scenario.take_shared<WorkflowRelease>();
    let expected_release_id = object::id(&release);
    let clock = scenario.take_shared<Clock>();
    let receipt = execution::record_execution(
        &mut pass, &release, &clock, scenario.ctx(),
    );
    assert!(execution::receipt_release_id(&receipt) == expected_release_id);
    assert!(execution::receipt_executor(&receipt) == BUYER);
    transfer::public_transfer(receipt, BUYER);
    test_scenario::return_shared(clock);
    test_scenario::return_shared(release);
    test_scenario::return_to_sender(&scenario, pass);
    scenario.end();
}

#[test, expected_failure(abort_code = 1)]
fun test_no_runs_remaining() {
    let mut scenario = test_scenario::begin(CREATOR);
    setup_with_license(&mut scenario, option::some(1u64), option::none());

    let mut pass = scenario.take_from_sender<LicensePass>();
    let release = scenario.take_shared<WorkflowRelease>();
    let clock = scenario.take_shared<Clock>();
    let receipt = execution::record_execution(
        &mut pass, &release, &clock, scenario.ctx(),
    );
    transfer::public_transfer(receipt, BUYER);
    test_scenario::return_shared(clock);
    test_scenario::return_shared(release);
    test_scenario::return_to_sender(&scenario, pass);
    scenario.next_tx(BUYER);

    let mut pass = scenario.take_from_sender<LicensePass>();
    let release = scenario.take_shared<WorkflowRelease>();
    let clock = scenario.take_shared<Clock>();
    let _receipt = execution::record_execution(
        &mut pass, &release, &clock, scenario.ctx(),
    );

    abort 1337
}

#[test, expected_failure(abort_code = 0)]
fun test_expired_license() {
    let mut scenario = test_scenario::begin(CREATOR);
    setup_with_license(&mut scenario, option::none(), option::some(1000u64));

    let mut pass = scenario.take_from_sender<LicensePass>();
    let release = scenario.take_shared<WorkflowRelease>();
    let mut clock = scenario.take_shared<Clock>();
    clock::increment_for_testing(&mut clock, 1001);
    let _receipt = execution::record_execution(
        &mut pass, &release, &clock, scenario.ctx(),
    );

    abort 1337
}

#[test]
fun test_seal_approve() {
    let mut scenario = test_scenario::begin(CREATOR);
    setup_with_license(&mut scenario, option::none(), option::none());

    let pass = scenario.take_from_sender<LicensePass>();
    let release = scenario.take_shared<WorkflowRelease>();
    let clock = scenario.take_shared<Clock>();
    let id = bcs::to_bytes(&object::id(&release));
    execution::seal_approve(id, &pass, &release, &clock);
    test_scenario::return_shared(clock);
    test_scenario::return_shared(release);
    test_scenario::return_to_sender(&scenario, pass);
    scenario.end();
}

#[test, expected_failure(abort_code = 1)]
fun test_seal_approve_wrong_id() {
    let mut scenario = test_scenario::begin(CREATOR);
    setup_with_license(&mut scenario, option::none(), option::none());

    let pass = scenario.take_from_sender<LicensePass>();
    let release = scenario.take_shared<WorkflowRelease>();
    let clock = scenario.take_shared<Clock>();
    execution::seal_approve(b"wrong_id", &pass, &release, &clock);

    abort 1337
}
