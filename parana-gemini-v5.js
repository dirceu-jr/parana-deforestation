// --- 1. SETUP & DATA ---
var states = ee.FeatureCollection("FAO/GAUL/2015/level1");
var parana = states.filter(ee.Filter.eq('ADM1_NAME', 'Parana'));

// Center slightly zoomed out to see more context
Map.centerObject(parana, 8);

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

var img2024 = getAnnualImage('2024-05-01', '2024-09-01');
var img2025 = getAnnualImage('2025-05-01', '2025-09-01');

// --- 2. INTELLIGENT ALERT CALCULATION ---
var wasForest = img2024.select('NDVI').gt(0.7);
var isBare = img2025.select('NDVI').lt(0.40);

var potentialDeforestation = wasForest.and(isBare);

// Spatial Filter: > 20 pixels (0.2 ha)
var patchSize = potentialDeforestation.connectedPixelCount(100, true);

// Visualization Mask: Remove "0" values so they are transparent
var alerts = potentialDeforestation.updateMask(patchSize.gt(20)).selfMask();

// --- 3. VISUALIZATION ---

var trueColorVis = {
  min: 0.0,
  max: 0.3,
  bands: ['B4', 'B3', 'B2'],
};

var alertVis = {palette: ['red']}; 

// LEFT MAP
var leftMap = ui.Map();
leftMap.addLayer(img2024, trueColorVis, '2024 (Before)');
leftMap.setControlVisibility(false);

// RIGHT MAP
var rightMap = ui.Map();
rightMap.addLayer(img2025, trueColorVis, '2025 (After)');
rightMap.addLayer(alerts, alertVis, 'CONFIRMED ALERTS'); // Red overlay
rightMap.setControlVisibility(false);

// SPLIT PANEL
var splitPanel = ui.SplitPanel({
  firstPanel: leftMap,
  secondPanel: rightMap,
  wipe: true,
  style: {stretch: 'both'}
});

ui.root.widgets().reset([splitPanel]);
var linker = ui.Map.Linker([leftMap, rightMap]);
leftMap.centerObject(parana, 9);

print("Viewer Ready. Swipe to validate red alerts.");