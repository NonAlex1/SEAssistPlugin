import * as React from 'react';
import {
  Button,
  Combobox,
  Field,
  Input,
  Option,
  OptionGroup,
  Spinner,
  Text,
  Textarea,
  makeStyles,
  tokens,
  Checkbox,
} from '@fluentui/react-components';
import { getItemContext, ItemContext } from '../services/emailContext';
import {
  findAccountsByDomains,
  findOpportunitiesByAccount,
  createSEAssist,
  SessionExpiredError,
  Account,
  Opportunity,
  SEAssistPayload,
} from '../services/sfApi';
import { detectActivityTypes } from '../utils/activityTypeDetector';

// ── Picklist constants (from schema) ────────────────────────────────────────

const ACTIVITY_TYPES = ['BoM', 'Demo', 'Partner Enablement', 'Pitch', 'PoC', 'Post-Sales', 'Renewals', 'RFI/RFP', 'Training', 'Other'];

const PROPOSED_SOLUTIONS = [
  'AirDefence (ADSP)', 'ExtremeCloud IQ', 'ExtremeCloud IQ CloudEdge',
  'ExtremeCloud IQ Controller', 'ExtremeCloud IQ Site Engine', 'ExtremeCloud IQ w/ Co-Pilot',
  'ExtremeCloud Orchestrator (XCO)', 'ExtremeCloud SD-WAN', 'ExtremeCloud Site Engine',
  'Extreme Control', 'Extreme Corp Pitch', 'Extreme IP Fabric (SLX-OS)',
  'Extreme Partner Sales AI Assistant', 'Extreme Platform ONE', 'Extreme Platform ONE Security',
  'Extreme SPBm Fabric', 'Extreme Switch Engine', 'Legacy/non-Fabric switching', 'Other',
];

const DEMO_RESOURCES = [
  'Bob Kit- Channel', 'Bob Kit- Internal', 'Corporate demo environment',
  'Customer Testing Center (CTC)', 'Home Lab', 'Local lab',
  'Product Evaluation Program (PEP)', 'Other',
];

const COMPETITION = ['Arista', 'Aruba/HP', 'Cisco', 'Fortinet', 'Huawei', 'Meraki', 'Mist/Juniper', 'Ruckus', 'Ubiquity', 'Other'];

const ACTIVITY_STATUS = ['Pending', 'Assigned', 'On Hold', 'Completed', 'Rejected'];

const STATUS_REASONS = ['Account Team', 'Approval', 'Customer', 'Meeting Scheduled', 'Parts not available in PEP library', 'PLM/Eng'];

// ── Styles ──────────────────────────────────────────────────────────────────

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    padding: tokens.spacingHorizontalM,
    paddingBottom: '80px', // room for submit button
  },
  multiSelect: {
    display: 'flex',
    flexDirection: 'column',
    gap: '2px',
    maxHeight: '120px',
    overflowY: 'auto',
    border: `1px solid ${tokens.colorNeutralStroke1}`,
    borderRadius: tokens.borderRadiusMedium,
    padding: '4px 8px',
  },
  footer: {
    position: 'fixed',
    bottom: 0,
    left: 0,
    right: 0,
    padding: tokens.spacingHorizontalM,
    background: tokens.colorNeutralBackground1,
    borderTop: `1px solid ${tokens.colorNeutralStroke1}`,
    display: 'flex',
    gap: tokens.spacingHorizontalS,
  },
  hint: { color: tokens.colorNeutralForeground3, fontSize: '11px' },
  successBox: {
    padding: tokens.spacingVerticalM,
    background: tokens.colorStatusSuccessBackground1,
    borderRadius: tokens.borderRadiusMedium,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalXS,
  },
});

// ── Multi-checkbox helper ────────────────────────────────────────────────────

