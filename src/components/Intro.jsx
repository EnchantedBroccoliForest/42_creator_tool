import { useEffect, useRef, useState } from 'react';
import { useLanguage } from '../hooks/useLanguage';

/**
 * One-time intro splash. Renders a full-viewport overlay with a brief
 * "what this tool is + how it works" display, then fades + scales out when
 * the user clicks Enter, revealing the main flow underneath.
 *
 * Dismissal is persisted to localStorage under a versioned key, so future
 * intro rewrites can re-show by bumping the version.
 */
const STORAGE_KEY = 'pm_tools_intro_seen_v1';
const EXIT_DURATION_MS = 480;

export default function Intro() {
  const { t } = useLanguage();

  const [hasSeen, setHasSeen] = useState(() => {
    try {
      return localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });
  const [mounted, setMounted] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const exitTimerRef = useRef(null);

  // Trigger the entrance animation on the next frame so transitions retarget.
  useEffect(() => {
    if (hasSeen) return undefined;
    const raf = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(raf);
  }, [hasSeen]);

  useEffect(() => {
    return () => {
      if (exitTimerRef.current) clearTimeout(exitTimerRef.current);
    };
  }, []);

  if (hasSeen) return null;

  const dismiss = () => {
    if (leaving) return;
    setLeaving(true);
    try {
      localStorage.setItem(STORAGE_KEY, '1');
    } catch {
      // Best-effort — if storage is blocked the intro will reappear next
      // load, which is harmless.
    }
    exitTimerRef.current = setTimeout(() => setHasSeen(true), EXIT_DURATION_MS);
  };

  const handleKeyDown = (event) => {
    if (event.key === 'Enter' || event.key === ' ' || event.key === 'Escape') {
      event.preventDefault();
      dismiss();
    }
  };

  const cls = [
    'intro',
    mounted && 'intro--mounted',
    leaving && 'intro--leaving',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div
      className={cls}
      role="dialog"
      aria-modal="true"
      aria-labelledby="intro-title"
      onKeyDown={handleKeyDown}
      tabIndex={-1}
    >
      <div className="intro__content">
        <div className="intro__mark stagger-item" style={{ '--stagger': 0 }} aria-hidden="true">
          <svg viewBox="0 0 32 32" width="56" height="56">
            <rect width="32" height="32" rx="7" ry="7" fill="var(--text-1)" />
            <text
              x="16"
              y="22.2"
              textAnchor="middle"
              fontFamily="var(--font-body)"
              fontWeight="800"
              fontSize="18"
              fill="var(--bg-dark)"
              letterSpacing="-0.6"
            >
              42
            </text>
            <circle cx="25" cy="7" r="2.6" fill="var(--accent)" />
            <rect x="6" y="26" width="20" height="1.4" rx="0.7" fill="var(--accent)" opacity="0.85" />
          </svg>
        </div>

        <h1 id="intro-title" className="intro__title stagger-item" style={{ '--stagger': 1 }}>
          {t('intro.title')}
        </h1>
        <p className="intro__subtitle stagger-item" style={{ '--stagger': 2 }}>
          {t('intro.subtitle')}
        </p>

        <ol className="intro__steps" aria-label={t('intro.stepsAria')}>
          <li className="intro__step stagger-item" style={{ '--stagger': 3 }}>
            <span className="intro__step-num">1</span>
            <span className="intro__step-label">{t('intro.step1Label')}</span>
            <span className="intro__step-desc">{t('intro.step1Desc')}</span>
          </li>
          <span className="intro__arrow stagger-item" style={{ '--stagger': 4 }} aria-hidden="true">→</span>
          <li className="intro__step stagger-item" style={{ '--stagger': 5 }}>
            <span className="intro__step-num">2</span>
            <span className="intro__step-label">{t('intro.step2Label')}</span>
            <span className="intro__step-desc">{t('intro.step2Desc')}</span>
          </li>
          <span className="intro__arrow stagger-item" style={{ '--stagger': 6 }} aria-hidden="true">→</span>
          <li className="intro__step stagger-item" style={{ '--stagger': 7 }}>
            <span className="intro__step-num">3</span>
            <span className="intro__step-label">{t('intro.step3Label')}</span>
            <span className="intro__step-desc">{t('intro.step3Desc')}</span>
          </li>
        </ol>

        <button
          type="button"
          className="intro__enter stagger-item"
          style={{ '--stagger': 8 }}
          onClick={dismiss}
          autoFocus
        >
          <span>{t('intro.enter')}</span>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <line x1="5" y1="12" x2="19" y2="12" />
            <polyline points="12 5 19 12 12 19" />
          </svg>
        </button>
      </div>
    </div>
  );
}
