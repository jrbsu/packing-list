const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

// Exercise the actual app functions with a minimal DOM adapter, without dependencies.
function app() {
  const elements = new Map();
  function element() {
    return { value: '', dataset: {}, textContent: '', hidden: false, children: [], _innerHTML: '',
      get innerHTML() { return this._innerHTML; },
      set innerHTML(value) { this._innerHTML = value; this.children = []; },
      appendChild(child) { this.children.push(child); },
      classList: { add() {}, remove() {}, toggle() {} },
      add() {}, setAttribute() {}, closest() { return this; }, addEventListener(type, handler) { this.listeners[type] = handler; },
      listeners: {}, focus() {}, style: {}, contains() { return false; },
    };
  }
  const document = {
    getElementById(id) { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); },
    createElement: element,
    querySelector() { return element(); },
    body: element(), activeElement: null,
  };
  const storage = new Map();
  const context = vm.createContext({ document, console, setTimeout, clearTimeout, AbortController,
    window: { location: { hash: '' }, addEventListener() {} },
    Option: function Option(label, value) { this.label = label; this.value = value; },
    localStorage: { getItem: key => storage.get(key), setItem: (key, value) => storage.set(key, value) },
  });
  const source = fs.readFileSync('script.js', 'utf8');
  const startup = source.lastIndexOf('  for (const trip of state.trips) {');
  vm.runInContext(source.slice(0, startup) + `
    globalThis.api = { makeDefaultTrip, normaliseTrip, normaliseState, recalculateTrip,
      getItemTotal, getTripStats, getVisibleItems, getPackingDays, getClothingSetsNeeded,
      applyInternationalDetection, forecastDays, weatherCondition, normalisePreferences, preferences,
      weatherDecision, applyWeatherRules, savePreferences, renderDestinationTools, renderPage, wireSettings, weatherKey, validDestination, findDestination, checkWeather,
      selectDestination, scheduleDestinationSearch, dismissDestinationSearch,
      getSearch: () => destinationSearch, getWeather: () => weatherResult,
      renderTripForm, renderCalendar, makeItemRow, updateItem, addItem, duplicateCurrentTrip, save, filters, els,
      getState: () => state, setState: value => { state = value; },
      disableRender: () => { render = () => {}; } };
  })();`, context);
  return { ...context.api, context, storage };
}

test('legacy trips migrate their flight setting; checked bag choice survives save and reload', () => {
  const a = app();
  assert.equal(a.normaliseTrip({}).usesCheckedBag, true);
  assert.equal(a.normaliseTrip({ flying: true }).usesCheckedBag, true);
  assert.equal(a.normaliseTrip({ flying: false, usesCheckedBag: true }).usesCheckedBag, true);
  assert.equal(a.normaliseTrip({ flying: true, usesCheckedBag: false }).usesCheckedBag, false);
  const trip = a.normaliseTrip({ flying: false });
  assert.equal(Object.hasOwn(trip, 'flying'), false);
  a.setState({ trips: [trip], currentTripId: trip.id });
  a.save();
  assert.equal(a.normaliseState(JSON.parse(a.storage.get('packingPlanner.v2'))).trips[0].usesCheckedBag, false);
});

test('no-checked-bag combines counts without changing items or packed progress', () => {
  const a = app(); const trip = a.makeDefaultTrip(); a.recalculateTrip(trip);
  trip.items[0].packed = true;
  const before = JSON.stringify(trip.items);
  const stats = JSON.stringify(a.getTripStats(trip));
  trip.usesCheckedBag = false;
  a.filters.bag = 'checked'; a.renderTripForm(trip);
  assert.equal(a.filters.bag, 'all'); assert.equal(a.els.bagFilter.hidden, true);
  assert.equal(JSON.stringify(trip.items), before);
  assert.equal(JSON.stringify(a.getTripStats(trip)), stats);
  const row = a.makeItemRow(trip.items[0], trip);
  assert.match(row.innerHTML, /data-field="quantity"/);
  assert.doesNotMatch(row.innerHTML, /data-field="checked"|data-field="carryon"/);
  assert.equal(a.getItemTotal(trip.items[0]), 4);
  trip.usesCheckedBag = true; a.renderTripForm(trip);
  assert.equal(a.els.bagFilter.hidden, false);
  assert.equal(JSON.stringify(trip.items), before);
});

