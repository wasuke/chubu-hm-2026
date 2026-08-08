import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import * as GaussianSplats3D from 'https://cdn.jsdelivr.net/npm/@mkkellogg/gaussian-splats-3d@0.4.7/build/gaussian-splats-3d.module.js';

const stage=document.getElementById('stage');
const loading=document.getElementById('loading');
const vrButton=document.getElementById('vrButton');
const vrExit=document.getElementById('vrExit');
const resetButton=document.getElementById('resetButton');
const reloadButton=document.getElementById('reloadButton');

const renderer=new THREE.WebGLRenderer({antialias:false,alpha:false,powerPreference:'high-performance'});
renderer.setClearColor(0x000000,1);
renderer.autoClear=true;
stage.appendChild(renderer.domElement);
renderer.domElement.style.width='100%';
renderer.domElement.style.height='100%';

const scene=new THREE.Scene();
scene.background=new THREE.Color(0x000000);

const INITIAL_POSITION=new THREE.Vector3(0.0003349349,0.0333998743,-0.3395622240);
const INITIAL_TARGET=new THREE.Vector3(0.0279062327,0.0489739840,-0.2658977580);

const camera=new THREE.PerspectiveCamera(75,1,0.001,50);
camera.position.copy(INITIAL_POSITION);
camera.up.set(0,1,0);
camera.lookAt(INITIAL_TARGET);

const controls=new OrbitControls(camera,renderer.domElement);
controls.target.copy(INITIAL_TARGET);
controls.enableDamping=true;
controls.dampingFactor=0.08;
controls.enablePan=true;
controls.screenSpacePanning=true;
controls.minDistance=0.012;
controls.maxDistance=1.2;
controls.rotateSpeed=0.65;
controls.zoomSpeed=0.8;
controls.panSpeed=0.65;
controls.touches.ONE=THREE.TOUCH.ROTATE;
controls.touches.TWO=THREE.TOUCH.DOLLY_PAN;
controls.update();

const splat=new GaussianSplats3D.DropInViewer({sharedMemoryForWorkers:false,gpuAcceleratedSort:false,sphericalHarmonicsDegree:0,dynamicScene:false,ignoreDevicePixelRatio:true});
scene.add(splat);

await splat.addSplatScene('./assets/scene.ply',{
  splatAlphaRemovalThreshold:5,
  showLoadingUI:false,
  progressiveLoad:true,
  position:[0,0.2301623970,0],
  rotation:[4.3297804701e-17,0.7071067812,0.7071067812,4.3297804701e-17],
  scale:[1,1,1]
});
loading.style.display='none';

let vrMode=false;
let orientationListening=false;
let sensorAvailable=false;
const sensorQuaternion=new THREE.Quaternion();
let baseSensorQuaternion=null;
const baseViewQuaternion=new THREE.Quaternion();
const vrCenter=new THREE.Vector3();

const stereo=new THREE.StereoCamera();
stereo.eyeSep=0.0055;
stereo.aspect=1;

const zee=new THREE.Vector3(0,0,1);
const orientationEuler=new THREE.Euler();
const deviceCorrection=new THREE.Quaternion(-Math.sqrt(0.5),0,0,Math.sqrt(0.5));
const screenCorrection=new THREE.Quaternion();

function getScreenAngle(){
  return THREE.MathUtils.degToRad(screen.orientation?.angle ?? window.orientation ?? 0);
}

function onDeviceOrientation(event){
  if(event.alpha==null||event.beta==null||event.gamma==null)return;
  sensorAvailable=true;
  const alpha=THREE.MathUtils.degToRad(event.alpha);
  const beta=THREE.MathUtils.degToRad(event.beta);
  const gamma=THREE.MathUtils.degToRad(event.gamma);
  const orient=getScreenAngle();
  orientationEuler.set(beta,alpha,-gamma,'YXZ');
  sensorQuaternion.setFromEuler(orientationEuler);
  sensorQuaternion.multiply(deviceCorrection);
  screenCorrection.setFromAxisAngle(zee,-orient);
  sensorQuaternion.multiply(screenCorrection);
}

async function enableOrientation(){
  if(orientationListening)return true;
  try{
    if(typeof DeviceOrientationEvent!=='undefined'&&typeof DeviceOrientationEvent.requestPermission==='function'){
      const result=await DeviceOrientationEvent.requestPermission();
      if(result!=='granted')return false;
    }
    window.addEventListener('deviceorientation',onDeviceOrientation,true);
    orientationListening=true;
    return true;
  }catch(e){
    console.warn(e);
    return false;
  }
}

function getDisplaySize(){
  const r=stage.getBoundingClientRect();
  return {width:Math.max(1,Math.round(r.width)),height:Math.max(1,Math.round(r.height))};
}

