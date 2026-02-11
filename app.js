// ============================================
// GLOBAL VARIABLES
// ============================================
let map;
let markersLayer;
let currentUser = null;
let currentData = null;
let allData = null;
let frontTypeChart = null;
let materialChart = null;
let selectedChartFilter = null;

const API_BASE_URL = 'https://script.google.com/macros/s/AKfycbyHe_h-EwQJ0hhfIPtydxZwh6PGg6zDJ2SH8pPB2bSkD89xK9z1fcdRWVYd_dQKsq_Ntg/exec?';

// ============================================
// AUTHENTICATION
// ============================================
async function loadUserConfig() {
    try {
        const response = await fetch('config_user.json');
        const config = await response.json();
        return config.users;
    } catch (error) {
        console.error('Error loading user config:', error);
        return [
            { username: 'admin', password: 'admin123', role: 'Administrator' },
            { username: 'user', password: 'user123', role: 'User' }
        ];
    }
}

document.getElementById('login-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;
    const errorDiv = document.getElementById('login-error');
    
    const users = await loadUserConfig();
    const user = users.find(u => u.username === username && u.password === password);
    
    if (user) {
        currentUser = user;
        localStorage.setItem('currentUser', JSON.stringify(user));
        
        document.getElementById('login-page').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        
        document.getElementById('user-name').textContent = user.username;
        document.getElementById('user-role').textContent = user.role;
        
        initializeMap();
        setDefaultFilters();
        
        showToast('success', 'Login Successful', `Welcome back, ${user.username}!`);
    } else {
        errorDiv.classList.remove('hidden');
        setTimeout(() => {
            errorDiv.classList.add('hidden');
        }, 3000);
    }
});

document.getElementById('logout-btn').addEventListener('click', function() {
    localStorage.removeItem('currentUser');
    currentUser = null;
    
    document.getElementById('app').classList.add('hidden');
    document.getElementById('login-page').classList.remove('hidden');
    
    document.getElementById('username').value = '';
    document.getElementById('password').value = '';
    
    showToast('info', 'Logged Out', 'You have been logged out successfully');
});

window.addEventListener('load', function() {
    const storedUser = localStorage.getItem('currentUser');
    if (storedUser) {
        currentUser = JSON.parse(storedUser);
        document.getElementById('login-page').classList.add('hidden');
        document.getElementById('app').classList.remove('hidden');
        document.getElementById('user-name').textContent = currentUser.username;
        document.getElementById('user-role').textContent = currentUser.role;
        initializeMap();
        setDefaultFilters();
    }
});

// ============================================
// SET DEFAULT FILTERS
// ============================================
function setDefaultFilters() {
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('filter-date').value = today;
    document.getElementById('filter-mitra').value = 'SIS';
    document.getElementById('filter-material').value = 'OB';
}

// ============================================
// NAVIGATION
// ============================================
const navButtons = document.querySelectorAll('.nav-btn');

navButtons.forEach(btn => {
    btn.addEventListener('click', function() {
        const views = ['map-view', 'dashboard-view', 'help-view'];
        
        // Update active button
        navButtons.forEach(b => {
            b.classList.remove('bg-blue-600', 'text-white');
            b.classList.add('text-gray-700', 'hover:bg-gray-100');
        });
        
        if (this.id !== 'nav-help') {
            this.classList.add('bg-blue-600', 'text-white');
            this.classList.remove('text-gray-700', 'hover:bg-gray-100');
        }
        
        // Show corresponding view
        views.forEach(view => {
            document.getElementById(view).classList.add('hidden');
        });
        
        if (this.id === 'nav-map') {
            document.getElementById('map-view').classList.remove('hidden');
            document.getElementById('sidebar-table-section').classList.remove('hidden');
            setTimeout(() => map && map.invalidateSize(), 100);
        } else if (this.id === 'nav-dashboard') {
            document.getElementById('dashboard-view').classList.remove('hidden');
            document.getElementById('sidebar-table-section').classList.add('hidden');
        } else if (this.id === 'nav-help') {
            document.getElementById('help-view').classList.remove('hidden');
            document.getElementById('sidebar-table-section').classList.add('hidden');
        }
    });
});

