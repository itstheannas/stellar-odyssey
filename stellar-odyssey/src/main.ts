import './styles.css';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import {
  AU_SCENE,
  formatDistance,
  formatSimulationDate,
  KeplerOrbit,
  seededRandom,
  SOLAR_MU_AU_DAY,
} from './astronomy';
import type { CelestialMeta } from './astronomy';
import {
  createAccretionSystem,
  createAsteroidBelt,
  createCometVisual,
  createEmissiveStar,
  createGalaxyStarfield,
  createNebula,
  createOrbitLine,
  createPlanetVisual,
} from './factories';
import type { AccretionSystem } from './factories';

const app = document.querySelector<HTMLDivElement>('#app');
if (!app) throw new Error('Application mount point was not found.');

app.innerHTML = `
  <canvas id="universe"></canvas>
  <div class="vignette"></div>
  <div class="hud">
    <header class="masthead">
      <div class="wordmark">
        <span class="eyebrow">NAVIGATION // 2247.041</span>
        <h1>STELLAR<br><em>ODYSSEY</em></h1>
      </div>
      <div class="header-actions">
        <button id="tour-button" class="outline-button">BEGIN TOUR</button>
        <div class="status-pill"><span class="status-dot"></span>LIVE ORRERY</div>
      </div>
    </header>
    <aside class="nav-stack">
      <span class="section-label">JUMP TO</span>
      <button data-focus="galaxy" class="nav-link active"><span>01</span> GALACTIC CORE</button>
      <button data-focus="system" class="nav-link"><span>02</span> AURELIS SYSTEM</button>
      <button data-focus="planet" class="nav-link"><span>03</span> NERIDA</button>
      <button data-focus="blackhole" class="nav-link"><span>04</span> NOCTURNE X-1</button>
      <button data-focus="nebula" class="nav-link"><span>05</span> VESPER NURSERY</button>
      <div class="nav-separator"></div>
      <button id="perturb-button" class="nav-link subtle"><span>△</span> PERTURB LAB</button>
    </aside>
    <section id="object-panel" class="object-panel is-hidden" aria-live="polite">
      <div class="panel-topline"><span id="object-kind">PLANETARY BODY</span><button id="panel-close" aria-label="Close object panel">×</button></div>
      <h2 id="object-name">Nerida</h2>
      <p id="object-subtitle">Oceanic terrestrial planet</p>
      <div class="data-grid">
        <div><span>MASS</span><strong id="object-mass">1.0 M⊕</strong></div>
        <div><span>RADIUS</span><strong id="object-radius">6,371 km</strong></div>
        <div><span>TEMP.</span><strong id="object-temperature">286 K</strong></div>
        <div><span>ORBIT</span><strong id="object-period">638 days</strong></div>
      </div>
      <p id="object-description" class="object-description"></p>
    </section>
    <section class="time-panel">
      <div class="time-header"><span class="section-label">CHRONOMETRY</span><strong id="date-label">18 APR 2247</strong></div>
      <div class="time-controls">
        <button id="pause-button" class="pause-button">PAUSE</button>
        <div class="speed-row" id="speed-row">
          <button data-speed="1">1×</button>
          <button data-speed="100">100×</button>
          <button data-speed="10000" class="active">10K×</button>
          <button data-speed="1000000">1M×</button>
        </div>
      </div>
    </section>
    <div class="scale-readout">
      <span class="section-label">FIELD SCALE</span>
      <div class="scale-line"><i></i><i></i><i></i></div>
      <strong id="scale-label">32 KLY</strong>
    </div>
    <footer class="helpbar">
      <span>DRAG <b>ORBIT</b></span><span>SCROLL <b>TRAVERSE</b></span><span>RIGHT DRAG <b>PAN</b></span><span>CLICK <b>FOCUS</b></span><span>SPACE <b>PAUSE</b></span>
    </footer>
    <div id="intro" class="intro">
      <div class="intro-mark">✦</div>
      <p>THE DISTANCE BETWEEN LIGHTS<br>IS THE STORY.</p>
      <span>Click any luminous landmark or begin the guided passage.</span>
    </div>
  </div>
`;

const canvas = document.querySelector<HTMLCanvasElement>('#universe');
if (!canvas) throw new Error('Universe canvas was not found.');

const scene = new THREE.Scene();
scene.background = new THREE.Color('#010108');
scene.fog = new THREE.FogExp2('#02020a', 0.000012);

const camera = new THREE.PerspectiveCamera(42, window.innerWidth / window.innerHeight, 0.03, 260_000);
camera.position.set(47_000, 15_000, 58_000);

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.22;

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.24, 0.78, 0.08);
composer.addPass(bloom);
composer.addPass(new OutputPass());

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0, 0);
controls.enableDamping = true;
controls.dampingFactor = 0.052;
controls.enablePan = true;
controls.panSpeed = 0.6;
controls.rotateSpeed = 0.34;
controls.zoomSpeed = 0.66;
controls.minDistance = 1.1;
controls.maxDistance = 148_000;
controls.screenSpacePanning = true;
controls.update();

