const express = require('express');
const cors = require('cors');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Lưu trữ dữ liệu trong memory (có thể thay bằng database)
let sensorData = [];
const DATA_FILE = 'sensor_data.json';

// Load existing data from file
function loadDataFromFile() {
    try {
        if (fs.existsSync(DATA_FILE)) {
            const data = fs.readFileSync(DATA_FILE, 'utf8');
            sensorData = JSON.parse(data);
            console.log(`Loaded ${sensorData.length} records from file`);
        }
    } catch (error) {
        console.error('Error loading data from file:', error);
        sensorData = [];
    }
}

// Save data to file
function saveDataToFile() {
    try {
        fs.writeFileSync(DATA_FILE, JSON.stringify(sensorData, null, 2));
    } catch (error) {
        console.error('Error saving data to file:', error);
    }
}

// Load data on startup
loadDataFromFile();

// Route: Nhận dữ liệu từ ESP32 (POST)
app.post('/api/sensor-data', (req, res) => {
    try {
        console.log('\n=== Received Sensor Data ===');
        console.log('Headers:', req.headers);
        console.log('Body:', req.body);

        const { device_id, temperature, humidity, timestamp, location } = req.body;

        // Validate data
        if (!device_id || temperature === undefined || humidity === undefined) {
            return res.status(400).json({
                success: false,
                message: 'Missing required fields: device_id, temperature, humidity'
            });
        }

        // Create data record
        const dataRecord = {
            id: Date.now(),
            device_id,
            temperature: parseFloat(temperature),
            humidity: parseFloat(humidity),
            location: location || 'Unknown',
            timestamp: timestamp || Date.now(),
            received_at: new Date().toISOString()
        };

        // Add to data array
        sensorData.push(dataRecord);

        // Keep only last 1000 records
        if (sensorData.length > 1000) {
            sensorData = sensorData.slice(-1000);
        }

        // Save to file
        saveDataToFile();

        console.log('Data saved successfully:', dataRecord);

        // Send response
        res.status(200).json({
            success: true,
            message: 'Data received and saved successfully',
            data: dataRecord
        });

    } catch (error) {
        console.error('Error processing sensor data:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error',
            error: error.message
        });
    }
});

// Route: Nhận dữ liệu từ ESP32 (GET) - Alternative method
app.get('/api/sensor-data', (req, res) => {
    try {
        const { device_id, temperature, humidity, timestamp } = req.query;

        if (!device_id || !temperature || !humidity) {
            return res.status(400).json({
                success: false,
                message: 'Missing required parameters'
            });
        }

        const dataRecord = {
            id: Date.now(),
            device_id,
            temperature: parseFloat(temperature),
            humidity: parseFloat(humidity),
            timestamp: parseInt(timestamp) || Date.now(),
            received_at: new Date().toISOString()
        };

        sensorData.push(dataRecord);
        saveDataToFile();

        console.log('GET - Data received:', dataRecord);

        res.status(200).json({
            success: true,
            message: 'Data received via GET',
            data: dataRecord
        });

    } catch (error) {
        console.error('Error processing GET request:', error);
        res.status(500).json({
            success: false,
            message: 'Internal server error'
        });
    }
});

// Route: Lấy tất cả dữ liệu
app.get('/api/data', (req, res) => {
    const limit = parseInt(req.query.limit) || 50;
    const recentData = sensorData.slice(-limit).reverse();

    res.json({
        success: true,
        count: recentData.length,
        total: sensorData.length,
        data: recentData
    });
});

// Route: Lấy dữ liệu theo device_id
app.get('/api/data/:device_id', (req, res) => {
    const { device_id } = req.params;
    const limit = parseInt(req.query.limit) || 50;

    const deviceData = sensorData
        .filter(record => record.device_id === device_id)
        .slice(-limit)
        .reverse();

    res.json({
        success: true,
        device_id,
        count: deviceData.length,
        data: deviceData
    });
});