const MultiCheckbox: React.FC<{
  options: string[];
  selected: string[];
  onChange: (vals: string[]) => void;
}> = ({ options, selected, onChange }) => {
  const styles = useStyles();
  const toggle = (val: string) => {
    const next = selected.includes(val) ? selected.filter((v) => v !== val) : [...selected, val];
    onChange(next);
  };
  return (
    <div className={styles.multiSelect}>
      {options.map((opt) => (
        <Checkbox
          key={opt}
          label={opt}
          checked={selected.includes(opt)}
          onChange={() => toggle(opt)}
        />
      ))}
    </div>
  );
};

// ── Main form ────────────────────────────────────────────────────────────────

interface Props {
  onSignOut: () => void;
  onSessionExpired: () => void;
}

export const SEAssistForm: React.FC<Props> = ({ onSignOut, onSessionExpired }) => {
  const styles = useStyles();

  // Form state
  const [date, setDate] = React.useState('');
  const [summary, setSummary] = React.useState('');
  const [details, setDetails] = React.useState('');
  const [activityTypes, setActivityTypes] = React.useState<string[]>([]);
  const [proposedSolutions, setProposedSolutions] = React.useState<string[]>([]);
  const [demoResources, setDemoResources] = React.useState<string[]>([]);
  const [competition, setCompetition] = React.useState<string[]>([]);
  const [activityStatus, setActivityStatus] = React.useState('Completed');
  const [statusReason, setStatusReason] = React.useState('');

  // Account / Opportunity
  const [accounts, setAccounts] = React.useState<Account[]>([]);
  const [selectedAccount, setSelectedAccount] = React.useState<Account | null>(null);
  const [accountSearch, setAccountSearch] = React.useState('');
  const [accountDropdownOpen, setAccountDropdownOpen] = React.useState(false);
  const [opportunities, setOpportunities] = React.useState<Opportunity[]>([]);
  const [selectedOpportunity, setSelectedOpportunity] = React.useState<Opportunity | null>(null);
  const searchDebounceRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // UI state
  const [loadingContext, setLoadingContext] = React.useState(true);
  const [loadingAccounts, setLoadingAccounts] = React.useState(false);
  const [loadingOpps, setLoadingOpps] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState('');
  const [createdId, setCreatedId] = React.useState('');
  const [context, setContext] = React.useState<ItemContext | null>(null);

  // Load context on mount
  React.useEffect(() => {
    getItemContext()
      .then((ctx) => {
        setContext(ctx);
        setDate(ctx.date);
        setSummary(ctx.subject);
        setDetails(`Source: ${ctx.type === 'appointment' ? 'Calendar event' : 'Email'}\n`);
        const detected = detectActivityTypes(ctx.subject + ' ' + ctx.body);
        if (detected.length > 0) setActivityTypes(detected);

        // Account lookup from external domains
        if (ctx.externalDomains.length > 0) {
          setLoadingAccounts(true);
          findAccountsByDomains(ctx.externalDomains)
            .then((accts) => {
              setAccounts(accts);
              if (accts.length === 1) handleAccountSelect(accts[0]);
            })
            .catch((e) => { if (e instanceof SessionExpiredError) onSessionExpired(); })
            .finally(() => setLoadingAccounts(false));
        } else {
          // All participants are @extremenetworks.com — pre-select Extreme Networks Corp
          const extremeAccount: Account = {
            Id: '0015e00000sCZR0AAO',
            Name: 'Extreme Networks Corp',
            Website: 'extremenetworks.com',
            BillingCity: '',
          };
          setAccounts([extremeAccount]);
          handleAccountSelect(extremeAccount);
        }
      })
      .catch(() => {}) // non-fatal
      .finally(() => setLoadingContext(false));
  }, []);

  const handleAccountSelect = (acct: Account) => {
    setSelectedAccount(acct);
    setAccountSearch(acct.Name);
    setSelectedOpportunity(null);
    setOpportunities([]);
    setLoadingOpps(true);
    findOpportunitiesByAccount(acct.Id)
      .then(setOpportunities)
      .catch((e) => { if (e instanceof SessionExpiredError) onSessionExpired(); })
      .finally(() => setLoadingOpps(false));
  };

  const runAccountSearch = async (query: string) => {
    if (!query.trim()) return;
    setLoadingAccounts(true);
    try {
      const res = await fetch(
        `https://127.0.0.1:3002/api/sf/query?q=${encodeURIComponent(
          `SELECT Id, Name, Website, BillingCity FROM Account WHERE Name LIKE '%${query}%' ORDER BY Name LIMIT 15`
        )}`
      );
      const data = await res.json();
      const records = data.records ?? [];
      setAccounts(records);
      if (records.length > 0) setAccountDropdownOpen(true);
    } catch {
      setError('Account search failed.');
    } finally {
      setLoadingAccounts(false);
    }
  };

  const handleAccountSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setAccountSearch(val);
    if (!val) {
      setSelectedAccount(null);
      setOpportunities([]);
      setAccounts([]);
      setAccountDropdownOpen(false);
    }
    // Debounce: fire search 400ms after user stops typing, once 3+ chars entered
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (val.trim().length >= 3) {
      searchDebounceRef.current = setTimeout(() => runAccountSearch(val), 400);
    }
  };

  const handleSubmit = async () => {
    if (!proposedSolutions.length) {
      setError('Proposed Extreme Solution(s) is required.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      const payload: SEAssistPayload = {
        Need_by__c: date || undefined,
        Summary__c: summary || undefined,
        Details__c: details || undefined,
        Activity_Type__c: activityTypes.length ? activityTypes.join(';') : undefined,
        Proposed_Extreme_Solution_s__c: proposedSolutions.join(';'),
        Demo_Resource_Used__c: demoResources.length ? demoResources.join(';') : undefined,
        Activity_Status__c: activityStatus,
        Status_Reason__c: statusReason || undefined,
        Competition__c: competition.length ? competition.join(';') : undefined,
        Account__c: selectedAccount?.Id,
        Opportunity__c: selectedOpportunity?.Id,
      };
      const result = await createSEAssist(payload);
      setCreatedId(result.id);
    } catch (e: unknown) {
      if (e instanceof SessionExpiredError) { onSessionExpired(); return; }
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const sfRecordUrl = `https://extremesaas.lightning.force.com/lightning/r/Global_SE_Assist__c/${createdId}/view`;

  if (loadingContext) {
    return <Spinner label="Reading email context…" style={{ marginTop: 32 }} />;
  }

  if (createdId) {
    return (
      <div className={styles.root}>
        <div className={styles.successBox}>
          <Text weight="semibold" size={400}>SE Assist created!</Text>
          <Text size={200}>
            <a href={sfRecordUrl} target="_blank" rel="noreferrer" onClick={() => Office.context.ui.openBrowserWindow(sfRecordUrl)}>
              Open in Salesforce ↗
            </a>
          </Text>
        </div>
        <Button onClick={() => { setCreatedId(''); setSummary(''); setDetails(''); setActivityTypes([]); setProposedSolutions([]); }}>
          Create Another
        </Button>
      </div>
    );
  }

  return (
    <>
      <div className={styles.root}>
        {/* Date */}
        <Field label="Completed Date" required>
          <Input type="date" value={date} onChange={(_e, d) => setDate(d.value)} />
        </Field>

        {/* Account */}
        <Field
          label="Account"
          hint={context?.externalDomains.length ? `Searched by: ${context.externalDomains.join(', ')}` : undefined}
        >
          <Combobox
            placeholder={loadingAccounts ? 'Searching…' : 'Type 3+ chars to search…'}
            value={accountSearch}
            open={accountDropdownOpen}
            onOpenChange={(_e, d) => setAccountDropdownOpen(d.open)}
            onChange={handleAccountSearchChange}
            onOptionSelect={(_e, d) => {
              const acct = accounts.find((a) => a.Id === d.optionValue);
              if (acct) {
                handleAccountSelect(acct);
                setAccountDropdownOpen(false);
              }
            }}
          >
            {accounts.map((a) => (
              <Option key={a.Id} value={a.Id} text={a.Name}>
                {a.Name}{a.BillingCity ? ` · ${a.BillingCity}` : ''}
              </Option>
            ))}
          </Combobox>
        </Field>

        {/* Opportunity */}
        {selectedAccount && (
          <Field label="Opportunity">
            <Combobox
              placeholder={loadingOpps ? 'Loading…' : 'Select opportunity'}
              value={selectedOpportunity?.Name ?? ''}
              onOptionSelect={(_e, d) => {
                const opp = opportunities.find((o) => o.Id === d.optionValue);
                setSelectedOpportunity(opp ?? null);
              }}
            >
              <OptionGroup label="Open">
                {opportunities.filter((o) => !o.IsClosed).map((o) => (
                  <Option key={o.Id} value={o.Id} text={o.Name}>
                    {o.Name} — {o.StageName}{o.Amount != null ? ` · $${o.Amount.toLocaleString()}` : ''}
                  </Option>
                ))}
              </OptionGroup>
              <OptionGroup label="Recently Closed">
                {opportunities.filter((o) => o.IsClosed).map((o) => (
                  <Option key={o.Id} value={o.Id} text={o.Name}>
                    {o.Name} — {o.CloseDate}{o.Amount != null ? ` · $${o.Amount.toLocaleString()}` : ''}
                  </Option>
                ))}
              </OptionGroup>
            </Combobox>
          </Field>
        )}

        {/* Activity Type */}
        <Field label="Activity Type" hint={activityTypes.length ? 'Pre-selected from email content' : undefined}>
          <MultiCheckbox options={ACTIVITY_TYPES} selected={activityTypes} onChange={setActivityTypes} />
        </Field>

        {/* Proposed Solutions — REQUIRED */}
        <Field label="Proposed Extreme Solution(s)" required validationMessage={error && !proposedSolutions.length ? 'Required' : undefined} validationState={error && !proposedSolutions.length ? 'error' : 'none'}>
          <MultiCheckbox options={PROPOSED_SOLUTIONS} selected={proposedSolutions} onChange={setProposedSolutions} />
        </Field>

        {/* Demo Resource */}
        <Field label="Demo Resource Used">
          <MultiCheckbox options={DEMO_RESOURCES} selected={demoResources} onChange={setDemoResources} />
        </Field>

        {/* Competition */}
        <Field label="Competition">
          <MultiCheckbox options={COMPETITION} selected={competition} onChange={setCompetition} />
        </Field>

        {/* Summary */}
        <Field label="Summary">
          <Input value={summary} onChange={(_e, d) => setSummary(d.value)} maxLength={255} />
        </Field>

        {/* Details */}
        <Field label="Details">
          <Textarea value={details} onChange={(_e, d) => setDetails(d.value)} rows={4} />
        </Field>

        {/* Activity Status */}
        <Field label="Activity Status">
          <Combobox value={activityStatus} onOptionSelect={(_e, d) => setActivityStatus(d.optionText ?? 'Completed')}>
            {ACTIVITY_STATUS.map((s) => <Option key={s}>{s}</Option>)}
          </Combobox>
        </Field>

        {/* Status Reason */}
        <Field label="Status Reason">
          <Combobox value={statusReason} onOptionSelect={(_e, d) => setStatusReason(d.optionText ?? '')}>
            <Option value="">—None—</Option>
            {STATUS_REASONS.map((s) => <Option key={s}>{s}</Option>)}
          </Combobox>
        </Field>

        {error && <Text style={{ color: tokens.colorStatusDangerForeground1 }}>{error}</Text>}
      </div>

      <div className={styles.footer}>
        <Button appearance="primary" onClick={handleSubmit} disabled={submitting} style={{ flex: 1 }}>
          {submitting ? <Spinner size="tiny" /> : 'Create SE Assist'}
        </Button>
        <Button appearance="subtle" onClick={onSignOut}>Sign Out</Button>
      </div>
    </>
  );
};
