// Copyright (c), Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

use anyhow::Result;
use axum::{routing::get, routing::post, Router};
use fastcrypto::{ed25519::Ed25519KeyPair, traits::KeyPair};
use nautilus_server::app::process_data;
use nautilus_server::common::{get_attestation, health_check};
use nautilus_server::AppState;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};
use tracing::info;

#[cfg(feature = "aiwf-executor")]
const ENCLAVE_IDENTITY_KEY_PATH: &str = "/tmp/enclave-identity.key";

/// Writes the raw 32-byte Ed25519 private key to a local, enclave-internal
/// file so the sibling Node executor process can load the *same* identity
/// instead of generating its own unrelated key. This is how attestation
/// (this process, via get_attestation embedding eph_kp's public key) stays
/// connected to receipt signing and Seal session signing (the Node
/// process) — see docs/enclave-identity notes in apps/executor.
/// The file never leaves the enclave's own ephemeral filesystem.
#[cfg(feature = "aiwf-executor")]
fn write_enclave_identity_key(eph_kp: &Ed25519KeyPair) -> Result<()> {
    use std::fs;
    use std::os::unix::fs::PermissionsExt;

    let bytes = eph_kp.copy().private().as_ref().to_vec();
    fs::write(ENCLAVE_IDENTITY_KEY_PATH, &bytes)?;
    fs::set_permissions(
        ENCLAVE_IDENTITY_KEY_PATH,
        std::fs::Permissions::from_mode(0o400),
    )?;
    Ok(())
}

#[tokio::main]
async fn main() -> Result<()> {
    let eph_kp = Ed25519KeyPair::generate(&mut rand::thread_rng());

    #[cfg(feature = "aiwf-executor")]
    write_enclave_identity_key(&eph_kp)?;

    // This API_KEY value can be stored with secret-manager. To do that, follow the prompt `sh configure_enclave.sh`
    // Answer `y` to `Do you want to use a secret?` and finish. Otherwise, uncomment this code to use a hardcoded value.
    // let api_key = "045a27812dbe456392913223221306".to_string();
    #[cfg(not(any(feature = "seal-example", feature = "aiwf-executor")))]
    let api_key = std::env::var("API_KEY").expect("API_KEY must be set");

    // NOTE: if built with `seal-example` or `aiwf-executor`, `process_data` does not
    // use this api_key from AppState (seal-example uses SEAL_API_KEY from its own
    // bootstrap; aiwf-executor's /process_data is unused — the real API is the
    // sibling Node executor). Modify this as needed for your application.
    #[cfg(any(feature = "seal-example", feature = "aiwf-executor"))]
    let api_key = String::new();

    let state = Arc::new(AppState { eph_kp, api_key });

    // Spawn host-only init server if seal-example feature is enabled
    #[cfg(feature = "seal-example")]
    {
        nautilus_server::app::spawn_host_init_server(state.clone()).await?;
    }

    // Define your own restricted CORS policy here if needed.
    let cors = CorsLayer::new().allow_methods(Any).allow_headers(Any);

    let app = Router::new()
        .route("/", get(ping))
        .route("/get_attestation", get(get_attestation))
        .route("/process_data", post(process_data))
        .route("/health_check", get(health_check))
        .with_state(state)
        .layer(cors);

    let listener = tokio::net::TcpListener::bind("0.0.0.0:3000").await?;
    info!("listening on {}", listener.local_addr().unwrap());
    axum::serve(listener, app.into_make_service())
        .await
        .map_err(|e| anyhow::anyhow!("Server error: {e}"))
}

async fn ping() -> &'static str {
    "Pong!"
}
