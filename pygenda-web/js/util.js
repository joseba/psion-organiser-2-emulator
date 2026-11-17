/*
  util.js – Pygenda Web
  Port of pygenda_util.py / pygenda_config.py to the browser.
  Pygenda: Copyright (C) 2022-2026 Matthew Lewis (GPL-3.0-only)
  This web port is distributed under the same licence (see COPYING).
*/
'use strict';
var PG = window.PG || (window.PG = {});

/* ------------------------------------------------------------------ */
/* Safe localStorage                                                   */
/* ------------------------------------------------------------------ */
PG.storage = {
  get(key) {
    try { return window.localStorage.getItem(key); } catch (e) { return null; }
  },
  set(key, val) {
    try { window.localStorage.setItem(key, val); return true; } catch (e) { return false; }
  },
  remove(key) {
    try { window.localStorage.removeItem(key); } catch (e) { /* ignore */ }
  },
};

/* ------------------------------------------------------------------ */
/* Config (replaces ~/.config/pygenda/user.ini)                        */
/* ------------------------------------------------------------------ */
PG.Config = {
  KEY: 'pygenda.config',
  _defaults: {},
  _user: {},
  set_defaults(section, obj) {
    this._defaults[section] = Object.assign(this._defaults[section] || {}, obj);
  },
  load() {
    const raw = PG.storage.get(this.KEY);
    if (raw) {
      try { this._user = JSON.parse(raw) || {}; } catch (e) { this._user = {}; }
    }
  },
  save() {
    PG.storage.set(this.KEY, JSON.stringify(this._user));
  },
  get(section, key) {
    if (this._user[section] && key in this._user[section]) return this._user[section][key];
    if (this._defaults[section] && key in this._defaults[section]) return this._defaults[section][key];
    return null;
  },
  get_bool(section, key) {
    const v = this.get(section, key);
    if (typeof v === 'string') return ['1', 'true', 'yes', 'on'].includes(v.toLowerCase());
    return !!v;
  },
  get_int(section, key) {
    const v = this.get(section, key);
    if (v === null || v === undefined || v === '') return null;
    const n = parseInt(v, 10);
    return isNaN(n) ? null : n;
  },
  set(section, key, val) {
    if (!this._user[section]) this._user[section] = {};
    this._user[section][key] = val;
  },
  section(section) {
    return Object.assign({}, this._defaults[section] || {}, this._user[section] || {});
  },
};
PG.Config.load();

