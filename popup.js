let blockedSites = [];
let siteUsage = {};
let blockedAttempts = {};

document.addEventListener('DOMContentLoaded', async () => {
  await loadData();
  renderBlockedSites();
  renderTopSites();

  document.getElementById('blockBtn').addEventListener('click', handleBlock);
  document.getElementById('blockInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
      handleBlock();
    }
  });

  document.getElementById('openOptions').addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });
});

async function loadData() {
  const result = await chrome.storage.local.get(['blockedSites', 'siteUsage', 'blockedAttempts']);
  blockedSites = result.blockedSites || [];
  siteUsage = result.siteUsage || {};
  blockedAttempts = result.blockedAttempts || {};
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
    .slice(0, 3);

  if (unblockedSites.length === 0) {
    list.innerHTML = '<li class="empty">No data available</li>';
    return;
  }

  unblockedSites.forEach(({ domain, time }) => {
    const li = document.createElement('li');
    li.className = 'top-site-item';
    const timeStr = formatTime(time);
    li.innerHTML = `<span class="domain">${domain}</span> <span class="time">${timeStr}</span>`;
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

setInterval(async () => {
  await loadData();
  renderBlockedSites();
  renderTopSites();
}, 5000);

