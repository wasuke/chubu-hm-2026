import * as THREE from 'three';

import {
  OrbitControls
} from 'three/addons/controls/OrbitControls.js';

import * as GaussianSplats3D
  from 'https://cdn.jsdelivr.net/npm/@mkkellogg/gaussian-splats-3d@0.4.7/build/gaussian-splats-3d.module.js';


/* =========================================================
   DOM
========================================================= */

const stage =
  document.getElementById('stage');

const loading =
  document.getElementById('loading');

const vrButton =
  document.getElementById('vrButton');

const vrExit =
  document.getElementById('vrExit');

const resetButton =
  document.getElementById('resetButton');

const reloadButton =
  document.getElementById('reloadButton');


/* =========================================================
   Renderer
========================================================= */

const renderer =
  new THREE.WebGLRenderer({

    antialias: false,

    alpha: false,

    powerPreference:
      'high-performance'

  });

renderer.setClearColor(
  0x000000,
  1
);

renderer.autoClear = true;

stage.appendChild(
  renderer.domElement
);


/*
  重要：

  setSize(..., true) を使うと
  canvas.style.width / height に

  「起動した瞬間の画面サイズ」

  がpixel単位で書き込まれる。

  iPhoneをあとから横向きにすると、
  この値が残ることがVR分割ズレの原因になる。

  したがって、

  ・内部WebGLサイズだけ変更
  ・CSS表示サイズは常時100%

  とする。
*/

renderer.domElement.style.width =
  '100%';

renderer.domElement.style.height =
  '100%';


/* =========================================================
   Scene
========================================================= */

const scene =
  new THREE.Scene();

scene.background =
  new THREE.Color(
    0x000000
  );


/* =========================================================
   初期カメラ
========================================================= */

const INITIAL_POSITION =
  new THREE.Vector3(

    0.0003349349,
    0.0333998743,
    -0.3395622240

  );

const INITIAL_TARGET =
  new THREE.Vector3(

    0.0279062327,
    0.0489739840,
    -0.2658977580

  );


const camera =
  new THREE.PerspectiveCamera(

    75,
    1,
    0.001,
    50

  );

camera.position.copy(
  INITIAL_POSITION
);

camera.up.set(
  0,
  1,
  0
);

camera.lookAt(
  INITIAL_TARGET
);


/* =========================================================
   OrbitControls
========================================================= */

const controls =
  new OrbitControls(

    camera,
    renderer.domElement

  );

controls.target.copy(
  INITIAL_TARGET
);

controls.enableDamping =
  true;

controls.dampingFactor =
  0.08;

controls.enablePan =
  true;

controls.screenSpacePanning =
  true;

controls.minDistance =
  0.012;

controls.maxDistance =
  1.2;

controls.rotateSpeed =
  0.65;

controls.zoomSpeed =
  0.8;

controls.panSpeed =
  0.65;

controls.touches.ONE =
  THREE.TOUCH.ROTATE;

controls.touches.TWO =
  THREE.TOUCH.DOLLY_PAN;

controls.update();


/* =========================================================
   Gaussian Splatting
========================================================= */

const splat =
  new GaussianSplats3D.DropInViewer({

    sharedMemoryForWorkers:
      false,

    gpuAcceleratedSort:
      false,

    sphericalHarmonicsDegree:
      0,

    dynamicScene:
      false,

    ignoreDevicePixelRatio:
      true

  });

scene.add(
  splat
);


await splat.addSplatScene(

  './assets/scene.ply',

  {

    splatAlphaRemovalThreshold:
      5,

    showLoadingUI:
      false,

    progressiveLoad:
      true,

    position: [

      0,
      0.2301623970,
      0

    ],

    rotation: [

      4.3297804701e-17,
      0.7071067812,
      0.7071067812,
      4.3297804701e-17

    ],

    scale: [
      1,
      1,
      1
    ]

  }

);


loading.style.display =
  'none';


/* =========================================================
   VR状態
========================================================= */

let vrMode =
  false;

let orientationListening =
  false;

let sensorAvailable =
  false;


/*
  現在のスマホ姿勢
*/

const sensorQuaternion =
  new THREE.Quaternion();


/*
  VR開始時のスマホ姿勢
*/

