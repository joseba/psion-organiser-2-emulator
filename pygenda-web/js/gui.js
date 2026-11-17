/*
  gui.js – Pygenda Web
  Port of pygenda_gui.py: main window, menus, soft buttons, keyboard
  routing, clipboard, view switching and simple dialogs.
  GPL-3.0-only (see COPYING).
*/
'use strict';

(function () {
  const h = PG.h, D = PG.D, C = PG.Config, Cal = PG.Calendar;
  const VERSION = '0.3.x-web';

  /* Soft-button icons (simple vector re-drawings of the GTK icon-theme icons) */
  const ICONS = {
    add: '<svg viewBox="0 0 32 32" width="32" height="32"><defs><radialGradient id="ga" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#a6e36d"/><stop offset="1" stop-color="#4e9a06"/></radialGradient></defs><circle cx="16" cy="16" r="14" fill="url(#ga)" stroke="#3b7a05" stroke-width="1.2"/><path d="M16 8v16M8 16h16" stroke="#fff" stroke-width="4.2" stroke-linecap="round"/></svg>',
    view: '<svg viewBox="0 0 32 32" width="32" height="32"><rect x="4" y="5" width="24" height="23" rx="2" fill="#fafafa" stroke="#888"/><rect x="4" y="5" width="24" height="6" rx="2" fill="#73c140" stroke="#4e9a06"/><g stroke="#bbb" stroke-width="1"><path d="M7 15h18M7 19h18M7 23h18M10 13v13M14 13v13M18 13v13M22 13v13"/></g></svg>',
    goto: '<svg viewBox="0 0 32 32" width="32" height="32"><defs><linearGradient id="gb" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8fb8e8"/><stop offset="1" stop-color="#2a5ea8"/></linearGradient></defs><path d="M5 18c0-8 6-12 13-11l0-4 9 8-9 8 0-4c-5-1-9 1-10 6z" fill="url(#gb)" stroke="#204a87" stroke-width="1" transform="rotate(25 16 16)"/></svg>',
    zoom: '<svg viewBox="0 0 32 32" width="32" height="32"><rect x="7" y="7" width="18" height="18" rx="3" fill="#f4f4f4" stroke="#999"/><path d="M16 11v10M11 16h10" stroke="#777" stroke-width="2.4"/></svg>',
  };

  const GUI = {
    _VIEWS: ['Week', 'Year', 'Todo'],
    views: [],
    view_widgets: [],
    _view_idx: 0,
    _toggle_view_idx: -1,
    create_events: true,
    create_todos: true,
    _clip: null, // internal clipboard (entry object)
    menuItems: {},

    init() {
      PG.init_date_format();
      if (C.get_bool('global', 'dark_mode')) document.documentElement.classList.add('dark');
      this._apply_calendar_css();
      const app = h('div#app');
      this.menubar = this._build_menus();
      this.viewcont = h('div#box_view_cont');
      this.eventbox = h('div#view_eventbox', { tabindex: '-1' });
      this.buttons = this._build_softkeys();
      const skd = String(C.get('softkeys', 'display') || '').toLowerCase();
      if (skd === 'hide') this.buttons.hidden = true;
      if (skd === 'left') this.viewcont.append(this.buttons, this.eventbox);
      else this.viewcont.append(this.eventbox, this.buttons);
      if (!C.get_bool('softkeys', 'show_icons')) this.buttons.classList.add('noicons');
      app.append(this.menubar, this.viewcont);
      document.body.appendChild(app);

      this.create_events = Cal.calendar_displaynames_event_rw().length !== 0;
      this.create_todos = Cal.calendar_displaynames_todo_rw().length !== 0;
      if (!this.create_events) this._sens('new-event', false);
      if (!this.create_todos) this._sens('new-todo', false);

      // views
      for (const v of this._VIEWS) {
        const view = PG['View_' + v];
        this.views.push(view);
        this.view_widgets.push(view.init());
      }
      this._fill_viewmode_menu();
      const vw = String(C.get('startup', 'view') || '').toLowerCase();
      const vi = this._VIEWS.findIndex(v => v.toLowerCase() === vw);
      if (vi >= 0) this._view_idx = vi;
      const hashDate = /date=(\d{4})-(\d{2})-(\d{2})/.exec(location.hash);
      if (hashDate) {
        const dt = new Date(+hashDate[1], +hashDate[2] - 1, +hashDate[3]);
        for (let i = this._view_idx; i < this._view_idx + this.views.length; i++) {
          if (this.views[i % this.views.length].cursor_set_date(dt)) { this._view_idx = i % this.views.length; break; }
        }
      }
      this.eventbox.appendChild(this.view_widgets[this._view_idx]);
      this._plus_minus_zoom = C.get_bool('global', 'plus_minus_zoom');

      document.addEventListener('keydown', ev => this.keypress(ev));
      document.addEventListener('copy', ev => this._clip_event(ev, 'copy'));
      document.addEventListener('cut', ev => this._clip_event(ev, 'cut'));
      document.addEventListener('paste', ev => this._paste_event(ev));
      document.addEventListener('mousedown', ev => { if (!ev.target.closest('.menubar')) this._close_menus(); });
      document.addEventListener('fullscreenchange', () => this._update_fs_label());
      // refresh "today" highlight when the date changes
      this._today = D.today().getTime();
      setInterval(() => { const t = D.today().getTime(); if (t !== this._today) { this._today = t; this.views.forEach(v => v.renew_display()); this.view_redraw(true); } }, 60000);

      this.view_redraw(true);
      this.eventbox.focus();
      if (C.get_bool('startup', 'fullscreen')) this.toggle_fullscreen();
    },

    _apply_calendar_css() {
      let css = '';
      for (const c of Cal.calendars()) {
        if (!c.color) continue;
        const cls = '.cal-' + (c.cls || 'pygenda').replace(/[^\w-]/g, '_');
        css += `${cls} > .itemtext{background:${c.color};color:#000;border-radius:.3em;padding:0 .2em .05em;margin:0 5px 4px 0;box-shadow:2px 2px 3px 0 rgba(0,0,0,.6)}\n${cls}{margin-top:1px}\n`;
      }
      let st = document.getElementById('calcss');
      if (!st) { st = h('style#calcss'); document.head.appendChild(st); }
      st.textContent = css;
    },

    /* ------------------------------------------------------------ */
    /* Menus                                                        */
    /* ------------------------------------------------------------ */
    _menu_def() {
      const S = (id, label, accel, fn, extra) => Object.assign({ id, label, accel, fn }, extra || {});
      return [
        { label: _('_File'), items: [
          S('import', _('_Import File…'), 'Ctrl+I', () => this.handler_import()),
          S('export', _('_Export to iCal File…'), 'Ctrl+E', () => this.handler_export()),
          null,
          S('prefs', _('_Preferences…'), null, () => PG.PreferencesDialog.show()),
        ] },
        { label: _('_Edit'), items: [
          S('cut', _('Cu_t'), 'Ctrl+X', () => this.cut_request()),
          S('copy', _('_Copy'), 'Ctrl+C', () => this.copy_request()),
          S('paste', _('_Paste'), 'Ctrl+V', () => this.paste_request()),
          null,
          S('delete', _('_Delete…'), 'Delete', () => this.delete_request(), { alt: ['Backspace'] }),
        ] },
        { label: _('E_ntry'), items: [
          S('new-event', _('_New Event…'), 'Ctrl+N', () => this.handler_newevent()),
          S('new-todo', _('New _To-do…'), 'Ctrl+M', () => this.handler_newtodo()),
          null,
          S('show-props', _('Show _Properties'), 'Ctrl+Enter', () => this.handler_showentryprops()),
          S('edit-time', _('Edit _Time…'), 'Ctrl+T', () => this.handler_edit(PG.EventDialog.TAB_TIME)),
          S('edit-reps', _('Edit _Repeats…'), 'Ctrl+R', () => this.handler_edit(PG.EventDialog.TAB_REPEATS)),
          S('edit-alarm', _('Edit _Alarms…'), 'Ctrl+A', () => this.handler_edit(PG.EventDialog.TAB_ALARM)),
          S('edit-details', _('Edit _Details…'), 'Ctrl+D', () => this.handler_edit(PG.EventDialog.TAB_DETAILS)),
          S('set-status', _('Set _Status'), null, null, { sub: [
            S('stat-none', _('_None'), 'Shift+Ctrl+N', () => this.handler_stat_toggle(null)),
            S('stat-confirmed', _('_Confirmed'), 'Shift+Ctrl+C', () => this.handler_stat_toggle('CONFIRMED')),
            S('stat-needsaction', _('_Action required'), 'Shift+Ctrl+A', () => this.handler_stat_toggle('NEEDS-ACTION')),
            S('stat-inprocess', _('In _progress'), 'Shift+Ctrl+P', () => this.handler_stat_toggle('IN-PROCESS')),
            S('stat-completed', _('_Completed'), 'Shift+Ctrl+C', () => this.handler_stat_toggle('COMPLETED')),
            S('stat-cancelled', _('Cance_lled'), 'Shift+Ctrl+X', () => this.handler_stat_toggle('CANCELLED')),
            S('stat-tentative', _('_Tentative'), 'Shift+Ctrl+U', () => this.handler_stat_toggle('TENTATIVE')),
          ] }),
        ] },
        { label: _('_View'), items: [
          S('viewmode', _('_View Mode'), null, null, { sub: [] }),
          S('switch-view', _('Switch _View'), 'Shift+Ctrl+V', () => this.switch_view()),
          null,
          S('zoom-in', _('Zoom _In'), 'Ctrl+Plus', () => this.zoom(1), { alt: ['Ctrl+='] }),
          S('zoom-out', _('Zoom _Out'), 'Ctrl+Minus', () => this.zoom(-1)),
          null,
          S('fullscreen', _('_Fullscreen'), 'Shift+Ctrl+F', () => this.toggle_fullscreen(), { alt: ['F11'] }),
        ] },
        { label: _('_Tools'), items: [
          S('goto', _('_Go To…'), 'Ctrl+G', () => this.dialog_goto()),
          S('find', _('_Find…'), 'Ctrl+F', () => PG.FindDialog.find()),
        ] },
        { label: _('_Help'), items: [
          S('sample', _('Load sample data'), null, () => this.load_sample_data()),
          null,
          S('about', _('_About'), null, () => this.dialog_about()),
        ] },
      ];
    },
    _build_menus() {
      const bar = h('div.menubar', { role: 'menubar' });
      this.menus = [];
      this.accels = [];
      this._menudef = this._menu_def();
      this._menudef.forEach((m, mi) => {
        const mn = PG.mnemonic(m.label);
        const top = h('div.menutop', { role: 'menuitem', tabindex: '-1' }, this._mn_label(mn));
        const pop = this._build_popup(m.items);
        const wrap = h('div.menuwrap', {}, top, pop);
        top.addEventListener('mousedown', ev => { ev.preventDefault(); if (this._open === mi) this._close_menus(); else this._open_menu(mi); });
        top.addEventListener('mouseenter', () => { if (this._open !== null && this._open !== undefined && this._open !== mi) this._open_menu(mi); });
        bar.appendChild(wrap);
        this.menus.push({ top, pop, key: mn.key, items: m.items });
      });
      this._open = null;
      return bar;
    },
    _mn_label(mn) {
      if (mn.idx < 0) return h('span', { text: mn.text });
      return h('span', {}, mn.text.slice(0, mn.idx), h('u', { text: mn.text.charAt(mn.idx) }), mn.text.slice(mn.idx + 1));
    },
    _build_popup(items) {
      const pop = h('div.menupop', { role: 'menu' });
      for (const it of items) {
        if (!it) { pop.appendChild(h('div.menusep')); continue; }
        const mn = PG.mnemonic(it.label);
        const el = h('div.menuitem', { role: 'menuitem', tabindex: '-1' }, h('span.mlabel', {}, this._mn_label(mn)), h('span.maccel', { text: this._accel_display(it.accel) }));
        it.el = el; it.key = mn.key;
        this.menuItems[it.id] = it;
        if (it.sub) {
          el.classList.add('hassub');
          el.querySelector('.maccel').textContent = '▸';
          it.subpop = this._build_popup(it.sub);
          el.appendChild(it.subpop);
          el.addEventListener('mouseenter', () => this._open_sub(it));
          el.addEventListener('mousedown', ev => { ev.preventDefault(); this._open_sub(it); });
        } else {
          el.addEventListener('mousedown', ev => ev.preventDefault());
          el.addEventListener('click', ev => { ev.stopPropagation(); this._activate(it); });
          el.addEventListener('mouseenter', () => { this._hilite(el); this._close_subs(el.parentElement); });
        }
        if (it.accel) this.accels.push({ spec: it.accel, it });
        for (const a of it.alt || []) this.accels.push({ spec: a, it });
        pop.appendChild(el);
      }
      return pop;
    },
    _accel_display(a) {
      if (!a) return '';
      return a.replace('Plus', '+').replace('Minus', '−');
    },
    _fill_viewmode_menu() {
      const vm = this.menuItems.viewmode;
      const sub = this.views.map((v, i) => ({ id: 'view-' + i, label: v.view_name(), accel: 'Shift+Ctrl+' + v.accel_key().toUpperCase(), fn: () => this.switch_view(i) }));
      vm.sub = sub;
      const np = this._build_popup(sub);
      vm.el.replaceChild(np, vm.subpop);
      vm.subpop = np;
    },
    _sens(id, on) { const it = this.menuItems[id]; if (it) { it.disabled = !on; it.el.classList.toggle('disabled', !on); } },
    _show(id, on) { const it = this.menuItems[id]; if (it) { it.hidden = !on; it.el.hidden = !on; } },
    _activate(it) {
      if (it.disabled || it.hidden) return;
      this._close_menus();
      if (it.sub) return;
      setTimeout(() => it.fn(), 0);
    },
    _open_menu(mi) {
      this._close_menus();
      this._open = mi;
      const m = this.menus[mi];
      m.top.classList.add('open');
      m.pop.classList.add('open');
      this._hilite(null);
    },
    _close_menus() {
      if (this._open === null || this._open === undefined) return;
      for (const m of this.menus) { m.top.classList.remove('open'); m.pop.classList.remove('open'); }
      document.querySelectorAll('.menupop .open').forEach(e => e.classList.remove('open'));
      document.querySelectorAll('.menuitem.hilite').forEach(e => e.classList.remove('hilite'));
      this._open = null;
      this._subOpen = null;
    },
    _open_sub(it) {
      this._close_subs(it.el.parentElement);
      if (it.disabled) return;
      it.subpop.classList.add('open');
      this._hilite(it.el);
      this._subOpen = it;
    },
    _close_subs(pop) { pop.querySelectorAll('.menupop.open').forEach(p => p.classList.remove('open')); },
    _hilite(el) {
      const pop = el ? el.parentElement : null;
      document.querySelectorAll('.menuitem.hilite').forEach(e => { if (!pop || e.parentElement === pop) e.classList.remove('hilite'); });
      if (el) el.classList.add('hilite');
    },
    _menu_key(ev) {
      const m = this.menus[this._open];
      const curPop = this._subOpen && this._subOpen.subpop.classList.contains('open') ? this._subOpen.subpop : m.pop;
      const items = [...curPop.children].filter(e => e.classList.contains('menuitem') && !e.hidden);
      let cur = items.findIndex(e => e.classList.contains('hilite'));
      const k = ev.key;
      const findIt = el => this._find_item(el);
      if (k === 'Escape') {
        if (curPop !== m.pop) { curPop.classList.remove('open'); this._subOpen = null; }
        else this._close_menus();
      } else if (k === 'ArrowDown' || k === 'ArrowUp') {
        const n = items.length;
        for (let t = 0; t < n; t++) {
          cur = k === 'ArrowDown' ? (cur + 1) % n : (cur - 1 + n) % n;
          if (!items[cur].classList.contains('disabled')) break;
        }
        this._hilite(items[cur]);
      } else if (k === 'ArrowRight') {
        const it = cur >= 0 && findIt(items[cur]);
        if (it && it.sub && !it.disabled) { this._open_sub(it); const f = [...it.subpop.children].find(e => e.classList.contains('menuitem') && !e.hidden && !e.classList.contains('disabled')); this._hilite(f); }
        else this._open_menu((this._open + 1) % this.menus.length);
      } else if (k === 'ArrowLeft') {
        if (curPop !== m.pop) { curPop.classList.remove('open'); this._subOpen = null; }
        else this._open_menu((this._open - 1 + this.menus.length) % this.menus.length);
      } else if (k === 'Enter' || k === ' ') {
        const it = cur >= 0 && findIt(items[cur]);
        if (it) { if (it.sub) { this._open_sub(it); this._hilite([...it.subpop.children].find(e => e.classList.contains('menuitem') && !e.hidden)); } else this._activate(it); }
      } else if (k.length === 1) {
        const it = items.map(findIt).find(i => i && i.key === k.toLowerCase() && !i.disabled);
        if (it) { if (it.sub) this._open_sub(it); else this._activate(it); }
      } else if (k === 'F10' || k === 'Alt') this._close_menus();
      ev.preventDefault(); ev.stopPropagation();
    },
    _find_item(el) {
      for (const id in this.menuItems) if (this.menuItems[id].el === el) return this.menuItems[id];
      for (const v of (this.menuItems.viewmode.sub || [])) if (v.el === el) return v;
      return null;
    },
    _match_accel(spec, ev) {
      const parts = spec.split('+');
      let key = parts.pop();
      if (key === '') key = '+';
      const need = { ctrl: parts.includes('Ctrl'), shift: parts.includes('Shift'), alt: parts.includes('Alt') };
      const map = { Plus: ['+', '='], Minus: ['-', '_'], Enter: ['Enter'], Delete: ['Delete'], Backspace: ['Backspace'], F11: ['F11'], '=': ['='] };
      const keys = map[key] || [key.toLowerCase()];
      const evk = ev.key.length === 1 ? ev.key.toLowerCase() : ev.key;
      const codeKey = ev.code && ev.code.startsWith('Key') ? ev.code.slice(3).toLowerCase() : null;
      if (!keys.includes(evk) && !(codeKey && keys.includes(codeKey))) return false;
      const ctrl = ev.ctrlKey || ev.metaKey;
      if (ctrl !== need.ctrl) return false;
      if (key !== 'Plus' && key !== 'Minus' && ev.shiftKey !== need.shift) return false;
      // Ctrl+Alt+X is accepted as an alternative to Ctrl+X (for browser-reserved shortcuts)
      if (ev.altKey && !need.alt && !need.ctrl) return false;
      return true;
    },

    /* ------------------------------------------------------------ */
    /* Soft keys                                                    */
    /* ------------------------------------------------------------ */
    _build_softkeys() {
      const mk = (icon, label, fn) => {
        const b = h('button.softbutton', { type: 'button', tabindex: '-1' }, h('span.sk-icon', { html: ICONS[icon] }), h('span.sk-label', { text: label }));
        b.addEventListener('mousedown', ev => ev.preventDefault());
        b.addEventListener('click', ev => fn(ev));
        return b;
      };
      this.button0 = mk('add', _('New Entry'), () => this.handler_newentry());
      return h('div#box_buttons', {},
        this.button0,
        mk('view', _('View'), () => this.switch_view()),
        mk('goto', _('Go To'), () => this.dialog_goto()),
        mk('zoom', _('Zoom'), ev => this.zoom((ev.shiftKey || ev.ctrlKey) ? -1 : 1)));
    },

    /* ------------------------------------------------------------ */
    /* Keyboard                                                     */
    /* ------------------------------------------------------------ */
    keypress(ev) {
      if (PG.Dialog.isOpen()) return;
      if (this._open !== null && this._open !== undefined) { this._menu_key(ev); return; }
      const tgt = ev.target;
      if (tgt && (tgt.tagName === 'INPUT' || tgt.tagName === 'TEXTAREA' || tgt.tagName === 'SELECT')) return;
      // F10 / Alt+mnemonic open menus
      if (ev.key === 'F10' && !ev.ctrlKey && !ev.shiftKey) { ev.preventDefault(); this._open_menu(0); this._hilite_first(); return; }
      if (ev.altKey && !ev.ctrlKey && !ev.metaKey && ev.key.length === 1) {
        const k = (ev.code && ev.code.startsWith('Key')) ? ev.code.slice(3).toLowerCase() : ev.key.toLowerCase();
        const mi = this.menus.findIndex(m => m.key === k);
        if (mi >= 0) { ev.preventDefault(); this._open_menu(mi); this._hilite_first(); return; }
      }
      // accelerators (clipboard ones are left to the native copy/cut/paste events)
      for (const a of this.accels) {
        if (this._match_accel(a.spec, ev)) {
          if (['copy', 'cut', 'paste'].includes(a.it.id) && !ev.altKey) return;
          ev.preventDefault();
          if (a.it.id && a.it.id.startsWith('stat-')) {
            // Shift+Ctrl+C means Confirmed for events, Completed for todos
            const en = this.views[this._view_idx].get_cursor_entry();
            if (a.spec === 'Shift+Ctrl+C') { if (en) this.handler_stat_toggle(Cal.isTodo(en) ? 'COMPLETED' : 'CONFIRMED'); return; }
            if (!a.it.el.hidden && !a.it.disabled && !this.menuItems['set-status'].disabled) a.it.fn();
            return;
          }
          if (!a.it.disabled) a.it.fn();
          return;
        }
      }
      for (const v of this.menuItems.viewmode.sub || []) {
        if (this._match_accel(v.accel, ev)) { ev.preventDefault(); v.fn(); return; }
      }
      if (ev.ctrlKey || ev.metaKey) return; // leave other browser shortcuts alone
      if (this._plus_minus_zoom && !ev.altKey) {
        if (ev.key === '+') { ev.preventDefault(); this.zoom(1); return; }
        if (ev.key === '-') { ev.preventDefault(); this.zoom(-1); return; }
      }
      if (ev.key === 'Escape') {
        ev.preventDefault();
        if (this._toggle_view_idx >= 0) this.switch_view(this._toggle_view_idx);
        return;
      }
      if (ev.key === 'Tab') return;
      if (this.views[this._view_idx].keypress(ev)) ev.preventDefault();
    },
    _hilite_first() {
      const m = this.menus[this._open];
      const f = [...m.pop.children].find(e => e.classList.contains('menuitem') && !e.hidden && !e.classList.contains('disabled'));
      this._hilite(f);
    },

    set_menu_elts(o) {
      const on_event = !!o.on_event, on_todo = !!o.on_todo, ro = !!o.read_only;
      for (const id of ['copy', 'show-props']) this._sens(id, on_event || on_todo);
      for (const id of ['cut', 'delete', 'set-status']) this._sens(id, !ro && (on_event || on_todo));
      for (const id of ['edit-time', 'edit-reps', 'edit-alarm', 'edit-details']) this._sens(id, !ro && on_event);
      this._sens('paste', !!o.can_create_here);
      if (on_event) {
        ['stat-confirmed', 'stat-tentative'].forEach(id => this._show(id, true));
        ['stat-needsaction', 'stat-inprocess', 'stat-completed'].forEach(id => this._show(id, false));
      } else if (on_todo) {
        ['stat-confirmed', 'stat-tentative'].forEach(id => this._show(id, false));
        ['stat-needsaction', 'stat-inprocess', 'stat-completed'].forEach(id => this._show(id, true));
      }
    },

    /* ------------------------------------------------------------ */
    /* Views                                                        */
    /* ------------------------------------------------------------ */
    view_redraw(en_changes) { this.views[this._view_idx].redraw(!!en_changes); },
    switch_view(idx, redraw) {
      if (idx === undefined || idx === null) {
        this._toggle_view_idx = this._view_idx;
        this._view_idx = (this._view_idx + 1) % this.views.length;
      } else if (this._view_idx === idx) return;
      else { this._toggle_view_idx = this._view_idx; this._view_idx = idx; }
      this.eventbox.innerHTML = '';
      const nv = this.views[this._view_idx];
      nv.renew_display();
      this.eventbox.appendChild(this.view_widgets[this._view_idx]);
      if (redraw !== false) nv.redraw(true);
      this.eventbox.focus({ preventScroll: true });
    },
    cursor_goto_date(dt) {
      for (let i = this._view_idx; i < this._view_idx + this.views.length; i++) {
        const v = i % this.views.length;
        if (this.views[v].cursor_set_date(dt)) { if (v !== this._view_idx) this.switch_view(v, false); break; }
      }
    },
    cursor_goto_event(ev) {
      for (let i = this._view_idx; i < this._view_idx + this.views.length; i++) {
        const v = i % this.views.length;
        if (this.views[v].cursor_goto_event(ev)) { if (v !== this._view_idx) this.switch_view(v, false); break; }
      }
    },
    cursor_goto_todo(todo, list_idx) {
      for (let i = this._view_idx; i < this._view_idx + this.views.length; i++) {
        const v = i % this.views.length;
        if (this.views[v].cursor_goto_todo(todo, list_idx)) { if (v !== this._view_idx) this.switch_view(v, false); break; }
      }
    },
    cursor_date() { return this.views[this._view_idx].cursor_date(); },
    todo_titles_default_cats() { return [PG.View_Todo._list_titles, PG.View_Todo._list_default_cats]; },
    zoom(inc) { this.views[this._view_idx].zoom(inc); },
    zoom_button(ev) { this.zoom(ev.shiftKey || ev.ctrlKey ? -1 : 1); },

    /* ------------------------------------------------------------ */
    /* Handlers                                                     */
    /* ------------------------------------------------------------ */
    _cur() { return this.views[this._view_idx]; },
    handler_newevent() { PG.EventDialog.new_event(null, this._cur().cursor_date()); },
    handler_newtodo() { PG.TodoDialog.new_todo(null, this._cur().cursor_todo_list()); },
    handler_newentry() {
      if (this.create_todos && (!this.create_events || this._cur().default_entry_is_todo())) return this.handler_newtodo();
      if (this.create_events) return this.handler_newevent();
    },
    handler_import() { PG.ImportController.import_flow(); },
    handler_export() {
      const blob = new Blob([Cal.export_ics()], { type: 'text/calendar' });
      const a = h('a', { href: URL.createObjectURL(blob), download: 'pygenda.ics' });
      document.body.appendChild(a); a.click();
      setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    },
    handler_showentryprops() { const en = this._cur().get_cursor_entry(); if (en) this.dialog_showentryprops(en); },
    handler_edit(tab) { const en = this._cur().get_cursor_entry(); if (en && Cal.isEvent(en)) this.edit_or_display_event(en, tab); },
    edit_or_display_event(en, subtab) {
      if (!Cal.calendar_readonly(en)) {
        try { PG.EventDialog.edit_event(en, subtab); }
        catch (e) {
          if (e.name !== 'BeyondEdit') throw e;
          console.warn('Warning: ' + e.message + ' - showing entry properties');
          this.dialog_showentryprops(en);
        }
      } else this.dialog_showentryprops(en);
    },
    edit_or_display_todo(td, list_idx) {
      if (!Cal.calendar_readonly(td)) {
        try { PG.TodoDialog.edit_todo(td, list_idx); }
        catch (e) {
          if (e.name !== 'BeyondEdit') throw e;
          console.warn('Warning: ' + e.message + ' - showing todo properties');
          this.dialog_showentryprops(td);
        }
      } else this.dialog_showentryprops(td);
    },
    handler_stat_toggle(stat) {
      const en = this._cur().get_cursor_entry();
      if (en && !Cal.calendar_readonly(en)) { Cal.set_toggle_status_entry(en, stat); this.view_redraw(true); }
    },
    delete_request() {
      const occ = this._cur().get_cursor_occurrence();
      if (occ) {
        if (Cal.calendar_readonly(occ.en)) return;
        if (occ.en.rrule) {
          if (PG.test_anniversary(occ.en) !== 0) this.dialog_deleteanniversary(occ.en);
          else this.dialog_deleterepeatingentry(occ);
        } else this.dialog_deleteentry(occ.en);
      } else {
        const en = this._cur().get_cursor_entry();
        if (en && !Cal.calendar_readonly(en)) this.dialog_deleteentry(en);
      }
    },

    /* clipboard */
    _entry_ical(en) { return PG.ICal.serialize([en]); },
    _put_entry_on_clipboard(en, dt) {
      this._clip = JSON.parse(JSON.stringify(en));
      const txt = this._entry_ical(en);
      if (dt) { dt.setData('text/plain', txt); try { dt.setData('text/calendar', txt); } catch (e) { /* */ } return; }
      if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(txt).catch(() => {});
    },
    _clip_ok_target(ev) {
      if (PG.Dialog.isOpen()) return false;
      const t = ev.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA')) return false;
      const sel = window.getSelection && String(window.getSelection());
      return !sel;
    },
    _clip_event(ev, kind) {
      if (!this._clip_ok_target(ev)) return;
      const en = this._cur().get_cursor_entry();
      if (!en || en.summary === undefined) return;
      if (kind === 'cut') {
        if (Cal.calendar_readonly(en)) return;
        if (en.rrule) { console.warn('Warning: Cutting repeating entries not implemented'); ev.preventDefault(); return; }
      }
      ev.preventDefault();
      this._put_entry_on_clipboard(en, ev.clipboardData);
      if (kind === 'cut') { Cal.delete_entry(en); this.view_redraw(true); }
    },
    copy_request() {
      const en = this._cur().get_cursor_entry();
      if (en && en.summary !== undefined) this._put_entry_on_clipboard(en);
    },
    cut_request() {
      const en = this._cur().get_cursor_entry();
      if (en && en.summary !== undefined && !Cal.calendar_readonly(en)) {
        if (en.rrule) { console.warn('Warning: Cutting repeating entries not implemented'); return; }
        this._put_entry_on_clipboard(en);
        Cal.delete_entry(en);
        this.view_redraw(true);
      }
    },
    _paste_event(ev) {
      if (!this._clip_ok_target(ev)) return;
      ev.preventDefault();
      if (this.menuItems.paste.disabled) return;
      const cd = ev.clipboardData;
      this._paste_data(cd ? (cd.getData('text/calendar') || cd.getData('text/plain')) : null);
    },
    async paste_request() {
      let txt = null;
      try { if (navigator.clipboard && navigator.clipboard.readText) txt = await navigator.clipboard.readText(); } catch (e) { txt = null; }
      this._paste_data(txt);
    },
    _paste_data(txt) {
      const view = this._cur();
      if (txt) {
        if (/BEGIN:V(EVENT|TODO)/.test(txt)) {
          try {
            const r = PG.ICal.parse(txt);
            if (r.entries.length) { view.paste_entry(r.entries[0]); this.view_redraw(true); return; }
          } catch (e) { /* fall through */ }
        }
        const t = txt.trim().replace(/\n/g, ' ').replace(/\t/g, ' ');
        if (t) view.paste_text(t);
        return;
      }
      if (this._clip) { view.paste_entry(JSON.parse(JSON.stringify(this._clip))); this.view_redraw(true); }
    },

    /* ------------------------------------------------------------ */
    /* Dialogs                                                      */
    /* ------------------------------------------------------------ */
    _alert(title, msg) {
      const d = new PG.Dialog({ title, content: h('div.alertdialogtxt', { text: msg }), buttons: [{ label: _('Close'), response: 'close', default: true }] });
      return d.run();
    },
    show_error_alert(msg) { return this._alert(_('Error'), msg); },
    show_notice_alert(msg) { return this._alert(_('Notice'), msg); },
    async confirm(msg, okLabel) {
      const d = new PG.Dialog({ title: _('Notice'), content: h('div.alertdialogtxt', { text: msg }), buttons: [{ label: _('Cancel'), response: 'cancel' }, { label: okLabel || _('OK'), response: 'ok', default: true }] });
      return (await d.run()) === 'ok';
    },
    dialog_deleteentry(en) { return this._do_dialog_deleteentry(en, _('Delete entry:\n“{}”?')); },
    dialog_deleteanniversary(en) { return this._do_dialog_deleteentry(en, _('Delete anniversary:\n“{}”?')); },
    async _do_dialog_deleteentry(en, q) {
      const d = new PG.Dialog({
        title: _('Delete Entry'), cls: 'sparse',
        content: h('div.centerlab', { text: PG.fmt(q, en.summary !== undefined ? en.summary : ' ') }),
        buttons: [{ label: _('Cancel'), response: 'cancel' }, { label: _('Delete'), response: 'apply', default: true }],
      });
      if ((await d.run(d.btns.apply)) === 'apply') { Cal.delete_entry(en); this.view_redraw(true); }
    },
    async dialog_deleterepeatingentry(occ) {
      const cb = new PG.Combo([['one', _('Delete only this occurrence')], ['all', _('Delete all occurrences')]], { respond: 'apply' });
      cb.set_active(0);
      const d = new PG.Dialog({
        title: _('Delete Entry'), cls: 'sparse',
        content: h('div.centerlab', {},
          h('div', { text: PG.fmt(_('Delete which occurrences of\n“{}”?'), occ.en.summary !== undefined ? occ.en.summary : ' ') }),
          h('div', { text: PG.fmt(_('Selected occurrence: {}'), PG.strftime(occ.dt, PG.datefmt.text)) }),
          cb.el),
        buttons: [{ label: _('Cancel'), response: 'cancel' }, { label: _('Delete'), response: 'apply', default: true }],
      });
      const r = await d.run(cb.el);
      if (r === 'apply') {
        if (cb.get_active_id() === 'all') Cal.delete_entry(occ.en);
        else Cal.add_exdate(occ);
        this.view_redraw(true);
      }
    },
    dialog_showentryprops(en) { return PG.EntryPropertiesDialog.show(en); },
    async dialog_goto() {
      const wdate = new PG.WidgetDate(this._cur().cursor_date() || D.today());
      wdate.onchange(() => { if (wdate.get_date_or_none()) wdate.setError(false); });
      let dt = null;
      const d = new PG.Dialog({
        title: _('Go To'), cls: 'goto',
        content: h('div.gotobox', {}, wdate.el),
        buttons: [{ label: _('Cancel'), response: 'close' }, { label: '↷ ' + _('Go'), response: 'apply', default: true }],
        onresponse: r => {
          if (r !== 'apply') return true;
          dt = wdate.get_approx_date_or_none();
          if (dt) return true;
          wdate.setError(true);
          return false;
        },
      });
      const pr = d.run(wdate._elts[0]);
      requestAnimationFrame(() => wdate._elts[0].select());
      if ((await pr) === 'apply' && dt) { this.cursor_goto_date(dt); this.view_redraw(false); }
    },
    dialog_about() {
      const content = h('div.about', {},
        h('div.about-name', { text: 'Pygenda' }),
        h('div', { text: 'version ' + VERSION }),
        h('p', { text: 'A calendar/agenda application. The UI is inspired by the Agenda apps on the Psion Series 3 and Series 5 PDAs.' }),
        h('p.small', { text: 'Web/HTML port: runs entirely in the browser, storing data in localStorage. Based on Pygenda (Python/GTK3) by Matthew Lewis.' }),
        h('p', {}, _('Source code & documentation: '), h('a', { href: 'https://codeberg.org/semiprime/pygenda', target: '_blank', rel: 'noopener', text: 'https://codeberg.org/semiprime/pygenda' })),
        h('p.small', { text: 'Copyright © 2022–2026 Matthew Lewis' }),
        h('p.small', {}, 'This program comes with absolutely no warranty. See the ', h('a', { href: 'https://www.gnu.org/licenses/gpl-3.0.html', target: '_blank', rel: 'noopener', text: 'GNU General Public License, version 3 only' }), ' for details.'),
        h('p.small', { text: 'Thanks for testing & feedback: Christoph (@chaos.social@inlovewithpda), Edward Hasbrouck, Neil Sands, Snoopy' }));
      return new PG.Dialog({ title: _('_About').replace('_', '') + ' Pygenda', content, buttons: [{ label: _('Close'), response: 'close', default: true }] }).run();
    },
    toggle_fullscreen() {
      if (!document.fullscreenElement) { (document.documentElement.requestFullscreen || (() => Promise.reject()))().catch(() => {}); }
      else document.exitFullscreen().catch(() => {});
    },
    _update_fs_label() {
      const it = this.menuItems.fullscreen;
      const lab = document.fullscreenElement ? _('_Leave Fullscreen') : _('_Fullscreen');
      const ml = it.el.querySelector('.mlabel');
      ml.innerHTML = ''; ml.appendChild(this._mn_label(PG.mnemonic(lab)));
      it.key = PG.mnemonic(lab).key;
    },

    load_sample_data() {
      PG.SampleData.load();
      this.view_redraw(true);
    },
  };

  PG.GUI = GUI;
})();
