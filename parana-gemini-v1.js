// --- 1. DEFINE REGION (PARANÁ) ---
var states = ee.FeatureCollection("FAO/GAUL/2015/level1");
var parana = states
  .filter(ee.Filter.eq('ADM0_NAME', 'Brazil'))
  .filter(ee.Filter.eq('ADM1_NAME', 'Parana'));

Map.centerObject(parana, 7);

// --- 2. CLOUD MASK FUNCTION ---
function maskS2clouds(image) {
  var qa = image.select('QA60');
  var cloudBitMask = 1 << 10;
  var cirrusBitMask = 1 << 11;
  var mask = qa.bitwiseAnd(cloudBitMask).eq(0)
      .and(qa.bitwiseAnd(cirrusBitMask).eq(0));
  return image.updateMask(mask).divide(10000);
}

// --- 3. LOAD & PROCESS DATA ---
var dataset = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
  .filterDate('2025-01-01', '2026-01-01')
  .filterBounds(parana)
  .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20))
  .map(maskS2clouds);

// Create the median composite image
var image = dataset.median().clip(parana);

// --- 4. CALCULATE NDVI ---
// Formula: (NIR - RED) / (NIR + RED)
// Sentinel-2 Bands: NIR = B8, Red = B4
var ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI');

// --- 5. VISUALIZATION ---

// False Color (Good for spotting vegetation vs urban)
var falseColorVis = {
  min: 0.0,
  max: 0.3,
  bands: ['B8', 'B4', 'B3'],
};

// NDVI Visualization
// Palette: Red (Bare/Dead) -> Yellow (Sparse) -> Green (Dense Forest)
var ndviVis = {
  min: 0.0,
  max: 0.8,
  palette: ['red', 'orange', 'yellow', 'green', 'darkgreen'],
};

// Add Layers
Map.addLayer(parana, {}, 'Paraná Boundary', false);
Map.addLayer(image, falseColorVis, 'False Color (Vegetation)', false);
Map.addLayer(ndvi, ndviVis, 'NDVI (Vegetation Health)');

// --- 6. (Optional) INSPECTOR TOOL ---
// Print a chart to the console if you click on the map (later step)
print('Use the Inspector tab on the right to click areas and see pixel values.');
