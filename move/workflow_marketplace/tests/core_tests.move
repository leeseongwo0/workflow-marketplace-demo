#[test_only]
module workflow_marketplace::core_tests;

use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::object;
use sui::pay;
use sui::sui::SUI;
use sui::test_scenario;
use workflow_marketplace::marketplace;

const CREATOR: address = @0xC0FFEE;
const BUYER: address = @0xB0B;
const NON_CREATOR: address = @0xD00D;
const PRICE_MIST: u64 = 1_000_000;

fun executor_public_key(): vector<u8> {
    b"01234567890123456789012345678901"
}

fun hash_32(): vector<u8> {
    b"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
}

fun publish_release_for_root(
    scenario: &mut test_scenario::Scenario,
    root: &mut marketplace::WorkflowRoot,
    active: bool,
) {
    let clock = scenario.take_shared<Clock>();
    marketplace::publish_release(
        root,
        1,
        0,
        0,
        b"Google News RSS Monitor",
        b"Deterministic test release",
        b"google_news_rss/v1",
        b"walrus-test-blob",
        hash_32(),
        hash_32(),
        b"root:release:1.0.0",
        PRICE_MIST,
        active,
        &clock,
        scenario.ctx(),
    );
    test_scenario::return_shared(clock);
}

fun setup_release(scenario: &mut test_scenario::Scenario, active: bool) {
    test_scenario::create_system_objects(scenario);
    marketplace::create_marketplace(executor_public_key(), scenario.ctx());

    let clock = scenario.take_shared<Clock>();
    marketplace::create_workflow_root(
        b"Google News RSS Monitor",
        hash_32(),
        &clock,
        scenario.ctx(),
    );
    test_scenario::return_shared(clock);

    scenario.next_tx(CREATOR);
    let mut root = scenario.take_from_sender<marketplace::WorkflowRoot>();
    publish_release_for_root(scenario, &mut root, active);
    test_scenario::return_to_sender(scenario, root);
    scenario.next_tx(CREATOR);
}

#[test]
fun creator_can_publish() {
    let mut scenario = test_scenario::begin(CREATOR);
    setup_release(&mut scenario, true);

    let root = scenario.take_from_sender<marketplace::WorkflowRoot>();
    assert!(marketplace::latest_release_id(&root).is_some());
    test_scenario::return_to_sender(&scenario, root);

    let release = scenario.take_shared<marketplace::WorkflowRelease>();
    assert!(marketplace::release_active(&release));
    assert!(marketplace::release_price_mist(&release) == PRICE_MIST);
    assert!(marketplace::release_creator(&release) == CREATOR);
    test_scenario::return_shared(release);

    scenario.end();
}

#[test, expected_failure(abort_code = 1)]
fun non_creator_cannot_publish() {
    let mut scenario = test_scenario::begin(CREATOR);
    setup_release(&mut scenario, true);

    scenario.next_tx(NON_CREATOR);
    let mut root = scenario.take_from_address<marketplace::WorkflowRoot>(CREATOR);
    publish_release_for_root(&mut scenario, &mut root, true);

    abort 1337
}

#[test, expected_failure(abort_code = 2)]
fun inactive_release_cannot_sell() {
    let mut scenario = test_scenario::begin(CREATOR);
    setup_release(&mut scenario, false);

    scenario.next_tx(BUYER);
    let mut marketplace = scenario.take_shared<marketplace::Marketplace>();
    let release = scenario.take_shared<marketplace::WorkflowRelease>();
    let clock = scenario.take_shared<Clock>();
    let payment = coin::mint_for_testing<SUI>(PRICE_MIST, scenario.ctx());
    marketplace::purchase_license(
        &mut marketplace,
        &release,
        payment,
        &clock,
        scenario.ctx(),
    );

    abort 1337
}

#[test, expected_failure(abort_code = 3)]
fun wrong_payment_aborts() {
    let mut scenario = test_scenario::begin(CREATOR);
    setup_release(&mut scenario, true);

    scenario.next_tx(BUYER);
    let mut marketplace = scenario.take_shared<marketplace::Marketplace>();
    let release = scenario.take_shared<marketplace::WorkflowRelease>();
    let clock = scenario.take_shared<Clock>();
    let payment = coin::mint_for_testing<SUI>(PRICE_MIST + 1, scenario.ctx());
    marketplace::purchase_license(
        &mut marketplace,
        &release,
        payment,
        &clock,
        scenario.ctx(),
    );

    abort 1337
}

