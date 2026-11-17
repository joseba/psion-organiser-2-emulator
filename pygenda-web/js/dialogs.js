/*
  dialogs.js – Pygenda Web
  Port of pygenda_dialog_event.py, pygenda_dialog_todo.py,
  pygenda_dialog_find.py, pygenda_dialog_entryprops.py,
  pygenda_dialog_import.py and the simple dialogs in pygenda_gui.py.
  GPL-3.0-only (see COPYING).
*/
'use strict';

(function () {
  const h = PG.h, D = PG.D, C = PG.Config, Cal = PG.Calendar;
  const fmt = PG.fmt;

  class BeyondEdit extends Error { constructor(m) { super(m); this.name = 'BeyondEdit'; } }
  PG.BeyondEdit = BeyondEdit;

  const row = (label, ...widgets) => [h('label.llabel', { text: label }), h('div.wcell', {}, ...widgets)];
  const DAY_ABBR = PG.RRule.WD; // MO..SU

  /* ================================================================ */
  /* Event dialog                                                     */
  /* ================================================================ */
  C.set_defaults('new_event', {
    show_alarm_warning: true,
    timed_default_alarm_before: '15m',
    default_alarm_emailaddr: '',
    default_alarm_audiofile: '',
  });

  const EventDialog = {
    TAB_TIME: 0, TAB_REPEATS: 1, TAB_ALARM: 2, TAB_DETAILS: 3, TAB_COUNT: 4,
    WORKDAYS: [0, 1, 2, 3, 4],

    _build() {
      const w = this.w = {};
      this._block = true;
      w.desc = PG.textEntry();
      w.date = new PG.WidgetDate();
      const cals = Cal.calendar_displaynames_event_rw();
      w.calendar = new PG.Combo(cals.map(([i, n]) => [i, n]));
      const calRow = row(_('Calendar:'), w.calendar.el);
      if (cals.length <= 1) calRow.forEach(e => { e.hidden = true; });
      const top = h('div.dlggrid', {}, ...row(_('Description:'), w.desc), ...row(_('Date:'), w.date.el), ...calRow);

      /* --- Time tab --- */
      w.timed = new PG.RadioGroup([_('No'), _('Yes'), _('All day')]);
      w.time = new PG.WidgetTime(new Date(2000, 0, 1, 9, 0));
      w.dur = new PG.WidgetDuration(0);
      w.endtime = new PG.WidgetTime(new Date(2000, 0, 1, 9, 0));
      w.allday_count = new PG.Spin(1, 999, 1);
      const timeRows = [...row(_('Start time:'), w.time.el), ...row(_('Duration:'), w.dur.el), ...row(_('End time:'), w.endtime.el)];
      const alldayRows = row(_('Days:'), w.allday_count.box);
      this.revs_timedur = timeRows; this.revs_allday = alldayRows;
      const tabTime = h('div.dlggrid', {}, ...row(_('Timed event:'), w.timed.el), ...timeRows, ...alldayRows);

      /* --- Repeats tab --- */
      w.rep_type = new PG.Combo([[null, _('None')], ['YEARLY', _('Yearly')], ['anniv', _('Anniversary')], ['MONTHLY', _('Monthly')], ['WEEKLY', _('Weekly')], ['DAILY', _('Daily')]]);
      w.repeaton_year = new PG.Combo([['STD', ''], ['WEEKDAY', ''], ['WEEKDAY_FROMEND', '']]);
      w.repeaton_month = new PG.Combo([['STD', ''], ['FROMEND', ''], ['WEEKDAY', ''], ['WEEKDAY_FROMEND', '']]);
      w.repeaton_week = new PG.Combo([['STD', ''], ['MULTIDAY', '']]);
      w.rep_interval = new PG.Spin(1, 999, 1);
      w.rep_forever = h('input.check', { type: 'checkbox' });
      w.rep_forever.checked = true;
      w.rep_occs = new PG.Spin(1, 9999, 1);
      w.rep_enddt = new PG.WidgetDate();
      w.lab_rep_exceptions = h('span.exlabel', { text: _('None') });
      w.exbutton = h('button.dialogbutton', { type: 'button', text: '+/−', onclick: () => this.dialog_repeat_exceptions() });
      const reponRows = row(_('Repeat on:'), w.repeaton_year.el, w.repeaton_month.el, w.repeaton_week.el);
      const untilRows = [...row(_('Occurrences:'), w.rep_occs.box), ...row(_('Until:'), w.rep_enddt.el)];
      const repRows = [...row(_('Period:'), w.rep_interval.box), ...row(_('Repeat Forever:'), w.rep_forever), ...untilRows,
        ...row(_('Exceptions:'), w.lab_rep_exceptions, w.exbutton)];
      this.revs_repeaton = reponRows; this.revs_repeat = repRows; this.revs_rep_ends = untilRows;
      const tabRep = h('div.dlggrid#grid-repeats', {}, ...row(_('Repeats:'), w.rep_type.el), ...reponRows, ...repRows);

      /* --- Alarm tab --- */
      w.alarm_warning = h('div.alarmwarning', {},
        h('p', { html: '<b>' + PG.escapeHTML(_('Warning:')) + '</b> ' + _('Pygenda will <b><i>not</i></b> sound/display alarms.') }),
        h('p', { text: _('A separate alarm handler is required for alarms to activate.') }),
        h('p', { text: _('(To remove this warning, see the Preferences.)') }),
        h('button.dialogbutton', { type: 'button', text: _('Understood'), onclick: () => this.alarms_understood() }));
      w.alarmset = new PG.Switch(false);
      w.alarmlist = h('div.alarmlist', { tabindex: '0', role: 'listbox' });
      const ab = (txt, fn, title) => h('button.dialogbutton.small', { type: 'button', text: txt, title: title || txt, tabindex: '-1', onclick: fn });
      w.alarmtools = h('div.alarmtools', {},
        ab('N', () => this._alarm_new(), 'New (N)'), ab('Del', () => this._alarm_delete(), 'Delete'),
        ab('−', () => this._alarmlist_add(-60), '−1 min (−)'), ab('+', () => this._alarmlist_add(60), '+1 min (+)'),
        ab('A', () => this._alarm_set_action('a'), _('Audio') + ' (A)'), ab('D', () => this._alarm_set_action('d'), _('Display') + ' (D)'),
        ab('E', () => this._alarm_set_action('e'), _('Email') + ' (E)'));
      w.alarmreveal = h('div.alarmreveal', {}, w.alarmlist, w.alarmtools);
      w.alarm_content = h('div.alarmcontent', {}, h('div.dlggrid', {}, ...row(_('Alarm(s) set:'), w.alarmset.el)), w.alarmreveal);
      const tabAlarm = h('div.alarmstack', {}, w.alarm_warning, w.alarm_content);

      /* --- Details tab --- */
      w.location = PG.textEntry();
      w.status = new PG.Combo([[null, _('None')], ['TENTATIVE', _('Tentative')], ['CONFIRMED', _('Confirmed')], ['CANCELLED', _('Cancelled')]]);
      w.notes = PG.notesEntry();
      const tabDetails = h('div.dlggrid', {}, ...row(_('Location:'), w.location), ...row(_('Status:'), w.status.el), ...row(_('Notes:'), w.notes));

      w.tabs = new PG.Notebook([
        { label: _('Time'), content: tabTime }, { label: _('Repeats'), content: tabRep },
        { label: _('Alarms'), content: tabAlarm }, { label: _('Details'), content: tabDetails }]);
      this.content = h('div.eventdialog', {}, top, w.tabs.el);

      /* --- signals --- */
      w.timed.onchange(i => { PG.reveal(this.revs_timedur, i === 1); PG.reveal(this.revs_allday, i === 2); });
      w.desc.addEventListener('input', () => this._is_valid_event(false));
      w.rep_type.onchange(() => this._reptype_changed());
      w.rep_forever.addEventListener('change', () => this._do_repeatforever_toggle());
      w.time.onchange(() => { this._tmdur_changed(0); this._repend_changed(0); });
      w.dur.onchange(() => this._tmdur_changed(1));
      w.endtime.onchange(() => this._tmdur_changed(2));
      w.date.onchange(() => { this._repend_changed(0); this._repon_changed(); this._is_valid_event(false); });
      for (const cb of [w.repeaton_year, w.repeaton_month, w.repeaton_week]) cb.onchange(() => this._repend_changed(0));
      w.rep_interval.onchange(() => this._repend_changed(0));
      w.rep_occs.onchange(() => this._repend_changed(1));
      w.rep_enddt.onchange(() => this._repend_changed(2));
      w.alarmset.onchange(st => this._do_alarmset_toggle(st));
      w.alarmlist.addEventListener('keydown', ev => this._alarmlist_keypress(ev));
      w.alarmlist.addEventListener('click', ev => {
        const r = ev.target.closest('.alarmrow'); if (r) this._alarm_select(parseInt(r.dataset.idx, 10));
      });
      w.rep_forever.addEventListener('keydown', ev => {
        if (ev.key === 'Enter') { ev.preventDefault(); this.dlg.response('ok'); }
      });
      this._default_alarm_before = PG.parse_timedelta(C.get('new_event', 'timed_default_alarm_before'));
      this.show_alarm_warning = C.get_bool('new_event', 'show_alarm_warning');
    },

    _reptype_changed() {
      const w = this.w;
      const anniv = w.rep_type.get_active_id() === 'anniv';
      const st = !anniv && w.rep_type.get_active() > 0;
      PG.reveal(this.revs_repeat, st);
      if (st) PG.reveal(this.revs_rep_ends, !w.rep_forever.checked);
      const id = w.rep_type.get_active_id();
      const y = st && id === 'YEARLY', m = st && id === 'MONTHLY', wk = st && id === 'WEEKLY';
      PG.reveal(this.revs_repeaton, y || m || wk);
      w.repeaton_year.set_visible(y); w.repeaton_month.set_visible(m); w.repeaton_week.set_visible(wk);
    },
    _do_repeatforever_toggle() {
      const w = this.w;
      const st = !w.rep_forever.checked;
      PG.reveal(this.revs_rep_ends, st);
      if (st) {
        if (this.rep_occs_determines_end) this._sync_rep_occs_end();
        else {
          const sdt = this.get_date_start(), edt = w.rep_enddt.get_date_or_none();
          if (sdt && (!edt || edt < sdt)) { w.rep_enddt.set_date(sdt); w.rep_occs.set_value(1); }
        }
      }
    },
    _do_alarmset_toggle(state) {
      if (state && this.alarms.length === 0) {
        this._add_alarm({ tdelta: -this._default_alarm_before, action: 'AUDIO', attach: C.get('new_event', 'default_alarm_audiofile') || null });
        this._add_alarm({ tdelta: -this._default_alarm_before, action: 'DISPLAY', desc: this.w.desc.value });
      }
      PG.reveal(this.w.alarmreveal, state);
    },
    alarms_understood() {
      this.w.alarm_warning.hidden = true;
      this.w.alarm_content.hidden = false;
      this.w.alarmset.el.focus();
    },
    _add_alarm(a) { this.alarms.push(a); this._render_alarms(); },
    _alarm_desc(a) {
      const act = a.action.charAt(0) + a.action.slice(1).toLowerCase();
      let desc = _(act);
      if (act === 'Audio') { if (a.attach) desc += ' (' + a.attach.split('/').pop() + ')'; }
      else if (act === 'Email') desc += ' (' + (a.attendee || '') + ')';
      else if (act === 'Display' && a.desc !== null && a.desc !== undefined) desc += ' “' + a.desc + '”';
      return desc;
    },
    _render_alarms() {
      const L = this.w.alarmlist;
      L.innerHTML = '';
      L.appendChild(h('div.alarmhead', {}, h('span', { text: _('Time before event') }), h('span', { text: _('Action') })));
      this.alarms.forEach((a, i) => {
        L.appendChild(h('div.alarmrow' + (i === this.alarm_sel ? '.selected' : ''), { 'data-idx': i },
          h('span', { text: PG.str_timedelta(-a.tdelta) }), h('span', { text: this._alarm_desc(a) })));
      });
    },
    _alarm_select(i) { this.alarm_sel = i; this._render_alarms(); },
    _alarm_new() {
      this._add_alarm({ tdelta: -this._default_alarm_before, action: 'AUDIO', attach: C.get('new_event', 'default_alarm_audiofile') || null });
      this._alarm_select(this.alarms.length - 1);
    },
    _alarm_delete() {
      if (this.alarm_sel >= 0 && this.alarm_sel < this.alarms.length) {
        this.alarms.splice(this.alarm_sel, 1);
        this.alarm_sel = Math.min(this.alarm_sel, this.alarms.length - 1);
        this._render_alarms();
      }
    },
    _alarmlist_add(d) {
      const a = this.alarms[this.alarm_sel];
      if (a) { a.tdelta = Math.min(a.tdelta + d, 0); this._render_alarms(); }
    },
    _alarm_set_action(k) {
      const a = this.alarms[this.alarm_sel];
      if (!a) return;
      const w = this.w;
      const na = { tdelta: a.tdelta, desc: null, summary: null, attendee: null, attach: null };
      if (k === 'a') { na.action = 'AUDIO'; na.attach = C.get('new_event', 'default_alarm_audiofile') || null; }
      else if (k === 'd') { na.action = 'DISPLAY'; na.desc = w.desc.value; }
      else if (k === 'e') {
        na.action = 'EMAIL';
        na.attendee = C.get('new_event', 'default_alarm_emailaddr');
        na.summary = w.desc.value; na.desc = na.summary;
        if (w.location.value) na.desc += '\n' + w.location.value;
        if (!na.attendee) { console.error('Error: No email address available'); return; }
      }
      this.alarms[this.alarm_sel] = na;
      this._render_alarms();
    },
    _alarmlist_keypress(ev) {
      const k = ev.key;
      const stop = () => { ev.preventDefault(); ev.stopPropagation(); };
      if (k === 'Backspace' || k === 'Delete') { this._alarm_delete(); return stop(); }
      if (k === 'ArrowUp' && !ev.shiftKey) {
        if (this.alarm_sel <= 0) { this.w.alarmset.el.focus(); return stop(); }
        this._alarm_select(this.alarm_sel - 1); return stop();
      }
      if (k === 'ArrowDown' && !ev.shiftKey) {
        if (this.alarm_sel < this.alarms.length - 1) this._alarm_select(this.alarm_sel + 1);
        return stop();
      }
      if (PG.INC_KEYS.includes(k)) { this._alarmlist_add(60); return stop(); }
      if (PG.DEC_KEYS.includes(k)) { this._alarmlist_add(-60); return stop(); }
      if (['a', 'd', 'e'].includes(k)) { this._alarm_set_action(k); return stop(); }
      if (k === 'n') { this._alarm_new(); return stop(); }
      if (k === 'Enter') { this.dlg.response('ok'); return stop(); }
    },

    _tmdur_changed(el) {
      if (this._block) return;
      const w = this.w;
      const sdt = this.get_date_start(), stm = w.time.get_time_or_none(), d = w.dur.get_duration_or_none(), etm = w.endtime.get_time_or_none();
      if (sdt && stm && d !== null && etm) {
        if (el === 1) this.dur_determines_end = true;
        else if (el === 2) this.dur_determines_end = false;
        this._block = true;
        try {
          const st = new Date(sdt.getFullYear(), sdt.getMonth(), sdt.getDate(), stm.getHours(), stm.getMinutes());
          if (this.dur_determines_end) w.endtime.set_time(new Date(st.getTime() + d * 1000));
          else {
            let end = new Date(sdt.getFullYear(), sdt.getMonth(), sdt.getDate(), etm.getHours(), etm.getMinutes());
            if (end < st) end = D.addDays(end, 1);
            w.dur.set_duration(Math.round((end - st) / 1000));
          }
        } finally { this._block = false; }
      }
      this._is_valid_event(false);
    },
    _repend_changed(el) {
      if (this._block) return;
      if (el === 1) { this.rep_occs_determines_end = true; this.w.rep_occs.set_range(1, 9999); }
      else if (el === 2) this.rep_occs_determines_end = false;
      this._block = true;
      try { this._sync_rep_occs_end(); } finally { this._block = false; }
      this._is_valid_event(false);
    },
    _sync_rep_occs_end() {
      const w = this.w;
      if (w.rep_forever.checked) return;
      const rtype = w.rep_type.get_active_id();
      if (!rtype || rtype === 'anniv') return;
      if (this.rep_occs_determines_end) this._sync_rep_ends_from_occs(rtype);
      else this._sync_occs_from_rep_ends(rtype);
    },
    _sync_rep_ends_from_occs(rtype) {
      const w = this.w;
      const stdt = this.get_date_start();
      if (!stdt) return;
      const span = (this.get_repeat_occurrences() - 1) * this.get_repeat_interval();
      let edt;
      if (rtype === 'YEARLY') {
        if ((stdt.getDate() === 29 && stdt.getMonth() === 1) || w.repeaton_year.get_active() > 0) return this._sync_rep_end_from_occ_rrule(rtype);
        edt = new Date(stdt.getFullYear() + span, stdt.getMonth(), stdt.getDate());
      } else if (rtype === 'MONTHLY') {
        if (stdt.getDate() >= 29 || w.repeaton_month.get_active() > 0) return this._sync_rep_end_from_occ_rrule(rtype);
        edt = new Date(stdt.getFullYear(), stdt.getMonth() + span, stdt.getDate());
      } else if (rtype === 'WEEKLY') {
        if (w.repeaton_week.get_active() > 0) return this._sync_rep_end_from_occ_rrule(rtype);
        edt = D.addDays(stdt, span * 7);
      } else if (rtype === 'DAILY') edt = D.addDays(stdt, span);
      else return;
      w.rep_enddt.set_date(edt);
    },
    _sync_occs_from_rep_ends(rtype) {
      const rend = this.w.rep_enddt.get_date_or_none();
      if (!rend) return;
      const tmp = this._rrule_for_sync(rtype, null, rend);
      if (!tmp) return;
      let c = 0;
      for (const d of PG.RRule.iter(tmp)) { c++; if (c > 99999) break; } // eslint-disable-line no-unused-vars
      this.w.rep_occs.set_range(c === 0 ? 0 : 1, 9999);
      this.w.rep_occs.set_value(c);
    },
    _sync_rep_end_from_occ_rrule(rtype) {
      const tmp = this._rrule_for_sync(rtype, this.get_repeat_occurrences(), null);
      if (!tmp) return;
      let last = null;
      for (const d of PG.RRule.iter(tmp)) last = d;
      if (last) this.w.rep_enddt.set_date(last);
    },
    _rrule_for_sync(rtype, occs, rend) {
      const dtst = this.get_date_start();
      if (!dtst) return null;
      const rr = { FREQ: [rtype], INTERVAL: [this.get_repeat_interval()] };
      if (occs) rr.COUNT = [occs];
      if (rend) rr.UNTIL = [PG.ical_dt.fromDate(rend)];
      if (rtype === 'YEARLY') {
        const [bymt, bywkdy] = this._get_yearly_bymonth_byweekday();
        if (bymt) rr.BYMONTH = [bymt];
        if (bywkdy) rr.BYDAY = [bywkdy];
      } else if (rtype === 'MONTHLY') {
        const [bymtdy, bywkdy] = this._get_monthly_bymonthday_byweekday();
        if (bymtdy !== null) rr.BYMONTHDAY = [bymtdy];
        if (bywkdy) rr.BYDAY = [bywkdy];
      } else if (rtype === 'WEEKLY') {
        rr.BYDAY = this._get_weekly_byweekday();
      }
      return { dtstart: PG.ical_dt.fromDate(dtst), rrule: rr };
    },
    _get_yearly_bymonth_byweekday() {
      const repon = this.w.repeaton_year.get_active_id();
      const dt = this.get_date_start();
      let bymt = null, bywkdy = null;
      if (dt) {
        bymt = dt.getMonth() + 1;
        if (repon === 'WEEKDAY') bywkdy = this._weekday_count_in_month(dt) + DAY_ABBR[D.weekday(dt)];
        else if (repon === 'WEEKDAY_FROMEND') bywkdy = this._weekday_fromend_in_month(dt) + DAY_ABBR[D.weekday(dt)];
      }
      return [bymt, bywkdy];
    },
    _get_monthly_bymonthday_byweekday() {
      const repon = this.w.repeaton_month.get_active_id();
      const dt = this.get_date_start();
      let bymtdy = null, bywkdy = null;
      if (dt) {
        if (repon === 'FROMEND') bymtdy = dt.getDate() - D.daysInMonth(dt.getFullYear(), dt.getMonth() + 1) - 1;
        else if (repon === 'WEEKDAY') bywkdy = this._weekday_count_in_month(dt) + DAY_ABBR[D.weekday(dt)];
        else if (repon === 'WEEKDAY_FROMEND') bywkdy = this._weekday_fromend_in_month(dt) + DAY_ABBR[D.weekday(dt)];
      }
      return [bymtdy, bywkdy];
    },
    _get_weekly_byweekday() {
      const repon = this.w.repeaton_week.get_active_id();
      const dt = this.get_date_start();
      if (!dt) return null;
      if (repon === 'MULTIDAY') {
        const days = this.WORKDAYS.includes(D.weekday(dt)) ? this.WORKDAYS : this._nonwork_days();
        return days.map(d => DAY_ABBR[d]);
      }
      return [DAY_ABBR[D.weekday(dt)]];
    },
    _weekday_count_in_month(dt) { return Math.floor((dt.getDate() + 6) / 7); },
    _weekday_fromend_in_month(dt) { return Math.floor((dt.getDate() - D.daysInMonth(dt.getFullYear(), dt.getMonth() + 1) - 1) / 7); },
    _nonwork_days() { return [0, 1, 2, 3, 4, 5, 6].filter(d => !this.WORKDAYS.includes(d)); },
    _daynumbers_to_string(list) {
      if (!list.length) return _('None');
      if (list.length === 1) return PG.day_name[list[0]];
      return list.slice().sort().map(d => PG.day_abbr[d]).join(', ');
    },
    _repon_changed() {
      if (this._block) return;
      const b = this._block; this._block = true;
      this._repon_wid_datesync();
      this._block = b;
    },
    _repon_wid_datesync() {
      const w = this.w;
      const dt = w.date.get_date_or_none();
      if (!dt) return;
      const nd = D.daysInMonth(dt.getFullYear(), dt.getMonth() + 1);
      const fromend = nd - dt.getDate();
      const daynm = PG.day_name[D.weekday(dt)], monthnm = PG.month_name[dt.getMonth() + 1];
      const ordn = PG.ordinal;
      // yearly
      let a = w.repeaton_year.get_active();
      w.repeaton_year.set_items([
        ['STD', dt.getDate() === 1 ? fmt(_('1st {month}'), { month: monthnm }) : fmt(_('{ord} {month}'), { ord: ordn(dt.getDate()), card: dt.getDate(), month: monthnm })],
        ['WEEKDAY', fmt(_('{ord} {day} of {month}'), { ord: ordn(Math.floor((dt.getDate() + 6) / 7)), day: daynm, month: monthnm })],
        ['WEEKDAY_FROMEND', fromend < 7 ? fmt(_('Last {day} of {month}'), { day: daynm, month: monthnm })
          : fmt(_('{ord} to last {day} of {month}'), { ord: ordn(Math.floor(fromend / 7) + 1), day: daynm, month: monthnm })]]);
      w.repeaton_year.el.selectedIndex = Math.max(0, a);
      // monthly
      a = w.repeaton_month.get_active();
      w.repeaton_month.set_items([
        ['STD', dt.getDate() === 1 ? _('1st day of month') : fmt(_('{ord} day of month'), { ord: ordn(dt.getDate()), card: dt.getDate() })],
        ['FROMEND', fromend === 0 ? _('Last day of month') : fmt(_('{} to last day of month'), ordn(fromend + 1))],
        ['WEEKDAY', fmt(_('{ord} {day} of month'), { ord: ordn(Math.floor((dt.getDate() + 6) / 7)), day: daynm })],
        ['WEEKDAY_FROMEND', fromend < 7 ? fmt(_('Last {day} of month'), { day: daynm })
          : fmt(_('{ord} to last {day} of month'), { ord: ordn(Math.floor(fromend / 7) + 1), day: daynm })]]);
      w.repeaton_month.el.selectedIndex = Math.max(0, a);
      // weekly
      a = w.repeaton_week.get_active();
      const wd = D.weekday(dt);
      const daylist = this.WORKDAYS.includes(wd) ? this.WORKDAYS : this._nonwork_days();
      w.repeaton_week.set_items([['STD', PG.cap(PG.day_name[wd])], ['MULTIDAY', fmt(_('Days: {}'), this._daynumbers_to_string(daylist))]]);
      w.repeaton_week.el.selectedIndex = Math.max(0, a);
    },

    /* ---------------- public entry points ---------------- */
    async new_event(txt, date) {
      const [response, ei] = await this._do_event_dialog({ txt, date, title: _('New Event') });
      if (response === 'ok' && ei.desc) {
        const ev = Cal.new_entry(ei);
        PG.GUI.cursor_goto_event(ev);
        PG.GUI.view_redraw(true);
      }
    },
    async edit_event(event, subtab) {
      const [response, ei] = await this._do_event_dialog({ event, subtab, title: _('Edit Event') });
      if (response === 'ok') {
        if (ei.desc) {
          const ev = Cal.update_entry(event, ei);
          PG.GUI.cursor_goto_event(ev);
          PG.GUI.view_redraw(true);
        } else {
          PG.GUI.dialog_deleteentry(event);
        }
      }
    },
    _do_event_dialog(o) {
      this._build();
      this.alarms = []; this.alarm_sel = -1; this.exception_list = [];
      this._seed_fields(o.event, o.txt, o.date); // may throw BeyondEdit
      const w = this.w;
      w.tabs.set_current_page(0);
      if (o.subtab !== undefined && o.subtab !== null) w.tabs.set_current_page(o.subtab);
      this._block = false;
      let discard_on_empty = !o.event;
      let cancelled = false;
      this.dlg = new PG.Dialog({
        title: o.title, content: this.content, cls: 'dialog_event',
        buttons: [{ label: _('Cancel'), response: 'cancel' }, { label: _('OK'), response: 'ok', default: true }],
        onresponse: resp => {
          if (resp !== 'ok') return true;
          if (discard_on_empty && this._fields_are_defaults()) { cancelled = true; return true; }
          if (this._is_valid_event(true)) return true;
          discard_on_empty = false;
          return false;
        },
      });
      let focusEl = w.desc;
      if (o.subtab !== undefined && o.subtab !== null) focusEl = w.tabs.tabs[o.subtab];
      const pr = this.dlg.run(focusEl);
      if (focusEl === w.desc) {
        requestAnimationFrame(() => {
          if (o.event) w.desc.select();                                   // grab_focus(): select all
          else w.desc.setSelectionRange(w.desc.value.length, w.desc.value.length); // grab_focus_without_selecting()
        });
      }
      return pr.then(resp => {
        if (cancelled) resp = 'cancel';
        return [resp, resp === 'ok' ? this._get_entryinfo() : null];
      });
    },
    _seed_fields(event, txt, date) {
      this._set_fields_to_defaults(date);
      if (!event) {
        if (txt !== null && txt !== undefined) this.w.desc.value = txt;
      } else this._seed_from_event(event);
      this._repon_wid_datesync();
      this._seed_rep_exception_list(event);
      this._reptype_changed();
      const ti = this.w.timed.get_active();
      PG.reveal(this.revs_timedur, ti === 1); PG.reveal(this.revs_allday, ti === 2);
    },
    _set_fields_to_defaults(date) {
      const w = this.w;
      w.desc.value = '';
      w.date.set_date(date || D.today());
      w.calendar.set_active(0);
      w.timed.set_active(0);
      w.time.set_time(new Date(2000, 0, 1, 9, 0));
      w.dur.set_duration(0);
      w.endtime.set_time(new Date(2000, 0, 1, 9, 0));
      this.dur_determines_end = true;
      w.allday_count.set_value(1);
      w.rep_type.el.selectedIndex = 0;
      w.repeaton_year.el.selectedIndex = 0; w.repeaton_month.el.selectedIndex = 0; w.repeaton_week.el.selectedIndex = 0;
      w.rep_interval.set_value(1);
      w.rep_forever.checked = true;
      this.rep_occs_determines_end = true;
      w.rep_occs.set_value(1); w.rep_occs.set_range(1, 9999);
      const showWarn = this.show_alarm_warning;
      w.alarm_warning.hidden = !showWarn;
      w.alarm_content.hidden = showWarn;
      w.alarmset.el.checked = false;
      PG.reveal(w.alarmreveal, false);
      this.alarms = []; this._render_alarms();
      w.location.value = '';
      w.status.el.selectedIndex = 0;
      w.notes.value = '';
    },
    _seed_from_event(ev) {
      const w = this.w;
      if (ev.summary !== undefined) w.desc.value = ev.summary;
      w.calendar.set_active_id(String(ev.cal));
      this._seed_date_timetab(ev);
      if (ev.rrule) this._seed_repeatstab(ev.rrule, PG.test_anniversary(ev));
      if (ev.alarms && ev.alarms.length) this._seed_alarmstab(ev.alarms);
      if (ev.location) w.location.value = ev.location;
      if (ev.status && Cal.STATUS_LIST_EVENT.includes(ev.status)) w.status.set_active_id(ev.status);
      if (ev.description) w.notes.value = ev.description;
      this._block = true;
      this._sync_rep_occs_end();
    },
    _seed_date_timetab(ev) {
      const w = this.w;
      const st = PG.ical_dt.parse(ev.dtstart);
      if (!st) throw new BeyondEdit('Event without date');
      let tm = null, dur = null, end = null;
      const dt = D.dayStart(st.dt);
      if (!st.isDate) {
        tm = st.dt;
        if (ev.dtend) end = PG.ical_dt.parse(ev.dtend).dt;
        else if (typeof ev.duration === 'number') dur = ev.duration;
      } else if (ev.dtend) {
        const e = PG.ical_dt.parse(ev.dtend);
        if (e.isDate) end = e.dt;
      }
      w.date.set_date(dt);
      if (tm) { w.timed.set_active(1); w.time.set_time(tm); }
      else if (end) { w.timed.set_active(2); w.allday_count.set_value(D.dayDiff(dt, end)); }
      if (dur !== null && tm) { end = new Date(tm.getTime() + dur * 1000); this.dur_determines_end = true; }
      else if (end && tm) { dur = Math.round((end - tm) / 1000); this.dur_determines_end = false; }
      if (dur === null || !tm) { if (tm) w.endtime.set_time(tm); }
      else { w.dur.set_duration(dur); w.endtime.set_time(end); }
    },
    _seed_repeatstab(rr, anniv) {
      const w = this.w;
      const freq = String(rr.FREQ[0]).toUpperCase();
      if (anniv === -1) throw new BeyondEdit('Editing this anniversary type not supported');
      if (anniv === 1) w.rep_type.set_active_id('anniv');
      else if (['YEARLY', 'MONTHLY', 'WEEKLY', 'DAILY'].includes(freq)) w.rep_type.set_active_id(freq);
      else throw new BeyondEdit(`Editing repeat freq '${freq}' not (yet) supported`);
      for (const k of ['BYSETPOS', 'BYHOUR', 'BYMINUTE', 'BYSECOND']) if (rr[k]) throw new BeyondEdit(k + ' not supported');
      if (freq === 'YEARLY') this._seed_reptab_yearly(rr);
      else if (freq === 'MONTHLY') this._seed_reptab_monthly(rr);
      else if (freq === 'WEEKLY') this._seed_reptab_weekly(rr);
      else if (freq === 'DAILY' && (rr.BYDAY || rr.BYMONTH || rr.BYMONTHDAY)) throw new BeyondEdit('Editing DAILY repeat with BY-rules not supported');
      w.rep_interval.set_value(rr.INTERVAL ? parseInt(rr.INTERVAL[0], 10) : 1);
      if (rr.COUNT) {
        w.rep_forever.checked = false;
        const c = parseInt(rr.COUNT[0], 10);
        w.rep_occs.set_value(c >= 1 ? c : 1);
        this.rep_occs_determines_end = true;
      } else if (rr.UNTIL) {
        w.rep_forever.checked = false;
        const u = D.dayStart(PG.ical_dt.parse(String(rr.UNTIL[0])).dt);
        const st = this.get_date_start();
        w.rep_enddt.set_date(u > st ? u : st);
        this.rep_occs_determines_end = false;
      }
    },
    _seed_reptab_yearly(rr) {
      const w = this.w;
      if (rr.BYYEARDAY) throw new BeyondEdit('BYYEARDAY in YEARLY repeat not supported');
      if (rr.BYWEEKNO) throw new BeyondEdit('BYWEEKNO in YEARLY repeat not supported');
      if (rr.BYMONTHDAY) throw new BeyondEdit('BYMONTHDAY in YEARLY repeat not supported');
      const hm = !!rr.BYMONTH, hd = !!rr.BYDAY;
      if (hm && !hd) {
        // BYMONTH equal to start month is harmless
        if (rr.BYMONTH.length === 1 && parseInt(rr.BYMONTH[0], 10) === this.get_date_start().getMonth() + 1) return;
        throw new BeyondEdit('BYMONTH in YEARLY repeat only supported with BYDAY');
      }
      if (hd && !hm) throw new BeyondEdit('BYDAY in YEARLY repeat only supported with BYMONTH');
      if (hd) {
        if (rr.BYDAY.length > 1) throw new BeyondEdit('Editing YEARLY repeat with multiple BYDAY not supported');
        if (rr.BYMONTH.length > 1) throw new BeyondEdit('Editing YEARLY repeat with multiple BYMONTH not supported');
        const st = this.get_date_start();
        if (parseInt(rr.BYMONTH[0], 10) !== st.getMonth() + 1) throw new BeyondEdit('YEARLY repeat with mismatching BYMONTH');
        const b = PG.RRule.parseByday(rr.BYDAY[0]);
        if (!b || b.wd !== D.weekday(st)) throw new BeyondEdit('Repeat BYDAY does not match start date');
        if (b.n === this._weekday_count_in_month(st)) w.repeaton_year.set_active_id('WEEKDAY');
        else if (b.n === this._weekday_fromend_in_month(st)) w.repeaton_year.set_active_id('WEEKDAY_FROMEND');
        else throw new BeyondEdit('Repeat BYDAY does not match start date');
      }
    },
    _seed_reptab_monthly(rr) {
      const w = this.w;
      if (rr.BYDAY && rr.BYMONTHDAY) throw new BeyondEdit('MONTHLY repeat has both BYDAY and BYMONTHDAY');
      if (rr.BYMONTH) throw new BeyondEdit('BYMONTH in MONTHLY repeat not supported');
      const st = this.get_date_start();
      if (rr.BYDAY) {
        if (rr.BYDAY.length > 1) throw new BeyondEdit("Editing MONTHLY repeat with multiple 'BYDAY' not (yet) supported");
        const b = PG.RRule.parseByday(rr.BYDAY[0]);
        if (!b || b.wd !== D.weekday(st)) throw new BeyondEdit('Repeat BYDAY does not match start date');
        if (b.n === this._weekday_count_in_month(st)) w.repeaton_month.set_active_id('WEEKDAY');
        else if (b.n === this._weekday_fromend_in_month(st)) w.repeaton_month.set_active_id('WEEKDAY_FROMEND');
        else throw new BeyondEdit('Repeat BYDAY does not match start date');
      } else if (rr.BYMONTHDAY) {
        if (rr.BYMONTHDAY.length !== 1) throw new BeyondEdit("Editing MONTHLY repeat with multiple 'BYMONTHDAY' not (yet) supported");
        const md = parseInt(rr.BYMONTHDAY[0], 10);
        if (isNaN(md)) throw new BeyondEdit('Non-integer value for BYMONTHDAY');
        if (md >= 0) { if (st.getDate() !== md) throw new BeyondEdit('Repeat BYMONTHDAY does not match start date'); }
        else {
          if (st.getDate() - D.daysInMonth(st.getFullYear(), st.getMonth() + 1) - 1 !== md) throw new BeyondEdit('Repeat BYMONTHDAY does not match start date');
          w.repeaton_month.set_active_id('FROMEND');
        }
      }
    },
    _seed_reptab_weekly(rr) {
      const w = this.w;
      if (rr.BYMONTH || rr.BYMONTHDAY) throw new BeyondEdit('Editing WEEKLY repeat with BYMONTH not supported');
      if (rr.BYDAY) {
        if (rr.WKST) throw new BeyondEdit("Editing WEEKLY repeat with 'WKST' not supported");
        if (rr.BYDAY.length > 1) {
          const set = new Set(rr.BYDAY.map(s => s.toUpperCase()));
          const eq = list => list.length === set.size && list.every(d => set.has(DAY_ABBR[d]));
          if (eq(this.WORKDAYS) || eq(this._nonwork_days())) { w.repeaton_week.set_active_id('MULTIDAY'); return; }
          throw new BeyondEdit("Editing WEEKLY repeat with arbitrary 'BYDAY' not supported");
        }
      }
      w.repeaton_week.set_active_id('STD');
    },
    _seed_rep_exception_list(ev) {
      this.exception_list = [];
      if (ev && ev.rrule && ev.exdate) {
        const s = new Map();
        for (const x of ev.exdate) { const p = PG.ical_dt.parse(x); if (p) { const d = D.dayStart(p.dt); s.set(d.getTime(), d); } }
        this.exception_list = [...s.values()].sort((a, b) => a - b);
      }
      this._set_label_rep_list();
    },
    _set_label_rep_list() {
      const n = this.exception_list.length, MAX = 3;
      let txt = '';
      for (let i = 0; i < n; i++) {
        if (i === MAX - 1 && n > MAX) { txt += fmt(_(' + {} more'), n - i); break; }
        if (i) txt += ', ';
        txt += PG.strftime(this.exception_list[i], PG.datefmt.numeric);
      }
      this.w.lab_rep_exceptions.textContent = txt || _('None');
    },
    _seed_alarmstab(valarms) {
      for (const a of valarms) {
        if (typeof a.trigger === 'number' && a.action) {
          if (Array.isArray(a.attendee)) throw new BeyondEdit("Can't edit alarm with >1 email addresses");
          this.alarms.push({ tdelta: a.trigger, action: a.action, desc: a.description ?? null, summary: a.summary ?? null, attendee: a.attendee ?? null, attach: a.attach ?? null });
        }
      }
      this._render_alarms();
      if (this.alarms.length) { this.w.alarmset.el.checked = true; PG.reveal(this.w.alarmreveal, true); }
    },
    _fields_are_defaults() {
      const w = this.w;
      if (w.desc.value) return false;
      if (!this.get_date_start()) return false;
      if (w.timed.get_active() !== 0) return false;
      if (w.rep_type.get_active() !== 0) return false;
      if (this.show_alarm_warning && w.alarm_warning.hidden) return false;
      if (w.alarmset.get_active()) return false;
      if (w.location.value) return false;
      if (w.status.get_active() !== 0) return false;
      if (w.notes.value) return false;
      return true;
    },
    _get_entryinfo() {
      const w = this.w;
      const ei = new PG.EntryInfo({
        cal_idx: parseInt(w.calendar.get_active_id() || '0', 10), desc: w.desc.value,
        start_dt: this.get_datetime_start(), status: w.status.get_active_id(), location: w.location.value,
      });
      if (w.timed.get_active() === 2) {
        if (ei.start_dt) ei.set_end_dt({ dt: D.addDays(ei.start_dt.dt, Math.max(1, w.allday_count.get_value())), isDate: true });
      } else if (w.timed.get_active() === 1) {
        if (this.dur_determines_end) ei.set_duration(w.dur.get_duration_or_none());
        else ei.set_end_dt({ time: w.endtime.get_time_or_none() });
      }
      this._fillin_repeatinfo(ei);
      if (w.alarmset.get_active()) for (const a of this.alarms) ei.add_alarm(a);
      if (w.notes.value) ei.set_longdesc(w.notes.value);
      return ei;
    },
    _fillin_repeatinfo(ei) {
      const w = this.w;
      const reptype = w.rep_type.get_active_id();
      if (!reptype) return;
      let inter = 1, byday = null, bymonth = null, bymonthday = null, count = null, until = null;
      const anniv = reptype === 'anniv';
      if (!anniv) {
        inter = this.get_repeat_interval();
        const dt = this.get_date_start();
        if (dt) {
          const abbr = DAY_ABBR[D.weekday(dt)];
          if (reptype === 'YEARLY') {
            const repon = w.repeaton_year.get_active_id();
            if (repon === 'WEEKDAY') { bymonth = String(dt.getMonth() + 1); byday = this._weekday_count_in_month(dt) + abbr; }
            else if (repon === 'WEEKDAY_FROMEND') { bymonth = String(dt.getMonth() + 1); byday = this._weekday_fromend_in_month(dt) + abbr; }
          } else if (reptype === 'MONTHLY') {
            const repon = w.repeaton_month.get_active_id();
            if (repon === 'FROMEND') bymonthday = String(dt.getDate() - D.daysInMonth(dt.getFullYear(), dt.getMonth() + 1) - 1);
            else if (repon === 'WEEKDAY') byday = this._weekday_count_in_month(dt) + abbr;
            else if (repon === 'WEEKDAY_FROMEND') byday = this._weekday_fromend_in_month(dt) + abbr;
          } else if (reptype === 'WEEKLY') {
            if (w.repeaton_week.get_active_id() === 'MULTIDAY') {
              byday = (this.WORKDAYS.includes(D.weekday(dt)) ? this.WORKDAYS : this._nonwork_days()).map(d => DAY_ABBR[d]);
            }
          }
        }
        if (!w.rep_forever.checked) {
          if (this.rep_occs_determines_end) count = this.get_repeat_occurrences();
          else until = w.rep_enddt.get_date_or_none();
        }
      }
      ei.set_repeat_info(anniv ? 'YEARLY' : reptype, { interval: inter, count, until, byday, bymonth, bymonthday, except_list: this._get_exceptions_list_for_type(), anniv });
    },
    _get_exceptions_list_for_type() {
      if (!this.exception_list.length) return null;
      if (this.w.timed.get_active() === 1) {
        const tm = this.w.time.get_time_or_none();
        if (tm) return this.exception_list.map(d => ({ dt: new Date(d.getFullYear(), d.getMonth(), d.getDate(), tm.getHours(), tm.getMinutes()), isDate: false }));
      }
      return this.exception_list.map(d => ({ dt: d, isDate: true }));
    },
    _is_valid_event(set_style) {
      const w = this.w;
      if (!w) return true;
      let ret = true;
      const err = [false, false, false, false];
      const chk = (bad, set, unset, tab) => {
        if (bad) { ret = false; if (set_style) { set(); if (tab !== undefined) err[tab] = true; } }
        else unset();
      };
      chk(!w.desc.value, () => w.desc.classList.add('dialog_error'), () => w.desc.classList.remove('dialog_error'));
      const st = this.get_date_start();
      chk(!st, () => w.date.setError(true), () => w.date.setError(false));
      const timed = w.timed.get_active() === 1;
      chk(timed && !w.time.get_time_or_none(), () => w.time.setError(true), () => w.time.setError(false), this.TAB_TIME);
      chk(timed && this.dur_determines_end && w.dur.get_duration_or_none() === null, () => w.dur.setError(true), () => w.dur.setError(false), this.TAB_TIME);
      chk(timed && !this.dur_determines_end && !w.endtime.get_time_or_none(), () => w.endtime.setError(true), () => w.endtime.setError(false), this.TAB_TIME);
      const rep_end_active = w.rep_type.get_active() > 0 && w.rep_type.get_active_id() !== 'anniv' && !w.rep_forever.checked;
      const end = w.rep_enddt.get_date_or_none();
      chk(rep_end_active && (!end || (st && end < st)), () => w.rep_enddt.setError(true), () => w.rep_enddt.setError(false), this.TAB_REPEATS);
      chk(rep_end_active && w.rep_occs.get_value() < 1, () => w.rep_occs.setError(true), () => w.rep_occs.setError(false), this.TAB_REPEATS);
      if (set_style && !err[w.tabs.get_current_page()]) {
        const i = err.indexOf(true);
        if (i >= 0) w.tabs.set_current_page(i);
      }
      return ret;
    },
    get_date_start() { return this.w.date.get_date_or_none(); },
    get_datetime_start() {
      const dt = this.w.date.get_date_or_none();
      if (!dt) return null;
      if (this.w.timed.get_active() === 1) {
        const tm = this.w.time.get_time_or_none();
        if (tm) return { dt: new Date(dt.getFullYear(), dt.getMonth(), dt.getDate(), tm.getHours(), tm.getMinutes()), isDate: false };
      }
      return { dt, isDate: true };
    },
    get_repeat_interval() { const r = parseInt(this.w.rep_interval.get_text(), 10); return isNaN(r) || r < 1 ? 1 : r; },
    get_repeat_occurrences() { const r = parseInt(this.w.rep_occs.get_text(), 10); return isNaN(r) || r < 1 ? 1 : r; },
    async dialog_repeat_exceptions() {
      const res = await ExceptionsDialog.run(this.exception_list);
      if (res) { this.exception_list = res.sort((a, b) => a - b); this._set_label_rep_list(); }
    },
  };
  PG.EventDialog = EventDialog;

  /* ================================================================ */
  /* Exceptions dialog                                                */
  /* ================================================================ */
  const ExceptionsDialog = {
    run(list) {
      const wdate = new PG.WidgetDate();
      wdate.onchange(() => { if (wdate.get_date_or_none()) wdate.setError(false); });
      const lb = h('select.exlist', { multiple: true, size: '5' });
      const dates = new Map();
      const render = (selKey) => {
        lb.innerHTML = '';
        [...dates.values()].sort((a, b) => a - b).forEach(d => {
          const o = h('option', { value: String(d.getTime()), text: PG.strftime(d, PG.datefmt.textabb) });
          if (selKey === d.getTime()) o.selected = true;
          lb.appendChild(o);
        });
      };
      for (const d of list) dates.set(d.getTime(), d);
      render();
      const add = h('button.dialogbutton', {
        type: 'button', text: _('Add date'), onclick: () => {
          const dt = wdate.get_date_or_none();
          if (!dt) { wdate.setError(true); return; }
          dates.set(dt.getTime(), dt); render(dt.getTime());
        },
      });
      const rem = h('button.dialogbutton', {
        type: 'button', text: _('Remove date(s)'), onclick: () => {
          for (const o of [...lb.selectedOptions]) dates.delete(parseInt(o.value, 10));
          render();
        },
      });
      lb.addEventListener('keydown', ev => { if (ev.key === 'Delete' || ev.key === 'Backspace') { ev.preventDefault(); rem.click(); } });
      const content = h('div', {}, h('div.exdialog', {}, h('div.excol', {}, wdate.el, add), h('div.excol', {}, lb, rem)),
        h('div.wiplabel', { text: _('Note: this dialog needs refining!') }));
      const dlg = new PG.Dialog({ title: _('Exception dates'), content, buttons: [{ label: _('Cancel'), response: 'cancel' }, { label: _('OK'), response: 'ok', default: true }] });
      return dlg.run().then(r => (r === 'ok' ? [...dates.values()] : null));
    },
  };

  /* ================================================================ */
  /* To-do dialog                                                     */
  /* ================================================================ */
  const TodoDialog = {
    _build() {
      const w = this.w = {};
      w.desc = PG.textEntry();
      const [titles, cats] = PG.GUI.todo_titles_default_cats();
      this.list_default_cats = cats;
      w.todolist = new PG.Combo(titles.map((t, i) => [i, t]));
      const cals = Cal.calendar_displaynames_todo_rw();
      w.calendar = new PG.Combo(cals.map(([i, n]) => [i, n]));
      const calRow = row(_('Calendar:'), w.calendar.el);
      if (cals.length <= 1) calRow.forEach(e => { e.hidden = true; });
      w.priority = new PG.Combo([[null, _('None')], [1, _('1 (Highest)')], [2, '2'], [3, '3'], [4, '4'], [5, '5'], [6, '6'], [7, '7'], [8, '8'], [9, _('9 (Lowest)')]]);
      w.status = new PG.Combo([[null, _('None')], ['NEEDS-ACTION', _('Action required')], ['IN-PROCESS', _('In progress')], ['COMPLETED', _('Completed')], ['CANCELLED', _('Cancelled')]]);
      w.dueswitch = new PG.Switch(false);
      w.duedate = new PG.WidgetDate();
      w.duedate.set_left_widget(w.dueswitch.el);
      w.duereveal = h('span.duereveal.collapsed', {}, w.duedate.el);
      w.dueswitch.onchange(v => PG.reveal(w.duereveal, v));
      w.dueswitch.el.addEventListener('keydown', ev => { if (ev.key === 'ArrowRight' && w.dueswitch.el.checked) { ev.preventDefault(); w.duedate.focus(); } });
      w.notes = PG.notesEntry();
      const top = h('div.dlggrid', {}, ...row(_('Description:'), w.desc), ...row(_('To-do list:'), w.todolist.el), ...calRow,
        ...row(_('Priority:'), w.priority.el), ...row(_('Status:'), w.status.el));
      w.tabs = new PG.Notebook([
        { label: _('Dates/Times'), content: h('div.dlggrid', {}, ...row(_('Due date:'), h('span.duebox', {}, w.dueswitch.el, w.duereveal))) },
        { label: _('Details'), content: h('div.dlggrid', {}, ...row(_('Notes:'), w.notes)) }]);
      w.desc.addEventListener('input', () => this._is_valid_todo(false));
      w.duedate.onchange(() => this._is_valid_todo(false));
      this.content = h('div.tododialog', {}, top, w.tabs.el);
    },
    async new_todo(txt, list_idx) {
      const [resp, ei, li] = await this._do_todo_dialog({ txt, list_idx, title: _('New To-do') });
      if (resp === 'ok' && ei.desc) {
        const td = Cal.new_entry(ei);
        PG.GUI.cursor_goto_todo(td, li);
        PG.GUI.view_redraw(true);
      }
    },
    async edit_todo(todo, list_idx) {
      const [resp, ei, li] = await this._do_todo_dialog({ todo, list_idx, title: _('Edit To-do') });
      if (resp === 'ok') {
        if (ei.desc) {
          const td = Cal.update_entry(todo, ei);
          PG.GUI.cursor_goto_todo(td, li);
          PG.GUI.view_redraw(true);
        } else PG.GUI.dialog_deleteentry(todo);
      }
    },
    _do_todo_dialog(o) {
      this._build();
      const w = this.w;
      this._seed_fields(o.todo, o.txt, o.list_idx);
      w.tabs.set_current_page(0);
      let discard_on_empty = !o.todo, cancelled = false;
      const dlg = new PG.Dialog({
        title: o.title, content: this.content, cls: 'dialog_todo',
        buttons: [{ label: _('Cancel'), response: 'cancel' }, { label: _('OK'), response: 'ok', default: true }],
        onresponse: resp => {
          if (resp !== 'ok') return true;
          if (discard_on_empty && this._fields_are_defaults()) { cancelled = true; return true; }
          if (this._is_valid_todo(true)) return true;
          discard_on_empty = false;
          return false;
        },
      });
      const pr = dlg.run(w.desc);
      requestAnimationFrame(() => {
        if (o.todo) w.desc.select(); else w.desc.setSelectionRange(w.desc.value.length, w.desc.value.length);
      });
      return pr.then(resp => {
        if (cancelled) resp = 'cancel';
        return [resp, resp === 'ok' ? this._get_entryinfo() : null, w.todolist.get_active()];
      });
    },
    _seed_fields(todo, txt, list_idx) {
      const w = this.w;
      w.desc.value = '';
      w.todolist.set_active(0); w.calendar.set_active(0); w.priority.set_active(0); w.status.set_active(0);
      w.dueswitch.set_active(false);
      w.duedate.set_date(PG.GUI.cursor_date() || D.today());
      w.notes.value = '';
      if (todo) {
        if (todo.due && /T/.test(todo.due)) throw new BeyondEdit('Editing todo with date+time DUE not supported');
        if (todo.dtstart || todo.dtend || todo.completed) throw new BeyondEdit('Editing todo with unsupported date property');
        if (todo.summary !== undefined) w.desc.value = todo.summary;
        w.calendar.set_active_id(String(todo.cal));
        if (todo.priority >= 1 && todo.priority <= 9) w.priority.set_active(todo.priority);
        if (todo.due) { w.dueswitch.set_active(true); w.duedate.set_date(PG.ical_dt.parse(todo.due).dt); }
        if (todo.status && Cal.STATUS_LIST_TODO.includes(todo.status)) w.status.set_active_id(todo.status);
        if (todo.description) w.notes.value = todo.description;
      } else if (txt !== null && txt !== undefined) {
        w.desc.value = txt;
      }
      if (list_idx !== null && list_idx !== undefined) w.todolist.set_active(list_idx);
      else if (todo) { const i = PG.View_Todo.first_list_index(todo); if (i !== null) w.todolist.set_active(i); }
    },
    _fields_are_defaults() {
      const w = this.w;
      return !w.desc.value && w.priority.get_active() === 0 && !w.dueswitch.get_active() && w.status.get_active() === 0;
    },
    _is_valid_todo(set_style) {
      const w = this.w;
      let ret = true;
      if (!w.desc.value) { ret = false; if (set_style) w.desc.classList.add('dialog_error'); } else w.desc.classList.remove('dialog_error');
      if (w.dueswitch.get_active() && !w.duedate.is_valid_date()) { ret = false; if (set_style) w.duedate.setError(true); } else w.duedate.setError(false);
      return ret;
    },
    _get_entryinfo() {
      const w = this.w;
      const ei = new PG.EntryInfo({ type: PG.EntryInfo.TYPE_TODO, cal_idx: parseInt(w.calendar.get_active_id() || '0', 10), desc: w.desc.value, status: w.status.get_active_id() });
      const li = w.todolist.get_active();
      ei.set_categories(this.list_default_cats[li]);
      if (w.dueswitch.get_active()) ei.set_duedate(w.duedate.get_date_or_none());
      ei.set_priority(w.priority.get_active());
      if (w.notes.value) ei.set_longdesc(w.notes.value);
      return ei;
    },
  };
  PG.TodoDialog = TodoDialog;

  /* ================================================================ */
  /* Find                                                             */
  /* ================================================================ */
  PG.FindDialog = {
    _last: '',
    async find() {
      const txt = PG.textEntry();
      txt.value = this._last;
      const content = h('div', {}, h('div.dlggrid', {}, ...row(_('Find text:'), txt)), h('div.wiplabel', { text: _('Note: Find functionality is placeholder') }));
      const dlg = new PG.Dialog({ title: _('Find'), content, buttons: [{ label: _('Cancel'), response: 'cancel' }, { label: _('OK'), response: 'ok', default: true }] });
      setTimeout(() => txt.select(), 0);
      const r = await dlg.run(txt);
      this._last = txt.value;
      if (r === 'ok' && txt.value) this._find_results(txt.value);
    },
    _find_results(txt) {
      const res = Cal.search(txt);
      let content;
      if (!res.length) content = h('div.noresults', { text: _('No results found') });
      else {
        const g = h('div.find_results');
        for (const en of res) {
          let left;
          if (Cal.isTodo(en)) left = 'Ⓣ';
          else left = PG.strftime(PG.ical_dt.parse(en.dtstart).dt, PG.datefmt.numeric);
          const r = h('div.findrow', { tabindex: '0' }, h('span.findleft', { text: left }), h('span.findsum', { text: en.summary || '' }));
          const go = () => { dlg.response('close'); this._goto(en); };
          r.addEventListener('click', go);
          r.addEventListener('keydown', ev => {
            if (ev.key === 'Enter') { ev.preventDefault(); ev.stopPropagation(); go(); }
            else if (ev.key === 'ArrowDown' || ev.key === 'ArrowUp') { ev.preventDefault(); PG.moveFocus(r, ev.key === 'ArrowUp' ? -1 : 1); }
          });
          g.appendChild(r);
        }
        content = g;
      }
      const dlg = new PG.Dialog({ title: _('Find results'), content, buttons: [{ label: _('Close'), response: 'close', default: true }] });
      dlg.run();
    },
    _goto(en) {
      if (Cal.isTodo(en)) PG.GUI.cursor_goto_todo(en, 0); else PG.GUI.cursor_goto_event(en);
      PG.GUI.view_redraw(true);
    },
  };

  /* ================================================================ */
  /* Entry properties                                                 */
  /* ================================================================ */
  PG.EntryPropertiesDialog = {
    RRULE_RPTPROPLIST: {
      BYMONTH: 'By month:', BYWEEKNO: 'By week number:', BYYEARDAY: 'By year day:', BYMONTHDAY: 'By month day:',
      BYDAY: 'By day:', BYHOUR: 'By hour:', BYMINUTE: 'By minute:', BYSECOND: 'By second:', BYSETPOS: 'By set position:',
      WKST: 'Week starts:', UNTIL: 'Until:', COUNT: 'Count:',
    },
    STATUS_MAP: { 'IN-PROCESS': 'In progress', 'NEEDS-ACTION': 'Action required' },
    _dtstr(v) {
      const p = PG.ical_dt.parse(v);
      if (!p) return v;
      const s = `${p.dt.getFullYear()}-${D.pad(p.dt.getMonth() + 1)}-${D.pad(p.dt.getDate())}`;
      return p.isDate ? s : `${s} ${D.pad(p.dt.getHours())}:${D.pad(p.dt.getMinutes())}:${D.pad(p.dt.getSeconds())}`;
    },
    show(en) {
      const rows = [];
      const add = (l, v, wrap) => rows.push([l, v, wrap ? 'wrap' : null]);
      if (en.summary !== undefined) add(_('Summary:'), en.summary);
      add(_('Type:'), Cal.isEvent(en) ? _('Event') : _('Todo'));
      add(_('Calendar:'), Cal.calendar_displayname(en));
      const dtrow = (v, ld, ldt) => { if (v) add(/T/.test(v) ? ldt : ld, this._dtstr(v) + (v === en.dtstart && en.tzid ? ` (timezone: ${en.tzid})` : '')); };
      dtrow(en.dtstart, _('Start date:'), _('Start date/time:'));
      dtrow(en.dtend, _('End date:'), _('End date/time:'));
      if (typeof en.duration === 'number') add(_('Duration:'), PG.str_timedelta(en.duration));
      dtrow(en.due, _('Due date:'), _('Due date/time:'));
      if (en.completed) add(_('Completed date/time:'), en.completed);
      let rep = '';
      if (en.rrule) {
        const rr = en.rrule;
        if (rr.FREQ) {
          rep = String(rr.FREQ[0]).charAt(0) + String(rr.FREQ[0]).slice(1).toLowerCase();
          rep = _(rep);
          if (rr.INTERVAL) rep += ` (${_('interval:')} ${rr.INTERVAL[0]})`;
        }
        for (const by in this.RRULE_RPTPROPLIST) {
          if (rr[by]) {
            if (rep) rep += '\n';
            let val = rr[by];
            if (by === 'UNTIL') val = [this._dtstr(String(val[0]))];
            rep += _(this.RRULE_RPTPROPLIST[by]) + ' ' + (val.length === 1 ? val[0] : '[' + val.join(', ') + ']');
          }
        }
      }
      if (PG.test_anniversary(en) !== 0) rep = [_('Anniversary'), rep].join(', ');
      if (en.exdate && en.exdate.length) {
        if (rep) rep += '\n';
        rep += _('Exception dates:') + en.exdate.map(x => ' ' + this._dtstr(x)).join(';');
      }
      if (rep) add(_('Repeats:'), rep);
      if (en.priority) add(_('Priority:'), String(en.priority));
      if (en.status) add(_('Status:'), _(this.STATUS_MAP[en.status] || (en.status.charAt(0) + en.status.slice(1).toLowerCase())));
      if (en.location) add(_('Location:'), en.location);
      if (en.alarms && en.alarms.length) {
        const s = en.alarms.map(a => {
          if (typeof a.trigger !== 'number') return a.trigger_abs ? a.trigger_abs : _('Unspecified');
          let t = a.trigger < 0 ? '−' + PG.str_timedelta(-a.trigger) : PG.str_timedelta(a.trigger);
          if (a.action) {
            const act = a.action.charAt(0) + a.action.slice(1).toLowerCase();
            t += ' ' + _(act);
            if (act === 'Email' && a.attendee) t += '\n(' + [].concat(a.attendee).join(', ') + ')';
            if ((act === 'Display' || act === 'Email') && a.description !== undefined) t += '\n“' + a.description + '”';
            if (act === 'Audio' && a.attach) t += '\n' + a.attach;
          }
          return t;
        }).join('\n');
        add(_('Alarms:'), s);
      }
      if (en.description) add(_('Description:'), en.description, true);
      if (en.url) add(_('URL:'), h('a', { href: en.url, target: '_blank', rel: 'noopener', text: en.url }));
      if (en.categories && en.categories.length) add(_('Categories:'), en.categories.join(', '));
      const dlg = new PG.Dialog({ title: _('Entry properties'), content: PG.grid(rows, 'propgrid'), buttons: [{ label: _('Close'), response: 'close', default: true }] });
      return dlg.run();
    },
  };

  /* ================================================================ */
  /* Import                                                           */
  /* ================================================================ */
  PG.ImportController = {
    import_flow() {
      const inp = h('input', { type: 'file', accept: '.ics,.ical,.ifb,.icalendar,text/calendar' });
      inp.addEventListener('change', () => {
        const f = inp.files && inp.files[0];
        if (!f) return;
        const rd = new FileReader();
        rd.onload = () => this._import_text(String(rd.result));
        rd.onerror = () => PG.GUI.show_error_alert(_('Error reading ical file'));
        rd.readAsText(f);
      });
      inp.click();
    },
    async _import_text(text) {
      let cal;
      try { cal = PG.ICal.parse(text); } catch (e) { PG.GUI.show_error_alert(_('Error reading ical file')); return; }
      if (cal.errors && !cal.entries.length) { PG.GUI.show_error_alert(_('Error reading ical file')); return; }
      const entries = cal.entries.filter(e => e.kind === 'VEVENT').concat(cal.entries.filter(e => e.kind === 'VTODO'));
      if (!entries.length) { PG.GUI.show_notice_alert(_('No event or todo entries found')); return; }
      let jump = null;
      for (let i = 0; i < entries.length; i++) {
        const r = await this._process_entry(entries[i], i + 1, entries.length);
        if (r === false) break;
        if (!jump && r) jump = r;
      }
      if (jump) {
        if (Cal.isEvent(jump)) PG.GUI.cursor_goto_event(jump); else PG.GUI.cursor_goto_todo(jump, 0);
        PG.GUI.view_redraw(true);
      }
    },
    async _process_entry(en, count, total) {
      const rows = [];
      let can_import = true;
      const msgs = [];
      const is_event = en.kind === 'VEVENT';
      let desc = en.summary !== undefined ? en.summary : _('None');
      if (desc.length > 60) desc = desc.slice(0, 60) + '…';
      rows.push([_('Description:'), desc], [_('Type:'), is_event ? _('Event') : _('Todo')]);
      if (is_event) {
        if (en.dtstart) rows.push([_('Date/time:'), PG.EntryPropertiesDialog._dtstr(en.dtstart)]);
        else { msgs.push(_('Invalid event, no date found')); can_import = false; }
        if (can_import && en.rrule && en.rrule.FREQ) {
          const f = String(en.rrule.FREQ[0]);
          rows.push([_('Repeats:'), PG.test_anniversary(en) !== 0 ? _('Anniversary') : _(f.charAt(0) + f.slice(1).toLowerCase())]);
        }
      } else if (en.due) rows.push([_('Due date:'), PG.EntryPropertiesDialog._dtstr(en.due)]);
      const alerts = [];
      if (!en.uid) { alerts.push(_('Invalid entry, no ID found')); en.uid = PG.gen_uid(); }
      else if (Cal.get_entry_by_uid(en.uid)) { alerts.push(_('An entry with this ID already exists')); can_import = false; }
      let cb_cal = null, cb_list = null;
      const extra = [];
      if (can_import) {
        const cl = is_event ? Cal.calendar_displaynames_event_rw() : Cal.calendar_displaynames_todo_rw();
        if (!cl.length) { alerts.push(fmt(_('No calendar available to store {}'), is_event ? _('an event') : _('a todo'))); can_import = false; }
        else if (cl.length > 1) { cb_cal = new PG.Combo(cl.map(([i, n]) => [i, n]), { respond: 'accept' }); cb_cal.set_active(0); extra.push([_('Import to calendar:'), cb_cal.el]); }
      }
      if (can_import && !is_event) {
        const [titles] = PG.GUI.todo_titles_default_cats();
        if (!titles.length) { alerts.push(_('No todo list available for todo')); can_import = false; }
        else if (titles.length > 1) { cb_list = new PG.Combo(titles.map((t, i) => [i, t]), { respond: 'accept' }); cb_list.set_active(0); extra.push([_('Import into list:'), cb_list.el]); }
      }
      const content = h('div', {},
        h('div.sectlabel', { text: total === 1 ? _('Found entry:') : fmt(_('Found entry ({} of {}):'), count, total) }),
        PG.grid(rows.concat(msgs.map(m => [m, ''])), 'propgrid'),
        ...alerts.map(a => h('div.alertlabel', { text: a })),
        extra.length ? PG.grid(extra) : null);
      const dlg = new PG.Dialog({ title: _('Import entry'), content, buttons: [{ label: _('Skip'), response: 'skip' }, { label: _('Import'), response: 'accept', default: can_import }] });
      dlg.set_sensitive('accept', can_import);
      const res = await dlg.run();
      if (res === 'close') return false;
      if (res === 'accept' && can_import) {
        const cal_idx = cb_cal ? parseInt(cb_cal.get_active_id(), 10) : (is_event ? Cal.calendar_displaynames_event_rw() : Cal.calendar_displaynames_todo_rw())[0][0];
        const li = cb_list ? cb_list.get_active() : 0;
        const cats = is_event ? null : PG.GUI.todo_titles_default_cats()[1][li];
        return Cal.import_entry(en, cal_idx, is_event ? (en.categories ? en.categories : null) : (cats || en.categories || null));
      }
      return null;
    },
  };

  /* ================================================================ */
  /* Preferences (replaces user.ini)                                  */
  /* ================================================================ */
  PG.PreferencesDialog = {
    async show() {
      const g = C.section('global'), sk = C.section('softkeys'), ne = C.section('new_event'), wv = C.section('week_view');
      const lang = new PG.Combo([['', _('Automatic')], ['en', 'English'], ['es', 'Español']]); lang.set_active_id(g.language || '');
      const h24 = h('input.check', { type: 'checkbox' }); h24.checked = !!g['24hr'];
      const stwk = new PG.Combo([0, 1, 2, 3, 4, 5, 6].map(i => [i, PG.cap(PG.day_name[i])])); stwk.set_active(g.start_week_day || 0);
      const ord = new PG.Combo([['DMY', 'D M Y'], ['MDY', 'M D Y'], ['YMD', 'Y M D']]); ord.set_active_id(g.date_ord);
      const dsep = PG.textEntry('short'); dsep.value = g.date_sep; dsep.maxLength = 1;
      const tsep = PG.textEntry('short'); tsep.value = g.time_sep; tsep.maxLength = 1;
      const skd = new PG.Combo([['', _('Right')], ['left', _('Left')], ['hide', _('Hidden')]]); skd.set_active_id(sk.display || '');
      const skicons = h('input.check', { type: 'checkbox' }); skicons.checked = !!sk.show_icons;
      const dark = h('input.check', { type: 'checkbox' }); dark.checked = !!g.dark_mode;
      const pmz = h('input.check', { type: 'checkbox' }); pmz.checked = !!g.plus_minus_zoom;
      const alw = h('input.check', { type: 'checkbox' }); alw.checked = !!ne.show_alarm_warning;
      const albefore = PG.textEntry('short'); albefore.value = ne.timed_default_alarm_before;
      const almail = PG.textEntry(); almail.value = ne.default_alarm_emailaddr || '';
      const ongo = new PG.Combo([['first_day', _('First day only')], ['every_day', _('Every day')]]); ongo.set_active_id(wv.show_ongoing_event);
      const loc = new PG.Combo([['always', _('Always')], ['never', _('Never')]]); loc.set_active_id(wv.show_event_location);
      const stodos = h('input.check', { type: 'checkbox' }); stodos.checked = !!wv.show_todos;
      const stv = new PG.Combo([['', '—'], ['week', _('_Week View').replace('_', '')], ['year', _('_Year View').replace('_', '')], ['todo', _('_Todo View').replace('_', '')]]);
      stv.set_active_id(C.get('startup', 'view') || '');
      const general = h('div', {}, h('div.dlggrid', {},
        ...row(_('Language:'), lang.el), ...row(_('24-hour clock:'), h24), ...row(_('Week starts on:'), stwk.el),
        ...row(_('Date order:'), ord.el), ...row(_('Date separator:'), dsep), ...row(_('Time separator:'), tsep),
        ...row(_('Startup view:'), stv.el),
        ...row(_('Soft buttons:'), skd.el), ...row(_('Show button icons:'), skicons), ...row(_('Dark mode:'), dark),
        ...row(_('+/− keys zoom:'), pmz), ...row(_('Week View: show ongoing events:'), ongo.el),
        ...row(_('Show event location:'), loc.el), ...row(_('Show to-dos in Week/Year View:'), stodos),
        ...row(_('Show alarm warning:'), alw), ...row(_('Default alarm before event:'), albefore), ...row(_('Alarm email address:'), almail)),
        h('p.prefnote', { text: _('Data is stored only in this browser (localStorage). Use File ▸ Export to back it up.') }),
        h('button.dialogbutton.danger', { type: 'button', text: _('Delete all data…'), onclick: async () => {
          if (await PG.GUI.confirm(_('Delete ALL calendar data stored in this browser?'), _('Delete'))) { Cal.wipe(); PG.GUI.view_redraw(true); }
        } }));

      /* calendars */
      let cals = JSON.parse(JSON.stringify(Cal.calendars()));
      const calbox = h('div.prefcals');
      const renderCals = () => {
        calbox.innerHTML = '';
        calbox.appendChild(h('div.prefhead', {}, ...[_('Name'), _('Colour'), _('Stores'), _('Read-only'), _('Show in Year grid'), ''].map(t => h('span', { text: t }))));
        cals.forEach((c, i) => {
          const nm = h('input.textentry.short', { type: 'text', value: c.name, oninput: e => { c.name = e.target.value; } });
          const col = h('input', { type: 'color', value: c.color || '#ffffff', oninput: e => { c.color = e.target.value; } });
          const clr = h('button.dialogbutton.small', { type: 'button', text: '∅', title: 'No colour', onclick: () => { c.color = ''; col.value = '#ffffff'; } });
          const st = h('select.combo', { onchange: e => { c.stores = e.target.value; } },
            ...[['all', _('All')], ['event', _('Events')], ['todo', _('To-dos')]].map(([v, t]) => h('option', { value: v, text: t, selected: c.stores === v })));
          const ro = h('input', { type: 'checkbox', onchange: e => { c.readonly = e.target.checked; } }); ro.checked = !!c.readonly;
          const gr = h('input', { type: 'checkbox', onchange: e => { c.grid = e.target.checked; } }); gr.checked = c.grid !== false;
          const rm = h('button.dialogbutton.small', { type: 'button', text: _('Remove'), disabled: cals.length <= 1 || i === 0, onclick: () => { cals.splice(i, 1); renderCals(); } });
          calbox.appendChild(h('div.prefrow', {}, nm, h('span', {}, col, clr), st, ro, gr, rm));
        });
        calbox.appendChild(h('button.dialogbutton', { type: 'button', text: _('Add calendar'), onclick: () => { cals.push({ name: 'Calendar ' + (cals.length + 1), cls: 'c' + Date.now().toString(36), color: '', stores: 'all', readonly: false, grid: true }); renderCals(); } }));
      };
      renderCals();

      /* todo lists */
      let lists = C.get('todo_view', 'lists');
      lists = Array.isArray(lists) && lists.length ? JSON.parse(JSON.stringify(lists)) : [{ title: _('To-do'), filter: null }];
      const listbox = h('div.preflists');
      const renderLists = () => {
        listbox.innerHTML = '';
        listbox.appendChild(h('div.prefhead', {}, ...[_('Title'), _('Filter (category)'), '', '', ''].map(t => h('span', { text: t }))));
        lists.forEach((l, i) => {
          const t = h('input.textentry.short', { type: 'text', value: l.title, oninput: e => { l.title = e.target.value; } });
          const fsel = h('select.combo', { onchange: e => { l.filter = e.target.value === '' ? null : e.target.value; f.hidden = e.target.value !== 'CAT'; if (e.target.value === 'CAT') l.filter = f.value || null; } },
            h('option', { value: '', text: _('(any)') }), h('option', { value: 'UNCATEGORIZED', text: _('(uncategorised)') }), h('option', { value: 'CAT', text: _('Categories:').replace(':', '') + '…' }));
          const f = h('input.textentry.short', { type: 'text', value: (l.filter && l.filter !== 'UNCATEGORIZED') ? l.filter : '', oninput: e => { l.filter = e.target.value || null; } });
          fsel.value = l.filter === null ? '' : (l.filter === 'UNCATEGORIZED' ? 'UNCATEGORIZED' : 'CAT');
          f.hidden = fsel.value !== 'CAT';
          const up = h('button.dialogbutton.small', { type: 'button', text: '↑', title: _('Up'), disabled: i === 0, onclick: () => { [lists[i - 1], lists[i]] = [lists[i], lists[i - 1]]; renderLists(); } });
          const dn = h('button.dialogbutton.small', { type: 'button', text: '↓', title: _('Down'), disabled: i === lists.length - 1, onclick: () => { [lists[i + 1], lists[i]] = [lists[i], lists[i + 1]]; renderLists(); } });
          const rm = h('button.dialogbutton.small', { type: 'button', text: _('Remove'), disabled: lists.length <= 1, onclick: () => { lists.splice(i, 1); renderLists(); } });
          listbox.appendChild(h('div.prefrow', {}, t, h('span', {}, fsel, f), up, dn, rm));
        });
        listbox.appendChild(h('button.dialogbutton', { type: 'button', text: _('Add list'), onclick: () => { lists.push({ title: _('To-do') + ' ' + (lists.length + 1), filter: 'UNCATEGORIZED' }); renderLists(); } }));
      };
      renderLists();

      const nb = new PG.Notebook([{ label: _('General'), content: general }, { label: _('Calendars'), content: calbox }, { label: _('To-do lists'), content: listbox }]);
      const content = h('div.prefdialog', {}, nb.el, h('p.prefnote', { text: _('Changes to some settings take effect after reloading.') }));
      const dlg = new PG.Dialog({ title: _('Preferences'), content, cls: 'dialog_prefs', buttons: [{ label: _('Cancel'), response: 'cancel' }, { label: _('OK'), response: 'ok', default: true }] });
      const r = await dlg.run(nb.tabs[0]);
      if (r !== 'ok') return;
      C.set('global', 'language', lang.get_active_id() || '');
      C.set('global', '24hr', h24.checked);
      C.set('global', 'start_week_day', stwk.get_active());
      C.set('global', 'date_ord', ord.get_active_id());
      C.set('global', 'date_sep', dsep.value || '/');
      C.set('global', 'time_sep', tsep.value || ':');
      C.set('global', 'dark_mode', dark.checked);
      C.set('global', 'plus_minus_zoom', pmz.checked);
      C.set('startup', 'view', stv.get_active_id() || '');
      C.set('softkeys', 'display', skd.get_active_id() || '');
      C.set('softkeys', 'show_icons', skicons.checked);
      C.set('new_event', 'show_alarm_warning', alw.checked);
      C.set('new_event', 'timed_default_alarm_before', albefore.value || '15m');
      C.set('new_event', 'default_alarm_emailaddr', almail.value);
      C.set('week_view', 'show_ongoing_event', ongo.get_active_id());
      C.set('week_view', 'show_event_location', loc.get_active_id());
      C.set('week_view', 'show_todos', stodos.checked);
      C.set('year_view', 'show_event_location', loc.get_active_id());
      C.set('year_view', 'show_todos', stodos.checked);
      C.set('todo_view', 'lists', lists.map(l => ({ title: l.title || _('To-do'), filter: l.filter || null })));
      C.save();
      cals.forEach(c => { c.name = c.name || 'Calendar'; c.cls = c.cls || 'pygenda'; });
      Cal.set_calendars(cals);
      location.reload();
    },
  };
})();
