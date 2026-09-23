fn main() {
    napi_build::setup();

    // The Pirate core is built separately by `scripts/build-native-host.ts`,
    // which sets this to the directory holding libpirate_ffi_native.a.
    if let Ok(dir) = std::env::var("PIRATE_FFI_LIB_DIR") {
        println!("cargo:rustc-link-search=native={dir}");
        println!("cargo:rustc-link-lib=static=pirate_ffi_native");
        println!("cargo:rerun-if-changed={dir}");
    }
    println!("cargo:rerun-if-env-changed=PIRATE_FFI_LIB_DIR");
}