// Route: Thống kê dữ liệu
app.get('/api/stats', (req, res) => {
    if (sensorData.length === 0) {
        return res.json({
            success: true,
            message: 'No data available',
            stats: {}
        });
    }

    const temperatures = sensorData.map(d => d.temperature);
    const humidities = sensorData.map(d => d.humidity);

    const stats = {
        total_records: sensorData.length,
        temperature: {
            min: Math.min(...temperatures),
            max: Math.max(...temperatures),
            avg: (temperatures.reduce((a, b) => a + b, 0) / temperatures.length).toFixed(2)
        },
        humidity: {
            min: Math.min(...humidities),
            max: Math.max(...humidities),
            avg: (humidities.reduce((a, b) => a + b, 0) / humidities.length).toFixed(2)
        },
        devices: [...new Set(sensorData.map(d => d.device_id))],
        latest_reading: sensorData[sensorData.length - 1]
    };

    res.json({
        success: true,
        stats
    });
});

// Route: Dashboard HTML
app.get('/', (req, res) => {
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
        <title>ESP32 Sensor Dashboard</title>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1">
        <script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.0/chart.min.js"></script>
        <style>
            * { margin: 0; padding: 0; box-sizing: border-box; }
            
            body {
                font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                min-height: 100vh;
                padding: 20px;
                color: #333;
            }
            
            .container {
                max-width: 1400px;
                margin: 0 auto;
            }
            
            .header {
                text-align: center;
                color: white;
                margin-bottom: 30px;
            }
            
            .header h1 {
                font-size: 2.5rem;
                margin-bottom: 10px;
                text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
            }
            
            .header-controls {
                display: flex;
                justify-content: center;
                gap: 15px;
                margin-top: 20px;
                flex-wrap: wrap;
            }
            
            .btn {
                background: rgba(255,255,255,0.2);
                color: white;
                border: 2px solid rgba(255,255,255,0.3);
                padding: 12px 24px;
                border-radius: 25px;
                cursor: pointer;
                transition: all 0.3s ease;
                font-weight: 500;
                backdrop-filter: blur(10px);
            }
            
            .btn:hover {
                background: rgba(255,255,255,0.3);
                border-color: rgba(255,255,255,0.5);
                transform: translateY(-2px);
            }
            
            .btn.active {
                background: rgba(255,255,255,0.4);
                border-color: rgba(255,255,255,0.6);
            }
            
            .dashboard-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
                gap: 20px;
                margin-bottom: 30px;
            }
            
            .card {
                background: rgba(255,255,255,0.95);
                border-radius: 15px;
                padding: 25px;
                box-shadow: 0 8px 32px rgba(0,0,0,0.1);
                backdrop-filter: blur(10px);
                border: 1px solid rgba(255,255,255,0.2);
                transition: transform 0.3s ease;
            }
            
            .card:hover {
                transform: translateY(-5px);
            }
            
            .card h2 {
                color: #2c3e50;
                margin-bottom: 20px;
                font-size: 1.3rem;
                display: flex;
                align-items: center;
                gap: 10px;
            }
            
            .stats-grid {
                display: grid;
                grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
                gap: 15px;
            }
            
            .stat-card {
                background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
                color: white;
                padding: 20px;
                border-radius: 12px;
                text-align: center;
                box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            }
            
            .stat-card.temp {
                background: linear-gradient(135deg, #ffecd2 0%, #fcb69f 100%);
            }
            
            .stat-card.humidity {
                background: linear-gradient(135deg, #a8edea 0%, #fed6e3 100%);
            }
            
            .stat-card.records {
                background: linear-gradient(135deg, #d299c2 0%, #fef9d7 100%);
            }
            
            .stat-card.devices {
                background: linear-gradient(135deg, #89f7fe 0%, #66a6ff 100%);
            }
            
            .stat-card h3 {
                font-size: 0.9rem;
                margin-bottom: 10px;
                opacity: 0.9;
            }
            
            .stat-number {
                font-size: 2rem;
                font-weight: bold;
                margin-bottom: 5px;
            }
            
            .stat-detail {
                font-size: 0.8rem;
                opacity: 0.8;
            }
            
            .chart-container {
                position: relative;
                height: 400px;
                margin: 20px 0;
            }
            
            .chart-controls {
                display: flex;
                justify-content: center;
                gap: 10px;
                margin-bottom: 15px;
                flex-wrap: wrap;
            }
            
            .chart-btn {
                background: #f8f9fa;
                border: 2px solid #dee2e6;
                padding: 8px 16px;
                border-radius: 20px;
                cursor: pointer;
                transition: all 0.3s ease;
                font-size: 0.9rem;
            }
            
            .chart-btn:hover, .chart-btn.active {
                background: #007bff;
                color: white;
                border-color: #007bff;
            }
            
            .realtime-values {
                display: flex;
                justify-content: space-around;
                margin: 20px 0;
            }
            
            .realtime-value {
                text-align: center;
                padding: 15px;
                background: #f8f9fa;
                border-radius: 10px;
                min-width: 120px;
            }
            
            .realtime-value .value {
                font-size: 2rem;
                font-weight: bold;
                color: #007bff;
            }
            
            .realtime-value .label {
                font-size: 0.9rem;
                color: #6c757d;
                margin-top: 5px;
            }
            
            .table-container {
                overflow-x: auto;
                margin-top: 20px;
            }
            
            table {
                width: 100%;
                border-collapse: collapse;
                background: white;
                border-radius: 10px;
                overflow: hidden;
                box-shadow: 0 4px 15px rgba(0,0,0,0.1);
            }
            
            th, td {
                padding: 12px 15px;
                text-align: left;
                border-bottom: 1px solid #f1f3f4;
            }
            
            th {
                background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                color: white;
                font-weight: 600;
            }
            
            tbody tr:hover {
                background-color: #f8f9fa;
            }
            
            .status-indicator {
                display: inline-flex;
                align-items: center;
                gap: 8px;
                margin-bottom: 15px;
            }
            
            .status-dot {
                width: 12px;
                height: 12px;
                border-radius: 50%;
                background: #28a745;
                animation: pulse 2s infinite;
            }
            
            @keyframes pulse {
                0% { box-shadow: 0 0 0 0 rgba(40, 167, 69, 0.7); }
                70% { box-shadow: 0 0 0 10px rgba(40, 167, 69, 0); }
                100% { box-shadow: 0 0 0 0 rgba(40, 167, 69, 0); }
            }
            
            .loading {
                text-align: center;
                padding: 40px;
                color: #6c757d;
            }
            
            @media (max-width: 768px) {
                .header h1 { font-size: 2rem; }
                .header-controls { flex-direction: column; align-items: center; }
                .dashboard-grid { grid-template-columns: 1fr; }
                .stats-grid { grid-template-columns: repeat(2, 1fr); }
                .realtime-values { flex-direction: column; gap: 10px; }
            }
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <h1>🌡️ ESP32 Sensor Dashboard</h1>
                <div class="status-indicator">
                    <div class="status-dot"></div>
                    <span>Live Monitoring Active</span>
                </div>
                <div class="header-controls">
                    <button class="btn active" onclick="setUpdateInterval(10)">⚡ Real-time (10s)</button>
                    <button class="btn" onclick="setUpdateInterval(30)">🔄 Normal (30s)</button>
                    <button class="btn" onclick="setUpdateInterval(60)">⏰ Slow (1min)</button>
                    <button class="btn" onclick="exportData()">📥 Export Data</button>
                    <button class="btn" onclick="location.reload()">🔄 Refresh</button>
                </div>
            </div>
            
            <div class="dashboard-grid">
                <!-- Statistics Card -->
                <div class="card">
                    <h2>📊 Statistics</h2>
                    <div id="stats" class="loading">Loading...</div>
                </div>
                
                <!-- Current Values Card -->
                <div class="card">
                    <h2>📡 Current Values</h2>
                    <div id="current-values" class="loading">Loading...</div>
                </div>
            </div>
            
            <!-- Charts Section -->
            <div class="card">
                <h2>📈 Temperature & Humidity Trends</h2>
                <div class="chart-controls">
                    <button class="chart-btn active" onclick="setChartRange(50)">Last 50 readings</button>
                    <button class="chart-btn" onclick="setChartRange(100)">Last 100 readings</button>
                    <button class="chart-btn" onclick="setChartRange(200)">Last 200 readings</button>
                    <button class="chart-btn" onclick="setChartRange('all')">All data</button>
                </div>
                <div class="chart-container">
                    <canvas id="mainChart"></canvas>
                </div>
            </div>
            
            <!-- Gauge Charts -->
            <div class="dashboard-grid">
                <div class="card">
                    <h2>🌡️ Temperature Gauge</h2>
                    <div class="chart-container" style="height: 300px;">
                        <canvas id="tempGauge"></canvas>
                    </div>
                </div>
                
                <div class="card">
                    <h2>💧 Humidity Gauge</h2>
                    <div class="chart-container" style="height: 300px;">
                        <canvas id="humidityGauge"></canvas>
                    </div>
                </div>
            </div>
            
            <!-- Recent Data Table -->
            <div class="card">
                <h2>📋 Recent Data</h2>
                <div class="table-container">
                    <div id="data-table" class="loading">Loading...</div>
                </div>
            </div>
        </div>
        
        <script>
            let mainChart = null;
            let tempGauge = null;
            let humidityGauge = null;
            let updateInterval = 10000;
            let chartRange = 50;
            let refreshTimer = null;
            
            // Initialize charts
            function initCharts() {
                // Main line chart
                const mainCtx = document.getElementById('mainChart').getContext('2d');
                mainChart = new Chart(mainCtx, {
                    type: 'line',
                    data: {
                        labels: [],
                        datasets: [{
                            label: 'Temperature (°C)',
                            data: [],
                            borderColor: '#ff6b6b',
                            backgroundColor: 'rgba(255, 107, 107, 0.1)',
                            fill: true,
                            tension: 0.4,
                            pointRadius: 4,
                            pointHoverRadius: 6
                        }, {
                            label: 'Humidity (%)',
                            data: [],
                            borderColor: '#4ecdc4',
                            backgroundColor: 'rgba(78, 205, 196, 0.1)',
                            fill: true,
                            tension: 0.4,
                            pointRadius: 4,
                            pointHoverRadius: 6,
                            yAxisID: 'y1'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: {
                                position: 'top',
                            }
                        },
                        scales: {
                            x: {
                                display: true,
                                title: {
                                    display: true,
                                    text: 'Time'
                                }
                            },
                            y: {
                                type: 'linear',
                                display: true,
                                position: 'left',
                                title: {
                                    display: true,
                                    text: 'Temperature (°C)'
                                }
                            },
                            y1: {
                                type: 'linear',
                                display: true,
                                position: 'right',
                                title: {
                                    display: true,
                                    text: 'Humidity (%)'
                                },
                                grid: {
                                    drawOnChartArea: false,
                                }
                            }
                        },
                        animation: {
                            duration: 1000
                        }
                    }
                });
                
                // Temperature gauge
                const tempCtx = document.getElementById('tempGauge').getContext('2d');
                tempGauge = new Chart(tempCtx, {
                    type: 'doughnut',
                    data: {
                        datasets: [{
                            data: [0, 100],
                            backgroundColor: ['#ff6b6b', '#f1f3f4'],
                            borderWidth: 0,
                            cutout: '70%'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false }
                        }
                    }
                });
                
                // Humidity gauge
                const humidityCtx = document.getElementById('humidityGauge').getContext('2d');
                humidityGauge = new Chart(humidityCtx, {
                    type: 'doughnut',
                    data: {
                        datasets: [{
                            data: [0, 100],
                            backgroundColor: ['#4ecdc4', '#f1f3f4'],
                            borderWidth: 0,
                            cutout: '70%'
                        }]
                    },
                    options: {
                        responsive: true,
                        maintainAspectRatio: false,
                        plugins: {
                            legend: { display: false }
                        }
                    }
                });
            }
            
            async function loadStats() {
                try {
                    const response = await fetch('/api/stats');
                    const result = await response.json();
                    const stats = result.stats;
                    
                    if (!stats || stats.total_records === 0) {
                        document.getElementById('stats').innerHTML = '<p style="text-align: center; color: #6c757d;">No data available yet</p>';
                        document.getElementById('current-values').innerHTML = '<p style="text-align: center; color: #6c757d;">Waiting for first reading...</p>';
                        return;
                    }
                    
                    // Update statistics
                    document.getElementById('stats').innerHTML = \`
                        <div class="stats-grid">
                            <div class="stat-card records">
                                <h3>📈 Total Records</h3>
                                <div class="stat-number">\${stats.total_records}</div>
                            </div>
                            <div class="stat-card temp">
                                <h3>🌡️ Temperature</h3>
                                <div class="stat-number">\${stats.temperature.avg}°C</div>
                                <div class="stat-detail">Min: \${stats.temperature.min}°C | Max: \${stats.temperature.max}°C</div>
                            </div>
                            <div class="stat-card humidity">
                                <h3>💧 Humidity</h3>
                                <div class="stat-number">\${stats.humidity.avg}%</div>
                                <div class="stat-detail">Min: \${stats.humidity.min}% | Max: \${stats.humidity.max}%</div>
                            </div>
                            <div class="stat-card devices">
                                <h3>📱 Active Devices</h3>
                                <div class="stat-number">\${stats.devices.length}</div>
                                <div class="stat-detail">\${stats.devices.join(', ')}</div>
                            </div>
                        </div>
                    \`;
                    
                    // Update current values
                    const latest = stats.latest_reading;
                    if (latest) {
                        document.getElementById('current-values').innerHTML = \`
                            <div class="realtime-values">
                                <div class="realtime-value">
                                    <div class="value">\${latest.temperature}°C</div>
                                    <div class="label">Temperature</div>
                                </div>
                                <div class="realtime-value">
                                    <div class="value">\${latest.humidity}%</div>
                                    <div class="label">Humidity</div>
                                </div>
                            </div>
                            <div style="text-align: center; margin-top: 15px; color: #6c757d; font-size: 0.9rem;">
                                Last updated: \${new Date(latest.received_at).toLocaleString()}
                            </div>
                        \`;
                        
                        // Update gauges
                        if (tempGauge && humidityGauge) {
                            tempGauge.data.datasets[0].data = [latest.temperature, Math.max(0, 50 - latest.temperature)];
                            humidityGauge.data.datasets[0].data = [latest.humidity, Math.max(0, 100 - latest.humidity)];
                            tempGauge.update();
                            humidityGauge.update();
                        }
                    }
                } catch (error) {
                    console.error('Error loading stats:', error);
                    document.getElementById('stats').innerHTML = '<p style="text-align: center; color: #dc3545;">Error loading statistics</p>';
                }
            }
            
            async function loadChartData() {
                try {
                    const limit = chartRange === 'all' ? 1000 : chartRange;
                    const response = await fetch(\`/api/data?limit=\${limit}\`);
                    const result = await response.json();
                    
                    if (result.data.length === 0) return;
                    
                    const data = result.data.reverse(); // Reverse to show chronological order
                    
                    const labels = data.map(record => {
                        const date = new Date(record.received_at);
                        return date.toLocaleTimeString();
                    });
                    
                    const temperatures = data.map(record => record.temperature);
                    const humidities = data.map(record => record.humidity);
                    
                    if (mainChart) {
                        mainChart.data.labels = labels;
                        mainChart.data.datasets[0].data = temperatures;
                        mainChart.data.datasets[1].data = humidities;
                        mainChart.update();
                    }
                } catch (error) {
                    console.error('Error loading chart data:', error);
                }
            }
            
            async function loadDataTable() {
                try {
                    const response = await fetch('/api/data?limit=20');
                    const result = await response.json();
                    
                    if (result.data.length === 0) {
                        document.getElementById('data-table').innerHTML = '<p style="text-align: center; color: #6c757d;">No data available</p>';
                        return;
                    }
                    
                    let table = '<table><thead><tr><th>Time</th><th>Device</th><th>Temperature</th><th>Humidity</th><th>Location</th></tr></thead><tbody>';
                    
                    result.data.forEach(record => {
                        const time = new Date(record.received_at).toLocaleString();
                        table += \`<tr>
                            <td>\${time}</td>
                            <td>\${record.device_id}</td>
                            <td><strong>\${record.temperature}°C</strong></td>
                            <td><strong>\${record.humidity}%</strong></td>
                            <td>\${record.location || 'N/A'}</td>
                        </tr>\`;
                    });
                    
                    table += '</tbody></table>';
                    document.getElementById('data-table').innerHTML = table;
                } catch (error) {
                    console.error('Error loading data table:', error);
                    document.getElementById('data-table').innerHTML = '<p style="text-align: center; color: #dc3545;">Error loading data</p>';
                }
            }
            
            function setUpdateInterval(seconds) {
                updateInterval = seconds * 1000;
                
                // Update button states
                document.querySelectorAll('.header-controls .btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                event.target.classList.add('active');
                
                // Restart timer
                if (refreshTimer) {
                    clearInterval(refreshTimer);
                }
                
                refreshTimer = setInterval(loadAllData, updateInterval);
                console.log(\`Update interval set to \${seconds} seconds\`);
            }
            
            function setChartRange(range) {
                chartRange = range;
                
                // Update button states
                document.querySelectorAll('.chart-btn').forEach(btn => {
                    btn.classList.remove('active');
                });
                event.target.classList.add('active');
                
                loadChartData();
            }
            
            async function exportData() {
                try {
                    const response = await fetch('/api/data?limit=1000');
                    const result = await response.json();
                    
                    const csv = 'Time,Device,Temperature,Humidity,Location\\n' + 
                        result.data.map(record => 
                            \`\${new Date(record.received_at).toISOString()},\${record.device_id},\${record.temperature},\${record.humidity},\${record.location || 'N/A'}\`
                        ).join('\\n');
                    
                    const blob = new Blob([csv], { type: 'text/csv' });
                    const url = window.URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = \`esp32_sensor_data_\${new Date().toISOString().split('T')[0]}.csv\`;
                    a.click();
                    window.URL.revokeObjectURL(url);
                } catch (error) {
                    console.error('Error exporting data:', error);
                    alert('Error exporting data');
                }
            }
            
            function loadAllData() {
                loadStats();
                loadChartData();
                loadDataTable();
            }
            
            // Initialize everything
            document.addEventListener('DOMContentLoaded', function() {
                initCharts();
                loadAllData();
                
                // Start auto refresh
                refreshTimer = setInterval(loadAllData, updateInterval);
            });
        </script>
    </body>
    </html>
    `;
    res.send(html);
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);
    res.status(500).json({
        success: false,
        message: 'Internal server error',
        error: err.message
    });
});

// Start server
app.listen(PORT, () => {
    console.log(`\n🚀 Server running on port ${PORT}`);
    console.log(`📊 Dashboard: http://localhost:${PORT}`);
    console.log(`📡 API Endpoint: http://localhost:${PORT}/api/sensor-data`);
    console.log(`📈 Stats: http://localhost:${PORT}/api/stats`);
    console.log(`📋 Data: http://localhost:${PORT}/api/data`);
    console.log(`\n✅ Server ready to receive ESP32 data!`);
});

// Graceful shutdown
process.on('SIGINT', () => {
    console.log('\n🛑 Shutting down server...');
    saveDataToFile();
    console.log('💾 Data saved to file');
    process.exit(0);
});