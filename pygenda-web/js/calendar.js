/*
  calendar.js – Pygenda Web
  Port of pygenda_calendar.py / pygenda_entryinfo.py. Entries are stored in
  the browser's localStorage instead of an iCal file / CalDAV / EDS.
  GPL-3.0-only (see COPYING).
*/
'use strict';

/* EntryInfo – container used by dialogs to pass data to Calendar */
PG.EntryInfo = class {
  constructor(o) {
    o = o || {};
    this.type = o.type || PG.EntryInfo.TYPE_EVENT;
    this.cal_idx = o.cal_idx || 0;
    this.desc = o.desc || '';
    this.start_dt = o.start_dt || null;       // {dt, isDate} or null
    this.end_dt = null;                       // {dt,isDate} | {time:Date} (time only)
    this.duration = null;                     // seconds
    this.status = o.status || null;
    this.location = o.location || null;
    this.alarms = [];
    this.rep_type = null; this.rep_inter = 1; this.rep_count = null; this.rep_until = null;
    this.rep_byday = null; this.rep_bymonth = null; this.rep_bymonthday = null; this.rep_exceptions = null;
    this.anniv = false;
    this.categories = null; this.priority = null; this.duedate = null; this.longdesc = null;
  }
  set_end_dt(v) { this.end_dt = v; }
  set_duration(v) { this.duration = v; }
  set_repeat_info(reptype, o) {
    this.rep_type = reptype;
    this.rep_inter = o.interval || 1;
    this.rep_count = o.count ?? null;
    this.rep_until = o.until ?? null;
    this.rep_byday = o.byday ?? null;
    this.rep_bymonth = o.bymonth ?? null;
    this.rep_bymonthday = o.bymonthday ?? null;
    this.rep_exceptions = o.except_list ?? null;
    this.anniv = !!o.anniv;
  }
  set_categories(c) { this.categories = (c && c.length) ? [...new Set(c)] : null; }
  set_priority(p) { this.priority = (p && p > 0 && p <= 9) ? p : null; }
  set_duedate(d) { this.duedate = d; }
  add_alarm(a) { this.alarms.push(Object.assign({}, a)); }
  set_longdesc(s) { this.longdesc = s; }
};
PG.EntryInfo.TYPE_EVENT = 0;
PG.EntryInfo.TYPE_TODO = 1;

PG.test_anniversary = function (en) {
  if (en.anniv !== undefined) {
    if (!en.anniv) return 0;
  } else if (en.epoc_type !== 'ANNIVERSARY') return 0;
  const rr = en.rrule;
  if (!rr || !rr.FREQ || String(rr.FREQ[0]).toUpperCase() !== 'YEARLY') return 0;
  let expected = 1;
  if (rr.INTERVAL) {
    if (parseInt(rr.INTERVAL[0], 10) !== 1) return 0;
    expected += 1;
  }
  if (Object.keys(rr).length !== expected) return -1;
  return 1;
};