const clock = new THREE.Clock();
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
const systemPosition = new THREE.Vector3(8_700, 260, -4_200);
const sceneAnchors = new Map<string, THREE.Object3D>();
const pickables: THREE.Object3D[] = [];
const animationUniforms: Array<{ value: number }> = [];
const orbitingBodies: OrbitingBody[] = [];
let simulationDays = 0;
let timeScale = 10_000;
let paused = false;
let tourActive = false;
let tourIndex = 0;
let tourNextAt = 0;
let focusTween: FocusTween | null = null;
let dragOrigin: { x: number; y: number } | null = null;

const solarGroup = new THREE.Group();
solarGroup.position.copy(systemPosition);
scene.add(solarGroup);

const ambient = new THREE.HemisphereLight('#5e76ae', '#020207', 0.22);
scene.add(ambient);

const metadata: Record<string, CelestialMeta> = {
  galaxy: {
    id: 'galaxy',
    name: 'The Heliotrope Galaxy',
    kind: 'black-hole',
    subtitle: 'Barred spiral galaxy · local observable map',
    mass: '7.4 × 10¹¹ M☉',
    radius: '52,000 ly',
    temperature: '2.7 K background',
    period: '228 Myr galactic year',
    description: 'A quiet barred spiral rendered as a navigable map of light. Its stars have been distributed into four young arms around an old, bright nucleus.',
    accent: '#f8cfa3',
  },
  aurelion: {
    id: 'aurelion',
    name: 'Aurelion',
    kind: 'star',
    subtitle: 'F-type main-sequence star · Aurelis system',
    mass: '1.18 M☉',
    radius: '1.31 R☉',
    temperature: '6,410 K',
    period: 'Rotation 18.6 days',
    description: 'The warm, white star around which the Aurelis system is organized. Its stellar wind gives shape to every comet tail in this local volume.',
    accent: '#ffda93',
  },
  cinder: {
    id: 'cinder',
    name: 'Cinder',
    kind: 'planet',
    subtitle: 'Iron-rich volcanic terrestrial world',
    mass: '0.44 M⊕',
    radius: '4,650 km',
    temperature: '812 K mean',
    period: '149 days',
    description: 'A dense inner planet with a dark, metal-bearing crust. Its eccentric orbit drives dramatic changes in surface irradiation across each year.',
    accent: '#f08155',
  },
  verdant: {
    id: 'verdant',
    name: 'Verdant',
    kind: 'planet',
    subtitle: 'Clouded temperate terrestrial world',
    mass: '0.82 M⊕',
    radius: '5,870 km',
    temperature: '305 K mean',
    period: '315 days',
    description: 'A bright, heavily clouded terrestrial world. Pale continental shelves sit beneath a dense, reflective atmosphere.',
    accent: '#9fe0bf',
  },
  nerida: {
    id: 'nerida',
    name: 'Nerida',
    kind: 'planet',
    subtitle: 'Oceanic terrestrial world · inner habitable band',
    mass: '1.07 M⊕',
    radius: '6,790 km',
    temperature: '286 K mean',
    period: '638 days',
    description: 'Nerida carries shallow cobalt oceans, bright polar cloud systems, and one small tidal companion. It is the closest anchor to a living horizon in this system.',
    accent: '#77c8ff',
  },
  leto: {
    id: 'leto',
    name: 'Leto',
    kind: 'moon',
    subtitle: 'Tidally locked silicate moon of Nerida',
    mass: '0.014 M⊕',
    radius: '1,540 km',
    temperature: '168 K mean',
    period: '17.4 days',
    description: 'A cratered moon whose bright albedo makes it a clean marker against the ocean-blue limb of Nerida.',
    accent: '#d4e3f2',
  },
  aurelia: {
    id: 'aurelia',
    name: 'Aurelia',
    kind: 'planet',
    subtitle: 'Amber gas giant · 14 confirmed moons',
    mass: '2.3 M♃',
    radius: '81,200 km',
    temperature: '142 K cloud top',
    period: '1,995 days',
    description: 'A high-mass gas giant with luminous upper-atmosphere bands and an unstable inner moon system shaped by powerful tides.',
    accent: '#f4ae75',
  },
  eidolon: {
    id: 'eidolon',
    name: 'Eidolon',
    kind: 'planet',
    subtitle: 'Ringed gas giant · cryogenic high atmosphere',
    mass: '1.7 M♃',
    radius: '74,600 km',
    temperature: '92 K cloud top',
    period: '5,098 days',
    description: 'A pale gas giant, ringed with ice-dark debris. Its wide rings show gaps etched by moonlets and resonance lanes.',
    accent: '#d7ccbb',
  },
  lumen: {
    id: 'lumen',
    name: 'Lumen',
    kind: 'planet',
    subtitle: 'Methane ice giant · tilted magnetosphere',
    mass: '15.2 M⊕',
    radius: '25,900 km',
    temperature: '54 K mean',
    period: '12,248 days',
    description: 'An ice giant with a thin, slanted ring system and a high-altitude haze that turns dusk into a luminous cyan arc.',
    accent: '#9cf2e4',
  },
  umbra: {
    id: 'umbra',
    name: 'Umbra',
    kind: 'planet',
    subtitle: 'Distant cobalt ice giant',
    mass: '10.9 M⊕',
    radius: '23,700 km',
    temperature: '37 K mean',
    period: '25,568 days',
    description: 'The outermost known giant in the system. Its deep cobalt atmosphere is illuminated only faintly by Aurelion.',
    accent: '#7399ff',
  },
  comet: {
    id: 'comet',
    name: 'Comet Aster-9',
    kind: 'comet',
    subtitle: 'Long-period visitor · active volatile coma',
    mass: '4.7 × 10¹³ kg',
    radius: '8.4 km nucleus',
    temperature: '74–312 K',
    period: '33.6 years',
    description: 'A volatile-rich visitor on a highly eccentric path. Its tail is not a trail: it is pushed away from the star by radiation pressure and stellar wind.',
    accent: '#bce9ff',
  },
  vesper: {
    id: 'vesper',
    name: 'Vesper Nursery',
    kind: 'nebula',
    subtitle: 'Emission cloud · active stellar nursery',
    mass: '31,000 M☉ gas',
    radius: '90 ly mapped',
    temperature: '8–11 K core',
    period: 'Collapse time 0.7 Myr',
    description: 'A fragmenting molecular cloud with hydrogen emission and dense dust pockets. New stars form where gravity overwhelms turbulence.',
    accent: '#d98dff',
  },
  nocturne: {
    id: 'nocturne',
    name: 'Nocturne X-1',
    kind: 'black-hole',
    subtitle: 'Stellar-mass black hole · active accretion binary',
    mass: '14.6 M☉',
    radius: '43 km event horizon',
    temperature: 'Accretion 8.2 MK',
    period: 'Binary period 4.7 days',
    description: 'A stellar-mass black hole feeding from a nearby companion. The bright disk is heated matter; the dark center is the event horizon itself.',
    accent: '#82baff',
  },
  core: {
    id: 'core',
    name: 'Heliotrope A*',
    kind: 'black-hole',
    subtitle: 'Supermassive black hole · galactic nucleus',
    mass: '4.1 × 10⁶ M☉',
    radius: '12.1 million km',
    temperature: 'Relativistic accretion flow',
    period: 'Stellar orbit 15.8 years',
    description: 'At the center of the Heliotrope Galaxy, a supermassive black hole gathers a compact, luminous disk. The warped arcs around it are a visual approximation of gravitational lensing.',
    accent: '#ffd4a2',
  },
};

