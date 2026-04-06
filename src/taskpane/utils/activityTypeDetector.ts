// Keyword-based heuristic to pre-select Activity Type from email/calendar text.
// Activity_Type__c is a multipicklist — returns array of matching values.

const RULES: Array<{ keywords: string[]; value: string }> = [
  { keywords: ['demo', 'demonstration', 'showcase', 'show case'], value: 'Demo' },
  { keywords: ['poc', 'proof of concept', 'proof-of-concept', 'pilot', 'trial'], value: 'PoC' },
  { keywords: ['pitch', 'sales pitch', 'executive pitch'], value: 'Pitch' },
  { keywords: ['bom', 'bill of material', 'bill of materials'], value: 'BoM' },
  { keywords: ['partner enablement', 'partner training', 'partner workshop'], value: 'Partner Enablement' },
  { keywords: ['rfp', 'rfi', 'request for proposal', 'request for information', 'rfq'], value: 'RFI/RFP' },
  { keywords: ['training', 'workshop', 'webinar', 'education session'], value: 'Training' },
  { keywords: ['renewal', 'renew', 'subscription renewal'], value: 'Renewals' },
  { keywords: ['post-sales', 'post sales', 'implementation', 'onboarding', 'deployment'], value: 'Post-Sales' },
  { keywords: ['gtac', 'support case', 'tac case', 'escalation'], value: 'Other' },
  { keywords: ['license', 'licensing', 'temp license'], value: 'Other' },
];

export function detectActivityTypes(text: string): string[] {
  const lower = text.toLowerCase();
  const matched = new Set<string>();
  for (const rule of RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) {
      matched.add(rule.value);
    }
  }
  return Array.from(matched);
}
