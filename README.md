# HostLock

A Chrome extension that blocks distracting websites and tracks your browsing habits.


### Dashboard
<img width="640" height="400" alt="hostlock_img_1280_800" src="https://github.com/user-attachments/assets/93cea844-0c9f-431c-b961-40e57b85b6e1" />

### Popup 
<img width="383" height="537" alt="截圖 2025-12-16 下午3 29 55" src="https://github.com/user-attachments/assets/990ea530-e320-44f8-b467-4f402f0801df" />


## Features

- **Website Blocking** - Block domains with exact matching (e.g., blocking `www.youtube.com` does not block `music.youtube.com`)

- **Block Attempt Tracking** - Monitor how many times you tried to access blocked sites, with hourly breakdowns

- **Usage Analytics** - View your top unblocked sites with time spent and hourly usage heatmaps

- **Real-time Dashboard** - Full dashboard with visual heatmaps and detailed statistics

## Installation

1. Open Chrome and go to `chrome://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select this project folder

## Usage

### Quick Actions (Popup)

- Click the extension icon to open the popup
- Add domains to block in the "Blocked Sites" section
- View top 3 unblocked sites with usage time
- See blocked attempt counts for today

### Full Dashboard (Options Page)

- Click the grid icon in the popup header to open the full dashboard
- View hourly heatmap of blocked attempts
- See top 10 unblocked sites with detailed hourly breakdowns
- Manage your blocked sites list

## How It Works

HostLock uses Chrome's `declarativeNetRequest` API to redirect blocked domains to a custom page. It tracks:

- Active tab time spent per domain
- Blocked access attempts with timestamps
- Hourly usage patterns for analytics

Data is stored locally in Chrome's storage and never sent to external servers.

## Support

If you find HostLock useful, consider supporting the project:

[![Buy Me a Coffee](https://img.shields.io/badge/Buy%20Me%20a%20Coffee-ffdd00?style=for-the-badge&logo=buy-me-a-coffee&logoColor=black)](https://buymeacoffee.com/terryhung)

## License

MIT
