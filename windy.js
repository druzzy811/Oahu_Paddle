const options = {
    key: 'eU9Pa9ZX4Ca4RWVXsuqyVUkfk2bhOGIf', // REPLACE WITH YOUR KEY !!!

    // Optional: Initial state of the map
    lat: 21.466883,
    lon: -157.942441,
    zoom: 9,
};

let windyAPIInstance; // Variable to store the Windy API instance

// Function to initialize Windy API and handle callback
function initializeWindyAPI(callback) {
    windyInit(options, windyAPI => {
        windyAPIInstance = windyAPI; // Store the Windy API instance
        callback(); // Call the callback function once the API is initialized
    });
}

// Function to save Windy API data to a local file
function saveDataToFile() {
    if (windyAPIInstance) {
        const dataToSave = windyAPIInstance.store.getAll();
        const jsonData = JSON.stringify(dataToSave);
        
        // Create a Blob with the JSON data
        const blob = new Blob([jsonData], { type: 'application/json' });
        
        // Create a download link for the Blob
        const url = URL.createObjectURL(blob);
        
        // Create an anchor element and trigger the download
        const a = document.createElement('a');
        a.href = url;
        a.download = 'weatherData.json';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        
        console.log('Data saved to file:', dataToSave);
    } else {
        console.error('Windy API instance not initialized yet.');
    }
}

// Initialize Windy API and then save data to a file
initializeWindyAPI(saveDataToFile);