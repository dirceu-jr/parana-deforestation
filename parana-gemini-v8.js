// Paraná - Deforestation Detection
// Suppose I work as a volunteer for "Paraná Environmental Institute" and I want to help to identify deforestation areas in Paraná state (Brazil).
// What/how should I develop?

// --- 1. SETUP & DATA ---
var states = ee.FeatureCollection("FAO/GAUL/2015/level1");
var parana = states.filter(ee.Filter.eq('ADM1_NAME', 'Parana'));
Map.centerObject(parana, 8);

var protectedAreas = ee.FeatureCollection("WCMC/WDPA/current/polygons")
  .filter(ee.Filter.eq('ISO3', 'BRA'))
  .filterBounds(parana);

// --- 2. CORE FUNCTIONS ---

function maskS2clouds(image) {
  var qa = image.select('QA60');
  var mask = qa.bitwiseAnd(1<<10).eq(0).and(qa.bitwiseAnd(1<<11).eq(0));
  return image.updateMask(mask).divide(10000);
}

function addNDVI(image) {
  return image.addBands(image.normalizedDifference(['B8', 'B4']).rename('NDVI'));
}

// Helper to get image for a specific window
function getImage(start, end) {
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterDate(start, end)
    .filterBounds(parana)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40)) // 40% allowed for flexibility
    .map(maskS2clouds)
    .map(addNDVI)
    .median() // Takes the median pixel of the period
    .clip(parana);
}

// --- 3. BASELINE (FIXED) ---
// We compare against the "Previous Year" (2024-2025)
// This doesn't need to change when you move the slider.
var imgBaseline = getImage('2024-09-01', '2025-03-01');
var wasForest = imgBaseline.select('NDVI').gt(0.75);

// --- 4. VISUALIZATION ---
var trueColorVis = {min: 0.0, max: 0.25, bands: ['B4', 'B3', 'B2']};
var alertVis = {palette: ['red']};
var parkOutlines = ee.Image().paint({featureCollection: protectedAreas, color: 1, width: 3});

// --- 5. INITIALIZE MAPS ---

var leftMap = ui.Map();
leftMap.addLayer(imgBaseline, trueColorVis, 'Baseline (Prev Year)');
leftMap.addLayer(parkOutlines, {palette: ['00FF00']}, 'Protected Areas');
leftMap.setControlVisibility(false);

var rightMap = ui.Map();
rightMap.setControlVisibility(false);
// We don't add layers to rightMap yet; the function below will do it.

// --- 6. THE UPDATE FUNCTION ---
function updateAnalysis() {
  // Fixed analysis date (4-month lookback)
  var endDate = ee.Date('2026-02-05');
  var startDate = endDate.advance(-4, 'month');
  
  // Get the Image
  var imgRecent = getImage(startDate, endDate);
  
  // Calculate Alerts
  var isBare = imgRecent.select('NDVI').lt(0.40);
  var potentialDeforestation = wasForest.and(isBare);
  var patchSize = potentialDeforestation.connectedPixelCount(100, true);
  var alerts = potentialDeforestation.updateMask(patchSize.gt(20)).selfMask();
  
  // Update the Map
  rightMap.clear();
  rightMap.addLayer(imgRecent, trueColorVis, 'Current Status');
  rightMap.addLayer(parkOutlines, {palette: ['00FF00']}, 'Protected Areas');
  var alertLayer = rightMap.addLayer(alerts, alertVis, 'ALERTS');
  rightMap.add(panel);
}

// --- 7. CONTROL PANEL ---

var panel = ui.Panel({
  style: {
    position: 'bottom-right',
    padding: '8px',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    width: '300px'
  }
});

var label = ui.Label('Deforestation Alerts', {fontWeight: 'bold'});

// Opacity Slider
var opacitySlider = ui.Slider({
  min: 0, max: 1, step: 0.1, value: 1,
  style: {stretch: 'horizontal'},
  onChange: function(value) {
    if (rightMap.layers().length() > 2) {
      rightMap.layers().get(2).setOpacity(value);
    }
  }
});

panel.add(label);
panel.add(ui.Label('Alert Opacity:'));
panel.add(opacitySlider);

rightMap.add(panel);

// --- 8. RENDER ---

var splitPanel = ui.SplitPanel({
  firstPanel: leftMap,
  secondPanel: rightMap,
  wipe: true,
  style: {stretch: 'both'}
});

ui.root.widgets().reset([splitPanel]);
var linker = ui.Map.Linker([leftMap, rightMap]);
leftMap.setCenter(-51.5, -25.0, 8);

// Trigger first run manually
updateAnalysis();

