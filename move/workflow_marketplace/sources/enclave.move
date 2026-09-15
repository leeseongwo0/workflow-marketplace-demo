module workflow_marketplace::enclave {
    use sui::ed25519;

    const EInvalidSignature: u64 = 0;
    const ENotAdmin: u64 = 1;
    const EInvalidKeyLength: u64 = 2;

    const ED25519_PK_LENGTH: u64 = 32;

    public struct Enclave<phantom T> has key, store {
        id: UID,
        pk: vector<u8>,
    }

    public struct EnclaveConfig<phantom T> has key {
        id: UID,
        admin: address,
    }

    public fun create_config<T: drop>(
        _witness: T,
        ctx: &mut TxContext,
    ) {
        transfer::share_object(EnclaveConfig<T> {
            id: object::new(ctx),
            admin: ctx.sender(),
        });
    }

    public fun register_enclave<T>(
        config: &EnclaveConfig<T>,
        pk: vector<u8>,
        ctx: &mut TxContext,
    ) {
        assert!(config.admin == ctx.sender(), ENotAdmin);
        assert!(pk.length() == ED25519_PK_LENGTH, EInvalidKeyLength);
        transfer::share_object(Enclave<T> {
            id: object::new(ctx),
            pk,
        });
    }

    public fun pk<T>(enclave: &Enclave<T>): vector<u8> { enclave.pk }

    public fun verify_signature<T>(
        enclave: &Enclave<T>,
        signature: &vector<u8>,
        message: &vector<u8>,
    ) {
        assert!(
            ed25519::ed25519_verify(signature, &enclave.pk, message),
            EInvalidSignature,
        );
    }

    #[test_only]
    public fun create_enclave_for_testing<T>(pk: vector<u8>, ctx: &mut TxContext) {
        transfer::share_object(Enclave<T> {
            id: object::new(ctx),
            pk,
        });
    }
}
