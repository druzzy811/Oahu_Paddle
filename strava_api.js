/* === strava_api.js (full) =============================================== */

const auth_link = "https://www.strava.com/oauth/token";

/** ======================= CONFIG ===================================== **/
const COASTLINE_URL = "coastline_oahu_linestring.geojson"; // same folder or GitHub Pages
const COVERAGE_RADIUS_KM = 2;   // how close a track must be to count as "coast coverage"
let RENDER_COVERAGE_SEGMENTS = false;

/* Exclusion areas: any coastline segments with midpoints inside these polygons
 * will NOT count toward total length *or* covered length.
 * Default is a reasonable Pearl Harbor envelope. Tweak as desired.
 * Coordinates are [lng, lat].
 */
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
/** ===================================================================== **/

let currentActivities = [];
let currentIndex = 0;
let lastPolyline = null;
let polylines = [];

// coverage data holders
let coastlineLngLat = [];          // [[lng,lat], ...]
let coastlineSegments = [];        // [{i0,i1, line, lengthKm, excluded}, ...]
let trackLines = [];               // GeoJSON LineString features
let trackBBoxes = [];              // [{bbox:[minX,minY,maxX,maxY], line:Feature}, ...]
let coveredKm = 0, totalKm = 0;
let coverageLayerGroup = null;
let map;

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
  8: "https://medium.com/my-oceanic-odyssey/my-oceanic-odyssey-paddle-9-a-year-in-review-c1f858d1e6ab?sk=139c46cce2081306ee7f7c931f6f23dcc",
  9: "https://medium.com/@drew.burrier/my-oceanic-odyssey-paddle-10-survive-793227ec80b4?sk=204b6b20ad86838be0f9cdb662709473",
  10: "https://medium.com/@drew.burrier/my-oceanic-odyssey-paddle-11-take-pride-a781a9299d9a?sk=2865b68c56d069b36d13b9f178f90c6f"
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

/* ============== Leaflet + Turf helpers ==================== */
function degBufferForKm(km){ return km/111.0; }

function bboxOverlap(a,b){
  return !(a[0] > b[2] || a[2] < b[0] || a[1] > b[3] || a[3] < b[1]);
}

function toLatLngsFromPolyline(encoded){
  const ll = L.Polyline.fromEncoded(encoded).getLatLngs();
  return ll.map(p => [p.lat, p.lng]);
}

function ll_to_lnglat(ll){ return [ll[1], ll[0]]; }
function latlng_to_lnglat(p){ return [p.lng, p.lat]; }
function lnglat_to_latlng(c){ return [c[1], c[0]]; }

