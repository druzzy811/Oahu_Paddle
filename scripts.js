document.addEventListener('DOMContentLoaded', function() {
    var currentPhotoIndex = 0; // Start with the first photo

    // Initialize the map at the given coordinates and zoom level
    var map = L.map('map').setView([21.466883, -157.942441], 10);
    L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 20,
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
        attribution: '© Google'
    }).addTo(map);
    map.invalidateSize();

    // Function to calculate 2 miles in degrees of latitude
    function calculateOffset(lat) {
        var mileInDegrees = 20 / 69; // Convert 2 miles to degrees
        return lat + mileInDegrees; // Return new latitude 2 miles north
    }

    // Function to create the popup content dynamically
    function createPopupContent(index) {
        const photo = photoData[index];

        return `
            <div style="display: flex; align-items: center; justify-content: space-between; width: 300px; margin: 0; padding: 0;">
                <div style="width: 0; height: 0; border-top: 10px solid transparent; border-bottom: 10px solid transparent; border-right: 10px solid #A3C6C4; cursor: pointer; margin-left: -5px; margin-right: 5px;" onclick="navigatePhoto(${index + 1})"></div>
                
                <div style="text-align: center; flex-grow: 1; margin: 0;">
                    <h3 style="margin: 0;">Photo ${photo.datetime}</h3>
                    <img src="Gallery/${photo.filename}" alt="Photo ${photo.datetime}" style="width: 100%; height: auto; max-height: 400px; object-fit: cover;">
                </div>
                
                <div style="width: 0; height: 0; border-top: 10px solid transparent; border-bottom: 10px solid transparent; border-left: 10px solid #A3C6C4; cursor: pointer; margin-right: -5px; margin-left: 5px;" onclick="navigatePhoto(${index - 1})"></div>
            </div>
        `;
    }

    // Function to update the popup and re-center the map
    function updatePopupAndCenter(index) {
        const photo = photoData[index];
        if (!photo || !photo.gps || !photo.gps.latitude || !photo.gps.longitude) {
            console.error('Invalid photo data for index:', index);
            return;
        }

        var lat = photo.gps.latitude;
        var lon = photo.gps.longitude;

        // Calculate the new center for the map (2 miles north of the photo)
        var newLat = calculateOffset(lat);

        // Create the popup content
        var popupContent = createPopupContent(index);

        // Add popup directly to the map at the coordinates
        L.popup({ maxWidth: 400 })
            .setLatLng([lat, lon])
            .setContent(popupContent)
            .openOn(map);

        // Re-center the map 2 miles north of the photo's coordinates
        map.setView([newLat, lon], 10);
    }

    // Function to navigate between photos
    window.navigatePhoto = function(index) {
        if (index >= photoData.length) {
            index = 0; // Wrap to first photo
        } else if (index < 0) {
            index = photoData.length - 1; // Wrap to last photo
        }
        currentPhotoIndex = index;

        updatePopupAndCenter(currentPhotoIndex);
    };

    // Center the map 2 miles north of the first photo on page load
    updatePopupAndCenter(currentPhotoIndex);
});
