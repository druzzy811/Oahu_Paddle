/* === strava_api.js (fast offshore coverage, auto refresh) =============== */

const auth_link = "https://www.strava.com/oauth/token";

/** ======================= CONFIG ===================================== **/
const COASTLINE_URL = "coastline_oahu_linestring.geojson"; // same folder or GitHub Pages
let RENDER_COVERAGE_SEGMENTS = false;

// match radius cap for offshore mapping (km). anything farther is ignored.
// set to a big value if you truly want any offshore parallel to count.
const OFFSHORE_MAX_KM = 12;

// sampling along each track (km)
const SAMPLE_STEP_KM = 0.2; // 200 m

// auto refresh activities every N ms
const AUTO_REFRESH_MS = 120000;
/** ===================================================================== **/

let currentActivities = [];
let polylines = [];
let lastPolyline = null;

// coastline holders
let coastlineLngLat = [];          // [[lng,lat], ...]
let coastlineSegments = [];        // [{i0,i1,line,lengthKm,excluded,bbox}, ...]

// tracks in turf form
let trackLines = [];
let trackBBoxes = [];

// coverage numbers
let coveredKm = 0, totalKm = 0;

// leaflet map and layers
let map;
let coverageLayerGroup = null;

// summary panel DOM refs
let coveragePanel, coverageNums, coverageBarFill;

// Medium links + paddle titles
const linksData = {
  0: "https://medium.com/my-oceanic-odyssey/my-oceanic-odyssey-paddle-1-735333d7ceac?source=friends_link&sk=118db82e6e50c5652b2dd068630a2677",
  1: "https://medium.com/my-oceanic-odyssey/my-oceanic-odyssey-paddle-2-charting-paths-e8defcab9e6a?source=friends_link&sk=8f0eb0cf25e7a395c7fd4f53958c3748",
  2: "https://medium.com/my-oceanic-odyssey/my-oceanic-odyssey-paddle-3-respecting-limits-6db2507fc650?source=friends_link&sk=6018a3921560cb307e3c277038e18da8",
  3: "https://medium.com/my-oceanic-odyssey/my-oceanic-odyssey-paddle-4-be-patient-d63aa25284f8?source=friends_link&sk=f56119232386c42f402572a81b53ba99",
  4: "https://medium.com/@drew.burrier/my-oceanic-odyssey-paddle-5-pushing-boundaries-63fc4b555cc7?source=friends_link&sk=4c060cedb51cf8b5ec3c4bb1f32c9364",
  5: "https://medium.com/@drew.burrier/my-oceanic-odyssey-paddle-6-trust-yourself-1f95d2e8411e?sk=944d5a6f7664c5f134a23b5c9649255a",
  6: "https://medium.com/@drew.burrier/my-oceanic-odyssey-paddle-7-worlds-collide-8c962574e2c4?sk=80c26d0e3fdc50a98c933b5731e0d213",
  7: "https://medium.com/@drew.burrier/my-oceanic-odyssey-paddle-8-trust-the-process-c9e2c3d5cdff?sk=ea18e46234fac08a7bc5a5da6d9a5a6e",
  8: "https://medium.com/my-oceanic-odyssey/my-oceanic-odyssey-paddle-9-a-year-in-review-c1f8581e6ab?sk=139c46cce2081306ee7f7c931f6f23dcc",
  9: "https://medium.com/@drew.burrier/my-oceanic-odyssey-paddle-10-survive-793227ec80b4?sk=204b6b20ad86838be0f9cdb662709473"
};

const paddle_titles = {
  0: "Genesis",
  1: "Charting Paths",
  2: "Respecting Limits",
  3: "Be Patient",
  4: "Pushing Boundaries",
  5: "Trust Yourself",
  6: "Worlds Collide",
  7: "Trust the Process",
  8: "A Year in Review",
  9: "Survive",
  10: "Take Pride"
};

/* ============== helpers ==================== */
function toLatLngsFromPolyline(encoded){
  const ll = L.Polyline.fromEncoded(encoded).getLatLngs();
  return ll.map(p => [p.lat, p.lng]);
}

function degForKm(km){ return km/111.0; }

function setHUD(coveredKmIn, totalKmIn){
  if (!coverageNums || !coverageBarFill) return;
  const mi = (km)=> km*0.621371;
  const pct = totalKmIn > 0 ? (coveredKmIn/totalKmIn*100) : 0;
  coverageNums.innerHTML = `
    <span class="big">${mi(coveredKmIn).toFixed(1)} mi covered</span>
    <span class="small">${mi(totalKmIn).toFixed(2)} mi total </span>
    <span class="small">${pct.toFixed(1)}% complete</span>
  `;
  coverageBarFill.style.width = `${Math.max(0, Math.min(100, pct))}%`;
}