/* ------------------------------------------------------------------ */
/* i18n – English source strings, Spanish translation                 */
/* ------------------------------------------------------------------ */
PG.I18N = {
  es: {
    '_File': '_Archivo', '_Import File…': '_Importar archivo…', '_Export to iCal File…': '_Exportar a archivo iCal…',
    '_Preferences…': '_Preferencias…', '_Quit': '_Salir',
    '_Edit': '_Editar', 'Cu_t': 'Cor_tar', '_Copy': '_Copiar', '_Paste': '_Pegar', '_Delete…': '_Borrar…',
    'E_ntry': 'E_ntrada', '_New Event…': '_Nuevo evento…', 'New _To-do…': 'Nueva _tarea…',
    'Show _Properties': 'Mostrar _propiedades', 'Edit _Time…': 'Editar _hora…', 'Edit _Repeats…': 'Editar _repeticiones…',
    'Edit _Alarms…': 'Editar _alarmas…', 'Edit _Details…': 'Editar _detalles…', 'Set _Status': 'Fijar _estado',
    '_None': '_Ninguno', '_Confirmed': '_Confirmado', '_Action required': '_Acción requerida', 'In _progress': 'En _curso',
    '_Completed': '_Completado', 'Cance_lled': 'Cance_lado', '_Tentative': '_Provisional',
    '_View': '_Ver', '_View Mode': '_Modo de vista', 'Switch _View': 'Cambiar _vista', 'Zoom _In': '_Ampliar',
    'Zoom _Out': '_Reducir', '_Fullscreen': '_Pantalla completa', '_Leave Fullscreen': '_Salir de pantalla completa',
    '_Tools': '_Herramientas', '_Go To…': '_Ir a…', '_Find…': '_Buscar…', '_Help': 'Ay_uda', '_About': '_Acerca de',
    '_Week View': 'Vista _semanal', '_Year View': 'Vista _anual', '_Todo View': 'Vista de _tareas',
    'week_view_accel': 's', 'year_view_accel': 'a', 'todo_view_accel': 't',
    'New Entry': 'Nueva entrada', 'View': 'Vista', 'Go To': 'Ir a', 'Zoom': 'Zoom',
    'Week {}': 'Semana {}', 'Week 53/Week 1': 'Semana 53/Semana 1',
    'Error': 'Error', 'Notice': 'Aviso', 'Close': 'Cerrar', 'Cancel': 'Cancelar', 'OK': 'Aceptar', 'Delete': 'Borrar',
    'Go': 'Ir', 'Delete Entry': 'Borrar entrada', 'Delete entry:\n“{}”?': '¿Borrar la entrada:\n“{}”?',
    'Delete anniversary:\n“{}”?': '¿Borrar el aniversario:\n“{}”?',
    'Delete which occurrences of\n“{}”?': '¿Qué repeticiones borrar de\n“{}”?',
    'Selected occurrence: {}': 'Repetición seleccionada: {}',
    'Delete only this occurrence': 'Borrar solo esta repetición', 'Delete all occurrences': 'Borrar todas las repeticiones',
    'Event': 'Evento', 'New Event': 'Nuevo evento', 'Edit Event': 'Editar evento',
    'To-do': 'Tarea', 'New To-do': 'Nueva tarea', 'Edit To-do': 'Editar tarea',
    'Description:': 'Descripción:', 'Date:': 'Fecha:', 'Calendar:': 'Calendario:', 'Timed event:': 'Evento con hora:',
    'No': 'No', 'Yes': 'Sí', 'All day': 'Todo el día', 'Start time:': 'Hora de inicio:', 'Duration:': 'Duración:',
    'End time:': 'Hora de fin:', 'Days:': 'Días:', 'Time': 'Hora', 'Repeats:': 'Repeticiones:', 'None': 'Ninguno',
    'Yearly': 'Anual', 'Anniversary': 'Aniversario', 'Monthly': 'Mensual', 'Weekly': 'Semanal', 'Daily': 'Diaria',
    'Hourly': 'Cada hora', 'Minutely': 'Cada minuto', 'Secondly': 'Cada segundo',
    'Repeat on:': 'Repetir el:', 'Period:': 'Periodo:', 'Repeat Forever:': 'Repetir siempre:', 'Occurrences:': 'Repeticiones:',
    'Until:': 'Hasta:', 'Exceptions:': 'Excepciones:', 'Repeats': 'Repeticiones', 'Alarm(s) set:': 'Alarma(s):',
    'Understood': 'Entendido', 'Alarms': 'Alarmas', 'Location:': 'Lugar:', 'Status:': 'Estado:', 'Tentative': 'Provisional',
    'Confirmed': 'Confirmado', 'Cancelled': 'Cancelado', 'Notes:': 'Notas:', 'Details': 'Detalles',
    'To-do list:': 'Lista de tareas:', 'Priority:': 'Prioridad:', '1 (Highest)': '1 (Máxima)', '9 (Lowest)': '9 (Mínima)',
    'Action required': 'Acción requerida', 'In progress': 'En curso', 'Completed': 'Completado', 'Due date:': 'Fecha límite:',
    'Dates/Times': 'Fechas/Horas', 'Find': 'Buscar', 'Find text:': 'Texto a buscar:',
    'Note: Find functionality is placeholder': 'Nota: la búsqueda es provisional',
    'Find results': 'Resultados de la búsqueda', 'No results found': 'No se encontraron resultados',
    'Entry properties': 'Propiedades de la entrada', 'Type:': 'Tipo:', 'Todo': 'Tarea', 'Journal': 'Diario',
    'Start date:': 'Fecha de inicio:', 'Start date/time:': 'Inicio:', 'End date:': 'Fecha de fin:', 'End date/time:': 'Fin:',
    'Due date/time:': 'Fecha/hora límite:', 'Completed date/time:': 'Completado el:', 'Summary:': 'Resumen:',
    'Priority': 'Prioridad', 'Location': 'Lugar', 'interval:': 'intervalo:', 'Exception dates:': 'Fechas de excepción:',
    'By month:': 'Por mes:', 'By week number:': 'Por nº de semana:', 'By year day:': 'Por día del año:',
    'By month day:': 'Por día del mes:', 'By day:': 'Por día:', 'By hour:': 'Por hora:', 'By minute:': 'Por minuto:',
    'By second:': 'Por segundo:', 'By set position:': 'Por posición:', 'Week starts:': 'La semana empieza:',
    'Count:': 'Número:', 'Alarms:': 'Alarmas:', 'Unspecified': 'Sin especificar', 'Audio': 'Sonido', 'Display': 'Mostrar',
    'Email': 'Correo', 'URL:': 'URL:', 'Categories:': 'Categorías:', 'Description': 'Descripción',
    'Exception dates': 'Fechas de excepción', 'Add date': 'Añadir fecha', 'Remove date(s)': 'Quitar fecha(s)',
    'Note: this dialog needs refining!': 'Nota: ¡este diálogo necesita pulirse!',
    ' + {} more': ' + {} más', 'Time before event': 'Antes del evento', 'Action': 'Acción',
    'Import File': 'Importar archivo', 'Import entry': 'Importar entrada', 'Skip': 'Omitir', 'Import': 'Importar',
    'Found entry:': 'Entrada encontrada:', 'Found entry ({} of {}):': 'Entrada encontrada ({} de {}):',
    'Date/time:': 'Fecha/hora:', 'Invalid event, no date found': 'Evento no válido, sin fecha',
    'Invalid entry, no ID found': 'Entrada no válida, sin ID', 'An entry with this ID already exists': 'Ya existe una entrada con este ID',
    'No calendar available to store {}': 'No hay calendario para guardar {}', 'an event': 'un evento', 'a todo': 'una tarea',
    'Import to calendar:': 'Importar al calendario:', 'No todo list available for todo': 'No hay lista para la tarea',
    'Import into list:': 'Importar a la lista:', 'Error reading ical file': 'Error leyendo el archivo iCal',
    'No event or todo entries found': 'No se encontraron eventos ni tareas',
    'Due:': 'Vence:', 'years': 'años', 'year': 'año', 'Preferences': 'Preferencias',
    'Pygenda will <b><i>not</i></b> sound/display alarms.': 'Pygenda <b><i>no</i></b> hará sonar ni mostrará alarmas.',
    'Warning:': 'Atención:',
    'A separate alarm handler is required for alarms to activate.': 'Se necesita un gestor de alarmas aparte para que se activen.',
    '(To remove this warning, see the Preferences.)': '(Para quitar este aviso, ver Preferencias.)',
    'Days: {}': 'Días: {}',
    '1st {month}': '1 de {month}', '{ord} {month}': '{card} de {month}',
    '{ord} {day} of {month}': '{ord} {day} de {month}', 'Last {day} of {month}': 'Último {day} de {month}',
    '{ord} to last {day} of {month}': '{ord} {day} empezando por el final de {month}',
    '1st day of month': 'Día 1 del mes', '{ord} day of month': 'Día {card} del mes', 'Last day of month': 'Último día del mes',
    '{} to last day of month': '{} día empezando por el final del mes', '{ord} {day} of month': '{ord} {day} del mes',
    'Last {day} of month': 'Último {day} del mes', '{ord} to last {day} of month': '{ord} {day} empezando por el final del mes',
    'Source code & documentation: ': 'Código fuente y documentación: ',
    'Language:': 'Idioma:', 'Automatic': 'Automático', '24-hour clock:': 'Reloj de 24 horas:',
    'Week starts on:': 'La semana empieza en:', 'Date order:': 'Orden de fecha:', 'Date separator:': 'Separador de fecha:',
    'Time separator:': 'Separador de hora:', 'Soft buttons:': 'Botones laterales:', 'Right': 'Derecha', 'Left': 'Izquierda',
    'Hidden': 'Ocultos', 'Show button icons:': 'Mostrar iconos de botones:', 'Dark mode:': 'Modo oscuro:',
    '+/− keys zoom:': 'Teclas +/− hacen zoom:', 'Show alarm warning:': 'Mostrar aviso de alarmas:',
    'Default alarm before event:': 'Alarma por defecto antes del evento:',
    'Alarm email address:': 'Correo para alarmas:',
    'Week View: show ongoing events:': 'Vista semanal: eventos en curso:', 'First day only': 'Solo el primer día',
    'Every day': 'Todos los días', 'Show event location:': 'Mostrar lugar del evento:', 'Always': 'Siempre', 'Never': 'Nunca',
    'Show to-dos in Week/Year View:': 'Tareas en vistas semanal/anual:', 'Calendars': 'Calendarios',
    'To-do lists': 'Listas de tareas', 'General': 'General', 'Name': 'Nombre', 'Colour': 'Color', 'Stores': 'Guarda',
    'Read-only': 'Solo lectura', 'Show in Year grid': 'En rejilla anual', 'All': 'Todo', 'Events': 'Eventos',
    'To-dos': 'Tareas', 'Title': 'Título', 'Filter (category)': 'Filtro (categoría)', 'Add calendar': 'Añadir calendario',
    'Add list': 'Añadir lista', 'Remove': 'Quitar', 'Up': 'Subir', 'Down': 'Bajar',
    '(any)': '(cualquiera)', '(uncategorised)': '(sin categoría)', 'Startup view:': 'Vista inicial:',
    'Delete all data…': 'Borrar todos los datos…', 'Delete ALL calendar data stored in this browser?': '¿Borrar TODOS los datos de calendario guardados en este navegador?',
    'Changes to some settings take effect after reloading.': 'Algunos cambios se aplican tras recargar la página.',
    'Data is stored only in this browser (localStorage). Use File ▸ Export to back it up.':
      'Los datos se guardan solo en este navegador (localStorage). Usa Archivo ▸ Exportar para hacer copia.',
    'Imported {} entries': 'Importadas {} entradas', 'Storage full – could not save data!': '¡Almacenamiento lleno: no se pudieron guardar los datos!',
    'Load sample data': 'Cargar datos de ejemplo', 'Your agenda is empty.': 'Tu agenda está vacía.',
    'Start typing to create an entry, or': 'Empieza a escribir para crear una entrada, o',
  },
};
PG.lang = 'en';
(function initLang() {
  const conf = PG.Config.get('global', 'language');
  let l = conf || (navigator.language || 'en');
  l = String(l).toLowerCase().slice(0, 2);
  PG.lang = PG.I18N[l] ? l : 'en';
  document.documentElement.lang = PG.lang;
})();

