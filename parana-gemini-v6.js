// --- 1. SETUP & DATA ---
var states = ee.FeatureCollection("FAO/GAUL/2015/level1");
var parana = states.filter(ee.Filter.eq('ADM1_NAME', 'Parana'));
Map.centerObject(parana, 8);

var protectedAreas = ee.FeatureCollection("WCMC/WDPA/current/polygons")
  .filter(ee.Filter.eq('ISO3', 'BRA')) 
  .filterBounds(parana); 

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

// --- 2. ALERT CALCULATION ---
var wasForest = img2024.select('NDVI').gt(0.7);
var isBare = img2025.select('NDVI').lt(0.40);
var potentialDeforestation = wasForest.and(isBare);
var patchSize = potentialDeforestation.connectedPixelCount(100, true);
var alerts = potentialDeforestation.updateMask(patchSize.gt(20)).selfMask();

// --- 3. VISUALIZATION LAYERS ---
var trueColorVis = {min: 0.0, max: 0.3, bands: ['B4', 'B3', 'B2']};
var alertVis = {palette: ['red']}; 
var parkOutlines = ee.Image().paint({featureCollection: protectedAreas, color: 1, width: 3});

// --- 4. MAP SETUP ---

// LEFT MAP
var leftMap = ui.Map();
leftMap.addLayer(img2024, trueColorVis, '2024 (Before)');
leftMap.addLayer(parkOutlines, {palette: ['00FF00']}, 'Protected Borders');
leftMap.setControlVisibility(false);

// RIGHT MAP
var rightMap = ui.Map();
rightMap.addLayer(img2025, trueColorVis, '2025 (After)');
rightMap.addLayer(parkOutlines, {palette: ['00FF00']}, 'Protected Borders');

// Add the Alerts layer but SAVE it to a variable so we can control it later
var alertsLayer = rightMap.addLayer(alerts, alertVis, 'ALL ALERTS');
rightMap.setControlVisibility(false);

// --- 5. CREATE THE WIDGET PANEL ---

// Create a panel to hold the controls
var panel = ui.Panel({
  style: {
    position: 'bottom-right',
    padding: '8px 15px',
    backgroundColor: 'rgba(255, 255, 255, 0.8)' // Semi-transparent white
  }
});

// 1. Checkbox to Show/Hide
var checkbox = ui.Checkbox({
  label: 'Show Red Alerts',
  value: true,
  onChange: function(checked) {
    // This turns the layer on or off
    alertsLayer.setShown(checked);
  }
});

// 2. Slider for Transparency (Opacity)
var sliderLabel = ui.Label('Alert Opacity:', {fontSize: '12px', color: 'gray'});
var slider = ui.Slider({
  min: 0,
  max: 1,
  step: 0.1,
  value: 1, // Start fully visible
  style: {width: '150px'},
  onChange: function(value) {
    // This changes how "ghostly" the red is
    alertsLayer.setOpacity(value);
  }
});

// Add widgets to the panel
panel.add(checkbox);
panel.add(sliderLabel);
panel.add(slider);

// Add the panel to the RIGHT map
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
leftMap.setCenter(-50.16, -25.09, 10);

print("Tool Updated: Use the control panel in the bottom-right corner.");