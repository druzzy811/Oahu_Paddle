window.addEventListener('load', () => {
    const map = L.map('map').setView([21.483, -158.000], 11);

    L.tileLayer('http://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        maxZoom: 20, 
        subdomains: ['mt0', 'mt1', 'mt2', 'mt3'], 
        attribution: '© Google'
    }).addTo(map);

    fetch('forecast_data.json')
        .then(response => response.json())
        .then(data => {
            data.forEach(zone => {
                const marker = L.marker([zone.lat, zone.lon]).addTo(map);
                
                // Helper to build direction strips
                const buildStrip = (dirs, color) => `
                    <div style="display:flex; width: 100%; overflow-x: auto; margin-bottom: 5px;">
                        ${dirs.map(d => `<span style="display:inline-block; transform: rotate(${d}deg); color:${color}; margin-right: 2px; font-size: 10px;">➤</span>`).join('')}
                    </div>
                `;

                const popup = document.createElement('div');
                popup.style.width = "400px";
                popup.innerHTML = `
                    <h3 style="color:#00b3c6; margin-top: 0;">Zone ${zone.zone}</h3>
                    <canvas id="chart-${zone.zone}"></canvas>
                    <div style="margin-top: 10px; border-top: 1px solid #ccc; padding-top: 5px;">
                        <small>Wind Dir:</small> ${buildStrip(zone.wind_dir, '#3498db')}
                        <small>Wave Dir:</small> ${buildStrip(zone.wave_dir, '#e74c3c')}
                    </div>
                `;
                marker.bindPopup(popup);

                marker.on('popupopen', () => {
                    const ctx = document.getElementById(`chart-${zone.zone}`).getContext('2d');
                    new Chart(ctx, {
                        type: 'line',
                        data: {
                            labels: Array.from({length: 40}, (_, i) => i), // Simplified indices for Chart.js
                            datasets: [
                                { label: 'Wind (mph)', data: zone.wind_spd, borderColor: '#3498db', yAxisID: 'y' },
                                { label: 'Waves (ft)', data: zone.wave_hgt, borderColor: '#e74c3c', yAxisID: 'y1' }
                            ]
                        },
                        options: {
                            responsive: true,
                            scales: {
                                x: {
                                    ticks: {
                                        callback: function(val) {
                                            // Only show label every 8 steps (24 hours)
                                            return (val % 8 === 0) ? `Day ${val/8 + 1}` : '';
                                        }
                                    }
                                },
                                y: { type: 'linear', position: 'left' },
                                y1: { type: 'linear', position: 'right', grid: { drawOnChartArea: false } }
                            }
                        }
                    });
                });
            });
        });
});