/* ====================== COASTLINE ======================== */
async function loadCoastline(){
  try{
    const resp = await fetch(COASTLINE_URL, {cache:"no-store"});
    const gj = await resp.json();
    let geom = null;
    if (gj.type === "FeatureCollection" && gj.features && gj.features.length){
      geom = gj.features[0].geometry;
    } else if (gj.type === "Feature"){
      geom = gj.geometry;
    } else if (gj.type === "LineString"){
      geom = gj;
    }
    if (!geom || geom.type !== "LineString"){
      console.error("Unexpected coastline shape");
      return;
    }
    coastlineLngLat = geom.coordinates; // [lng,lat]
    buildCoastlineSegments();
    computeAndRenderCoverage();
  }catch(e){
    console.error("Failed to load coastline:", e);
  }
}

function buildCoastlineSegments(){
  coastlineSegments = [];
  totalKm = 0;

  // exclusion polygons
  const excludePolys = EXCLUDE_AREAS.map(a => a.polygon);

  for (let i=0; i<coastlineLngLat.length-1; i++){
    const a = coastlineLngLat[i], b = coastlineLngLat[i+1];
    const line = turf.lineString([a,b]);
    const mid = turf.midpoint(turf.point(a), turf.point(b));
    const excluded = excludePolys.some(poly => turf.booleanPointInPolygon(mid, poly));
    const lengthKm = turf.length(line, {units:"kilometers"});
    const bb = turf.bbox(line);
    coastlineSegments.push({i0:i, i1:i+1, line, lengthKm, excluded, bbox: bb});
    if (!excluded) totalKm += lengthKm;
  }
}

/* ====================== STRAVA =========================== */
function saveLatestActivityId(activityId){ localStorage.setItem('latestActivityId', activityId); }
function loadLatestActivityId(){ return localStorage.getItem('latestActivityId'); }

function reAuthorize(){
  return fetch(auth_link, {
    method: 'post',
    headers: {'Accept': 'application/json, text/plan, */*', 'Content-Type': 'application/json'},
    body: JSON.stringify({
      client_id: '119993',
      client_secret: '67840b78f22679aab9989426c78b87b597a102de',
      refresh_token: 'ec624131076c98a1d017f6fe24047eff07fdb52a',
      grant_type: 'refresh_token'
    })
  }).then(res=>res.json());
}

function getActivities(res){
  const link = `https://www.strava.com/api/v3/athlete/activities?per_page=100&access_token=${res.access_token}`;
  return fetch(link).then(r=>r.json());
}

/* ====================== TRACKS =========================== */
function prepareTrackLines(activities){
  trackLines = [];
  trackBBoxes = [];
  for (const act of activities){
    if (!act.map || !act.map.summary_polyline) continue;
    const latlngs = toLatLngsFromPolyline(act.map.summary_polyline);
    if (!latlngs.length) continue;
    const lnglats = latlngs.map(([lat,lng]) => [lng, lat]);
    const line = turf.lineString(lnglats);
    trackLines.push(line);
    trackBBoxes.push({bbox: turf.bbox(line), line});
  }
}

/* ====================== COVERAGE ========================= */
/* For each sampled point along a track,
   1) build a small search window
   2) test only coastline segments whose bbox overlaps that window
   3) mark segment covered if point to line distance <= OFFSHORE_MAX_KM
*/
function computeAndRenderCoverage(){
  if (!map || !coastlineSegments.length || !trackLines.length) return;

  const coveredFlags = new Array(coastlineSegments.length).fill(false);
  const degPad = degForKm(Math.max(OFFSHORE_MAX_KM, 1)); // pad window based on cap

  for (const tLine of trackLines){
    const lenKm = turf.length(tLine, {units: "kilometers"});
    for (let d = 0; d <= lenKm; d += SAMPLE_STEP_KM){
      const pt = turf.along(tLine, d, {units: "kilometers"});
      const [px, py] = pt.geometry.coordinates;
      const windowBB = [px - degPad, py - degPad, px + degPad, py + degPad];

      for (let i=0; i<coastlineSegments.length; i++){
        const seg = coastlineSegments[i];
        if (seg.excluded || coveredFlags[i]) continue;

        const bb = seg.bbox;
        const overlaps = !(windowBB[0] > bb[2] || windowBB[2] < bb[0] || windowBB[1] > bb[3] || windowBB[3] < bb[1]);
        if (!overlaps) continue;

        const distKm = turf.pointToLineDistance(pt, seg.line, {units:"kilometers"});
        if (distKm <= OFFSHORE_MAX_KM){
          coveredFlags[i] = true;
        }
      }
    }
  }

  coveredKm = 0;
  const coveredSegments = [];
  for (let i = 0; i < coastlineSegments.length; i++){
    const seg = coastlineSegments[i];
    if (seg.excluded) continue;
    if (coveredFlags[i]){
      coveredKm += seg.lengthKm;
      coveredSegments.push(seg.line);
    }
  }

  if (coverageLayerGroup){ map.removeLayer(coverageLayerGroup); }
  coverageLayerGroup = L.layerGroup().addTo(map);

  if (RENDER_COVERAGE_SEGMENTS && coveredSegments.length){
    L.geoJSON(turf.featureCollection(coveredSegments), {
      style: { color: "#2DD4BF", weight: 4, opacity: 0.7 }
    }).addTo(coverageLayerGroup);
  }

  setHUD(coveredKm, totalKm);
}