test('editing combined quantity becomes manual and invalidates packed check', () => {
  const a = app(); a.disableRender();
  const trip = a.makeDefaultTrip(); trip.usesCheckedBag = false; a.recalculateTrip(trip);
  a.setState({ trips: [trip], currentTripId: trip.id });
  const item = trip.items[0]; item.packed = true;
  a.updateItem(item.id, 'quantity', 7);
  assert.equal(a.getItemTotal(item), 7); assert.equal(item.rule, 'manual'); assert.equal(item.packed, false);
  a.recalculateTrip(trip); assert.equal(a.getItemTotal(item), 7);
  a.updateItem(item.id, 'quantity', 0);
  assert.equal(item.checked, 0); assert.equal(item.carryon, 0);
});

test('automatic rules preserve checks on unchanged counts and clear them on changes', () => {
  const a = app(); const trip = a.makeDefaultTrip(); a.recalculateTrip(trip);
  const item = trip.items[0]; item.packed = true;
  a.recalculateTrip(trip); assert.equal(item.packed, true);
  trip.returnDate = '2026-06-24'; a.recalculateTrip(trip);
  assert.equal(a.getItemTotal(item), 8); assert.equal(item.packed, false);
  trip.rules.laundryDays = 1; a.recalculateTrip(trip);
  assert.equal(a.getItemTotal(item), 5);
  trip.rules.formalDays = 2; trip.rules.hotPlace = true; trip.usesCheckedBag = false;
  a.recalculateTrip(trip);
  assert.equal(a.getItemTotal(trip.items.find(i => i.rule === 'formal')), 2);
  assert.equal(a.getItemTotal(trip.items.find(i => i.rule === 'hot')), 1);
});

test('empty lists stay empty on reload; imported IDs are safe in markup', () => {
  const a = app(); assert.equal(a.normaliseTrip({ items: [] }).items.length, 0);
  const trip = a.normaliseTrip({ items: [{ id: '\" onfocus=\"bad', name: '<img>', checked: 1 }] });
  const html = a.makeItemRow(trip.items[0], trip).innerHTML;
  assert.doesNotMatch(html, /data-id="" onfocus=/); assert.doesNotMatch(html, /<img>/);
});

test('storage failure does not interrupt editing and reports unsaved changes', () => {
  const a = app(); a.context.localStorage.setItem = () => { throw Error('quota'); };
  assert.doesNotThrow(() => a.save()); assert.match(a.els.saveStatus.textContent, /Could not autosave/);
});

test('packing days support missing, same-day and daylight-saving dates', () => {
  const a = app(); const trip = a.makeDefaultTrip();
  trip.leaveDate = ''; assert.equal(a.getPackingDays(trip), 0);
  trip.leaveDate = trip.returnDate; assert.equal(a.getPackingDays(trip), 0);
  trip.leaveDate = '2026-03-07'; trip.returnDate = '2026-03-10';
  assert.equal(a.getPackingDays(trip), 3);
});


test('no-checked-bag additions ignore hidden checked input and duplication retains bag preference', () => {
  const a = app(); a.disableRender();
  const trip = a.makeDefaultTrip(); trip.usesCheckedBag = false;
  a.setState({ trips: [trip], currentTripId: trip.id });
  a.els.newItemName.value = 'Walking boots';
  a.els.newItemChecked.value = '9'; a.els.newItemCarryon.value = '2';
  a.els.newItemCategory.value = 'clothes'; a.els.newItemRule.value = 'manual';
  a.addItem();
  const added = trip.items.at(-1);
  assert.equal(added.checked, 0); assert.equal(a.getItemTotal(added), 2);
  added.packed = true;
  a.duplicateCurrentTrip();
  const duplicate = a.getState().trips[1];
  assert.equal(duplicate.usesCheckedBag, false); assert.notEqual(duplicate.id, trip.id);
  assert.equal(duplicate.items.at(-1).packed, false);
});


