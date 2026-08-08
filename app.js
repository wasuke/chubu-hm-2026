import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as GaussianSplats3D from 'https://cdn.jsdelivr.net/npm/@mkkellogg/gaussian-splats-3d@0.4.7/build/gaussian-splats-3d.module.js';

const stage = document.getElementById('stage');
const loading = document.getElementById('loading');
const vrButton = document.getElementById('vrButton');
const vrExit = document.getElementById('vrExit');
const resetButton = document.getElementById('resetButton');

const renderer = new THREE.WebGLRenderer({ antialias: false, alpha: false, powerPreference: 'high-performance' });
renderer.setClearColor(0x000000, 1);
renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.autoClear = true;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);

// SuperSplatプロジェクト内のカメラ位置を基準にした初期値
const INITIAL_POSITION = new THREE.Vector3(0.0003349349, 0.0333998743, -0.3395622240);
const INITIAL_TARGET = new THREE.Vector3(0.0279062327, 0.0489739840, -0.2658977580);

const camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.001, 50);
camera.position.copy(INITIAL_POSITION);
camera.up.set(0, 1, 0);
camera.lookAt(INITIAL_TARGET);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.copy(INITIAL_TARGET);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.enablePan = true;
controls.screenSpacePanning = true;
controls.minDistance = 0.012;
controls.maxDistance = 1.2;
controls.rotateSpeed = 0.65;
controls.zoomSpeed = 0.8;
controls.panSpeed = 0.65;
controls.touches.ONE = THREE.TOUCH.ROTATE;
controls.touches.TWO = THREE.TOUCH.DOLLY_PAN;
controls.update();

const splat = new GaussianSplats3D.DropInViewer({
  sharedMemoryForWorkers: false,
  gpuAcceleratedSort: false,
  sphericalHarmonicsDegree: 0,
  dynamicScene: false,
  ignoreDevicePixelRatio: true
});
scene.add(splat);

await splat.addSplatScene('./assets/scene.ply', {
  splatAlphaRemovalThreshold: 5,
  showLoadingUI: false,
  progressiveLoad: true,
  position: [0, 0.2301623970, 0],
  rotation: [4.3297804701e-17, 0.7071067812, 0.7071067812, 4.3297804701e-17],
  scale: [1, 1, 1]
});
loading.style.display = 'none';

let vrMode = false;
let orientationListening = false;
let sensorQuaternion = new THREE.Quaternion();
let sensorAvailable = false;
let baseSensorQuaternion = null;
let baseViewQuaternion = new THREE.Quaternion();
let vrCenter = new THREE.Vector3();

// 紙製VR向け。モデルが正規化されているため、実寸IPDではなくシーン尺度に合わせた値。
const stereo = new THREE.StereoCamera();
stereo.eyeSep = 0.0055;

const zee = new THREE.Vector3(0, 0, 1);
const euler = new THREE.Euler();
const q1 = new THREE.Quaternion(-Math.sqrt(0.5), 0, 0, Math.sqrt(0.5));
const q0 = new THREE.Quaternion();

function screenOrientationRadians() {
  const angle = screen.orientation?.angle ?? window.orientation ?? 0;
  return THREE.MathUtils.degToRad(angle);
}

function onDeviceOrientation(event) {
  if (event.alpha == null || event.beta == null || event.gamma == null) return;
  sensorAvailable = true;
  const alpha = THREE.MathUtils.degToRad(event.alpha);
  const beta  = THREE.MathUtils.degToRad(event.beta);
  const gamma = THREE.MathUtils.degToRad(event.gamma);
  const orient = screenOrientationRadians();
  euler.set(beta, alpha, -gamma, 'YXZ');
  sensorQuaternion.setFromEuler(euler);
  sensorQuaternion.multiply(q1);
  sensorQuaternion.multiply(q0.setFromAxisAngle(zee, -orient));
}

async function enableOrientation() {
  if (orientationListening) return true;
  try {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
      const result = await DeviceOrientationEvent.requestPermission();
      if (result !== 'granted') return false;
    }
    window.addEventListener('deviceorientation', onDeviceOrientation, true);
    orientationListening = true;
    return true;
  } catch (e) {
    console.warn('Device orientation permission failed:', e);
    return false;
  }
}

async function enterVR() {
  const ok = await enableOrientation();
  if (!ok) {
    alert('端末の「動作と方向」へのアクセスを許可してください。');
    return;
  }

  // ユーザーが指で決めた現在位置を、そのままVRの立ち位置にする。
  vrCenter.copy(camera.position);
  baseViewQuaternion.copy(camera.quaternion);
  baseSensorQuaternion = sensorAvailable ? sensorQuaternion.clone() : null;

  vrMode = true;
  controls.enabled = false;
  document.body.classList.add('vr');

  try {
    if (document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen();
  } catch (_) {}

  if (screen.orientation?.lock) {
    try { await screen.orientation.lock('landscape'); } catch (_) {}
  }
}

function exitVR() {
  vrMode = false;
  controls.enabled = true;
  document.body.classList.remove('vr');
  if (document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
}

function resetView() {
  camera.position.copy(INITIAL_POSITION);
  camera.quaternion.identity();
  camera.lookAt(INITIAL_TARGET);
  controls.target.copy(INITIAL_TARGET);
  controls.update();
}

vrButton.addEventListener('click', enterVR);
vrExit.addEventListener('click', exitVR);
resetButton.addEventListener('click', resetView);

document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && vrMode) exitVR();
});

function applyHeadRotation() {
  camera.position.copy(vrCenter);
  if (sensorAvailable) {
    if (!baseSensorQuaternion) baseSensorQuaternion = sensorQuaternion.clone();
    const delta = baseSensorQuaternion.clone().invert().multiply(sensorQuaternion);
    camera.quaternion.copy(baseViewQuaternion).multiply(delta);
  } else {
    camera.quaternion.copy(baseViewQuaternion);
  }
  camera.updateMatrixWorld(true);
}

function renderNormal() {
  controls.update();
  renderer.setScissorTest(false);
  renderer.setViewport(0, 0, renderer.domElement.width, renderer.domElement.height);
  renderer.render(scene, camera);
}

function renderStereo() {
  applyHeadRotation();

  const w = renderer.domElement.width;
  const h = renderer.domElement.height;
  const half = Math.floor(w / 2);

  // 片眼ごとの画角を横長画面に合わせる
  camera.aspect = half / h;
  camera.updateProjectionMatrix();
  stereo.update(camera);

  renderer.setScissorTest(true);
  renderer.setScissor(0, 0, half, h);
  renderer.setViewport(0, 0, half, h);
  renderer.render(scene, stereo.cameraL);

  renderer.setScissor(half, 0, w - half, h);
  renderer.setViewport(half, 0, w - half, h);
  renderer.render(scene, stereo.cameraR);
  renderer.setScissorTest(false);
}

function animate() {
  requestAnimationFrame(animate);
  if (vrMode) renderStereo();
  else renderNormal();
}
animate();

function resize() {
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setSize(innerWidth, innerHeight, false);
  if (!vrMode) {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
  }
}
window.addEventListener('resize', resize);
window.addEventListener('orientationchange', () => setTimeout(resize, 250));
