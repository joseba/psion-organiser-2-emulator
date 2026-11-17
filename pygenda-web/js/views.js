/*
  views.js – Pygenda Web
  Port of pygenda_view.py, pygenda_view_week.py, pygenda_view_year.py and
  pygenda_view_todo.py.
  GPL-3.0-only (see COPYING).
*/
'use strict';

(function () {
  const h = PG.h, D = PG.D, C = PG.Config;
  const Cal = PG.Calendar;

  /* ================================================================ */
  /* View (base)                                                      */
  /* ================================================================ */
  const View = {
    _cursor_date: D.today(),
    _cursor_idx_in_date: 0,
    _today_toggle_date: null,
    _today_toggle_idx: 0,

    ICON_NOTES: '✉',
    ICON_ALARM: '♫',
    ICON_REPEAT: '⟳',

    ANNIV_FMT() {
      return {
        START: ' ({st})',
        COUNT: ' ({ct} ' + _('years') + ')',
        BOTH: ' ({st}, {ct} ' + _('years') + ')',
        NONE: '',
      };
    },
    ANNIV_FMT_1YR() {
      return {
        START: ' ({st})',
        COUNT: ' (1 ' + _('year') + ')',
        BOTH: ' ({st}, 1 ' + _('year') + ')',
        NONE: '',
      };
    },

    entry_text(occ, dt_end, add_location, loc_max_chars) {
      const endtm = View.entry_endtime(occ, dt_end, true);
      const icons = View.entry_icons(occ.en, true);
      const d_txt = occ.en.summary || '';
      let l_txt = '';
      if (add_location && occ.en.location) {
        let loc = occ.en.location;
        if (loc_max_chars > 0 && loc.length > loc_max_chars) loc = loc.slice(0, loc_max_chars) + '…';
        l_txt = ' (@' + loc + ')';
      }
      let anniv_txt = '';
      if (occ.en.anniv_show && PG.test_anniversary(occ.en) !== 0) {
        const show = occ.en.anniv_show.toUpperCase();
        const styr = PG.ical_dt.parse(occ.en.dtstart).dt.getFullYear();
        const count = occ.dt.getFullYear() - styr;
        const f = (count === 1 ? View.ANNIV_FMT_1YR() : View.ANNIV_FMT())[show];
        if (f !== undefined) anniv_txt = PG.fmt(f, { st: styr, ct: count });
      }
      return d_txt + endtm + anniv_txt + l_txt + icons;
    },
    entry_text_label(occ, dt_end, add_location, loc_max_chars) {
      return h('span.itemtext', { text: View.entry_text(occ, dt_end, add_location, loc_max_chars) });
    },
    entry_icons(en, prefix_space) {
      let icons = '';
      if (en.description) icons += View.ICON_NOTES;
      if (en.alarms && en.alarms.length) icons += View.ICON_ALARM;
      if (en.rrule && PG.test_anniversary(en) === 0) icons += View.ICON_REPEAT;
      if (prefix_space && icons) icons = ' ' + icons;
      return icons;
    },
    /* occ: {dt,isDate}; dt_end: {dt,isDate}|null */
    entry_endtime(occ, dt_end, frame_text) {
      if (!dt_end || dt_end.dt <= occ.dt) return '';
      let t_str;
      if (occ.isDate && dt_end.isDate) {
        const end_date = D.addDays(dt_end.dt, -1);
        if (occ.dt >= end_date) return '';
        t_str = PG.format_compact_date(end_date, occ.dt.getFullYear() !== end_date.getFullYear());
      } else {
        const st_date = D.dayStart(occ.dt);
        const end = dt_end.dt;
        const end_date = D.dayStart(new Date(end.getTime() - 1));
        if (D.sameDay(st_date, end_date)) t_str = PG.format_compact_time(end);
        else t_str = PG.format_compact_datetime(end, st_date.getFullYear() !== end_date.getFullYear());
      }
      if (frame_text && t_str) t_str = ' (→' + t_str + ')';
      return t_str;
    },
    add_event_styles(el, en) {
      el.classList.add('event');
      if (en.status && Cal.STATUS_LIST_EVENT.includes(en.status)) el.classList.add(en.status.toLowerCase());
    },
    add_todo_styles(el, td) {
      el.classList.add('todo');
      if (td.status && Cal.STATUS_LIST_TODO.includes(td.status)) el.classList.add(td.status.toLowerCase());
    },
    /* Scroll so that row `el` is visible inside scroller */
    scroll_to(el, scroller) {
      if (!el || !scroller) return;
      const er = el.getBoundingClientRect(), sr = scroller.getBoundingClientRect();
      if (er.top < sr.top) scroller.scrollTop -= (sr.top - er.top) + 2;
      else if (er.bottom > sr.bottom) scroller.scrollTop += Math.min(er.bottom - sr.bottom + 2, er.top - sr.top);
    },

    /* zoom */
    init_zoom(cfg, el) {
      this.zoom_lvls = C.get_int(cfg, 'zoom_levels') || 5;
      let saved = parseInt(PG.storage.get('pygenda.zoom.' + cfg), 10);
      this.zoom_lvl = isNaN(saved) ? (C.get_int(cfg, 'default_zoom') || 0) : saved;
      this.zoom_lvl = ((this.zoom_lvl % this.zoom_lvls) + this.zoom_lvls) % this.zoom_lvls;
      this.zoom_el = el;
      this.zoom_cfg = cfg;
      el.classList.add('zoom' + this.zoom_lvl);
    },
    zoom(inc) {
      this.zoom_el.classList.remove('zoom' + this.zoom_lvl);
      this.zoom_lvl = ((this.zoom_lvl + inc) % this.zoom_lvls + this.zoom_lvls) % this.zoom_lvls;
      this.zoom_el.classList.add('zoom' + this.zoom_lvl);
      PG.storage.set('pygenda.zoom.' + this.zoom_cfg, String(this.zoom_lvl));
    },
  };

  /* Swipe detection (touch) */
  function addSwipe(el, cb) {
    let x0 = 0, y0 = 0, t0 = 0, tracking = false;
    el.addEventListener('touchstart', ev => {
      if (ev.touches.length !== 1) { tracking = false; return; }
      tracking = true; x0 = ev.touches[0].clientX; y0 = ev.touches[0].clientY; t0 = Date.now();
    }, { passive: true });
    el.addEventListener('touchend', ev => {
      if (!tracking) return;
      tracking = false;
      const t = ev.changedTouches[0];
      const dt = Math.max(1, Date.now() - t0) / 1000;
      cb((t.clientX - x0) / dt, (t.clientY - y0) / dt, t.clientX - x0, t.clientY - y0);
    }, { passive: true });
  }

  /* ================================================================ */
  /* View_DayUnit_Base (shared by Week & Year views)                  */
  /* ================================================================ */
  const DayUnit = Object.assign(Object.create(View), {
    show_todos: false,
    _target_entry: null,
    _BULLET: '•',
    _BULLET_ALLDAY: '✦',
    _BULLET_MULTIDAY_START: '‣',
    _BULLET_ONGOING: '»',
    _BULLET_TODO: 'Ⓣ',
    _BULLET_ANNIVERSARY: '🕯︎',

    default_entry_is_todo() { return false; },
    paste_entry(en) {
      const new_en = Cal.paste_entry(en, PG.EntryInfo.TYPE_EVENT, View._cursor_date);
      this.cursor_goto_event(new_en);
    },
    paste_text(txt) {
      const date = this.cursor_date();
      setTimeout(() => PG.EventDialog.new_event(txt, date), 0);
    },
    cursor_date() { return View._cursor_date; },
    cursor_todo_list() { return null; },
    get_cursor_entry() { const o = this.get_cursor_occurrence(); return o ? o.en : null; },
    cursor_edit_entry() {
      const en = this.get_cursor_entry();
      if (en) {
        if (Cal.isTodo(en)) PG.GUI.edit_or_display_todo(en);
        else PG.GUI.edit_or_display_event(en);
      } else if (PG.GUI.create_events) {
        PG.EventDialog.new_event(null, this.cursor_date());
      }
    },
    cursor_goto_event(ev) {
      if (ev.rrule) this.cursor_set_date(this.nearest_date(ev));
      else this.cursor_set_date(D.dayStart(PG.ical_dt.parse(ev.dtstart).dt));
      this._target_entry = ev;
      return true;
    },
    nearest_date(ev) {
      let [prev, next] = Cal.previous_next_occurrence(ev, View._cursor_date);
      if (prev === null) return D.dayStart(next || PG.ical_dt.parse(ev.dtstart).dt);
      if (next === null) return D.dayStart(prev);
      prev = D.dayStart(prev); next = D.dayStart(next);
      const dprev = D.dayDiff(prev, View._cursor_date), dnext = D.dayDiff(View._cursor_date, next);
      return dprev > dnext ? next : prev;
    },
    cursor_goto_todo(todo) {
      if (!this.show_todos || !todo.due) return false;
      this.cursor_set_date(D.dayStart(PG.ical_dt.parse(todo.due).dt));
      this._target_entry = todo;
      return true;
    },
    cursor_inc(days, idx) {
      View._cursor_date = D.addDays(View._cursor_date, days);
      if (idx !== undefined && idx !== null) View._cursor_idx_in_date = idx;
      this.redraw(false);
    },
    entry_markerlab_class(occ, is_ongoing) {
      let mark, cl = null;
      if (is_ongoing) { mark = this._BULLET_ONGOING; cl = 'multiday_ongoing'; }
      else if (PG.test_anniversary(occ.en) !== 0) { mark = this._BULLET_ANNIVERSARY; cl = 'anniversary'; }
      else if (!occ.isDate) { mark = PG.format_time(occ.dt); cl = 'timed'; }
      else if (Cal.isTodo(occ.en)) { mark = this._BULLET_TODO; cl = 'todo'; }
      else if (occ.en.dtend) {
        const st = PG.ical_dt.parse(occ.en.dtstart).dt, end = PG.ical_dt.parse(occ.en.dtend).dt;
        if (end <= D.addDays(st, 1)) { mark = this._BULLET_ALLDAY; cl = 'allday'; }
        else { mark = this._BULLET_MULTIDAY_START; cl = 'multiday_start'; }
      } else mark = this._BULLET;
      return [h('span.marker', { text: mark }), cl];
    },
    /* Build a row for an occurrence */
    entry_row(occ, base_cls, show_loc, loc_max, is_ongoing) {
      const row = h('div.' + base_cls);
      row.classList.add(Cal.calendar_displayclass(occ.en));
      if (Cal.isEvent(occ.en)) View.add_event_styles(row, occ.en); else View.add_todo_styles(row, occ.en);
      const [mk, cl] = this.entry_markerlab_class(occ, is_ongoing);
      row.appendChild(mk);
      if (cl) row.classList.add(cl);
      row.appendChild(View.entry_text_label(occ, PG.end_dt_occ(occ), show_loc, loc_max));
      return row;
    },
  });

  /* ================================================================ */
  /* Week View                                                        */
  /* ================================================================ */
  C.set_defaults('week_view', {
    pageleft_datepos: 'left', pageright_datepos: 'right',
    show_ongoing_event: 'first_day', show_event_location: 'always',
    location_max_chars: 0, show_todos: true, zoom_levels: 5, default_zoom: 1,
  });
  const Week = Object.assign(Object.create(DayUnit), {
    name: 'Week',
    _day_ent_count: [0, 0, 0, 0, 0, 0, 0],
    _day_occs: [[], [], [], [], [], [], []],
    _week_viewed: null,
    _last_cursor: null,

    view_name() { return _('_Week View'); },
    accel_key() { return _('week_view_accel')[0]; },

    init() {
      this._show_ongoing = C.get('week_view', 'show_ongoing_event') === 'every_day';
      this._show_location = C.get('week_view', 'show_event_location') === 'always';
      this._loc_max_chars = C.get_int('week_view', 'location_max_chars') || 0;
      this.show_todos = C.get_bool('week_view', 'show_todos');
      this.topbox = h('div#view_week.agendaview');
      const st_wk = C.get_int('global', 'start_week_day') || 0;
      const day_ab = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
      this._month_label = h('div#weekview_labelmonth');
      this._weekno_label = h('div#weekview_labelweek');
      const title = h('div#weekview_titlearea', {}, this._month_label, this._weekno_label);
      const page_l = h('div.week_page#week_page_l', {}, title);
      const page_r = h('div.week_page#week_page_r');
      this._day_box = []; this._day_label = []; this._day_rows = [];
      for (let i = 0; i < 7; i++) {
        const dpos_r = C.get('week_view', i < 3 ? 'pageleft_datepos' : 'pageright_datepos') === 'right';
        const lab = h('div.weekview_labelday');
        const rows = h('div.weekview_daytext');
        const box = h('div.weekview_day.weekview_day' + i + '.weekview_' + day_ab[(i + st_wk) % 7] + (dpos_r ? '.labelright' : ''), {}, lab, rows);
        box.addEventListener('click', ev => this.click_date(i, ev));
        box.addEventListener('dblclick', ev => { ev.preventDefault(); this.click_date(i, ev); this.cursor_edit_entry(); });
        this._day_box.push(box); this._day_label.push(lab); this._day_rows.push(rows);
        (i < 3 ? page_l : page_r).appendChild(box);
      }
      this.topbox.append(page_l, h('div#weekview_fold'), page_r);
      this.init_zoom('week_view', this.topbox);
      addSwipe(this.topbox, (vx, vy, dx, dy) => {
        if (Math.abs(vx) > 300 && Math.abs(dx) > 40 && Math.abs(vy) * 2 < Math.abs(vx)) this.cursor_inc(vx < 0 ? 7 : -7, 0);
      });
      return this.topbox;
    },
    _set_label_text() {
      this._last_cursor = null;
      let dt = PG.start_of_week(View._cursor_date);
      this._week_viewed = dt;
      const dt_end = D.addDays(dt, 6);
      let ml;
      if (dt.getMonth() === dt_end.getMonth()) ml = PG.cap(PG.month_name[dt.getMonth() + 1]) + ' ' + dt.getFullYear();
      else if (dt.getFullYear() === dt_end.getFullYear())
        ml = PG.cap(PG.month_abbr[dt.getMonth() + 1]) + ' – ' + PG.month_abbr[dt_end.getMonth() + 1] + ' ' + dt.getFullYear();
      else ml = PG.cap(PG.month_abbr[dt.getMonth() + 1]) + ' ' + dt.getFullYear() + ' – ' + PG.month_abbr[dt_end.getMonth() + 1] + ' ' + dt_end.getFullYear();
      this._month_label.textContent = ml;
      const wkno = Math.floor((D.yday(dt) + 9) / 7);
      this._weekno_label.textContent = (wkno === 53 && dt.getDate() >= 29) ? _('Week 53/Week 1') : PG.fmt(_('Week {}'), wkno);
      const today = D.today();
      for (let i = 0; i < 7; i++) {
        const b = this._day_box[i];
        b.classList.toggle('weekview_pastday', dt < today);
        b.classList.toggle('weekview_today', dt.getTime() === today.getTime());
        this._day_label[i].innerHTML = '';
        this._day_label[i].append(PG.day_abbr[D.weekday(dt)], h('br'), String(dt.getDate()));
        dt = D.addDays(dt, 1);
      }
    },
    _set_entry_text() {
      this._last_cursor = null;
      let dt = PG.start_of_week(View._cursor_date);
      this._day_occs = [[], [], [], [], [], [], []];
      this._day_ent_count = [0, 0, 0, 0, 0, 0, 0];
      const occs = Cal.occurrence_list(dt, D.addDays(dt, 7));
      let oi = 0;
      let ongoing = this._show_ongoing ? Cal.ongoing_list(dt) : [];
      let rollover = dt;
      for (let i = 0; i < 7; i++) {
        const dt_nxt = D.addDays(dt, 1);
        this._day_rows[i].innerHTML = '';
        if (this._show_ongoing) {
          rollover = D.addDays(rollover, 1);
          let j = 0;
          while (j < ongoing.length) {
            const o = ongoing[j];
            const oend = PG.end_dt_occ(o);
            this._add_row(o, i, false, true);
            if (oend.dt <= rollover) ongoing.splice(j, 1); else j++;
          }
        }
        while (oi < occs.length) {
          const occ = occs[oi];
          if (this.show_todos || !Cal.isTodo(occ.en)) {
            if (dt_nxt <= occ.dt) break;
            if (this._target_entry && this._target_entry === occ.en && dt.getTime() === View._cursor_date.getTime()) {
              View._cursor_idx_in_date = this._day_ent_count[i];
              this._target_entry = null;
            }
            this._add_row(occ, i, this._show_location, false);
            if (this._show_ongoing) {
              const oend = PG.end_dt_occ(occ);
              if (oend && rollover < oend.dt) ongoing.push(occ); // multi-day: show on following days too
            }
          }
          oi++;
        }
        if (this._day_ent_count[i] === 0) this._day_rows[i].appendChild(h('span.emptymark'));
        dt = dt_nxt;
      }
      this._target_entry = null;
    },
    _add_row(occ, dayidx, show_loc, is_ongoing) {
      const row = this.entry_row(occ, 'weekview_item', show_loc, this._loc_max_chars, is_ongoing);
      row.dataset.idx = this._day_ent_count[dayidx];
      this._day_rows[dayidx].appendChild(row);
      this._day_occs[dayidx].push(occ);
      this._day_ent_count[dayidx]++;
    },
    _show_cursor() {
      const dy = PG.day_in_week(View._cursor_date);
      const ecount = this._day_ent_count[dy];
      let i = View._cursor_idx_in_date;
      if (i < 0 || i >= ecount) { i = Math.max(0, ecount - 1); View._cursor_idx_in_date = i; }
      this._hide_cursor();
      const row = this._day_rows[dy].children[i];
      const mk = ecount === 0 ? row : row.firstChild;
      mk.classList.add('cursor');
      this._last_cursor = mk;
      if (ecount > 0) View.scroll_to(row, this._day_rows[dy]);
      let on_ev = false, on_td = false, ro = false;
      if (ecount !== 0) {
        const en = this.get_cursor_entry();
        if (Cal.isTodo(en)) on_td = true; else on_ev = true;
        ro = Cal.calendar_readonly(en);
      }
      PG.GUI.set_menu_elts({ on_event: on_ev, on_todo: on_td, read_only: ro, can_create_here: PG.GUI.create_events });
    },
    _hide_cursor() {
      if (this._last_cursor) { this._last_cursor.classList.remove('cursor'); this._last_cursor = null; }
    },
    cursor_set_date(dt, idx) {
      View._cursor_date = D.dayStart(dt);
      View._cursor_idx_in_date = idx || 0;
      return true;
    },
    get_cursor_occurrence() {
      const dy = PG.day_in_week(View._cursor_date);
      if (this._day_ent_count[dy] === 0) return null;
      return this._day_occs[dy][View._cursor_idx_in_date] || null;
    },
    renew_display() { this._week_viewed = null; },
    redraw(en_changes) {
      const sow = PG.start_of_week(View._cursor_date);
      if (!this._week_viewed || this._week_viewed.getTime() !== sow.getTime()) {
        this._set_label_text();
        this._day_rows.forEach(r => { r.scrollTop = 0; });
        en_changes = true;
      }
      if (en_changes) this._set_entry_text();
      this._show_cursor();
    },
    _cursor_move_up() {
      View._cursor_idx_in_date--;
      if (View._cursor_idx_in_date < 0) { this.cursor_inc(-1); View._today_toggle_date = null; }
      else this._show_cursor();
    },
    _cursor_move_dn() {
      View._cursor_idx_in_date++;
      const dy = PG.day_in_week(View._cursor_date);
      if (View._cursor_idx_in_date >= this._day_ent_count[dy]) { this.cursor_inc(1, 0); View._today_toggle_date = null; }
      else this._show_cursor();
    },
    _cursor_move_lt(repeat) {
      const i = PG.day_in_week(View._cursor_date);
      const d = i > 3 ? -4 : ((!repeat || i === 3) ? -3 : -7);
      this.cursor_inc(d, 0); View._today_toggle_date = null;
    },
    _cursor_move_rt(repeat) {
      const i = PG.day_in_week(View._cursor_date);
      const d = repeat ? (i < 3 ? 4 : 7) : (i < 4 ? 4 : 3);
      this.cursor_inc(d, 0); View._today_toggle_date = null;
    },
    _cursor_move_today() {
      const today = D.today();
      if (View._cursor_date.getTime() !== today.getTime()) {
        View._today_toggle_date = View._cursor_date;
        View._today_toggle_idx = View._cursor_idx_in_date;
        this.cursor_set_date(today);
        this.redraw(false);
      } else if (View._today_toggle_date) {
        this.cursor_set_date(View._today_toggle_date, View._today_toggle_idx);
        this.redraw(false);
      }
    },
    keypress(ev) {
      const map = {
        ArrowUp: () => this._cursor_move_up(),
        ArrowDown: () => this._cursor_move_dn(),
        ArrowRight: () => this._cursor_move_rt(ev.repeat),
        ArrowLeft: () => this._cursor_move_lt(ev.repeat),
        ' ': () => this._cursor_move_today(),
        Enter: () => this.cursor_edit_entry(),
      };
      if (map[ev.key] && !ev.ctrlKey && !ev.altKey && !ev.metaKey) { map[ev.key](); return true; }
      if (PG.GUI.create_events && !ev.ctrlKey && !ev.altKey && !ev.metaKey && ev.key.length === 1 && ev.key !== ' ') {
        PG.EventDialog.new_event(ev.key, this.cursor_date());
        return true;
      }
      return false;
    },
    click_date(day, ev) {
      if (!this._week_viewed) return;
      let new_idx = 0;
      const row = ev.target.closest('.weekview_item');
      if (row && this._day_ent_count[day] > 1) new_idx = parseInt(row.dataset.idx, 10) || 0;
      this.cursor_set_date(D.addDays(this._week_viewed, day), new_idx);
      this.redraw(false);
    },
  });

  /* ================================================================ */
  /* Year View                                                        */
  /* ================================================================ */
  C.set_defaults('year_view', { show_event_location: 'always', location_max_chars: 0, show_todos: true, zoom_levels: 5, default_zoom: 2 });
  const DAY_CLASS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'].map(s => 'yearview_day_' + s);
  const GRID_COLUMNS = 37, GRID_ROWS = 12;
  const Year = Object.assign(Object.create(DayUnit), {
    name: 'Year',
    _target_col: null,
    _year_viewed: -1,
    _last_cursor: null,
    _visible_occurrences: [],
    _date_content_count: 0,
    _last_entry_cursor: null,

    view_name() { return _('_Year View'); },
    accel_key() { return _('year_view_accel')[0]; },

    init() {
      this._show_location = C.get('year_view', 'show_event_location') === 'always';
      this._loc_max_chars = C.get_int('year_view', 'location_max_chars') || 0;
      this.show_todos = C.get_bool('year_view', 'show_todos');
      this.topbox = h('div#view_year.agendaview');
      this._year_label = h('div#yearview_labelyear');
      this._grid = h('div#yearview_daygrid');
      const st_wk = C.get_int('global', 'start_week_day') || 0;
      // corner
      this._grid.appendChild(h('div#yearview_gridcorner'));
      this._day_labs = [];
      for (let i = st_wk; i < st_wk + GRID_COLUMNS; i++) {
        const l = h('div.yearview_day_label.' + DAY_CLASS[i % 7], { text: PG.cap(PG.day_abbr[i % 7])[0] });
        this._day_labs.push(l); this._grid.appendChild(l);
      }
      this._mon_labs = []; this._cells = [];
      for (let m = 0; m < GRID_ROWS; m++) {
        const ml = h('div.yearview_month_label', { text: PG.cap(PG.month_abbr[m + 1]) });
        this._mon_labs.push(ml); this._grid.appendChild(ml);
        const row = [];
        for (let d = 0; d < GRID_COLUMNS; d++) {
          const c = h('div.yearview_cell');
          c.addEventListener('click', () => this.click_grid(d, m));
          c.addEventListener('dblclick', ev => { ev.preventDefault(); this.click_grid(d, m); this.cursor_edit_entry(); });
          row.push(c); this._grid.appendChild(c);
        }
        this._cells.push(row);
      }
      this._date_label = h('div#yearview_labeldate');
      this._date_content = h('div#yearview_datecontent');
      this._date_scroll = h('div#yearview_datecontent_scroller', {}, this._date_content);
      this._date_content.addEventListener('click', ev => this.click_events(ev));
      this._date_content.addEventListener('dblclick', ev => { this.click_events(ev); this.cursor_edit_entry(); });
      this.topbox.append(this._year_label, h('div#yearview_gridwrap', {}, this._grid), h('div#yearview_datebox', {}, this._date_label, this._date_scroll));
      this.init_zoom('year_view', this.topbox);
      addSwipe(this._grid, (vx, vy, dx, dy) => {
        if (Math.abs(vy) > 250 && Math.abs(dy) > 30 && Math.abs(vx) * 2 < Math.abs(vy)) this._cursor_move_pgupdn(vy < 0 ? 1 : -1);
      });
      return this.topbox;
    },
    _draw_year() {
      const yr = View._cursor_date.getFullYear();
      this._year_viewed = yr;
      this._year_label.textContent = String(yr);
      const st_wk = C.get_int('global', 'start_week_day') || 0;
      let date = new Date(yr, 0, 1);
      const today = D.today();
      const reset = el => { el.className = 'yearview_cell'; el.textContent = ''; el.removeAttribute('data-icons'); };
      for (let m = 1; m <= GRID_ROWS; m++) {
        let [day, daycount] = D.monthrange(yr, m);
        let col = ((day - st_wk) % 7 + 7) % 7;
        this._mon_labs[m - 1].classList.toggle('yearview_leftofdaycell', col === 0);
        let ncol, ndayend;
        if (m !== GRID_ROWS) {
          const [nday, ndaycount] = D.monthrange(yr, m + 1);
          ncol = ((nday - st_wk) % 7 + 7) % 7; ndayend = ncol + ndaycount;
        } else { ncol = 7; ndayend = 0; }
        for (let c = 0; c < col; c++) {
          const l = this._cells[m - 1][c];
          reset(l);
          l.classList.add('yearview_emptycell');
          if (c === col - 1) l.classList.add('yearview_leftofdaycell');
          if (c >= ncol) l.classList.add('yearview_abovedaycell');
          if (m === 1) this._day_labs[c].classList.remove('yearview_abovedaycell');
        }
        for (let d = 0; d < daycount; d++) {
          const l = this._cells[m - 1][col];
          reset(l);
          if (day === st_wk || d === 0 || d === daycount - 1) l.textContent = String(d + 1);
          l.classList.add('yearview_daycell', DAY_CLASS[day]);
          if (date < today) l.classList.add('yearview_pastday');
          else if (date.getTime() === today.getTime()) l.classList.add('yearview_today');
          if (m === 1) this._day_labs[col].classList.add('yearview_abovedaycell');
          day = (day + 1) % 7; col++;
          date = D.addDays(date, 1);
        }
        for (let c = col; c < GRID_COLUMNS; c++) {
          const l = this._cells[m - 1][c];
          reset(l);
          l.classList.add('yearview_emptycell');
          if (c < ndayend) l.classList.add('yearview_abovedaycell');
          if (m === 1) this._day_labs[c].classList.remove('yearview_abovedaycell');
        }
      }
    },
    renew_display() { this._target_col = null; },
    redraw(en_changes) {
      if (this._year_viewed !== View._cursor_date.getFullYear()) {
        this._draw_year();
        this._last_cursor = null;
        en_changes = true;
      }
      this._show_cursor();
      this._show_datelabel();
      this._show_datecontent();
      if (en_changes) this._show_gridcontent();
    },
    _show_datelabel() {
      this._date_label.textContent = PG.strftime(View._cursor_date, PG.datefmt.text_noyear) + ':';
    },
    _show_datecontent() {
      const dt = View._cursor_date;
      this._date_content.innerHTML = '';
      this._last_entry_cursor = null;
      this._visible_occurrences = Cal.occurrence_list(dt, D.addDays(dt, 1)).filter(o => this.show_todos || !Cal.isTodo(o.en));
      let r = 0;
      for (const occ of this._visible_occurrences) {
        const row = this.entry_row(occ, 'yearview_item', this._show_location, this._loc_max_chars, false);
        row.dataset.idx = r;
        this._date_content.appendChild(row);
        if (this._target_entry && this._target_entry === occ.en) { View._cursor_idx_in_date = r; this._target_entry = null; }
        r++;
      }
      this._date_content_count = r;
      this._show_entry_cursor();
      this._target_entry = null;
    },
    _show_entry_cursor() {
      const cch = PG.GUI.create_events;
      if (this._date_content_count === 0) {
        View._cursor_idx_in_date = 0;
        PG.GUI.set_menu_elts({ on_event: false, can_create_here: cch });
        return;
      }
      let i = View._cursor_idx_in_date;
      if (i < 0 || i >= this._date_content_count) { i = this._date_content_count - 1; View._cursor_idx_in_date = i; }
      const row = this._date_content.children[i];
      row.firstChild.classList.add('cursor');
      this._last_entry_cursor = i;
      View.scroll_to(row, this._date_scroll);
      const en = this.get_cursor_entry();
      PG.GUI.set_menu_elts({ on_event: !Cal.isTodo(en), on_todo: Cal.isTodo(en), read_only: Cal.calendar_readonly(en), can_create_here: cch });
    },
    _hide_entry_cursor() {
      if (this._last_entry_cursor !== null) {
        const r = this._date_content.children[this._last_entry_cursor];
        if (r) r.firstChild.classList.remove('cursor');
        this._last_entry_cursor = null;
      }
    },
    cursor_set_date(dt, idx, reset_target_col) {
      View._cursor_date = D.dayStart(dt);
      View._cursor_idx_in_date = idx || 0;
      if (reset_target_col !== false) this._target_col = null;
      return true;
    },
    get_cursor_occurrence() {
      if (this._date_content_count === 0) return null;
      return this._visible_occurrences[View._cursor_idx_in_date] || null;
    },
    _rep_id(en) {
      let id = String(en.rrule.FREQ[0]).toUpperCase();
      if (id === 'YEARLY' && PG.test_anniversary(en)) id = 'ANNIV';
      return id;
    },
    _show_gridcontent() {
      const yr = this._year_viewed;
      const start = new Date(yr, 0, 1), stop = new Date(yr + 1, 0, 1);
      const flags = new Map(); // key -> Set of flags
      const add = (dt, f) => { const k = D.key(dt); if (!flags.has(k)) flags.set(k, new Set()); flags.get(k).add(f); };
      for (const o of Cal.occurrence_list(start, stop, { include_single: true, include_repeated: false, in_grid: true })) {
        if (Cal.isEvent(o.en)) add(o.dt, 'single');
        else if (this.show_todos) add(o.dt, 'todo');
      }
      const MAP = {
        YEARLY: 'repeated_year', MONTHLY: 'repeated_month', WEEKLY: 'repeated_week', DAILY: 'repeated_day',
        HOURLY: 'repeated_hour', MINUTELY: 'repeated_minute', SECONDLY: 'repeated_second', ANNIV: 'anniversary',
      };
      for (const o of Cal.occurrence_list(start, stop, { include_single: false, include_repeated: true, in_grid: true })) {
        if (!o.en.rrule || !o.en.rrule.FREQ) continue;
        add(o.dt, 'repeated'); add(o.dt, MAP[this._rep_id(o.en)] || 'repeated_day');
      }
      let date = new Date(yr, 0, 1);
      for (let m = 1; m <= 12; m++) {
        const dc = D.daysInMonth(yr, m);
        let [x, y] = this._date_to_cell(date);
        for (let d = 0; d < dc; d++) {
          const l = this._cells[y][x];
          for (const c of [...l.classList]) if (c.startsWith('yearview_entry_')) l.classList.remove(c);
          const f = flags.get(D.key(date));
          if (f) {
            for (const fl of f) l.classList.add('yearview_entry_' + fl);
            const disc = f.has('single') || f.has('repeated_day') || f.has('repeated_hour') || f.has('repeated_minute') || f.has('repeated_second');
            const loop = f.has('repeated_month') || f.has('repeated_week');
            const star = f.has('repeated_year') || f.has('anniversary');
            const tee = f.has('todo');
            const parts = [disc && 'disc', loop && 'loop', star && 'star', tee && 'T'].filter(Boolean);
            if (parts.length) l.dataset.icons = parts.join('+'); else l.removeAttribute('data-icons');
          } else l.removeAttribute('data-icons');
          date = D.addDays(date, 1); x++;
        }
      }
    },
    _show_cursor() {
      const [x, y] = this._date_to_cell(View._cursor_date);
      const l = this._cells[y][x];
      if (this._last_cursor && this._last_cursor !== l) this._last_cursor.classList.remove('yearview_cursor');
      l.classList.add('yearview_cursor');
      this._last_cursor = l;
      // keep cursor visible when the grid is wider than the screen
      const wrap = this._grid.parentElement;
      if (wrap && wrap.scrollWidth > wrap.clientWidth) {
        const cl = l.offsetLeft, cr = cl + l.offsetWidth;
        if (cl < wrap.scrollLeft + 40) wrap.scrollLeft = Math.max(0, cl - 60);
        else if (cr > wrap.scrollLeft + wrap.clientWidth) wrap.scrollLeft = cr - wrap.clientWidth + 10;
      }
    },
    _cursor_move_lr(d) { this.cursor_inc(d, 0); this._target_col = null; View._today_toggle_date = null; },
    _move_month(dm) {
      const cur = View._cursor_date;
      if (this._target_col === null) this._target_col = this._date_to_cell(cur)[0];
      let ny = cur.getMonth() + dm, nyr = cur.getFullYear();
      if (ny < 0) { ny = 11; nyr--; } else if (ny > 11) { ny = 0; nyr++; }
      this.cursor_set_date(this._cell_to_date_clamped(this._target_col, ny, nyr), 0, false);
      this.redraw(false);
      View._today_toggle_date = null;
    },
    _cursor_move_stmon() {
      const d = View._cursor_date;
      this.cursor_set_date(new Date(d.getFullYear(), d.getMonth(), 1)); this.redraw(false); View._today_toggle_date = null;
    },
    _cursor_move_endmon() {
      const d = View._cursor_date;
      this.cursor_set_date(new Date(d.getFullYear(), d.getMonth(), D.daysInMonth(d.getFullYear(), d.getMonth() + 1)));
      this.redraw(false); View._today_toggle_date = null;
    },
    _cursor_move_pgupdn(d) {
      const cur = View._cursor_date;
      if (this._target_col === null) this._target_col = this._date_to_cell(cur)[0];
      this.cursor_set_date(this._cell_to_date_clamped(this._target_col, cur.getMonth(), cur.getFullYear() + d), 0, false);
      this.redraw(false); View._today_toggle_date = null;
    },
    _cursor_move_today() {
      const today = D.today();
      if (View._cursor_date.getTime() !== today.getTime()) {
        View._today_toggle_date = View._cursor_date;
        View._today_toggle_idx = View._cursor_idx_in_date;
        this.cursor_set_date(today); this.redraw(false);
      } else if (View._today_toggle_date) {
        this.cursor_set_date(View._today_toggle_date, View._today_toggle_idx); this.redraw(false);
      }
    },
    _idxcursor_move(d) {
      const n = View._cursor_idx_in_date + d;
      if (n >= 0 && n < this._date_content_count) {
        View._cursor_idx_in_date = n;
        this._hide_entry_cursor(); this._show_entry_cursor();
      }
    },
    keypress(ev) {
      if (ev.ctrlKey || ev.altKey || ev.metaKey) return false;
      if (ev.shiftKey) {
        const sm = { ArrowUp: -1, ArrowDown: 1, PageUp: -1, PageDown: 1 };
        if (ev.key in sm) { this._idxcursor_move(sm[ev.key]); return true; }
      }
      const map = {
        ArrowLeft: () => this._cursor_move_lr(-1),
        ArrowRight: () => this._cursor_move_lr(1),
        ArrowUp: () => this._move_month(-1),
        ArrowDown: () => this._move_month(1),
        Home: () => this._cursor_move_stmon(),
        End: () => this._cursor_move_endmon(),
        PageUp: () => this._cursor_move_pgupdn(-1),
        PageDown: () => this._cursor_move_pgupdn(1),
        ' ': () => this._cursor_move_today(),
        Enter: () => this.cursor_edit_entry(),
      };
      if (map[ev.key]) { map[ev.key](); return true; }
      if (PG.GUI.create_events && ev.key.length === 1) { PG.EventDialog.new_event(ev.key, this.cursor_date()); return true; }
      return false;
    },
    click_grid(x, y) {
      this.cursor_set_date(this._cell_to_date_clamped(x, y, this._year_viewed));
      this.redraw(false);
    },
    click_events(ev) {
      const row = ev.target.closest('.yearview_item');
      if (!row) return;
      const i = parseInt(row.dataset.idx, 10);
      if (View._cursor_idx_in_date !== i) {
        View._cursor_idx_in_date = i;
        this._hide_entry_cursor(); this._show_entry_cursor();
      }
    },
    _date_to_cell(dt) {
      const st = D.monthrange(dt.getFullYear(), dt.getMonth() + 1)[0];
      const x = dt.getDate() - 1 + ((st - (C.get_int('global', 'start_week_day') || 0)) % 7 + 7) % 7;
      return [x, dt.getMonth()];
    },
    _cell_to_date_clamped(x, y, yr) {
      const m = y + 1;
      const [st_day, mdays] = D.monthrange(yr, m);
      let d = x + 1 - ((st_day - (C.get_int('global', 'start_week_day') || 0)) % 7 + 7) % 7;
      d = d < 1 ? 1 : Math.min(d, mdays);
      return new Date(yr, m - 1, d);
    },
  });

  /* ================================================================ */
  /* Todo View                                                        */
  /* ================================================================ */
  C.set_defaults('todo_view', {
    lists: null, // [{title, filter}] ; null → single list titled 'To-do'
    zoom_levels: 5, default_zoom: 2,
  });
  const Todo = Object.assign(Object.create(View), {
    name: 'Todo',
    _cursor_list: 0,
    _cursor_idx_in_list: 0,
    _list_items: [],
    _target_listidx: null,
    _target_todo: null,
    _target_cursor_y: null,
    _last_cursor: null,

    view_name() { return _('_Todo View'); },
    accel_key() { return _('todo_view_accel')[0]; },

    _parse_list_config() {
      let lists = C.get('todo_view', 'lists');
      if (!Array.isArray(lists) || !lists.length) lists = [{ title: _('To-do'), filter: null }];
      this._list_titles = lists.map(l => l.title);
      this._list_filters = lists.map(l => (l.filter === '' || l.filter === undefined) ? null : l.filter);
      this._list_default_cats = this._list_filters.map(f => (!f || f === 'UNCATEGORIZED') ? null : [f]);
      this._list_count = lists.length;
      this._item_counts = new Array(this._list_count).fill(0);
    },
    init() {
      this._parse_list_config();
      this.topbox = h('div#view_todo.agendaview');
      this._hbox = h('div.todoview_hbox');
      this._hbox.style.setProperty('--lists', this._list_count);
      this._list_box = []; this._list_scroller = [];
      for (let i = 0; i < this._list_count; i++) {
        const title = h('div.todoview_title', { text: this._list_titles[i] });
        title.addEventListener('click', () => { this._cursor_list = i; this._cursor_idx_in_list = 0; this._target_cursor_y = null; this._show_cursor(); });
        const scroller = h('div.todoview_listcontent');
        scroller.addEventListener('scroll', () => { this._target_cursor_y = null; });
        scroller.addEventListener('click', ev => this.click_list(i, ev));
        scroller.addEventListener('dblclick', ev => { this.click_list(i, ev); this.cursor_edit_entry(); });
        const lst = h('div.todoview_list', {}, title, scroller);
        this._list_box.push(lst); this._list_scroller.push(scroller);
        this._hbox.appendChild(lst);
      }
      this.topbox.appendChild(this._hbox);
      this.init_zoom('todo_view', this.topbox);
      return this.topbox;
    },
    get_cursor_entry() {
      const l = this._list_items[this._cursor_list];
      if (!l || !l.length) return null;
      return l[this._cursor_idx_in_list] || null;
    },
    get_cursor_occurrence() { return null; },
    cursor_date() { return View._cursor_date; },
    cursor_set_date() { return false; },
    cursor_goto_event() { return false; },
    renew_display() {},
    default_entry_is_todo() { return true; },
    paste_entry(en) {
      const cats = this._list_default_cats[this._cursor_list];
      const new_en = Cal.paste_entry(en, PG.EntryInfo.TYPE_TODO, null, cats);
      this.cursor_goto_todo(new_en, this._cursor_list);
    },
    paste_text(txt) { setTimeout(() => PG.TodoDialog.new_todo(txt, this.cursor_todo_list()), 0); },
    cursor_todo_list() { return this._cursor_list; },
    cursor_goto_todo(todo, list_idx) { this._target_listidx = list_idx || 0; this._target_todo = todo; return true; },
    redraw(en_changes) {
      this._target_cursor_y = null;
      if (!en_changes) { this._show_cursor(); return; }
      this._last_cursor = null;
      const todos = Cal.todo_list();
      this._list_items = [];
      for (let i = 0; i < this._list_count; i++) {
        const content = h('div.todoview_items');
        let count = 0;
        this._list_items.push([]);
        const filtered = todos.filter(td => this._todo_matches_filter(td, this._list_filters[i]));
        filtered.sort((a, b) => {
          const ka = this._sortkey(a), kb = this._sortkey(b);
          for (let j = 0; j < 3; j++) if (ka[j] !== kb[j]) return ka[j] < kb[j] ? -1 : 1;
          return 0;
        });
        for (const td of filtered) {
          if (this._target_todo && this._target_todo === td) {
            this._cursor_list = i; this._cursor_idx_in_list = count;
            if (i >= this._target_listidx) { this._target_listidx = null; this._target_todo = null; }
          }
          const row = this._row_from_todo(td);
          row.dataset.idx = count;
          content.appendChild(row);
          this._list_items[i].push(td);
          count++;
        }
        this._item_counts[i] = count;
        if (!count) content.appendChild(h('span.emptymark'));
        this._list_scroller[i].innerHTML = '';
        this._list_scroller[i].appendChild(content);
      }
      this._target_listidx = null; this._target_todo = null;
      this._show_cursor();
    },
    _sortkey(t) {
      const due = t.due ? PG.ical_dt.parse(t.due).dt.getTime() : Infinity;
      const cr = t.created ? (PG.ical_dt.parse(t.created.replace('Z', '')) || { dt: new Date(0) }).dt.getTime() : 0;
      return [t.priority || 10, due, cr];
    },
    _row_from_todo(td) {
      const row = h('div.todoview_item');
      row.classList.add(Cal.calendar_displayclass(td));
      row.appendChild(h('span.marker', { text: td.priority ? String.fromCodePoint(0x2789 + td.priority) : '•' }));
      let txt = '';
      if (td.due) txt += '(' + _('Due:') + ' ' + PG.strftime(PG.ical_dt.parse(td.due).dt, PG.datefmt.numeric) + ') ';
      txt += td.summary || '';
      txt += View.entry_icons(td, true);
      row.appendChild(h('span.itemtext', { text: txt }));
      if (td.status && Cal.STATUS_LIST_TODO.includes(td.status)) row.classList.add(td.status.toLowerCase());
      return row;
    },
    _todo_matches_filter(td, filt) {
      if (filt === null) return true;
      const cats = td.categories || [];
      if (!cats.length) return filt === 'UNCATEGORIZED';
      return cats.includes(filt);
    },
    first_list_index(td) {
      for (let i = 0; i < this._list_filters.length; i++) if (this._todo_matches_filter(td, this._list_filters[i])) return i;
      return null;
    },
    _show_cursor() {
      if (!(this._cursor_list >= 0 && this._cursor_list < this._list_count)) this._cursor_list = Math.max(0, this._list_count - 1);
      const icount = this._item_counts[this._cursor_list];
      if (!(this._cursor_idx_in_list >= 0 && this._cursor_idx_in_list < icount)) this._cursor_idx_in_list = Math.max(0, icount - 1);
      if (this._last_cursor) this._last_cursor.classList.remove('cursor');
      const items = this._list_scroller[this._cursor_list].firstChild;
      if (items) {
        const it = items.children[this._cursor_idx_in_list];
        const mk = icount === 0 ? it : it.firstChild;
        mk.classList.add('cursor');
        this._last_cursor = mk;
        // horizontal + vertical scroll into view
        const lb = this._list_box[this._cursor_list];
        const tb = this.topbox;
        if (lb.offsetLeft < tb.scrollLeft) tb.scrollLeft = lb.offsetLeft;
        else if (lb.offsetLeft + lb.offsetWidth > tb.scrollLeft + tb.clientWidth) tb.scrollLeft = lb.offsetLeft + lb.offsetWidth - tb.clientWidth;
        if (icount) View.scroll_to(it, this._list_scroller[this._cursor_list]);
      }
      const ot = icount !== 0;
      const ro = ot && Cal.calendar_readonly(this.get_cursor_entry());
      PG.GUI.set_menu_elts({ on_todo: ot, read_only: ro, can_create_here: PG.GUI.create_todos });
    },
    _get_cursor_y() {
      const sc = this._list_scroller[this._cursor_list];
      const items = sc.firstChild;
      const it = items && items.children[this._cursor_idx_in_list];
      if (!it) return 0;
      return it.getBoundingClientRect().top;
    },
    _y_to_todo_index(y) {
      const sc = this._list_scroller[this._cursor_list];
      const items = sc.firstChild;
      if (!items) return 0;
      const rows = [...items.children];
      let idx = 0;
      for (const r of rows) {
        const rc = r.getBoundingClientRect();
        if (rc.bottom > y) { if (y - rc.top > rc.bottom - y) idx++; break; }
        idx++;
      }
      return idx;
    },
    keypress(ev) {
      if (ev.ctrlKey || ev.altKey || ev.metaKey) return false;
      const map = {
        ArrowUp: () => { this._cursor_idx_in_list--; this._target_cursor_y = null; this._show_cursor(); },
        ArrowDown: () => {
          this._target_cursor_y = null;
          const n = this._item_counts[this._cursor_list];
          if (n > 0) { this._cursor_idx_in_list = (this._cursor_idx_in_list + 1) % n; this._show_cursor(); }
        },
        ArrowRight: () => {
          if (this._target_cursor_y === null) this._target_cursor_y = this._get_cursor_y();
          this._cursor_list = (this._cursor_list + 1) % this._list_count;
          this._cursor_idx_in_list = this._y_to_todo_index(this._target_cursor_y);
          this._show_cursor();
        },
        ArrowLeft: () => {
          if (this._target_cursor_y === null) this._target_cursor_y = this._get_cursor_y();
          this._cursor_list = (this._cursor_list - 1 + this._list_count) % this._list_count;
          this._cursor_idx_in_list = this._y_to_todo_index(this._target_cursor_y);
          this._show_cursor();
        },
        Home: () => { this._cursor_list = 0; this._show_cursor(); },
        End: () => { this._cursor_list = -1; this._show_cursor(); },
        PageUp: () => { this._cursor_idx_in_list = 0; this._show_cursor(); },
        PageDown: () => { this._cursor_idx_in_list = -1; this._show_cursor(); },
        Enter: () => this.cursor_edit_entry(),
      };
      if (map[ev.key]) { map[ev.key](); return true; }
      if (PG.GUI.create_todos && ev.key.length === 1 && ev.key !== ' ') {
        PG.TodoDialog.new_todo(ev.key, this.cursor_todo_list()); return true;
      }
      return false;
    },
    cursor_edit_entry() {
      const en = this.get_cursor_entry();
      if (en) PG.GUI.edit_or_display_todo(en, this.cursor_todo_list());
      else if (PG.GUI.create_todos) PG.TodoDialog.new_todo(null, this.cursor_todo_list());
    },
    click_list(i, ev) {
      this._cursor_list = i;
      const row = ev.target.closest('.todoview_item');
      if (row) this._cursor_idx_in_list = parseInt(row.dataset.idx, 10);
      else this._cursor_idx_in_list = this._item_counts[i] - 1;
      this._target_cursor_y = null;
      this._show_cursor();
    },
    zoom(inc) { View.zoom.call(this, inc); this._target_cursor_y = null; },
  });

  PG.View = View;
  PG.View_Week = Week;
  PG.View_Year = Year;
  PG.View_Todo = Todo;
})();
