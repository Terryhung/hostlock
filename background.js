let activeTabId = null;
let activeTabStartTime = null;
let currentDomain = null;
let ruleIdCounter = 1;

async function updateBlockingRules() {
  const result = await chrome.storage.local.get(['blockedSites']);
  const blockedSites = result.blockedSites || [];

  const existingRules = await chrome.declarativeNetRequest.getDynamicRules();
  const ruleIdsToRemove = existingRules.map(rule => rule.id);

  if (ruleIdsToRemove.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: ruleIdsToRemove
    });
  }

  const rules = [];

  blockedSites.forEach((domain) => {
    const ruleId = ruleIdCounter++;
    rules.push({
      id: ruleId,
      priority: 1,
      action: {
        type: 'redirect',
        redirect: {
          extensionPath: `/blocked.html?domain=${encodeURIComponent(domain)}`
        }
      },
      condition: {
        requestDomains: [domain],
        resourceTypes: ['main_frame']
      }
    });
  });

  if (rules.length > 0) {
    await chrome.declarativeNetRequest.updateDynamicRules({
      addRules: rules
    });
  }

  ruleIdCounter = 1;
}

chrome.storage.onChanged.addListener((changes, areaName) => {
  if (areaName === 'local' && changes.blockedSites) {
    updateBlockingRules();
  }
});

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'recordBlockedAttempt') {
    recordBlockedAttempt(message.domain).then(() => {
      sendResponse({ success: true });
    }).catch((error) => {
      sendResponse({ success: false, error: error.message });
    });
    return true;
  }
});

updateBlockingRules();

// Cleanup top sites on startup
cleanupTopSites();

chrome.tabs.onActivated.addListener((activeInfo) => {
  handleTabChange(activeInfo.tabId);
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete') {
    if (tab.url) {
      try {
        const url = new URL(tab.url);
        if (url.protocol === 'chrome-extension:' && url.pathname.includes('blocked.html')) {
          const blockedDomain = url.searchParams.get('domain');
          if (blockedDomain) {
            recordBlockedAttempt(blockedDomain);
          }
        }
      } catch (error) {
      }
    }

    if (tab.active) {
      handleTabChange(tabId);
    }
  }
});

async function handleTabChange(tabId) {
  if (activeTabId !== null && activeTabStartTime !== null) {
    const timeSpent = Date.now() - activeTabStartTime;
    if (currentDomain) {
      await recordTimeSpent(currentDomain, timeSpent, activeTabStartTime);
    }
  }

  try {
    const tab = await chrome.tabs.get(tabId);
    if (tab.url) {
      const url = new URL(tab.url);
      if (url.protocol === 'http:' || url.protocol === 'https:') {
        currentDomain = url.hostname;
        activeTabId = tabId;
        activeTabStartTime = Date.now();
      }
    }
  } catch (error) {
    currentDomain = null;
    activeTabId = null;
    activeTabStartTime = null;
  }
}

async function recordTimeSpent(domain, timeSpent, startTime) {
  const now = new Date();
  const today = now.toDateString();

  const result = await chrome.storage.local.get(['siteUsage', 'siteUsageByHour']);
  const siteUsage = result.siteUsage || {};
  const siteUsageByHour = result.siteUsageByHour || {};

  // Record total time (keep backward compatibility)
  if (!siteUsage[today]) {
    siteUsage[today] = {};
  }

  if (!siteUsage[today][domain]) {
    siteUsage[today][domain] = 0;
  }

  siteUsage[today][domain] += timeSpent;

  // Record time spent by hour - split across hours if needed
  if (!siteUsageByHour[today]) {
    siteUsageByHour[today] = {};
  }

  if (!siteUsageByHour[today][domain]) {
    siteUsageByHour[today][domain] = {};
  }

  // If the session spans multiple hours, split the time accordingly
  let currentTime = startTime;
  const endTime = startTime + timeSpent;

  while (currentTime < endTime) {
    const currentDate = new Date(currentTime);
    const currentDateString = currentDate.toDateString();
    const currentHour = currentDate.getHours();

    // Calculate the end of the current hour
    const nextHour = new Date(currentDate);
    nextHour.setHours(currentHour + 1, 0, 0, 0);
    const hourEndTime = Math.min(nextHour.getTime(), endTime);

    // Calculate time spent in this hour
    const timeInThisHour = hourEndTime - currentTime;

    // Only record if it's today's data
    if (currentDateString === today) {
      if (!siteUsageByHour[today][domain][currentHour]) {
        siteUsageByHour[today][domain][currentHour] = 0;
      }
      siteUsageByHour[today][domain][currentHour] += timeInThisHour;
    }

    currentTime = hourEndTime;
  }

  await chrome.storage.local.set({ siteUsage, siteUsageByHour });
}


