import { invoke } from "@tauri-apps/api/core";

export const KEYCHAIN_ENABLED_STORAGE_KEY = "dockbricks_use_keychain";

export function isKeychainStorageEnabled(): boolean {
  const raw = localStorage.getItem(KEYCHAIN_ENABLED_STORAGE_KEY);
  return raw === null ? true : raw === "true";
}

export function setKeychainStorageEnabled(enabled: boolean) {
  localStorage.setItem(KEYCHAIN_ENABLED_STORAGE_KEY, String(enabled));
}

export function databasePasswordKey(databaseId: string) {
  return `dockbricks:database:${databaseId}:password`;
}

export async function saveKeychainPassword(databaseId: string, password: string) {
  if (!password) {
    await removeKeychainPassword(databaseId);
    return;
  }

  await invoke("save_keychain_password", {
    key: databasePasswordKey(databaseId),
    password,
  });
}

export async function getKeychainPassword(databaseId: string): Promise<string | null> {
  try {
    const value = await invoke<string | null>("get_keychain_password", {
      key: databasePasswordKey(databaseId),
    });
    return value ?? null;
  } catch {
    return null;
  }
}

export async function removeKeychainPassword(databaseId: string) {
  try {
    await invoke("remove_keychain_password", {
      key: databasePasswordKey(databaseId),
    });
  } catch {
    // Missing keychain items are safe to ignore.
  }
}