/* ====================== COVERAGE SUMMARY (below map) =================== */
function addCoveragePanel(){
  if (!document.getElementById("coverage-summary-styles")){
    const css = document.createElement("style");
    css.id = "coverage-summary-styles";
    css.textContent = `
      #coverage-panel {
        max-width: 1100px;
        margin: 12px auto 0 auto;
        padding: 0 12px;
      }
      .coverage-card {
        background: #0b132b;
        color: #E6FFFA;
        border-radius: 16px;
        box-shadow: 0 8px 24px rgba(0,0,0,.25);
        padding: 12px 16px;
        font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto;
        display: grid;
        grid-template-columns: 1fr minmax(160px, 320px);
        gap: 14px;
        align-items: center;
      }
      .coverage-nums { font-weight: 600; line-height: 1.35; font-size: 14px; }
      .coverage-nums .big { font-size: 18px; display:block; margin-bottom: 2px; }
      .coverage-nums .small { opacity:.85; display:block; }
      .coverage-bar {
        height: 10px;
        background: rgba(255,255,255,.12);
        border-radius: 999px;
        overflow: hidden;
      }
      .coverage-bar .fill {
        height: 100%;
        width: 0%;
        background: linear-gradient(90deg,#2DD4BF,#60A5FA);
        transition: width .4s ease;
      }
      @media (max-width: 640px){
        .coverage-card { grid-template-columns: 1fr; }
      }
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

/* ====================== STRAVA =========================== */
function saveLatestActivityId(activityId){ localStorage.setItem('latestActivityId', activityId); }
function loadLatestActivityId(){ return localStorage.getItem('latestActivityId'); }

function reAuthorize(){
  fetch(auth_link, {
    method: 'post',
    headers: {'Accept': 'application/json, text/plan, */*', 'Content-Type': 'application/json'},
    body: JSON.stringify({
      client_id: '119993',
      client_secret: '67840b78f22679aab9989426c78b87b597a102de',
      refresh_token: 'ec624131076c98a1d017f6fe24047eff07fdb52a',
      grant_type: 'refresh_token'
    })
  }).then(res=>res.json()).then(res=>{ getActivities(res); });
}

function getActivities(res){
  const link = `https://www.strava.com/api/v3/athlete/activities?access_token=${res.access_token}`;
  fetch(link)
    .then(r=>r.json())
    .then(data=>{
      const latestActivityId = data[0].id;
      const storedActivityId = loadLatestActivityId();
      if (latestActivityId !== storedActivityId) saveLatestActivityId(latestActivityId);
      currentActivities = data;
      addPolylinesToMap(data);
      prepareTrackLines();
      computeAndRenderCoverage();
    });
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
      console.error("Unexpected coastline GeoJSON shape. Expecting a LineString geometry.");
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
  const excludePolys = EXCLUDE_AREAS.map(a => a.polygon);

  for (let i=0; i<coastlineLngLat.length-1; i++){
    const a = coastlineLngLat[i], b = coastlineLngLat[i+1];
    const line = turf.lineString([a,b]);
    const mid = turf.midpoint(turf.point(a), turf.point(b));
    const excluded = excludePolys.some(poly => turf.booleanPointInPolygon(mid, poly));
    const lengthKm = turf.length(line, {units:"kilometers"});
    coastlineSegments.push({i0:i, i1:i+1, line, lengthKm, excluded});
    if (!excluded) totalKm += lengthKm;
  }
}

/* ====================== TRACKS -> Turf =================== */
function prepareTrackLines(){
  trackLines = [];
  trackBBoxes = [];
  for (const act of currentActivities){
    if (!act.map || !act.map.summary_polyline) continue;
    const latlngs = toLatLngsFromPolyline(act.map.summary_polyline); // [[lat,lng],...]
    if (!latlngs.length) continue;
    const lnglats = latlngs.map(ll => ll_to_lnglat(ll)); // -> [[lng,lat],...]
    const line = turf.lineString(lnglats);
    trackLines.push(line);
    trackBBoxes.push({bbox: turf.bbox(line), line});
  }
}

/* ====================== COVERAGE ========================= */
function computeAndRenderCoverage(){
  if (!coastlineSegments.length || !trackLines.length) return;

  const degPad = degBufferForKm(COVERAGE_RADIUS_KM);
  let coveredSegments = [];
  coveredKm = 0;

  for (const seg of coastlineSegments){
    if (seg.excluded) continue;

    const bb = turf.bbox(seg.line);
    const segBB = [bb[0]-degPad, bb[1]-degPad, bb[2]+degPad, bb[3]+degPad];

    let isCovered = false;
    for (const t of trackBBoxes){
      const tb = t.bbox;
      const tbPad = [tb[0]-degPad, tb[1]-degPad, tb[2]+degPad, tb[3]+degPad];
      if (!bboxOverlap(segBB, tbPad)) continue;

      const a = seg.line.geometry.coordinates[0];
      const b = seg.line.geometry.coordinates[1];
      const mid = turf.midpoint(turf.point(a), turf.point(b));
      const dkm = turf.pointToLineDistance(mid, t.line, {units:"kilometers"});
      if (dkm <= COVERAGE_RADIUS_KM){
        isCovered = true;
        break;
      }
    }

    if (isCovered){
      coveredKm += seg.lengthKm;
      coveredSegments.push(seg.line);
    }
  }

  if (coverageLayerGroup){ map.removeLayer(coverageLayerGroup); }
  coverageLayerGroup = L.layerGroup().addTo(map);

  if (RENDER_COVERAGE_SEGMENTS && coveredSegments.length){
    const fc = turf.featureCollection(coveredSegments);
    L.geoJSON(fc, {
      style: { color: "#2DD4BF", weight: 4, opacity: 0.7 }
    }).addTo(coverageLayerGroup);
  }

  setHUD(coveredKm, totalKm);
}

/* ====================== MAP & UI ========================= */
function addPolylinesToMap(data) {
  map = L.map('map').setView([21.466883, -157.942441], 10);
  map.invalidateSize();

  L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    maxZoom: 20, subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], attribution: '© Google'
  }).addTo(map);

  // create the below-map coverage panel instead of an on-map HUD
  addCoveragePanel();

  data.forEach((activity, index) => {
    if (!activity.map || !activity.map.summary_polyline) return;
    const coordinates = L.Polyline.fromEncoded(activity.map.summary_polyline).getLatLngs();
    const polyline = L.polyline(coordinates, {
      color: "orange", weight: 5, opacity: 1, lineJoin: 'round'
    }).addTo(map);

    polylines.push(polyline);
    const popupContent = createPopupContent(index);
    polyline.bindPopup(popupContent);
    if (index === currentActivities.length - 1) { lastPolyline = polyline; }
  });

  if (polylines.length > 0) {
    polylines[polylines.length - 1].openPopup();
    const firstActivity = currentActivities[polylines.length - 1];
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
function toggleMenu(){
  const tools = document.getElementById('planning-tools');
  if (tools) tools.classList.toggle('open');
}

reAuthorize();   // fetch Strava + draw
loadCoastline(); // fetch coastline

document.addEventListener("DOMContentLoaded", function () {
  const mapGuide = document.getElementById("mapGuide");
  setTimeout(() => { if (mapGuide) mapGuide.style.display = "none"; }, 6000);
});
/* ======================================================== */