// Sidebar toggle
document.getElementById('toggle-sidebar-btn').addEventListener('click', function() {
    const sidebar = document.getElementById('sidebar');
    sidebar.classList.toggle('sidebar-hidden');
    
    setTimeout(() => map && map.invalidateSize(), 300);
});

// ============================================
// MAP INITIALIZATION
// ============================================
function initializeMap() {
    if (map) return;
    
    map = L.map('map').setView([-2.167, 115.579], 13);
    
    const osmLayer = L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap contributors'
    });
    
    const satelliteLayer = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
        attribution: 'Tiles &copy; Esri'
    });
    
    const topoLayer = L.tileLayer('https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png', {
        attribution: 'Map data: © OpenStreetMap contributors, SRTM | Map style: © OpenTopoMap'
    });
    
    osmLayer.addTo(map);
    
    const baseLayers = {
        "Satellite": satelliteLayer,
        "Topographic": topoLayer,
        "Street Map": osmLayer,
    };
    
    L.control.layers(baseLayers).addTo(map);
    
    markersLayer = L.layerGroup().addTo(map);
}

// ============================================
// FILTER FORM
// ============================================
document.getElementById('filter-form').addEventListener('submit', async function(e) {
    e.preventDefault();
    await fetchData();
});

document.getElementById('reset-filter-btn').addEventListener('click', function() {
    setDefaultFilters();
    selectedChartFilter = null;
    document.getElementById('sidebar-table-title').textContent = 'Data Table';
    document.getElementById('dashboard-table-title').textContent = 'Data Table - All Data';
});

// ============================================
// DATA FETCHING
// ============================================
async function fetchData() {
    const date = document.getElementById('filter-date').value;
    const mitra = document.getElementById('filter-mitra').value;
    const material = document.getElementById('filter-material').value;
    
    if (!date) {
        showToast('warning', 'Missing Date', 'Please select a date');
        return;
    }
    
    let url = `${API_BASE_URL}?date=${date}`;
    if (mitra) url += `&mitra=${mitra}`;
    if (material) url += `&material=${material}`;
    
    showLoading('Fetching data from API...');
    
    try {
        const response = await fetch(url);
        
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        
        const data = await response.json();
        allData = data;
        currentData = data;
        selectedChartFilter = null;
        
        hideLoading();
        
        if (data.features && data.features.length > 0) {
            const isMapView = !document.getElementById('map-view').classList.contains('hidden');
            const isDashboardView = !document.getElementById('dashboard-view').classList.contains('hidden');
            
            if (isMapView) {
                // Map workflow: show table in sidebar and map
                displayDataOnMap(data);
                displaySidebarTable(data.features, 'All Data');
            } else if (isDashboardView) {
                // Dashboard workflow: show charts and table in dashboard
                processAndDisplayCharts(data);
                displayDashboardTable(data.features, 'All Data');
            }
            
            document.getElementById('filter-info').classList.remove('hidden');
            document.getElementById('data-count').textContent = data.features.length;
            showToast('success', 'Data Loaded', `Successfully loaded ${data.features.length} records`);
        } else {
            markersLayer.clearLayers();
            clearSidebarTable();
            clearDashboardTable();
            document.getElementById('filter-info').classList.add('hidden');
            showToast('info', 'No Data', 'No data found for the selected filters');
        }
    } catch (error) {
        console.error('Error fetching data:', error);
        hideLoading();
        showToast('error', 'Error', `Failed to fetch data: ${error.message}`);
    }
}