type OrbitingBody = {
  root: THREE.Object3D;
  orbit: KeplerOrbit;
  spin: number;
  cloud?: THREE.Mesh;
  parent?: THREE.Object3D;
};

type FocusTween = {
  start: number;
  duration: number;
  fromPosition: THREE.Vector3;
  toPosition: THREE.Vector3;
  fromTarget: THREE.Vector3;
  toTarget: THREE.Vector3;
};

type NBodyParticle = {
  position: THREE.Vector3;
  velocity: THREE.Vector3;
  mass: number;
};

function attachMeta(root: THREE.Object3D, meta: CelestialMeta, focusDistance: number): void {
  root.userData.meta = meta;
  root.userData.focusDistance = focusDistance;
  root.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Sprite) {
      child.userData.focusRoot = root;
      pickables.push(child);
    }
  });
  sceneAnchors.set(meta.id, root);
}

function createFocusAnchor(radius: number, meta: CelestialMeta, focusDistance: number): THREE.Mesh {
  const anchor = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 16, 12),
    new THREE.MeshBasicMaterial({ transparent: true, opacity: 0.002, depthWrite: false, color: '#ffffff' }),
  );
  anchor.userData.meta = meta;
  anchor.userData.focusDistance = focusDistance;
  anchor.userData.focusRoot = anchor;
  pickables.push(anchor);
  sceneAnchors.set(meta.id, anchor);
  return anchor;
}

const galaxy = createGalaxyStarfield(14, 56_000, 30_000);
animationUniforms.push(galaxy.time);
scene.add(galaxy.mesh);

