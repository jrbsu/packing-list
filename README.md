# Packing Planner

Open `index.html` in a modern browser. Trip data autosaves locally; use Export for a backup.

## Destination and weather

1. Type a city or postal code in **Location**. Matching places appear after a short pause; no destination country is required.
2. Click a match to fill in its city, region, and country. Use Arrow Down to reach suggestions, arrow keys to move, Enter to select, and Escape to dismiss. Press Enter in Location to retry a search.
3. Choose your **Home country / territory** and **Automatic by country** to update international packing items. Existing saved trips retain manual control until you choose automatic detection. Changing the International travel toggle in Packing rules returns to manual mode.
4. With trip dates selected, confirming a destination checks its forecast. Use **Check trip weather** to refresh it after changing dates.

Country detection compares country/territory codes, not entry requirements or citizenship. Unknown destinations retain the existing international packing setting. Weather shows available trip dates only, in Celsius, and never changes the hot-weather rule. Forecasts cover today through the next 15 days; partial coverage is labelled. Weather results are temporary and display their fetch time.

Lookups require internet access and send the destination query or coordinates to Open-Meteo. No API key is needed for its public non-commercial service. Commercial deployment requires reviewing [Open-Meteo's licence and plans](https://open-meteo.com/en/pricing). Location data is provided by GeoNames via Open-Meteo.

## Verification

Run `node --check script.js` and `node --test tests/packing.test.cjs`.
Tests use a minimal DOM adapter and mocked lookup responses; they do not provide visual browser coverage.
