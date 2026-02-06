// --- 1. SETUP & DATA ---
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

var img2024 = getAnnualImage('2024-05-01', '2024-09-01');
var img2025 = getAnnualImage('2025-05-01', '2025-09-01');

// --- 2. INTELLIGENT ALERT CALCULATION ---

// Condition A: It WAS healthy forest in 2024
var wasForest = img2024.select('NDVI').gt(0.7);

// Condition B: It IS bare soil/degraded in 2025
// I lowered this to 0.40 to be stricter (less false noise)
var isBare = img2025.select('NDVI').lt(0.40);

// Combine them: 1 = Deforestation, 0 = Everything else
var potentialDeforestation = wasForest.and(isBare);

// Remove small noise specks (must be a cluster of >20 pixels)
var patchSize = potentialDeforestation.connectedPixelCount(100, true);
var filtered = potentialDeforestation.updateMask(patchSize.gt(20));

// *** THE FIX ***
// .selfMask() turns all "0" values into Transparency.
// Now, only "1" (Deforestation) will exist on the map layer.
var alerts = filtered.selfMask(); 

// --- 3. UI VISUALIZATION ---

var trueColorVis = {
  min: 0.0,
  max: 0.3,
  bands: ['B4', 'B3', 'B2'],
};

// Alert Color: Bright Red
var alertVis = {palette: ['red']}; 

// LEFT MAP
var leftMap = ui.Map();
leftMap.addLayer(img2024, trueColorVis, '2024 (Before)');
leftMap.setControlVisibility(false);

// RIGHT MAP
var rightMap = ui.Map();
rightMap.addLayer(img2025, trueColorVis, '2025 (After)');
// The alerts layer is now properly masked (transparent background)
rightMap.addLayer(alerts, alertVis, 'CONFIRMED ALERTS');
rightMap.setControlVisibility(false);

var splitPanel = ui.SplitPanel({
  firstPanel: leftMap,
  secondPanel: rightMap,
  wipe: true,
  style: {stretch: 'both'}
});

ui.root.widgets().reset([splitPanel]);
var linker = ui.Map.Linker([leftMap, rightMap]);
leftMap.centerObject(parana, 8);

print("Fix applied: Background is now transparent. Only confirmed alerts are red.");
