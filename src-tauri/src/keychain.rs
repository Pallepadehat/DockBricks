const SERVICE_NAME: &str = "DockBricks";

#[tauri::command]
pub fn save_keychain_password(key: String, password: String) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE_NAME, &key).map_err(|error| error.to_string())?;
    entry
        .set_password(&password)
        .map_err(|error| error.to_string())
}

#[tauri::command]
pub fn get_keychain_password(key: String) -> Result<Option<String>, String> {
    let entry = keyring::Entry::new(SERVICE_NAME, &key).map_err(|error| error.to_string())?;
    match entry.get_password() {
        Ok(password) => Ok(Some(password)),
        Err(keyring::Error::NoEntry) => Ok(None),
        Err(error) => Err(error.to_string()),
    }
}

#[tauri::command]
pub fn remove_keychain_password(key: String) -> Result<(), String> {
    let entry = keyring::Entry::new(SERVICE_NAME, &key).map_err(|error| error.to_string())?;
    match entry.delete_password() {
        Ok(()) | Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(error.to_string()),
    }
}
