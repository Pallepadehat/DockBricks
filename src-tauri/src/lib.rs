mod commands;
mod container;
mod models;
mod validation;
mod versions;

use commands::{
    check_container_engine, check_host_port, create_database, delete_container,
    fetch_service_versions, inspect_container, recreate_database, rename_container,
    start_container, stop_container,
};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
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
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
