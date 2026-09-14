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

    // create request
    let pass = scenario.take_from_sender<LicensePass>();
    let release = scenario.take_shared<WorkflowRelease>();
    let clock = scenario.take_shared<Clock>();
    execution::create_execution_request(&pass, &release, &clock, scenario.ctx());
    test_scenario::return_shared(clock);
    test_scenario::return_shared(release);
    test_scenario::return_to_sender(&scenario, pass);
    scenario.next_tx(BUYER);

    // execute with request
    let mut pass = scenario.take_from_sender<LicensePass>();
    let release = scenario.take_shared<WorkflowRelease>();
    let expected_release_id = object::id(&release);
    let mut request = scenario.take_shared<execution::ExecutionRequest>();
    let clock = scenario.take_shared<Clock>();
    let receipt = execution::record_execution(
        &mut pass, &release, &mut request, &clock, scenario.ctx(),
    );
    assert!(execution::receipt_release_id(&receipt) == expected_release_id);
    assert!(execution::receipt_executor(&receipt) == BUYER);
    assert!(execution::request_claimed(&request));
    transfer::public_transfer(receipt, BUYER);
    test_scenario::return_shared(clock);
    test_scenario::return_shared(request);
    test_scenario::return_shared(release);
    test_scenario::return_to_sender(&scenario, pass);
    scenario.end();
}

#[test, expected_failure(abort_code = 1)]
fun test_no_runs_remaining() {
    let mut scenario = test_scenario::begin(CREATOR);
    setup_with_license(&mut scenario, option::some(1u64), option::none());

    // create request and execute (consumes the only run)
    let pass = scenario.take_from_sender<LicensePass>();
    let release = scenario.take_shared<WorkflowRelease>();
    let clock = scenario.take_shared<Clock>();
    execution::create_execution_request(&pass, &release, &clock, scenario.ctx());
    test_scenario::return_shared(clock);
    test_scenario::return_shared(release);
    test_scenario::return_to_sender(&scenario, pass);
    scenario.next_tx(BUYER);

    let mut pass = scenario.take_from_sender<LicensePass>();
    let release = scenario.take_shared<WorkflowRelease>();
    let mut request = scenario.take_shared<execution::ExecutionRequest>();
    let clock = scenario.take_shared<Clock>();
    let receipt = execution::record_execution(
        &mut pass, &release, &mut request, &clock, scenario.ctx(),
    );
    transfer::public_transfer(receipt, BUYER);
    test_scenario::return_shared(clock);
    test_scenario::return_shared(request);
    test_scenario::return_shared(release);
    test_scenario::return_to_sender(&scenario, pass);
    scenario.next_tx(BUYER);

    // try to create another request — fails (0 runs remaining)
    let pass = scenario.take_from_sender<LicensePass>();
    let release = scenario.take_shared<WorkflowRelease>();
    let clock = scenario.take_shared<Clock>();
    execution::create_execution_request(&pass, &release, &clock, scenario.ctx());

    abort 1337
}