/* gettext: returns translated string. Supports '{}' positional and '{name}' named params */
function _(s) {
  const t = PG.I18N[PG.lang];
  return (t && Object.prototype.hasOwnProperty.call(t, s)) ? t[s] : s;
}
PG._ = _;
PG.fmt = function (s, ...args) {
  let i = 0;
  if (args.length === 1 && args[0] && typeof args[0] === 'object') {
    const o = args[0];
    return s.replace(/\{(\w*)\}/g, (m, k) => (k === '' ? (o[i++] ?? '') : (k in o ? o[k] : m)));
  }
  return s.replace(/\{\}/g, () => (i < args.length ? String(args[i++]) : ''));
};
/* Strip GTK-style mnemonic underscore, returning {text, key} */
PG.mnemonic = function (s) {
  const i = s.indexOf('_');
  if (i < 0) return { text: s, key: null, idx: -1 };
  return { text: s.slice(0, i) + s.slice(i + 1), key: s.charAt(i + 1).toLowerCase(), idx: i };
};

/* ------------------------------------------------------------------ */
/* Locale guessing (replaces nl_langinfo based functions)              */
/* ------------------------------------------------------------------ */
function guess_date_ord_from_locale() {
  try {
    const parts = new Intl.DateTimeFormat(navigator.language).formatToParts(new Date(3333, 10, 22));
    let ret = '';
    for (const p of parts) {
      if (p.type === 'year') ret += 'Y';
      else if (p.type === 'month') ret += 'M';
      else if (p.type === 'day') ret += 'D';
    }
    return ret.length === 3 ? ret : 'YMD';
  } catch (e) { return 'YMD'; }
}
function guess_date_sep_from_locale() {
  try {
    const parts = new Intl.DateTimeFormat(navigator.language).formatToParts(new Date(1111, 10, 11));
    const lit = parts.find(p => p.type === 'literal');
    return lit ? lit.value.trim() || '-' : '-';
  } catch (e) { return '-'; }
}
function guess_24hr_from_locale() {
  try {
    const o = new Intl.DateTimeFormat(navigator.language, { hour: 'numeric' }).resolvedOptions();
    return o.hourCycle ? (o.hourCycle === 'h23' || o.hourCycle === 'h24') : !o.hour12;
  } catch (e) { return true; }
}

