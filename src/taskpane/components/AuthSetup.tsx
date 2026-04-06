import * as React from 'react';
import {
  Button,
  Field,
  Input,
  Spinner,
  Text,
  Link,
  Divider,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { saveTokenToProxy } from '../services/sfApi';
import { setToken } from '../services/storage';

const PROXY_BASE = 'https://127.0.0.1:3002';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalM,
  },
  code: {
    fontFamily: 'monospace',
    fontSize: '11px',
    backgroundColor: tokens.colorNeutralBackground3,
    padding: '2px 6px',
    borderRadius: '3px',
  },
  pendingBox: {
    padding: tokens.spacingVerticalM,
    background: tokens.colorNeutralBackground3,
    borderRadius: tokens.borderRadiusMedium,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
    alignItems: 'center',
  },
  section: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
});

interface AuthSetupProps {
  sfCliAvailable: boolean;
  onAuthenticated: () => void;
}

export const AuthSetup: React.FC<AuthSetupProps> = ({ sfCliAvailable, onAuthenticated }) => {
  const styles = useStyles();

  // SF CLI OAuth flow state
  const [loginPending, setLoginPending] = React.useState(false);
  const [pollInterval, setPollInterval] = React.useState<ReturnType<typeof setInterval> | null>(null);

  // Manual token fallback state
  const [manualToken, setManualToken] = React.useState('');
  const [manualError, setManualError] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  // Clean up polling on unmount
  React.useEffect(() => () => { if (pollInterval) clearInterval(pollInterval); }, [pollInterval]);

  const startSfCliLogin = async () => {
    setLoginPending(true);
    await fetch(`${PROXY_BASE}/api/login/start`, { method: 'POST' });

    // Poll until authenticated
    const interval = setInterval(async () => {
      try {
        const res = await fetch(`${PROXY_BASE}/api/login/status`);
        const data = await res.json();
        if (data.authenticated) {
          clearInterval(interval);
          setPollInterval(null);
          setLoginPending(false);
          onAuthenticated();
        } else if (!data.pending) {
          // Login process ended without success
          clearInterval(interval);
          setPollInterval(null);
          setLoginPending(false);
        }
      } catch { /* proxy unreachable, keep polling */ }
    }, 2000);
    setPollInterval(interval);
  };

  const handleManualSave = async () => {
    const trimmed = manualToken.trim();
    if (!trimmed) { setManualError('Please paste your session token.'); return; }
    setSaving(true);
    setManualError('');
    try {
      await saveTokenToProxy(trimmed);
      await setToken(trimmed);
      onAuthenticated();
    } catch (e: unknown) {
      setManualError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.root}>
      <Text size={500} weight="semibold">Connect to Salesforce</Text>

      {/* ── SF CLI flow ── */}
      {sfCliAvailable ? (
        <div className={styles.section}>
          {loginPending ? (
            <div className={styles.pendingBox}>
              <Spinner size="medium" />
              <Text weight="semibold">Complete sign-in in your browser…</Text>
              <Text size={200}>SSO login opened. Return here when done.</Text>
              <Button appearance="subtle" onClick={() => {
                setLoginPending(false);
                if (pollInterval) { clearInterval(pollInterval); setPollInterval(null); }
              }}>Cancel</Button>
            </div>
          ) : (
            <Button appearance="primary" size="large" onClick={startSfCliLogin}>
              Sign in with Salesforce (SSO)
            </Button>
          )}
        </div>
      ) : (
        <div className={styles.section}>
          <Text size={200}>
            For seamless SSO login, install the Salesforce CLI first:
          </Text>
          <Text size={200} style={{ fontFamily: 'monospace', background: tokens.colorNeutralBackground3, padding: '8px', borderRadius: '4px' }}>
            brew install sf
          </Text>
          <Text size={200}>Then restart the proxy and reload the add-in.</Text>
        </div>
      )}

      <Divider>or use session token manually</Divider>

      {/* ── Manual token fallback ── */}
      <div className={styles.section}>
        <Text size={200}>
          Open <Link onClick={() => Office.context.ui.openBrowserWindow('https://extremesaas.my.salesforce.com/')}>
            Salesforce
          </Link>, then F12 → Application → Cookies →{' '}
          <span className={styles.code}>extremesaas.my.salesforce.com</span> → copy{' '}
          <span className={styles.code}>sid</span> value.
        </Text>
        <Field
          label="Salesforce sid cookie"
          validationMessage={manualError}
          validationState={manualError ? 'error' : 'none'}
        >
          <Input
            placeholder="00D5e000003SyUu!AQEAQ..."
            value={manualToken}
            onChange={(e) => setManualToken(e.target.value)}
            type="password"
          />
        </Field>
        <Button onClick={handleManualSave} disabled={saving}>
          {saving ? 'Connecting…' : 'Connect with token'}
        </Button>
      </div>
    </div>
  );
};