#[test, expected_failure(abort_code = 0)]
fun test_expired_license() {
    let mut scenario = test_scenario::begin(CREATOR);
    setup_with_license(&mut scenario, option::none(), option::some(1000u64));

    // create request while license is valid
    let pass = scenario.take_from_sender<LicensePass>();
    let release = scenario.take_shared<WorkflowRelease>();
    let clock = scenario.take_shared<Clock>();
    execution::create_execution_request(&pass, &release, &clock, scenario.ctx());
    test_scenario::return_shared(clock);
    test_scenario::return_shared(release);
    test_scenario::return_to_sender(&scenario, pass);
    scenario.next_tx(BUYER);

    // advance clock past license expiry, then try to execute
    let mut pass = scenario.take_from_sender<LicensePass>();
    let release = scenario.take_shared<WorkflowRelease>();
    let mut request = scenario.take_shared<execution::ExecutionRequest>();
    let mut clock = scenario.take_shared<Clock>();
    clock::increment_for_testing(&mut clock, 1001);
    let _receipt = execution::record_execution(
        &mut pass, &release, &mut request, &clock, scenario.ctx(),
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
    execution::create_execution_request(&pass, &release, &clock, scenario.ctx());
    test_scenario::return_shared(clock);
    test_scenario::return_shared(release);
    test_scenario::return_to_sender(&scenario, pass);
    scenario.next_tx(BUYER);

    let release = scenario.take_shared<WorkflowRelease>();
    let request = scenario.take_shared<execution::ExecutionRequest>();
    let clock = scenario.take_shared<Clock>();
    let id = bcs::to_bytes(&object::id(&release));
    execution::seal_approve_for_testing(id, &request, &release, &clock);
    test_scenario::return_shared(clock);
    test_scenario::return_shared(request);
    test_scenario::return_shared(release);
    scenario.end();
}

#[test, expected_failure(abort_code = 1)]
fun test_seal_approve_wrong_id() {
    let mut scenario = test_scenario::begin(CREATOR);
    setup_with_license(&mut scenario, option::none(), option::none());

    let pass = scenario.take_from_sender<LicensePass>();
    let release = scenario.take_shared<WorkflowRelease>();
    let clock = scenario.take_shared<Clock>();
    execution::create_execution_request(&pass, &release, &clock, scenario.ctx());
    test_scenario::return_shared(clock);
    test_scenario::return_shared(release);
    test_scenario::return_to_sender(&scenario, pass);
    scenario.next_tx(BUYER);

    let release = scenario.take_shared<WorkflowRelease>();
    let request = scenario.take_shared<execution::ExecutionRequest>();
    let clock = scenario.take_shared<Clock>();
    execution::seal_approve_for_testing(b"wrong_id", &request, &release, &clock);

    abort 1337
}

// ── ExecutionRequest tests ──

#[test]
fun test_create_execution_request() {
    let mut scenario = test_scenario::begin(CREATOR);
    setup_with_license(&mut scenario, option::some(10u64), option::none());

    let pass = scenario.take_from_sender<LicensePass>();
    let release = scenario.take_shared<WorkflowRelease>();
    let expected_release_id = object::id(&release);
    let clock = scenario.take_shared<Clock>();
    execution::create_execution_request(&pass, &release, &clock, scenario.ctx());
    test_scenario::return_shared(clock);
    test_scenario::return_shared(release);
    test_scenario::return_to_sender(&scenario, pass);
    scenario.next_tx(BUYER);

    let request = scenario.take_shared<execution::ExecutionRequest>();
    assert!(execution::request_release_id(&request) == expected_release_id);
    assert!(execution::request_runner(&request) == BUYER);
    assert!(!execution::request_claimed(&request));
    test_scenario::return_shared(request);
    scenario.end();
}

#[test, expected_failure(abort_code = 2)]
fun test_create_request_wrong_release() {
    let mut scenario = test_scenario::begin(CREATOR);
    setup_with_license(&mut scenario, option::some(10u64), option::none());

    // create a second release
    scenario.next_tx(CREATOR);
    let clock = scenario.take_shared<Clock>();
    let profile = agent::create_agent_profile(
        b"Other".to_string(), &clock, scenario.ctx(),
    );
    let root = agent::create_workflow_root(
        &profile, b"Other".to_string(), b"Desc".to_string(),
        &clock, scenario.ctx(),
    );
    let release2 = agent::create_workflow_release(
        &root, option::none(), b"2.0.0".to_string(), b"blob2".to_string(),
        PRICE_LICENSE, PRICE_FORK, ROYALTY_BPS,
        option::none(), option::none(),
        &clock, scenario.ctx(),
    );
    transfer::public_transfer(profile, CREATOR);
    transfer::public_transfer(root, CREATOR);
    transfer::public_share_object(release2);
    test_scenario::return_shared(clock);
    scenario.next_tx(BUYER);

    // try to create request with license for release1 but passing release2
    let pass = scenario.take_from_sender<LicensePass>();
    let release2 = scenario.take_shared<WorkflowRelease>();
    let clock = scenario.take_shared<Clock>();
    execution::create_execution_request(&pass, &release2, &clock, scenario.ctx());

    abort 1337
}

#[test, expected_failure(abort_code = 4)]
fun test_request_already_claimed() {
    let mut scenario = test_scenario::begin(CREATOR);
    setup_with_license(&mut scenario, option::some(10u64), option::none());

    // create request and execute (claims it)
    let pass = scenario.take_from_sender<LicensePass>();
    let release = scenario.take_shared<WorkflowRelease>();
    let clock = scenario.take_shared<Clock>();
    execution::create_execution_request(&pass, &release, &clock, scenario.ctx());
    test_scenario::return_shared(clock);
    test_scenario::return_shared(release);
    test_scenario::return_to_sender(&scenario, pass);
    scenario.next_tx(BUYER);

    let mut pass = scenario.take_from_sender<LicensePass>();
    let release = scenario.take_shared<WorkflowRelease>();
    let mut request = scenario.take_shared<execution::ExecutionRequest>();
    let clock = scenario.take_shared<Clock>();
    let receipt = execution::record_execution(
        &mut pass, &release, &mut request, &clock, scenario.ctx(),
    );
    transfer::public_transfer(receipt, BUYER);
    test_scenario::return_shared(clock);
    test_scenario::return_shared(release);
    test_scenario::return_to_sender(&scenario, pass);

    // try to execute again with same claimed request
    scenario.next_tx(BUYER);
    let mut pass = scenario.take_from_sender<LicensePass>();
    let release = scenario.take_shared<WorkflowRelease>();
    let clock = scenario.take_shared<Clock>();
    let _receipt = execution::record_execution(
        &mut pass, &release, &mut request, &clock, scenario.ctx(),
    );

    abort 1337
}

#[test, expected_failure(abort_code = 3)]
fun test_request_expired() {
    let mut scenario = test_scenario::begin(CREATOR);
    setup_with_license(&mut scenario, option::none(), option::none());

    let pass = scenario.take_from_sender<LicensePass>();
    let release = scenario.take_shared<WorkflowRelease>();
    let clock = scenario.take_shared<Clock>();
    execution::create_execution_request(&pass, &release, &clock, scenario.ctx());
    test_scenario::return_shared(clock);
    test_scenario::return_shared(release);
    test_scenario::return_to_sender(&scenario, pass);
    scenario.next_tx(BUYER);

    let request = scenario.take_shared<execution::ExecutionRequest>();
    let mut clock = scenario.take_shared<Clock>();
    clock::increment_for_testing(&mut clock, 600_001);
    execution::assert_request_valid(&request, &clock);

    abort 1337
}
