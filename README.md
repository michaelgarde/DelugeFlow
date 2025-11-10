# DelugeFlow

A modern Chrome extension for sending torrent links directly to your Deluge server. Spiritual successor to [delugesiphon](https://github.com/sbussetti/deluge-siphon).

## What It Does

Intercepts torrent links and magnet URLs in your browser and sends them directly to your Deluge server, eliminating the need to manually download and add torrents.

## Features

- **Automatic Torrent Interception**: Captures .torrent downloads and magnet links
- **Multiple Server Support**: Manage and switch between multiple Deluge servers
- **Smart Label Management**: Automatically apply labels to organize torrents
- **Context Menu Integration**: Right-click any torrent link to send to Deluge
- **Download Location Control**: Set custom download paths per torrent
- **Real-time Status**: View active torrents and progress in popup
- **Cookie Forwarding**: Handles private tracker authentication automatically
- **Dark Mode Support**: Adapts to your system theme

## Build & Install

### Prerequisites

```bash
npm install
```

### Development Build

```bash
# Build TypeScript modules
npm run build:ts

# Watch for changes
npm run watch:ts

# Type checking
npm run type-check
```

### Install in Chrome

1. Build the extension: `npm run build:ts`
2. Open Chrome: `chrome://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the DelugeFlow directory

### Production Build

```bash
# Build and package for distribution
npm run build:all
npm run package
```

Output: `dist/DelugeFlow-{version}.zip`

## Configuration

1. Click the extension icon
2. Go to Options
3. Add your Deluge server(s):
   - Server URL (e.g., `http://localhost:8112`)
   - WebUI password
4. Configure features (context menu, notifications, etc.)

## Tech Stack

- TypeScript (strict mode)
- Vite (build system)
- Chrome Manifest V3
- ES Modules

## Credits

Based on [delugesiphon](https://github.com/sbussetti/deluge-siphon) by S Bussetti.

## License

Apache License 2.0
