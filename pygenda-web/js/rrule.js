/*
  rrule.js – Pygenda Web
  RFC 5545 recurrence expansion (subset sufficient for Pygenda's needs plus
  common imported rules). Replaces dateutil.rrule as used in pygenda_calendar.py.
  GPL-3.0-only (see COPYING).
*/
'use strict';

PG.RRule = (function () {
  const D = PG.D;
  const WD = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU'];
  const SUBDAY = { HOURLY: 3600, MINUTELY: 60, SECONDLY: 1 };

  function parseByday(s) {
    const m = /^([+-]?\d{1,2})?(MO|TU|WE|TH|FR|SA|SU)$/i.exec(String(s).trim());
    if (!m) return null;
    return { n: m[1] ? parseInt(m[1], 10) : 0, wd: WD.indexOf(m[2].toUpperCase()) };
  }
  const ints = a => (a || []).map(x => parseInt(x, 10)).filter(x => !isNaN(x));

  /* Days (1..n) of month y/m matching nth-weekday spec (scope = month) */
  function bydayInMonth(y, m, bydays) {
    const [first, n] = D.monthrange(y, m);
    const out = new Set();
    for (const b of bydays) {
      const days = [];
      for (let d = 1; d <= n; d++) if ((first + d - 1) % 7 === b.wd) days.push(d);
      if (b.n === 0) days.forEach(d => out.add(d));
      else if (b.n > 0 && b.n <= days.length) out.add(days[b.n - 1]);
      else if (b.n < 0 && -b.n <= days.length) out.add(days[days.length + b.n]);
    }
    return out;
  }
  /* Dates in year y matching nth-weekday spec (scope = year) */
  function bydayInYear(y, bydays) {
    const out = [];
    for (const b of bydays) {
      const list = [];
      for (let dt = new Date(y, 0, 1); dt.getFullYear() === y; dt = D.addDays(dt, 1)) {
        if (D.weekday(dt) === b.wd) list.push(dt);
      }
      if (b.n === 0) out.push(...list);
      else if (b.n > 0 && b.n <= list.length) out.push(list[b.n - 1]);
      else if (b.n < 0 && -b.n <= list.length) out.push(list[list.length + b.n]);
    }
    return out;
  }
  function monthdays(y, m, bymonthday) {
    const n = D.daysInMonth(y, m);
    const out = new Set();
    for (const md of bymonthday) {
      const d = md > 0 ? md : n + md + 1;
      if (d >= 1 && d <= n) out.add(d);
    }
    return out;
  }
  function intersect(a, b) { return new Set([...a].filter(x => b.has(x))); }

  /* Candidate dates (date part only) for one month according to rules */
  function daysForMonth(y, m, r, d0) {
    let set = null;
    if (r.bymonthday.length) set = monthdays(y, m, r.bymonthday);
    if (r.byday.length) {
      const s2 = bydayInMonth(y, m, r.byday);
      set = set ? intersect(set, s2) : s2;
    }
    if (!set) {
      set = new Set();
      if (d0 <= D.daysInMonth(y, m)) set.add(d0);
    }
    return [...set].sort((a, b) => a - b).map(d => new Date(y, m - 1, d));
  }

  function applySetpos(list, setpos) {
    if (!setpos.length) return list;
    const out = [];
    for (const p of setpos) {
      const i = p > 0 ? p - 1 : list.length + p;
      if (i >= 0 && i < list.length) out.push(list[i]);
    }
    return out.sort((a, b) => a - b);
  }

  function compile(en) {
    const st = PG.ical_dt.parse(en.dtstart);
    if (!st) throw new Error('No DTSTART');
    const rr = en.rrule || {};
    const freq = String((rr.FREQ || [''])[0]).toUpperCase();
    if (!['YEARLY', 'MONTHLY', 'WEEKLY', 'DAILY', 'HOURLY', 'MINUTELY', 'SECONDLY'].includes(freq))
      throw new Error('Unsupported FREQ ' + freq);
    const r = {
      freq,
      interval: Math.max(1, parseInt((rr.INTERVAL || [1])[0], 10) || 1),
      count: rr.COUNT ? parseInt(rr.COUNT[0], 10) : null,
      until: null, untilIsDate: false,
      byday: (rr.BYDAY || []).map(parseByday).filter(Boolean),
      bymonth: ints(rr.BYMONTH),
      bymonthday: ints(rr.BYMONTHDAY),
      bysetpos: ints(rr.BYSETPOS),
      wkst: rr.WKST ? Math.max(0, WD.indexOf(String(rr.WKST[0]).toUpperCase())) : 0,
      start: st.dt, isDate: st.isDate,
      h: st.dt.getHours(), mi: st.dt.getMinutes(), s: st.dt.getSeconds(),
    };
    if (rr.UNTIL) {
      const u = PG.ical_dt.parse(String(rr.UNTIL[0]));
      if (u) {
        r.untilIsDate = u.isDate;
        // A date-only UNTIL includes the whole day
        r.until = u.isDate ? new Date(u.dt.getFullYear(), u.dt.getMonth(), u.dt.getDate(), 23, 59, 59) : u.dt;
      }
    }
    return r;
  }

  function withTime(dt, r) {
    return r.isDate ? dt : new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), r.h, r.mi, r.s);
  }

  /* Generate candidate occurrences of period k (sorted) */
  function period(r, k) {
    const st = r.start;
    const y0 = st.getFullYear(), m0 = st.getMonth() + 1, d0 = st.getDate();
    let out = [];
    switch (r.freq) {
      case 'YEARLY': {
        const y = y0 + k * r.interval;
        if (y > 9999) return null;
        if (!r.bymonth.length && r.byday.length && !r.bymonthday.length) {
          out = bydayInYear(y, r.byday);
        } else {
          const months = r.bymonth.length ? r.bymonth : (r.bymonthday.length ? [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] : [m0]);
          for (const m of months.slice().sort((a, b) => a - b)) {
            if (!r.bymonth.length && !r.byday.length && !r.bymonthday.length) {
              if (d0 <= D.daysInMonth(y, m)) out.push(new Date(y, m - 1, d0));
            } else {
              out.push(...daysForMonth(y, m, r, d0));
            }
          }
        }
        break;
      }
      case 'MONTHLY': {
        const mi = (m0 - 1) + k * r.interval;
        const y = y0 + Math.floor(mi / 12), m = (mi % 12) + 1;
        if (y > 9999) return null;
        if (r.bymonth.length && !r.bymonth.includes(m)) return [];
        out = daysForMonth(y, m, r, d0);
        break;
      }
      case 'WEEKLY': {
        const wstart = D.addDays(D.dayStart(st), -((D.weekday(st) - r.wkst + 7) % 7) + k * 7 * r.interval);
        if (wstart.getFullYear() > 9999) return null;
        const wds = r.byday.length ? [...new Set(r.byday.map(b => b.wd))] : [D.weekday(st)];
        for (let i = 0; i < 7; i++) {
          const dt = D.addDays(wstart, i);
          if (wds.includes(D.weekday(dt)) && (!r.bymonth.length || r.bymonth.includes(dt.getMonth() + 1))) out.push(dt);
        }
        break;
      }
      case 'DAILY': {
        const dt = D.addDays(D.dayStart(st), k * r.interval);
        if (dt.getFullYear() > 9999) return null;
        if (r.byday.length && !r.byday.some(b => b.wd === D.weekday(dt))) return [];
        if (r.bymonth.length && !r.bymonth.includes(dt.getMonth() + 1)) return [];
        if (r.bymonthday.length && !monthdays(dt.getFullYear(), dt.getMonth() + 1, r.bymonthday).has(dt.getDate())) return [];
        out = [dt];
        break;
      }
      default: { // sub-day
        const dt = new Date(st.getTime() + k * r.interval * SUBDAY[r.freq] * 1000);
        if (dt.getFullYear() > 9999) return null;
        return [dt];
      }
    }
    out = out.map(d => withTime(d, r));
    return applySetpos(out, r.bysetpos);
  }

  /* Index of a period that starts on/before `target` (only used without COUNT) */
  function skipTo(r, target) {
    if (!target || r.count !== null || target <= r.start) return 0;
    const st = r.start;
    let k;
    switch (r.freq) {
      case 'YEARLY': k = Math.floor((target.getFullYear() - st.getFullYear()) / r.interval) - 1; break;
      case 'MONTHLY': k = Math.floor(((target.getFullYear() - st.getFullYear()) * 12 + target.getMonth() - st.getMonth()) / r.interval) - 1; break;
      case 'WEEKLY': k = Math.floor(D.dayDiff(st, target) / (7 * r.interval)) - 1; break;
      case 'DAILY': k = Math.floor(D.dayDiff(st, target) / r.interval) - 1; break;
      default: k = Math.floor((target - st) / 1000 / (SUBDAY[r.freq] * r.interval)) - 1;
    }
    return Math.max(0, k);
  }

  /* Iterate occurrences (ascending) from optional fromDate. EXDATEs NOT removed. */
  function* iter(en, fromDate) {
    const r = compile(en);
    let count = 0;
    let empty = 0;
    for (let k = skipTo(r, fromDate); ; k++) {
      const cands = period(r, k);
      if (cands === null) return;
      if (!cands.length) {
        if (++empty > 2000) return; // impossible rule
        continue;
      }
      empty = 0;
      for (const c of cands) {
        if (c < r.start) continue;
        if (r.until && c > r.until) return;
        count++;
        yield c;
        if (r.count !== null && count >= r.count) return;
      }
    }
  }

  function exdateMatcher(en) {
    const st = PG.ical_dt.parse(en.dtstart);
    const timed = st && !st.isDate;
    const ex = (en.exdate || []).map(s => PG.ical_dt.parse(s)).filter(Boolean);
    if (!ex.length) return () => false;
    return function (dt) {
      for (const e of ex) {
        if (timed && !e.isDate) { if (e.dt.getTime() === dt.getTime()) return true; }
        else if (D.sameDay(e.dt, dt)) return true;
      }
      return false;
    };
  }

  /* Occurrence start times in [start, stop) excluding EXDATEs */
  function between(en, start, stop) {
    const isEx = exdateMatcher(en);
    const out = [];
    let n = 0;
    for (const d of iter(en, start)) {
      if (d >= stop) break;
      if (d >= start && !isEx(d)) out.push(d);
      if (++n > 200000) break;
    }
    return out;
  }

  function first(en) {
    for (const d of iter(en)) return d;
    return null;
  }

  /* previous (< dt) and next (>= dt) occurrence, EXDATEs excluded */
  function previousNext(en, dt) {
    const isEx = exdateMatcher(en);
    let prev = null, next = null, n = 0;
    const from = D.addDays(dt, -800);
    for (const d of iter(en, from)) {
      if (++n > 100000) break;
      if (isEx(d)) continue;
      if (d < dt) prev = d;
      else { next = d; break; }
    }
    if (prev === null && next === null) {
      // nothing near: fall back to scanning from the beginning
      for (const d of iter(en)) { if (++n > 200000) break; if (!isEx(d)) { if (d < dt) prev = d; else { next = d; break; } } }
    }
    return [prev, next];
  }

  function occurs(en, dt) {
    const day = D.dayStart(dt);
    return between(en, day, D.addDays(day, 1)).some(d => d.getTime() === dt.getTime() || (PG.ical_dt.parse(en.dtstart).isDate && D.sameDay(d, dt)));
  }

  return { WD, parseByday, iter, between, first, previousNext, occurs, compile, SUBDAY };
})();
