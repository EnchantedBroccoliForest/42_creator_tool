import { useState } from 'react';
import { useLanguage } from '../hooks/useLanguage';
import { useApiKey, useXapiKey } from '../hooks/useApiKey';

// Blocking modal shown when no OpenRouter key has been supplied yet.
// The key is passed straight through to `setUserApiKey` and held only in
// module-level memory — we never store it in localStorage, cookies, or React
// state that would survive a reload. Closing the tab is the only persistence.
//
// Also exposes an optional xAPI key field for X/Twitter reference
// enrichment, hidden behind a disclosure since most users won't use it.
export default function ApiKeyGate() {
  const { t } = useLanguage();
  const { hasKey, setKey } = useApiKey();
  const { setKey: setXapiKey } = useXapiKey();
  const [value, setValue] = useState('');
  const [xapiValue, setXapiValue] = useState('');
  const [xapiOpen, setXapiOpen] = useState(false);
  const [error, setError] = useState(null);

  if (hasKey) return null;

  const handleSubmit = (event) => {
    event.preventDefault();
    const trimmed = value.trim();
    if (!trimmed) {
      setError(t('apiKey.errorEmpty'));
      return;
    }
    if (!/^sk-or-/.test(trimmed)) {
      setError(t('apiKey.errorFormat'));
      return;
    }
    setError(null);
    if (xapiValue.trim()) {
      setXapiKey(xapiValue.trim());
    }
    setKey(trimmed);
    setValue('');
    setXapiValue('');
  };

  return (
    <div
      className="api-key-gate"
      role="dialog"
      aria-modal="true"
      aria-labelledby="api-key-gate-title"
    >
      <div className="api-key-gate__backdrop" />
      <form className="api-key-gate__panel" onSubmit={handleSubmit}>
        <h2 id="api-key-gate-title" className="api-key-gate__title">
          {t('apiKey.title')}
        </h2>
        <p className="api-key-gate__body">{t('apiKey.body')}</p>
        <input
          type="password"
          className={`input api-key-gate__input${error ? ' input--error' : ''}`}
          placeholder={t('apiKey.placeholder')}
          value={value}
          onChange={(e) => setValue(e.target.value)}
          autoComplete="off"
          spellCheck={false}
          autoFocus
          aria-label={t('apiKey.title')}
        />
        {error && <p className="api-key-gate__error">{error}</p>}

        <details
          className="api-key-gate__details"
          open={xapiOpen}
          onToggle={(e) => setXapiOpen(e.currentTarget.open)}
        >
          <summary className="api-key-gate__summary">
            {t('apiKey.xapiToggle')}
          </summary>
          <p className="api-key-gate__xapi-body">{t('apiKey.xapiBody')}</p>
          <input
            type="password"
            className="input api-key-gate__input"
            placeholder={t('apiKey.xapiPlaceholder')}
            value={xapiValue}
            onChange={(e) => setXapiValue(e.target.value)}
            autoComplete="off"
            spellCheck={false}
            aria-label={t('apiKey.xapiToggle')}
          />
        </details>

        <button type="submit" className="api-key-gate__submit">
          {t('apiKey.submit')}
        </button>
        <p className="api-key-gate__hint">
          {t('apiKey.hint')}{' '}
          <a
            href="https://openrouter.ai/keys"
            target="_blank"
            rel="noreferrer noopener"
            className="api-key-gate__link"
          >
            openrouter.ai/keys
          </a>
        </p>
        <p className="api-key-gate__notice">{t('apiKey.notice')}</p>
      </form>
    </div>
  );
}
