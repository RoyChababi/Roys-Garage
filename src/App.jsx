import { useEffect, useMemo, useState, lazy, Suspense } from 'react';
import { LangContext, detectLang, translate } from './lib/i18n.js';
import { useRoute } from './components/ui.jsx';
import Home from './customer/Home.jsx';
import Flow from './customer/Flow.jsx';
import { ConfigProvider } from './customer/config.jsx';

const Admin = lazy(() => import('./admin/Admin.jsx'));

export default function App() {
  const [lang, setLangState] = useState(detectLang);
  const { path } = useRoute();

  const setLang = (l) => {
    setLangState(l);
    try {
      localStorage.setItem('rg_lang', l);
    } catch {}
  };
  useEffect(() => {
    document.documentElement.lang = lang === 'fr' ? 'fr-CA' : 'en-CA';
    document.title = lang === 'fr' ? 'Garage Roy' : "Roy's Garage";
  }, [lang]);

  const ctx = useMemo(() => ({ lang, setLang, t: (k, v) => translate(lang, k, v) }), [lang]);

  // Supabase magic links land with "#access_token=…"; send those to admin.
  const isAdmin = path.startsWith('/admin') || window.location.hash.includes('access_token=');

  return (
    <LangContext.Provider value={ctx}>
      {isAdmin ? (
        <Suspense fallback={null}>
          <Admin />
        </Suspense>
      ) : (
        <ConfigProvider>{path.startsWith('/book') ? <Flow /> : <Home />}</ConfigProvider>
      )}
    </LangContext.Provider>
  );
}
