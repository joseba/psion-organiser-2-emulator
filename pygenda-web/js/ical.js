/*
  ical.js – Pygenda Web
  Minimal iCalendar (RFC 5545) parser/serialiser for VEVENT/VTODO/VALARM.
  Unknown properties are kept verbatim so that import→export round-trips.
  GPL-3.0-only (see COPYING).
*/
'use strict';

PG.ICal = (function () {
  const D = PG.D;

  function unfold(text) {
    return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\n[ \t]/g, '').split('\n');
  }
  function unescapeText(s) {
    return s.replace(/\\([\\;,nN])/g, (m, c) => (c === 'n' || c === 'N') ? '\n' : c);
  }
  function escapeText(s) {
    return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  }
  /* Split "NAME;P1=a;P2="b;c":value" */
  function parseLine(line) {
    let i = 0, inQ = false;
    for (; i < line.length; i++) {
      const c = line[i];
      if (c === '"') inQ = !inQ;
      else if (c === ':' && !inQ) break;
    }
    const head = line.slice(0, i), value = line.slice(i + 1);
    const parts = [];
    let cur = ''; inQ = false;
    for (const c of head) {
      if (c === '"') { inQ = !inQ; cur += c; } else if (c === ';' && !inQ) { parts.push(cur); cur = ''; } else cur += c;
    }
    parts.push(cur);
    const name = parts.shift().toUpperCase();
    const params = {};
    for (const p of parts) {
      const j = p.indexOf('=');
      if (j > 0) params[p.slice(0, j).toUpperCase()] = p.slice(j + 1).replace(/^"|"$/g, '');
    }
    return { name, params, value, raw: line };
  }

  /* Offset (minutes) of IANA zone at a given UTC instant */
  function tzOffsetMinutes(tz, utcDate) {
    try {
      const f = new Intl.DateTimeFormat('en-US', {
        timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit',
      });
      const p = {};
      for (const x of f.formatToParts(utcDate)) p[x.type] = x.value;
      const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour % 24, +p.minute, +p.second);
      return (asUTC - utcDate.getTime()) / 60000;
    } catch (e) { return null; }
  }
  /* Convert a date-time value to a floating local iCal string */
  function dtValue(prop) {
    const v = prop.value.trim();
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(v);
    if (!m) return null;
    if (m[4] === undefined || (prop.params.VALUE || '').toUpperCase() === 'DATE') return `${m[1]}${m[2]}${m[3]}`;
    const [y, mo, d, h, mi, s] = [+m[1], +m[2], +m[3], +m[4], +m[5], +(m[6] || 0)];
    if (m[7]) return PG.ical_dt.fromDateTime(new Date(Date.UTC(y, mo - 1, d, h, mi, s)));
    const tz = prop.params.TZID;
    if (tz) {
      // wall time in tz -> UTC -> local
      let guess = Date.UTC(y, mo - 1, d, h, mi, s);
      const off1 = tzOffsetMinutes(tz, new Date(guess));
      if (off1 !== null) {
        let utc = guess - off1 * 60000;
        const off2 = tzOffsetMinutes(tz, new Date(utc));
        if (off2 !== null && off2 !== off1) utc = guess - off2 * 60000;
        return PG.ical_dt.fromDateTime(new Date(utc));
      }
    }
    return `${m[1]}${m[2]}${m[3]}T${m[4]}${m[5]}${m[6] || '00'}`;
  }
  /* ISO 8601 duration → seconds */
  function parseDuration(v) {
    const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(v).trim());
    if (!m) return null;
    const secs = (+(m[2] || 0)) * 604800 + (+(m[3] || 0)) * 86400 + (+(m[4] || 0)) * 3600 + (+(m[5] || 0)) * 60 + (+(m[6] || 0));
    return m[1] === '-' ? -secs : secs;
  }
  function fmtDuration(secs) {
    let s = '';
    if (secs < 0) { s = '-'; secs = -secs; }
    const d = Math.floor(secs / 86400); secs -= d * 86400;
    const h = Math.floor(secs / 3600); secs -= h * 3600;
    const mi = Math.floor(secs / 60); const se = secs - mi * 60;
    s += 'P';
    if (d) s += d + 'D';
    if (h || mi || se || !d) {
      s += 'T';
      if (h) s += h + 'H';
      if (mi) s += mi + 'M';
      if (se || (!h && !mi)) s += se + 'S';
    }
    return s;
  }
  function parseRRule(v) {
    const rr = {};
    for (const part of v.split(';')) {
      const j = part.indexOf('=');
      if (j <= 0) continue;
      const k = part.slice(0, j).toUpperCase();
      let val = part.slice(j + 1);
      if (k === 'UNTIL') {
        val = dtValue({ value: val, params: {} }) || val;
        rr[k] = [val];
      } else rr[k] = val.split(',');
    }
    return rr;
  }
  function fmtRRule(rr) {
    const order = ['FREQ', 'UNTIL', 'COUNT', 'INTERVAL', 'BYSECOND', 'BYMINUTE', 'BYHOUR', 'BYDAY', 'BYMONTHDAY', 'BYYEARDAY', 'BYWEEKNO', 'BYMONTH', 'BYSETPOS', 'WKST'];
    const keys = Object.keys(rr).sort((a, b) => {
      const ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    return keys.map(k => k + '=' + [].concat(rr[k]).join(',')).join(';');
  }

  /* Build Pygenda-web entry from a parsed component */
  function componentToEntry(comp) {
    const en = { kind: comp.name, extra: [], alarms: [], exdate: [], categories: [] };
    for (const p of comp.props) {
      switch (p.name) {
        case 'UID': en.uid = p.value; break;
        case 'SUMMARY': en.summary = unescapeText(p.value); break;
        case 'DESCRIPTION': en.description = (en.description ? en.description + '\n' : '') + unescapeText(p.value); break;
        case 'LOCATION': en.location = unescapeText(p.value); break;
        case 'STATUS': en.status = p.value.toUpperCase(); break;
        case 'PRIORITY': { const n = parseInt(p.value, 10); if (!isNaN(n) && n > 0) en.priority = n; break; }
        case 'CATEGORIES':
          for (const c of p.value.split(/(?<!\\),/)) { const t = unescapeText(c).trim(); if (t) en.categories.push(t); }
          break;
        case 'DTSTART': en.dtstart = dtValue(p); if (p.params.TZID) en.tzid = p.params.TZID; break;
        case 'DTEND': en.dtend = dtValue(p); break;
        case 'DUE': en.due = dtValue(p); break;
        case 'DURATION': en.duration = parseDuration(p.value); break;
        case 'RRULE': en.rrule = parseRRule(p.value); break;
        case 'EXDATE':
          for (const v of p.value.split(',')) {
            const x = dtValue({ value: v, params: p.params });
            if (x) en.exdate.push(x);
          }
          break;
        case 'CREATED': en.created = p.value; break;
        case 'DTSTAMP': en.dtstamp = p.value; break;
        case 'LAST-MODIFIED': en.lastmod = p.value; break;
        case 'COMPLETED': en.completed = p.value; break;
        case 'PERCENT-COMPLETE': en.percent = parseInt(p.value, 10); break;
        case 'URL': en.url = p.value; break;
        case 'X-PYGENDA-ANNIVERSARY': en.anniv = /^true$/i.test(p.value.trim()); break;
        case 'X-PYGENDA-ANNIVERSARY-SHOW': en.anniv_show = p.value.trim(); break;
        case 'X-EPOCAGENDAENTRYTYPE': en.epoc_type = p.value.trim(); break;
        default: en.extra.push(p.raw);
      }
    }
    for (const sub of comp.subs) {
      if (sub.name !== 'VALARM') continue;
      const a = {};
      for (const p of sub.props) {
        if (p.name === 'TRIGGER') {
          const d = parseDuration(p.value);
          if (d !== null) a.trigger = d; else a.trigger_abs = p.value;
        } else if (p.name === 'ACTION') a.action = p.value.toUpperCase();
        else if (p.name === 'DESCRIPTION') a.description = unescapeText(p.value);
        else if (p.name === 'SUMMARY') a.summary = unescapeText(p.value);
        else if (p.name === 'ATTENDEE') (a.attendee = a.attendee || []).push(p.value);
        else if (p.name === 'ATTACH') a.attach = p.value;
      }
      if (a.attendee && a.attendee.length === 1) a.attendee = a.attendee[0];
      en.alarms.push(a);
    }
    if (!en.categories.length) delete en.categories;
    if (!en.exdate.length) delete en.exdate;
    if (!en.extra.length) delete en.extra;
    return en;
  }

  /* Parse text → {entries:[...], errors:bool} */
  function parse(text) {
    const lines = unfold(text);
    const stack = [];
    const root = { name: 'ROOT', props: [], subs: [] };
    let cur = root;
    let errors = false;
    for (const raw of lines) {
      if (!raw.trim()) continue;
      const p = parseLine(raw);
      if (p.name === 'BEGIN') {
        const c = { name: p.value.trim().toUpperCase(), props: [], subs: [] };
        cur.subs.push(c); stack.push(cur); cur = c;
      } else if (p.name === 'END') {
        if (!stack.length) { errors = true; continue; }
        cur = stack.pop();
      } else {
        cur.props.push(p);
      }
    }
    if (stack.length) errors = true;
    const entries = [];
    const walk = c => {
      for (const s of c.subs) {
        if (s.name === 'VEVENT' || s.name === 'VTODO') entries.push(componentToEntry(s));
        else walk(s);
      }
    };
    walk(root);
    if (!root.subs.length) errors = true;
    return { entries, errors };
  }

  /* ---------------- Serialisation ---------------- */
  function fold(line) {
    // fold at 75 octets (approximate with UTF-8 aware slicing)
    const enc = new TextEncoder();
    if (enc.encode(line).length <= 75) return line;
    const out = [];
    let cur = '', len = 0, lim = 75;
    for (const ch of line) {
      const l = enc.encode(ch).length;
      if (len + l > lim) { out.push(cur); cur = ' '; len = 1; lim = 75; }
      cur += ch; len += l;
    }
    out.push(cur);
    return out.join('\r\n');
  }
  function dtProp(name, v) {
    if (!v) return null;
    return /T/.test(v) ? `${name}:${v}` : `${name};VALUE=DATE:${v}`;
  }
  function entryToLines(en) {
    const L = [];
    const add = s => { if (s) L.push(fold(s)); };
    L.push('BEGIN:' + en.kind);
    add(en.summary !== undefined ? 'SUMMARY:' + escapeText(en.summary) : null);
    add(dtProp('DTSTART', en.dtstart));
    add(dtProp('DTEND', en.dtend));
    if (typeof en.duration === 'number') add('DURATION:' + fmtDuration(en.duration));
    add(dtProp('DUE', en.due));
    add(en.uid ? 'UID:' + en.uid : null);
    add(en.dtstamp ? 'DTSTAMP:' + en.dtstamp : null);
    add(en.created ? 'CREATED:' + en.created : null);
    add(en.lastmod ? 'LAST-MODIFIED:' + en.lastmod : null);
    if (en.rrule) add('RRULE:' + fmtRRule(en.rrule));
    for (const x of en.exdate || []) add(dtProp('EXDATE', x));
    if (en.anniv !== undefined) add('X-PYGENDA-ANNIVERSARY;VALUE=BOOLEAN:' + (en.anniv ? 'TRUE' : 'FALSE'));
    if (en.anniv_show) add('X-PYGENDA-ANNIVERSARY-SHOW:' + en.anniv_show);
    if (en.epoc_type) add('X-EPOCAGENDAENTRYTYPE:' + en.epoc_type);
    if (en.status) add('STATUS:' + en.status);
    if (en.priority) add('PRIORITY:' + en.priority);
    if (en.location) add('LOCATION:' + escapeText(en.location));
    if (en.categories && en.categories.length) add('CATEGORIES:' + en.categories.map(escapeText).join(','));
    if (en.description) add('DESCRIPTION:' + escapeText(en.description));
    if (en.completed) add('COMPLETED:' + en.completed);
    if (typeof en.percent === 'number' && !isNaN(en.percent)) add('PERCENT-COMPLETE:' + en.percent);
    if (en.url) add('URL:' + en.url);
    for (const x of en.extra || []) add(x);
    for (const a of en.alarms || []) {
      L.push('BEGIN:VALARM');
      if (typeof a.trigger === 'number') add('TRIGGER:' + fmtDuration(a.trigger));
      else if (a.trigger_abs) add('TRIGGER;VALUE=DATE-TIME:' + a.trigger_abs);
      if (a.action) add('ACTION:' + a.action);
      if (a.description !== undefined && a.description !== null) add('DESCRIPTION:' + escapeText(a.description));
      if (a.summary !== undefined && a.summary !== null) add('SUMMARY:' + escapeText(a.summary));
      for (const at of [].concat(a.attendee || [])) add('ATTENDEE:' + at);
      if (a.attach) add('ATTACH:' + a.attach);
      L.push('END:VALARM');
    }
    L.push('END:' + en.kind);
    return L;
  }
  function serialize(entries) {
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pygenda Web//pygenda-web//EN'];
    for (const en of entries) L.push(...entryToLines(en));
    L.push('END:VCALENDAR');
    return L.join('\r\n') + '\r\n';
  }

  return { parse, serialize, parseDuration, fmtDuration, fmtRRule, parseRRule, escapeText };
})();
