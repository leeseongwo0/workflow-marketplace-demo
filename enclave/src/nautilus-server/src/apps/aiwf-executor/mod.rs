// Copyright (c), Mysten Labs, Inc.
// SPDX-License-Identifier: Apache-2.0

use crate::common::{IntentMessage, ProcessDataRequest, ProcessedDataResponse};
use crate::AppState;
use crate::EnclaveError;
use axum::extract::State;
use axum::Json;
use serde_json::Value;
use serde_repr::{Deserialize_repr, Serialize_repr};
use std::sync::Arc;

/// ====================================================
/// This app deliberately does NOT use Nautilus's typed process_data
/// pattern. The real executor API (challenge issuance, license/attestation
/// checks, execution, receipt signing) is the existing, already-tested
/// TypeScript service in `apps/executor` of the workflow-marketplace-demo
/// repo. Inside the enclave it runs as a sibling process to this Rust
/// binary and is exposed on its own vsock-forwarded port (see run.sh),
/// separate from this binary's port 3000.
///
/// This Rust binary's only real job for this app is `/get_attestation`
/// (already generic in common.rs) plus the network bootstrap in run.sh.
/// This stub exists only to satisfy main.rs's hardcoded
/// `.route("/process_data", post(process_data))`, which is not reachable
/// in normal operation since nothing external is forwarded to port 3000's
/// /process_data path for this app.
/// ====================================================
#[derive(Serialize_repr, Deserialize_repr, Debug)]
#[repr(u8)]
pub enum IntentScope {
    ProcessData = 0,
}

pub async fn process_data(
    State(_state): State<Arc<AppState>>,
    Json(_request): Json<ProcessDataRequest<Value>>,
) -> Result<Json<ProcessedDataResponse<IntentMessage<Value>>>, EnclaveError> {
    Err(EnclaveError::GenericError(
        "unused: the aiwf-executor API is served by the Node process on its own \
         forwarded port, not through this Rust binary's /process_data"
            .to_string(),
    ))
}
