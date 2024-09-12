const auth_link = "https://www.strava.com/oauth/token";
let currentActivities = []; // This will store the fetched activities
let currentIndex = 0; // Start with the most recent activities
let lastPolyline = null; // Variable to hold the last polyline
let polylines = []; // Array to store polylines
let linksData = {
    0: "https://medium.com/my-oceanic-odyssey/my-oceanic-odyssey-paddle-1-735333d7ceac?source=friends_link&sk=118db82e6e50c5652b2dd068630a2677",
    1: "https://medium.com/my-oceanic-odyssey/my-oceanic-odyssey-paddle-2-charting-paths-e8defcab9e6a?source=friends_link&sk=8f0eb0cf25e7a395c7fd4f53958c3748",
    2: "https://medium.com/@drew.burrier/my-oceanic-odyssey-paddle-3-respecting-limits-6db2507fc650",
    3: "https://medium.com/@drew.burrier/my-oceanic-odyssey-paddle-4-be-patient-d63aa25284f8",
    4: "https://medium.com/@drew.burrier/my-oceanic-odyssey-paddle-5-pushing-boundaries-63fc4b555cc7?source=friends_link&sk=4c060cedb51cf8b5ec3c4bb1f32c9364"
};

function toggleMenu() {
    var tools = document.getElementById('planning-tools');
    tools.classList.toggle('open');
}

function saveLatestActivityId(activityId) {
    localStorage.setItem('latestActivityId', activityId);
}

function loadLatestActivityId() {
    return localStorage.getItem('latestActivityId');
}

function reAuthorize() {
    fetch(auth_link, {
        method: 'post',
        headers: {
            'Accept': 'application/json, text/plan, */*',
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            client_id: '119993',
            client_secret: '67840b78f22679aab9989426c78b87b597a102de',
            refresh_token: 'ec624131076c98a1d017f6fe24047eff07fdb52a',
            grant_type: 'refresh_token'
        })
    }).then(res => res.json())
    .then(res => {
        getActivities(res);
    });
}

function getActivities(res) {
    const activities_link = `https://www.strava.com/api/v3/athlete/activities?access_token=${res.access_token}`;
    fetch(activities_link)
        .then((res) => res.json())
        .then(function (data) {
            const latestActivityId = data[0].id; // Get the ID of the most recent activity
            const storedActivityId = loadLatestActivityId(); // Load the stored latest activity ID
            
            if (latestActivityId !== storedActivityId) {
                saveLatestActivityId(latestActivityId); // Save the new latest activity ID
            }
            currentActivities = data; // Store fetched activities
            addPolylinesToMap(data);
        });
}

function addPolylinesToMap(data) {
  var map = L.map('map').setView([21.466883, -157.942441], 10);
  map.invalidateSize();

  // Add the Google Satellite tile layer to the map
  L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
    maxZoom: 20,
    subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
    attribution: '© Google'
  }).addTo(map);

  // Iterate over each activity and add its polyline
  data.forEach((activity, index) => {
    var coordinates = L.Polyline.fromEncoded(activity.map.summary_polyline).getLatLngs();
    var polyline = L.polyline(coordinates, {
      color: "orange",
      weight: 5,
      opacity: 1,
      lineJoin: 'round'
    }).addTo(map);

    // Store the polyline in the array for later use
    polylines.push(polyline);

    // Create the popup content for the initial paddle
    var popupContent = createPopupContent(index);

    // Bind the popup to the polyline
    polyline.bindPopup(popupContent);

    // On the first polyline, save it as the last active one
    if (index === 0) {
      lastPolyline = polyline;
      polyline.openPopup(); // Automatically open the first popup
    }
  });
}

// Function to create popup content dynamically
// Function to create popup content dynamically
function createPopupContent(index) {
  const activity = currentActivities[index]; // Use the globally available currentActivities
  const mediumLink = linksData[currentActivities.length - index - 1] || 'https://medium.com/@drew.burrier'; // Use the corresponding link or fallback

  return `
    <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; margin: 0; padding: 0;">
      <!-- The left arrow will now navigate to the next (higher number) activity -->
      <div style="width: 0; height: 0; border-top: 10px solid transparent; border-bottom: 10px solid transparent; border-right: 10px solid #A3C6C4; cursor: pointer; margin-left: -5px; margin-right: 5px;" onclick="navigateActivity(${index + 1})"></div>
      
      <div style="text-align: center; flex-grow: 1; margin: 0;">
        <h3 style="margin: 0;">Paddle ${currentActivities.length - index}</h3>
        <img src="photos/paddle_${currentActivities.length - index}.jpeg" alt="Paddle ${currentActivities.length - index}" style="width: 100%; height: auto; max-height: 300px; object-fit: cover;">
        <div style="font-size: 12px; margin-top: 5px;">
          ${new Date(activity.start_date).toLocaleDateString()}<br>
          Distance: ${(activity.distance / 1000 * 0.621371).toFixed(2)} miles
        </div>
        <div style="margin-top: 10px;">
          <a href="${mediumLink}" target="_blank" style="display: inline-block; padding: 5px 5px; background-color: #A3C6C4; color: #354649; text-decoration: none; border-radius: 5px;">Read on Medium</a>
        </div>
      </div>
      
      <!-- The right arrow will now navigate to the previous (lower number) activity -->
      <div style="width: 0; height: 0; border-top: 10px solid transparent; border-bottom: 10px solid transparent; border-left: 10px solid #A3C6C4; cursor: pointer; margin-right: -5px; margin-left: 5px;" onclick="navigateActivity(${index - 1})"></div>
    </div>
  `;
}



// Function to navigate between activities
function navigateActivity(newIndex) {
    // Check if the new index is valid (i.e., within range)
    if (newIndex < 0 || newIndex >= currentActivities.length) return;

    // Close the current popup
    if (lastPolyline) {
        lastPolyline.closePopup();
    }

    // Update the lastPolyline to the new activity's polyline
    lastPolyline = polylines[newIndex];

    // Get the coordinates of the new polyline
    const coordinates = lastPolyline.getLatLngs();

    const lastCoord = coordinates[coordinates.length - 1]; // Get the last coordinate (finish of the paddle)

    // Calculate a new point 1 mile north of the last coordinate
    const mileInDegrees = 4 / 69; // 1 mile north in degrees of latitude
    const offsetCoord = {
        lat: lastCoord.lat + mileInDegrees, // Move 1 mile north
        lng: lastCoord.lng // Longitude stays the same
    };

    // Create and bind the popup at the last coordinate
    const newContent = createPopupContent(newIndex);
    const popup = L.popup()
        .setLatLng(lastCoord) // Set the popup to the last coordinate
        .setContent(newContent); // Set the popup content

    // Open the popup
    popup.openOn(lastPolyline._map);

    // Center the map 1 mile north of the last coordinate
    setTimeout(() => {
        lastPolyline._map.setView(offsetCoord, 11, { animate: true });
    }, 300); // Add a slight delay to ensure the popup opens first
}
// Call reAuthorize or your initial function to start the app
reAuthorize();