let baseSensorQuaternion =
  null;


/*
  指操作で決めた向き
*/

const baseViewQuaternion =
  new THREE.Quaternion();


/*
  VRで立つ位置
*/

const vrCenter =
  new THREE.Vector3();


/* =========================================================
   Stereo Camera
========================================================= */

const stereo =
  new THREE.StereoCamera();


/*
  GSモデルが実寸尺度ではないため
  実際の64mmではなくシーン尺度に合わせる。

  強すぎる場合：
  0.003

  標準：
  0.0055

  強くしたい場合：
  0.007
*/

stereo.eyeSep =
  0.0055;

stereo.aspect =
  1;


/* =========================================================
   DeviceOrientation
========================================================= */

const zee =
  new THREE.Vector3(
    0,
    0,
    1
  );


const orientationEuler =
  new THREE.Euler();


/*
  スマホの座標系から
  Three.jsカメラ座標へ変換
*/

const deviceCorrection =
  new THREE.Quaternion(

    -Math.sqrt(0.5),

    0,

    0,

    Math.sqrt(0.5)

  );


const screenCorrection =
  new THREE.Quaternion();


function getScreenAngle() {

  const angle =
    screen.orientation?.angle ??
    window.orientation ??
    0;

  return THREE.MathUtils.degToRad(
    angle
  );

}


function onDeviceOrientation(
  event
) {

  if (
    event.alpha == null ||
    event.beta == null ||
    event.gamma == null
  ) {

    return;

  }


  sensorAvailable =
    true;


  const alpha =
    THREE.MathUtils.degToRad(
      event.alpha
    );

  const beta =
    THREE.MathUtils.degToRad(
      event.beta
    );

  const gamma =
    THREE.MathUtils.degToRad(
      event.gamma
    );


  const orient =
    getScreenAngle();


  orientationEuler.set(

    beta,
    alpha,
    -gamma,

    'YXZ'

  );


  sensorQuaternion
    .setFromEuler(
      orientationEuler
    );


  sensorQuaternion.multiply(
    deviceCorrection
  );


  screenCorrection
    .setFromAxisAngle(

      zee,
      -orient

    );


  sensorQuaternion.multiply(
    screenCorrection
  );

}


/* =========================================================
   センサー利用許可
========================================================= */

async function enableOrientation() {

  if (
    orientationListening
  ) {

    return true;

  }


  try {

    if (

      typeof DeviceOrientationEvent
        !== 'undefined'

      &&

      typeof DeviceOrientationEvent
        .requestPermission
        === 'function'

    ) {

      const result =
        await DeviceOrientationEvent
          .requestPermission();


      if (
        result !== 'granted'
      ) {

        return false;

      }

    }


    window.addEventListener(

      'deviceorientation',

      onDeviceOrientation,

      true

    );


    orientationListening =
      true;


    return true;

  }
  catch (
    error
  ) {

    console.warn(
      'DeviceOrientation permission failed:',
      error
    );

    return false;

  }

}


/* =========================================================
   Viewport取得
========================================================= */

function getDisplaySize() {

  /*
    window.innerWidthではなく
    stage実寸を基準にする。

    iOS Safariでは、
    orientationchange直後のinnerWidthが
    一時的に古い値になる場合がある。
  */

  const rect =
    stage.getBoundingClientRect();


  const width =
    Math.max(

      1,

      Math.round(
        rect.width
      )

    );


  const height =
    Math.max(

      1,

      Math.round(
        rect.height
      )

    );


  return {
    width,
    height
  };

}


/* =========================================================
   Renderer Resize
========================================================= */

function resizeRenderer() {

  const {
    width,
    height
  } =
    getDisplaySize();


  const pixelRatio =
    Math.min(

      window.devicePixelRatio || 1,

      1.5

    );


  renderer.setPixelRatio(
    pixelRatio
  );


  /*
    falseが重要。

    canvasのCSSサイズは変更せず、
    drawing bufferだけ変更する。
  */

  renderer.setSize(

    width,
    height,

    false

  );


  /*
    Safari対策。

    Three.jsが以前設定したinline styleを
    確実に消しておく。
  */

  renderer.domElement.style.width =
    '100%';

  renderer.domElement.style.height =
    '100%';


  /*
    通常表示用
  */

  if (
    !vrMode
  ) {

    camera.aspect =
      width / height;

    camera.updateProjectionMatrix();

  }

}


