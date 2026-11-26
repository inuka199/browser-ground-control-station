# Fly the Nexus simulator on a phone

The [deployed simulator](https://nexus-drone-flight-simulator.restfulminnow2.chatgpt.site/simulator) requires the site owner's ChatGPT sign-in on the first online visit.

Open the project and select **Start flying**, or open **/simulator** directly. Desktop and phone use the same Three.js aircraft, flight model, coastal world and game routes. The simulator opens without a bridge connection or game account. Operator authentication and session expiry belong to the live station at **/live**.

## Try it over Wi-Fi

From the repository root, install the client dependencies once, then serve the production build.

```sh
npm ci --prefix client
npm --prefix client run build
npm --prefix client run preview -- --host 0.0.0.0 --port 4183
```

Connect the phone and computer to the same Wi-Fi. Open the **Network** address printed by Vite and add **/simulator**. On the computer, open **http://127.0.0.1:4183/simulator**. A LAN HTTP address supports trying the game. Home-screen installation and offline caching require HTTPS on the phone. No UDP bridge, telemetry radio or SITL process is needed for the game.

## Fly

Read the first-flight guide and tap **Start flight**. In a phone browser this tap requests landscape, using fullscreen when available. An installed copy prefers either landscape orientation. If **Rotate your phone to play** stays on screen, turn the phone sideways, then tap **Resume**. If the display stays upright, check the phone's rotation setting. You can open **Flight settings** or leave via **Back to GCS Dashboard** from the portrait screen.

Press the left stick up to take off. Keep it up to climb, pull it down to land, and move it sideways to turn. On the right stick, up flies forward, down flies backward, and sideways strafes. Both sticks work together and spring to neutral when released.

Use **Camera** to switch among the five views. **Flight settings** contains graphics, weather, audio, detailed instruments, the launch compass and recording tools. In **Pause**, open **Display & sound** for the HUD, mute and volume. Open **Flight actions** to restart. **Install game** is visible on the start and pause screens. Rotation and app switching pause the flight and release both sticks. Returning to landscape or reopening the app leaves the aircraft paused until you tap **Resume**. Desktop players can still pause and resume with Escape.

Low is the initial preset on touch devices. Balanced and High are available in Flight settings. Low targets 30 rendered frames per second, caps pixel ratio at 1, disables shadow maps, and reduces cloud, ocean and terrain detail and viewing distance. The horizon still expands with altitude. Actual frame rate depends on the device and scene.

## Saves and installation

Free flight checkpoints store the position, heading and launch pad on pause, in the background, when leaving the simulator, and approximately every five seconds during flight. Open **/simulator** or **Simulation → Continue flight** to resume paused. An explicit **Start flying** or **Explore Port City** launch starts at that pad. Switching apps pauses an active challenge in the current tab. Finish a challenge before closing that tab to keep its result. A backgrounded recording is stopped and saved through the existing recording store when it has enough samples.

Aircraft selection, camera, audio preferences, world settings and completed challenges use the same device storage on mobile and desktop. Each browser and site origin has its own saves. Changing from a LAN address to a hosted domain starts a different save history.

For HTTPS hosting, publish the **contents of client/dist** at the domain root. Serve files at their exact URLs, including **/simulator-worker.js** and **/simulator-pwa/**. Configure SPA fallback to **/index.html** for application navigation. Give the worker and HTML a revalidation policy. Hashed files under **/assets/** can use immutable caching. Deploy the build together so every file referenced by the new worker is available.

Open **/simulator** online in the phone browser and sign in if the host asks. Tap **Install game** on the start or pause screen. Android Chrome shows its native install prompt when available. On iPhone, use Safari’s Share menu, choose **Add to Home Screen**, enable **Open as Web App** if shown, and tap **Add**. Before going offline, wait for **Ready for offline play**. An offline launch restores the saved local flight. While offline, the pause screen offers the garage as an exit.

The worker bundles the release's offline HTML and checks its asset cache before reporting readiness. Online navigation goes through the host's normal sign-in flow. Personalised host pages and sign-in responses are never saved by the game worker. A failed download offers a retry and leaves any previously verified release usable. When an update has downloaded, finish your challenge or recording and tap **Update game** while paused. Close other windows for the same site if prompted. The simulator opens the saved checkpoint after the update. Clearing site data removes local saves.

## Validation

Run the following from the repository root.

```sh
npm test
npm --prefix client test
npm --prefix client run lint
npm --prefix client run build
```

The mobile integration tests exercise two pointers on different sticks, a third unwanted pointer, cancellation, lost capture, takeoff and landing through the shared physics, orientation changes, backgrounding, camera changes, fresh launches and checkpoint restoration. The worker test builds two fixture releases, checks their static imports and icon sizes, rejects a corrupted update, and exercises offline game navigation and the live-route exclusion.

On a Windows host, headless Edge emulated a 390 × 844 touch viewport using software WebGL. Two simultaneous touch points produced a HUD reading of 7.1 m altitude, 14.4 m/s speed and 18° heading. After pause and an offline reload with the HTTP cache disabled, the WebGL canvas returned and the HUD showed the saved altitude of 8.1 m, 0.0 m/s speed and 20° heading. The browser reported zero installability errors and cached 29 resources. Rotating from a 393 × 852 portrait viewport to 852 × 393 paused the flight without horizontal overflow. A second real build waited while the old client was open. Reopening activated the new build and preserved the exact stored aircraft coordinates and heading. These measurements preceded the landscape update.

For the landscape update, Edge ran the production game with a 390 × 844 touch viewport. Starting upright kept the flight paused and showed the rotation prompt. At 667 × 375 and 568 × 320, the HUD, camera, settings button, pause button and both sticks fit without overlapping. The smaller viewport included simulated left, right and bottom safe-area insets of 38, 32 and 8 pixels. Chrome also ran the production game in a standalone app window with emulated touch. It reported standalone display mode and zero installability errors. Starting the flight displayed both sticks, and turning back to landscape after a portrait rotation required Resume. Home-screen installation and OS rotation on a physical handset remain unverified.

A sample at the same hovering location measured 519 draw calls and 4.2 FPS on Balanced versus 311 draw calls and 4.8 FPS on Low in software rendering. These are single-scene desktop measurements. The removed startup water mesh had 68,908 vertices and took a median 29.8 ms to build over nine Node runs on this host. Free flight now creates only the streamed water mesh.

The landscape build passed all 197 frontend tests, all 24 Node tests, lint and the production build. The frontend suite covers fullscreen and standalone launch requests, denied and missing orientation locks, clearing two held sticks, resuming after a late lock result or a rotation, and desktop keyboard flight.

The HTTPS installation release packages its offline HTML in the service worker because the host redirects `/index.html`. All 28 required assets and the worker matched the production build when fetched from the existing private site. Desktop Chrome reported zero installability errors in a standalone window. With a mobile viewport in Chrome, a touch flight checkpoint survived a reload with the test server offline and a staged update activated while paused. Phone operating-system installation and rotation still need a handset check.

To finish handset validation, open the HTTPS simulator in a phone browser and again from its installed home-screen icon. Try with the phone's rotation lock both on and off. During a climb, hold both sticks and rotate, then switch apps and return. Check that the sticks are neutral and flight stays paused until Resume. Check both landscape directions around the phone cutout, and test settings and exit while upright. Reopen in airplane mode and confirm the checkpoint. Measure sustained frame rate, audio and heat on the target handset.

## Changed source

| Area | Files under the repository root |
| --- | --- |
| Flight input and HUD | `client/src/components/simulator/{SimulatorPage,SimulatorWorld,GameHUD,EnvironmentControls,PauseMenu,TouchFlight}.jsx`, `TouchFlight.css`, `mobileFlight.js`, `landscapeSession.js`, `client/src/store/slices/simulator.js` |
| Rendering and preferences | `client/src/components/simulator/world/{SkyEnvironment,StreamingCoast,coastalTerrain}.js`, `client/src/store/slices/environment.js` |
| Phone entry and local saves | `client/index.html`, `client/src/index.css`, `client/src/components/layout/AppShell.jsx`, `client/src/components/views/SimulationView.jsx`, `client/src/services/{localId,localAirspace}.js`, `client/src/store/slices/{challenges,recording}.js` |
| Installation and builds | `client/src/components/simulator/{SimulatorInstall.jsx,useSimulatorInstall.js}`, `client/public/simulator-pwa/`, `client/build/{simulatorPwa.js,simulator-worker.template.js}`, `client/vite.config.js` |
| Verification and instructions | `client/src/test/mobileFlight.test.jsx`, `test/simulatorPwa.test.js`, `README.md`, this guide |
