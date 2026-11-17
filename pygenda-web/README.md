# Pygenda Web

A browser port of [Pygenda](https://codeberg.org/semiprime/pygenda) – the
calendar/agenda for keyboard PDAs whose UI is inspired by the Agenda apps on
the Psion Series 3 and Series 5 – written in plain HTML/CSS/JavaScript.

* **No server, no build step, no dependencies.** Open `index.html` directly
  (double-click / `file://`) or serve the folder from any static host.
* **Data lives in the browser** (`localStorage`). Use *File ▸ Export to iCal
  File…* to back it up and *File ▸ Import File…* to bring `.ics` files in.
* Same screens, behaviour and keyboard model as the GTK original.

## What is ported

| Pygenda (Python/GTK) | Pygenda Web |
|---|---|
| Week View (two-page diary spread, fold, title area, today/past styling, cursor marker, `⟳ ✉ ♫` icons, `✦ ‣ » Ⓣ 🕯︎` bullets, end times `(→…)`, locations, anniversary year counts) | `js/views.js` – `View_Week` |
| Year View (37×12 grid, weekend shading, disc/loop/star/T icons and combinations, date content list, target-column cursor movement) | `View_Year` |
| Todo View (multiple configurable lists filtered by category, priority bullets ➊…➒, due dates, status styling, horizontal list navigation) | `View_Todo` |
| Event dialog: Time / Repeats / Alarms / Details tabs, timed/untimed/all-day, start-duration-end sync, yearly/anniversary/monthly/weekly/daily repeats with all "repeat on" variants, period, forever / occurrences / until (kept in sync), exception dates, alarm list (N, Delete, +/−, A/D/E keys), location, status, notes | `js/dialogs.js` – `EventDialog` |
| To-do dialog (list, calendar, priority, status, due date, notes) | `TodoDialog` |
| Delete / delete-occurrence / delete-anniversary, Go To, Find, Entry properties, Import (entry-by-entry), About | `js/gui.js`, `js/dialogs.js` |
| Date/time/duration widgets (segmented fields, `+ - < >` and Shift+↑/↓, separators, `y m d` / `h m` shortcuts) and Pygenda's combo/spin/switch key handling | `js/widgets.js` |
| Menus with mnemonics + accelerators, soft buttons (New Entry, View, Go To, Zoom), Esc toggles last two views, `+`/`−` zoom (5 levels per view), Space = today toggle, typing starts a new entry, cut/copy/paste of entries as iCalendar, status toggles, swipe gestures | `js/gui.js` |
| iCal file / CalDAV / EDS storage | `localStorage` + iCal import/export (`js/calendar.js`, `js/ical.js`) |
| `dateutil.rrule` | `js/rrule.js` (verified against dateutil on ~1500 random rules) |
| `user.ini` + user CSS | *File ▸ Preferences…* (language, 24 h, week start, date format, soft-button position, dark mode, calendars with colours, to-do lists, …) and an optional user stylesheet in `localStorage['pygenda.usercss']` |

The user interface is available in English and Spanish (automatic from the
browser language, or chosen in Preferences).

## Keyboard summary

| Key | Action |
|---|---|
| Arrows | Move cursor (views) / move between fields (dialogs) |
| Shift+↑/↓ | Year View: move between entries of the day; dialogs: change value |
| Space | Toggle between today and the previous cursor position |
| Enter | Edit entry under cursor (or create one) |
| any printable key | Start a new entry with that text |
| Esc | Toggle between the last two views |
| `+` / `−` | Zoom in / out |
| Delete / Backspace | Delete entry |
| Ctrl+N / Ctrl+M | New event / new to-do |
| Ctrl+T/R/A/D | Edit time / repeats / alarms / details |
| Ctrl+Enter | Entry properties |
| Shift+Ctrl+N/C/A/P/X/U | Status: none / confirmed-or-completed / action required / in progress / cancelled / tentative |
| Shift+Ctrl+V, Shift+Ctrl+W/Y/T | Switch view, Week/Year/Todo view |
| Ctrl+G, Ctrl+F | Go To, Find |
| F10, Alt+letter | Open menus |

Browsers reserve some shortcuts (e.g. Ctrl+N, Ctrl+T, Shift+Ctrl+W). Every
`Ctrl+X` accelerator also works as `Ctrl+Alt+X`, and all actions are in the
menus.

## Notes / differences

* Times are stored as "floating" local times. Imported UTC and `TZID` times are
  converted to the browser's time zone on import.
* As in Pygenda, alarms are stored but **not** sounded/displayed.
* Data is per browser/profile. Clearing site data deletes it – export regularly.
* Find results can be clicked to jump to the entry (a small addition).

## Licence

Pygenda is Copyright © 2022–2026 Matthew Lewis and licensed under the GNU
General Public License, version 3 only. This port is a derivative work and is
distributed under the same licence – see `COPYING`.