test('HTML contains every JavaScript element reference and matching label target', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  const source = fs.readFileSync('script.js', 'utf8');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size);
  for (const match of source.matchAll(/byId\('([^']+)'\)/g)) assert.ok(ids.includes(match[1]), match[1]);
  for (const match of html.matchAll(/\bfor="([^"]+)"/g)) assert.ok(ids.includes(match[1]), match[1]);
});


const paris = { name: 'Paris', country_code: 'FR', latitude: 48.85, longitude: 2.35 };

test('international detection compares confirmed countries and respects manual override', () => {
  const a = app(); const trip = a.makeDefaultTrip();
  trip.homeCountry = 'US';
  assert.equal(a.applyInternationalDetection(trip), false);
  trip.destination = paris;
  assert.equal(a.applyInternationalDetection(trip), true);
  assert.equal(trip.rules.international, true);
  trip.homeCountry = 'FR'; a.applyInternationalDetection(trip);
  assert.equal(trip.rules.international, false);
  trip.internationalMode = 'manual'; trip.homeCountry = 'US';
  assert.equal(a.applyInternationalDetection(trip), false);
  assert.equal(trip.rules.international, false);
  assert.equal(a.normaliseTrip({}).internationalMode, 'manual');
  assert.equal(a.normaliseTrip({ destination: { ...paris, latitude: 100 } }).destination, null);
});

test('forecast selects only trip dates, skips missing temperatures, preserves zero and missing rain', () => {
  const a = app();
  const data = { daily: { time: ['2026-09-12', '2026-09-13', '2026-09-14', '2026-09-15'],
    temperature_2m_min: [10, 0, 13, null], temperature_2m_max: [20, 15, 25, 22],
    precipitation_probability_max: [20, 0, null, 10] } };
  const days = a.forecastDays(data, '2026-09-13', '2026-09-15');
  assert.equal(days.length, 2); assert.equal(days[0].low, 0);
  assert.equal(days[0].rain, 0); assert.equal(days[1].rain, null);
  assert.equal(a.forecastDays(data, '2027-01-01', '2027-01-05').length, 0);
});

test('late destination responses cannot overwrite a different trip search', async () => {
  const a = app(); let respond;
  a.context.fetch = () => new Promise(resolve => { respond = resolve; });
  const original = a.getState().trips[0];
  const pending = a.findDestination();
  const other = a.makeDefaultTrip(); other.location = 'London';
  a.setState({ trips: [other], currentTripId: other.id });
  respond({ ok: true, json: async () => ({ results: [paris] }) });
  await pending;
  assert.equal(a.getSearch().results.length, 0);
  assert.equal(other.destination, null); assert.equal(original.destination, null);
});

test('failed destination lookup is recoverable and preserves packing rules', async () => {
  const a = app(); const before = JSON.stringify(a.getState().trips[0].rules);
  a.context.fetch = async () => { throw Error('offline'); };
  await a.findDestination();
  assert.match(a.getSearch().message, /Could not look up/);
  assert.equal(a.getSearch().loading, false);
  assert.equal(JSON.stringify(a.getState().trips[0].rules), before);
});

test('weather requests need a confirmed destination and show partial coverage', async () => {
  const a = app(); a.disableRender(); const trip = a.getState().trips[0];
  let calls = 0;
  a.context.fetch = async () => { calls++; return { ok: true, json: async () => ({ daily: {
    time: ['2026-06-17'], temperature_2m_min: [15], temperature_2m_max: [27], precipitation_probability_max: [10],
  } }) }; };
  await a.checkWeather(); assert.equal(calls, 0);
  trip.destination = paris;
  await a.checkWeather(); assert.equal(calls, 1);
  assert.match(a.getWeather().message, /1 of 4 trip days/);
  assert.equal(a.getWeather().days.length, 1);
});


