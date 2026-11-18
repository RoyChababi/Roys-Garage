import { createContext, useContext, useEffect, useState } from 'react';
import { backend } from '../backend/index.js';
import { DEFAULT_PRICES } from '../lib/pricing.js';
import { DEFAULT_SETTINGS } from '../backend/local.js';

const ConfigContext = createContext(null);

/** Public settings, prices and saved schedule weeks. Starts from defaults so the page renders instantly. */
export function ConfigProvider({ children }) {
  const [cfg, setCfg] = useState({ settings: DEFAULT_SETTINGS, prices: DEFAULT_PRICES, weeks: {}, ready: false });
  useEffect(() => {
    backend.getPublicConfig().then(
      (c) => setCfg({ settings: { ...DEFAULT_SETTINGS, ...c.settings }, prices: { ...DEFAULT_PRICES, ...c.prices }, weeks: c.weeks || {}, ready: true }),
      () => setCfg((c) => ({ ...c, ready: true })),
    );
  }, []);
  return <ConfigContext.Provider value={cfg}>{children}</ConfigContext.Provider>;
}
export const useConfig = () => useContext(ConfigContext);