const galacticCore: AccretionSystem = createAccretionSystem({ radius: 105, inner: '#fff5d1', outer: '#e86c43', jet: '#7db8ff' });
galacticCore.group.position.set(0, -20, 0);
galacticCore.group.rotation.set(0.08, 0.25, -0.18);
animationUniforms.push(galacticCore.time);
scene.add(galacticCore.group);
attachMeta(galacticCore.group, metadata.core, 1_450);

const coreGlow = new THREE.Sprite(new THREE.SpriteMaterial({
  map: new THREE.TextureLoader().load('data:image/svg+xml,%3Csvg xmlns="http://www.w3.org/2000/svg" width="128" height="128"%3E%3CradialGradient id="g"%3E%3Cstop offset="0" stop-color="%23fff" stop-opacity=".9"/%3E%3Cstop offset=".2" stop-color="%23ffc18c" stop-opacity=".5"/%3E%3Cstop offset="1" stop-color="%23000" stop-opacity="0"/%3E%3C/radialGradient%3E%3Crect width="128" height="128" fill="url(%23g)"/%3E%3C/svg%3E'),
  transparent: true,
  blending: THREE.AdditiveBlending,
  depthWrite: false,
  color: '#ffe3bc',
  opacity: 0.78,
}));
coreGlow.scale.setScalar(2_600);
galacticCore.group.add(coreGlow);

const vesper = createNebula(65, new THREE.Vector3(-15_000, 1_200, 7_300), 5_300, ['#9f67ff', '#ef9af4', '#558eff']);
vesper.group.rotation.set(0.18, -0.6, 0.25);
animationUniforms.push(vesper.time);
scene.add(vesper.group);
const vesperAnchor = createFocusAnchor(2_100, metadata.vesper, 7_800);
vesperAnchor.position.set(-15_000, 1_200, 7_300);
scene.add(vesperAnchor);

const dawnNebula = createNebula(270, new THREE.Vector3(16_800, -900, -10_800), 3_900, ['#38c4ff', '#5d8fff', '#94f1da']);
dawnNebula.group.rotation.set(-0.24, 0.4, 0.1);
animationUniforms.push(dawnNebula.time);
scene.add(dawnNebula.group);

const nocturne = createAccretionSystem({ radius: 52, inner: '#eaf1ff', outer: '#5b84ff', jet: '#83baff' });
nocturne.group.position.set(-9_200, 470, -10_200);
nocturne.group.rotation.set(-0.35, 0.48, 0.2);
animationUniforms.push(nocturne.time);
scene.add(nocturne.group);
attachMeta(nocturne.group, metadata.nocturne, 1_200);

const localStar = createEmissiveStar(14, '#fff4ce', '#ffbf7b');
solarGroup.add(localStar);
attachMeta(localStar, metadata.aurelion, 620);
const solarLight = new THREE.PointLight('#fff0cb', 31_000, 10_000, 1.7);
solarGroup.add(solarLight);

const bodySpecs = [
  { meta: metadata.cinder, radius: 2.15, orbit: { semimajorAU: 0.56, eccentricity: 0.18, inclination: 0.07, longitude: 0.5, argument: 1.8, meanAnomaly: 0.2 }, visual: { seed: 3, palette: ['#231512', '#6c2c1f', '#cc6841', '#2a1719'], roughness: 0.92, atmosphere: { color: '#ff8459', intensity: 0.8, scale: 1.035 } } },
  { meta: metadata.verdant, radius: 3.1, orbit: { semimajorAU: 0.92, eccentricity: 0.08, inclination: 0.035, longitude: 2.0, argument: 0.7, meanAnomaly: 1.4 }, visual: { seed: 8, palette: ['#254a4d', '#53996d', '#c6cc8a', '#20474b'], roughness: 0.78, atmosphere: { color: '#7ce2ca', intensity: 1.1, scale: 1.075 }, clouds: '#f5f4db' } },
  { meta: metadata.nerida, radius: 3.55, orbit: { semimajorAU: 1.45, eccentricity: 0.05, inclination: 0.02, longitude: 0.7, argument: 2.3, meanAnomaly: 2.7 }, visual: { seed: 17, palette: ['#07366d', '#1261aa', '#82c8cf', '#0a3e78'], roughness: 0.66, atmosphere: { color: '#63bcff', intensity: 1.35, scale: 1.09 }, clouds: '#dff5ff' } },
  { meta: metadata.aurelia, radius: 13.8, orbit: { semimajorAU: 3.1, eccentricity: 0.09, inclination: 0.04, longitude: 1.8, argument: 2.6, meanAnomaly: 4.0 }, visual: { seed: 33, palette: ['#8b4730', '#d48445', '#f2c17b', '#6a352d'], banded: true, roughness: 0.71, atmosphere: { color: '#f3b173', intensity: 0.95, scale: 1.055 } } },
  { meta: metadata.eidolon, radius: 12.5, orbit: { semimajorAU: 5.8, eccentricity: 0.14, inclination: 0.08, longitude: 2.3, argument: 1.1, meanAnomaly: 5.2 }, visual: { seed: 41, palette: ['#6d6a6e', '#b4a38c', '#e2d4b7', '#615c5d'], banded: true, roughness: 0.66, atmosphere: { color: '#d7c4a6', intensity: 0.72, scale: 1.065 }, rings: { inner: 19, outer: 31, tilt: 0.22 } } },
  { meta: metadata.lumen, radius: 7.25, orbit: { semimajorAU: 10.4, eccentricity: 0.07, inclination: 0.15, longitude: 0.2, argument: 2.2, meanAnomaly: 2.0 }, visual: { seed: 58, palette: ['#1a6670', '#3da6ab', '#a1e8d4', '#174f66'], banded: true, roughness: 0.68, atmosphere: { color: '#7cefe1', intensity: 1.12, scale: 1.09 }, rings: { inner: 10.5, outer: 13.5, tilt: -0.44 } } },
  { meta: metadata.umbra, radius: 6.6, orbit: { semimajorAU: 17.0, eccentricity: 0.11, inclination: 0.11, longitude: 1.3, argument: 0.3, meanAnomaly: 0.8 }, visual: { seed: 71, palette: ['#162c8b', '#375da9', '#77a7de', '#102061'], banded: true, roughness: 0.7, atmosphere: { color: '#5c96ff', intensity: 1.03, scale: 1.085 } } },
];

