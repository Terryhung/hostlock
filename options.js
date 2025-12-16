let blockedSites = [];
let siteUsage = {};
let blockedAttempts = {};
let blockedAttemptsByHour = {};
let siteUsageByHour = {};
let previousHourCounts = Array(24).fill(0); // Save previous data for comparison

document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  renderHeatmap();
  renderBlockedSites();
  renderTopSites();

  document.getElementById('blockBtn').addEventListener('click', handleBlock);
  document.getElementById('blockInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleBlock();
    }
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-tab');
      switchTab(tabName);
    });
  });
});

function switchTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  document.querySelectorAll('.tab-panel').forEach(panel => {
    panel.classList.remove('active');
  });

  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(`${tabName}-tab`).classList.add('active');
}

async function loadData() {
  const result = await chrome.storage.local.get(['blockedSites', 'siteUsage', 'blockedAttempts', 'blockedAttemptsByHour', 'siteUsageByHour']);
  blockedSites = result.blockedSites || [];
  siteUsage = result.siteUsage || {};
  blockedAttempts = result.blockedAttempts || {};
  blockedAttemptsByHour = result.blockedAttemptsByHour || {};
  siteUsageByHour = result.siteUsageByHour || {};
}

async function handleBlock() {
  const input = document.getElementById('blockInput');
  const domain = input.value.trim().toLowerCase();

  if (!domain) {
    return;
  }

  const cleanDomain = domain.replace(/^https?:\/\//, '').replace(/\/.*$/, '');

  if (!blockedSites.includes(cleanDomain)) {
    blockedSites.push(cleanDomain);
    await chrome.storage.local.set({ blockedSites });
    input.value = '';
    renderBlockedSites();
  }
}

function renderBlockedSites() {
  const list = document.getElementById('blockedList');
  list.innerHTML = '';

  if (blockedSites.length === 0) {
    list.innerHTML = '<li class="empty">No blocked sites</li>';
    return;
  }

  const today = new Date().toDateString();
  const todayAttempts = blockedAttempts[today] || {};

  blockedSites.forEach(domain => {
    const li = document.createElement('li');
    li.className = 'blocked-item';

    const leftContainer = document.createElement('div');
    leftContainer.className = 'blocked-item-left';

    const domainText = document.createTextNode(domain);
    leftContainer.appendChild(domainText);

    let count = 0;

    Object.keys(todayAttempts).forEach((key) => {
      if (key === domain) {
        count += todayAttempts[key] || 0;
      } else {
        const domainParts = domain.split('.');
        const keyParts = key.split('.');

        if (keyParts.length >= domainParts.length) {
          const keySuffix = keyParts.slice(-domainParts.length).join('.');
          if (keySuffix === domain) {
            count += todayAttempts[key] || 0;
          }
        } else if (domainParts.length >= keyParts.length) {
          const domainSuffix = domainParts.slice(-keyParts.length).join('.');
          if (domainSuffix === key) {
            count += todayAttempts[key] || 0;
          }
        }
      }
    });

    if (count > 0) {
      const badge = document.createElement('span');
      badge.className = 'attempt-badge';
      badge.textContent = count;
      leftContainer.appendChild(badge);
    }

    const removeBtn = document.createElement('button');
    removeBtn.innerHTML = '×';
    removeBtn.className = 'remove-btn';
    removeBtn.setAttribute('aria-label', 'Remove');
    removeBtn.addEventListener('click', () => removeBlockedSite(domain));

    li.appendChild(leftContainer);
    li.appendChild(removeBtn);
    list.appendChild(li);
  });
}

async function removeBlockedSite(domain) {
  blockedSites = blockedSites.filter(d => d !== domain);
  await chrome.storage.local.set({ blockedSites });
  renderBlockedSites();
}

function renderTopSites() {
  const list = document.getElementById('topSitesList');
  list.innerHTML = '';

  const today = new Date().toDateString();
  const todayUsage = siteUsage[today] || {};

  const unblockedSites = Object.entries(todayUsage)
    .filter(([domain]) => !isBlocked(domain))
    .map(([domain, time]) => ({ domain, time }))
    .sort((a, b) => b.time - a.time)
    .slice(0, 10);

  if (unblockedSites.length === 0) {
    list.innerHTML = '<li class="empty">No data available</li>';
    return;
  }

  unblockedSites.forEach(({ domain, time }) => {
    const li = document.createElement('li');
    li.className = 'top-site-item';

    const leftContainer = document.createElement('div');
    leftContainer.className = 'top-site-left';

    const domainSpan = document.createElement('span');
    domainSpan.className = 'domain';
    domainSpan.textContent = domain;
    leftContainer.appendChild(domainSpan);

    const timeSpan = document.createElement('span');
    timeSpan.className = 'time';
    timeSpan.textContent = formatTime(time);
    leftContainer.appendChild(timeSpan);

    // Create mini heatmap for this site
    const heatmapContainer = document.createElement('div');
    heatmapContainer.className = 'top-site-heatmap';
    const today = new Date().toDateString();
    const domainHourData = siteUsageByHour[today]?.[domain] || {};

    // Calculate hour usage
    const hourUsage = Array(24).fill(0);

    Object.keys(domainHourData).forEach(hour => {
      const hourNum = parseInt(hour);
      if (hourNum >= 0 && hourNum < 24) {
        hourUsage[hourNum] = domainHourData[hour] || 0;
      }
    });

    const totalUsage = hourUsage.reduce((sum, val) => sum + val, 0);
    const maxUsage = Math.max(...hourUsage, 1);

    // Only show colors if we have actual hour data
    const hasHourData = totalUsage > 0;

    // Use square root to make small values more visible
    const maxUsageSqrt = hasHourData ? Math.sqrt(maxUsage) : 1;

    // Create 24 cells for the mini heatmap
    for (let hour = 0; hour < 24; hour++) {
      const cell = document.createElement('div');
      cell.className = 'top-site-heatmap-cell';
      const usage = hourUsage[hour];

      // Set color based on intensity (light blue to dark blue)
      if (!hasHourData || usage === 0 || usage < 100) { // No data or less than 100ms, show as empty
        cell.style.backgroundColor = '#f0f0f0';
      } else {
        // Use square root to make small values more visible
        const usageSqrt = Math.sqrt(usage);
        const intensity = maxUsageSqrt > 0 ? Math.max(0.2, usageSqrt / maxUsageSqrt) : 0.2; // Minimum 20% intensity

        const hue = 210; // Blue
        const saturation = 40 + intensity * 50; // 40-90%
        const lightness = 85 - intensity * 40; // 85-45%
        cell.style.backgroundColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
      }

      const usageSeconds = Math.floor(usage / 1000);
      const usageMinutes = Math.floor(usageSeconds / 60);
      const seconds = usageSeconds % 60;
      let timeStr = '';
      if (usageMinutes > 0) {
        timeStr = `${usageMinutes}m`;
        if (seconds > 0) {
          timeStr += ` ${seconds}s`;
        }
      } else {
        timeStr = `${usageSeconds}s`;
      }
      cell.setAttribute('title', `${hour}:00 - ${timeStr}`);

      heatmapContainer.appendChild(cell);
    }

    li.appendChild(leftContainer);
    li.appendChild(heatmapContainer);
    list.appendChild(li);
  });
}

function isBlocked(domain) {
  return blockedSites.some(blocked => {
    if (blocked === domain) {
      return true;
    }
    const blockedParts = blocked.split('.');
    const domainParts = domain.split('.');

    if (domainParts.length >= blockedParts.length) {
      const domainSuffix = domainParts.slice(-blockedParts.length).join('.');
      if (domainSuffix === blocked) {
        return true;
      }
    }

    return false;
  });
}

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) {
    return `${hours}h ${minutes % 60}m`;
  } else if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  } else {
    return `${seconds}s`;
  }
}

