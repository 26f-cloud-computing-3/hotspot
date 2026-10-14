// Google sign-in leaves the app and comes back through /auth/callback, so router state does
// not survive it; the page to return to is kept in sessionStorage for the trip instead.
const RETURN_PATH_KEY = "hotspot:return-path";

/** Only paths inside this app, so a stored value can never send a signed-in user off-site. */
export const isAppPath = (path: string): boolean => {
  return (
    path.startsWith("/") && !path.startsWith("//") && !path.startsWith("/\\")
  );
};

/** Where to land after signing in; anything else falls back to the start page. */
export const safeReturnPath = (path: unknown): string => {
  return typeof path === "string" && isAppPath(path) ? path : "/";
};

export const saveReturnPath = (path: string): void => {
  try {
    sessionStorage.setItem(RETURN_PATH_KEY, safeReturnPath(path));
  } catch {
    // Storage can be blocked (private mode); the user then lands on the start page.
  }
};

export const readReturnPath = (): string => {
  try {
    return safeReturnPath(sessionStorage.getItem(RETURN_PATH_KEY));
  } catch {
    return "/";
  }
};