PG.Config.set_defaults('global', {
  language: '',
  date_ord: guess_date_ord_from_locale(),
  date_sep: guess_date_sep_from_locale(),
  time_sep: ':',
  date_fmt_text: '',
  date_fmt_text_noyear: '',
  date_fmt_textabb: '',
  date_fmt_textabb_noyear: '',
  '24hr': guess_24hr_from_locale(),
  start_week_day: 0, // 0 = Monday, 6 = Sunday
  tab_elts_datetime: false,
  plus_minus_zoom: true,
  dark_mode: false,
});
PG.Config.set_defaults('startup', { view: '', fullscreen: false });
PG.Config.set_defaults('softkeys', { display: '', show_icons: true });

/* ------------------------------------------------------------------ */
/* Day / month names                                                   */
/* ------------------------------------------------------------------ */
(function initNames() {
  const loc = PG.lang === 'es' ? 'es-ES' : 'en-GB';
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const strip = s => s.replace(/\.$/, '');
  // Index 0 = Monday (Python calendar convention)
  PG.day_name = []; PG.day_abbr = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(2024, 0, 1 + i); // 2024-01-01 is Monday
    PG.day_name.push(new Intl.DateTimeFormat(loc, { weekday: 'long' }).format(d));
    PG.day_abbr.push(strip(new Intl.DateTimeFormat(loc, { weekday: 'short' }).format(d)));
  }
  PG.month_name = ['']; PG.month_abbr = [''];
  for (let m = 0; m < 12; m++) {
    const d = new Date(2024, m, 1);
    PG.month_name.push(new Intl.DateTimeFormat(loc, { month: 'long' }).format(d));
    PG.month_abbr.push(strip(new Intl.DateTimeFormat(loc, { month: 'short' }).format(d)).slice(0, 4).replace(/\.$/, ''));
  }
  if (PG.lang === 'en') PG.month_abbr = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  PG.cap = cap;
})();