function resizeRenderer(){
  const {width,height}=getDisplaySize();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
  renderer.setSize(width,height,false);
  renderer.domElement.style.width='100%';
  renderer.domElement.style.height='100%';
  if(!vrMode){
    camera.aspect=width/height;
    camera.updateProjectionMatrix();
  }
}

async function enterVR(){
  const ok=await enableOrientation();
  if(!ok){alert('端末の「動作と方向」へのアクセスを許可してください。');return;}
  vrCenter.copy(camera.position);
  baseViewQuaternion.copy(camera.quaternion);
  baseSensorQuaternion=sensorAvailable?sensorQuaternion.clone():null;
  vrMode=true;
  controls.enabled=false;
  document.body.classList.add('vr');
  try{if(document.documentElement.requestFullscreen)await document.documentElement.requestFullscreen();}catch(e){}
  try{if(screen.orientation?.lock)await screen.orientation.lock('landscape');}catch(e){}
  scheduleResize();
}

function exitVR(){
  vrMode=false;
  controls.enabled=true;
  document.body.classList.remove('vr');
  controls.target.copy(camera.position).add(new THREE.Vector3(0,0,-0.1).applyQuaternion(camera.quaternion));
  controls.update();
  if(document.fullscreenElement&&document.exitFullscreen)document.exitFullscreen().catch(()=>{});
  scheduleResize();
}

function resetView(){
  camera.position.copy(INITIAL_POSITION);
  controls.target.copy(INITIAL_TARGET);
  camera.up.set(0,1,0);
  camera.lookAt(INITIAL_TARGET);
  controls.update();
}

const inverseBaseSensor=new THREE.Quaternion();
const sensorDelta=new THREE.Quaternion();

function applyHeadRotation(){
  camera.position.copy(vrCenter);
  if(!sensorAvailable){
    camera.quaternion.copy(baseViewQuaternion);
    camera.updateMatrixWorld(true);
    return;
  }
  if(!baseSensorQuaternion)baseSensorQuaternion=sensorQuaternion.clone();
  inverseBaseSensor.copy(baseSensorQuaternion).invert();
  sensorDelta.copy(sensorQuaternion).multiply(inverseBaseSensor);
  camera.quaternion.copy(sensorDelta).multiply(baseViewQuaternion);
  camera.updateMatrixWorld(true);
}

function renderNormal(){
  controls.update();
  const {width,height}=getDisplaySize();
  if(Math.abs(camera.aspect-width/height)>0.001){
    camera.aspect=width/height;
    camera.updateProjectionMatrix();
  }
  renderer.setScissorTest(false);
  renderer.setViewport(0,0,width,height);
  renderer.render(scene,camera);
}

function renderStereo(){
  applyHeadRotation();
  const {width,height}=getDisplaySize();

  // 12%黒帯:
  // 0-12% 黒 / 12-50% 左眼 / 50-88% 右眼 / 88-100% 黒
  const leftStart=Math.round(width*0.12);
  const center=Math.round(width*0.50);
  const rightEnd=Math.round(width*0.88);

  const leftWidth=Math.max(1,center-leftStart);
  const rightWidth=Math.max(1,rightEnd-center);

  camera.aspect=leftWidth/height;
  camera.updateProjectionMatrix();
  stereo.update(camera);

  // 全画面を黒で消去してから中央寄りの領域だけ描画
  renderer.setScissorTest(false);
  renderer.setViewport(0,0,width,height);
  renderer.setClearColor(0x000000,1);
  renderer.clear(true,true,true);

  renderer.setScissorTest(true);

  renderer.setViewport(leftStart,0,leftWidth,height);
  renderer.setScissor(leftStart,0,leftWidth,height);
  renderer.render(scene,stereo.cameraL);

  renderer.setViewport(center,0,rightWidth,height);
  renderer.setScissor(center,0,rightWidth,height);
  renderer.render(scene,stereo.cameraR);

  renderer.setScissorTest(false);
}

function animate(){
  requestAnimationFrame(animate);
  if(vrMode)renderStereo();
  else renderNormal();
}
animate();

function scheduleResize(){
  resizeRenderer();
  setTimeout(resizeRenderer,50);
  setTimeout(resizeRenderer,150);
  setTimeout(resizeRenderer,350);
  setTimeout(resizeRenderer,700);
  setTimeout(resizeRenderer,1200);
}

window.addEventListener('resize',scheduleResize);
window.addEventListener('orientationchange',scheduleResize);
if(window.visualViewport)window.visualViewport.addEventListener('resize',scheduleResize);
scheduleResize();

vrButton.addEventListener('click',enterVR);
vrExit.addEventListener('click',exitVR);
resetButton.addEventListener('click',resetView);
reloadButton.addEventListener('click',()=>window.location.reload());

document.addEventListener('fullscreenchange',()=>{
  if(!document.fullscreenElement&&vrMode)scheduleResize();
});
