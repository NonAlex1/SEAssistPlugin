import * as React from 'react';
import { FluentProvider, webLightTheme, Spinner, Text, makeStyles, tokens } from '@fluentui/react-components';
import { AuthSetup } from './AuthSetup';
import { SEAssistForm } from './SEAssistForm';
import { checkProxyHealth, clearTokenFromProxy } from '../services/sfApi';
import { clearToken, getToken, setToken } from '../services/storage';

const useStyles = makeStyles({
  root: { height: '100vh', overflowY: 'auto' },
  error: {
    padding: tokens.spacingHorizontalM,
    display: 'flex',
    flexDirection: 'column',
    gap: tokens.spacingVerticalS,
  },
  errorBox: {
    background: tokens.colorStatusDangerBackground1,
    padding: tokens.spacingVerticalS,
    borderRadius: tokens.borderRadiusMedium,
  },
});

type AppState = 'loading' | 'proxy-down' | 'auth' | 'ready';

export const App: React.FC = () => {
  const styles = useStyles();
  const [state, setState] = React.useState<AppState>('loading');
  const [sfCliAvailable, setSfCliAvailable] = React.useState(false);
  const [proxyPlatform, setProxyPlatform] = React.useState('');

  const bootstrap = React.useCallback(async () => {
    setState('loading');
    const health = await checkProxyHealth();
    if (!health.ok) {
      setState('proxy-down');
      return;
    }
    setSfCliAvailable(!!health.sfCliAvailable);
    setProxyPlatform(health.platform ?? '');
    if (health.authenticated) {
      setState('ready');
      return;
    }
    // Proxy is up but not authenticated — try restoring token from storage
    const storedToken = await getToken();
    if (storedToken) {
      try {
        const { saveTokenToProxy } = await import('../services/sfApi');
        await saveTokenToProxy(storedToken);
        setState('ready');
        return;
      } catch {
        await clearToken();
      }
    }
    setState('auth');
  }, []);

  React.useEffect(() => {
    bootstrap();
  }, [bootstrap]);

  const handleSignOut = async () => {
    await clearTokenFromProxy();
    await clearToken();
    setState('auth');
  };

  const handleSessionExpired = async () => {
    await clearToken();
    setState('auth');
  };

  if (state === 'loading') {
    return (
      <FluentProvider theme={webLightTheme}>
        <div style={{ display: 'flex', justifyContent: 'center', marginTop: 48 }}>
          <Spinner label="Starting up…" />
        </div>
      </FluentProvider>
    );
  }

  if (state === 'proxy-down') {
    return (
      <FluentProvider theme={webLightTheme}>
        <div className={styles.error}>
          <Text size={500} weight="semibold">Proxy not running</Text>
          <div className={styles.errorBox}>
            <Text size={200}>
              The SE Assist proxy server is not reachable. Please start it:
            </Text>
          </div>
          <Text size={200} style={{ fontFamily: 'monospace', background: '#f0f0f0', padding: '8px', borderRadius: '4px' }}>
            cd SEAssistPlugin/proxy && npm install && node server.js
          </Text>
          <Text size={200}>Then click Retry.</Text>
          <button onClick={bootstrap} style={{ marginTop: 8 }}>Retry</button>
        </div>
      </FluentProvider>
    );
  }

  return (
    <FluentProvider theme={webLightTheme}>
      <div className={styles.root}>
        {state === 'auth' ? (
          <AuthSetup sfCliAvailable={sfCliAvailable} platform={proxyPlatform} onAuthenticated={() => setState('ready')} />
        ) : (
          <SEAssistForm onSignOut={handleSignOut} onSessionExpired={handleSessionExpired} />
        )}
      </div>
    </FluentProvider>
  );
};