/* ------------------------------------------------------------------ */
/* Date helpers.                                                       */
/* Dates are JS Date objects in local time. "Date-only" values are     */
/* local midnight and carry isDate=true where the distinction matters. */
/* ------------------------------------------------------------------ */
PG.D = {
  today() { const n = new Date(); return new Date(n.getFullYear(), n.getMonth(), n.getDate()); },
  date(y, m, d) { return new Date(y, m - 1, d); },          // m: 1-12
  dayStart(dt) { return new Date(dt.getFullYear(), dt.getMonth(), dt.getDate()); },
  addDays(dt, n) { const r = new Date(dt.getTime()); r.setDate(r.getDate() + n); return r; },
  addSecs(dt, s) { return new Date(dt.getTime() + s * 1000); },
  sameDay(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate(); },
  cmp(a, b) { return a.getTime() - b.getTime(); },
  weekday(dt) { return (dt.getDay() + 6) % 7; },        // Monday = 0
  daysInMonth(y, m) { return new Date(y, m, 0).getDate(); }, // m: 1-12
  monthrange(y, m) { return [PG.D.weekday(new Date(y, m - 1, 1)), PG.D.daysInMonth(y, m)]; },
  dayDiff(a, b) { // whole days b - a (dates)
    return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000);
  },
  yday(dt) { return PG.D.dayDiff(new Date(dt.getFullYear(), 0, 1), dt) + 1; },
  key(dt) { return dt.getFullYear() * 10000 + (dt.getMonth() + 1) * 100 + dt.getDate(); },
  isMidnight(dt) { return dt.getHours() === 0 && dt.getMinutes() === 0 && dt.getSeconds() === 0; },
  pad(n, w) { return String(n).padStart(w || 2, '0'); },
};