#[test]
fun exact_payment_transfers_funds_and_mints_sender_pass() {
    let mut scenario = test_scenario::begin(CREATOR);
    setup_release(&mut scenario, true);

    scenario.next_tx(BUYER);
    let mut marketplace = scenario.take_shared<marketplace::Marketplace>();
    let release = scenario.take_shared<marketplace::WorkflowRelease>();
    let expected_release_id = object::id(&release);
    let clock = scenario.take_shared<Clock>();
    let payment = coin::mint_for_testing<SUI>(PRICE_MIST, scenario.ctx());
    marketplace::purchase_license(
        &mut marketplace,
        &release,
        payment,
        &clock,
        scenario.ctx(),
    );
    test_scenario::return_shared(clock);
    test_scenario::return_shared(release);
    test_scenario::return_shared(marketplace);

    scenario.next_tx(BUYER);
    let pass = scenario.take_from_sender<marketplace::LicensePass>();
    assert!(marketplace::release_id(&pass) == expected_release_id);

    let creator_payment = scenario.take_from_address<Coin<SUI>>(CREATOR);
    assert!(coin::value(&creator_payment) == PRICE_MIST);
    pay::keep(creator_payment, scenario.ctx());
    test_scenario::return_to_sender(&scenario, pass);

    scenario.end();
}

#[test, expected_failure(abort_code = 4)]
fun duplicate_license_aborts() {
    let mut scenario = test_scenario::begin(CREATOR);
    setup_release(&mut scenario, true);

    scenario.next_tx(BUYER);
    let mut marketplace = scenario.take_shared<marketplace::Marketplace>();
    let release = scenario.take_shared<marketplace::WorkflowRelease>();
    let clock = scenario.take_shared<Clock>();
    let payment = coin::mint_for_testing<SUI>(PRICE_MIST, scenario.ctx());
    marketplace::purchase_license(
        &mut marketplace,
        &release,
        payment,
        &clock,
        scenario.ctx(),
    );
    test_scenario::return_shared(clock);
    test_scenario::return_shared(release);
    test_scenario::return_shared(marketplace);

    scenario.next_tx(BUYER);
    let mut marketplace = scenario.take_shared<marketplace::Marketplace>();
    let release = scenario.take_shared<marketplace::WorkflowRelease>();
    let clock = scenario.take_shared<Clock>();
    let payment = coin::mint_for_testing<SUI>(PRICE_MIST, scenario.ctx());
    marketplace::purchase_license(
        &mut marketplace,
        &release,
        payment,
        &clock,
        scenario.ctx(),
    );

    abort 1337
}

#[test, expected_failure(abort_code = 11)]
fun mismatched_root_cannot_change_release_status() {
    let mut scenario = test_scenario::begin(CREATOR);
    setup_release(&mut scenario, true);

    let root_one = scenario.take_from_sender<marketplace::WorkflowRoot>();
    let root_one_id = object::id(&root_one);
    test_scenario::return_to_sender(&scenario, root_one);

    let clock = scenario.take_shared<Clock>();
    marketplace::create_workflow_root(
        b"Second workflow root",
        hash_32(),
        &clock,
        scenario.ctx(),
    );
    test_scenario::return_shared(clock);

    scenario.next_tx(CREATOR);
    let mut root_two = scenario.take_from_sender<marketplace::WorkflowRoot>();
    publish_release_for_root(&mut scenario, &mut root_two, true);
    test_scenario::return_to_sender(&scenario, root_two);

    scenario.next_tx(CREATOR);
    let root_one = scenario.take_from_address_by_id<marketplace::WorkflowRoot>(
        CREATOR,
        root_one_id,
    );
    let mut release_two = scenario.take_shared<marketplace::WorkflowRelease>();
    marketplace::set_release_status(
        &root_one,
        &mut release_two,
        false,
        scenario.ctx(),
    );

    abort 1337
}
