/** Copies to the clipboard; false when the browser refuses (no permission, insecure page). */
export const copyText = async (text: string): Promise<boolean> => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

/** The full address of an in-app path, as a friend would open it. */
export const appUrl = (path: string): string => {
  return new URL(path, window.location.origin).href;
};
