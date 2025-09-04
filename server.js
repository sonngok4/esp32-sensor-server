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
        <style>
            body { font-family: Arial, sans-serif; margin: 20px; }
            .container { max-width: 1200px; margin: 0 auto; }
            .card { background: #f5f5f5; padding: 20px; margin: 10px 0; border-radius: 8px; }
            .stats { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; }
            .stat { background: white; padding: 15px; border-radius: 5px; text-align: center; }
            table { width: 100%; border-collapse: collapse; margin: 20px 0; }
            th, td { padding: 10px; text-align: left; border-bottom: 1px solid #ddd; }
            th { background-color: #f2f2f2; }
            .refresh { background: #007bff; color: white; padding: 10px 20px; border: none; border-radius: 5px; cursor: pointer; }
        </style>
    </head>
    <body>
        <div class="container">
            <h1>🌡️ ESP32 Sensor Dashboard</h1>
            <button class="refresh" onclick="location.reload()">Refresh</button>
            
            <div class="card">
                <h2>📊 Statistics</h2>
                <div id="stats">Loading...</div>
            </div>
            
            <div class="card">
                <h2>📋 Recent Data (Last 20 records)</h2>
                <div id="data">Loading...</div>
            </div>
        </div>
        
        <script>
            async function loadStats() {
                try {
                    const response = await fetch('/api/stats');
                    const result = await response.json();
                    const stats = result.stats;
                    
                    if (stats.total_records === 0) {
                        document.getElementById('stats').innerHTML = '<p>No data available</p>';
                        return;
                    }
                    
                    document.getElementById('stats').innerHTML = \`
                        <div class="stats">
                            <div class="stat">
                                <h3>📈 Total Records</h3>
                                <p>\${stats.total_records}</p>
                            </div>
                            <div class="stat">
                                <h3>🌡️ Temperature</h3>
                                <p>Min: \${stats.temperature.min}°C</p>
                                <p>Max: \${stats.temperature.max}°C</p>
                                <p>Avg: \${stats.temperature.avg}°C</p>
                            </div>
                            <div class="stat">
                                <h3>💧 Humidity</h3>
                                <p>Min: \${stats.humidity.min}%</p>
                                <p>Max: \${stats.humidity.max}%</p>
                                <p>Avg: \${stats.humidity.avg}%</p>
                            </div>
                            <div class="stat">
                                <h3>📱 Active Devices</h3>
                                <p>\${stats.devices.join(', ')}</p>
                            </div>
                        </div>
                    \`;
                } catch (error) {
                    document.getElementById('stats').innerHTML = '<p>Error loading stats</p>';
                }
            }
            
            async function loadData() {
                try {
                    const response = await fetch('/api/data?limit=20');
                    const result = await response.json();
                    
                    if (result.data.length === 0) {
                        document.getElementById('data').innerHTML = '<p>No data available</p>';
                        return;
                    }
                    
                    let table = '<table><tr><th>Time</th><th>Device</th><th>Temperature</th><th>Humidity</th><th>Location</th></tr>';
                    
                    result.data.forEach(record => {
                        const time = new Date(record.received_at).toLocaleString();
                        table += \`<tr>
                            <td>\${time}</td>
                            <td>\${record.device_id}</td>
                            <td>\${record.temperature}°C</td>
                            <td>\${record.humidity}%</td>
                            <td>\${record.location || 'N/A'}</td>
                        </tr>\`;
                    });
                    
                    table += '</table>';
                    document.getElementById('data').innerHTML = table;
                } catch (error) {
                    document.getElementById('data').innerHTML = '<p>Error loading data</p>';
                }
            }
            
            // Load data on page load
            loadStats();
            loadData();
            
            // Auto refresh every 30 seconds
            setInterval(() => {
                loadStats();
                loadData();
            }, 30000);
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