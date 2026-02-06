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

// --- 2. ALERT CALCULATION ---
// Summer forests are very green, so we keep high threshold (0.75)
var wasForest = imgBaseline.select('NDVI').gt(0.75);
var isBare = imgRecent.select('NDVI').lt(0.40); // Bare soil stands out in summer

var potentialDeforestation = wasForest.and(isBare);
var patchSize = potentialDeforestation.connectedPixelCount(100, true);
var alerts = potentialDeforestation.updateMask(patchSize.gt(20)).selfMask();

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
var alertsLayer = rightMap.addLayer(alerts, alertVis, 'NEW ALERTS (2026)');
rightMap.setControlVisibility({layerList: true});

// --- 5. WIDGET PANEL ---
var panel = ui.Panel({
  style: {
    position: 'bottom-right',
    padding: '8px 15px',
    backgroundColor: 'rgba(255, 255, 255, 0.9)'
  }
});

var checkbox = ui.Checkbox({
  label: 'Show 2026 Alerts',
  value: true,
  onChange: function(checked) {
    alertsLayer.setShown(checked);
  }
});

var sliderLabel = ui.Label('Opacity:', {fontSize: '12px', color: 'gray'});
var slider = ui.Slider({
  min: 0,
  max: 1,
  step: 0.1,
  value: 1,
  style: {width: '150px'},
  onChange: function(value) {
    alertsLayer.setOpacity(value);
  }
});

panel.add(checkbox);
panel.add(sliderLabel);
panel.add(slider);
rightMap.add(panel);

// --- 6. RENDER ---
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