/**
 * simulator/world/TilesWorld.js
 *
 * Manages the Google Photorealistic 3D Tiles integration using
 * the `3d-tiles-renderer` library (NASA-JPL, MIT licence).
 *
 * Responsibilities:
 *  - Creates TilesRenderer targeting Google's tile endpoint
 *  - Registers GoogleCloudAuthPlugin with the API key from env
 *  - Exposes tiles.group for insertion into the Three.js scene
 *  - Extracts and returns attribution text for mandatory display
 *  - Reports loading status: 'no-key' | 'loading' | 'ready' | 'error'
 *  - Provides update(camera) and dispose() for the animation loop
 *
 * Usage:
 *   const tilesWorld = buildTilesWorld(renderer, scene, onStatusChange, onAttributionChange);
 *   scene.add(tilesWorld.group);
 *   // in animate(): tilesWorld.update(camera);
 *   // on unmount: tilesWorld.dispose();
 *
 * Attribution requirement:
 *   Per Google Maps Platform Terms of Service, the attribution text
 *   returned by the tiles renderer MUST be displayed on screen whenever
 *   tiles are visible. This module extracts that text; rendering it is
 *   the caller's responsibility (see GameHUD.jsx / SimulatorWorld.jsx).
 *
 * Key configuration:
 *   Set VITE_GOOGLE_MAPS_API_KEY in client/.env.local
 *   (never commit the real value — use .env.example as template)
 */

import { TilesRenderer }         from '3d-tiles-renderer';
import { GoogleCloudAuthPlugin } from '3d-tiles-renderer/plugins';

const GOOGLE_TILESET_URL = 'https://tile.googleapis.com/v1/3dtiles/root.json';

/**
 * Build and return a tiles world controller.
 *
 * @param {THREE.WebGLRenderer} renderer
 * @param {THREE.Scene}         scene       — tiles group will NOT be auto-added; caller does scene.add(group)
 * @param {Function}            onStatus    — (status: string) => void
 * @param {Function}            onAttrib    — (text: string) => void
 * @returns {{ group: THREE.Group, update: (camera) => void, dispose: () => void } | null}
 *   Returns null if no API key is configured.
 */
export function buildTilesWorld(renderer, scene, onStatus, onAttrib) {
  const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;

  if (!apiKey) {
    console.warn(
      '[TilesWorld] VITE_GOOGLE_MAPS_API_KEY is not set.\n' +
      'Add it to client/.env.local to enable Google Photorealistic 3D Tiles.\n' +
      'Falling back to procedural world.'
    );
    onStatus('no-key');
    return null;
  }

  let tiles;
  try {
    tiles = new TilesRenderer(GOOGLE_TILESET_URL);
  } catch (err) {
    console.error('[TilesWorld] Failed to create TilesRenderer:', err);
    onStatus('error');
    return null;
  }

  // ── Google Cloud auth plugin ────────────────────────────────────────────────
  tiles.registerPlugin(new GoogleCloudAuthPlugin({ apiToken: apiKey }));

  // ── Loading & error callbacks ───────────────────────────────────────────────
  onStatus('loading');

  tiles.addEventListener('load-tile-set', () => {
    onStatus('ready');
    extractAttribution(tiles, onAttrib);
  });

  tiles.addEventListener('tile-load-error', (e) => {
    console.error('[TilesWorld] Tile load error:', e);
    // Don't change status to 'error' for individual tile failures —
    // that's normal for out-of-view or low-priority tiles.
  });

  tiles.addEventListener('load-error', (e) => {
    console.error('[TilesWorld] Root tileset load error:', e);
    onStatus('error');
  });

  // ── Renderer references ─────────────────────────────────────────────────────
  // The tiles renderer needs to know about our WebGLRenderer for resolution hints.

  // ── Return controller ───────────────────────────────────────────────────────
  return {
    /** THREE.Group — add to scene, position is managed by the tiles renderer (ECEF) */
    group: tiles.group,

    /**
     * Call once per animation frame.
     * @param {THREE.Camera} camera
     * @param {THREE.WebGLRenderer} renderer
     */
    update(camera, webglRenderer) {
      tiles.setCamera(camera);
      if (webglRenderer) {
        tiles.setResolutionFromRenderer(camera, webglRenderer);
      }
      tiles.update();

      // Re-extract attribution periodically (tiles may load new providers)
      extractAttribution(tiles, onAttrib);
    },

    dispose() {
      tiles.dispose();
    },
  };
}

// ── Attribution extraction ────────────────────────────────────────────────────

let _lastAttrText = '';

function extractAttribution(tiles, onAttrib) {
  // The tiles renderer accumulates attributions from loaded tile sets.
  // We try to extract them from the `getAttributions` method if available,
  // or fall back to the standard Google Maps attribution string.
  let text = '';

  try {
    if (typeof tiles.getAttributions === 'function') {
      const attrs = tiles.getAttributions();
      if (attrs && attrs.length > 0) {
        text = attrs.map((a) => a.value ?? a).join(' | ');
      }
    }
  } catch {
    // getAttributions may not be available in all versions
  }

  // Always include the required Google Maps attribution
  if (!text || !text.includes('Google')) {
    text = text ? `${text} | © Google` : '© Google';
  }

  if (text !== _lastAttrText) {
    _lastAttrText = text;
    onAttrib(text);
  }
}