async function recordBlockedAttempt(domain) {
  const now = new Date();
  const today = now.toDateString();
  const hour = now.getHours();

  const result = await chrome.storage.local.get(['blockedAttempts', 'blockedAttemptsByHour']);
  const blockedAttempts = result.blockedAttempts || {};
  const blockedAttemptsByHour = result.blockedAttemptsByHour || {};

  // 記錄總次數（保持向後兼容）
  if (!blockedAttempts[today]) {
    blockedAttempts[today] = {};
  }

  if (!blockedAttempts[today][domain]) {
    blockedAttempts[today][domain] = 0;
  }

  blockedAttempts[today][domain] += 1;

  // 記錄每小時的嘗試次數
  if (!blockedAttemptsByHour[today]) {
    blockedAttemptsByHour[today] = {};
  }

  if (!blockedAttemptsByHour[today][domain]) {
    blockedAttemptsByHour[today][domain] = {};
  }

  if (!blockedAttemptsByHour[today][domain][hour]) {
    blockedAttemptsByHour[today][domain][hour] = 0;
  }

  blockedAttemptsByHour[today][domain][hour] += 1;

  await chrome.storage.local.set({ blockedAttempts, blockedAttemptsByHour });
}

async function cleanupTopSites() {
  const result = await chrome.storage.local.get(['siteUsage', 'siteUsageByHour', 'blockedSites']);
  const siteUsage = result.siteUsage || {};
  const siteUsageByHour = result.siteUsageByHour || {};
  const blockedSites = result.blockedSites || [];

  // Process each day's data
  Object.keys(siteUsage).forEach(date => {
    const dayUsage = siteUsage[date] || {};

    // Filter out blocked sites and sort by time spent
    const unblockedSites = Object.entries(dayUsage)
      .filter(([domain]) => {
        // Check if domain is blocked
        return !blockedSites.some(blocked => {
          if (blocked === domain) return true;
          const blockedParts = blocked.split('.');
          const domainParts = domain.split('.');
          if (domainParts.length >= blockedParts.length) {
            const domainSuffix = domainParts.slice(-blockedParts.length).join('.');
            if (domainSuffix === blocked) return true;
          }
          return false;
        });
      })
      .map(([domain, time]) => ({ domain, time }))
      .sort((a, b) => b.time - a.time)
      .slice(0, 10); // Keep only top 10

    // Rebuild the day's usage data with only top 10
    const cleanedUsage = {};
    const topDomains = new Set();

    unblockedSites.forEach(({ domain, time }) => {
      cleanedUsage[domain] = time;
      topDomains.add(domain);
    });

    siteUsage[date] = cleanedUsage;

    // Clean up siteUsageByHour for this date - keep only top 10 domains
    if (siteUsageByHour[date]) {
      const cleanedHourData = {};
      Object.keys(siteUsageByHour[date]).forEach(domain => {
        if (topDomains.has(domain)) {
          cleanedHourData[domain] = siteUsageByHour[date][domain];
        }
      });
      siteUsageByHour[date] = cleanedHourData;
    }
  });

  await chrome.storage.local.set({ siteUsage, siteUsageByHour });
}

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === 'saveActiveTab') {
    if (activeTabId !== null && activeTabStartTime !== null && currentDomain) {
      const timeSpent = Date.now() - activeTabStartTime;
      await recordTimeSpent(currentDomain, timeSpent, activeTabStartTime);
      activeTabStartTime = Date.now();
    }
  } else if (alarm.name === 'cleanupTopSites') {
    await cleanupTopSites();
  }
});

chrome.alarms.create('saveActiveTab', { periodInMinutes: 3 });
chrome.alarms.create('cleanupTopSites', { periodInMinutes: 60 }); // Run every hour