/* iCal-style value strings <-> {dt, isDate} */
PG.ical_dt = {
  parse(s) {
    if (!s) return null;
    const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?)?/.exec(s);
    if (!m) return null;
    if (m[4] === undefined) return { dt: new Date(+m[1], +m[2] - 1, +m[3]), isDate: true };
    return { dt: new Date(+m[1], +m[2] - 1, +m[3], +m[4], +m[5], +(m[6] || 0)), isDate: false };
  },
  fromDate(dt) { const p = PG.D.pad; return `${dt.getFullYear()}${p(dt.getMonth() + 1)}${p(dt.getDate())}`; },
  fromDateTime(dt) {
    const p = PG.D.pad;
    return `${PG.ical_dt.fromDate(dt)}T${p(dt.getHours())}${p(dt.getMinutes())}${p(dt.getSeconds())}`;
  },
  make(dt, isDate) { return isDate ? PG.ical_dt.fromDate(dt) : PG.ical_dt.fromDateTime(dt); },
  utcStamp(dt) {
    const p = PG.D.pad; dt = dt || new Date();
    return `${dt.getUTCFullYear()}${p(dt.getUTCMonth() + 1)}${p(dt.getUTCDate())}T${p(dt.getUTCHours())}${p(dt.getUTCMinutes())}${p(dt.getUTCSeconds())}Z`;
  },
};

/* An "Occurrence": entry + start date/time */
PG.Occurrence = class {
  constructor(en, dt, isDate) { this.en = en; this.dt = dt; this.isDate = !!isDate; }
};

/* Comparisons following Pygenda's dt_lt / dt_lte (dates compare as local midnight) */
PG.dt_lt = (a, b) => a.getTime() < b.getTime();
PG.dt_lte = (a, b) => a.getTime() <= b.getTime();

/* datetime_to_time: returns false for date-only */
PG.is_timed = occ => !occ.isDate;

/* ------------------------------------------------------------------ */
/* Formatting                                                          */
/* ------------------------------------------------------------------ */
PG.format_time = function (dt) {
  const hs = PG.Config.get('global', 'time_sep');
  if (PG.Config.get_bool('global', '24hr')) return PG.D.pad(dt.getHours()) + hs + PG.D.pad(dt.getMinutes());
  const h = dt.getHours();
  return ((h + 11) % 12 + 1) + hs + PG.D.pad(dt.getMinutes()) + (h > 11 ? 'pm' : 'am');
};
PG.format_compact_time = function (dt) {
  const hs = PG.Config.get('global', 'time_sep');
  if (PG.Config.get_bool('global', '24hr')) return PG.D.pad(dt.getHours()) + hs + PG.D.pad(dt.getMinutes());
  const h = dt.getHours();
  const ampm = h > 11 ? 'pm' : 'am';
  if (dt.getMinutes()) return ((h + 11) % 12 + 1) + hs + PG.D.pad(dt.getMinutes()) + ampm;
  return ((h + 11) % 12 + 1) + ampm;
};
PG.format_compact_date = function (dt, show_year) {
  let s = `${PG.day_abbr[PG.D.weekday(dt)]} ${dt.getDate()} ${PG.month_abbr[dt.getMonth() + 1]}`;
  if (show_year) s += `, ${dt.getFullYear()}`;
  return s;
};
PG.format_compact_datetime = function (dt, show_year) {
  return PG.format_compact_date(dt, show_year) + ', ' + PG.format_compact_time(dt);
};

/* Minimal strftime: %A %a %B %b %d %-d %e %m %-m %Y %y %H %M %% */
PG.strftime = function (dt, fmt) {
  const p = PG.D.pad;
  return fmt.replace(/%(-?)([AaBbdemYyHM%])/g, (m, dash, c) => {
    switch (c) {
      case 'A': return PG.day_name[PG.D.weekday(dt)];
      case 'a': return PG.day_abbr[PG.D.weekday(dt)];
      case 'B': return PG.month_name[dt.getMonth() + 1];
      case 'b': return PG.month_abbr[dt.getMonth() + 1];
      case 'd': return dash ? String(dt.getDate()) : p(dt.getDate());
      case 'e': return String(dt.getDate());
      case 'm': return dash ? String(dt.getMonth() + 1) : p(dt.getMonth() + 1);
      case 'Y': return String(dt.getFullYear());
      case 'y': return p(dt.getFullYear() % 100);
      case 'H': return p(dt.getHours());
      case 'M': return p(dt.getMinutes());
      case '%': return '%';
    }
    return m;
  });
};