PG.Calendar = (function () {
  const D = PG.D;
  const KEY = 'pygenda.data';
  const STATUS_LIST_EVENT = ['TENTATIVE', 'CONFIRMED', 'CANCELLED'];
  const STATUS_LIST_TODO = ['NEEDS-ACTION', 'IN-PROCESS', 'COMPLETED', 'CANCELLED'];

  let data = null; // {calendars:[...], entries:[...]}
  let cache = {};  // derived sorted lists (invalidated on change)
  const listeners = [];

  function defaultData() {
    return {
      version: 1,
      calendars: [{ name: 'Pygenda', cls: 'pygenda', color: '', stores: 'all', readonly: false, grid: true }],
      entries: [],
    };
  }
  function load() {
    const raw = PG.storage.get(KEY);
    data = null;
    if (raw) {
      try { data = JSON.parse(raw); } catch (e) { console.error('Bad stored data', e); }
    }
    if (!data || !Array.isArray(data.entries) || !Array.isArray(data.calendars) || !data.calendars.length) data = defaultData();
    for (const en of data.entries) if (typeof en.cal !== 'number' || en.cal >= data.calendars.length) en.cal = 0;
    cache = {};
  }
  function save() {
    cache = {};
    const ok = PG.storage.set(KEY, JSON.stringify(data));
    if (!ok && PG.GUI && PG.GUI.show_error_alert) PG.GUI.show_error_alert(_('Storage full – could not save data!'));
    listeners.forEach(f => { try { f(); } catch (e) { console.error(e); } });
  }
  window.addEventListener('storage', ev => {
    // Another tab changed the data
    if (ev.key === KEY) { load(); if (PG.GUI && PG.GUI.view_redraw) PG.GUI.view_redraw(true); }
  });

  const parse = PG.ical_dt.parse;
  const isEvent = en => en.kind === 'VEVENT';
  const isTodo = en => en.kind === 'VTODO';
  const conn = en => data.calendars[en.cal] || data.calendars[0];
  const stores = (c, kind) => c.stores === 'all' || (c.stores === 'event' && kind === 'VEVENT') || (c.stores === 'todo' && kind === 'VTODO');

  function sortDt(en) { const p = parse(isEvent(en) ? en.dtstart : en.due); return p ? p.dt : new Date(8.64e15); }

  /* ---------- derived lists ---------- */
  function norepList() {
    if (!cache.norep) {
      cache.norep = data.entries.filter(en =>
        (isEvent(en) && en.dtstart && !en.rrule) || (isTodo(en) && en.due));
      cache.norep.sort((a, b) => sortDt(a) - sortDt(b));
    }
    return cache.norep;
  }
  function repList() {
    if (!cache.rep) cache.rep = data.entries.filter(en => isEvent(en) && en.dtstart && en.rrule);
    return cache.rep;
  }
  function todoListInternal() {
    if (!cache.todo) cache.todo = data.entries.filter(isTodo);
    return cache.todo;
  }
  /* end of an event as {dt,isDate} (DTEND or DTSTART+DURATION) */
  function entryEnd(en) {
    const st = parse(en.dtstart);
    if (!st) return null;
    if (en.dtend) return parse(en.dtend);
    if (typeof en.duration === 'number') return { dt: addDuration(st.dt, en.duration, st.isDate), isDate: st.isDate };
    return null;
  }
  function addDuration(dt, secs, isDate) {
    const days = Math.trunc(secs / 86400);
    let r = D.addDays(dt, days);
    const rest = secs - days * 86400;
    if (rest && !isDate) r = new Date(r.getTime() + rest * 1000);
    return r;
  }
  function belongsInXover(en) {
    if (!isEvent(en) || en.rrule || !en.dtstart) return false;
    const st = parse(en.dtstart);
    const end = entryEnd(en);
    if (!end) return false;
    let enddate = D.dayStart(end.dt);
    if (end.isDate || D.isMidnight(end.dt)) enddate = D.addDays(enddate, -1);
    return D.dayStart(st.dt) < enddate;
  }
  function xoverList() {
    if (!cache.xover) {
      cache.xover = data.entries.filter(belongsInXover);
      cache.xover.sort((a, b) => sortDt(a) - sortDt(b));
    }
    return cache.xover;
  }

  /* ---------- queries ---------- */
  function occurrence_list(start, stop, opts) {
    opts = Object.assign({ include_single: true, include_repeated: true, in_grid: false }, opts || {});
    const ret = [];
    if (opts.include_single) {
      const L = norepList();
      let lo = 0, hi = L.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (sortDt(L[mid]) < start) lo = mid + 1; else hi = mid; }
      for (let i = lo; i < L.length; i++) {
        const e = L[i];
        const p = parse(isEvent(e) ? e.dtstart : e.due);
        if (stop <= p.dt) break;
        if (!opts.in_grid || conn(e).grid !== false) ret.push(new PG.Occurrence(e, p.dt, p.isDate));
      }
    }
    if (opts.include_repeated) {
      for (const e of repList()) {
        if (opts.in_grid && conn(e).grid === false) continue;
        merge_repeating(ret, e, start, stop);
      }
    }
    return ret;
  }
  function merge_repeating(target, ev, start, stop) {
    const st = parse(ev.dtstart);
    let reps;
    try {
      reps = PG.RRule.between(ev, start, stop);
    } catch (err) {
      console.warn('Warning: ' + err.message + ' - ignoring repeat');
      if (st.dt < start || stop <= st.dt) return;
      reps = [st.dt];
    }
    let i = 0, j = 0, end_i = target.length;
    while (i < end_i && j < reps.length) {
      if (reps[j] < target[i].dt) {
        target.splice(i, 0, new PG.Occurrence(ev, reps[j], st.isDate));
        j++; end_i++;
      }
      i++;
    }
    for (; j < reps.length; j++) target.push(new PG.Occurrence(ev, reps[j], st.isDate));
  }
  function ongoing_list(dt) {
    const ret = [];
    for (const e of xoverList()) {
      const st = parse(e.dtstart);
      if (dt <= st.dt) break;
      const end = entryEnd(e);
      if (dt < end.dt) ret.push(new PG.Occurrence(e, st.dt, st.isDate));
    }
    return ret;
  }
  function todo_list() { return todoListInternal(); }
  function search(txt) {
    const t = txt.toLocaleLowerCase();
    const seen = new Set(), ret = [];
    const m = en => en.summary && en.summary.toLocaleLowerCase().includes(t);
    for (const lst of [norepList(), repList(), todoListInternal()]) {
      for (const en of lst) if (!seen.has(en) && m(en)) { seen.add(en); ret.push(en); }
    }
    return ret;
  }
  function get_entry_by_uid(uid) { return data.entries.find(e => e.uid === uid) || null; }

  /* ---------- calendars ---------- */
  function calendars() { return data.calendars; }
  function displaynames(kind) {
    return data.calendars.map((c, i) => [i, c.name, c]).filter(([i, n, c]) => !c.readonly && stores(c, kind)).map(([i, n]) => [i, n]);
  }
  const calendar_displaynames_event_rw = () => displaynames('VEVENT');
  const calendar_displaynames_todo_rw = () => displaynames('VTODO');
  const calendar_displayname = en => conn(en).name;
  const calendar_displayclass = en => 'cal-' + (conn(en).cls || 'pygenda').replace(/[^\w-]/g, '_');
  const calendar_readonly = en => !!conn(en).readonly;
  function default_connector(kind) {
    const l = displaynames(kind);
    return l.length ? l[0][0] : 0;
  }

  /* ---------- modification ---------- */
  function update_timestamps(en, is_new) {
    const now = PG.ical_dt.utcStamp();
    en.dtstamp = now;
    if (is_new) en.created = now; else en.lastmod = now;
  }
  function event_add_end_dur_from_info(en, ei) {
    delete en.dtend; delete en.duration;
    const st = ei.start_dt;
    if (!st) return;
    if (!st.isDate) {
      if (ei.end_dt) {
        if (ei.end_dt.time) {
          let end = new Date(st.dt.getFullYear(), st.dt.getMonth(), st.dt.getDate(), ei.end_dt.time.getHours(), ei.end_dt.time.getMinutes());
          if (end.getTime() !== st.dt.getTime()) {
            if (end < st.dt) end = D.addDays(end, 1);
            en.dtend = PG.ical_dt.fromDateTime(end);
          }
        } else if (!ei.end_dt.isDate && ei.end_dt.dt > st.dt) en.dtend = PG.ical_dt.fromDateTime(ei.end_dt.dt);
      } else if (typeof ei.duration === 'number' && ei.duration > 0) en.duration = ei.duration;
    } else {
      if (ei.end_dt && ei.end_dt.isDate) {
        if (ei.end_dt.dt >= st.dt) en.dtend = PG.ical_dt.fromDate(ei.end_dt.dt);
      } else if (typeof ei.duration === 'number' && ei.duration % 86400 === 0) en.duration = ei.duration;
    }
  }
  function event_add_repeat_from_info(en, ei) {
    const rr = { FREQ: [ei.rep_type] };
    if (ei.rep_inter !== 1) rr.INTERVAL = [ei.rep_inter];
    if (ei.rep_until) {
      const u = ei.rep_until; // Date (date only)
      rr.UNTIL = [ei.start_dt.isDate ? PG.ical_dt.fromDate(u)
        : PG.ical_dt.fromDateTime(new Date(u.getFullYear(), u.getMonth(), u.getDate(), ei.start_dt.dt.getHours(), ei.start_dt.dt.getMinutes(), ei.start_dt.dt.getSeconds()))];
    } else if (ei.rep_count !== null) rr.COUNT = [ei.rep_count];
    if (ei.rep_byday !== null) rr.BYDAY = [].concat(ei.rep_byday);
    if (ei.rep_bymonth !== null) rr.BYMONTH = [ei.rep_bymonth];
    if (ei.rep_bymonthday !== null) rr.BYMONTHDAY = [ei.rep_bymonthday];
    en.rrule = rr;
    if (ei.anniv) { en.anniv = true; en.anniv_show = 'COUNT'; }
    if (ei.rep_exceptions && ei.rep_exceptions.length) {
      en.exdate = ei.rep_exceptions.map(x => PG.ical_dt.make(x.dt, x.isDate));
    }
    // Make DTSTART consistent with RRULE
    const fst = PG.RRule.first(en);
    if (fst && fst.getTime() !== ei.start_dt.dt.getTime()) {
      console.log('Notice: rewriting DTSTART to be consistent with RRULE');
      const delta = fst.getTime() - ei.start_dt.dt.getTime();
      const dd = D.dayDiff(ei.start_dt.dt, fst);
      en.dtstart = PG.ical_dt.make(fst, ei.start_dt.isDate);
      if (en.dtend) {
        const e = parse(en.dtend);
        en.dtend = PG.ical_dt.make(e.isDate ? D.addDays(e.dt, dd) : new Date(e.dt.getTime() + delta), e.isDate);
      }
    }
  }
  function entry_set_status_from_info(en, ei) { delete en.status; add_status_entry(en, ei.status); }
  function event_set_location_from_info(en, ei) { delete en.location; if (ei.location) en.location = ei.location; }
  function entry_set_alarms_from_info(en, ei) {
    en.alarms = [];
    for (const al of ei.alarms) {
      const a = { trigger: al.tdelta, action: al.action };
      let desc = al.desc ?? null, summ = al.summary ?? null, attee = al.attendee ?? null;
      if (al.action === 'DISPLAY') { if (desc === null) desc = ''; }
      else if (al.action === 'EMAIL') { if (desc === null) desc = ''; if (summ === null) summ = ''; if (attee === null) attee = ''; }
      if (desc !== null) a.description = desc;
      if (summ !== null) a.summary = summ;
      if (attee !== null) a.attendee = attee;
      if (al.attach) a.attach = al.attach;
      en.alarms.push(a);
    }
    if (!en.alarms.length) delete en.alarms;
  }
  function add_status_entry(en, stat) {
    if (stat === 'COMPLETED') delete en.percent;
    else {
      if (en.percent === 100) en.percent = 99;
      delete en.completed;
    }
    if ((isEvent(en) && STATUS_LIST_EVENT.includes(stat)) || (isTodo(en) && STATUS_LIST_TODO.includes(stat))) en.status = stat;
  }

  function new_entry(ei) {
    const c = data.calendars[ei.cal_idx];
    if (!c || c.readonly) throw new Error('Tried to add entry to calendar set as read-only');
    const en = { kind: ei.type === PG.EntryInfo.TYPE_TODO ? 'VTODO' : 'VEVENT', cal: ei.cal_idx };
    if (!stores(c, en.kind)) throw new Error('Calendar does not store this entry type');
    en.uid = PG.gen_uid();
    update_timestamps(en, true);
    en.summary = ei.desc;
    if (ei.start_dt) {
      en.dtstart = PG.ical_dt.make(ei.start_dt.dt, ei.start_dt.isDate);
      event_add_end_dur_from_info(en, ei);
      if (ei.rep_type !== null && ei.rep_inter > 0) event_add_repeat_from_info(en, ei);
    }
    entry_set_status_from_info(en, ei);
    event_set_location_from_info(en, ei);
    if (ei.categories) en.categories = ei.categories.slice();
    if (ei.priority) en.priority = ei.priority;
    if (ei.duedate) en.due = PG.ical_dt.fromDate(ei.duedate);
    if (ei.longdesc) en.description = ei.longdesc;
    entry_set_alarms_from_info(en, ei);
    data.entries.push(en);
    save();
    return en;
  }

  function update_entry(en, ei) {
    if (calendar_readonly(en)) throw new Error('Tried to update entry from calendar set readonly');
    const c = data.calendars[ei.cal_idx];
    if (!c || c.readonly) throw new Error('Tried to update entry into calendar set readonly');
    if (!en.uid) en.uid = PG.gen_uid();
    update_timestamps(en, false);
    en.summary = ei.desc;
    if (ei.priority) en.priority = ei.priority; else delete en.priority;
    if (ei.duedate) en.due = PG.ical_dt.fromDate(ei.duedate); else delete en.due;
    if (ei.longdesc) en.description = ei.longdesc; else delete en.description;
    if (ei.categories) en.categories = ei.categories.slice(); else delete en.categories;
    delete en.dtstart;
    if (ei.start_dt) en.dtstart = PG.ical_dt.make(ei.start_dt.dt, ei.start_dt.isDate);
    event_add_end_dur_from_info(en, ei);
    delete en.rrule; delete en.exdate; delete en.anniv; delete en.epoc_type; delete en.anniv_show;
    if (ei.rep_type !== null && ei.rep_inter > 0 && ei.start_dt) event_add_repeat_from_info(en, ei);
    entry_set_status_from_info(en, ei);
    event_set_location_from_info(en, ei);
    entry_set_alarms_from_info(en, ei);
    en.cal = ei.cal_idx;
    save();
    return en;
  }

  function delete_entry(en) {
    if (calendar_readonly(en)) throw new Error('Tried to delete entry from calendar set readonly');
    const i = data.entries.indexOf(en);
    if (i >= 0) data.entries.splice(i, 1);
    save();
  }

  function set_toggle_status_entry(en, stat) {
    if (calendar_readonly(en)) throw new Error('Tried to update status of entry in read-only calendar');
    if (en.status) {
      if (stat === en.status) stat = null;
      delete en.status;
    } else if (stat === null) return;
    add_status_entry(en, stat);
    update_timestamps(en, false);
    save();
  }

  function add_exdate(occ) {
    if (calendar_readonly(occ.en)) throw new Error('Tried to add exdate to entry in read-only calendar');
    if (!occ.en.rrule) throw new Error('Tried to add exdate to entry without repeats');
    if (!PG.RRule.occurs(occ.en, occ.dt)) throw new Error('Tried to add exdate to entry without occurrence on that date');
    (occ.en.exdate = occ.en.exdate || []).push(PG.ical_dt.make(occ.dt, occ.isDate));
    update_timestamps(occ.en, false);
    save();
  }

  /* paste / import: build a new entry using another as example */
  function new_entry_from_example(exen, o) {
    o = Object.assign({ e_type: null, dt_start: null, e_cats: true, cal_idx: null, use_ex_uid_created: false, use_ex_rpts: false, use_ex_alarms: true }, o);
    let kind;
    if (o.e_type === PG.EntryInfo.TYPE_EVENT || (o.e_type === null && exen.kind === 'VEVENT')) kind = 'VEVENT';
    else if (o.e_type === PG.EntryInfo.TYPE_TODO || (o.e_type === null && exen.kind === 'VTODO')) kind = 'VTODO';
    else throw new Error('Unrecognized iCal entry type');
    let cal_idx = o.cal_idx ?? default_connector(kind);
    const c = data.calendars[cal_idx];
    if (!stores(c, kind)) throw new Error('Calendar does not store this entry type');
    if (c.readonly) throw new Error('Tried to add entry to calendar set as read-only');
    const en = { kind, cal: cal_idx };
    en.uid = (o.use_ex_uid_created && exen.uid) ? exen.uid : PG.gen_uid();
    if (o.use_ex_uid_created) {
      en.dtstamp = PG.ical_dt.utcStamp();
      if (exen.created) en.created = exen.created;
      if (exen.lastmod) en.lastmod = exen.lastmod;
    } else update_timestamps(en, true);
    en.summary = exen.summary !== undefined ? exen.summary : '_';
    if (kind === 'VEVENT') {
      const ex = parse(exen.dtstart);
      let newst;
      if (o.dt_start) {
        if (ex) {
          const dd = D.dayDiff(ex.dt, o.dt_start);
          newst = { dt: D.addDays(ex.dt, dd), isDate: ex.isDate };
        } else newst = { dt: o.dt_start, isDate: true };
      } else if (ex) newst = ex;
      else throw new Error('Event has no date/time');
      en.dtstart = PG.ical_dt.make(newst.dt, newst.isDate);
      if (ex && exen.dtend) {
        const exend = parse(exen.dtend);
        if (o.dt_start) {
          const delta = newst.dt.getTime() - ex.dt.getTime();
          const dd = D.dayDiff(ex.dt, newst.dt);
          en.dtend = PG.ical_dt.make(exend.isDate ? D.addDays(exend.dt, dd) : new Date(exend.dt.getTime() + delta), exend.isDate);
        } else en.dtend = exen.dtend;
      } else if (typeof exen.duration === 'number') en.duration = exen.duration;
      if (o.use_ex_rpts && exen.rrule) {
        en.rrule = JSON.parse(JSON.stringify(exen.rrule));
        if (exen.exdate) en.exdate = exen.exdate.slice();
        if (exen.anniv !== undefined) en.anniv = exen.anniv;
        if (exen.epoc_type) en.epoc_type = exen.epoc_type;
        if (exen.anniv_show) en.anniv_show = exen.anniv_show;
      }
      if (o.use_ex_alarms && exen.alarms && exen.alarms.length) en.alarms = JSON.parse(JSON.stringify(exen.alarms));
    }
    if (exen.location) en.location = exen.location;
    if (o.e_cats === true) { if (exen.categories) en.categories = exen.categories.slice(); }
    else if (o.e_cats) en.categories = o.e_cats.slice();
    if (exen.priority) en.priority = exen.priority;
    if (exen.status && (kind === 'VEVENT' ? STATUS_LIST_EVENT : STATUS_LIST_TODO).includes(exen.status)) en.status = exen.status;
    if (kind === 'VTODO' && exen.due) en.due = exen.due;
    if (exen.description) en.description = exen.description;
    if (o.use_ex_uid_created && exen.extra) en.extra = exen.extra.slice();
    data.entries.push(en);
    save();
    return en;
  }
  const paste_entry = (exen, e_type, dt_start, e_cats) => new_entry_from_example(exen, { e_type, dt_start, e_cats: e_cats === undefined ? true : e_cats });
  const import_entry = (exen, cal_idx, cats) => new_entry_from_example(exen, { e_cats: cats || null, cal_idx, use_ex_uid_created: true, use_ex_rpts: true, use_ex_alarms: false });

  function previous_next_occurrence(en, dt) {
    if (!en.rrule) { const p = parse(en.dtstart); return p.dt < dt ? [p.dt, null] : [null, p.dt]; }
    return PG.RRule.previousNext(en, dt);
  }

  /* ---------- whole-store operations ---------- */
  function all_entries() { return data.entries; }
  function export_ics() { return PG.ICal.serialize(data.entries); }
  function set_calendars(cals) { data.calendars = cals; for (const en of data.entries) if (en.cal >= cals.length) en.cal = 0; save(); }
  function wipe() { data = defaultData(); save(); }
  function add_raw_entries(list) { for (const en of list) data.entries.push(en); save(); }

  load();

  return {
    STATUS_LIST_EVENT, STATUS_LIST_TODO, load, save, onchange: f => listeners.push(f),
    occurrence_list, ongoing_list, todo_list, search, get_entry_by_uid,
    calendars, calendar_displaynames_event_rw, calendar_displaynames_todo_rw, calendar_displayname,
    calendar_displayclass, calendar_readonly, new_entry, update_entry, delete_entry,
    set_toggle_status_entry, add_exdate, paste_entry, import_entry, previous_next_occurrence,
    entryEnd, addDuration, all_entries, export_ics, set_calendars, wipe, add_raw_entries,
    isEvent, isTodo,
  };
})();

/* end_dt_occ: end of an occurrence (shifted from root DTSTART) as {dt,isDate} or null */
PG.end_dt_occ = function (occ) {
  const en = occ.en;
  const st = PG.ical_dt.parse(en.dtstart);
  if (!st) return null;
  if (en.dtend) {
    const e = PG.ical_dt.parse(en.dtend);
    if (e.isDate && st.isDate) return { dt: PG.D.addDays(e.dt, PG.D.dayDiff(st.dt, occ.dt)), isDate: true };
    return { dt: new Date(e.dt.getTime() + (occ.dt.getTime() - st.dt.getTime())), isDate: e.isDate };
  }
  if (typeof en.duration === 'number') return { dt: PG.Calendar.addDuration(occ.dt, en.duration, occ.isDate), isDate: occ.isDate };
  return null;
};
