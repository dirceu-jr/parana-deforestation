// --- 1. SETUP & DATA (Same logic as before) ---
var states = ee.FeatureCollection("FAO/GAUL/2015/level1");
var parana = states.filter(ee.Filter.eq('ADM1_NAME', 'Parana'));

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
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
    .map(maskS2clouds)
    .map(addNDVI)
    .median()
    .clip(parana);
}

// Load Images
var img2024 = getAnnualImage('2024-05-01', '2024-09-01');
var img2025 = getAnnualImage('2025-05-01', '2025-09-01');

// --- 2. INTELLIGENT ALERT CALCULATION ---
var wasForest = img2024.select('NDVI').gt(0.7);
var isBare = img2025.select('NDVI').lt(0.45);
var potentialDeforestation = wasForest.and(isBare);
var patchSize = potentialDeforestation.connectedPixelCount(100, true);
var alerts = potentialDeforestation.updateMask(patchSize.gt(20)); 

// --- 3. BUILD THE USER INTERFACE (UI) ---

// Visualization for the Satellite Image (False Color is best for validation)
var visParams = {
  min: 0.0,
  max: 0.3,
  bands: ['B8', 'B4', 'B3'], // NIR, Red, Green
};

// Visualization for the Alerts
var alertVis = {palette: ['red']};

// Create the LEFT Map (2024 Baseline)
var leftMap = ui.Map();
leftMap.addLayer(img2024, visParams, '2024 (Before)');
leftMap.setControlVisibility(false); // Hide controls to keep it clean

// Create the RIGHT Map (2025 + Alerts)
var rightMap = ui.Map();
rightMap.addLayer(img2025, visParams, '2025 (After)');
rightMap.addLayer(alerts, alertVis, 'RED ALERTS'); // Overlay the alerts
rightMap.setControlVisibility(false);

// Create the SplitPanel (The Slider)
var splitPanel = ui.SplitPanel({
  firstPanel: leftMap,
  secondPanel: rightMap,
  wipe: true, // This enables the "Swipe" effect
  style: {stretch: 'both'}
});

// Link the two maps so they zoom and pan together
var linker = ui.Map.Linker([leftMap, rightMap]);

// Reset the Root interface and add our split panel
ui.root.widgets().reset([splitPanel]);

// Center on a specific interesting area (or just Paraná)
// I set a coordinate near Guarapuava where forestry is common for a test
leftMap.centerObject(parana, 8);

print("Validation Tool Ready. Drag the slider left/right.");