test('successful ambiguous search waits for destination confirmation', async () => {
  const a = app();
  a.context.fetch = async () => ({ ok: true, json: async () => ({ results: [paris, { ...paris, country_code: 'US' }] }) });
  await a.findDestination();
  assert.equal(a.getSearch().results.length, 2);
  assert.equal(a.getState().trips[0].destination, null);
  assert.equal(a.getSearch().loading, false);
});

test('weather response is ignored when trip dates change during request', async () => {
  const a = app(); const trip = a.getState().trips[0]; trip.destination = paris;
  let respond;
  a.context.fetch = () => new Promise(resolve => { respond = resolve; });
  const pending = a.checkWeather(); trip.returnDate = '2026-06-25';
  respond({ ok: true, json: async () => ({ daily: { time: ['2026-06-17'], temperature_2m_min: [12], temperature_2m_max: [20] } }) });
  await pending; assert.equal(a.getWeather().days.length, 0);
});


test('one-box selection fills country and updates international rules', async () => {
  const a = app(); a.disableRender();
  const trip = a.getState().trips[0]; trip.homeCountry = 'US'; trip.leaveDate = ''; trip.returnDate = '';
  a.context.fetch = async () => ({ ok: true, json: async () => ({ results: [{ ...paris, country: 'France' }] }) });
  await a.findDestination(); a.selectDestination(0);
  assert.equal(trip.location, 'Paris, France');
  assert.equal(a.els.location.value, 'Paris, France');
  assert.equal(trip.destination.country_code, 'FR');
  assert.equal(trip.rules.international, true);
  assert.equal(a.getSearch().results.length, 0);
});

test('typing rapidly makes one search for the latest city', async () => {
  const a = app(); const trip = a.getState().trips[0]; const calls = [];
  a.context.fetch = async url => { calls.push(url); return { ok: true, json: async () => ({ results: [paris] }) }; };
  trip.location = 'Pa'; a.scheduleDestinationSearch();
  trip.location = 'Paris'; a.scheduleDestinationSearch();
  await new Promise(resolve => setTimeout(resolve, 450));
  assert.equal(calls.length, 1); assert.match(calls[0], /name=Paris&/);
});

test('dismissing suggestions ignores a pending search response', async () => {
  const a = app(); let respond;
  a.context.fetch = () => new Promise(resolve => { respond = resolve; });
  const pending = a.findDestination(); a.dismissDestinationSearch();
  respond({ ok: true, json: async () => ({ results: [paris] }) });
  await pending; assert.equal(a.getSearch().results.length, 0);
});

test('forecast conditions distinguish sun, clouds, precipitation and unknown codes', () => {
  const a = app();
  for (const [code, kind] of [[0, 'sun'], [1, 'sun'], [2, 'partly'], [3, 'cloud'],
    [45, 'fog'], [48, 'fog'], [51, 'rain'], [57, 'rain'], [65, 'rain'], [67, 'rain'],
    [71, 'snow'], [77, 'snow'], [82, 'rain'], [86, 'snow'], [95, 'storm'],
    [97, 'storm'], [99, 'storm'], [null, 'unknown'], [undefined, 'unknown'], [100, 'unknown']]) {
    assert.equal(a.weatherCondition(code)[0], kind, `WMO code ${code}`);
  }
  const days = a.forecastDays({ daily: { time: ['2026-06-17'],
    temperature_2m_min: [15], temperature_2m_max: [27], weather_code: [0],
  } }, '2026-06-17', '2026-06-17');
  assert.equal(days[0].code, 0);
});

function forecastApp() {
  const a = app(); a.disableRender();
  const trip = a.getState().trips[0];
  trip.destination = paris;
  trip.leaveDate = '2026-06-17'; trip.returnDate = '2026-06-18';
  return { a, trip };
}

