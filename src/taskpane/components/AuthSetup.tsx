import * as React from 'react';
import {
  Button,
  Field,
  Input,
  Text,
  Link,
  makeStyles,
  tokens,
} from '@fluentui/react-components';
import { saveTokenToProxy } from '../services/sfApi';
import { setToken } from '../services/storage';

const SF_URL = 'https://extremesaas.my.salesforce.com/';

const useStyles = makeStyles({
  root: {
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalM,
    padding: tokens.spacingHorizontalM,
  },
  steps: {
    paddingLeft: tokens.spacingHorizontalL,
    '& li': { marginBottom: tokens.spacingVerticalXS },
  },
  code: {
    fontFamily: 'monospace',
    fontSize: '11px',
    backgroundColor: tokens.colorNeutralBackground3,
    padding: '2px 6px',
    borderRadius: '3px',
  },
});

interface AuthSetupProps {
  onAuthenticated: () => void;
}

export const AuthSetup: React.FC<AuthSetupProps> = ({ onAuthenticated }) => {
  const styles = useStyles();
  const [token, setTokenInput] = React.useState('');
  const [error, setError] = React.useState('');
  const [saving, setSaving] = React.useState(false);

  const handleOpenSF = () => {
    Office.context.ui.openBrowserWindow(SF_URL);
  };

  const handleSave = async () => {
    const trimmed = token.trim();
    if (!trimmed) {
      setError('Please paste your session token.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      await saveTokenToProxy(trimmed);
      await setToken(trimmed);
      onAuthenticated();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={styles.root}>
      <Text size={500} weight="semibold">Connect to Salesforce</Text>
      <Text size={200}>
        One-time setup. Your session token is stored locally and reused until it expires.
      </Text>

      <Text weight="semibold" size={300}>Steps:</Text>
      <ol className={styles.steps}>
        <li>
          <Link onClick={handleOpenSF}>Click here</Link> to open{' '}
          <span className={styles.code}>extremesaas.my.salesforce.com</span> — SSO will log you in automatically.
        </li>
        <li>
          Press <span className={styles.code}>F12</span> → <b>Application</b> tab →{' '}
          <b>Cookies</b> → select <span className={styles.code}>https://extremesaas.my.salesforce.com</span>{' '}
          <b>(not the lightning.force.com entry)</b>
        </li>
        <li>
          Find the cookie named <span className={styles.code}>sid</span> and copy its full value.
        </li>
        <li>Paste it below and click Connect.</li>
      </ol>

      <Field
        label="Salesforce session token (sid cookie)"
        validationMessage={error}
        validationState={error ? 'error' : 'none'}
      >
        <Input
          placeholder="00D5e000003SyUu!AQEAQ..."
          value={token}
          onChange={(_e, d) => setTokenInput(d.value)}
          type="password"
        />
      </Field>

      <Button appearance="primary" onClick={handleSave} disabled={saving}>
        {saving ? 'Connecting…' : 'Connect'}
      </Button>
    </div>
  );
};
