// Storage wrapper — uses localStorage (available in all Outlook WebView versions).
// OfficeRuntime.storage requires Mailbox 1.9+ and isn't universally available.

const TOKEN_KEY = 'sf_session_token';

export async function getToken(): Promise<string | null> {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  localStorage.setItem(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  localStorage.removeItem(TOKEN_KEY);
}
