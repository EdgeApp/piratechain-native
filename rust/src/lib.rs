//! Node addon over the Pirate wallet service C ABI.
//!
//! The whole native surface upstream exposes is two functions:
//!
//! ```c
//! char *pirate_wallet_service_invoke_json(const char *request_json, bool pretty);
//! void  pirate_wallet_service_free_string(char *ptr);
//! ```
//!
//! so this addon is a byte transport. It hands the request string down and the
//! response string back, and parses neither.

use std::ffi::{c_char, CStr, CString};

use napi::{Env, Error, JsString, Result, Task};
use napi_derive::napi;

extern "C" {
    fn pirate_wallet_service_invoke_json(request_json: *const c_char, pretty: bool)
        -> *mut c_char;
    fn pirate_wallet_service_free_string(ptr: *mut c_char);
}

/// Calls the C ABI and copies the answer out.
///
/// `pirate_wallet_service_invoke_json` reaches `WalletService::execute_blocking`,
/// which calls `Runtime::block_on` on a process-wide tokio runtime. Entering a
/// runtime from inside another one panics, so this must never run on napi's
/// tokio executor — hence `Task`, whose `compute` runs on a libuv worker with
/// no tokio context.
fn invoke_blocking(request: &str) -> Result<String> {
    let request = CString::new(request)
        .map_err(|error| Error::from_reason(format!("request contains a NUL byte: {error}")))?;

    // SAFETY: `request` outlives the call, and the returned pointer is either
    // null or an owned C string this function frees exactly once on every path.
    unsafe {
        let raw = pirate_wallet_service_invoke_json(request.as_ptr(), false);
        if raw.is_null() {
            return Err(Error::from_reason(
                "pirate_wallet_service_invoke_json returned null",
            ));
        }
        let owned = CStr::from_ptr(raw).to_str().map(str::to_owned);
        pirate_wallet_service_free_string(raw);
        owned.map_err(|error| Error::from_reason(format!("response is not UTF-8: {error}")))
    }
}

pub struct InvokeTask {
    request: String,
}

impl Task for InvokeTask {
    type Output = String;
    type JsValue = JsString;

    fn compute(&mut self) -> Result<Self::Output> {
        invoke_blocking(&self.request)
    }

    fn resolve(&mut self, env: Env, output: Self::Output) -> Result<Self::JsValue> {
        env.create_string(&output)
    }
}

/// Sends one JSON request to the wallet service and resolves with its reply.
#[napi(ts_return_type = "Promise<string>")]
pub fn invoke(request: String) -> napi::bindgen_prelude::AsyncTask<InvokeTask> {
    napi::bindgen_prelude::AsyncTask::new(InvokeTask { request })
}