const planetRoots = new Map<string, THREE.Object3D>();

for (const spec of bodySpecs) {
  const orbit = new KeplerOrbit(spec.orbit);
  const planet = createPlanetVisual({ radius: spec.radius, ...spec.visual });
  solarGroup.add(planet.root);
  const orbitLine = createOrbitLine(orbit, spec.meta.accent, spec.meta.id === 'nerida' ? 0.36 : 0.18);
  solarGroup.add(orbitLine);
  attachMeta(planet.root, spec.meta, Math.max(spec.radius * 9, 72));
  orbitingBodies.push({ root: planet.root, orbit, spin: (0.08 + spec.radius * 0.006) * (spec.meta.id === 'cinder' ? 2.7 : 1), cloud: planet.cloudLayer });
  planetRoots.set(spec.meta.id, planet.root);
}

const asteroidBelt = createAsteroidBelt(399, 2.18 * AU_SCENE, 2.72 * AU_SCENE, 2_500);
solarGroup.add(asteroidBelt);
const beltAnchor = createFocusAnchor(2.78 * AU_SCENE, { id: 'belt', name: 'Aurelis Debris Belt', kind: 'belt', subtitle: 'Resonant rocky body field', mass: '0.013 M⊕', radius: '0.54 AU wide', temperature: '190 K mean', period: '3.4–4.9 years', description: 'A narrow family of rocky fragments shaped by orbital resonances between the inner worlds and Aurelia.', accent: '#a38e87' }, 720);
solarGroup.add(beltAnchor);

const neridaRoot = planetRoots.get('nerida');
if (neridaRoot) {
  const leto = createPlanetVisual({ radius: 1.16, seed: 101, palette: ['#54525b', '#aaa6a5', '#ddd8c5', '#3b3d49'], roughness: 0.95 });
  const letoOrbit = new KeplerOrbit({ semimajorAU: 0.085, eccentricity: 0.04, inclination: 0.09, longitude: 1.2, argument: 0.5, meanAnomaly: 2.3, periodDays: 17.4 });
  neridaRoot.add(leto.root);
  attachMeta(leto.root, metadata.leto, 28);
  orbitingBodies.push({ root: leto.root, orbit: letoOrbit, spin: 0.035, parent: neridaRoot });
}

const aureliaRoot = planetRoots.get('aurelia');
if (aureliaRoot) {
  const kora = createPlanetVisual({ radius: 1.82, seed: 119, palette: ['#251919', '#6c4b43', '#b37861', '#302226'], roughness: 0.9 });
  const koraOrbit = new KeplerOrbit({ semimajorAU: 0.16, eccentricity: 0.12, inclination: 0.22, longitude: 0.8, argument: 2.1, meanAnomaly: 4.2, periodDays: 9.2 });
  aureliaRoot.add(kora.root);
  orbitingBodies.push({ root: kora.root, orbit: koraOrbit, spin: 0.055, parent: aureliaRoot });
}

