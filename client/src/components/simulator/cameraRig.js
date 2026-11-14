import * as THREE from 'three';

/** One camera controller, including mode transitions while flight is paused. */
export function createCameraRig(camera, controls) {
  let previousMode;
  const destination = new THREE.Vector3(), look = new THREE.Vector3();
  const offset = new THREE.Vector3(), rotation = new THREE.Quaternion();
  const tilt = new THREE.Quaternion(), axis = new THREE.Vector3(1, 0, 0);
  controls.minDistance = 2; controls.maxDistance = 3000;
  controls.maxPolarAngle = Math.PI * 0.49;
  return {
    update({ mode, position, aircraft, yaw = 0, grounded, payload, delta = 1 / 60 }) {
      const changed = previousMode !== mode;
      const blend = changed ? 1 : 1 - Math.exp(-Math.min(delta, 0.1) * 7);
      camera.up.set(0, mode === 'top' ? 0 : 1, mode === 'top' ? -1 : 0);
      const fov = mode === 'fpv' ? payload.fov : 60;
      if (camera.fov !== fov) { camera.fov = fov; camera.updateProjectionMatrix(); }
      look.copy(aircraft?.position || position);
      controls.enabled = mode === 'free';
      if (mode === 'free') {
        if (changed) {
          camera.position.copy(position).add(offset.set(18, 12, 18));
          controls.target.copy(look);
          camera.lookAt(look);
        }
        // Free orbit remains user controlled; do not drag its target every frame.
        controls.update();
      } else if (mode === 'fpv' && aircraft) {
        offset.set(0, 0.15, -0.55).applyQuaternion(aircraft.quaternion);
        camera.position.copy(aircraft.position).add(offset);
        camera.position.y = Math.max(0.18, camera.position.y);
        tilt.setFromAxisAngle(axis, THREE.MathUtils.degToRad(-payload.tilt));
        rotation.copy(aircraft.quaternion).multiply(tilt);
        // Aircraft attitude is already smoothed. A second interpolation caused
        // the onboard camera to lag or look backwards during mode changes.
        camera.quaternion.copy(rotation);
      } else {
        if (mode === 'top') destination.copy(position).add(offset.set(0, 90, 0.001));
        else if (mode === 'side') destination.copy(position).add(offset.set(25, 8, 0));
        else destination.copy(position).add(offset.set(Math.sin(yaw) * (grounded ? 7 : 15), grounded ? 2.6 : 6, Math.cos(yaw) * (grounded ? 7 : 15)));
        camera.position.lerp(destination, blend);
        camera.lookAt(look);
      }
      camera.updateMatrixWorld();
      previousMode = mode;
    },
  };
}
