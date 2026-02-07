// --- 1. SETUP & DATA ---
var states = ee.FeatureCollection("FAO/GAUL/2015/level1");
var parana = states.filter(ee.Filter.eq('ADM1_NAME', 'Parana'));

var protectedAreas = ee.FeatureCollection("WCMC/WDPA/current/polygons")
  .filter(ee.Filter.eq('ISO3', 'BRA'))
  .filterBounds(parana);

// CLOUD MASK (Critical for Summer/Wet Season)
function maskS2clouds(image) {
  var qa = image.select('QA60');
  var mask = qa.bitwiseAnd(1<<10).eq(0).and(qa.bitwiseAnd(1<<11).eq(0));
  return image.updateMask(mask).divide(10000);
}

function addNDVI(image) {
  return image.addBands(image.normalizedDifference(['B8', 'B4']).rename('NDVI'));
}

function getAnnualImage(start, end) {
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterDate(start, end)
    .filterBounds(parana)
    // Relaxed Cloud Filter: 30% allowed because Feb is cloudy
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
    .map(maskS2clouds)
    .map(addNDVI)
    .median()
    .clip(parana);
}

// --- UPDATED DATES (SUMMER COMPARISON) ---
// Baseline: The previous Summer (Sept 2024 - Feb 2025)
var imgBaseline = getAnnualImage('2024-09-01', '2025-02-05');

// Current: The current Summer (Sept 2025 - TODAY Feb 5, 2026)
var imgRecent = getAnnualImage('2025-09-01', '2026-02-05');

// --- 2. ALERT CALCULATION (HIGH-CONFIDENCE, LARGE AREAS ONLY) ---
// Strict forest definition: only dense, unambiguous forest
var baselineNDVI = imgBaseline.select('NDVI');
var recentNDVI = imgRecent.select('NDVI');
var wasForest = baselineNDVI.gt(0.80);
var isBare = recentNDVI.lt(0.30);

// Require a large NDVI drop (>0.40) to rule out seasonal/sensor noise
var ndviDrop = baselineNDVI.subtract(recentNDVI);
var largeDrop = ndviDrop.gt(0.40);

var potentialDeforestation = wasForest.and(isBare).and(largeDrop);

// Only keep large contiguous clearings (~2.5 ha at 10 m = 250 px)
var patchSize = potentialDeforestation.connectedPixelCount(256, true);
var alerts = potentialDeforestation.updateMask(patchSize.gte(250)).selfMask();

// --- 3. VISUALIZATION LAYERS ---
// Slightly brighter visualization for Summer images
var trueColorVis = {min: 0.0, max: 0.25, bands: ['B4', 'B3', 'B2']};
var alertVis = {palette: ['red']};
var parkOutlines = ee.Image().paint({featureCollection: protectedAreas, color: 1, width: 3});

// --- 4. MAP SETUP ---

// LEFT MAP (Baseline 2024/25)
var leftMap = ui.Map();
leftMap.addLayer(imgBaseline, trueColorVis, 'Baseline (2024-25)');
leftMap.addLayer(parkOutlines, {palette: ['00FF00']}, 'Protected Borders');
leftMap.setControlVisibility(false);

// RIGHT MAP (Current 2026)
var rightMap = ui.Map();
rightMap.addLayer(imgRecent, trueColorVis, 'Current (2025-26)');
rightMap.addLayer(parkOutlines, {palette: ['00FF00']}, 'Protected Borders');

// Detailed alerts layer (visible when zoomed in)
var alertsLayer = rightMap.addLayer(alerts, alertVis, 'Alerts (detail)');
rightMap.setControlVisibility({layerList: true});

// --- 5. RENDER ---
var splitPanel = ui.SplitPanel({
  firstPanel: leftMap,
  secondPanel: rightMap,
  wipe: true,
  style: {stretch: 'both'}
});

ui.root.widgets().reset([splitPanel]);
var linker = ui.Map.Linker([leftMap, rightMap]);
leftMap.centerObject(parana, 8); // Centered on Paraná

print("Updated for Feb 5, 2026. Comparing Summer 24/25 vs Summer 25/26.");
