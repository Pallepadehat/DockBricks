import * as React from "react";

import {
  getKeychainPassword,
  isKeychainStorageEnabled,
  removeKeychainPassword,
  saveKeychainPassword,
  setKeychainStorageEnabled,
} from "@/lib/keychain";
import type { Database } from "@/types/models";

const DATABASES_STORAGE_KEY = "dockbricks_databases";
const PERSIST_DELAY_MS = 150;

function loadDatabases(): Database[] {
  try {
    const raw = localStorage.getItem(DATABASES_STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Database[]) : [];
  } catch {
    return [];
  }
}

function withoutStoredPasswords(databases: Database[]): Database[] {
  return databases.map((db) => ({ ...db, password: "" }));
}

export function useSecureDatabases(): {
  databases: Database[];
  setDatabases: React.Dispatch<React.SetStateAction<Database[]>>;
  useKeychain: boolean;
  setUseKeychain: (enabled: boolean) => void;
  passwordsReady: boolean;
} {
  const [databases, setDatabases] = React.useState<Database[]>(loadDatabases);
  const [useKeychain, setUseKeychainState] = React.useState(isKeychainStorageEnabled);
  const [passwordsReady, setPasswordsReady] = React.useState(!useKeychain);
  const previousIds = React.useRef(new Set(databases.map((db) => db.id)));

  React.useEffect(() => {
    let cancelled = false;

    async function hydratePasswords() {
      if (!useKeychain) {
        setPasswordsReady(true);
        return;
      }

      setPasswordsReady(false);
      const hydrated = await Promise.all(
        loadDatabases().map(async (db) => ({
          ...db,
          password: db.password || (await getKeychainPassword(db.id)) || "",
        })),
      );

      if (!cancelled) {
        setDatabases(hydrated);
        setPasswordsReady(true);
      }
    }

    void hydratePasswords();
    return () => {
      cancelled = true;
    };
  }, [useKeychain]);

  React.useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      const currentIds = new Set(databases.map((db) => db.id));
      const removedIds = [...previousIds.current].filter((id) => !currentIds.has(id));
      previousIds.current = currentIds;

      if (useKeychain) {
        localStorage.setItem(DATABASES_STORAGE_KEY, JSON.stringify(withoutStoredPasswords(databases)));

        void Promise.allSettled([
          ...databases.map((db) => saveKeychainPassword(db.id, db.password)),
          ...removedIds.map(removeKeychainPassword),
        ]).then((results) => {
          const rejected = results.filter((result) => result.status === "rejected");
          if (rejected.length > 0) {
            console.error("Failed to persist one or more keychain passwords:", rejected);
          }
        });
      } else {
        void Promise.allSettled(removedIds.map(removeKeychainPassword)).then((results) => {
          const rejected = results.filter((result) => result.status === "rejected");
          if (rejected.length > 0) {
            console.error("Failed to remove one or more keychain passwords:", rejected);
          }
        });
        localStorage.setItem(DATABASES_STORAGE_KEY, JSON.stringify(databases));
      }
    }, PERSIST_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [databases, useKeychain]);

  const setUseKeychain = React.useCallback((enabled: boolean) => {
    setKeychainStorageEnabled(enabled);
    setUseKeychainState(enabled);
  }, []);

  return { databases, setDatabases, useKeychain, setUseKeychain, passwordsReady };
}
