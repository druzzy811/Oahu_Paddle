const auth_link = "https://www.strava.com/oauth/token";
let currentActivities = []; // This will store the fetched activities
let currentIndex = 0; // Start with the most recent activities
let lastPolyline = null; // Variable to hold the last polyline
let polylines = []; // Array to store polylines
let linksData = {
    0: "https://medium.com/my-oceanic-odyssey/my-oceanic-odyssey-paddle-1-735333d7ceac?source=friends_link&sk=118db82e6e50c5652b2dd068630a2677",
    1: "https://medium.com/my-oceanic-odyssey/my-oceanic-odyssey-paddle-2-charting-paths-e8defcab9e6a?source=friends_link&sk=8f0eb0cf25e7a395c7fd4f53958c3748",
    2: "https://medium.com/my-oceanic-odyssey/my-oceanic-odyssey-paddle-3-respecting-limits-6db2507fc650?source=friends_link&sk=6018a3921560cb307e3c277038e18da8",
    3: "https://medium.com/my-oceanic-odyssey/my-oceanic-odyssey-paddle-4-be-patient-d63aa25284f8?source=friends_link&sk=f56119232386c42f402572a81b53ba99",
    4: "https://medium.com/@drew.burrier/my-oceanic-odyssey-paddle-5-pushing-boundaries-63fc4b555cc7?source=friends_link&sk=4c060cedb51cf8b5ec3c4bb1f32c9364",
    5: "https://medium.com/@drew.burrier/my-oceanic-odyssey-paddle-6-trust-yourself-1f95d2e8411e?sk=944d5a6f7664c5f134a23b5c9649255a",
    6: "https://medium.com/@drew.burrier/my-oceanic-odyssey-paddle-7-worlds-collide-8c962574e2c4?sk=80c26d0e3fdc50a98c933b5731e0d213",
    7: "https://medium.com/@drew.burrier/my-oceanic-odyssey-paddle-8-trust-the-process-c9e2c3d5cdff?sk=ea18e46234fac08a7bc5a5da6d9a5a6e",
    8: "https://medium.com/my-oceanic-odyssey/my-oceanic-odyssey-paddle-9-a-year-in-review-c1f858d1e6ab?sk=139c46cce2081306ee7f7c931f6f23dcc"
};

let paddle_titles = {
    0: "Genesis",
    1: "Charting Paths",
    2: "Respecting Limits",
    3: "Be Patient",
    4: "Pushing Boundaries",
    5: "Trust Yourself",
    6: "Worlds Collide",
    7: "Trust the Process",
    8: "A Year in Review",
    9: "Survive"

}

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

    // Create the popup content for the current paddle
    var popupContent = createPopupContent(index);

    // Bind the popup to the polyline
    polyline.bindPopup(popupContent);

    // On the last polyline, save it as the last active one
    if (index === currentActivities.length - 1) {
      lastPolyline = polyline;
    }
  });

  // Open the popup for the first paddle (index 0) on page load
  if (polylines.length > 0) {
    polylines[polylines.length - 1].openPopup(); // Open popup for the first paddle
        var firstActivity = currentActivities[polylines.length - 1];
    var firstCoordinates = L.Polyline.fromEncoded(firstActivity.map.summary_polyline).getLatLngs()[0];

// Calculate the offset for 2 miles south of the point
var mileInDegrees = 10 / 69; // 2 miles in degrees of latitude
var offsetCoordinates = {
    lat: firstCoordinates.lat + mileInDegrees, // Move 2 miles south (subtract latitude)
    lng: firstCoordinates.lng // Longitude stays the same
};

// Center the map on the offset coordinates
map.setView(offsetCoordinates, 10);
  }
}


// Function to create popup content dynamically
// Function to create popup content dynamically
function createPopupContent(index) {
  const activity = currentActivities[index]; // Use the globally available currentActivities
  const mediumLink = linksData[currentActivities.length - index - 1] || 'https://medium.com/@drew.burrier'; // Use the corresponding link or fallback
  const paddleTitle = paddle_titles[currentActivities.length - index - 1] || 'TBD'; // Get the corresponding paddle title

  return `
    <div style="display: flex; align-items: center; justify-content: space-between; width: 100%; margin: 0; padding: 0;">
      <!-- The left arrow will now navigate to the next (higher number) activity -->
      <div style="width: 0; height: 0; border-top: 10px solid transparent; border-bottom: 10px solid transparent; border-right: 10px solid #A3C6C4; cursor: pointer; margin-left: -5px; margin-right: 5px;" onclick="navigateActivity(${index + 1})"></div>
      
      <div style="text-align: center; flex-grow: 1; margin: 0;">
        <h3 style="margin: 0;">Paddle ${currentActivities.length - index}</h3>
        <h4 style="margin: 0; color: #354649;">${paddleTitle}</h4> <!-- Paddle title added here -->
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
    // Wrap around if the user reaches the end or start of the paddles
    if (newIndex >= currentActivities.length) {
        newIndex = 0; // Go to the first paddle if on the last one
    } else if (newIndex < 0) {
        newIndex = currentActivities.length - 1; // Go to the last paddle if on the first one
    }

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

document.addEventListener("DOMContentLoaded", function () {
    const mapGuide = document.getElementById("mapGuide");

    // Hide map guide after 10 seconds
    setTimeout(() => {
        mapGuide.style.display = "none";
    }, 6000);
});

