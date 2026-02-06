// --- 1. DEFINE REGION ---
var states = ee.FeatureCollection("FAO/GAUL/2015/level1");
var parana = states
  .filter(ee.Filter.eq('ADM0_NAME', 'Brazil'))
  .filter(ee.Filter.eq('ADM1_NAME', 'Parana'));

Map.centerObject(parana, 7);

// --- 2. PRE-PROCESSING FUNCTIONS ---
function maskS2clouds(image) {
  var qa = image.select('QA60');
  var mask = qa.bitwiseAnd(1<<10).eq(0).and(qa.bitwiseAnd(1<<11).eq(0));
  return image.updateMask(mask).divide(10000);
}

function addNDVI(image) {
  return image.addBands(image.normalizedDifference(['B8', 'B4']).rename('NDVI'));
}

function getAnnualNDVI(start, end) {
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterDate(start, end)
    .filterBounds(parana)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
    .map(maskS2clouds)
    .map(addNDVI)
    .median()
    .clip(parana)
    .select('NDVI');
}

// --- 3. EXECUTE INTELLIGENT ANALYSIS ---

// Step A: Get the data (Dry Season for stability)
var ndvi_2024 = getAnnualNDVI('2024-05-01', '2024-09-01');
var ndvi_2025 = getAnnualNDVI('2025-05-01', '2025-09-01');

// Step B: Define "What is Forest?"
// Rule 1: In 2024, it must have been dense vegetation (NDVI > 0.7)
// This excludes most crops, which rarely stay above 0.7 for the whole median period.
var wasForest = ndvi_2024.gt(0.7);

// Step C: Define "What is Loss?"
// Rule 2: In 2025, it must be significantly lower (NDVI < 0.45)
// We don't just use subtraction; we force the final state to be "bare".
var isBare = ndvi_2025.lt(0.45);

// Combine: It WAS forest AND it IS NOW bare.
var potentialDeforestation = wasForest.and(isBare);

// Step D: The "Sieve" (Spatial Filter)
// Rule 3: Eliminate noise. We only want patches larger than 0.5 hectares.
// Sentinel pixel is ~100m2. 50 pixels = ~5000m2 (0.5 ha).
var patchSize = potentialDeforestation.connectedPixelCount(100, true);
var intelligentAlerts = potentialDeforestation.updateMask(patchSize.gt(20)); // Keep only clusters > 20 pixels

// --- 4. VISUALIZATION ---

var alertVis = {
  min: 0,
  max: 1,
  palette: ['red']
};

Map.addLayer(ndvi_2025, {min: 0, max: 0.8, palette: ['white', 'grey', 'green']}, 'NDVI 2025 (Context)', false);
// This layer will now be MUCH cleaner:
Map.addLayer(intelligentAlerts, alertVis, 'High-Confidence Alerts');

print("Filtering Complete. Showing only clusters > 0.2ha that transitioned from Dense Forest to Bare Soil.");
