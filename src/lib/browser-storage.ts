/** `window.sessionStorage` itself throws when site data is blocked; callers get null instead. */
export function sessionStorageOrNull(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
