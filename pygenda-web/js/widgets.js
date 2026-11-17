/*
  widgets.js – Pygenda Web
  Port of pygenda_widgets.py (date/time/duration entry widgets) plus the
  keyboard behaviour Pygenda adds to GTK widgets (combos, spin buttons,
  switches, radio buttons) and a modal Dialog implementation.
  GPL-3.0-only (see COPYING).
*/
'use strict';

(function () {
  const h = PG.h;
  const INC_KEYS = ['+', '>'];
  const DEC_KEYS = ['-', '<'];
  PG.INC_KEYS = INC_KEYS; PG.DEC_KEYS = DEC_KEYS;

  /* ---------------------------------------------------------------- */
  /* Focus navigation helpers (Gtk child_focus UP/DOWN approximation)  */
  /* ---------------------------------------------------------------- */
  function isVisible(el) {
    if (!el || el.disabled) return false;
    if (el.closest('[hidden], .collapsed, .inactive')) return false;
    return !!(el.offsetWidth || el.offsetHeight || el.getClientRects().length);
  }
  function focusables(root) {
    const sel = 'input:not([type=hidden]), select, textarea, button, [tabindex="0"], .nb-tab[aria-selected="true"]';
    const all = [...root.querySelectorAll(sel)].filter(el => el.tabIndex >= 0 && isVisible(el));
    // Radio groups: only the checked (or first) radio is a stop
    const out = [];
    const seenRadio = new Set();
    for (const el of all) {
      if (el.type === 'radio') {
        if (seenRadio.has(el.name)) continue;
        seenRadio.add(el.name);
        const chk = root.querySelector(`input[type=radio][name="${el.name}"]:checked`);
        out.push(chk && isVisible(chk) ? chk : el);
      } else if (el.classList.contains('dtfield') && !el.classList.contains('dtfirst') && !PG.Config.get_bool('global', 'tab_elts_datetime')) {
        continue; // date/time widgets: only first sub-field is a focus stop
      } else if (el.classList.contains('nb-tab') && el.getAttribute('aria-selected') !== 'true') {
        continue;
      } else out.push(el);
    }
    return out;
  }
  function moveFocus(from, dir) {
    const root = from.closest('.dialog') || document;
    const list = focusables(root);
    let i = list.indexOf(from);
    if (i < 0) {
      // from might be a non-stop subfield (e.g. 2nd date field) → use its widget's first field
      const w = from.closest('.dtwidget');
      if (w) i = list.indexOf(w.querySelector('.dtfirst'));
      if (from.type === 'radio') i = list.findIndex(e => e.name === from.name);
    }
    const j = i + dir;
    if (j >= 0 && j < list.length) {
      list[j].focus();
      if (list[j].select && list[j].type === 'text') {
        /* GTK selects entry text on keyboard focus */
        try { list[j].select(); } catch (e) { /* ignore */ }
      }
      return true;
    }
    return false;
  }
  PG.moveFocus = moveFocus;

  /* ---------------------------------------------------------------- */
  /* Date / Time / Duration widgets                                    */
  /* ---------------------------------------------------------------- */
  class WidgetDateTimeBase {
    constructor(cssname) {
      this.el = h('span.dtwidget.' + cssname);
      this._elts = [];
      this._elimpad = []; // [min, max, pad, loop]
      this._listeners = [];
      this.left_wid = null;
      this.el.addEventListener('focusin', () => this.el.classList.add('focus'));
      this.el.addEventListener('focusout', () => setTimeout(() => {
        if (!this.el.contains(document.activeElement)) this.el.classList.remove('focus');
      }, 0));
    }
    static shortcutKeys() { return PG.lang === 'es' ? 'amdhm' : 'ymdhm'; }
    _field(mn, mx, zeropad, align) {
      const ln = String(mx).length;
      const f = h('input.dtfield', { type: 'text', inputmode: 'numeric', maxlength: ln, size: ln, autocomplete: 'off', spellcheck: 'false' });
      f.style.width = (ln + 0.6) + 'ch';
      f.style.textAlign = align || 'center';
      const pad = zeropad ? ln : 0;
      f.addEventListener('blur', () => {
        let v = parseInt(f.value, 10);
        if (isNaN(v)) v = mn; else v = Math.min(mx, Math.max(mn, v));
        f.value = String(v).padStart(pad, '0');
      });
      return f;
    }
    _sep(txt) { return h('span.dtsep', { text: txt }); }
    _init_navigation() {
      this._elts.forEach((f, i) => {
        if (i === 0) f.classList.add('dtfirst');
        f.addEventListener('keydown', ev => this._key_event(f, ev, i));
        f.addEventListener('input', () => this._changed());
        if (f.tagName === 'SELECT') f.addEventListener('change', () => this._changed());
      });
    }
    _key_event(entry, ev, idx) {
      const isInput = entry.tagName === 'INPUT';
      const len = isInput ? entry.value.length : 0;
      const c_pos = isInput ? entry.selectionStart : 0;
      const sel = isInput && entry.selectionStart !== entry.selectionEnd;
      const at_st = !isInput || c_pos === 0;
      const at_end = !isInput || (sel ? entry.selectionEnd === len : c_pos === len);
      const maxlen = isInput ? entry.maxLength : 0;
      const one_from_max = isInput && !sel && c_pos === maxlen - 1;
      const k = ev.key;
      const done = () => { ev.preventDefault(); ev.stopPropagation(); };
      if (ev.ctrlKey || ev.altKey || ev.metaKey) return;
      if (!isInput) return; // am/pm select handled separately

      if (INC_KEYS.includes(k) || (ev.shiftKey && k === 'ArrowUp')) {
        const [mn, mx, pad, lp] = this._elimpad[idx];
        let v = parseInt(entry.value, 10);
        v = isNaN(v) ? mn : v + 1;
        if (v > mx) v = lp ? mn : mx;
        entry.value = String(v).padStart(pad, '0');
        entry.select();
        this._changed();
        return done();
      }
      if (DEC_KEYS.includes(k) || (ev.shiftKey && k === 'ArrowDown')) {
        const [mn, mx, pad, lp] = this._elimpad[idx];
        let v = parseInt(entry.value, 10);
        v = isNaN(v) ? mx : v - 1;
        if (v < mn) v = lp ? mx : mn;
        entry.value = String(v).padStart(pad, '0');
        entry.select();
        this._changed();
        return done();
      }
      if (k === 'ArrowLeft' && at_st && !sel) {
        if (idx > 0) { this._elts[idx - 1].focus(); this._selEnd(this._elts[idx - 1]); return done(); }
        if (this.left_wid) { this.left_wid.focus(); return done(); }
      }
      if (k === 'Backspace' && at_st && !sel && idx > 0) {
        this._elts[idx - 1].focus(); this._selEnd(this._elts[idx - 1]); return done();
      }
      if (k === 'ArrowRight' && at_end && idx + 1 < this._elts.length) {
        this._elts[idx + 1].focus(); this._selAll(this._elts[idx + 1]); return done();
      }
      if (k === 'ArrowUp' || k === 'ArrowDown') {
        moveFocus(entry, k === 'ArrowUp' ? -1 : 1);
        return done();
      }
      if (at_end && !sel && this.SEPARATOR_KEYS.includes(k) && idx + 1 < this._elts.length) {
        this._elts[idx + 1].focus(); this._selAll(this._elts[idx + 1]);
        return done();
      }
      const sc = this.field_shortcuts.indexOf(k.toLowerCase());
      if (k.length === 1 && sc >= 0 && sc < this._elts.length) {
        this._elts[sc].focus(); this._selAll(this._elts[sc]); return done();
      }
      if (/^[0-9]$/.test(k)) {
        if (!sel && c_pos !== len && len === maxlen) {
          entry.value = entry.value.slice(0, c_pos) + k + entry.value.slice(c_pos + 1);
          if (one_from_max && idx + 1 < this._elts.length) { this._elts[idx + 1].focus(); this._selAll(this._elts[idx + 1]); }
          else entry.setSelectionRange(c_pos + 1, c_pos + 1);
          this._changed();
          return done();
        }
        if (at_end && one_from_max && idx + 1 < this._elts.length) {
          entry.value = entry.value + k;
          this._changed();
          this._elts[idx + 1].focus(); this._selAll(this._elts[idx + 1]);
          return done();
        }
        return; // default insert
      }
      const ALLOWED = ['Backspace', 'Delete', 'ArrowRight', 'ArrowLeft', 'Tab', 'Enter', 'Escape', 'Home', 'End'];
      if (!ALLOWED.includes(k)) {
        // am/pm keys typed in a time field
        if (this._remote_ampm && this._remote_ampm(k)) return done();
        if (k.length === 1) return done(); // block other characters
      }
    }
    _selAll(f) { if (f.select) { try { f.select(); } catch (e) { /* */ } } }
    _selEnd(f) { if (f.setSelectionRange) { try { f.setSelectionRange(f.value.length, f.value.length); } catch (e) { /* */ } } }
    _changed() { this._listeners.forEach(fn => fn(this)); }
    onchange(fn) { this._listeners.push(fn); }
    focus() { this._elts[0].focus(); this._selAll(this._elts[0]); }
    set_left_widget(el) { this.left_wid = el; }
    setError(on) { this.el.classList.toggle('dialog_error', !!on); }
  }

  class WidgetDate extends WidgetDateTimeBase {
    constructor(dt) {
      super('date_entry');
      this.SEPARATOR_KEYS = ['/', '-', '.'];
      this.field_shortcuts = WidgetDateTimeBase.shortcutKeys().slice(0, 3).split('');
      const ord = PG.datefmt.order;
      const sep = PG.Config.get('global', 'date_sep');
      this.fields = {};
      const spec = { Y: [1, 9999, true, false], M: [1, 12, true, true], D: [1, 31, true, true] };
      const sc = {};
      ord.split('').forEach((c, i) => {
        const [mn, mx, zp, lp] = spec[c];
        const f = this._field(mn, mx, zp);
        this.fields[c] = f;
        this._elts.push(f);
        this._elimpad.push([mn, mx, zp ? String(mx).length : 0, lp]);
        if (i) this.el.appendChild(this._sep(sep));
        this.el.appendChild(f);
        sc[c] = i;
      });
      // shortcut keys y/m/d go to year/month/day whatever the order
      const ks = WidgetDateTimeBase.shortcutKeys();
      this.field_shortcuts = [];
      this.field_shortcuts[sc.Y] = ks[0]; this.field_shortcuts[sc.M] = ks[1]; this.field_shortcuts[sc.D] = ks[2];
      this.set_date(dt || PG.D.today());
      this._init_navigation();
    }
    set_date(dt) {
      if (!dt) return;
      this.fields.Y.value = String(dt.getFullYear()).padStart(4, '0');
      this.fields.M.value = PG.D.pad(dt.getMonth() + 1);
      this.fields.D.value = PG.D.pad(dt.getDate());
    }
    _ymd() { return [parseInt(this.fields.Y.value, 10), parseInt(this.fields.M.value, 10), parseInt(this.fields.D.value, 10)]; }
    get_date_or_none() {
      const [y, m, d] = this._ymd();
      if ([y, m, d].some(isNaN) || y < 1 || m < 1 || m > 12 || d < 1 || d > PG.D.daysInMonth(y, m)) return null;
      return new Date(y, m - 1, d);
    }
    get_approx_date_or_none() {
      let [y, m, d] = this._ymd();
      if ([y, m, d].some(isNaN) || y < 1) return null;
      m = Math.min(12, Math.max(1, m));
      d = Math.min(PG.D.daysInMonth(y, m), Math.max(1, d));
      return new Date(y, m - 1, d);
    }
    is_valid_date() { return this.get_date_or_none() !== null; }
  }

  class WidgetTime extends WidgetDateTimeBase {
    constructor(tm) {
      super('time_entry');
      this.SEPARATOR_KEYS = [':', '.'];
      this.field_shortcuts = WidgetDateTimeBase.shortcutKeys().slice(3, 5).split('');
      this.is24 = PG.Config.get_bool('global', '24hr');
      const hs = PG.Config.get('global', 'time_sep');
      if (this.is24) { this.field_hour = this._field(0, 23, true); this._elimpad.push([0, 23, 2, true]); }
      else { this.field_hour = this._field(1, 12, false, 'right'); this._elimpad.push([1, 12, 0, true]); }
      this.field_min = this._field(0, 59, true);
      this._elimpad.push([0, 59, 2, true]);
      this.el.append(this.field_hour, this._sep(hs), this.field_min);
      this._elts.push(this.field_hour, this.field_min);
      if (!this.is24) {
        this.field_ampm = h('select.dtampm', {}, h('option', { value: 'a', text: 'am' }), h('option', { value: 'p', text: 'pm' }));
        this.el.appendChild(this.field_ampm);
        this._elts.push(this.field_ampm);
        this._remote_ampm = k => {
          if (k === 'a' || k === 'A') { this.field_ampm.value = 'a'; this._changed(); return true; }
          if (k === 'p' || k === 'P') { this.field_ampm.value = 'p'; this._changed(); return true; }
          return false;
        };
        this.field_ampm.addEventListener('keydown', ev => {
          const k = ev.key;
          const stop = () => { ev.preventDefault(); ev.stopPropagation(); };
          if (k === ' ') { try { this.field_ampm.showPicker(); } catch (e) { /* */ } return stop(); }
          if (this._remote_ampm(k)) return stop();
          if (INC_KEYS.includes(k) || DEC_KEYS.includes(k) || (ev.shiftKey && (k === 'ArrowUp' || k === 'ArrowDown'))) {
            this.field_ampm.value = this.field_ampm.value === 'a' ? 'p' : 'a'; this._changed(); return stop();
          }
          if (k === 'ArrowUp' || k === 'ArrowDown') { moveFocus(this.field_ampm, k === 'ArrowUp' ? -1 : 1); return stop(); }
          if (k === 'ArrowLeft') { this.field_min.focus(); return stop(); }
        });
      }
      this.set_time(tm || new Date(2000, 0, 1, 9, 0));
      this._init_navigation();
    }
    set_time(tm) {
      const hr = tm.getHours();
      if (this.is24) this.field_hour.value = PG.D.pad(hr);
      else {
        this.field_ampm.value = hr < 12 ? 'a' : 'p';
        this.field_hour.value = String((hr + 11) % 12 + 1);
      }
      this.field_min.value = PG.D.pad(tm.getMinutes());
    }
    get_time_or_none() {
      let hr = parseInt(this.field_hour.value, 10);
      const mn = parseInt(this.field_min.value, 10);
      if (isNaN(hr) || isNaN(mn) || mn < 0 || mn > 59) return null;
      if (this.is24) { if (hr < 0 || hr > 23) return null; }
      else {
        if (hr < 1 || hr > 12) return null;
        if (hr === 12) hr = 0;
        if (this.field_ampm.value === 'p') hr += 12;
      }
      return new Date(2000, 0, 1, hr, mn);
    }
    is_valid_time() { return this.get_time_or_none() !== null; }
  }

  class WidgetDuration extends WidgetDateTimeBase {
    constructor(secs) {
      super('duration_entry');
      this.SEPARATOR_KEYS = [':', '.'];
      this.field_shortcuts = WidgetDateTimeBase.shortcutKeys().slice(3, 5).split('');
      this.field_hour = this._field(0, 23, false, 'right');
      this.field_min = this._field(0, 59, true);
      this.el.append(this.field_hour, this._sep(PG.Config.get('global', 'time_sep')), this.field_min);
      this._elts.push(this.field_hour, this.field_min);
      this._elimpad.push([0, 23, 0, false], [0, 59, 2, true]);
      this.set_duration(secs || 0);
      this._init_navigation();
    }
    set_duration(secs) {
      const tot = Math.floor(secs / 60);
      this.field_hour.value = String(Math.floor(tot / 60));
      this.field_min.value = PG.D.pad(tot % 60);
    }
    get_duration_or_none() {
      const hr = parseInt(this.field_hour.value, 10), mn = parseInt(this.field_min.value, 10);
      if (isNaN(hr) || isNaN(mn) || hr < 0 || mn < 0 || mn >= 60) return null;
      return hr * 3600 + mn * 60;
    }
  }
  PG.WidgetDate = WidgetDate; PG.WidgetTime = WidgetTime; PG.WidgetDuration = WidgetDuration;

  /* ---------------------------------------------------------------- */
  /* Combo (GTK ComboBoxText with Pygenda key handling)                 */
  /* ---------------------------------------------------------------- */
  class Combo {
    constructor(items, opts) {
      opts = opts || {};
      this.el = h('select.combo');
      this.respond = opts.respond || 'ok';
      this.set_items(items || []);
      this.el.addEventListener('keydown', ev => this._key(ev));
    }
    set_items(items) {
      const old = this.el.selectedIndex;
      this.el.innerHTML = '';
      items.forEach(([id, label], i) => this.el.appendChild(h('option', { value: id === null || id === undefined ? '#' + i : String(id), text: label })));
      if (old >= 0 && old < items.length) this.el.selectedIndex = old;
    }
    remove_all() { this.el.innerHTML = ''; }
    get_active() { return this.el.selectedIndex; }
    set_active(i) { this.el.selectedIndex = i; this.el.dispatchEvent(new Event('change')); }
    get_active_id() { const o = this.el.options[this.el.selectedIndex]; if (!o) return null; return o.value.startsWith('#') ? null : o.value; }
    set_active_id(id) {
      const i = [...this.el.options].findIndex(o => o.value === String(id));
      if (i >= 0) this.set_active(i);
    }
    count() { return this.el.options.length; }
    onchange(fn) { this.el.addEventListener('change', () => fn(this)); }
    set_visible(v) { this.el.hidden = !v; }
    _key(ev) {
      const k = ev.key;
      const stop = () => { ev.preventDefault(); ev.stopPropagation(); };
      if (ev.ctrlKey || ev.altKey || ev.metaKey) return;
      const n = this.count();
      if (k === 'Enter') {
        const d = this.el.closest('.dialog');
        if (d && d._pgDialog) d._pgDialog.response(this.respond);
        return stop();
      }
      if (INC_KEYS.includes(k) || (ev.shiftKey && k === 'ArrowDown')) { if (n) this.set_active((this.get_active() + 1) % n); return stop(); }
      if (DEC_KEYS.includes(k) || (ev.shiftKey && k === 'ArrowUp')) { if (n) this.set_active(((Math.max(0, this.get_active()) - 1) % n + n) % n); return stop(); }
      if (k === 'ArrowUp' || k === 'ArrowDown') { moveFocus(this.el, k === 'ArrowUp' ? -1 : 1); return stop(); }
      if (k === ' ') { try { this.el.showPicker(); } catch (e) { /* */ } return stop(); }
      if (k === 'ArrowLeft' || k === 'ArrowRight') return stop();
      if (k.length === 1 && /[\p{L}\p{N}]/u.test(k)) {
        const ch = k.toLowerCase();
        const a = this.get_active();
        for (let i = 1; i < n; i++) {
          const j = (a + i) % n;
          if ((this.el.options[j].text[0] || '').toLowerCase() === ch) { this.set_active(j); break; }
        }
        return stop();
      }
    }
  }
  PG.Combo = Combo;

  /* Spin button */
  class Spin {
    constructor(mn, mx, val) {
      this.min = mn; this.max = mx;
      this.el = h('input.spin', { type: 'text', inputmode: 'numeric', size: String(mx).length + 1, autocomplete: 'off' });
      this.dec = h('button.spinbtn', { type: 'button', tabindex: '-1', text: '−', onclick: () => this.spin(-1) });
      this.inc = h('button.spinbtn', { type: 'button', tabindex: '-1', text: '+', onclick: () => this.spin(1) });
      this.box = h('span.spinbutton', {}, this.el, this.dec, this.inc);
      this._ls = [];
      this.set_value(val ?? mn);
      this.el.addEventListener('input', () => this._changed());
      this.el.addEventListener('blur', () => { this.set_value(this.get_value()); });
      this.el.addEventListener('keydown', ev => {
        const k = ev.key;
        const stop = () => { ev.preventDefault(); ev.stopPropagation(); };
        if (ev.ctrlKey || ev.altKey || ev.metaKey) return;
        if (INC_KEYS.includes(k) || (ev.shiftKey && k === 'ArrowUp')) { this.spin(1); return stop(); }
        if (DEC_KEYS.includes(k) || (ev.shiftKey && k === 'ArrowDown')) { this.spin(-1); return stop(); }
        if (k === 'ArrowUp' || k === 'ArrowDown') { moveFocus(this.el, k === 'ArrowUp' ? -1 : 1); return stop(); }
        if (k.length === 1 && !/[0-9]/.test(k)) return stop();
      });
    }
    get_value() { const v = parseInt(this.el.value, 10); return isNaN(v) ? this.min : Math.min(this.max, Math.max(this.min, v)); }
    get_text() { return this.el.value; }
    set_value(v) { v = Math.min(this.max, Math.max(this.min, v)); if (String(v) !== this.el.value) { this.el.value = String(v); } }
    set_range(mn, mx) { this.min = mn; this.max = mx; }
    spin(d) { this.set_value(this.get_value() + d); this._changed(); this.el.select(); }
    onchange(fn) { this._ls.push(fn); }
    _changed() { this._ls.forEach(f => f(this)); }
    setError(on) { this.box.classList.toggle('dialog_error', !!on); }
  }
  PG.Spin = Spin;

  /* Switch (GtkSwitch) */
  class Switch {
    constructor(active) {
      this.el = h('input.switch', { type: 'checkbox', role: 'switch' });
      this.el.checked = !!active;
      this._ls = [];
      this.el.addEventListener('change', () => this._ls.forEach(f => f(this.el.checked)));
      this.el.addEventListener('keydown', ev => {
        const k = ev.key;
        if (k === 'ArrowLeft' && this.el.checked) { this.set_active(false); ev.preventDefault(); }
        else if (k === 'ArrowRight' && !this.el.checked) { this.set_active(true); ev.preventDefault(); }
        else if (k === 'Enter') {
          const d = this.el.closest('.dialog');
          if (d && d._pgDialog) { d._pgDialog.response(d._pgDialog.defaultResponse); ev.preventDefault(); }
        }
      });
    }
    get_active() { return this.el.checked; }
    set_active(v) { if (this.el.checked !== !!v) { this.el.checked = !!v; this.el.dispatchEvent(new Event('change')); } }
    onchange(fn) { this._ls.push(fn); }
  }
  PG.Switch = Switch;

  /* Radio group */
  let radioCount = 0;
  class RadioGroup {
    constructor(labels) {
      const name = 'rg' + (++radioCount);
      this.inputs = [];
      this.el = h('span.radiogroup');
      labels.forEach((lab, i) => {
        const inp = h('input', { type: 'radio', name, value: String(i) });
        this.inputs.push(inp);
        this.el.appendChild(h('label.radio', {}, inp, ' ' + lab));
        inp.addEventListener('keydown', ev => {
          if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
            ev.preventDefault(); moveFocus(inp, ev.key === 'ArrowUp' ? -1 : 1);
          } else if (ev.key === 'Enter') {
            const d = this.el.closest('.dialog');
            if (d && d._pgDialog) { ev.preventDefault(); d._pgDialog.response(d._pgDialog.defaultResponse); }
          }
        });
      });
      this._ls = [];
      this.inputs.forEach(inp => inp.addEventListener('change', () => this._ls.forEach(f => f(this.get_active()))));
    }
    get_active() { return this.inputs.findIndex(i => i.checked); }
    set_active(i) { this.inputs[i].checked = true; this._ls.forEach(f => f(i)); }
    onchange(fn) { this._ls.push(fn); }
  }
  PG.RadioGroup = RadioGroup;

  /* Single-line text entry */
  PG.textEntry = function (cls) {
    const e = h('input.textentry' + (cls ? '.' + cls : ''), { type: 'text', autocomplete: 'off' });
    e.addEventListener('keydown', ev => {
      if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
        if (ev.shiftKey || ev.ctrlKey || ev.altKey) return;
        ev.preventDefault(); moveFocus(e, ev.key === 'ArrowUp' ? -1 : 1);
      }
    });
    return e;
  };
  /* Multi-line notes; Enter confirms dialog, shift/ctrl+Enter = newline */
  PG.notesEntry = function () {
    const t = h('textarea.longtextentry', { rows: '4' });
    t.addEventListener('keydown', ev => {
      if (ev.key === 'ArrowUp' && t.selectionStart === 0 && t.selectionEnd === 0) { ev.preventDefault(); moveFocus(t, -1); }
      else if (ev.key === 'Enter' && !ev.shiftKey && !ev.ctrlKey) {
        ev.preventDefault();
        const d = t.closest('.dialog');
        if (d && d._pgDialog) d._pgDialog.response(d._pgDialog.defaultResponse);
      } else if (ev.key === 'Enter') {
        // ctrl+enter → newline (shift+enter is native)
        if (ev.ctrlKey) {
          ev.preventDefault();
          const s = t.selectionStart;
          t.setRangeText('\n', s, t.selectionEnd, 'end');
        }
      }
    });
    return t;
  };

  /* Notebook (tabs) */
  class Notebook {
    constructor(pages) {
      this.el = h('div.notebook');
      this.header = h('div.nb-tabs', { role: 'tablist' });
      this.body = h('div.nb-pages');
      this.tabs = []; this.pages = [];
      pages.forEach((p, i) => {
        const t = h('button.nb-tab', { type: 'button', role: 'tab', text: p.label, tabindex: '0' });
        t.addEventListener('click', () => { this.set_current_page(i); t.focus(); });
        t.addEventListener('keydown', ev => {
          if (ev.key === 'ArrowLeft') { ev.preventDefault(); this.set_current_page(Math.max(0, this.cur - 1)); this.tabs[this.cur].focus(); }
          else if (ev.key === 'ArrowRight') { ev.preventDefault(); this.set_current_page(Math.min(this.tabs.length - 1, this.cur + 1)); this.tabs[this.cur].focus(); }
          else if (ev.key === 'ArrowDown') { ev.preventDefault(); moveFocus(t, 1); }
          else if (ev.key === 'ArrowUp') { ev.preventDefault(); moveFocus(t, -1); }
          else if (ev.key === 'Enter') {
            const d = t.closest('.dialog');
            if (d && d._pgDialog) { ev.preventDefault(); d._pgDialog.response(d._pgDialog.defaultResponse); }
          }
        });
        this.tabs.push(t);
        const pg = h('div.nb-page', { role: 'tabpanel' }, p.content);
        this.pages.push(pg);
        this.header.appendChild(t);
        this.body.appendChild(pg);
      });
      this.el.append(this.header, this.body);
      this.set_current_page(0);
    }
    set_current_page(i) {
      this.cur = i;
      this.tabs.forEach((t, j) => { t.setAttribute('aria-selected', j === i ? 'true' : 'false'); t.classList.toggle('checked', j === i); });
      this.pages.forEach((p, j) => { p.classList.toggle('inactive', j !== i); p.inert = j !== i; });
    }
    get_current_page() { return this.cur; }
    grab_focus() { this.tabs[this.cur].focus(); }
    setTabError(i, on) { this.tabs[i].classList.toggle('tab_error', !!on); }
  }
  PG.Notebook = Notebook;

  /* Revealer: show/hide content */
  PG.reveal = function (els, on) { for (const e of [].concat(els)) if (e) e.classList.toggle('collapsed', !on); };

  /* ---------------------------------------------------------------- */
  /* Modal dialog                                                      */
  /* ---------------------------------------------------------------- */
  const stack = [];
  class Dialog {
    /* opts: {title, content, buttons:[{label, response, default, cls}], cls, onresponse(resp)→bool(close?)} */
    constructor(opts) {
      this.opts = opts;
      this.defaultResponse = null;
      this.btns = {};
      const title = h('div.dlg-title', { text: opts.title || '' });
      const closeX = h('button.dlg-close', { type: 'button', 'aria-label': _('Close'), tabindex: '-1', text: '×', onclick: () => this.response('close') });
      title.appendChild(closeX);
      this.content = h('div.dlg-content');
      if (opts.content) this.content.appendChild(opts.content);
      const actions = h('div.dlg-actions');
      for (const b of opts.buttons || []) {
        const btn = h('button.dlg-btn' + (b.cls ? '.' + b.cls : ''), { type: 'button', text: b.label, onclick: () => this.response(b.response) });
        btn.addEventListener('keydown', ev => {
          if (ev.key === 'ArrowLeft' || ev.key === 'ArrowRight') {
            ev.preventDefault();
            const all = [...actions.querySelectorAll('button:not([disabled])')];
            const i = all.indexOf(btn) + (ev.key === 'ArrowLeft' ? -1 : 1);
            if (all[i]) all[i].focus();
          } else if (ev.key === 'ArrowUp' || ev.key === 'ArrowDown') {
            ev.preventDefault(); moveFocus(btn, ev.key === 'ArrowUp' ? -1 : 1);
          }
        });
        if (b.default) { this.defaultResponse = b.response; btn.classList.add('default'); }
        this.btns[b.response] = btn;
        actions.appendChild(btn);
      }
      if (!(opts.buttons || []).length) actions.hidden = true;
      this.dialog = h('div.dialog' + (opts.cls ? '.' + opts.cls : ''), { role: 'dialog', 'aria-modal': 'true', 'aria-label': opts.title || '' }, title, this.content, actions);
      this.dialog._pgDialog = this;
      this.backdrop = h('div.dlg-backdrop', {}, this.dialog);
      this.backdrop.addEventListener('keydown', ev => this._key(ev));
      this.backdrop.addEventListener('mousedown', ev => { if (ev.target === this.backdrop) ev.preventDefault(); });
    }
    set_sensitive(resp, on) { if (this.btns[resp]) this.btns[resp].disabled = !on; }
    set_title(t) { this.dialog.querySelector('.dlg-title').firstChild.textContent = t; }
    _key(ev) {
      if (ev.key === 'Escape') { ev.preventDefault(); ev.stopPropagation(); this.response('close'); return; }
      if (ev.key === 'Enter' && !ev.defaultPrevented) {
        const t = ev.target;
        if (t.tagName === 'TEXTAREA') return;
        if (t.tagName === 'BUTTON' && !t.classList.contains('nb-tab')) return; // native click
        if (this.defaultResponse !== null) { ev.preventDefault(); this.response(this.defaultResponse); }
        return;
      }
      if ((ev.key === 'ArrowUp' || ev.key === 'ArrowDown') && !ev.defaultPrevented && !ev.shiftKey) {
        const t = ev.target;
        if (t.tagName === 'INPUT' && (t.type === 'checkbox')) { ev.preventDefault(); moveFocus(t, ev.key === 'ArrowUp' ? -1 : 1); }
      }
      ev.stopPropagation(); // don't let keys reach the main view
    }
    run(focusEl) {
      return new Promise(resolve => {
        this._resolve = resolve;
        stack.push(this);
        document.body.appendChild(this.backdrop);
        this.prevFocus = document.activeElement;
        requestAnimationFrame(() => {
          const f = focusEl || focusables(this.dialog)[0] || this.dialog.querySelector('.dlg-btn.default');
          if (f) {
            f.focus();
            if (!focusEl && f.tagName === 'INPUT' && f.type === 'text') { try { f.select(); } catch (e) { /* */ } }
          }
        });
      });
    }
    response(resp) {
      if (!this._resolve) return;
      if (this.btns[resp] && this.btns[resp].disabled) return;
      if (this.opts.onresponse && this.opts.onresponse(resp) === false) return; // stay open
      this.close();
      const r = this._resolve; this._resolve = null;
      r(resp);
    }
    close() {
      const i = stack.indexOf(this);
      if (i >= 0) stack.splice(i, 1);
      this.backdrop.remove();
      if (this.prevFocus && this.prevFocus.focus && document.contains(this.prevFocus)) {
        try { this.prevFocus.focus({ preventScroll: true }); } catch (e) { /* */ }
      }
    }
    static isOpen() { return stack.length > 0; }
  }
  PG.Dialog = Dialog;

  /* Grid of label/value rows */
  PG.grid = function (rows, cls) {
    const g = h('div.pg-grid' + (cls ? '.' + cls : ''));
    for (const r of rows) {
      if (!r) continue;
      const [lab, val] = r;
      const l = h('div.tlabel', { text: lab || '' });
      const v = h('div.gval');
      if (val instanceof Node) v.appendChild(val); else if (val !== undefined && val !== null) v.textContent = String(val);
      if (r[2]) { l.classList.add(...[].concat(r[2])); v.classList.add(...[].concat(r[2])); }
      g.append(l, v);
    }
    return g;
  };
})();