function setForecast(a, trip, days) {
  Object.assign(a.getWeather(), { key: a.weatherKey(trip), days });
  a.applyWeatherRules(trip);
}

test('thresholds are inclusive, affect quantities, and clear packed checks only when counts change', () => {
  const { a, trip } = forecastApp();
  const hotItem = trip.items.find(item => item.rule === 'hot');
  const jacket = trip.items.find(item => item.rule === 'rain');
  setForecast(a, trip, [{ high: 25, rain: 50 }]);
  assert.equal(a.getItemTotal(hotItem), 1); assert.equal(a.getItemTotal(jacket), 1);
  hotItem.packed = true; jacket.packed = true;
  setForecast(a, trip, [{ high: 25, rain: 50 }]);
  assert.equal(hotItem.packed, true); assert.equal(jacket.packed, true);
  setForecast(a, trip, [{ high: 24, rain: 49 }, { high: 24, rain: 49 }]);
  assert.equal(a.getItemTotal(hotItem), 0); assert.equal(a.getItemTotal(jacket), 0);
  assert.equal(hotItem.packed, false); assert.equal(jacket.packed, false);
});

test('partial or missing forecasts never turn off existing weather choices', () => {
  const { a, trip } = forecastApp();
  trip.rules.hotPlace = true; trip.rules.rainPlace = true;
  setForecast(a, trip, [{ high: 20, rain: 10 }]);
  assert.equal(trip.rules.hotPlace, true); assert.equal(trip.rules.rainPlace, true);
  setForecast(a, trip, []);
  assert.equal(trip.rules.hotPlace, true); assert.equal(trip.rules.rainPlace, true);
  setForecast(a, trip, [{ high: 20, rain: null }, { high: 20, rain: 10 }]);
  assert.equal(trip.rules.hotPlace, false); assert.equal(trip.rules.rainPlace, true);
});

test('manual weather mode and manual items retain quantities; stale forecasts are ignored', () => {
  const { a, trip } = forecastApp();
  trip.weatherMode = 'manual'; trip.rules.hotPlace = false; trip.rules.rainPlace = false;
  setForecast(a, trip, [{ high: 30, rain: 90 }]);
  assert.equal(trip.rules.hotPlace, false); assert.equal(trip.rules.rainPlace, false);
  trip.weatherMode = 'auto'; trip.returnDate = '2026-06-19';
  a.applyWeatherRules(trip);
  assert.equal(trip.rules.hotPlace, false);
  const jacket = trip.items.find(item => item.rule === 'rain');
  jacket.rule = 'manual'; jacket.checked = 3;
  setForecast(a, trip, [{ high: 30, rain: 90 }]);
  assert.equal(trip.rules.hotPlace, true); assert.equal(jacket.checked, 3);
});

test('settings persist, validate ranges, and recalculate a matching forecast', () => {
  const { a, trip } = forecastApp();
  setForecast(a, trip, [{ high: 25, rain: 50 }, { high: 25, rain: 50 }]);
  a.savePreferences({ homeLocation: 'London', homeCountry: 'GB', hotTemperature: 26, rainProbability: 51 });
  assert.equal(trip.rules.hotPlace, false); assert.equal(trip.rules.rainPlace, false);
  const restored = a.normaliseState(JSON.parse(a.storage.get('packingPlanner.v2')));
  assert.equal(restored.preferences.homeLocation, 'London');
  assert.equal(restored.preferences.hotTemperature, 26);
  assert.equal(restored.preferences.rainProbability, 51);
  assert.equal(a.normalisePreferences({ hotTemperature: null, rainProbability: 101 }).hotTemperature, 25);
  assert.equal(a.normalisePreferences({ rainProbability: -1 }).rainProbability, 50);
  assert.equal(a.normalisePreferences({ hotTemperature: 0, rainProbability: 0 }).rainProbability, 0);
});