const cometOrbit = new KeplerOrbit({ semimajorAU: 18.5, eccentricity: 0.88, inclination: 0.48, longitude: 2.4, argument: 0.7, meanAnomaly: 4.8 });
const cometVisual = createCometVisual();
solarGroup.add(cometVisual.group);
const cometLine = createOrbitLine(cometOrbit, '#a8e7ff', 0.16);
solarGroup.add(cometLine);
attachMeta(cometVisual.group, metadata.comet, 165);

const nBodyGroup = new THREE.Group();
nBodyGroup.position.set(-8.4 * AU_SCENE, 7, 4.2 * AU_SCENE);
solarGroup.add(nBodyGroup);
const nBodyMesh = new THREE.InstancedMesh(
  new THREE.IcosahedronGeometry(0.75, 1),
  new THREE.MeshBasicMaterial({ color: '#d4f1ff', toneMapped: false }),
  10,
);
nBodyGroup.add(nBodyMesh);
const nBodyParticles: NBodyParticle[] = [];
const nBodyMatrix = new THREE.Matrix4();
const nBodyScale = new THREE.Vector3();
const nBodyRotation = new THREE.Quaternion();
const nBodyRandom = seededRandom(2048);

function resetNBody(): void {
  nBodyParticles.length = 0;
  for (let i = 0; i < 10; i += 1) {
    const r = 0.45 + i * 0.13;
    const phase = (i / 10) * Math.PI * 2;
    const position = new THREE.Vector3(Math.cos(phase) * r, (nBodyRandom() - 0.5) * 0.12, Math.sin(phase) * r);
    const orbitalSpeed = Math.sqrt(SOLAR_MU_AU_DAY / r);
    const tangent = new THREE.Vector3(-Math.sin(phase), 0, Math.cos(phase)).multiplyScalar(orbitalSpeed * (0.94 + nBodyRandom() * 0.12));
    nBodyParticles.push({ position, velocity: tangent, mass: 0.00000005 + nBodyRandom() * 0.00000004 });
  }
}

function updateNBody(deltaDays: number): void {
  const safeDelta = Math.min(0.025, Math.max(0, deltaDays / 12));
  if (safeDelta <= 0) return;
  const steps = Math.min(12, Math.max(1, Math.ceil(deltaDays / 0.025)));
  const step = safeDelta / steps;
  for (let iteration = 0; iteration < steps; iteration += 1) {
    const accelerations = nBodyParticles.map((particle) => {
      const radiusSq = Math.max(0.04, particle.position.lengthSq());
      const central = particle.position.clone().multiplyScalar(-SOLAR_MU_AU_DAY / (radiusSq * Math.sqrt(radiusSq)));
      return central;
    });
    for (let i = 0; i < nBodyParticles.length; i += 1) {
      for (let j = i + 1; j < nBodyParticles.length; j += 1) {
        const delta = nBodyParticles[j].position.clone().sub(nBodyParticles[i].position);
        const distSq = Math.max(0.0006, delta.lengthSq());
        const direction = delta.normalize();
        const strength = 0.0000014 / distSq;
        accelerations[i].addScaledVector(direction, strength * nBodyParticles[j].mass * 100_000);
        accelerations[j].addScaledVector(direction, -strength * nBodyParticles[i].mass * 100_000);
      }
    }
    nBodyParticles.forEach((particle, index) => {
      particle.velocity.addScaledVector(accelerations[index], step);
      particle.position.addScaledVector(particle.velocity, step);
    });
  }
  nBodyParticles.forEach((particle, index) => {
    const scenePosition = particle.position.clone().multiplyScalar(AU_SCENE);
    nBodyScale.setScalar(0.55 + (index % 3) * 0.16);
    nBodyMatrix.compose(scenePosition, nBodyRotation, nBodyScale);
    nBodyMesh.setMatrixAt(index, nBodyMatrix);
  });
  nBodyMesh.instanceMatrix.needsUpdate = true;
}

resetNBody();
updateNBody(0.01);

const objectPanel = document.querySelector<HTMLElement>('#object-panel');
const objectKind = document.querySelector<HTMLElement>('#object-kind');
const objectName = document.querySelector<HTMLElement>('#object-name');
const objectSubtitle = document.querySelector<HTMLElement>('#object-subtitle');
const objectMass = document.querySelector<HTMLElement>('#object-mass');
const objectRadius = document.querySelector<HTMLElement>('#object-radius');
const objectTemperature = document.querySelector<HTMLElement>('#object-temperature');
const objectPeriod = document.querySelector<HTMLElement>('#object-period');
const objectDescription = document.querySelector<HTMLElement>('#object-description');
const dateLabel = document.querySelector<HTMLElement>('#date-label');
const scaleLabel = document.querySelector<HTMLElement>('#scale-label');
const pauseButton = document.querySelector<HTMLButtonElement>('#pause-button');
const perturbButton = document.querySelector<HTMLButtonElement>('#perturb-button');
const tourButton = document.querySelector<HTMLButtonElement>('#tour-button');
const intro = document.querySelector<HTMLElement>('#intro');