/* =========================================================
   VR開始
========================================================= */

async function enterVR() {

  const ok =
    await enableOrientation();


  if (
    !ok
  ) {

    alert(
      '端末の「動作と方向」へのアクセスを許可してください。'
    );

    return;

  }


  /*
    指で決めた現在位置を
    VRでの立ち位置にする。
  */

  vrCenter.copy(
    camera.position
  );


  /*
    指で決めた現在方向を
    VR開始時の正面にする。
  */

  baseViewQuaternion.copy(
    camera.quaternion
  );


  /*
    この瞬間のスマホ姿勢をゼロ点にする。
  */

  if (
    sensorAvailable
  ) {

    baseSensorQuaternion =
      sensorQuaternion.clone();

  }
  else {

    baseSensorQuaternion =
      null;

  }


  vrMode =
    true;


  controls.enabled =
    false;


  document.body.classList.add(
    'vr'
  );


  /*
    Fullscreenは利用できれば使用。
    iPhone Safariでは利用できない場合もある。
  */

  try {

    if (
      document.documentElement
        .requestFullscreen
    ) {

      await document
        .documentElement
        .requestFullscreen();

    }

  }
  catch (
    error
  ) {

    /*
      Fullscreen失敗でも
      VR表示自体は継続。
    */

  }


  /*
    横画面固定を試す。
    Safariでは拒否されても問題なし。
  */

  try {

    if (
      screen.orientation?.lock
    ) {

      await screen.orientation.lock(
        'landscape'
      );

    }

  }
  catch (
    error
  ) {

  }


  /*
    Fullscreen・回転後にサイズを再取得。
  */

  scheduleResize();

}


/* =========================================================
   VR終了
========================================================= */

function exitVR() {

  vrMode =
    false;


  controls.enabled =
    true;


  document.body.classList.remove(
    'vr'
  );


  /*
    VR中に動いた頭方向を
    通常カメラへ残す。
  */

  controls.target
    .copy(
      camera.position
    )
    .add(

      new THREE.Vector3(
        0,
        0,
        -0.1
      )
      .applyQuaternion(
        camera.quaternion
      )

    );


  controls.update();


  if (

    document.fullscreenElement

    &&

    document.exitFullscreen

  ) {

    document
      .exitFullscreen()
      .catch(
        () => {}
      );

  }


  scheduleResize();

}


/* =========================================================
   初期位置
========================================================= */

function resetView() {

  camera.position.copy(
    INITIAL_POSITION
  );


  controls.target.copy(
    INITIAL_TARGET
  );


  camera.up.set(
    0,
    1,
    0
  );


  camera.lookAt(
    INITIAL_TARGET
  );


  controls.update();

}


/* =========================================================
   頭の回転
========================================================= */

const inverseBaseSensor =
  new THREE.Quaternion();


const sensorDelta =
  new THREE.Quaternion();


function applyHeadRotation() {

  camera.position.copy(
    vrCenter
  );


  /*
    センサーがまだ来ていなければ
    指操作時の向きをそのまま使う。
  */

  if (
    !sensorAvailable
  ) {

    camera.quaternion.copy(
      baseViewQuaternion
    );

    camera.updateMatrixWorld(
      true
    );

    return;

  }


  /*
    VRボタン直後に最初のセンサー値が来た場合、
    その値を基準姿勢にする。
  */

  if (
    !baseSensorQuaternion
  ) {

    baseSensorQuaternion =
      sensorQuaternion.clone();

  }


  /*
    現在姿勢 relative to 開始姿勢

    delta =
      current × inverse(base)

    これにより
    「VR開始時に向いていた方向」が
    常に正面になる。
  */

  inverseBaseSensor
    .copy(
      baseSensorQuaternion
    )
    .invert();


  sensorDelta
    .copy(
      sensorQuaternion
    )
    .multiply(
      inverseBaseSensor
    );


  /*
    頭の相対回転を、
    指で決めた視線方向へ加える。
  */

  camera.quaternion
    .copy(
      sensorDelta
    )
    .multiply(
      baseViewQuaternion
    );


  camera.updateMatrixWorld(
    true
  );

}


