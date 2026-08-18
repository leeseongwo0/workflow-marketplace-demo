#[test_only]
module workflow_marketplace::receipt_tests;

use std::debug;
use sui::clock::Clock;
use sui::coin;
use sui::object;
use sui::sui::SUI;
use sui::test_scenario;
use workflow_marketplace::marketplace;

const RUNNER: address = @0xB0B;
const PRICE_MIST: u64 = 1_000_000;

fun executor_public_key(): vector<u8> {
    x"ea4a6c63e29c520abef5507b132ec5f9954776aebebe7b92421eea691446d22c"
}

fun hash_32(byte: u8): vector<u8> {
    vector[byte, byte, byte, byte, byte, byte, byte, byte,
        byte, byte, byte, byte, byte, byte, byte, byte,
        byte, byte, byte, byte, byte, byte, byte, byte,
        byte, byte, byte, byte, byte, byte, byte, byte]
}

fun setup_licensed_runner(scenario: &mut test_scenario::Scenario) {
    test_scenario::create_system_objects(scenario);
    marketplace::create_marketplace(executor_public_key(), scenario.ctx());

    let clock = scenario.take_shared<Clock>();
    marketplace::create_workflow_root(
        b"Google News RSS Monitor",
        hash_32(1),
        &clock,
        scenario.ctx(),
    );
    test_scenario::return_shared(clock);

    scenario.next_tx(RUNNER);
    let mut root = scenario.take_from_sender<marketplace::WorkflowRoot>();
    let clock = scenario.take_shared<Clock>();
    marketplace::publish_release(
        &mut root,
        1,
        0,
        0,
        b"Google News RSS Monitor",
        b"Deterministic receipt fixture",
        b"google_news_rss/v1",
        b"walrus-test-blob",
        hash_32(2),
        hash_32(3),
        b"root:release:1.0.0",
        PRICE_MIST,
        true,
        &clock,
        scenario.ctx(),
    );
    test_scenario::return_shared(clock);
    test_scenario::return_to_sender(scenario, root);

    scenario.next_tx(RUNNER);
    let mut market = scenario.take_shared<marketplace::Marketplace>();
    let release = scenario.take_shared<marketplace::WorkflowRelease>();
    let clock = scenario.take_shared<Clock>();
    let payment = coin::mint_for_testing<SUI>(PRICE_MIST, scenario.ctx());
    marketplace::purchase_license(
        &mut market,
        &release,
        payment,
        &clock,
        scenario.ctx(),
    );
    test_scenario::return_shared(clock);
    test_scenario::return_shared(release);
    test_scenario::return_shared(market);
    scenario.next_tx(RUNNER);
}

#[test]
fun print_receipt_fixture() {
    let mut scenario = test_scenario::begin(RUNNER);
    setup_licensed_runner(&mut scenario);

    let market = scenario.take_shared<marketplace::Marketplace>();
    let release = scenario.take_shared<marketplace::WorkflowRelease>();
    let pass = scenario.take_from_sender<marketplace::LicensePass>();
    let release_id = object::id_address(&release);
    let license_id = object::id_address(&pass);
    let message = marketplace::receipt_message_bytes(
        release_id,
        license_id,
        RUNNER,
        hash_32(4),
        hash_32(5),
        1_723_900_000_000,
        hash_32(6),
    );

    debug::print(&release_id);
    debug::print(&license_id);
    debug::print(&message);

    test_scenario::return_to_sender(&scenario, pass);
    test_scenario::return_shared(release);
    test_scenario::return_shared(market);
    scenario.end();
}
