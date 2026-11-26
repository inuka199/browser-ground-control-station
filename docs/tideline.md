# Tideline · Beacon Patrol

Fly a drone across South Bay, survey three marked beacons in order, and dock at Jetty Base before the 100-second battery runs out. The playable game and its source are the static files in `client/public/tideline/`. The chart, drone, beacon artwork and icons are original. Sound effects are synthesized on the device.

## Run locally

From the project directory or the extracted source archive, run:

```sh
python -m http.server 4177 --bind 127.0.0.1 --directory client/public
```

Open [Tideline on this computer](http://127.0.0.1:4177/tideline/index.html). Stop the server with Ctrl+C. JavaScript modules and the service worker need an HTTP origin. Opening the HTML file directly from a file manager bypasses that origin.

In the full GCS project, `npm --prefix client run dev` also serves the game. Open **Simulation → Play Tideline**. The game has its own page, manifest and worker scope, and runs independently of the telemetry bridge.

## Fly

- Drag the left stick toward the amber marker. The arrow at the edge of the chart indicates an offscreen target.
- Inside a beacon ring, hold **Scan** for about 1.35 seconds. Releasing the button or leaving the ring interrupts the scan.
- Survey Bell Buoy, North Light and East Shoal, then return to Jetty Base and hold **Dock**.
- Earn 250 points per survey. Docking adds 500 points plus 10 for each remaining battery percentage point, rounded up.
- Use **Pause** to freeze the flight, **Resume flight** to continue, or **Restart flight** to begin with a fresh battery. Switching away from the game pauses it. On a keyboard, use the arrow keys or WASD, hold Space to scan or dock, and press P or Escape to pause or resume.

The game saves position, battery, completed surveys, sound preference and personal best in local storage. It checkpoints during flight, after each scan, and on pause. Reopening starts at the briefing with a **Resume flight** button. A partial scan restarts. Browser data removal or a change of origin starts a separate save.

## Publish over HTTPS

1. Upload the **contents** of `client/public/tideline/` together to a folder on any static HTTPS host. For example, upload them to `/tideline/` and open `https://your-domain.example/tideline/index.html`. To serve the game on its own domain, upload the same files at the site root. The relative manifest and worker paths support both layouts.
2. Serve the JavaScript files as JavaScript and the manifest as `application/manifest+json` or `application/json`. Preserve the file bytes. Disable host-side HTML or script rewriting for this folder because the worker verifies asset hashes. Prefer `Cache-Control: no-cache` for `sw.js` so browsers can discover new releases.
3. Open the deployed URL on the phone while connected. Wait for **Available offline** in the footer. Use **Install** when offered. On iOS, use Safari’s Share menu and **Add to Home Screen**.
4. Close the game, enable airplane mode and launch it again from the home screen. Start a flight, scan a beacon, pause, and reopen to check the save on that device.

Localhost is for the computer running the server. Use the HTTPS deployment to test installation on a separate phone. [Browser installation requirements](https://developer.mozilla.org/en-US/docs/Web/Progressive_web_apps/Guides/Making_PWAs_installable)

## Release an update

Run these commands with Node.js 22 after editing any game file:

```sh
node scripts/build-tideline.mjs
node scripts/build-tideline.mjs --check
node --test test/tideline.test.js
```

Deploy all files from the game folder in one release. A host with atomic deployments helps prevent mixed versions during upload. The worker precaches the complete release and checks each file before installation succeeds. An open game offers **Save & update** when a replacement worker is waiting. Accepting pauses and saves the flight before reloading. A returning tab also checks for a newer release. The save key is independent of the cache version.

The full project's production build, `npm --prefix client run build`, copies the game to `client/dist/tideline/`. The standalone deployment needs only the static game folder.

## Source and verification

| File | Purpose |
| --- | --- |
| `index.html`, `style.css` | Phone, tablet and desktop layouts, briefing, instruments and dialogs |
| `app.js`, `game.js` | Mission rules, flight loop, device saves, scoring and sound |
| `chart.js`, `controls.js` | Canvas map, drone, route guidance and independent thumb controls |
| `install.js`, `app.webmanifest`, `sw.js` | Installation, icons, offline cache and updates |
| `scripts/tideline-worker.template.js`, `scripts/build-tideline.mjs` | Worker source and reproducible release generation |
| `scripts/tideline-icons.py` | Optional launcher icon regeneration with Python and Pillow |

The game has no runtime package dependencies. It rasterizes the static chart once, caps canvas pixel density at 1.6, limits chart redraws to 60 per second and stops the animation loop while paused.

The Node tests fly the complete route and exercise interrupted scans, docking, battery exhaustion, corrupt saves, manifest icon dimensions, cache integrity and offline routing. Frontend tests exercise the actual menu and flight handlers with simulated pointer events, storage and install/update events. To run those tests:

```sh
npm --prefix client ci
npm --prefix client test -- src/test/tidelineApp.test.js src/test/tidelineTouch.test.js
```

Browser automation in the development environment could not start a responsive page renderer. Native installation, an airplane-mode relaunch, and sustained frame rate on a physical phone remain device checks. For an update check, pause halfway through a mission, publish a regenerated release at the same URL, choose **Save & update**, and confirm that **Resume flight** restores the mission.
