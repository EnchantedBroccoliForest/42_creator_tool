import { useState } from 'react';
import { useLanguage } from '../hooks/useLanguage';
import { useApiKey } from '../hooks/useApiKey';

// Blocking modal shown when no OpenRouter key has been supplied yet.
// The key is passed straight through to `setUserApiKey` and held only in
// module-level memory — we never store it in localStorage, cookies, or React
// state that would survive a reload. Closing the tab is the only persistence.
export default function ApiKeyGate() {
  const { t } = useLanguage();
  const { hasKey, setKey } = useApiKey();
  const [value, setValue] = useState('');
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
    setKey(trimmed);
    setValue('');
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
