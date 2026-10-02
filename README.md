# Packing Planner

Open `index.html` in a modern browser. Trip data autosaves locally; use Export for a backup.

## Destination and weather

1. Type a city or postal code in **Location**. Matching places appear after a short pause; no destination country is required.
2. Click a match to fill in its city, region, and country. Use Arrow Down to reach suggestions, arrow keys to move, Enter to select, and Escape to dismiss. Press Enter in Location to retry a search.
3. Choose your **Home country / territory** and **Automatic by country** to update international packing items. Existing saved trips retain manual control until you choose automatic detection. Changing the International travel toggle in Packing rules returns to manual mode.
4. With trip dates selected, confirming a destination checks its forecast. Use **Check trip weather** to refresh it after changing dates.

Country detection compares country/territory codes, not entry requirements or citizenship. Unknown destinations retain the existing international packing setting. Weather shows available trip dates only, in Celsius, with condition icons and personal threshold highlights. Automatic weather rules add hot-weather items or rain/jacket items when any available trip day meets your threshold. Switching either weather toggle manually puts the trip in manual weather mode. Forecasts cover today through the next 15 days; partial coverage is labelled. Weather results are temporary and display their fetch time.

Lookups require internet access and send the destination query or coordinates to Open-Meteo. No API key is needed for its public non-commercial service. Commercial deployment requires reviewing [Open-Meteo's licence and plans](https://open-meteo.com/en/pricing). Location data is provided by GeoNames via Open-Meteo.

## Personal settings

Open **Settings** in the header to save your home city and country, hot temperature (default 25°C), and jacket rain probability (default 50%). Thresholds are inclusive and use each day’s high temperature and maximum precipitation probability. Settings are saved locally and included in import/export. Home city is a descriptive label; the selected country drives international detection for trips set to **Use home settings**. A trip can override that country.

Forecast days meeting your thresholds show **Hot** and **Bring a jacket** badges, even in manual mode. One matching day, including departure or return, enables the corresponding automatic rule. A rule is turned off only when the entire trip has valid below-threshold data; missing rain probabilities or partial coverage retain its existing setting. No forecast or a failed lookup preserves existing quantities. Changing thresholds re-evaluates the currently displayed forecast; check weather again for other trips.

The default jacket uses the **Rain / jacket** rule. Existing default jackets (named Jacket, manual quantity 1 checked / 0 carry-on) migrate to this rule; edited quantities and other manual items are preserved. You can assign the rule to other rain items in item details. **Per day** retains the original daily calculation, adjusted for laundry and backups.

## Verification

Run `node --check script.js` and `node --test tests/packing.test.cjs`.
Tests use a minimal DOM adapter and mocked lookup responses; they do not provide visual browser coverage.