/* =========================================================
   通常表示
========================================================= */

function renderNormal() {

  controls.update();


  const {
    width,
    height
  } =
    getDisplaySize();


  /*
    通常カメラは画面全体。
  */

  if (
    Math.abs(
      camera.aspect
        - width / height
    )
    > 0.001
  ) {

    camera.aspect =
      width / height;

    camera.updateProjectionMatrix();

  }


  renderer.setScissorTest(
    false
  );


  renderer.setViewport(

    0,
    0,

    width,
    height

  );


  renderer.render(

    scene,
    camera

  );

}


/* =========================================================
   VR Stereo表示
========================================================= */

function renderStereo() {

  applyHeadRotation();


  const {
    width,
    height
  } =
    getDisplaySize();


  /*
    CSS画面を厳密に半分へ分割。

    例：
    1179pxなら

    左589px
    右590px

    のようにする。
  */

  const leftWidth =
    Math.floor(
      width / 2
    );


  const rightWidth =
    width - leftWidth;


  /*
    片眼カメラのaspect。
  */

  camera.aspect =
    leftWidth / height;


  camera.updateProjectionMatrix();


  /*
    StereoCameraが

    ・左眼
    ・右眼

    のカメラを生成する。
  */

  stereo.update(
    camera
  );


  renderer.setScissorTest(
    true
  );


  /*
    -------------------------
    左眼
    -------------------------
  */

  renderer.setViewport(

    0,
    0,

    leftWidth,
    height

  );


  renderer.setScissor(

    0,
    0,

    leftWidth,
    height

  );


  renderer.render(

    scene,
    stereo.cameraL

  );


  /*
    -------------------------
    右眼
    -------------------------
  */

  renderer.setViewport(

    leftWidth,
    0,

    rightWidth,
    height

  );


  renderer.setScissor(

    leftWidth,
    0,

    rightWidth,
    height

  );


  renderer.render(

    scene,
    stereo.cameraR

  );


  renderer.setScissorTest(
    false
  );

}


/* =========================================================
   Animation
========================================================= */

function animate() {

  requestAnimationFrame(
    animate
  );


  if (
    vrMode
  ) {

    renderStereo();

  }
  else {

    renderNormal();

  }

}


animate();


/* =========================================================
   Resize
========================================================= */

function scheduleResize() {

  /*
    iPhone Safariでは画面回転後

    0ms
    ↓
    アドレスバー変更
    ↓
    viewport変更
    ↓
    fullscreen変更

    のように数段階でサイズが変化する。

    何度か再計算する。
  */

  resizeRenderer();


  setTimeout(
    resizeRenderer,
    50
  );


  setTimeout(
    resizeRenderer,
    150
  );


  setTimeout(
    resizeRenderer,
    350
  );


  setTimeout(
    resizeRenderer,
    700
  );


  setTimeout(
    resizeRenderer,
    1200
  );

}


window.addEventListener(

  'resize',

  scheduleResize

);


window.addEventListener(

  'orientationchange',

  scheduleResize

);


if (
  window.visualViewport
) {

  window.visualViewport
    .addEventListener(

      'resize',

      scheduleResize

    );

}


/*
  初回サイズ
*/

scheduleResize();


/* =========================================================
   Buttons
========================================================= */

vrButton.addEventListener(

  'click',

  enterVR

);


vrExit.addEventListener(

  'click',

  exitVR

);


resetButton.addEventListener(

  'click',

  resetView

);


/*
  このボタンはVR中でも常に有効。
*/

reloadButton.addEventListener(

  'click',

  () => {

    window.location.reload();

  }

);


/* =========================================================
   Fullscreen
========================================================= */

document.addEventListener(

  'fullscreenchange',

  () => {

    /*
      ユーザーがSafari側から
      Fullscreenを解除した場合。
    */

    if (
      !document.fullscreenElement
      &&
      vrMode
    ) {

      /*
        iOSによってはfullscreen自体が
        最初から使われていないため、
        ここでは強制終了しない。
      */

      scheduleResize();

    }

  }

);