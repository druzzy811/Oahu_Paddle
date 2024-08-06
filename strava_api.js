const auth_link = "https://www.strava.com/oauth/token";
let currentActivities = []; // This will store the fetched activities
let currentIndex = 0; // Start with the most recent activities
let lastPolyline = null; // Variable to hold the last polyline
let linksData = {
    0: "https://medium.com/@drew.burrier/my-oceanic-odyssey-paddle-1-735333d7ceac",
    1: "https://medium.com/@drew.burrier/my-oceanic-odyssey-paddle-2-charting-paths-e8defcab9e6a",
    2: "https://medium.com/@drew.burrier/my-oceanic-odyssey-paddle-3-respecting-limits-6db2507fc650",
    3: "https://medium.com/@drew.burrier/my-oceanic-odyssey-paddle-4-be-patient-d63aa25284f8",
    4: "https://medium.com/@drew.burrier",
    5: "https://medium.com/@drew.burrier",
    6: "https://medium.com/@drew.burrier"

};

function saveLatestActivityId(activityId) {
    localStorage.setItem('latestActivityId', activityId);
}

function loadLatestActivityId() {
    return localStorage.getItem('latestActivityId');
}

function createBlogPost(activity, index) {
    const blogContainer = document.createElement("div");
    blogContainer.className = "blog-post-container";

    const title = document.createElement("h2");
    title.innerHTML = `Paddle ${index + 1}<br><small>${new Date(activity.start_date).toLocaleDateString()}</small>`;

    const distance = document.createElement("p");
    var activityDistanceKm = activity.distance / 1000;
    var activityDistanceMiles = (activityDistanceKm * 0.621371).toFixed(2);
    distance.textContent = `Distance: ${activityDistanceMiles} miles`;

    const image = document.createElement("img");
    image.src = `photos/paddle_${index + 1}.jpeg`; // Adjusted path
    image.alt = `Paddle ${index + 1}`;
    image.onerror = () => {
        image.src = 'photos/placeholder.jpeg'; // Placeholder if specific paddle image doesn't exist
    };

    const mediumLink = document.createElement("a");
    mediumLink.href = linksData[index] || '#'; // Using linksData object
    mediumLink.textContent = "Read on Medium";
    mediumLink.target = "_blank";

    blogContainer.appendChild(title);
    blogContainer.appendChild(distance);
    blogContainer.appendChild(mediumLink);
    blogContainer.appendChild(image);
    
    document.querySelector('.posts-wrapper').appendChild(blogContainer);
}

function renderActivities(startIndex) {
    document.querySelectorAll('.blog-post-container').forEach(el => el.remove()); // Clear current activities

    const endIndex = startIndex + 3; // Show 3 activities at a time
    currentActivities.slice(startIndex, endIndex).forEach((activity, index) => {
        createBlogPost(activity, startIndex + index);
    });
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

// Arrow click handlers adapted for vertical scroll logic
document.getElementById('top-arrow').addEventListener('click', () => {
    if (currentIndex > 0) {
        currentIndex -= 3;
        renderActivities(currentIndex);
        document.querySelector('.posts-wrapper').scrollTop = 0; // Scroll to top of the posts container
    }
});

document.getElementById('bottom-arrow').addEventListener('click', () => {
    if (currentIndex + 3 < currentActivities.length) {
        currentIndex += 3;
        renderActivities(currentIndex);
        document.querySelector('.posts-wrapper').scrollTop = 0; // Scroll to top of the posts container
    }
});

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
            renderActivities(currentIndex); // Render activities after fetching data
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

        polyline.bindPopup(`Paddle ${data.length - index}<br>Date: ${new Date(activity.start_date).toLocaleDateString()}<br>Distance: ${(activity.distance / 1000 * 0.621371).toFixed(2)} miles`);

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