// ============================================
// MAP DISPLAY
// ============================================
function displayDataOnMap(geojsonData) {
    markersLayer.clearLayers();
    
    const bounds = [];
    
    geojsonData.features.forEach((feature, index) => {
        const coords = feature.geometry.coordinates;
        const props = feature.properties;
        const latLng = [coords[1], coords[0]];
        
        bounds.push(latLng);
        
        let markerColor = '#808080';
        switch(props.FRONT_TYPE) {
            case 'Loading':
                markerColor = '#00DCFA';
                break;
            case 'Dumping':
                markerColor = '#FF00AA';
                break;
            case 'Stockpile':
                markerColor = '#4daf4a';
                break;
        }
        
        const icon = L.divIcon({
            className: 'custom-marker',
            html: `<div style="background-color: ${markerColor}; width: 12px; height: 12px; border-radius: 50%; border: 2px solid white; box-shadow: 0 0 4px rgba(0,0,0,0.5);"></div>`,
            iconSize: [12, 12],
            iconAnchor: [6, 6]
        });
        
        const marker = L.marker(latLng, { icon: icon });
        
        const popupContent = createPopupContent(props);
        marker.bindPopup(popupContent, { maxWidth: 400 });
        
        if (props.NAMA_FRONT) {
            marker.bindTooltip(props.NAMA_FRONT, {
                permanent: false,
                direction: 'top',
                className: 'point-label'
            });
        }
        
        marker.featureData = feature;
        marker.featureIndex = index;
        
        marker.addTo(markersLayer);
    });
    
    if (bounds.length > 0) {
        map.fitBounds(bounds, { padding: [50, 50] });
    }
}

function createPopupContent(props) {
    let html = '<table class="popup-table">';
    
    const fields = [
        { key: 'DATETIME', label: 'Date Time' },
        { key: 'NAMA', label: 'Nama' },
        { key: 'MITRA_KERJA', label: 'Mitra' },
        { key: 'NAMA_FRONT', label: 'Front Name' },
        { key: 'FRONT_TYPE', label: 'Front Type' },
        { key: 'MATERIAL', label: 'Material' },
        { key: 'ACTUAL_LEVEL', label: 'Actual Level' },
        { key: 'RL', label: 'RL' },
        { key: 'DGN_LEVEL', label: 'Design Level' },
        { key: 'GRADE', label: 'Grade' },
        { key: 'EASTING', label: 'Easting' },
        { key: 'NORTHING', label: 'Northing' },
        { key: 'KETERANGAN', label: 'Keterangan' }
    ];
    
    fields.forEach(field => {
        let value = props[field.key] || '-';
        
        if (field.key === 'DATETIME' && value !== '-') {
            try {
                const date = new Date(value);
                value = date.toLocaleString();
            } catch (e) {}
        }
        
        html += `<tr><th>${field.label}:</th><td>${value}</td></tr>`;
    });
    
    if (props.PHOTO) {
        html += `<tr><th>Photo:</th><td><a href="${props.PHOTO}" target="_blank" class="text-blue-600 hover:underline">View Photo</a></td></tr>`;
    }
    
    html += '</table>';
    return html;
}

// ============================================
// DASHBOARD
// ============================================
function processAndDisplayCharts(geojsonData) {
    const features = geojsonData.features;
    
    const frontTypeCounts = {};
    const materialCounts = {};
    let loadingCount = 0;
    let dumpingCount = 0;
    
    features.forEach(feature => {
        const props = feature.properties;
        
        const frontType = props.FRONT_TYPE || 'Unknown';
        frontTypeCounts[frontType] = (frontTypeCounts[frontType] || 0) + 1;
        
        if (frontType === 'Loading') loadingCount++;
        if (frontType === 'Dumping') dumpingCount++;
        
        const material = props.MATERIAL || 'Unknown';
        materialCounts[material] = (materialCounts[material] || 0) + 1;
    });
    
    document.getElementById('stats-total').textContent = features.length;
    document.getElementById('stats-loading').textContent = loadingCount;
    document.getElementById('stats-dumping').textContent = dumpingCount;
    
    drawFrontTypeChart(frontTypeCounts);
    drawMaterialChart(materialCounts);
}