function showMeta(meta: CelestialMeta): void {
  if (!objectPanel || !objectKind || !objectName || !objectSubtitle || !objectMass || !objectRadius || !objectTemperature || !objectPeriod || !objectDescription) return;
  objectPanel.classList.remove('is-hidden');
  objectPanel.style.setProperty('--accent', meta.accent);
  objectKind.textContent = meta.kind.replace('-', ' ').toUpperCase();
  objectName.textContent = meta.name;
  objectSubtitle.textContent = meta.subtitle;
  objectMass.textContent = meta.mass;
  objectRadius.textContent = meta.radius;
  objectTemperature.textContent = meta.temperature;
  objectPeriod.textContent = meta.period ?? '—';
  objectDescription.textContent = meta.description;
}

function closePanel(): void {
  objectPanel?.classList.add('is-hidden');
}

function focusOn(root: THREE.Object3D, meta?: CelestialMeta, duration = 2.8): void {
  const focusMeta = meta ?? (root.userData.meta as CelestialMeta | undefined);
  if (!focusMeta) return;
  const target = root.getWorldPosition(new THREE.Vector3());
  const distance = Number(root.userData.focusDistance ?? 520);
  const fromTarget = controls.target.clone();
  const direction = camera.position.clone().sub(fromTarget).normalize();
  if (direction.lengthSq() < 0.001) direction.set(0.63, 0.28, 0.72).normalize();
  const lift = Math.max(distance * 0.12, 4);
  const toPosition = target.clone().addScaledVector(direction, distance).add(new THREE.Vector3(0, lift, 0));
  focusTween = {
    start: performance.now(),
    duration: duration * 1_000,
    fromPosition: camera.position.clone(),
    toPosition,
    fromTarget,
    toTarget: target,
  };
  showMeta(focusMeta);
  intro?.classList.add('is-hidden');
  document.querySelectorAll<HTMLButtonElement>('[data-focus]').forEach((button) => {
    const matches = button.dataset.focus === focusMeta.id || (button.dataset.focus === 'galaxy' && focusMeta.id === 'core') || (button.dataset.focus === 'system' && focusMeta.id === 'aurelion') || (button.dataset.focus === 'planet' && focusMeta.id === 'nerida') || (button.dataset.focus === 'blackhole' && focusMeta.id === 'nocturne') || (button.dataset.focus === 'nebula' && focusMeta.id === 'vesper');
    button.classList.toggle('active', matches);
  });
}

function focusByKey(key: string): void {
  const idByKey: Record<string, string> = {
    galaxy: 'core',
    system: 'aurelion',
    planet: 'nerida',
    blackhole: 'nocturne',
    nebula: 'vesper',
  };
  const target = sceneAnchors.get(idByKey[key] ?? key);
  if (target) focusOn(target);
}

function updateComet(): void {
  const position = cometOrbit.update(simulationDays);
  cometVisual.group.position.copy(position);
  const direction = position.clone().normalize();
  const attribute = cometVisual.tail.geometry.getAttribute('position') as THREE.BufferAttribute;
  for (let i = 0; i < attribute.count; i += 1) {
    const progress = i / (attribute.count - 1);
    const jitter = Math.sin(progress * 38 + simulationDays * 0.2) * (1 - progress) * 1.5;
    attribute.setXYZ(i, direction.x * progress * 86 + jitter * 0.22, direction.y * progress * 86 + jitter * 0.12, direction.z * progress * 86 + jitter * 0.28);
  }
  attribute.needsUpdate = true;
}

function updateFocusTween(now: number): void {
  if (!focusTween) return;
  const elapsed = Math.min(1, (now - focusTween.start) / focusTween.duration);
  const eased = elapsed < 0.5 ? 4 * elapsed * elapsed * elapsed : 1 - Math.pow(-2 * elapsed + 2, 3) / 2;
  camera.position.lerpVectors(focusTween.fromPosition, focusTween.toPosition, eased);
  controls.target.lerpVectors(focusTween.fromTarget, focusTween.toTarget, eased);
  if (elapsed >= 1) focusTween = null;
}

function updateScale(): void {
  if (!scaleLabel) return;
  const distance = camera.position.distanceTo(controls.target);
  if (distance > 8_000) {
    const kilolightyears = Math.max(1, Math.round(distance / 1_850));
    scaleLabel.textContent = `${kilolightyears.toLocaleString()} KLY`;
  } else {
    scaleLabel.textContent = formatDistance(distance);
  }
}

function updateChronometry(): void {
  if (dateLabel) dateLabel.textContent = formatSimulationDate(simulationDays).toUpperCase();
}

