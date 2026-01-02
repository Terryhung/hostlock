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

    // Exact match only - only count attempts for the exact domain
    const count = todayAttempts[domain] || 0;

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

// 驗證句子
const VERIFICATION_TEXT = "I can't resist the temptation, so I want to be lazy again, please let me slack off.";
const VERIFICATION_TEXT_REVERSED = VERIFICATION_TEXT.split('').reverse().join('');

let pendingRemoveDomain = null;

// 保存事件處理函數引用，以便移除
let step1Handler = null;
let step2Handler = null;
let confirmHandler = null;
let cancelHandler = null;
let modalClickHandler = null;

function updateTextProgress(inputValue, targetText, textElement) {
  const input = inputValue;
  const target = targetText;
  const textEl = textElement;

  textEl.innerHTML = '';

  // 檢查每個字符並動態顯示
  for (let i = 0; i < target.length; i++) {
    const span = document.createElement('span');

    if (i < input.length) {
      // 已輸入的字符
      if (input[i] === target[i]) {
        span.className = 'correct';
        span.textContent = target[i];
      } else {
        span.className = 'incorrect';
        span.textContent = target[i];
      }
    } else {
      // 待輸入的字符
      span.className = 'pending';
      span.textContent = target[i];
    }

    textEl.appendChild(span);
  }
}

function showRemoveModal(domain) {
  pendingRemoveDomain = domain;
  const modal = document.getElementById('removeModal');
  const step1 = document.getElementById('modalStep1');
  const step2 = document.getElementById('modalStep2');
  const step1Input = document.getElementById('step1Input');
  const step2Input = document.getElementById('step2Input');
  const step1Error = document.getElementById('step1Error');
  const step2Error = document.getElementById('step2Error');
  const step1Text = document.getElementById('step1Text');
  const step2Text = document.getElementById('step2Text');
  const confirmBtn = document.getElementById('modalConfirm');
  const cancelBtn = document.getElementById('modalCancel');

  // 移除舊的事件監聽器
  if (step1Handler) {
    step1Input.removeEventListener('input', step1Handler);
  }
  if (step2Handler) {
    step2Input.removeEventListener('input', step2Handler);
  }
  if (confirmHandler) {
    confirmBtn.removeEventListener('click', confirmHandler);
  }
  if (cancelHandler) {
    cancelBtn.removeEventListener('click', cancelHandler);
  }
  if (modalClickHandler) {
    modal.removeEventListener('click', modalClickHandler);
  }

  // 重置狀態
  step1.style.display = 'block';
  step2.style.display = 'none';
  step1Input.value = '';
  step2Input.value = '';
  step1Error.textContent = '';
  step2Error.textContent = '';
  step1Input.classList.remove('error');
  step2Input.classList.remove('error');
  confirmBtn.disabled = true;

  // 初始化文字顯示
  updateTextProgress('', VERIFICATION_TEXT, step1Text);
  updateTextProgress('', VERIFICATION_TEXT_REVERSED, step2Text);

  // 顯示 modal
  modal.classList.add('show');

  // 第一步驗證
  step1Handler = function() {
    const value = step1Input.value;
    updateTextProgress(value, VERIFICATION_TEXT, step1Text);

    if (value === VERIFICATION_TEXT) {
      step1Input.classList.remove('error');
      step1Error.textContent = '';
      step1.style.display = 'none';
      step2.style.display = 'block';
      step2Input.focus();
      step1Input.removeEventListener('input', step1Handler);
      step1Handler = null;
    } else if (value.length > VERIFICATION_TEXT.length) {
      step1Input.classList.add('error');
      step1Error.textContent = 'Input is too long';
    } else if (value.length > 0) {
      // 檢查是否有錯誤字符
      let hasError = false;
      for (let i = 0; i < value.length; i++) {
        if (value[i] !== VERIFICATION_TEXT[i]) {
          hasError = true;
          break;
        }
      }
      if (hasError) {
        step1Input.classList.add('error');
        step1Error.textContent = 'Incorrect character detected';
      } else {
        step1Input.classList.remove('error');
        step1Error.textContent = '';
      }
    } else {
      step1Input.classList.remove('error');
      step1Error.textContent = '';
    }
  };
  step1Input.addEventListener('input', step1Handler);

  // 第二步驗證
  step2Handler = function() {
    const value = step2Input.value;
    updateTextProgress(value, VERIFICATION_TEXT_REVERSED, step2Text);

    if (value === VERIFICATION_TEXT_REVERSED) {
      step2Input.classList.remove('error');
      step2Error.textContent = '';
      confirmBtn.disabled = false;
    } else if (value.length > VERIFICATION_TEXT_REVERSED.length) {
      step2Input.classList.add('error');
      step2Error.textContent = 'Input is too long';
      confirmBtn.disabled = true;
    } else if (value.length > 0) {
      // 檢查是否有錯誤字符
      let hasError = false;
      for (let i = 0; i < value.length; i++) {
        if (value[i] !== VERIFICATION_TEXT_REVERSED[i]) {
          hasError = true;
          break;
        }
      }
      if (hasError) {
        step2Input.classList.add('error');
        step2Error.textContent = 'Incorrect character detected';
        confirmBtn.disabled = true;
      } else {
        step2Input.classList.remove('error');
        step2Error.textContent = '';
        confirmBtn.disabled = true;
      }
    } else {
      step2Input.classList.remove('error');
      step2Error.textContent = '';
      confirmBtn.disabled = true;
    }
  };
  step2Input.addEventListener('input', step2Handler);

  // 確認按鈕
  confirmHandler = async () => {
    if (step2Input.value.trim() === VERIFICATION_TEXT_REVERSED) {
      await performRemove();
    }
  };
  confirmBtn.addEventListener('click', confirmHandler);

  // 取消按鈕
  cancelHandler = () => {
    modal.classList.remove('show');
    pendingRemoveDomain = null;
  };
  cancelBtn.addEventListener('click', cancelHandler);

  // 點擊背景關閉
  modalClickHandler = (e) => {
    if (e.target === modal) {
      modal.classList.remove('show');
      pendingRemoveDomain = null;
    }
  };
  modal.addEventListener('click', modalClickHandler);

  // 聚焦到第一個輸入框
  step1Input.focus();
}

async function performRemove() {
  if (!pendingRemoveDomain) return;

  blockedSites = blockedSites.filter(d => d !== pendingRemoveDomain);
  await chrome.storage.local.set({ blockedSites });
  renderBlockedSites();

  // 關閉 modal
  const modal = document.getElementById('removeModal');
  modal.classList.remove('show');
  pendingRemoveDomain = null;
}

async function removeBlockedSite(domain) {
  showRemoveModal(domain);
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
  // Exact match only - blocking youtube.com does not block music.youtube.com
  return blockedSites.includes(domain);
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

  // Also check other blocked domains (exact match only)
  Object.keys(todayHourData).forEach(key => {
    // Exact match only - blocking youtube.com does not block music.youtube.com
    if (blockedSites.includes(key)) {
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