/* ====================== MAP & UI ========================= */
function addCoveragePanel(){
  if (!document.getElementById("coverage-summary-styles")){
    const css = document.createElement("style");
    css.id = "coverage-summary-styles";
    css.textContent = `
      #coverage-panel { max-width:1100px; margin:12px auto 0; padding:0 12px; }
      .coverage-card { background:#0b132b; color:#E6FFFA; border-radius:16px;
        box-shadow:0 8px 24px rgba(0,0,0,.25); padding:12px 16px; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto;
        display:grid; grid-template-columns:1fr minmax(160px,320px); gap:14px; align-items:center; }
      .coverage-nums { font-weight:600; line-height:1.35; font-size:14px; }
      .coverage-nums .big { font-size:18px; display:block; margin-bottom:2px; }
      .coverage-nums .small { opacity:.85; display:block; }
      .coverage-bar { height:10px; background:rgba(255,255,255,.12); border-radius:999px; overflow:hidden; }
      .coverage-bar .fill { height:100%; width:0%; background:linear-gradient(90deg,#2DD4BF,#60A5FA); transition:width .4s ease; }
      @media (max-width:640px){ .coverage-card { grid-template-columns:1fr; } }
    `;
    document.head.appendChild(css);
  }

  const mapEl = document.getElementById('map');
  if (!mapEl) return;

  let panel = document.getElementById('coverage-panel');
  if (!panel){
    panel = document.createElement('div');
    panel.id = 'coverage-panel';
    panel.innerHTML = `
      <div class="coverage-card">
        <div class="coverage-nums">Loading…</div>
        <div class="coverage-bar"><div class="fill"></div></div>
      </div>
    `;
    mapEl.insertAdjacentElement('afterend', panel);
  }
  coveragePanel = panel;
  coverageNums = panel.querySelector('.coverage-nums');
  coverageBarFill = panel.querySelector('.coverage-bar .fill');
}

function addPolylinesToMap(data) {
  if (!map){
    map = L.map('map').setView([21.466883, -157.942441], 10);
    L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
      maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: '© Google'
    }).addTo(map);
    addCoveragePanel();
  }

  // clear old polylines
  polylines.forEach(pl => pl.remove());
  polylines = [];
  lastPolyline = null;

  data.forEach((activity, index) => {
    if (!activity.map || !activity.map.summary_polyline) return;
    const coordinates = L.Polyline.fromEncoded(activity.map.summary_polyline).getLatLngs();
    const polyline = L.polyline(coordinates, {
      color: "orange", weight: 5, opacity: 1, lineJoin: 'round'
    }).addTo(map);

    polylines.push(polyline);
    const popupContent = createPopupContent(index);
    polyline.bindPopup(popupContent);
    if (index === data.length - 1) { lastPolyline = polyline; }
  });

  if (polylines.length > 0) {
    polylines[polylines.length - 1].openPopup();
    const firstActivity = data[polylines.length - 1];
    const firstCoordinates = L.Polyline.fromEncoded(firstActivity.map.summary_polyline).getLatLngs()[0];
    const mileInDegrees = 10 / 69;
    const offsetCoordinates = { lat: firstCoordinates.lat + mileInDegrees, lng: firstCoordinates.lng };
    map.setView(offsetCoordinates, 10);
  }
}

