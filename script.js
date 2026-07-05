(() => {
  'use strict';

  /*
   * Packing Planner
   * ---------------
   * Plain JavaScript, split into small named functions.
   *
   * Main rule change:
   * - There is no separate "Use" checkbox anymore.
   * - An item is used when checked + carryon is greater than 0.
   * - The packed control is now a button instead of a checkbox.
   */

  // ---------------------------------------------------------------------------
  // Constants
  // ---------------------------------------------------------------------------

  const STORAGE_KEY = 'packingPlanner.v2';
  const LEGACY_STORAGE_KEY = 'packingPlanner.v1';
  const MS_PER_DAY = 86_400_000;

  const CATEGORIES = {
    clothes: 'Clothes',
    electronics: 'Electronics',
    toiletries: 'Toiletries',
    documents: 'Documents',
    medical: 'Medical',
    other: 'Other',
  };

  const RULES = {
    manual: 'Manual',
    basic: 'Basic clothes',
    formal: 'Formal',
    hot: 'Hot weather',
    international: 'International',
  };

  const DEFAULT_RULE_SETTINGS = {
    backup: 1,
    departureWearing: 1,
    laundryDays: 0,
    formalDays: 0,
    hotPlace: false,
    international: true,
  };

  // ---------------------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------------------

  function byId(id) {
    return document.getElementById(id);
  }

  function makeId() {
    if (globalThis.crypto?.randomUUID) {
      return crypto.randomUUID();
    }

    return `id-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
  }

  function wholeNumber(value) {
    const number = Number(value);
    if (!Number.isFinite(number)) return 0;
    return Math.max(0, Math.round(number));
  }

  function parseIsoDate(value) {
    if (!value) return null;

    const date = new Date(`${value}T00:00:00`);
    return Number.isNaN(date.getTime()) ? null : date;
  }

  function toIsoDate(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    return `${year}-${month}-${day}`;
  }

  function getMonthKey(value) {
    const date = value instanceof Date ? value : parseIsoDate(value) || new Date();
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');

    return `${year}-${month}`;
  }

  function getMonthDate(monthKey) {
    const fallback = new Date();
    const [year, month] = String(monthKey || getMonthKey(fallback))
      .split('-')
      .map(Number);

    return new Date(year || fallback.getFullYear(), (month || 1) - 1, 1);
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#039;');
  }

  function pluralise(count, singular, plural = `${singular}s`) {
    return count === 1 ? singular : plural;
  }

  // ---------------------------------------------------------------------------
  // Default data
  // ---------------------------------------------------------------------------

  function makeDefaultItems() {
    const itemRows = [
      // category, name, checked bag quantity, carryon quantity, rule, note
      ['clothes', 'Underwear', 3, 1, 'basic', 'One per hold-luggage day, plus backup.'],
      ['clothes', 'Socks', 3, 1, 'basic', ''],
      ['clothes', 'T-shirts', 3, 1, 'basic', ''],
      ['clothes', 'Dress shirts', 0, 0, 'formal', ''],
      ['clothes', 'Jeans', 0, 0, 'manual', ''],
      ['clothes', 'Jumper', 0, 0, 'manual', ''],
      ['clothes', 'Shorts', 0, 0, 'hot', ''],
      ['clothes', 'Hat (baseball)', 0, 0, 'hot', ''],
      ['clothes', 'Hat (bobble)', 0, 0, 'manual', ''],
      ['clothes', 'Swimshorts', 0, 0, 'hot', ''],
      ['clothes', 'Jacket', 1, 0, 'manual', ''],

      ['electronics', 'Personal laptop', 0, 1, 'manual', ''],
      ['electronics', 'Work laptop', 0, 0, 'manual', ''],
      ['electronics', 'iPad', 0, 1, 'manual', ''],
      ['electronics', 'Kindle', 0, 0, 'manual', ''],
      ['electronics', 'Battery (L)', 0, 1, 'manual', 'Keep lithium batteries in carryon.'],
      ['electronics', 'Battery (S)', 0, 0, 'manual', ''],
      ['electronics', 'Headphones', 0, 0, 'manual', ''],
      ['electronics', 'AirPods', 0, 1, 'manual', ''],
      ['electronics', 'Phone', 0, 1, 'manual', ''],
      ['electronics', 'Powerstrip', 1, 0, 'manual', ''],
      ['electronics', 'International adaptor', 1, 0, 'international', ''],
      ['electronics', 'Lightning cable', 0, 0, 'manual', ''],
      ['electronics', 'Charging pad', 0, 1, 'manual', ''],
      ['electronics', 'USB-C cable', 0, 3, 'manual', ''],

      ['toiletries', 'Toothbrush', 0, 1, 'manual', ''],
      ['toiletries', 'Toothpaste', 0, 1, 'manual', 'Travel size if flying.'],
      ['toiletries', 'Deodorant', 0, 1, 'manual', ''],
      ['toiletries', 'Sunscreen', 0, 0, 'hot', ''],

      ['documents', 'Wallet / ID', 0, 1, 'manual', ''],
      ['documents', 'Passport', 0, 1, 'international', ''],
      ['documents', 'Travel insurance details', 0, 1, 'international', ''],

      ['medical', 'Medication', 0, 1, 'manual', 'Keep essential meds in carryon.'],
    ];

    return itemRows.map(([category, name, checked, carryon, rule, note]) => ({
      id: makeId(),
      category,
      name,
      checked,
      carryon,
      rule,
      packed: false,
      note,
    }));
  }

  function makeDefaultTrip() {
    return {
      id: makeId(),
      name: 'Disney',
      location: 'Anaheim, CA',
      leaveDate: '2026-06-17',
      returnDate: '2026-06-20',
      calendarMonth: '2026-06',
      rules: { ...DEFAULT_RULE_SETTINGS },
      collapsedCats: {},
      items: makeDefaultItems(),
    };
  }

  // ---------------------------------------------------------------------------
  // Loading and normalising saved data
  // ---------------------------------------------------------------------------

  function normaliseItem(rawItem) {
    return {
      id: rawItem.id || makeId(),
      category: CATEGORIES[rawItem.category] ? rawItem.category : 'other',
      name: rawItem.name || 'Untitled item',
      checked: wholeNumber(rawItem.checked),
      carryon: wholeNumber(rawItem.carryon),
      packed: Boolean(rawItem.packed),
      rule: RULES[rawItem.rule] ? rawItem.rule : 'manual',
      note: rawItem.note || '',
    };
  }

  function normaliseTrip(rawTrip) {
    const fallback = makeDefaultTrip();

    const trip = {
      ...fallback,
      ...rawTrip,
      rules: {
        ...fallback.rules,
        ...(rawTrip.rules || {}),
      },
      collapsedCats: {
        ...(rawTrip.collapsedCats || {}),
      },
      items: Array.isArray(rawTrip.items) && rawTrip.items.length
        ? rawTrip.items.map(normaliseItem)
        : fallback.items,
    };

    trip.id ||= makeId();
    trip.calendarMonth ||= getMonthKey(trip.leaveDate || new Date());

    return trip;
  }

  function normaliseState(rawState) {
    let trips = Array.isArray(rawState.trips)
      ? rawState.trips.map(normaliseTrip)
      : [];

    if (!trips.length) {
      trips = [makeDefaultTrip()];
    }

    const currentTripId = trips.some((trip) => trip.id === rawState.currentTripId)
      ? rawState.currentTripId
      : trips[0].id;

    return {
      currentTripId,
      trips,
      ui: {
        rulesOpen: rawState.ui?.rulesOpen === true,
      },
    };
  }

  function loadState() {
    for (const key of [STORAGE_KEY, LEGACY_STORAGE_KEY]) {
      try {
        const savedJson = localStorage.getItem(key);
        if (!savedJson) continue;

        const savedState = JSON.parse(savedJson);
        if (savedState.trips?.length) {
          return normaliseState(savedState);
        }
      } catch (error) {
        console.warn(`Could not load ${key}`, error);
      }
    }

    const trip = makeDefaultTrip();

    return {
      currentTripId: trip.id,
      trips: [trip],
      ui: {
        rulesOpen: false,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // App state
  // ---------------------------------------------------------------------------

  let state = loadState();

  const filters = {
    search: '',
    category: 'all',
    bag: 'all',
    missingOnly: false,
  };

  let toastTimer = null;
  let recentlyPackedItemId = null;
  let shineTimer = null;

  const els = {
    saveStatus: byId('saveStatus'),

    tripPicker: byId('tripPicker'),
    tripName: byId('tripName'),
    location: byId('location'),
    leaveDate: byId('leaveDate'),
    returnDate: byId('returnDate'),

    backup: byId('backup'),
    departureWearing: byId('departureWearing'),
    laundryDays: byId('laundryDays'),
    formalDays: byId('formalDays'),
    hotPlace: byId('hotPlace'),
    international: byId('international'),

    travelDays: byId('travelDays'),
    setsNeeded: byId('setsNeeded'),
    missingCount: byId('missingCount'),
    packedCount: byId('packedCount'),
    progressText: byId('progressText'),
    progressFill: byId('progressFill'),

    calendar: byId('calendar'),
    calTitle: byId('calTitle'),
    dateHint: byId('dateHint'),

    tables: byId('tables'),
    searchItems: byId('searchItems'),
    categoryFilter: byId('categoryFilter'),
    bagFilter: byId('bagFilter'),
    missingOnly: byId('missingOnly'),

    newItemName: byId('newItemName'),
    newItemCategory: byId('newItemCategory'),
    newItemChecked: byId('newItemChecked'),
    newItemCarryon: byId('newItemCarryon'),
    newItemRule: byId('newItemRule'),

    toast: byId('toast'),
    jsonModal: byId('jsonModal'),
    jsonText: byId('jsonText'),

    rulesCard: byId('rulesCard'),
    rulesHead: byId('rulesHead'),
    rulesToggle: byId('rulesToggle'),
  };

  function getCurrentTrip() {
    return state.trips.find((trip) => trip.id === state.currentTripId) || state.trips[0];
  }

  // ---------------------------------------------------------------------------
  // Packing calculations
  // ---------------------------------------------------------------------------

  function getHoldLuggageDays(trip) {
    const leaveDate = parseIsoDate(trip.leaveDate);
    const returnDate = parseIsoDate(trip.returnDate);

    if (!leaveDate || !returnDate || returnDate < leaveDate) {
      return 0;
    }

    return Math.round((returnDate - leaveDate) / MS_PER_DAY);
  }

  function getClothingSetsNeeded(trip) {
    const laundryCycles = wholeNumber(trip.rules.laundryDays) + 1;
    return Math.max(0, Math.ceil(getHoldLuggageDays(trip) / laundryCycles));
  }

  function getItemTotal(item) {
    return wholeNumber(item.checked) + wholeNumber(item.carryon);
  }

  function isItemUsed(item) {
    return getItemTotal(item) > 0;
  }

  function recalculateTrip(trip) {
    const clothingSets = getClothingSetsNeeded(trip);
    const backupSets = wholeNumber(trip.rules.backup);
    const formalDays = wholeNumber(trip.rules.formalDays);

    for (const item of trip.items) {
      if (item.rule === 'basic') {
        item.checked = clothingSets;
        item.carryon = backupSets;
      }

      if (item.rule === 'formal') {
        item.checked = formalDays;
        item.carryon = 0;
      }

      if (item.rule === 'hot') {
        item.checked = trip.rules.hotPlace ? 1 : 0;
        item.carryon = 0;
      }

      if (item.rule === 'international') {
        item.checked = 0;
        item.carryon = trip.rules.international ? 1 : 0;
      }

      if (!isItemUsed(item)) {
        item.packed = false;
      }
    }
  }

  function getTripStats(trip) {
    const usedItems = trip.items.filter(isItemUsed);
    const packedItems = usedItems.filter((item) => item.packed);
    const percent = usedItems.length
      ? Math.round((packedItems.length / usedItems.length) * 100)
      : 100;

    return {
      used: usedItems.length,
      packed: packedItems.length,
      missing: usedItems.length - packedItems.length,
      percent,
    };
  }

  function getVisibleItems(trip = getCurrentTrip()) {
    const search = filters.search.trim().toLowerCase();

    return trip.items.filter((item) => {
      const searchableText = [
        item.name,
        item.note,
        CATEGORIES[item.category],
        RULES[item.rule],
      ].join(' ').toLowerCase();

      const matchesSearch = !search || searchableText.includes(search);
      const matchesCategory = filters.category === 'all' || item.category === filters.category;
      const matchesBag =
        filters.bag === 'all' ||
        (filters.bag === 'checked' && wholeNumber(item.checked) > 0) ||
        (filters.bag === 'carryon' && wholeNumber(item.carryon) > 0);
      const isRecentlyPacked = item.id === recentlyPackedItemId && item.packed;

      const matchesMissingOnly =
        !filters.missingOnly ||
        isRecentlyPacked ||
        (isItemUsed(item) && !item.packed);
      return matchesSearch && matchesCategory && matchesBag && matchesMissingOnly;
    });
  }

  // ---------------------------------------------------------------------------
  // Saving and notifications
  // ---------------------------------------------------------------------------

  function save(showMessage = false) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));

    els.saveStatus.textContent = `Saved ${new Date().toLocaleTimeString([], {
      hour: '2-digit',
      minute: '2-digit',
    })} in this browser`;

    if (showMessage) {
      showToast('Saved in this browser');
    }
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('show');

    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      els.toast.classList.remove('show');
    }, 2200);
  }

  // ---------------------------------------------------------------------------
  // Render helpers
  // ---------------------------------------------------------------------------

  function fillSelect(selectElement, options, selectedValue) {
    const oldValue = selectedValue || selectElement.value;

    selectElement.innerHTML = '';

    for (const [value, label] of options) {
      selectElement.add(new Option(label, value));
    }

    selectElement.value = options.some(([value]) => value === oldValue)
      ? oldValue
      : options[0]?.[0];
  }

  function renderTripPicker() {
    els.tripPicker.innerHTML = '';

    for (const savedTrip of state.trips) {
      const label = `${savedTrip.name || 'Untitled trip'}${savedTrip.location ? ` — ${savedTrip.location}` : ''}`;

      els.tripPicker.add(new Option(
        label,
        savedTrip.id,
        savedTrip.id === state.currentTripId,
        savedTrip.id === state.currentTripId,
      ));
    }
  }

  function renderTripForm(trip) {
    if (document.activeElement !== els.tripName) {
      els.tripName.value = trip.name || '';
    }

    if (document.activeElement !== els.location) {
      els.location.value = trip.location || '';
    }

    els.leaveDate.value = trip.leaveDate || '';
    els.returnDate.value = trip.returnDate || '';

    for (const key of ['backup', 'departureWearing', 'laundryDays', 'formalDays']) {
      if (document.activeElement !== els[key]) {
        els[key].value = wholeNumber(trip.rules[key]);
      }
    }

    els.hotPlace.checked = Boolean(trip.rules.hotPlace);
    els.international.checked = Boolean(trip.rules.international);
  }

  function renderRulesPanel() {
    const rulesOpen = Boolean(state.ui?.rulesOpen);

    els.rulesCard.classList.toggle('collapsed', !rulesOpen);
    els.rulesHead.setAttribute('aria-expanded', String(rulesOpen));
    els.rulesToggle.setAttribute('aria-expanded', String(rulesOpen));
    els.rulesToggle.setAttribute(
      'aria-label',
      rulesOpen ? 'Collapse packing rules' : 'Expand packing rules',
    );
  }

  function renderDateHint(trip) {
    if (!trip.leaveDate) {
      els.dateHint.textContent = 'Click a date to set your departure, then click another date for your return.';
      return;
    }

    if (!trip.returnDate) {
      els.dateHint.textContent = 'Departure set. Now click your return date.';
      return;
    }

    els.dateHint.textContent = 'Click any date to start a new range, or use the date fields to fine-tune.';
  }

  function renderProgress(trip) {
    const stats = getTripStats(trip);

    els.travelDays.textContent = getHoldLuggageDays(trip);
    els.setsNeeded.textContent = getClothingSetsNeeded(trip);
    els.missingCount.textContent = stats.missing;
    els.packedCount.textContent = `${stats.packed}/${stats.used}`;
    els.progressText.textContent = `${stats.percent}%`;
    els.progressFill.style.width = `${stats.percent}%`;

    els.missingCount.closest('.metric').className = `metric ${stats.missing === 0 ? 'good' : stats.missing <= 3 ? 'warn' : 'alert'
      }`;

    els.packedCount.closest('.metric').className = `metric ${stats.percent === 100 ? 'good' : ''
      }`;
  }

  // ---------------------------------------------------------------------------
  // Calendar rendering
  // ---------------------------------------------------------------------------

  function renderCalendar(trip) {
    const monthDate = getMonthDate(trip.calendarMonth || trip.leaveDate || new Date());

    els.calTitle.textContent = monthDate.toLocaleDateString([], {
      month: 'long',
      year: 'numeric',
    });

    els.calendar.innerHTML = '';

    for (const dayName of ['M', 'T', 'W', 'T', 'F', 'S', 'S']) {
      const dayHeading = document.createElement('div');
      dayHeading.className = 'calHead';
      dayHeading.textContent = dayName;
      els.calendar.appendChild(dayHeading);
    }

    const firstDayOfMonth = new Date(monthDate.getFullYear(), monthDate.getMonth(), 1);
    const calendarStart = new Date(firstDayOfMonth);
    const mondayOffset = firstDayOfMonth.getDay() === 0
      ? 6
      : firstDayOfMonth.getDay() - 1;

    calendarStart.setDate(firstDayOfMonth.getDate() - mondayOffset);

    const todayIso = toIsoDate(new Date());
    const leaveDate = parseIsoDate(trip.leaveDate);
    const returnDate = parseIsoDate(trip.returnDate);

    for (let cellIndex = 0; cellIndex < 42; cellIndex += 1) {
      const date = new Date(calendarStart);
      date.setDate(calendarStart.getDate() + cellIndex);

      const dateIso = toIsoDate(date);
      const button = document.createElement('button');

      button.type = 'button';
      button.className = 'day';
      button.dataset.date = dateIso;
      button.ariaLabel = date.toLocaleDateString([], {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      });

      if (date.getMonth() !== monthDate.getMonth()) {
        button.classList.add('out');
      }

      if (dateIso === todayIso) {
        button.classList.add('today');
      }

      if (dateIso === trip.leaveDate) {
        button.classList.add('leave');
      }

      if (leaveDate && returnDate && date > leaveDate && date < returnDate) {
        button.classList.add('away');
      }

      if (dateIso === trip.returnDate && trip.returnDate !== trip.leaveDate) {
        button.classList.add('return');
      }

      const tag = getCalendarDateTag(date, dateIso, trip, leaveDate, returnDate);

      button.innerHTML = `
        <span class="dayNo">${date.getDate()}</span>
        ${tag ? `<span class="dayTag">${tag}</span>` : ''}
      `;

      els.calendar.appendChild(button);
    }
  }

  function getCalendarDateTag(date, dateIso, trip, leaveDate, returnDate) {
    if (dateIso === trip.leaveDate) return 'leave';
    if (dateIso === trip.returnDate && trip.returnDate !== trip.leaveDate) return 'return';
    if (leaveDate && returnDate && date > leaveDate && date < returnDate) return 'away';
    return '';
  }

  // ---------------------------------------------------------------------------
  // Packing list rendering
  // ---------------------------------------------------------------------------

  function renderPackingList(trip) {
    const visibleItems = getVisibleItems(trip);

    els.tables.innerHTML = '';

    if (!visibleItems.length) {
      els.tables.innerHTML = '<div class="empty">No items match these filters.</div>';
      return;
    }

    for (const category of Object.keys(CATEGORIES)) {
      const categoryItems = visibleItems.filter((item) => item.category === category);
      if (!categoryItems.length) continue;

      els.tables.appendChild(makeCategorySection(trip, category, categoryItems));
    }
  }

  function makeCategorySection(trip, category, categoryItems) {
    const usedItems = categoryItems.filter(isItemUsed);
    const packedCount = usedItems.filter((item) => item.packed).length;
    const isCollapsed = Boolean(trip.collapsedCats?.[category]);

    const section = document.createElement('section');
    section.className = `cat ${isCollapsed ? 'collapsed' : ''}`;

    section.innerHTML = `
      <div class="catHead" data-toggle-cat="${category}" role="button" tabindex="0" aria-expanded="${!isCollapsed}">
        <div class="catTitle">
          <span class="chip ${category}"></span>${CATEGORIES[category]}
        </div>
        <div class="catMeta">
          <div class="catCount">${packedCount}/${usedItems.length} packed</div>
          <button
            type="button"
            data-toggle-cat="${category}"
            class="catToggle ghost"
            aria-label="${isCollapsed ? 'Expand' : 'Collapse'} ${CATEGORIES[category]}"
          >${isCollapsed ? '▸' : '▾'}</button>
        </div>
      </div>

      <div class="tableWrap">
        <table>
          <thead>
            <tr>
              <th>Item</th>
              <th class="num">Checked</th>
              <th class="num">Carryon</th>
              <th class="num">Total</th>
              <th class="pack">Packed</th>
              <th class="ruleCol">Rule</th>
              <th class="actionsCol">Actions</th>
            </tr>
          </thead>
          <tbody></tbody>
        </table>
      </div>
    `;

    const tbody = section.querySelector('tbody');

    for (const item of categoryItems) {
      tbody.appendChild(makeItemRow(item));
    }

    return section;
  }

  function makeItemRow(item) {
    const row = document.createElement('tr');
    row.dataset.itemId = item.id;
    const used = isItemUsed(item);

    if (!used) row.classList.add('off');
    if (item.packed) row.classList.add('packed');
    if (used && !item.packed) row.classList.add('missing');
    if (item.id === recentlyPackedItemId && item.packed) {
      row.classList.add('shinePacked');
    }

    row.innerHTML = `
      <td class="item">
        <div class="itemBox">
          <input
            data-id="${item.id}"
            data-field="name"
            type="text"
            value="${escapeHtml(item.name)}"
            aria-label="Item name"
          >
          <input
            class="note"
            data-id="${item.id}"
            data-field="note"
            type="text"
            value="${escapeHtml(item.note)}"
            placeholder="Note"
            aria-label="Item note"
          >
        </div>
      </td>

      <td class="num">
        <input
          data-id="${item.id}"
          data-field="checked"
          type="number"
          min="0"
          step="1"
          value="${wholeNumber(item.checked)}"
        >
      </td>

      <td class="num">
        <input
          data-id="${item.id}"
          data-field="carryon"
          type="number"
          min="0"
          step="1"
          value="${wholeNumber(item.carryon)}"
        >
      </td>

      <td class="num total">${getItemTotal(item)}</td>

      <td class="pack">
        <button
          type="button"
          class="packToggle ${item.packed ? 'isPacked' : ''}"
          data-pack="${item.id}"
          aria-pressed="${item.packed}"
          ${used ? '' : 'disabled'}
        >${item.packed ? '✓ Packed' : 'Pack'}</button>
      </td>

      <td class="ruleCol">
        <select data-id="${item.id}" data-field="rule">
          ${Object.entries(RULES).map(([value, label]) => `
            <option value="${value}" ${item.rule === value ? 'selected' : ''}>${label}</option>
          `).join('')}
        </select>
      </td>

      <td class="actionsCol">
        <button data-delete="${item.id}" class="danger slim">Delete</button>
      </td>
    `;

    return row;
  }

  function render() {
    const currentTrip = getCurrentTrip();

    fillSelect(
      els.categoryFilter,
      [['all', 'All categories'], ...Object.entries(CATEGORIES)],
      filters.category,
    );

    fillSelect(
      els.newItemCategory,
      Object.entries(CATEGORIES),
      els.newItemCategory.value || 'other',
    );

    fillSelect(
      els.newItemRule,
      Object.entries(RULES),
      els.newItemRule.value || 'manual',
    );

    renderTripPicker();
    renderTripForm(currentTrip);
    renderRulesPanel();
    renderDateHint(currentTrip);
    renderProgress(currentTrip);
    renderCalendar(currentTrip);
    renderPackingList(currentTrip);
  }

  // ---------------------------------------------------------------------------
  // State changes
  // ---------------------------------------------------------------------------

  function toggleCategory(category) {
    if (!CATEGORIES[category]) return;

    const currentTrip = getCurrentTrip();
    currentTrip.collapsedCats ||= {};
    currentTrip.collapsedCats[category] = !currentTrip.collapsedCats[category];

    save();
    renderPackingList(currentTrip);
  }

  function toggleRulesPanel(open) {
    state.ui ||= {};
    state.ui.rulesOpen = typeof open === 'boolean'
      ? open
      : !state.ui.rulesOpen;

    save();
    render();
  }

  function updateDates(currentTrip) {
    if (
      currentTrip.leaveDate &&
      currentTrip.returnDate &&
      currentTrip.returnDate < currentTrip.leaveDate
    ) {
      const oldLeaveDate = currentTrip.leaveDate;
      currentTrip.leaveDate = currentTrip.returnDate;
      currentTrip.returnDate = oldLeaveDate;
    }

    recalculateTrip(currentTrip);
    save();
    render();
  }

  function updateTripRule(ruleName, value) {
    const currentTrip = getCurrentTrip();

    currentTrip.rules[ruleName] = value;
    recalculateTrip(currentTrip);

    save();
    render();
  }

  function updateItem(itemId, field, value) {
    const currentTrip = getCurrentTrip();
    const item = currentTrip.items.find((candidate) => candidate.id === itemId);

    if (!item) return;

    if (field === 'checked' || field === 'carryon') {
      item[field] = wholeNumber(value);
      item.rule = 'manual';
    } else if (field === 'packed') {
      item.packed = Boolean(value) && isItemUsed(item);
    } else if (field === 'rule') {
      item.rule = RULES[value] ? value : 'manual';
      recalculateTrip(currentTrip);
    } else {
      item[field] = value;
    }

    if (!isItemUsed(item)) {
      item.packed = false;
    }

    save();
    render();
  }

  function togglePacked(itemId) {
    const currentTrip = getCurrentTrip();
    const item = currentTrip.items.find((candidate) => candidate.id === itemId);

    if (!item || !isItemUsed(item)) return;

    const willBePacked = !item.packed;
    item.packed = willBePacked;

    recentlyPackedItemId = willBePacked ? itemId : null;

    clearTimeout(shineTimer);

    save();
    render();

    if (willBePacked) {
      shineTimer = setTimeout(() => {
        recentlyPackedItemId = null;
        renderPackingList(getCurrentTrip());
      }, 900);
    }
  }

  function pickDate(dateIso) {
    const currentTrip = getCurrentTrip();

    if (!currentTrip.leaveDate || (currentTrip.leaveDate && currentTrip.returnDate)) {
      currentTrip.leaveDate = dateIso;
      currentTrip.returnDate = '';
      currentTrip.calendarMonth = getMonthKey(dateIso);
      showToast('Departure set. Now pick a return date.');
    } else if (dateIso < currentTrip.leaveDate) {
      currentTrip.returnDate = currentTrip.leaveDate;
      currentTrip.leaveDate = dateIso;
      currentTrip.calendarMonth = getMonthKey(dateIso);
      showToast('Trip dates selected');
    } else {
      currentTrip.returnDate = dateIso;
      currentTrip.calendarMonth = getMonthKey(dateIso);
      showToast('Trip dates selected');
    }

    recalculateTrip(currentTrip);
    save();
    render();
  }

  function changeMonth(monthDelta) {
    const currentTrip = getCurrentTrip();
    const monthDate = getMonthDate(currentTrip.calendarMonth || currentTrip.leaveDate || new Date());

    monthDate.setMonth(monthDate.getMonth() + monthDelta);
    currentTrip.calendarMonth = getMonthKey(monthDate);

    save();
    renderCalendar(currentTrip);
  }

  function markVisibleItemsAs(packed) {
    let count = 0;

    for (const item of getVisibleItems()) {
      if (isItemUsed(item)) {
        item.packed = packed;
        count += 1;
      }
    }

    save();
    render();

    showToast(`${packed ? 'Packed' : 'Unpacked'} ${count} visible ${pluralise(count, 'item')}`);
  }

  function createNewTrip() {
    const newTrip = makeDefaultTrip();

    Object.assign(newTrip, {
      name: 'New trip',
      location: '',
      leaveDate: '',
      returnDate: '',
      calendarMonth: getMonthKey(new Date()),
    });

    recalculateTrip(newTrip);

    state.trips.push(newTrip);
    state.currentTripId = newTrip.id;

    save();
    render();
    showToast('New trip created');
  }

  function duplicateCurrentTrip() {
    const duplicate = JSON.parse(JSON.stringify(getCurrentTrip()));

    duplicate.id = makeId();
    duplicate.name = `${duplicate.name || 'Trip'} copy`;

    for (const item of duplicate.items) {
      item.id = makeId();
      item.packed = false;
    }

    state.trips.push(duplicate);
    state.currentTripId = duplicate.id;

    save();
    render();
    showToast('Trip duplicated');
  }

  function deleteCurrentTrip() {
    if (state.trips.length === 1) {
      showToast('You need at least one trip');
      return;
    }

    const currentTrip = getCurrentTrip();
    if (!confirm(`Delete “${currentTrip.name || 'Untitled trip'}”?`)) {
      return;
    }

    state.trips = state.trips.filter((trip) => trip.id !== state.currentTripId);
    state.currentTripId = state.trips[0].id;

    save();
    render();
    showToast('Trip deleted');
  }

  function addItem() {
    const name = els.newItemName.value.trim();

    if (!name) {
      els.newItemName.focus();
      showToast('Name the item first');
      return;
    }

    const checked = wholeNumber(els.newItemChecked.value);
    const carryon = wholeNumber(els.newItemCarryon.value);

    getCurrentTrip().items.push({
      id: makeId(),
      category: CATEGORIES[els.newItemCategory.value] ? els.newItemCategory.value : 'other',
      name,
      checked,
      carryon,
      rule: RULES[els.newItemRule.value] ? els.newItemRule.value : 'manual',
      packed: false,
      note: '',
    });

    recalculateTrip(getCurrentTrip());

    els.newItemName.value = '';

    save();
    render();
    showToast('Item added');
  }

  function clearAllPackedChecks() {
    if (!confirm('Clear all packed checkmarks for this trip?')) {
      return;
    }

    for (const item of getCurrentTrip().items) {
      item.packed = false;
    }

    save();
    render();
    showToast('Packed checkmarks cleared');
  }

  // ---------------------------------------------------------------------------
  // Import/export
  // ---------------------------------------------------------------------------

  function importState(rawState) {
    if (!Array.isArray(rawState.trips)) {
      throw new Error('Missing trips');
    }

    state = normaliseState(rawState);

    for (const trip of state.trips) {
      recalculateTrip(trip);
    }

    save();
    render();
    showToast('Planner imported');
  }

  function exportJson() {
    const blob = new Blob([JSON.stringify(state, null, 2)], {
      type: 'application/json',
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');

    link.href = url;
    link.download = `packing-planner-${new Date().toISOString().slice(0, 10)}.json`;

    document.body.appendChild(link);
    link.click();
    link.remove();

    URL.revokeObjectURL(url);

    showToast('Save file exported');
  }

  function openJsonModal() {
    els.jsonText.value = JSON.stringify(state, null, 2);
    els.jsonModal.classList.add('open');
    els.jsonText.focus();
    els.jsonText.select();
  }

  function closeJsonModal() {
    els.jsonModal.classList.remove('open');
  }

  async function copyJsonText() {
    els.jsonText.select();

    try {
      await navigator.clipboard.writeText(els.jsonText.value);
    } catch {
      document.execCommand('copy');
    }

    showToast('Copied save text');
  }

  // ---------------------------------------------------------------------------
  // Event wiring
  // ---------------------------------------------------------------------------

  function wireTripControls() {
    els.tripPicker.addEventListener('change', (event) => {
      state.currentTripId = event.target.value;
      save();
      render();
    });

    els.tripName.addEventListener('input', (event) => {
      getCurrentTrip().name = event.target.value;
      save();
      render();
    });

    els.location.addEventListener('input', (event) => {
      getCurrentTrip().location = event.target.value;
      save();
      render();
    });

    els.leaveDate.addEventListener('change', (event) => {
      const currentTrip = getCurrentTrip();

      currentTrip.leaveDate = event.target.value;
      if (event.target.value) {
        currentTrip.calendarMonth = getMonthKey(event.target.value);
      }

      updateDates(currentTrip);
    });

    els.returnDate.addEventListener('change', (event) => {
      const currentTrip = getCurrentTrip();

      currentTrip.returnDate = event.target.value;
      if (event.target.value) {
        currentTrip.calendarMonth = getMonthKey(event.target.value);
      }

      updateDates(currentTrip);
    });

    byId('newTripBtn').addEventListener('click', createNewTrip);
    byId('duplicateTripBtn').addEventListener('click', duplicateCurrentTrip);
    byId('deleteTripBtn').addEventListener('click', deleteCurrentTrip);
  }

  function wireRuleControls() {
    for (const key of ['backup', 'departureWearing', 'laundryDays', 'formalDays']) {
      els[key].addEventListener('input', (event) => {
        updateTripRule(key, wholeNumber(event.target.value));
      });
    }

    els.hotPlace.addEventListener('change', (event) => {
      updateTripRule('hotPlace', event.target.checked);
    });

    els.international.addEventListener('change', (event) => {
      updateTripRule('international', event.target.checked);
    });

    byId('recalculateBtn').addEventListener('click', (event) => {
      event.stopPropagation();

      recalculateTrip(getCurrentTrip());
      save();
      render();
      showToast('Calculated counts reset');
    });

    els.rulesHead.addEventListener('click', (event) => {
      if (event.target.closest('#recalculateBtn') || event.target.closest('#rulesToggle')) {
        return;
      }

      toggleRulesPanel();
    });

    els.rulesHead.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') {
        return;
      }

      event.preventDefault();
      toggleRulesPanel();
    });

    els.rulesToggle.addEventListener('click', (event) => {
      event.stopPropagation();
      toggleRulesPanel();
    });
  }

  function wireCalendarControls() {
    byId('prevMonthBtn').addEventListener('click', () => changeMonth(-1));
    byId('nextMonthBtn').addEventListener('click', () => changeMonth(1));

    byId('clearDatesBtn').addEventListener('click', () => {
      const currentTrip = getCurrentTrip();

      currentTrip.leaveDate = '';
      currentTrip.returnDate = '';

      recalculateTrip(currentTrip);
      save();
      render();
      showToast('Dates cleared');
    });

    els.calendar.addEventListener('click', (event) => {
      const dateButton = event.target.closest('[data-date]');
      if (dateButton) {
        pickDate(dateButton.dataset.date);
      }
    });
  }

  function wireFilterControls() {
    els.searchItems.addEventListener('input', (event) => {
      filters.search = event.target.value;
      renderPackingList(getCurrentTrip());
    });

    els.categoryFilter.addEventListener('change', (event) => {
      filters.category = event.target.value;
      renderPackingList(getCurrentTrip());
    });

    els.bagFilter.addEventListener('change', (event) => {
      filters.bag = event.target.value;
      renderPackingList(getCurrentTrip());
    });

    els.missingOnly.addEventListener('change', (event) => {
      filters.missingOnly = event.target.checked;
      renderPackingList(getCurrentTrip());
    });
  }

  function wirePackingListControls() {
    els.tables.addEventListener('change', (event) => {
      const itemId = event.target.dataset.id;
      const field = event.target.dataset.field;

      if (!itemId || !field) return;

      updateItem(itemId, field, event.target.value);
    });

    els.tables.addEventListener('click', (event) => {
      const category = event.target.closest('[data-toggle-cat]')?.dataset.toggleCat;
      if (category) {
        toggleCategory(category);
        return;
      }

      const packButton = event.target.closest('[data-pack]');
      if (packButton) {
        togglePacked(packButton.dataset.pack);
        return;
      }

      const itemIdToDelete = event.target.dataset.delete;
      if (!itemIdToDelete) return;

      const item = getCurrentTrip().items.find((candidate) => candidate.id === itemIdToDelete);
      if (!item) return;

      if (confirm(`Delete “${item.name}”?`)) {
        getCurrentTrip().items = getCurrentTrip().items.filter(
          (candidate) => candidate.id !== itemIdToDelete,
        );

        save();
        render();
      }
    });

    els.tables.addEventListener('keydown', (event) => {
      if (
        (event.key === 'Enter' || event.key === ' ') &&
        event.target.classList.contains('catHead')
      ) {
        event.preventDefault();
        toggleCategory(event.target.dataset.toggleCat);
      }
    });

    byId('addItemBtn').addEventListener('click', addItem);

    els.newItemName.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        byId('addItemBtn').click();
      }
    });

    byId('packVisibleBtn').addEventListener('click', () => markVisibleItemsAs(true));
    byId('unpackVisibleBtn').addEventListener('click', () => markVisibleItemsAs(false));
    byId('resetPackedBtn').addEventListener('click', clearAllPackedChecks);
  }

  function wireImportExportControls() {
    byId('exportBtn').addEventListener('click', exportJson);

    byId('importBtn').addEventListener('click', () => {
      byId('importFile').click();
    });

    byId('importFile').addEventListener('change', async (event) => {
      const file = event.target.files[0];
      if (!file) return;

      try {
        importState(JSON.parse(await file.text()));
      } catch {
        alert('Could not import this file. It does not look like a Packing Planner JSON file.');
      }

      event.target.value = '';
    });

    byId('jsonBtn').addEventListener('click', openJsonModal);
    byId('closeJsonBtn').addEventListener('click', closeJsonModal);

    els.jsonModal.addEventListener('click', (event) => {
      if (event.target === els.jsonModal) {
        closeJsonModal();
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        closeJsonModal();
      }
    });

    byId('copyJsonBtn').addEventListener('click', copyJsonText);

    byId('importJsonTextBtn').addEventListener('click', () => {
      try {
        importState(JSON.parse(els.jsonText.value));
        closeJsonModal();
      } catch {
        alert('Could not import that pasted text.');
      }
    });
  }

  function wireEvents() {
    wireTripControls();
    wireRuleControls();
    wireCalendarControls();
    wireFilterControls();
    wirePackingListControls();
    wireImportExportControls();
  }

  // ---------------------------------------------------------------------------
  // Start app
  // ---------------------------------------------------------------------------

  for (const trip of state.trips) {
    recalculateTrip(trip);
  }

  wireEvents();
  render();
  save();
})();