function renderHeatmap() {
  const container = document.getElementById('heatmapContainer');
  container.innerHTML = '';

  const today = new Date().toDateString();
  const todayHourData = blockedAttemptsByHour[today] || {};

  // Merge hour data from all blocked sites
  const hourCounts = Array(24).fill(0);

  blockedSites.forEach(domain => {
    const domainHourData = todayHourData[domain] || {};
    Object.keys(domainHourData).forEach(hour => {
      const hourNum = parseInt(hour);
      if (hourNum >= 0 && hourNum < 24) {
        hourCounts[hourNum] += domainHourData[hour] || 0;
      }
    });
  });

  // Also check other potentially matching domains
  Object.keys(todayHourData).forEach(key => {
    const isBlocked = blockedSites.some(blocked => {
      if (blocked === key) return true;
      const blockedParts = blocked.split('.');
      const keyParts = key.split('.');
      if (keyParts.length >= blockedParts.length) {
        const keySuffix = keyParts.slice(-blockedParts.length).join('.');
        if (keySuffix === blocked) return true;
      }
      return false;
    });

    if (isBlocked) {
      const domainHourData = todayHourData[key] || {};
      Object.keys(domainHourData).forEach(hour => {
        const hourNum = parseInt(hour);
        if (hourNum >= 0 && hourNum < 24) {
          hourCounts[hourNum] += domainHourData[hour] || 0;
        }
      });
    }
  });

  const maxCount = Math.max(...hourCounts, 1);

  // Create heatmap
  const heatmapWrapper = document.createElement('div');
  heatmapWrapper.className = 'heatmap-wrapper';

  const heatmapGrid = document.createElement('div');
  heatmapGrid.className = 'heatmap-grid';

  for (let hour = 0; hour < 24; hour++) {
    const cell = document.createElement('div');
    cell.className = 'heatmap-cell';
    const count = hourCounts[hour];
    const intensity = maxCount > 0 ? count / maxCount : 0;

    // Check if this hour's count changed
    const previousCount = previousHourCounts[hour] || 0;
    const hasChanged = count !== previousCount;

    // Set color based on intensity (light red to dark red)
    if (count === 0) {
      cell.style.backgroundColor = '#f0f0f0';
      cell.style.borderColor = '#e0e0e0';
    } else {
      // Use red color scheme, darker as intensity increases
      const hue = 0; // Red
      const saturation = 60 + intensity * 30; // 60-90%
      const lightness = 85 - intensity * 40; // 85-45%
      cell.style.backgroundColor = `hsl(${hue}, ${saturation}%, ${lightness}%)`;
      cell.style.borderColor = `hsl(${hue}, ${saturation}%, ${Math.max(30, lightness - 10)}%)`;
    }

    // Add animation class if data changed
    if (hasChanged && count > previousCount) {
      cell.classList.add('heatmap-cell-updated');
      // Remove animation class after animation completes
      setTimeout(() => {
        cell.classList.remove('heatmap-cell-updated');
      }, 600);
    }

    cell.setAttribute('data-hour', hour);
    cell.setAttribute('data-count', count);
    cell.setAttribute('title', `${hour}:00 - ${count} attempt${count !== 1 ? 's' : ''}`);

    heatmapGrid.appendChild(cell);
  }

  // Update previous counts for next comparison
  previousHourCounts = [...hourCounts];

  heatmapWrapper.appendChild(heatmapGrid);

  // Add time axis labels below the grid
  const timeAxis = document.createElement('div');
  timeAxis.className = 'heatmap-time-axis';
  for (let hour = 0; hour < 24; hour++) {
    const axisLabel = document.createElement('div');
    axisLabel.className = 'heatmap-axis-label';
    // Only show labels for every 3 hours to avoid crowding
    if (hour % 3 === 0) {
      const hourFormatted = hour.toString().padStart(2, '0');
      axisLabel.textContent = `${hourFormatted}:00`;
    }
    timeAxis.appendChild(axisLabel);
  }
  heatmapWrapper.appendChild(timeAxis);

  // Add legend
  const legend = document.createElement('div');
  legend.className = 'heatmap-legend';
  legend.innerHTML = '<span class="legend-label">Darker colors indicate more attempts</span>';
  heatmapWrapper.appendChild(legend);

  container.appendChild(heatmapWrapper);

  // If no data, show message
  if (maxCount === 0) {
    container.innerHTML = '<div class="empty">No attempt records yet</div>';
  }
}

setInterval(async () => {
  await loadData();
  renderHeatmap();
  renderBlockedSites();
  renderTopSites();
}, 5000);

