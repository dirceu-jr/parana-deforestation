// --- 1. SETUP & DATA ---
var states = ee.FeatureCollection("FAO/GAUL/2015/level1");
var parana = states.filter(ee.Filter.eq('ADM1_NAME', 'Parana'));

var protectedAreas = ee.FeatureCollection("WCMC/WDPA/current/polygons")
  .filter(ee.Filter.eq('ISO3', 'BRA'))
  .filterBounds(parana);

// CLOUD MASK
function maskS2clouds(image) {
  var qa = image.select('QA60');
  var mask = qa.bitwiseAnd(1<<10).eq(0).and(qa.bitwiseAnd(1<<11).eq(0));
  return image.updateMask(mask).divide(10000);
}

function addNDVI(image) {
  return image.addBands(image.normalizedDifference(['B8', 'B4']).rename('NDVI'));
}

function getImage(start, end) {
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterDate(start, end)
    .filterBounds(parana)
    // Relaxed to 50% — short windows have fewer cloud-free scenes
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 50))
    .map(maskS2clouds)
    .map(addNDVI)
    .median()
    .clip(parana);
}

// --- MONTHLY COMPARISON DATES ---
// Baseline: 2 months before (longer window = cleaner composite)
var imgBaseline = getImage('2025-11-01', '2026-01-05');

// Current: last month only
var imgRecent = getImage('2026-01-05', '2026-02-06');

// --- 2. ALERT CALCULATION ---
// Forest threshold stays high — both periods are mid-summer
var wasForest = imgBaseline.select('NDVI').gt(0.75);
var isBare = imgRecent.select('NDVI').lt(0.40);

var potentialDeforestation = wasForest.and(isBare);

// Lower patch threshold: recent clearing may be smaller parcels
var patchSize = potentialDeforestation.connectedPixelCount(50, true);
var alerts = potentialDeforestation.updateMask(patchSize.gt(5)).selfMask();

// --- 3. VISUALIZATION ---
var trueColorVis = {min: 0.0, max: 0.25, bands: ['B4', 'B3', 'B2']};
var alertVis = {palette: ['red']};
var parkOutlines = ee.Image().paint({featureCollection: protectedAreas, color: 1, width: 3});

// --- 4. MAP SETUP ---

// LEFT MAP (Baseline Nov-Jan)
var leftMap = ui.Map();
leftMap.addLayer(imgBaseline, trueColorVis, 'Baseline (Nov 25 – Jan 26)');
leftMap.addLayer(parkOutlines, {palette: ['00FF00']}, 'Protected Borders');
leftMap.setControlVisibility(false);

// RIGHT MAP (Current Jan-Feb + Alerts)
var rightMap = ui.Map();
rightMap.addLayer(imgRecent, trueColorVis, 'Current (Jan – Feb 2026)');
rightMap.addLayer(parkOutlines, {palette: ['00FF00']}, 'Protected Borders');

var alertsLayer = rightMap.addLayer(alerts, alertVis, 'NEW ALERTS (last month)');
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
  label: 'Show Last-Month Alerts',
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
leftMap.centerObject(parana, 8);

print("Monthly detection: Baseline (Nov-Jan) vs. Current (Jan 5 - Feb 6, 2026).");