test('home settings apply to international detection with per-trip overrides', () => {
  const { a, trip } = forecastApp();
  a.savePreferences({ homeLocation: 'Paris', homeCountry: 'FR' });
  assert.equal(trip.rules.international, false);
  trip.homeCountry = 'US'; a.applyInternationalDetection(trip);
  assert.equal(trip.rules.international, true);
});

test('default jacket migrates to rain rule while edited quantities survive', () => {
  const a = app();
  const original = { name: 'Jacket', rule: 'manual', checked: 1, carryon: 0 };
  assert.equal(a.normaliseTrip({ items: [original] }).items[0].rule, 'rain');
  assert.equal(a.normaliseTrip({ items: [{ ...original, checked: 2 }] }).items[0].rule, 'manual');
  assert.equal(a.normaliseTrip({ weatherMode: 'manual', items: [original] }).items[0].rule, 'manual');
});

test('forecast markup uses personal thresholds and includes accessible condition labels', () => {
  const { a, trip } = forecastApp();
  setForecast(a, trip, [{ date: '2026-06-17', low: 15, high: 25, rain: 50, code: 2 }]);
  a.renderDestinationTools(trip);
  const html = a.context.document.getElementById('weatherDays').innerHTML;
  assert.match(html, /Partly cloudy/); assert.match(html, /aria-hidden="true"/);
  assert.match(html, /hotBadge/); assert.match(html, /Bring a jacket/);
  a.savePreferences({ hotTemperature: 26, rainProbability: 51 });
  a.renderDestinationTools(trip);
  assert.doesNotMatch(a.context.document.getElementById('weatherDays').innerHTML, /hotBadge|Bring a jacket/);
});

test('settings route shows preferences and form submission saves the entered values', () => {
  const { a } = forecastApp();
  const byId = id => a.context.document.getElementById(id);
  a.context.window.location.hash = '#settings';
  a.wireSettings();
  assert.equal(byId('plannerPage').hidden, true);
  assert.equal(byId('rulesCard').hidden, true);
  assert.equal(byId('settingsPage').hidden, false);
  assert.equal(byId('hotTemperature').value, 25);
  byId('settingsHomeLocation').value = ' London ';
  byId('settingsHomeCountry').value = 'GB';
  byId('hotTemperature').value = '22.5';
  byId('rainProbability').value = '70';
  byId('settingsForm').listeners.submit({ preventDefault() {} });
  assert.equal(a.preferences().homeLocation, 'London');
  assert.equal(a.preferences().hotTemperature, 22.5);
  assert.equal(a.preferences().rainProbability, 70);
  a.context.window.location.hash = '#planner'; a.renderPage();
  assert.equal(byId('plannerPage').hidden, false);
  assert.equal(byId('rulesCard').hidden, false);
  assert.equal(byId('settingsPage').hidden, true);
});

test('calendar forecast notes match table thresholds and disappear for stale trip dates', () => {
  const { a, trip } = forecastApp();
  trip.weatherMode = 'manual';
  setForecast(a, trip, [{ date: '2026-06-17', low: 15, high: 25, rain: 50, code: 2 }]);
  a.renderCalendar(trip);
  const day = () => a.els.calendar.children.find(child => child.dataset.date === '2026-06-17');
  assert.match(day().innerHTML, /Hot/); assert.match(day().innerHTML, /Bring a jacket/);
  assert.match(day().ariaLabel, /Partly cloudy.*Hot.*Bring a jacket/);
  const unforecastDay = a.els.calendar.children.find(child => child.dataset.date === '2026-06-18');
  assert.doesNotMatch(unforecastDay.innerHTML, /dayWeather|weatherBadge/);
  a.savePreferences({ hotTemperature: 26, rainProbability: 51 });
  a.renderCalendar(trip);
  assert.doesNotMatch(day().innerHTML, /weatherBadge/);
  assert.match(day().innerHTML, /weatherIcon/);
  trip.returnDate = '2026-06-19'; a.renderCalendar(trip);
  assert.doesNotMatch(day().innerHTML, /dayWeather|weatherIcon/);
});
