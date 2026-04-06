// Thin wrapper around OfficeRuntime.storage (persists across sessions)

const TOKEN_KEY = 'sf_session_token';

export async function getToken(): Promise<string | null> {
  try {
    const val = await OfficeRuntime.storage.getItem(TOKEN_KEY);
    return val ?? null;
  } catch {
    return null;
  }
}

export async function setToken(token: string): Promise<void> {
  await OfficeRuntime.storage.setItem(TOKEN_KEY, token);
}

export async function clearToken(): Promise<void> {
  await OfficeRuntime.storage.removeItem(TOKEN_KEY);
}
