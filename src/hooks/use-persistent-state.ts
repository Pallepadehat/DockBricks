import * as React from "react";

const PERSIST_DELAY_MS = 150;

function loadFromStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function usePersistentState<T>(
  key: string,
  fallback: T,
): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = React.useState<T>(() => loadFromStorage(key, fallback));
  const latestValue = React.useRef(value);

  React.useEffect(() => {
    latestValue.current = value;
    const timeoutId = window.setTimeout(() => {
      try {
        localStorage.setItem(key, JSON.stringify(latestValue.current));
      } catch (error) {
        console.error(`Failed to persist ${key}:`, error);
      }
    }, PERSIST_DELAY_MS);

    return () => window.clearTimeout(timeoutId);
  }, [key, value]);

  return [value, setValue];
}
