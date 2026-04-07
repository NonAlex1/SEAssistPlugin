const PROXY_BASE = 'https://127.0.0.1:3002';

export interface SfRecord {
  Id: string;
  Name: string;
  [key: string]: unknown;
}

export interface SfQueryResult<T> {
  totalSize: number;
  done: boolean;
  records: T[];
}

export interface Account extends SfRecord {
  Website?: string;
  BillingCity?: string;
}

export interface Opportunity extends SfRecord {
  StageName: string;
  CloseDate: string;
  IsClosed: boolean;
  Amount?: number;
}

// ── Proxy health / auth ─────────────────────────────────────────────────────

export async function checkProxyHealth(): Promise<{ ok: boolean; authenticated: boolean; sfCliAvailable?: boolean; platform?: string }> {
  try {
    const res = await fetch(`${PROXY_BASE}/api/health`);
    if (!res.ok) return { ok: false, authenticated: false };
    return res.json();
  } catch {
    return { ok: false, authenticated: false };
  }
}

export async function saveTokenToProxy(token: string): Promise<void> {
  const res = await fetch(`${PROXY_BASE}/api/auth`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  });
  if (!res.ok) throw new Error('Failed to save token to proxy');
}

export async function clearTokenFromProxy(): Promise<void> {
  await fetch(`${PROXY_BASE}/api/auth`, { method: 'DELETE' });
}

// ── Generic SF REST helpers ─────────────────────────────────────────────────

export class SessionExpiredError extends Error {
  constructor() { super('Session expired — please reconnect to Salesforce.'); }
}

async function sfGet<T>(path: string, params?: Record<string, string>): Promise<T> {
  const url = new URL(`${PROXY_BASE}/api/sf${path}`);
  if (params) Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));
  const res = await fetch(url.toString());
  if (res.status === 401) throw new SessionExpiredError();
  const data = await res.json();
  if (!res.ok) {
    const msg = Array.isArray(data) ? data[0]?.message : data?.error;
    throw new Error(msg ?? `SF API error ${res.status}`);
  }
  return data as T;
}

async function sfPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${PROXY_BASE}/api/sf${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new SessionExpiredError();
  const data = await res.json();
  if (!res.ok) {
    const msg = Array.isArray(data) ? data[0]?.message : data?.error;
    throw new Error(msg ?? `SF API error ${res.status}`);
  }
  return data as T;
}

// ── Account lookup by email domain ─────────────────────────────────────────

export async function findAccountsByDomains(domains: string[]): Promise<Account[]> {
  if (domains.length === 0) return [];

  // Build LIKE conditions for Website field
  const conditions = domains
    .map((d) => `Website LIKE '%${d}%'`)
    .join(' OR ');

  const soql = `SELECT Id, Name, Website, BillingCity FROM Account WHERE ${conditions} ORDER BY Name LIMIT 20`;
  const result = await sfGet<SfQueryResult<Account>>('/query', { q: soql });
  return result.records;
}

// ── Opportunity lookup by account ──────────────────────────────────────────

export async function findOpportunitiesByAccount(accountId: string): Promise<Opportunity[]> {
  const oneYearAgo = new Date();
  oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);
  const dateStr = oneYearAgo.toISOString().split('T')[0];

  const soql = `
    SELECT Id, Name, StageName, CloseDate, IsClosed, Amount
    FROM Opportunity
    WHERE AccountId = '${accountId}'
      AND (IsClosed = false OR CloseDate >= ${dateStr})
    ORDER BY IsClosed ASC, CloseDate DESC
    LIMIT 50
  `;
  const result = await sfGet<SfQueryResult<Opportunity>>('/query', { q: soql });
  return result.records;
}

// ── Create SE Assist record ─────────────────────────────────────────────────

export interface SEAssistPayload {
  Need_by__c?: string;                      // Completed Date (date)
  Summary__c?: string;                      // Summary
  Details__c?: string;                      // Details
  Activity_Type__c?: string;                // multipicklist → semicolon-separated
  Proposed_Extreme_Solution_s__c: string;   // REQUIRED multipicklist
  Demo_Resource_Used__c?: string;           // multipicklist
  Activity_Status__c?: string;              // default: Completed
  Status_Reason__c?: string;
  Competition__c?: string;                  // multipicklist
  Account__c?: string;                      // Account lookup
  Opportunity__c?: string;                  // Opportunity lookup
  Assist_Type__c?: string;                  // default: Global SE Assist
}

export async function createSEAssist(payload: SEAssistPayload): Promise<{ id: string }> {
  // Apply defaults
  const record: SEAssistPayload = {
    Activity_Status__c: 'Completed',
    Assist_Type__c: 'Global SE Assist',
    ...payload,
  };
  return sfPost<{ id: string }>('/sobjects/Global_SE_Assist__c', record);
}

// ── Get current user info ───────────────────────────────────────────────────

export async function getCurrentUser(): Promise<{ user_id: string; display_name: string; email: string }> {
  return sfGet('/../../oauth2/userinfo' as string);
}