// Popup content
function createPopupContent(index) {
  const activity = currentActivities[index];
  const mediumLink = linksData[currentActivities.length - index - 1] || 'https://medium.com/@drew.burrier';
  const paddleTitle = paddle_titles[currentActivities.length - index - 1] || 'TBD';
  const miles = activity && activity.distance ? (activity.distance / 1000 * 0.621371).toFixed(2) : "—";

  return `
    <div style="display:flex;align-items:center;justify-content:space-between;width:100%;margin:0;padding:0;">
      <div style="width:0;height:0;border-top:10px solid transparent;border-bottom:10px solid transparent;border-right:10px solid #A3C6C4;cursor:pointer;margin-left:-5px;margin-right:5px;" onclick="navigateActivity(${index + 1})"></div>
      <div style="text-align:center;flex-grow:1;margin:0;">
        <h3 style="margin:0;">Paddle ${currentActivities.length - index}</h3>
        <h4 style="margin:0;color:#354649;">${paddleTitle}</h4>
        <img src="photos/paddle_${currentActivities.length - index}.jpeg" alt="Paddle ${currentActivities.length - index}" style="width:100%;height:auto;max-height:300px;object-fit:cover;">
        <div style="font-size:12px;margin-top:5px;">
          ${new Date(activity.start_date).toLocaleDateString()}<br>
          Distance: ${miles} miles
        </div>
        <div style="margin-top:10px;">
          <a href="${mediumLink}" target="_blank" style="display:inline-block;padding:5px 5px;background-color:#A3C6C4;color:#354649;text-decoration:none;border-radius:5px;">Read on Medium</a>
        </div>
      </div>
      <div style="width:0;height:0;border-top:10px solid transparent;border-bottom:10px solid transparent;border-left:10px solid #A3C6C4;cursor:pointer;margin-right:-5px;margin-left:5px;" onclick="navigateActivity(${index - 1})"></div>
    </div>
  `;
}

function navigateActivity(newIndex) {
  if (newIndex >= currentActivities.length) newIndex = 0;
  else if (newIndex < 0) newIndex = currentActivities.length - 1;

  if (lastPolyline) lastPolyline.closePopup();
  lastPolyline = polylines[newIndex];
  const coordinates = lastPolyline.getLatLngs();
  const lastCoord = coordinates[coordinates.length - 1];
  const mileInDegrees = 4 / 69;
  const offsetCoord = { lat: lastCoord.lat + mileInDegrees, lng: lastCoord.lng };

  const newContent = createPopupContent(newIndex);
  const popup = L.popup().setLatLng(lastCoord).setContent(newContent);
  popup.openOn(lastPolyline._map);
  setTimeout(() => { lastPolyline._map.setView(offsetCoord, 11, { animate: true }); }, 300);
}

/* ================== Boot ===================== */
function initMapOnce(){
  if (!map){
    map = L.map('map').setView([21.466883, -157.942441], 10);
    L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
      maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: '© Google'
    }).addTo(map);
    addCoveragePanel();
  }
}

async function refreshAll(){
  try{
    // get activities
    const auth = await reAuthorize();
    const data = await getActivities(auth);

    currentActivities = Array.isArray(data) ? data : [];

    // draw routes
    addPolylinesToMap(currentActivities);

    // build track features for coverage math
    prepareTrackLines(currentActivities);

    // compute coverage
    computeAndRenderCoverage();
  }catch(e){
    console.error("Refresh failed", e);
  }
}

document.addEventListener("DOMContentLoaded", function () {
  initMapOnce();
  // hide any guide element after a moment if present
  const mapGuide = document.getElementById("mapGuide");
  setTimeout(() => { if (mapGuide) mapGuide.style.display = "none"; }, 6000);

  // start both fetches
  loadCoastline();
  refreshAll();

  // auto refresh
  setInterval(refreshAll, AUTO_REFRESH_MS);
});

/* ====================== EXCLUDE AREAS ==================== */
const EXCLUDE_AREAS = [
  {
    name: "Pearl Harbor",
    polygon: {
      "type": "Feature",
      "geometry": {
        "type": "Polygon",
        "coordinates": [[
          [-157.9930, 21.4150],
          [-157.9930, 21.3730],
          [-157.9855, 21.3480],
          [-157.9820, 21.3365],
          [-157.9740, 21.3135],
          [-157.9665, 21.3095],
          [-157.9580, 21.3110],
          [-157.9520, 21.3160],
          [-157.9470, 21.3260],
          [-157.9460, 21.3380],
          [-157.9480, 21.3500],
          [-157.9535, 21.3680],
          [-157.9585, 21.3870],
          [-157.9645, 21.4030],
          [-157.9725, 21.4145],
          [-157.9805, 21.4180],
          [-157.9880, 21.4180],
          [-157.9930, 21.4150]
        ]]
      },
      "properties": {}
    }
  }
];
/* ====================================================================== */
