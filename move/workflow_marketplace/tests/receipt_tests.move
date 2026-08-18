#[test_only]
module workflow_marketplace::receipt_tests;

use sui::clock::Clock;
use sui::coin;
use sui::object;
use sui::sui::SUI;
use sui::test_scenario;
use workflow_marketplace::marketplace;

const RUNNER: address = @0xB0B;
const OTHER: address = @0xCAFE;
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

// Deterministic Ed25519 signature over the exact ReceiptMessage BCS bytes
// produced by setup_licensed_runner. The test-only seed is 32 bytes of 0x07.
fun valid_signature(): vector<u8> {
    x"939c51d1da3bd31c682755fb8fb84c86fa35b87a73c45db1a8c6b009d9f7161139d68c019ae9ee6b6bc276509773db51f45d509ba0c53e2b27aad120efa8ca02"
}

fun setup_licensed_runner(scenario: &mut test_scenario::Scenario) {
    test_scenario::create_system_objects(scenario);
    marketplace::init_for_testing(scenario.ctx());

    scenario.next_tx(RUNNER);
    let admin_cap = scenario.take_from_sender<marketplace::MarketplaceAdminCap>();
    marketplace::create_marketplace(admin_cap, executor_public_key(), scenario.ctx());

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
fun valid_executor_signature_mints_receipt() {
    let mut scenario = test_scenario::begin(RUNNER);
    setup_licensed_runner(&mut scenario);

    let mut market = scenario.take_shared<marketplace::Marketplace>();
    let release = scenario.take_shared<marketplace::WorkflowRelease>();
    let pass = scenario.take_from_sender<marketplace::LicensePass>();
    let release_id = object::id_address(&release);
    let nonce_hash = hash_32(6);
    assert!(!marketplace::receipt_nonce_used(&market, copy nonce_hash));

    marketplace::record_execution(
        &mut market,
        &pass,
        release_id,
        RUNNER,
        hash_32(4),
        hash_32(5),
        1_723_900_000_000,
        copy nonce_hash,
        valid_signature(),
        scenario.ctx(),
    );
    assert!(marketplace::receipt_nonce_used(&market, copy nonce_hash));

    test_scenario::return_to_sender(&scenario, pass);
    test_scenario::return_shared(release);
    test_scenario::return_shared(market);

    scenario.next_tx(RUNNER);
    let receipt = scenario.take_from_sender<marketplace::ExecutionReceipt>();
    assert!(marketplace::receipt_runner(&receipt) == RUNNER);
    assert!(marketplace::receipt_nonce_hash(&receipt) == &nonce_hash);
    test_scenario::return_to_sender(&scenario, receipt);
    scenario.end();
}

#[test, expected_failure(abort_code = 7)]
fun modified_payload_rejects_executor_signature() {
    let mut scenario = test_scenario::begin(RUNNER);
    setup_licensed_runner(&mut scenario);

    let mut market = scenario.take_shared<marketplace::Marketplace>();
    let release = scenario.take_shared<marketplace::WorkflowRelease>();
    let pass = scenario.take_from_sender<marketplace::LicensePass>();
    marketplace::record_execution(
        &mut market,
        &pass,
        object::id_address(&release),
        RUNNER,
        hash_32(4),
        hash_32(7),
        1_723_900_000_000,
        hash_32(6),
        valid_signature(),
        scenario.ctx(),
    );

    abort 1337
}

#[test, expected_failure(abort_code = 5)]
fun wrong_runner_aborts() {
    let mut scenario = test_scenario::begin(RUNNER);
    setup_licensed_runner(&mut scenario);

    let mut market = scenario.take_shared<marketplace::Marketplace>();
    let release = scenario.take_shared<marketplace::WorkflowRelease>();
    let pass = scenario.take_from_sender<marketplace::LicensePass>();
    marketplace::record_execution(
        &mut market,
        &pass,
        object::id_address(&release),
        OTHER,
        hash_32(4),
        hash_32(5),
        1_723_900_000_000,
        hash_32(6),
        valid_signature(),
        scenario.ctx(),
    );

    abort 1337
}

#[test, expected_failure(abort_code = 6)]
fun wrong_release_license_pairing_aborts() {
    let mut scenario = test_scenario::begin(RUNNER);
    setup_licensed_runner(&mut scenario);

    let mut market = scenario.take_shared<marketplace::Marketplace>();
    let pass = scenario.take_from_sender<marketplace::LicensePass>();
    marketplace::record_execution(
        &mut market,
        &pass,
        OTHER,
        RUNNER,
        hash_32(4),
        hash_32(5),
        1_723_900_000_000,
        hash_32(6),
        valid_signature(),
        scenario.ctx(),
    );

    abort 1337
}

#[test, expected_failure(abort_code = 12)]
fun pass_registered_in_another_marketplace_aborts() {
    let mut scenario = test_scenario::begin(RUNNER);
    setup_licensed_runner(&mut scenario);

    // A second Marketplace can exist only through this test-only helper. It models the
    // pre-fix attack while keeping production creation restricted by the one-use cap.
    marketplace::create_marketplace_for_testing(executor_public_key(), scenario.ctx());
    scenario.next_tx(RUNNER);

    let mut foreign_market = scenario.take_shared<marketplace::Marketplace>();
    let release = scenario.take_shared<marketplace::WorkflowRelease>();
    let pass = scenario.take_from_sender<marketplace::LicensePass>();
    marketplace::record_execution(
        &mut foreign_market,
        &pass,
        object::id_address(&release),
        RUNNER,
        hash_32(4),
        hash_32(5),
        1_723_900_000_000,
        hash_32(6),
        valid_signature(),
        scenario.ctx(),
    );

    abort 1337
}

#[test, expected_failure(abort_code = 8)]
fun reused_receipt_nonce_aborts() {
    let mut scenario = test_scenario::begin(RUNNER);
    setup_licensed_runner(&mut scenario);

    let mut market = scenario.take_shared<marketplace::Marketplace>();
    let release = scenario.take_shared<marketplace::WorkflowRelease>();
    let pass = scenario.take_from_sender<marketplace::LicensePass>();
    let release_id = object::id_address(&release);
    marketplace::record_execution(
        &mut market,
        &pass,
        release_id,
        RUNNER,
        hash_32(4),
        hash_32(5),
        1_723_900_000_000,
        hash_32(6),
        valid_signature(),
        scenario.ctx(),
    );
    marketplace::record_execution(
        &mut market,
        &pass,
        release_id,
        RUNNER,
        hash_32(4),
        hash_32(5),
        1_723_900_000_000,
        hash_32(6),
        valid_signature(),
        scenario.ctx(),
    );

    abort 1337
}

#[test, expected_failure(abort_code = 9)]
fun malformed_hash_length_aborts() {
    let mut scenario = test_scenario::begin(RUNNER);
    setup_licensed_runner(&mut scenario);

    let mut market = scenario.take_shared<marketplace::Marketplace>();
    let release = scenario.take_shared<marketplace::WorkflowRelease>();
    let pass = scenario.take_from_sender<marketplace::LicensePass>();
    marketplace::record_execution(
        &mut market,
        &pass,
        object::id_address(&release),
        RUNNER,
        vector[4],
        hash_32(5),
        1_723_900_000_000,
        hash_32(6),
        valid_signature(),
        scenario.ctx(),
    );

    abort 1337
}

#[test, expected_failure(abort_code = 9)]
fun malformed_output_hash_length_aborts() {
    let mut scenario = test_scenario::begin(RUNNER);
    setup_licensed_runner(&mut scenario);

    let mut market = scenario.take_shared<marketplace::Marketplace>();
    let release = scenario.take_shared<marketplace::WorkflowRelease>();
    let pass = scenario.take_from_sender<marketplace::LicensePass>();
    marketplace::record_execution(
        &mut market,
        &pass,
        object::id_address(&release),
        RUNNER,
        hash_32(4),
        vector[5],
        1_723_900_000_000,
        hash_32(6),
        valid_signature(),
        scenario.ctx(),
    );

    abort 1337
}

#[test, expected_failure(abort_code = 9)]
fun malformed_nonce_hash_length_aborts() {
    let mut scenario = test_scenario::begin(RUNNER);
    setup_licensed_runner(&mut scenario);

    let mut market = scenario.take_shared<marketplace::Marketplace>();
    let release = scenario.take_shared<marketplace::WorkflowRelease>();
    let pass = scenario.take_from_sender<marketplace::LicensePass>();
    marketplace::record_execution(
        &mut market,
        &pass,
        object::id_address(&release),
        RUNNER,
        hash_32(4),
        hash_32(5),
        1_723_900_000_000,
        vector[6],
        valid_signature(),
        scenario.ctx(),
    );

    abort 1337
}
