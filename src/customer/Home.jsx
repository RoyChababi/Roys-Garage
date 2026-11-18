import { useLang } from '../lib/i18n.js';
import { TopBar, DemoBanner, Icon, go } from '../components/ui.jsx';
import { useConfig } from './config.jsx';
import { prettyPhone, smsLink } from '../lib/messages.js';

export default function Home() {
  const { t, lang } = useLang();
  const { settings } = useConfig();
  const phone = prettyPhone(settings.roy_phone);
  const [l1, ...rest] = t('heroTitle').split(', ');

  return (
    <>
      <DemoBanner />
      <div className="shell">
        <TopBar />
        <main>
          <section className="hero" aria-labelledby="hero-title">
            <div className="hero-rule" aria-hidden="true" />
            <h1 id="hero-title">
              <span className="line">{l1},</span>
              <span className="line">{rest.join(', ')}</span>
            </h1>
            <p className="hero-sub">{t('heroSub')}</p>
            <button className="btn btn-primary" type="button" onClick={() => go('/book')}>
              {t('getPrice')}
            </button>
          </section>

          <h2 className="sr-only">{t('howTitle')}</h2>
          <ol className="steps">
            {[1, 2, 3].map((n) => (
              <li key={n}>
                <div className="num" aria-hidden="true">{n}</div>
                <div className="t">{t(`how${n}`)}</div>
                <div className="d">{t(`how${n}d`)}</div>
              </li>
            ))}
          </ol>

          <ul className="facts">
            <li>
              <Icon name="car" />
              <span>{t('pickupNote')}</span>
            </li>
            <li>
              <Icon name="cash" />
              <span>{t('payNote')}</span>
            </li>
            <li>
              <Icon name="drop" />
              <span>{t('ownOilHome')} <span className="muted">{t('notOffered')}</span></span>
            </li>
          </ul>

          <a className="text-roy" href={smsLink(settings.roy_phone, '')} style={{ textDecoration: 'none', color: 'inherit' }}>
            <div>
              <div className="q">{t('otherWork')}</div>
              <div className="n tnum">{t('textMe', { phone })}</div>
            </div>
            <Icon name="msg" size={26} style={{ color: 'var(--amber)' }} />
          </a>
        </main>
        <footer className="footer-note">
          {lang === 'fr' ? 'Ouest-de-l’Île, Montréal' : 'West Island, Montreal'} <span aria-hidden="true">/</span>{' '}
          <a href="#/admin">{t('adminLink')}</a>
        </footer>
      </div>
    </>
  );
}
