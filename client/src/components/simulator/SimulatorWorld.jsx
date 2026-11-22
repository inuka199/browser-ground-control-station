/**
 * simulator/SimulatorWorld.jsx
 *
 * Full Three.js world for the flight simulator.
 *
 * FIXED (StrictMode safe): A `activeRef` guard prevents the double-invoke
 * of useEffect in React 18 StrictMode from spawning two competing animation
 * loops. Cleanup resets the guard so hot-reloads still work correctly.
 *
 * FIXED: Zustand v5 removed the two-argument subscribe(selector, cb) API.
 * All store reads inside the animation loop now use getState() directly
 * (safe — getState() is synchronous and does not trigger re-renders).
 *
 * Local coastal environment, dynamic atmosphere, optional Google tiles,
 * aircraft models and five cameras. Flight and telemetry remain separate
 * from the visual world clock. All GPU resources are released on unmount.
 */
import React, { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { useTelemetryStore } from "../../store/slices/telemetry.js";
import { useSimulatorStore } from "../../store/slices/simulator.js";
import { buildSkyEnvironment } from "./world/SkyEnvironment.js";
import { createStormClock } from "./world/stormClock.js";
import { buildProceduralWorld } from "./world/ProceduralWorld.js";
import { buildTilesWorld } from "./world/TilesWorld.js";
import {
  COLOMBO_ECEF,
  COLOMBO_LAT,
  COLOMBO_LON,
} from "./world/ecefConverter.js";
import { gpsToLocal } from "./world/CoordConverter.js";
import { getModelById, animateDroneRotors } from "./models/droneModels.js";
import { useEnvironmentStore } from "../../store/slices/environment.js";
import { useConnectionStore } from "../../store/slices/connection.js";
import { usePayloadStore } from "../../store/slices/payload.js";
import { useChallengeStore } from "../../store/slices/challenges.js";
import {
  useAirspaceStore,
  updateLocalFlight,
} from "../../services/localAirspace.js";
import {
  createFlight,
  stepFlight,
  flightInstruments,
  hasLivePosition,
} from "./flightDynamics.js";
import { demoInput } from "./demoInput.js";
import {
  moveAroundBuildings,
  nearestBuildingDistance,
} from "./buildingCollision.js";
import {
  updateFlightAudio,
  stopFlightAudio,
  disposeFlightAudio,
  playFlightEffect,
} from "./flightAudio.js";
import { createCameraRig } from "./cameraRig.js";
import { streetSources } from "./streetAudio.js";
import {
  createChallengeGame,
  stepChallengeGame,
  isArcadeChallenge,
  hitsCar,
} from "./challengeGame.js";
import { createExplosionEffects } from "./world/ExplosionEffects.js";
import { createChallengeActors } from "./world/ChallengeActors.js";
import { PORT_SPAWN } from "./world/PortCity.js";

// ── Altitude indicator ────────────────────────────────────────────────────────

function buildAltIndicator() {
  const lineGeo = new THREE.BufferGeometry().setFromPoints([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0, -1000, 0),
  ]);
  const lineMat = new THREE.LineBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.3,
  });
  const line = new THREE.Line(lineGeo, lineMat);

  const discGeo = new THREE.CircleGeometry(0.7, 20);
  const discMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });
  const disc = new THREE.Mesh(discGeo, discMat);
  disc.rotation.x = -Math.PI / 2;

  const group = new THREE.Group();
  group.add(line, disc);
  return { group, lineGeo, lineMat, discGeo, discMat };
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function SimulatorWorld() {
  const [renderError, setRenderError] = useState("");
  const mountRef = useRef(null);
  const droneRef = useRef(null); // { group, rotorMeshes, modelId }
  const tilesRef = useRef(null); // TilesWorld controller | null
  const activeRef = useRef(false); // StrictMode guard

  // ── THREE.js setup (runs once) ────────────────────────────────────────────
  useEffect(() => {
    // StrictMode guard: React 18 strict mode double-invokes effects.
    // The first cleanup resets activeRef so the second invocation proceeds.
    if (activeRef.current) return;
    activeRef.current = true;

    const container = mountRef.current;
    if (!container) return;

    // Use window dimensions as fallback — container might be 0×0 before layout
    const w = container.clientWidth || window.innerWidth;
    const h = container.clientHeight || window.innerHeight;

    // Scene
    const scene = new THREE.Scene();

    // Tiles are transformed into the same metre-based coordinates as the city.
    const camera = new THREE.PerspectiveCamera(60, w / h, 0.08, 20000);
    camera.position.set(6, 4, 9);

    // Renderer
    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        powerPreference: "high-performance",
        // Centimetre-separated roads must remain distinct kilometres away.
        // Use one depth convention in both built-in and custom shaders.
        logarithmicDepthBuffer: true,
      });
    } catch {
      // Initialization failure from an external rendering system must reach the UI.
      // eslint-disable-next-line react/set-state-in-effect
      setRenderError(
        "3D rendering could not start. Enable WebGL or hardware acceleration, then reload.",
      );
      activeRef.current = false;
      return;
    }
    renderer.setSize(w, h, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 0.95;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(renderer.domElement);
    let contextLost = false;
    const onContextLost = (event) => {
      event.preventDefault();
      contextLost = true;
      stopFlightAudio();
      useSimulatorStore.getState().setPaused(true);
      setRenderError(
        "The graphics connection was lost. Reload to restart the simulator. Try Low quality on this device.",
      );
    };
    renderer.domElement.addEventListener("webglcontextlost", onContextLost);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const studio = new RoomEnvironment();
    const reflection = pmrem.fromScene(studio, 0.04);
    scene.environment = reflection.texture;
    studio.dispose();
    pmrem.dispose();
    let composer, bloom, outputPass, currentQuality;
    let frames = 0,
      measuredAt = performance.now();
    function renderFrame() {
      sky.updatePrecipitation(elapsed, weather, currentQuality, camera);
      if (composer && currentQuality === "high") composer.render();
      else renderer.render(scene, camera);
      frames++;
      const now = performance.now();
      if (now - measuredAt >= 1000) {
        renderer.domElement.dataset.fps = (
          (frames * 1000) /
          (now - measuredAt)
        ).toFixed(1);
        renderer.domElement.dataset.drawCalls = String(
          renderer.info.render.calls,
        );
        measuredAt = now;
        frames = 0;
      }
    }
    function updateQuality(quality) {
      if (quality === currentQuality) return;
      currentQuality = quality;
      renderer.setPixelRatio(
        Math.min(
          window.devicePixelRatio,
          quality === "high" ? 2 : quality === "low" ? 1 : 1.5,
        ),
      );
      renderer.shadowMap.enabled = quality !== "low";
      if (quality === "high" && !composer) {
        composer = new EffectComposer(renderer);
        composer.addPass(new RenderPass(scene, camera));
        bloom = new UnrealBloomPass(
          new THREE.Vector2(container.clientWidth, container.clientHeight),
          0.22,
          0.45,
          1.1,
        );
        composer.addPass(bloom);
        outputPass = new OutputPass();
        composer.addPass(outputPass);
      }
      if (composer) {
        composer.setPixelRatio(renderer.getPixelRatio());
        composer.setSize(
          container.clientWidth || w,
          container.clientHeight || h,
        );
      }
    }

    // OrbitControls — only active in 'free' camera mode
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.target.set(0, 20, 0);
    controls.enabled = false;
    const cameraRig = createCameraRig(camera, controls);

    // ── Environment ────────────────────────────────────────────────────────
    const sky = buildSkyEnvironment(scene);
    const sampleWeather = createStormClock();
    const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    let weather;
    const city = buildProceduralWorld();
    const { group: cityGroup, dispose: disposeCity, buildingBoxes } = city;
    scene.add(cityGroup);
    const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
    cityGroup.traverse((object) => {
      for (const material of [object.material].flat().filter(Boolean)) {
        if (material.map) material.map.anisotropy = anisotropy;
      }
    });
    const explosions = createExplosionEffects(scene);
    let game,
      actors,
      gameRunId,
      lastAction = 0,
      lastRestart = useSimulatorStore.getState().restartSerial;
    let destroyed = false,
      renderYaw = 0;
    let lastDetonation = useSimulatorStore.getState().detonationSerial;
    useSimulatorStore.getState().setDestroyed(false);
    function crashDrone(
      position,
      reason = "A vehicle hit your drone. The aircraft broke apart.",
      completed = false,
    ) {
      if (destroyed) return;
      destroyed = true;
      useSimulatorStore.getState().setDestroyed(true, reason);
      if (useSimulatorStore.getState().isRecording)
        useSimulatorStore.getState().stopRecording();
      explosions.explode(
        { x: position.x, y: position.y + 0.6, z: position.z },
        0.65,
        true,
      );
      playFlightEffect("crash");
      if (!completed) {
        useChallengeStore
          .getState()
          .finishGame("failed", reason + " Retry the flight.");
        if (game) game = { ...game, status: "failed" };
      }
    }

    // ── Altitude indicator ────────────────────────────────────────────────
    const altInd = buildAltIndicator();
    scene.add(altInd.group);

    // ── Drone model management ─────────────────────────────────────────────
    let currentModelId = null;

    function loadDroneModel(modelId) {
      if (droneRef.current?.group) {
        scene.remove(droneRef.current.group);
        droneRef.current.dispose();
      }
      const modelDef = getModelById(modelId);
      const model = modelDef.build();
      scene.add(model.group);
      droneRef.current = { ...model, modelId };
      currentModelId = modelId;
    }

    const initialModelId =
      useSimulatorStore.getState().droneModelId ?? "compact-quad";
    loadDroneModel(initialModelId);

    // ── Tiles enable/disable ───────────────────────────────────────────────
    let currentTilesEnabled = false;

    function enableTiles() {
      if (tilesRef.current) return;
      const { setTilesStatus, setTilesAttribution } =
        useSimulatorStore.getState();
      const tw = buildTilesWorld(
        renderer,
        scene,
        (status) => {
          setTilesStatus(status);
          cityGroup.visible = status !== "ready";
          sky.ocean.visible = status !== "ready";
        },
        (text) => setTilesAttribution(text),
      );
      if (tw) {
        const lat = THREE.MathUtils.degToRad(COLOMBO_LAT);
        const lon = THREE.MathUtils.degToRad(COLOMBO_LON);
        const east = new THREE.Vector3(-Math.sin(lon), Math.cos(lon), 0);
        const up = new THREE.Vector3(
          Math.cos(lat) * Math.cos(lon),
          Math.cos(lat) * Math.sin(lon),
          Math.sin(lat),
        );
        const south = new THREE.Vector3(
          Math.sin(lat) * Math.cos(lon),
          Math.sin(lat) * Math.sin(lon),
          -Math.cos(lat),
        );
        const transform = new THREE.Matrix4().makeBasis(east, up, south);
        transform
          .setPosition(COLOMBO_ECEF.x, COLOMBO_ECEF.y, COLOMBO_ECEF.z)
          .invert();
        tw.group.matrixAutoUpdate = false;
        tw.group.matrix.copy(transform);
        scene.add(tw.group);
        cityGroup.visible = true;
      } else {
        cityGroup.visible = true;
      }
      tilesRef.current = tw;
      currentTilesEnabled = true;
    }

    function disableTiles() {
      if (tilesRef.current) {
        scene.remove(tilesRef.current.group);
        tilesRef.current.dispose();
        tilesRef.current = null;
      }
      cityGroup.visible = true;
      sky.ocean.visible = true;
      currentTilesEnabled = false;
      useSimulatorStore.getState().setTilesStatus("idle");
    }

    // ── Smooth position / attitude state ──────────────────────────────────
    const smoothPos = new THREE.Vector3(0, 0, 0);
    const targetPos = new THREE.Vector3(0, 25, 0);
    const targetQuat = new THREE.Quaternion();
    const euler = new THREE.Euler(0, 0, 0, "YXZ");

    // Demo flight state — driven by keyboard when no live telemetry
    const spawnFlight = () =>
      useChallengeStore.getState().active ||
      useSimulatorStore.getState().launchPoint !== "port-city"
        ? createFlight()
        : { ...PORT_SPAWN };
    let demo = spawnFlight();
    smoothPos.set(demo.x, demo.y, demo.z);
    let lastInstrumentTime = -Infinity;
    let lastPathSampleTime = -Infinity;
    let lastDistanceTime = -Infinity;
    let lastChallengeElapsed = 0;
    let challengeHasFlown = false;
    let lastAudioTime = -Infinity;
    const lastAudioPosition = new THREE.Vector3();
    const remoteAircraft = new Map();
    useSimulatorStore
      .getState()
      .setDemoData(flightInstruments(demo, demo, 0, demoInput));

    let elapsed = 0,
      clockAccumulator = 0;
    let lastFrameTime = performance.now();
    let lastRenderedCamera;
    let animId;

    // ── Animation loop ────────────────────────────────────────────────────
    const animate = () => {
      animId = requestAnimationFrame(animate);
      if (contextLost) return;

      const sim = useSimulatorStore.getState();
      const frameNow = performance.now();
      // Hidden scenes and paused tabs must not keep saturating the GPU while
      // the user navigates the GCS or opens another simulator tab.
      if (document.hidden) {
        lastFrameTime = frameNow;
        stopFlightAudio();
        return;
      }
      const renderInterval = sim.isPaused
        ? 100
        : useEnvironmentStore.getState().quality === "low"
          ? 1000 / 30
          : 0;
      if (
        sim.cameraMode === lastRenderedCamera &&
        frameNow - lastFrameTime < renderInterval
      )
        return;
      lastRenderedCamera = sim.cameraMode;
      const tel = useTelemetryStore.getState().data ?? {};

      const { isPaused, cameraMode, droneModelId, tilesEnabled } = sim;
      const activeChallenge = useChallengeStore.getState().active;
      if (sim.restartSerial !== lastRestart) {
        if (sim.isRecording) sim.stopRecording();
        demo = spawnFlight();
        smoothPos.set(demo.x, demo.y, demo.z);
        destroyed = false;
        renderYaw = 0;
        sim.setDestroyed(false);
        lastDetonation = sim.detonationSerial;
        explosions.clear();
        city.resetTraffic();
        Object.keys(demoInput).forEach((key) => {
          demoInput[key] = 0;
        });
        lastRestart = sim.restartSerial;
      }
      if (
        activeChallenge &&
        isArcadeChallenge(activeChallenge.id) &&
        activeChallenge.runId !== gameRunId
      ) {
        actors?.dispose();
        actors = createChallengeActors(scene, activeChallenge.id);
        game = createChallengeGame(activeChallenge.id);
        gameRunId = activeChallenge.runId;
        lastAction = useChallengeStore.getState().actionSerial;
        city.resetTraffic();
      }
      if (game?.status === "running" && activeChallenge?.runId !== gameRunId) {
        actors?.dispose();
        actors = null;
        game = null;
      }
      if (activeChallenge && tilesEnabled) sim.setTilesEnabled(false);

      // ── Tiles hot-swap ─────────────────────────────────────────────────
      if (tilesEnabled && !activeChallenge && !currentTilesEnabled)
        enableTiles();
      if ((!tilesEnabled || activeChallenge) && currentTilesEnabled)
        disableTiles();

      // ── Drone model hot-swap ───────────────────────────────────────────
      if (droneModelId && droneModelId !== currentModelId) {
        loadDroneModel(droneModelId);
      }

      // ── Environment tick ───────────────────────────────────────────────
      const now = performance.now();
      const frameDelta = Math.min((now - lastFrameTime) / 1000, 0.2);
      const dt = isPaused ? 0 : frameDelta;
      lastFrameTime = now;
      elapsed += dt;
      clockAccumulator += dt;
      if (clockAccumulator >= 0.2) {
        useEnvironmentStore.getState().advanceClock(clockAccumulator);
        clockAccumulator = 0;
      }
      const environment = useEnvironmentStore.getState();
      updateQuality(environment.quality);
      weather = sampleWeather(elapsed, sim.flightSource === "demo" ? environment.weatherMode : "clear", reducedMotion?.matches);
      const solar = sky.update(elapsed, environment, camera, smoothPos, weather);
      if (cityGroup.visible)
        city.update(
          elapsed,
          dt,
          solar,
          activeChallenge ? { ...environment, cityLife: true } : environment,
          camera,
        );
      explosions.update(dt);
      if (isPaused) {
        stopFlightAudio();
        lastAudioTime = -Infinity;
        if (droneRef.current)
          droneRef.current.group.visible = cameraMode !== "fpv" && !destroyed;
        altInd.group.visible = cameraMode !== "fpv" && !destroyed;
        cameraRig.update({
          mode: cameraMode,
          position: smoothPos,
          aircraft: droneRef.current?.group,
          yaw: renderYaw,
          grounded: sim.isGrounded,
          payload: usePayloadStore.getState(),
          delta: frameDelta,
        });
        tilesRef.current?.update(camera, renderer);
        renderFrame();
        return;
      }
      const activeBuildingBoxes = cityGroup.visible ? buildingBoxes : [];

      // ── Telemetry → position ───────────────────────────────────────────
      const {
        latitude: lat,
        longitude: lon,
        relativeAltitude: relAlt,
        roll,
        pitch,
        yaw,
      } = tel;

      const local = hasLivePosition(
        tel,
        useConnectionStore.getState().status === "connected",
        now,
        sim.flightSource,
      ) ? gpsToLocal(lat, lon, relAlt) : null;
      const isLive = local !== null;

      const previousDemo = demo;
      if (isLive && activeChallenge)
        useChallengeStore
          .getState()
          .finishGame(
            "failed",
            "Challenge ended because live telemetry connected.",
          );
      if (isLive) {
        targetPos.set(local.x, local.y, local.z);
        sim.setGrounded(relAlt <= 0.1);
      } else {
        const previous = demo;
        // Integrate short physics steps even when a low-end GPU misses frames.
        // One capped step per rendered frame made flight crawl on slow devices.
        let proposed = demo;
        if (!destroyed)
          for (let remaining = dt; remaining > 0.000001; remaining -= 0.05)
            proposed = stepFlight(
              proposed,
              demoInput,
              Math.min(0.05, remaining),
            );
        const position = moveAroundBuildings(
          demo,
          proposed,
          activeBuildingBoxes,
        );
        // Apply only the collision-corrected position, preserving the new heading.
        demo = {
          ...proposed,
          x: position.x,
          y: position.y,
          z: position.z,
          grounded: position.y === 0,
        };
        targetPos.set(demo.x, demo.y, demo.z);
        if (sim.isGrounded !== demo.grounded) sim.setGrounded(demo.grounded);
        if (now - lastInstrumentTime >= 100) {
          sim.setDemoData({
            ...flightInstruments(demo, previous, dt, demoInput),
            isArmed: !destroyed && !demo.grounded,
          });
          lastInstrumentTime = now;
        }
      }

      if (sim.detonationSerial !== lastDetonation) {
        lastDetonation = sim.detonationSerial;
        if (!isLive && !destroyed) {
          const center = { x: demo.x, y: demo.y + 0.6, z: demo.z },
            radius = 18;
          const caught =
            game?.id === "pursuit" &&
            game.status === "running" &&
            Math.hypot(
              game.target.x - center.x,
              1 - center.y,
              game.target.z - center.z,
            ) <= radius;
          if (caught) {
            game = {
              ...game,
              status: "complete",
              stage: 3,
              detonated: true,
              message: "Target stopped by the drone blast.",
            };
            useChallengeStore.getState().updateGame(game, gameRunId);
            explosions.explode({ ...game.target, y: 1 }, 1.1);
          }
          if (cityGroup.visible)
            city
              .blast(center, radius)
              .forEach((position) => explosions.explode(position, 0.7));
          actors?.blast?.(center, radius);
          crashDrone(
            demo,
            "Drone detonated after holding T for 0.5 seconds.",
            caught,
          );
          explosions.explode(center, 1.4, true);
          playFlightEffect(
            "explosion",
            camera.position.distanceTo(
              new THREE.Vector3(center.x, center.y, center.z),
            ),
          );
        }
      }
      if (!isLive && !destroyed && cityGroup.visible) {
        const traffic = [...city.traffic];
        if (game?.id === "pursuit" && game.status === "running")
          traffic.push({ ...game.target, active: true });
        if (
          traffic.some((car) =>
            hitsCar(
              previousDemo,
              demo,
              car,
              droneRef.current?.groundClearance || 0.5,
            ),
          )
        )
          crashDrone(demo);
      }
      if (
        !isLive &&
        !destroyed &&
        activeChallenge?.runId === gameRunId &&
        game?.status === "running"
      ) {
        const action = useChallengeStore.getState().actionSerial;
        game = stepChallengeGame(
          game,
          {
            ...demo,
            speed:
              dt > 0
                ? Math.hypot(demo.x - previousDemo.x, demo.z - previousDemo.z) /
                  dt
                : 0,
          },
          dt,
          action !== lastAction,
        );
        lastAction = action;
        for (const event of game.events) {
          if (event.type === "explosion") {
            explosions.explode(event.position, event.scale);
            city
              .blast(event.position, 13)
              .forEach((position) => explosions.explode(position, 0.65));
            playFlightEffect(
              "explosion",
              camera.position.distanceTo(
                new THREE.Vector3(
                  event.position.x,
                  event.position.y,
                  event.position.z,
                ),
              ),
            );
          } else playFlightEffect(event.type);
        }
        if (game.status !== "running" || now - lastDistanceTime >= 100)
          useChallengeStore.getState().updateGame(game, gameRunId);
      }
      const buildingDistance = nearestBuildingDistance(
        targetPos,
        activeBuildingBoxes,
      );
      if (now - lastDistanceTime >= 100) {
        sim.setBuildingDistance(buildingDistance);
        updateLocalFlight(
          isLive || destroyed
            ? null
            : {
                x: demo.x,
                y: demo.y,
                z: demo.z,
                yaw: demo.yaw,
                modelId: droneModelId,
              },
        );
        if (!isLive && !destroyed && useChallengeStore.getState().active) {
          if (demo.y > 0.1) challengeHasFlown = true;
          useChallengeStore
            .getState()
            .observe(
              {
                x: demo.x,
                y: demo.y,
                z: demo.z,
                speed: Math.hypot(demoInput.pitch, demoInput.roll) * 20,
                climb: demoInput.throttle * 8,
                clearance: buildingDistance,
              },
              elapsed - lastChallengeElapsed,
            );
        }
        lastChallengeElapsed = elapsed;
        let ground = 0;
        for (const box of activeBuildingBoxes) {
          if (
            targetPos.x >= box.min.x &&
            targetPos.x <= box.max.x &&
            targetPos.z >= box.min.z &&
            targetPos.z <= box.max.z &&
            box.max.y <= targetPos.y
          )
            ground = Math.max(ground, box.max.y);
        }
        sim.setRangefinderDistance(
          cityGroup.visible ? Math.max(0, targetPos.y - ground) : null,
        );
        lastDistanceTime = now;
      }

      smoothPos.lerp(targetPos, 1 - Math.exp(-dt * 8));
      if (now - lastPathSampleTime >= 100) {
        sim.recordPosition({
          x: targetPos.x,
          y: targetPos.y,
          z: targetPos.z,
          source: isLive ? "live" : "demo",
        });
        lastPathSampleTime = now;
      }

      if (droneRef.current) {
        droneRef.current.group.position.copy(smoothPos);
        droneRef.current.group.position.y += droneRef.current.groundClearance;
        droneRef.current.group.visible = cameraMode !== "fpv" && !destroyed;
        animateDroneRotors(
          droneRef.current.rotorMeshes,
          dt,
          !destroyed && (!sim.isGrounded || (isLive && tel.isArmed === true)),
        );
      }
      const peers = useAirspaceStore.getState().peers;
      for (const [id, aircraft] of remoteAircraft) {
        if (
          !peers[id]?.flight ||
          peers[id].flight.modelId !== aircraft.modelId
        ) {
          scene.remove(aircraft.group);
          aircraft.dispose();
          remoteAircraft.delete(id);
        }
      }
      for (const peer of Object.values(peers)) {
        if (!peer.flight) continue;
        let aircraft = remoteAircraft.get(peer.id);
        if (!aircraft) {
          aircraft = {
            ...getModelById(peer.flight.modelId).build(),
            modelId: peer.flight.modelId,
          };
          remoteAircraft.set(peer.id, aircraft);
          scene.add(aircraft.group);
        }
        aircraft.group.position.set(
          peer.flight.x,
          peer.flight.y + aircraft.groundClearance,
          peer.flight.z,
        );
        aircraft.group.rotation.y = peer.flight.yaw;
        animateDroneRotors(aircraft.rotorMeshes, dt, peer.flight.y > 0.1);
      }

      // Keep the city and H landing pad anchored at the world origin.
      // Moving them with the drone hides all horizontal travel from the camera.

      // Altitude drop-line
      altInd.group.position.copy(smoothPos);
      const linePts = altInd.lineGeo.attributes.position;
      linePts.setXYZ(1, 0, -smoothPos.y + 0.09, 0);
      linePts.needsUpdate = true;
      altInd.group.children[1].position.y = -smoothPos.y + 0.08;
      altInd.group.visible = cameraMode !== "fpv" && !destroyed;

      // ── Telemetry → attitude ───────────────────────────────────────────
      if (isLive) {
        euler.set(
          THREE.MathUtils.degToRad(pitch),
          THREE.MathUtils.degToRad(-yaw),
          THREE.MathUtils.degToRad(-roll),
          "YXZ",
        );
        targetQuat.setFromEuler(euler);
      } else {
        // Demo attitude: driven by keyboard input, smooth bank into turns
        const anyInput =
          demoInput.throttle ||
          demoInput.yaw ||
          demoInput.pitch ||
          demoInput.roll;
        if (demo.grounded) {
          // Flat on the ground — no attitude movement
          euler.set(0, demo.yaw, 0, "YXZ");
        } else {
          const demoYaw = demo.yaw;
          // Positive movement pitch flies forward and tilts the nose down.
          const demoPitch = anyInput ? -demoInput.pitch * 0.18 : 0;
          const demoRoll = anyInput
            ? -(demoInput.yaw * 0.3 + demoInput.roll * 0.22) // bank into yaw & roll
            : Math.sin(elapsed * 0.5) * 0.03;
          euler.set(demoPitch, demoYaw, demoRoll, "YXZ");
        }
        targetQuat.setFromEuler(euler);
      }

      if (droneRef.current) {
        droneRef.current.group.quaternion.slerp(
          targetQuat,
          1 - Math.exp(-dt * 10),
        );
      }

      // Camera transitions are independent of flight simulation and pause.
      renderYaw = isLive ? THREE.MathUtils.degToRad(-yaw) : demo.yaw;
      cameraRig.update({
        mode: cameraMode,
        position: smoothPos,
        aircraft: droneRef.current?.group,
        yaw: renderYaw,
        grounded: sim.isGrounded,
        payload: usePayloadStore.getState(),
        delta: frameDelta,
      });
      if (actors && game && droneRef.current)
        actors.update(game, droneRef.current.group, elapsed);
      tilesRef.current?.update(camera, renderer);

      if (now - lastAudioTime >= 50) {
        const seconds = (now - lastAudioTime) / 1000;
        const hasPrevious = Number.isFinite(lastAudioTime);
        const streetVisible = !isLive && cityGroup.visible && (environment.cityLife || !!activeChallenge);
        camera.updateMatrixWorld();
        updateFlightAudio({
          flying:
            !destroyed && (!sim.isGrounded || (isLive && tel.isArmed === true)),
          speed: hasPrevious
            ? Math.hypot(
                targetPos.x - lastAudioPosition.x,
                targetPos.z - lastAudioPosition.z,
              ) / seconds
            : 0,
          climb: hasPrevious
            ? (targetPos.y - lastAudioPosition.y) / seconds
            : 0,
          altitude: camera.position.y,
          x: camera.position.x,
          z: camera.position.z,
          coastDistance: Math.min(
            Math.abs(camera.position.x + 145),
            camera.position.z < -350 && camera.position.z > -950
              ? Math.abs(camera.position.x + 452)
              : Infinity,
          ),
          cameraDistance: camera.position.distanceTo(targetPos),
          distance: buildingDistance,
          daylight: solar.daylight,
          cityLife: streetVisible,
          street: streetVisible ? streetSources(camera, city.people, city.traffic) : null,
          weather,
          modelId: droneModelId,
          time: elapsed,
        });
        lastAudioPosition.copy(targetPos);
        lastAudioTime = now;
      }

      renderFrame();
    };

    animate();

    // ── Resize observer ────────────────────────────────────────────────────
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const { width: nw, height: nh } = e.contentRect;
        if (nw > 0 && nh > 0) {
          camera.aspect = nw / nh;
          camera.updateProjectionMatrix();
          renderer.setSize(nw, nh, false);
          composer?.setSize(nw, nh);
        }
      }
    });
    ro.observe(container);

    // ── Cleanup ─────────────────────────────────────────────────────────────
    return () => {
      activeRef.current = false; // allow re-mount (HMR / strict mode second pass)
      cancelAnimationFrame(animId);
      if (useSimulatorStore.getState().isRecording)
        useSimulatorStore.getState().stopRecording();
      updateLocalFlight(null);
      if (challengeHasFlown && useChallengeStore.getState().active)
        useChallengeStore.getState().abortChallenge();
      remoteAircraft.forEach((aircraft) => {
        scene.remove(aircraft.group);
        aircraft.dispose();
      });
      actors?.dispose();
      explosions.dispose();
      disposeFlightAudio();
      ro.disconnect();
      controls.dispose();
      sky.dispose();
      disposeCity();
      if (tilesRef.current) {
        tilesRef.current.dispose();
        tilesRef.current = null;
      }
      if (droneRef.current?.group) {
        scene.remove(droneRef.current.group);
        droneRef.current.dispose();
        droneRef.current = null;
      }
      altInd.lineGeo.dispose();
      altInd.lineMat.dispose();
      altInd.discGeo.dispose();
      altInd.discMat.dispose();
      bloom?.dispose();
      outputPass?.dispose();
      composer?.dispose();
      reflection.dispose();
      renderer.domElement.removeEventListener(
        "webglcontextlost",
        onContextLost,
      );
      renderer.dispose();
      renderer.forceContextLoss();
      if (renderer.domElement.parentNode === container) {
        container.removeChild(renderer.domElement);
      }
    };
  }, []); // run once — all live state read via getState() inside the loop

  return (
    <>
      <div
        ref={mountRef}
        className="sim-world-canvas"
        aria-label="3D coastal flight environment"
      />
      {renderError && (
        <div className="sim-render-error" role="alert">
          <strong>Graphics unavailable</strong>
          <p>{renderError}</p>
          <button onClick={() => window.location.reload()}>
            Reload simulator
          </button>
        </div>
      )}
    </>
  );
}