function updateBodies(delta: number): void {
  const days = paused ? 0 : delta * 0.0005 * timeScale;
  simulationDays += days;
  orbitingBodies.forEach((body) => {
    body.root.position.copy(body.orbit.update(simulationDays));
    body.root.rotation.y += delta * body.spin;
    if (body.cloud) body.cloud.rotation.y += delta * body.spin * 1.45;
  });
  updateComet();
  updateNBody(days);
}

function updateAnimatedMaterials(elapsed: number): void {
  animationUniforms.forEach((uniform) => {
    uniform.value = elapsed;
  });
  galacticCore.group.rotation.y += 0.0007;
  nocturne.group.rotation.y -= 0.0016;
}

function runTour(now: number): void {
  if (!tourActive || now < tourNextAt || focusTween) return;
  const tourSequence = ['core', 'aurelion', 'nerida', 'nocturne', 'vesper'];
  const target = sceneAnchors.get(tourSequence[tourIndex]);
  if (target) focusOn(target, undefined, 3.4);
  tourIndex = (tourIndex + 1) % tourSequence.length;
  tourNextAt = now + 7_500;
}

function animate(now: number): void {
  requestAnimationFrame(animate);
  const delta = Math.min(0.06, clock.getDelta());
  updateFocusTween(now);
  updateBodies(delta);
  updateAnimatedMaterials(now * 0.001);
  runTour(now);
  controls.update();
  updateScale();
  updateChronometry();
  composer.render();
}

function resize(): void {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
}

function pickObject(event: PointerEvent): void {
  if (dragOrigin && Math.hypot(event.clientX - dragOrigin.x, event.clientY - dragOrigin.y) > 6) return;
  const bounds = renderer.domElement.getBoundingClientRect();
  pointer.x = ((event.clientX - bounds.left) / bounds.width) * 2 - 1;
  pointer.y = -((event.clientY - bounds.top) / bounds.height) * 2 + 1;
  raycaster.setFromCamera(pointer, camera);
  const hits = raycaster.intersectObjects(pickables, true);
  if (!hits.length) return;
  const root = hits[0].object.userData.focusRoot as THREE.Object3D | undefined;
  const target = root ?? hits[0].object;
  const meta = target.userData.meta as CelestialMeta | undefined;
  focusOn(target, meta);
}

function togglePause(): void {
  paused = !paused;
  if (pauseButton) pauseButton.textContent = paused ? 'PLAY' : 'PAUSE';
  pauseButton?.classList.toggle('active', paused);
}

function setSpeed(speed: number): void {
  timeScale = speed;
  document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((button) => button.classList.toggle('active', Number(button.dataset.speed) === speed));
}

function perturbLab(): void {
  nBodyParticles.forEach((particle, index) => {
    const direction = particle.position.clone().normalize();
    const tangential = new THREE.Vector3(-direction.z, (index % 2 ? 1 : -1) * 0.12, direction.x).normalize();
    particle.velocity.addScaledVector(tangential, 0.0058 + index * 0.00015);
  });
  perturbButton?.classList.add('engaged');
  window.setTimeout(() => perturbButton?.classList.remove('engaged'), 900);
}

window.addEventListener('resize', resize);
renderer.domElement.addEventListener('pointerdown', (event) => {
  dragOrigin = { x: event.clientX, y: event.clientY };
  tourActive = false;
});
renderer.domElement.addEventListener('pointerup', (event) => {
  pickObject(event);
  dragOrigin = null;
});

window.addEventListener('keydown', (event) => {
  if (event.code === 'Space') {
    event.preventDefault();
    togglePause();
  }
  if (event.code === 'Digit1') focusByKey('galaxy');
  if (event.code === 'Digit2') focusByKey('system');
  if (event.code === 'Digit3') focusByKey('planet');
  if (event.code === 'Digit4') focusByKey('blackhole');
});

document.querySelectorAll<HTMLButtonElement>('[data-focus]').forEach((button) => {
  button.addEventListener('click', () => {
    tourActive = false;
    focusByKey(button.dataset.focus ?? 'galaxy');
  });
});
document.querySelectorAll<HTMLButtonElement>('[data-speed]').forEach((button) => button.addEventListener('click', () => setSpeed(Number(button.dataset.speed))));
document.querySelector<HTMLButtonElement>('#panel-close')?.addEventListener('click', closePanel);
pauseButton?.addEventListener('click', togglePause);
perturbButton?.addEventListener('click', perturbLab);
tourButton?.addEventListener('click', () => {
  tourActive = !tourActive;
  tourIndex = 0;
  tourNextAt = 0;
  tourButton.textContent = tourActive ? 'END TOUR' : 'BEGIN TOUR';
  if (tourActive) intro?.classList.add('is-hidden');
});

animate(performance.now());
