


const auth_link = "https://www.strava.com/oauth/token" 


function getActivities(res){

	const activities_link = `https://www.strava.com/api/v3/athlete/activities?access_token=${res.access_token}`
	fetch(activities_link)
		.then((res) => (res.json()))
		.then(function (data){

			var map = L.map('map').setView([21.4960, -157.0118], 11);
			L.tileLayer('https://watercolormaps.collection.cooperhewitt.org/tile/watercolor/{z}/{x}/{y}.jpg', {
    		maxZoom: 19,
    		attribution: '© OpenStreetMap'
			}).addTo(map);

			  for (var x = data.length - 1; x >= 0; x--) {
				console.log(data[x].map.summary_polyline)
				var coordinates = L.Polyline.fromEncoded(data[x].map.summary_polyline).getLatLngs()
				console.log(coordinates)


				 // Declare polyline outside the loop
                var polyline = L.polyline(coordinates, {
                    color: "Red",
                    weight: 5,
                    opacity: 1,
                    lineJoin: 'round'
                }).addTo(map);

                // Extract the activity date from the data
                var activityDate = new Date(data[x].start_date).toLocaleDateString();

                  // Extract the activity distance from the data (assuming it's in meters)
                var activityDistanceKm = data[x].distance / 1000;
                var activityDistanceMiles = (activityDistanceKm * 0.621371).toFixed(2); // Convert to miles and round to 2 decimal places

                 // Add a popup to the polyline with reversed paddle number, activity date, and activity distance in miles
                polyline.bindPopup(`Paddle ${data.length - x}<br>Date: ${activityDate}<br>Distance: ${activityDistanceMiles} miles`).openPopup();		
            }
		})
}


function reAuthorize(){
	fetch (auth_link,{
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
			
/*			client_id: 'process.env.CLIENT_ID',
			client_secret: 'process.env.CLIENT_SECRET',
			refresh_token: 'process.env.REFRESH_TOKEN',
			grant_type: 'refresh_token'*/
			
		})
	}).then(res => res.json())
		.then(res => getActivities(res))

}

reAuthorize()