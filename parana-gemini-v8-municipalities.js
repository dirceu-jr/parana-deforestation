// --- 1. SETUP & DATA ---
var states = ee.FeatureCollection("FAO/GAUL/2015/level1");
var parana = states.filter(ee.Filter.eq('ADM1_NAME', 'Parana'));

// Load municipalities within Paraná
var municipalities = ee.FeatureCollection("FAO/GAUL/2015/level2")
  .filter(ee.Filter.eq('ADM1_NAME', 'Parana'));

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

function getAnnualImage(region, start, end) {
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterDate(start, end)
    .filterBounds(region)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
    .map(maskS2clouds)
    .map(addNDVI)
    .median()
    .clip(region);
}

// --- VISUALIZATION SETTINGS ---
var trueColorVis = {min: 0.0, max: 0.25, bands: ['B4', 'B3', 'B2']};
var alertVis = {palette: ['red']};

// --- MAP SETUP ---
var leftMap = ui.Map();
var rightMap = ui.Map();

leftMap.setControlVisibility(false);
rightMap.setControlVisibility({layerList: true});

var splitPanel = ui.SplitPanel({
  firstPanel: leftMap,
  secondPanel: rightMap,
  wipe: true,
  style: {stretch: 'both'}
});

ui.root.widgets().reset([splitPanel]);
var linker = ui.Map.Linker([leftMap, rightMap]);

// --- MUNICIPALITY SELECTOR ---
var selectorPanel = ui.Panel({
  style: {
    position: 'top-left',
    padding: '8px 15px',
    backgroundColor: 'rgba(255, 255, 255, 0.95)'
  }
});

var titleLabel = ui.Label('Paraná Deforestation Alerts', {
  fontWeight: 'bold',
  fontSize: '16px',
  margin: '0 0 8px 0'
});

var selectLabel = ui.Label('Select Municipality:', {
  fontSize: '12px',
  color: 'gray'
});

// Get municipality names and populate dropdown
var munNames = municipalities.aggregate_array('ADM2_NAME').sort();

var municipalitySelector = ui.Select({
  placeholder: 'Loading municipalities...',
  onChange: function(munName) {
    runAnalysis(munName);
  }
});

// Load the municipality names asynchronously
munNames.evaluate(function(names) {
  municipalitySelector.items().reset(names);
  municipalitySelector.setPlaceholder('Choose a municipality');
});

selectorPanel.add(titleLabel);
selectorPanel.add(selectLabel);
selectorPanel.add(municipalitySelector);
leftMap.add(selectorPanel);

// --- ANALYSIS FUNCTION ---
function runAnalysis(municipalityName) {
  // Clear previous layers
  leftMap.layers().reset();
  rightMap.layers().reset();

  // Get selected municipality
  var region = municipalities.filter(ee.Filter.eq('ADM2_NAME', municipalityName));

  // Filter protected areas to this municipality
  var localProtectedAreas = protectedAreas.filterBounds(region);

  // Get baseline and current images
  var imgBaseline = getAnnualImage(region, '2024-09-01', '2025-02-05');
  var imgRecent = getAnnualImage(region, '2025-09-01', '2026-02-05');

  // Calculate alerts
  var wasForest = imgBaseline.select('NDVI').gt(0.75);
  var isBare = imgRecent.select('NDVI').lt(0.40);

  var potentialDeforestation = wasForest.and(isBare);
  var patchSize = potentialDeforestation.connectedPixelCount(100, true);
  var alerts = potentialDeforestation.updateMask(patchSize.gt(20)).selfMask();

  // Park outlines
  var parkOutlines = ee.Image().paint({
    featureCollection: localProtectedAreas, 
    color: 1, 
    width: 3
  });

  // Add layers to LEFT MAP (Baseline)
  leftMap.addLayer(imgBaseline, trueColorVis, 'Baseline (2024-25)');
  leftMap.addLayer(parkOutlines, {palette: ['00FF00']}, 'Protected Borders');

  // Add layers to RIGHT MAP (Current + Alerts)
  rightMap.addLayer(imgRecent, trueColorVis, 'Current (2025-26)');
  rightMap.addLayer(parkOutlines, {palette: ['00FF00']}, 'Protected Borders');
  alertsLayer = rightMap.addLayer(alerts, alertVis, 'NEW ALERTS (2026)');

  // Reset checkbox state
  checkbox.setValue(true);
  slider.setValue(1);

  // Center on the selected municipality
  leftMap.centerObject(region, 11);

  print('Analysis complete for: ' + municipalityName);
}

// --- INITIAL VIEW ---
leftMap.centerObject(parana, 7);
print('Select a municipality from the dropdown to begin analysis.');
