mod commands;
mod container;
mod keychain;
mod models;
mod validation;
mod versions;

use commands::{
    check_container_engine, check_host_port, create_database, delete_container,
    fetch_service_versions, inspect_container, recreate_database, rename_container,
    start_container, stop_container,
};
use keychain::{get_keychain_password, remove_keychain_password, save_keychain_password};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_keychain::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
            check_container_engine,
            check_host_port,
            create_database,
            recreate_database,
            fetch_service_versions,
            inspect_container,
            start_container,
            stop_container,
            delete_container,
            rename_container,
            save_keychain_password,
            get_keychain_password,
            remove_keychain_password,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