function drawFrontTypeChart(data) {
    const ctx = document.getElementById('frontTypeChart').getContext('2d');
    
    if (frontTypeChart) {
        frontTypeChart.destroy();
    }
    
    const labels = Object.keys(data);
    const values = Object.values(data);
    const colors = labels.map(label => {
        switch(label) {
            case 'Loading': return '#00DCFA';
            case 'Dumping': return '#FF00AA';
            case 'Stockpile': return '#4daf4a';
            default: return '#808080';
        }
    });
    
    frontTypeChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Count',
                data: values,
                backgroundColor: colors,
                borderColor: colors,
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                }
            },
            onClick: (event, activeElements) => {
                if (activeElements.length > 0 && allData) {
                    const index = activeElements[0].index;
                    const label = labels[index];
                    filterDashboardDataByChart('FRONT_TYPE', label);
                }
            }
        }
    });
}

function drawMaterialChart(data) {
    const ctx = document.getElementById('materialChart').getContext('2d');
    
    if (materialChart) {
        materialChart.destroy();
    }
    
    const labels = Object.keys(data);
    const values = Object.values(data);
    
    const colorPalette = [
        '#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40'
    ];
    
    materialChart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: labels,
            datasets: [{
                label: 'Count',
                data: values,
                backgroundColor: colorPalette.slice(0, labels.length),
                borderColor: colorPalette.slice(0, labels.length),
                borderWidth: 2
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { display: false },
                title: { display: false }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: { stepSize: 1 }
                }
            },
            onClick: (event, activeElements) => {
                if (activeElements.length > 0 && allData) {
                    const index = activeElements[0].index;
                    const label = labels[index];
                    filterDashboardDataByChart('MATERIAL', label);
                }
            }
        }
    });
}

function filterDashboardDataByChart(filterType, filterValue) {
    if (!allData || !allData.features) return;
    
    selectedChartFilter = { type: filterType, value: filterValue };
    
    const filteredFeatures = allData.features.filter(feature => 
        feature.properties[filterType] === filterValue
    );
    
    displayDashboardTable(filteredFeatures, `${filterType}: ${filterValue}`);
    showToast('info', 'Chart Filter Applied', `Showing ${filteredFeatures.length} records for ${filterValue}`);
}

