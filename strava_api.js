const auth_link = "https://www.strava.com/oauth/token";
let currentActivities = []; // This will store the fetched activities
let currentIndex = 0; // Start with the most recent activities
let lastPolyline = null; // Variable to hold the last polyline
let linksData = {
    0: "https://medium.com/@drew.burrier/my-oceanic-odyssey-paddle-1-735333d7ceac",
    1: "https://medium.com/@drew.burrier/my-oceanic-odyssey-paddle-2-charting-paths-e8defcab9e6a",
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
           // renderActivities(currentIndex); // Render activities after fetching data
            addPolylinesToMap(data);
        });
}
    function addPolylinesToMap(data) {
            // Check if the map element exists on the page
    if (!document.getElementById('map')) {
        return; // If there's no map, do nothing
    }

   var map = L.map('map').setView([21.466883, -157.942441], 10);
    map.invalidateSize();
    
    // Add the Google Satellite tile layer to the map
    L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '© Google'
    }).addTo(map); 

/*function addPolylinesToMap(data) {
    var map = L.map('map').setView([21.466883, -157.942441], 10);
    map.invalidateSize();
   L.tileLayer('https://watercolormaps.collection.cooperhewitt.org/tile/watercolor/{z}/{x}/{y}.jpg', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(map);*/

    data.forEach((activity, index) => {
        var coordinates = L.Polyline.fromEncoded(activity.map.summary_polyline).getLatLngs();
        var polyline = L.polyline(coordinates, {
            color: "orange",
            weight: 5,
            opacity: 1,
            lineJoin: 'round'
        }).addTo(map);

        polyline.bindPopup(`
        <h3>Paddle ${data.length - index}</h3>
        <img src="photos/paddle_${data.length - index}.jpeg" alt="Paddle ${data.length - index}" style="width:100%; height:auto;">
        ${new Date(activity.start_date).toLocaleDateString()}<br>
        Distance: ${(activity.distance / 1000 * 0.621371).toFixed(2)} miles
        <div style="text-align: center; margin-top: 10px;">
        <a href="${linksData[data.length - index - 1] || 'https://medium.com/@drew.burrier'}" target="_blank" style="display: inline-block; padding: 5px 5px; background-color: #A3C6C4; color: #354649; text-decoration: none; border-radius: 5px;">Read on Medium</a>
        </div>
        `);

        // Remember the last polyline
        if (index === 0) {
            lastPolyline = polyline;
        }
    });

    // Open the popup of the most recent activity if it exists
    if (lastPolyline) {
        lastPolyline.openPopup();
    }
}

// Call reAuthorize or your initial function to start the app
reAuthorize();
