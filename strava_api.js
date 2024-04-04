const auth_link = "https://www.strava.com/oauth/token";
let currentActivities = []; // This will store the fetched activities
let currentIndex = 0; // Start with the most recent activities
let lastPolyline = null; // Variable to hold the last polyline

function createBlogPost(activity, index) {
    const blogContainer = document.createElement("div");
    blogContainer.className = "blog-post-container";

    // Use a template literal to format the title with paddle number and date on separate lines
    const title = document.createElement("h2");
    title.innerHTML = `Paddle ${index + 1}<br><small>${new Date(activity.start_date).toLocaleDateString()}</small>`;

    // Distance information on a new line
    const distance = document.createElement("p");
    var activityDistanceKm = activity.distance / 1000;
    var activityDistanceMiles = (activityDistanceKm * 0.621371).toFixed(2);
    distance.textContent = `Distance: ${activityDistanceMiles} miles`;

    blogContainer.appendChild(title);
    blogContainer.appendChild(distance);

    document.querySelector('.posts-wrapper').appendChild(blogContainer); // Append to the posts wrapper
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

// Arrow click handlers
document.getElementById('left-arrow').addEventListener('click', () => {
    if (currentIndex > 0) {
        currentIndex -= 3;
        renderActivities(currentIndex);
    }
});

document.getElementById('right-arrow').addEventListener('click', () => {
    if (currentIndex + 3 < currentActivities.length) {
        currentIndex += 3;
        renderActivities(currentIndex);
    }
});

function getActivities(res) {
    const activities_link = `https://www.strava.com/api/v3/athlete/activities?access_token=${res.access_token}`;
    fetch(activities_link)
        .then((res) => res.json())
        .then(function (data) {
            // Store fetched activities and render the first three
            currentActivities = data;
            renderActivities(0);
            addPolylinesToMap(data);
        });
}

function addPolylinesToMap(data) {
    var map = L.map('map').setView([21.466883, -157.942441], 11);
    map.invalidateSize();

    L.tileLayer('https://watercolormaps.collection.cooperhewitt.org/tile/watercolor/{z}/{x}/{y}.jpg', {
        maxZoom: 19,
        attribution: '© OpenStreetMap'
    }).addTo(map);

    data.forEach((activity, index) => {
        var coordinates = L.Polyline.fromEncoded(activity.map.summary_polyline).getLatLngs();
        var polyline = L.polyline(coordinates, {
            color: "Red",
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