// ============================================
// SIDEBAR TABLE (for Map View)
// ============================================
function displaySidebarTable(features, titleSuffix = 'All Data') {
    const container = document.getElementById('sidebar-table-container');
    const tableTitle = document.getElementById('sidebar-table-title');
    
    tableTitle.textContent = `${titleSuffix}`;
    
    if (!features || features.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-400">
                <i class="fas fa-table text-4xl mb-2 opacity-30"></i>
                <p class="text-xs">No data available</p>
            </div>
        `;
        return;
    }
    
    const columns = [
        'DATETIME', 'NAMA', 'MITRA_KERJA', 'NAMA_FRONT', 'FRONT_TYPE',
        'MATERIAL', 'ACTUAL_LEVEL', 'RL'
    ];
    
    let html = '<table class="data-table w-full text-xs">';
    html += '<thead class="bg-gray-800 text-white"><tr>';
    html += '<th class="px-2 py-2 text-left">Action</th>';
    
    columns.forEach(col => {
        html += `<th class="px-2 py-2 text-left">${col.replace(/_/g, ' ')}</th>`;
    });
    html += '</tr></thead><tbody class="bg-white divide-y divide-gray-200">';
    
    features.forEach((feature, index) => {
        const props = feature.properties;
        html += '<tr class="hover:bg-gray-50">';
        
        const globalIndex = allData ? allData.features.findIndex(f => f.properties.ID === props.ID) : index;
        
        html += `<td class="px-2 py-2">
            <button onclick="zoomToFeature(${globalIndex})" 
                class="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700 transition">
                <i class="fas fa-search-location"></i>
            </button>
        </td>`;
        
        columns.forEach(col => {
            let value = props[col] || '-';
            
            if (col === 'FRONT_TYPE') {
                let bgColor = '#808080';
                switch(value) {
                    case 'Loading': bgColor = '#00DCFA'; break;
                    case 'Dumping': bgColor = '#FF00AA'; break;
                    case 'Stockpile': bgColor = '#4daf4a'; break;
                }
                value = `<span class="px-2 py-1 rounded text-xs font-medium text-white" style="background-color: ${bgColor}">${value}</span>`;
            }
            
            if (col === 'DATETIME' && value !== '-') {
                try {
                    const date = new Date(value);
                    value = date.toLocaleString('id-ID', { 
                        month: '2-digit', 
                        day: '2-digit', 
                        hour: '2-digit', 
                        minute: '2-digit' 
                    });
                } catch (e) {}
            }
            
            html += `<td class="px-2 py-2">${value}</td>`;
        });
        html += '</tr>';
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

function clearSidebarTable() {
    const container = document.getElementById('sidebar-table-container');
    container.innerHTML = `
        <div class="text-center py-8 text-gray-400">
            <i class="fas fa-table text-4xl mb-2 opacity-30"></i>
            <p class="text-xs">Submit filter to load data</p>
        </div>
    `;
    document.getElementById('sidebar-table-title').textContent = 'Data Table';
}

// ============================================
// DASHBOARD TABLE (for Dashboard View)
// ============================================
function displayDashboardTable(features, titleSuffix = 'All Data') {
    const container = document.getElementById('dashboard-table-container');
    const tableTitle = document.getElementById('dashboard-table-title');
    
    tableTitle.textContent = `Data Table - ${titleSuffix}`;
    
    if (!features || features.length === 0) {
        container.innerHTML = `
            <div class="text-center py-8 text-gray-400">
                <i class="fas fa-table text-4xl mb-2 opacity-30"></i>
                <p class="text-sm">No data available</p>
            </div>
        `;
        return;
    }
    
    const columns = [
        'DATETIME', 'NAMA', 'MITRA_KERJA', 'NAMA_FRONT', 'FRONT_TYPE',
        'MATERIAL', 'ACTUAL_LEVEL', 'RL', 'DGN_LEVEL', 'GRADE'
    ];
    
    let html = '<table class="data-table w-full text-xs">';
    html += '<thead class="bg-gray-800 text-white"><tr>';
    
    columns.forEach(col => {
        html += `<th class="px-3 py-2 text-left">${col.replace(/_/g, ' ')}</th>`;
    });
    html += '</tr></thead><tbody class="bg-white divide-y divide-gray-200">';
    
    features.forEach((feature) => {
        const props = feature.properties;
        html += '<tr class="hover:bg-gray-50">';
        
        columns.forEach(col => {
            let value = props[col] || '-';
            
            if (col === 'FRONT_TYPE') {
                let bgColor = '#808080';
                switch(value) {
                    case 'Loading': bgColor = '#00DCFA'; break;
                    case 'Dumping': bgColor = '#FF00AA'; break;
                    case 'Stockpile': bgColor = '#4daf4a'; break;
                }
                value = `<span class="px-2 py-1 rounded text-xs font-medium text-white" style="background-color: ${bgColor}">${value}</span>`;
            }
            
            if (col === 'DATETIME' && value !== '-') {
                try {
                    const date = new Date(value);
                    value = date.toLocaleString('id-ID', { 
                        year: 'numeric',
                        month: '2-digit', 
                        day: '2-digit', 
                        hour: '2-digit', 
                        minute: '2-digit' 
                    });
                } catch (e) {}
            }
            
            html += `<td class="px-3 py-2">${value}</td>`;
        });
        html += '</tr>';
    });
    
    html += '</tbody></table>';
    container.innerHTML = html;
}

function clearDashboardTable() {
    const container = document.getElementById('dashboard-table-container');
    container.innerHTML = `
        <div class="text-center py-8 text-gray-400">
            <i class="fas fa-table text-4xl mb-2 opacity-30"></i>
            <p class="text-sm">Submit filter to load data</p>
        </div>
    `;
    document.getElementById('dashboard-table-title').textContent = 'Data Table - All Data';
}

// ============================================
// ZOOM TO FEATURE
// ============================================
window.zoomToFeature = function(index) {
    if (!allData || !allData.features[index]) return;
    
    const feature = allData.features[index];
    const coords = feature.geometry.coordinates;
    const latLng = [coords[1], coords[0]];
    
    // Switch to map view
    document.getElementById('nav-map').click();
    
    // Show sidebar if hidden
    const sidebar = document.getElementById('sidebar');
    if (sidebar.classList.contains('sidebar-hidden')) {
        sidebar.classList.remove('sidebar-hidden');
    }
    
    setTimeout(() => {
        map.setView(latLng, 18);
        
        markersLayer.eachLayer(layer => {
            if (layer.featureData && layer.featureData.properties.ID === feature.properties.ID) {
                layer.openPopup();
            }
        });
    }, 300);
};

// ============================================
// EXPORT CSV
// ============================================
document.getElementById('sidebar-export-csv-btn').addEventListener('click', function() {
    exportToCSV('sidebar');
});

document.getElementById('dashboard-export-csv-btn').addEventListener('click', function() {
    exportToCSV('dashboard');
});

function exportToCSV(source) {
    let dataToExport = currentData;
    
    if (source === 'dashboard' && selectedChartFilter && allData) {
        dataToExport = {
            features: allData.features.filter(f => 
                f.properties[selectedChartFilter.type] === selectedChartFilter.value
            )
        };
    }
    
    if (!dataToExport || !dataToExport.features || dataToExport.features.length === 0) {
        showToast('warning', 'No Data', 'No data to export');
        return;
    }
    
    const features = dataToExport.features;
    const columns = [
        'DATETIME', 'NAMA', 'MITRA_KERJA', 'NAMA_FRONT', 'FRONT_TYPE',
        'MATERIAL', 'ACTUAL_LEVEL', 'RL', 'DGN_LEVEL', 'GRADE',
        'EASTING', 'NORTHING', 'LATITUDE', 'LONGITUDE', 'KETERANGAN'
    ];
    
    let csv = columns.join(',') + '\n';
    
    features.forEach(feature => {
        const props = feature.properties;
        const row = columns.map(col => {
            let value = props[col] || '';
            if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
                value = '"' + value.replace(/"/g, '""') + '"';
            }
            return value;
        });
        csv += row.join(',') + '\n';
    });
    
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `gradebox_data_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
    
    showToast('success', 'Export Complete', 'CSV file has been downloaded');
}

// ============================================
// UI HELPERS
// ============================================
function showLoading(message = 'Loading...') {
    document.getElementById('loading-message').textContent = message;
    document.getElementById('loading-modal').classList.remove('hidden');
    document.getElementById('loading-modal').classList.add('flex');
}

function hideLoading() {
    document.getElementById('loading-modal').classList.add('hidden');
    document.getElementById('loading-modal').classList.remove('flex');
}

function showToast(type, title, message) {
    const toast = document.getElementById('notification-toast');
    const toastIcon = document.getElementById('toast-icon');
    const toastTitle = document.getElementById('toast-title');
    const toastMessage = document.getElementById('toast-message');
    const toastContent = document.getElementById('toast-content');
    
    toastContent.className = 'bg-white rounded-lg shadow-xl p-4 min-w-[300px]';
    
    switch(type) {
        case 'success':
            toastIcon.className = 'fas fa-check-circle text-2xl mr-3 text-green-500';
            toastContent.classList.add('border-l-4', 'border-green-500');
            break;
        case 'error':
            toastIcon.className = 'fas fa-exclamation-circle text-2xl mr-3 text-red-500';
            toastContent.classList.add('border-l-4', 'border-red-500');
            break;
        case 'warning':
            toastIcon.className = 'fas fa-exclamation-triangle text-2xl mr-3 text-yellow-500';
            toastContent.classList.add('border-l-4', 'border-yellow-500');
            break;
        case 'info':
            toastIcon.className = 'fas fa-info-circle text-2xl mr-3 text-blue-500';
            toastContent.classList.add('border-l-4', 'border-blue-500');
            break;
    }
    
    toastTitle.textContent = title;
    toastMessage.textContent = message;
    
    toast.classList.remove('hidden');
    
    setTimeout(() => {
        toast.classList.add('hidden');
    }, 3000);
}

document.getElementById('close-toast').addEventListener('click', function() {
    document.getElementById('notification-toast').classList.add('hidden');
});
