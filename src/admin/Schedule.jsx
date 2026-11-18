import { useEffect, useState } from 'react';
import { backend } from '../backend/index.js';
import { useAdmin } from './Admin.jsx';
import { Icon } from '../components/ui.jsx';
import { addDays, formatDate, hhmmToMin, minToHHMM, today, weekStart } from '../lib/slots.js';

const DAY_NAMES = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export default function Schedule() {
  const { settings, weeks, refresh, toast } = useAdmin();
  const [ws, setWs] = useState(weekStart(today()));
  const saved = weeks[ws];
  const [days, setDays] = useState(saved || settings.default_week);
  const [rules, setRules] = useState(pickRules(settings));
  useEffect(() => setDays(weeks[ws] || settings.default_week), [ws, weeks, settings.default_week]);
  useEffect(() => setRules(pickRules(settings)), [settings]);

  const setDay = (i, patch) => setDays((d) => d.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const prevWeek = weeks[addDays(ws, -7)];

  const saveWeek = async () => {
    await backend.saveWeek(ws, days);
    await refresh();
    toast('Week saved');
  };
  const saveRules = async () => {
    await backend.saveSettings({
      max_per_day: Number(rules.max_per_day), slot_minutes: Number(rules.slot_minutes),
      back_to_back: rules.back_to_back, window_days: Number(rules.window_days),
    });
    await refresh();
    toast('Booking rules saved');
  };
  const saveDefault = async () => {
    await backend.saveSettings({ default_week: days });
    await refresh();
    toast('Default week saved. New weeks start from it.');
  };

  return (
    <>
      <h2>Schedule</h2>
      <div className="daynav">
        <button type="button" className="icon-btn" aria-label="Previous week" onClick={() => setWs(addDays(ws, -7))}><Icon name="back" /></button>
        <div className="t">
          Week of {formatDate(ws, 'en', { month: 'short', day: 'numeric' })}
          <div className="small muted">{saved ? 'Saved week' : 'Using default template'}</div>
        </div>
        <button type="button" className="icon-btn" aria-label="Next week" onClick={() => setWs(addDays(ws, 7))}><Icon name="next" /></button>
      </div>

      <div className="card">
        {days.map((d, i) => {
          const date = addDays(ws, i);
          return (
            <div className="sched-row" key={i}>
              <div>
                <div className="dname">{DAY_NAMES[i]}</div>
                <div className="small muted">{formatDate(date, 'en', { month: 'short', day: 'numeric' })}</div>
              </div>
              <label className="switch">
                <input type="checkbox" checked={d.open} onChange={(e) => setDay(i, { open: e.target.checked })} aria-label={`${DAY_NAMES[i]} open`} />
                <span />
              </label>
              <input type="time" className="input input-sm" step="900" aria-label={`${DAY_NAMES[i]} start`} disabled={!d.open}
                value={minToHHMM(d.start)} onChange={(e) => setDay(i, { start: hhmmToMin(e.target.value) })} />
              <input type="time" className="input input-sm" step="900" aria-label={`${DAY_NAMES[i]} end`} disabled={!d.open}
                value={minToHHMM(d.end)} onChange={(e) => setDay(i, { end: hhmmToMin(e.target.value) })} />
            </div>
          );
        })}
      </div>
      <div className="stack" style={{ marginTop: 12 }}>
        <button type="button" className="btn btn-primary" onClick={saveWeek}>Save week</button>
        <div className="row-btns">
          <button type="button" className="btn btn-sm" disabled={!prevWeek} onClick={() => setDays(prevWeek)}
            title={prevWeek ? '' : 'Last week used the default template'}>
            Copy last week
          </button>
          <button type="button" className="btn btn-sm" onClick={() => setDays(settings.default_week)}>Reset to default</button>
          <button type="button" className="btn btn-sm btn-ghost" onClick={saveDefault}>Make this the default</button>
        </div>
      </div>

      <div className="section-title">Booking rules</div>
      <div className="card stack">
        <div className="grid-3">
          <div className="field">
            <label htmlFor="r-max">Max cars / day</label>
            <input id="r-max" type="number" min="1" max="12" className="input input-sm" value={rules.max_per_day}
              onChange={(e) => setRules({ ...rules, max_per_day: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="r-len">Slot (min)</label>
            <input id="r-len" type="number" min="15" step="15" className="input input-sm" value={rules.slot_minutes}
              onChange={(e) => setRules({ ...rules, slot_minutes: e.target.value })} />
          </div>
          <div className="field">
            <label htmlFor="r-win">Window (days)</label>
            <input id="r-win" type="number" min="1" max="7" className="input input-sm" value={rules.window_days}
              onChange={(e) => setRules({ ...rules, window_days: Math.min(7, Number(e.target.value)) })} />
          </div>
        </div>
        <div className="toggle-line">
          <div>
            <div style={{ fontWeight: 500 }}>Back to back</div>
            <div className="small muted">After the first booking, only offer the slots right before or after it.</div>
          </div>
          <label className="switch">
            <input type="checkbox" checked={rules.back_to_back} onChange={(e) => setRules({ ...rules, back_to_back: e.target.checked })} aria-label="Back to back" />
            <span />
          </label>
        </div>
        <button type="button" className="btn" onClick={saveRules}>Save rules</button>
      </div>
    </>
  );
}

const pickRules = (s) => ({ max_per_day: s.max_per_day, slot_minutes: s.slot_minutes, back_to_back: s.back_to_back, window_days: s.window_days });