/* Date formats (GUI._init_date_format) */
PG.datefmt = {};
PG.init_date_format = function () {
  const C = PG.Config;
  const raw = String(C.get('global', 'date_ord') || 'YMD').toUpperCase();
  let ord = '';
  for (const ch of raw) if ('YMD'.includes(ch) && !ord.includes(ch)) ord += ch;
  if (ord.length !== 3) ord = 'YMD';
  PG.datefmt.order = ord;
  const sep = C.get('global', 'date_sep');
  const map = { Y: '%Y', M: '%m', D: '%d' };
  PG.datefmt.numeric = ord.split('').map(c => map[c]).join(sep);
  const deftext = PG.lang === 'es' ? '%A, %-d de %B de %Y' : '%A %-d %B %Y';
  const deftext_noyear = PG.lang === 'es' ? '%A %-d de %B' : '%A %-d %B';
  const t = C.get('global', 'date_fmt_text') || deftext;
  PG.datefmt.text = t;
  PG.datefmt.text_noyear = C.get('global', 'date_fmt_text_noyear') ||
    (C.get('global', 'date_fmt_text') ? t.replace(/%y/g, '%Y').replace(/%Y,/g, ' ').replace(/, %Y/g, ' ').replace(/( de)? %Y/g, '').split(/\s+/).join(' ').trim() : deftext_noyear);
  PG.datefmt.textabb = C.get('global', 'date_fmt_textabb') || t.replace(/%A/g, '%a').replace(/%B/g, '%b');
  PG.datefmt.textabb_noyear = C.get('global', 'date_fmt_textabb_noyear') ||
    PG.datefmt.textabb.replace(/%y/g, '%Y').replace(/%Y,/g, ' ').replace(/, %Y/g, ' ').replace(/( de)? %Y/g, '').split(/\s+/).join(' ').trim();
};

/* Week helpers (depend on start_week_day) */
PG.day_in_week = function (dt) {
  const st = PG.Config.get_int('global', 'start_week_day') || 0;
  return ((PG.D.weekday(dt) - st) % 7 + 7) % 7;
};
PG.start_of_week = dt => PG.D.addDays(PG.D.dayStart(dt), -PG.day_in_week(dt));

/* parse "15m", "1h30m", "2d" etc → seconds */
PG.parse_timedelta = function (s) {
  const MAP = { d: 86400, h: 3600, m: 60, s: 1 };
  s = String(s || '').toLowerCase();
  let td = 0;
  const re = /(-?\d+)\s*([dhms])/g;
  let m;
  while ((m = re.exec(s))) td += parseInt(m[1], 10) * MAP[m[2]];
  return td;
};
/* Python-like str(timedelta) */
PG.str_timedelta = function (secs) {
  let neg = secs < 0;
  if (neg) {
    // Python shows e.g. "-1 day, 23:45:00" for -15 minutes
    const days = Math.floor(secs / 86400);
    const rem = secs - days * 86400;
    return `${days} day${Math.abs(days) !== 1 ? 's' : ''}, ${PG.str_timedelta(rem)}`;
  }
  const d = Math.floor(secs / 86400); secs -= d * 86400;
  const h = Math.floor(secs / 3600); secs -= h * 3600;
  const m = Math.floor(secs / 60); const s = secs - m * 60;
  const hms = `${h}:${PG.D.pad(m)}:${PG.D.pad(s)}`;
  return d ? `${d} day${d !== 1 ? 's' : ''}, ${hms}` : hms;
};
/* Friendlier display for alarm offsets (−0:15:00 style used in properties dialog) */
PG.str_alarm_before = function (secs) {
  return PG.str_timedelta(-secs);
};

/* Ordinals (num2words ordinal_num replacement) */
PG.ordinal = function (n) {
  if (PG.lang === 'es') return n + 'º';
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
};

PG.escapeHTML = function (s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
};

/* DOM helper: h('div.cls#id', {attrs}, children...) */
PG.h = function (tag, attrs, ...children) {
  let m = /^([a-z0-9-]+)?((?:[.#][\w-]+)*)$/i.exec(tag);
  const el = document.createElement(m && m[1] ? m[1] : 'div');
  if (m && m[2]) {
    m[2].replace(/([.#])([\w-]+)/g, (x, t, n) => { if (t === '.') el.classList.add(n); else el.id = n; });
  }
  if (attrs) {
    for (const k in attrs) {
      const v = attrs[k];
      if (v === null || v === undefined || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'text') el.textContent = v;
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'class') el.className += (el.className ? ' ' : '') + v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, v);
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.appendChild(typeof c === 'string' || typeof c === 'number' ? document.createTextNode(String(c)) : c);
  }
  return el;
};

/* Unique ID like uuid1 */
PG.gen_uid = function () {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0; return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
  });
};
