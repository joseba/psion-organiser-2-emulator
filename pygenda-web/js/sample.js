/*
  sample.js – Pygenda Web
  Example entries (similar in spirit to test/maketest_example.py), relative to
  the current date so there is always something to look at.
  GPL-3.0-only (see COPYING).
*/
'use strict';

PG.SampleData = {
  load() {
    const D = PG.D, F = PG.ical_dt;
    const today = D.today();
    const Y = today.getFullYear();
    const sow = D.addDays(today, -D.weekday(today)); // Monday this week
    const at = (d, hh, mm) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), hh, mm || 0);
    const stamp = F.utcStamp();
    const list = [];
    let n = 0;
    const ev = (o) => {
      const en = Object.assign({ kind: 'VEVENT', cal: 0, uid: 'pygenda-web-sample-' + (++n) + '-' + Date.now().toString(36), dtstamp: stamp, created: stamp }, o);
      list.push(en);
      return en;
    };
    const td = (o) => ev(Object.assign({ kind: 'VTODO' }, o));
    const es = PG.lang === 'es';
    const T = (en, sp) => (es ? sp : en);

    // Repeating timed events
    ev({ summary: T('Team meeting', 'Reunión de equipo'), dtstart: F.fromDateTime(at(sow, 10, 30)), duration: 1800, rrule: { FREQ: ['WEEKLY'] }, location: T('Room 2', 'Sala 2') });
    ev({ summary: T('Spanish class', 'Clase de inglés'), dtstart: F.fromDateTime(at(D.addDays(sow, 2), 19, 30)), duration: 5400, rrule: { FREQ: ['WEEKLY'] } });
    ev({ summary: T('Guitar lesson', 'Clase de guitarra'), dtstart: F.fromDateTime(at(D.addDays(sow, 3), 19, 0)), duration: 3600, rrule: { FREQ: ['WEEKLY'], INTERVAL: [2] }, alarms: [{ trigger: -900, action: 'DISPLAY', description: T('Guitar lesson', 'Clase de guitarra') }] });
    ev({ summary: T('Book club', 'Club de lectura'), dtstart: F.fromDateTime(at(new Date(Y, 0, 9), 20, 0)), rrule: { FREQ: ['MONTHLY'], BYDAY: ['2TU'] } });
    ev({ summary: T('Gym', 'Gimnasio'), dtstart: F.fromDateTime(at(sow, 7, 0)), duration: 3600, rrule: { FREQ: ['WEEKLY'], BYDAY: ['MO', 'TU', 'WE', 'TH', 'FR'] }, exdate: [F.fromDateTime(at(D.addDays(sow, 4), 7, 0))] });

    // Yearly, all-day
    const yearly = (m, d, en, sp) => ev({ summary: T(en, sp), dtstart: F.fromDate(new Date(Y - 3, m - 1, d)), dtend: F.fromDate(new Date(Y - 3, m - 1, d + 1)), rrule: { FREQ: ['YEARLY'] } });
    yearly(1, 1, "New Year's Day", 'Año Nuevo');
    yearly(3, 8, "International Women's Day", 'Día Internacional de la Mujer');
    yearly(3, 17, "St Patrick's Day", 'San Patricio');
    yearly(5, 1, 'Labour Day', 'Día del Trabajo');
    yearly(10, 31, 'Halloween', 'Halloween');
    yearly(12, 25, 'Christmas Day', 'Navidad');
    ev({ summary: T('Clocks go forward (EU)', 'Cambio de hora (verano)'), dtstart: F.fromDateTime(new Date(Y - 2, 2, 31, 1, 0)), rrule: { FREQ: ['YEARLY'], BYMONTH: ['3'], BYDAY: ['-1SU'] } });
    ev({ summary: T('Clocks go back (EU)', 'Cambio de hora (invierno)'), dtstart: F.fromDateTime(new Date(Y - 2, 9, 27, 2, 0)), rrule: { FREQ: ['YEARLY'], BYMONTH: ['10'], BYDAY: ['-1SU'] } });

    // Anniversaries
    ev({ summary: T("Mum's birthday", 'Cumpleaños de mamá'), dtstart: F.fromDate(new Date(Y - 71, 4, 12)), rrule: { FREQ: ['YEARLY'] }, anniv: true, anniv_show: 'COUNT' });
    ev({ summary: T('Wedding anniversary', 'Aniversario de boda'), dtstart: F.fromDate(new Date(Y - 9, 6, 20)), rrule: { FREQ: ['YEARLY'] }, anniv: true, anniv_show: 'COUNT' });

    // Single events around today
    ev({ summary: T('Funding deadline', 'Fecha límite de la subvención'), dtstart: F.fromDate(D.addDays(sow, 1)) });
    ev({ summary: T('Full moon', 'Luna llena'), dtstart: F.fromDate(D.addDays(sow, 1)) });
    ev({ summary: 'Romeo & Juliet', dtstart: F.fromDateTime(at(D.addDays(sow, 5), 19, 0)), dtend: F.fromDateTime(at(D.addDays(sow, 5), 22, 0)), status: 'CONFIRMED', location: T('Theatre Royal', 'Teatro Real') });
    ev({ summary: T('Presentation to Sophie & team', 'Presentación a Sofía y equipo'), dtstart: F.fromDateTime(at(D.addDays(sow, 3), 14, 0)), dtend: F.fromDateTime(at(D.addDays(sow, 3), 15, 0)), description: T('Bring the slides on a USB stick.', 'Llevar las diapositivas en un USB.') });
    ev({ summary: T('Dentist', 'Dentista'), dtstart: F.fromDateTime(at(D.addDays(sow, 9), 9, 15)), duration: 1800, status: 'TENTATIVE' });
    ev({ summary: T('Take car for MOT', 'Llevar el coche a la ITV'), dtstart: F.fromDateTime(at(D.addDays(sow, 11), 10, 0)) });
    ev({ summary: T('Cancelled: lunch with Ana', 'Cancelado: comida con Ana'), dtstart: F.fromDateTime(at(D.addDays(sow, 4), 13, 0)), status: 'CANCELLED' });
    ev({ summary: T('Holiday in Spain', 'Vacaciones en Asturias'), dtstart: F.fromDate(D.addDays(sow, 19)), dtend: F.fromDate(D.addDays(sow, 26)) });
    ev({ summary: T('Conference', 'Congreso'), dtstart: F.fromDate(D.addDays(sow, -10)), dtend: F.fromDate(D.addDays(sow, -8)) });

    // To-dos
    td({ summary: T('Order Euros', 'Pedir divisas'), priority: 1, status: 'NEEDS-ACTION' });
    td({ summary: T('Take Luna (& food etc.) to Antoine & Nila\'s', 'Llevar a Luna (y su comida) a casa de Antoine y Nila') });
    td({ summary: T('Buy: suncream, mosquito repellant', 'Comprar: crema solar, antimosquitos') });
    td({ summary: T('Buy: hats & sunglasses for the kids', 'Comprar: gorras y gafas de sol para los niños'), status: 'COMPLETED' });
    td({ summary: T('Find power adaptors', 'Buscar adaptadores de enchufe'), status: 'IN-PROCESS' });
    td({ summary: T('Renew passport', 'Renovar pasaporte'), priority: 2, due: F.fromDate(D.addDays(today, 6)) });
    td({ summary: T('Return library books', 'Devolver libros a la biblioteca'), due: F.fromDate(D.addDays(today, 2)), description: T('Three books', 'Tres libros') });

    PG.Calendar.add_raw_entries(list);
  },
};
