import * as THREE from 'three';
import { KeplerOrbit, seededRandom } from './astronomy';
import {
  atmosphereFragmentShader,
  atmosphereVertexShader,
  diskFragmentShader,
  diskVertexShader,
  nebulaFragmentShader,
  nebulaVertexShader,
  starFragmentShader,
  starVertexShader,
} from './shaders';

export type AnimatedUniform = { value: number };

export type GalaxyStarfield = {
  mesh: THREE.Mesh<THREE.InstancedBufferGeometry, THREE.ShaderMaterial>;
  time: AnimatedUniform;
};

export type NebulaCloud = {
  group: THREE.Group;
  time: AnimatedUniform;
};

export type AccretionSystem = {
  group: THREE.Group;
  time: AnimatedUniform;
};

export type PlanetVisual = {
  root: THREE.LOD;
  atmosphere?: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  cloudLayer?: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial>;
};

export function createRadialTexture(stops: Array<[number, string]>): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable.');
  const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128);
  stops.forEach(([offset, color]) => gradient.addColorStop(offset, color));
  context.fillStyle = gradient;
  context.fillRect(0, 0, 256, 256);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createSurfaceTexture(seed: number, palette: string[], banded = false): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable.');
  const random = seededRandom(seed);
  const gradient = context.createLinearGradient(0, 0, 0, canvas.height);
  palette.forEach((color, index) => gradient.addColorStop(index / Math.max(1, palette.length - 1), color));
  context.fillStyle = gradient;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.globalCompositeOperation = 'screen';
  if (banded) {
    for (let y = 0; y < canvas.height; y += 2 + Math.floor(random() * 9)) {
      const height = 1 + Math.floor(random() * 16);
      context.fillStyle = `rgba(255,255,255,${0.025 + random() * 0.1})`;
      context.fillRect(0, y, canvas.width, height);
    }
  }
  context.globalCompositeOperation = 'overlay';
  for (let i = 0; i < 600; i += 1) {
    const size = 2 + random() * (banded ? 18 : 54);
    const x = random() * canvas.width;
    const y = random() * canvas.height;
    context.beginPath();
    context.ellipse(x, y, size, size * (0.3 + random() * 0.7), random() * Math.PI, 0, Math.PI * 2);
    context.fillStyle = random() > 0.55 ? 'rgba(0,0,0,0.11)' : 'rgba(255,255,255,0.12)';
    context.fill();
  }
  context.globalCompositeOperation = 'source-over';
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  texture.anisotropy = 8;
  return texture;
}

export function createRingTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 2;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context is unavailable.');
  const random = seededRandom(903);
  for (let x = 0; x < canvas.width; x += 1) {
    const shade = 120 + Math.floor(random() * 135);
    const alpha = x % 29 < 3 || x % 43 < 2 ? 0.2 : 0.82;
    context.fillStyle = `rgba(${shade},${shade - 18},${shade - 42},${alpha})`;
    context.fillRect(x, 0, 1, 2);
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

export function createGalaxyStarfield(seed: number, count: number, radius: number, center = new THREE.Vector3()): GalaxyStarfield {
  const random = seededRandom(seed);
  const base = new Float32Array([
    -1, -1, 0,
    1, -1, 0,
    1, 1, 0,
    -1, -1, 0,
    1, 1, 0,
    -1, 1, 0,
  ]);
  const positions = new Float32Array(count * 3);
  const colors = new Float32Array(count * 3);
  const scales = new Float32Array(count);
  const phases = new Float32Array(count);
  const warm = new THREE.Color('#ffd2a0');
  const cool = new THREE.Color('#9dc8ff');
  const core = new THREE.Color('#fff4d0');
  const tempColor = new THREE.Color();
  for (let i = 0; i < count; i += 1) {
    const arm = Math.floor(random() * 4);
    const radial = Math.pow(random(), 0.56) * radius;
    const angle = arm * (Math.PI * 0.5) + radial * 0.0007 + random() * 0.8 + (random() - 0.5) * (0.72 + radial / radius);
    const spread = (random() - 0.5) * (0.18 + radial * 0.000018);
    const x = Math.cos(angle + spread) * radial;
    const z = Math.sin(angle + spread) * radial;
    const thickness = (1 - radial / radius) * 1500 + 130;
    const y = (random() - 0.5) * thickness * (0.2 + random());
    const heat = Math.min(1, Math.max(0, 0.36 + random() * 0.76 - radial / radius * 0.35));
    tempColor.copy(warm).lerp(cool, heat);
    if (radial < radius * 0.16) tempColor.lerp(core, 0.65);
    positions[i * 3] = center.x + x;
    positions[i * 3 + 1] = center.y + y;
    positions[i * 3 + 2] = center.z + z;
    colors[i * 3] = tempColor.r;
    colors[i * 3 + 1] = tempColor.g;
    colors[i * 3 + 2] = tempColor.b;
    scales[i] = 0.38 + Math.pow(random(), 7) * 2.9 + (radial < radius * 0.14 ? 0.42 : 0);
    phases[i] = random();
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(base, 3));
  geometry.setAttribute('aPosition', new THREE.InstancedBufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(colors, 3));
  geometry.setAttribute('aScale', new THREE.InstancedBufferAttribute(scales, 1));
  geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  geometry.instanceCount = count;
  geometry.boundingSphere = new THREE.Sphere(center.clone(), radius * 1.22);
  const time = { value: 0 };
  const material = new THREE.ShaderMaterial({
    vertexShader: starVertexShader,
    fragmentShader: starFragmentShader,
    uniforms: { uTime: time },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
    vertexColors: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = true;
  mesh.renderOrder = -2;
  return { mesh, time };
}

export function createNebula(seed: number, center: THREE.Vector3, radius: number, colors: string[]): NebulaCloud {
  const random = seededRandom(seed);
  const count = 2_200;
  const base = new Float32Array([
    -1, -1, 0,
    1, -1, 0,
    1, 1, 0,
    -1, -1, 0,
    1, 1, 0,
    -1, 1, 0,
  ]);
  const positions = new Float32Array(count * 3);
  const palette = colors.map((color) => new THREE.Color(color));
  const particleColors = new Float32Array(count * 3);
  const scales = new Float32Array(count);
  const phases = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const theta = random() * Math.PI * 2;
    const radial = Math.pow(random(), 0.62) * radius;
    const squash = 0.45 + random() * 0.8;
    const x = Math.cos(theta) * radial;
    const z = Math.sin(theta) * radial * squash;
    const y = (random() - 0.5) * radius * 0.24;
    const color = palette[Math.floor(random() * palette.length)].clone().lerp(new THREE.Color('#ffffff'), random() * 0.2);
    positions[i * 3] = center.x + x;
    positions[i * 3 + 1] = center.y + y;
    positions[i * 3 + 2] = center.z + z;
    particleColors[i * 3] = color.r;
    particleColors[i * 3 + 1] = color.g;
    particleColors[i * 3 + 2] = color.b;
    scales[i] = 0.35 + Math.pow(random(), 1.4) * 1.85;
    phases[i] = random();
  }
  const geometry = new THREE.InstancedBufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(base, 3));
  geometry.setAttribute('aPosition', new THREE.InstancedBufferAttribute(positions, 3));
  geometry.setAttribute('aColor', new THREE.InstancedBufferAttribute(particleColors, 3));
  geometry.setAttribute('aScale', new THREE.InstancedBufferAttribute(scales, 1));
  geometry.setAttribute('aPhase', new THREE.InstancedBufferAttribute(phases, 1));
  geometry.instanceCount = count;
  geometry.boundingSphere = new THREE.Sphere(center.clone(), radius * 1.5);
  const time = { value: 0 };
  const material = new THREE.ShaderMaterial({
    vertexShader: nebulaVertexShader,
    fragmentShader: nebulaFragmentShader,
    uniforms: { uTime: time },
    transparent: true,
    depthWrite: false,
    depthTest: true,
    blending: THREE.AdditiveBlending,
  });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.frustumCulled = true;
  mesh.renderOrder = -1;
  const group = new THREE.Group();
  group.add(mesh);
  return { group, time };
}

export function createEmissiveStar(radius: number, color: string, coronaColor: string): THREE.Group {
  const group = new THREE.Group();
  const body = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 48, 32),
    new THREE.MeshBasicMaterial({ color, toneMapped: false }),
  );
  const glowTexture = createRadialTexture([
    [0, 'rgba(255,255,255,1)'],
    [0.14, 'rgba(255,240,204,0.95)'],
    [0.44, coronaColor],
    [1, 'rgba(0,0,0,0)'],
  ]);
  const corona = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color: coronaColor,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  }));
  corona.scale.setScalar(radius * 8);
  const coronaWide = new THREE.Sprite(new THREE.SpriteMaterial({
    map: glowTexture,
    color: coronaColor,
    opacity: 0.28,
    blending: THREE.AdditiveBlending,
    transparent: true,
    depthWrite: false,
    toneMapped: false,
  }));
  coronaWide.scale.setScalar(radius * 18);
  group.add(coronaWide, corona, body);
  return group;
}

export function createPlanetVisual(options: {
  radius: number;
  seed: number;
  palette: string[];
  banded?: boolean;
  roughness?: number;
  metalness?: number;
  atmosphere?: { color: string; intensity: number; scale?: number };
  clouds?: string;
  rings?: { inner: number; outer: number; tilt: number };
}): PlanetVisual {
  const texture = createSurfaceTexture(options.seed, options.palette, options.banded);
  const material = new THREE.MeshStandardMaterial({
    map: texture,
    roughness: options.roughness ?? 0.86,
    metalness: options.metalness ?? 0.02,
    emissive: new THREE.Color(options.palette[0]),
    emissiveIntensity: options.banded ? 0.045 : 0.012,
  });
  const lod = new THREE.LOD();
  const high = new THREE.Mesh(new THREE.SphereGeometry(options.radius, 64, 48), material);
  const medium = new THREE.Mesh(new THREE.SphereGeometry(options.radius, 36, 24), material);
  const low = new THREE.Mesh(new THREE.SphereGeometry(options.radius, 18, 12), material);
  high.frustumCulled = true;
  medium.frustumCulled = true;
  low.frustumCulled = true;
  lod.addLevel(high, 0);
  lod.addLevel(medium, options.radius * 120);
  lod.addLevel(low, options.radius * 460);
  let atmosphere: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial> | undefined;
  if (options.atmosphere) {
    atmosphere = new THREE.Mesh(
      new THREE.SphereGeometry(options.radius * (options.atmosphere.scale ?? 1.06), 48, 32),
      new THREE.ShaderMaterial({
        vertexShader: atmosphereVertexShader,
        fragmentShader: atmosphereFragmentShader,
        uniforms: {
          uColor: { value: new THREE.Color(options.atmosphere.color) },
          uIntensity: { value: options.atmosphere.intensity },
        },
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        side: THREE.BackSide,
      }),
    );
    lod.add(atmosphere);
  }
  let cloudLayer: THREE.Mesh<THREE.SphereGeometry, THREE.MeshBasicMaterial> | undefined;
  if (options.clouds) {
    const cloudTexture = createSurfaceTexture(options.seed + 99, [options.clouds, '#ffffff', options.clouds], true);
    cloudLayer = new THREE.Mesh(
      new THREE.SphereGeometry(options.radius * 1.015, 48, 32),
      new THREE.MeshBasicMaterial({ map: cloudTexture, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    lod.add(cloudLayer);
  }
  if (options.rings) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(options.rings.inner, options.rings.outer, 192, 1),
      new THREE.MeshBasicMaterial({
        map: createRingTexture(),
        transparent: true,
        opacity: 0.72,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    );
    ring.rotation.x = Math.PI / 2 + options.rings.tilt;
    ring.rotation.z = options.rings.tilt * 0.35;
    lod.add(ring);
  }
  return { root: lod, atmosphere, cloudLayer };
}

export function createOrbitLine(orbit: KeplerOrbit, color: string, opacity = 0.23): THREE.Line {
  const samples = 256;
  const positions = new Float32Array((samples + 1) * 3);
  for (let i = 0; i <= samples; i += 1) {
    const point = orbit.update((i / samples) * orbit.periodDays).clone();
    positions[i * 3] = point.x;
    positions[i * 3 + 1] = point.y;
    positions[i * 3 + 2] = point.z;
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const line = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity, blending: THREE.AdditiveBlending, depthWrite: false }));
  line.frustumCulled = true;
  return line;
}

export function createAsteroidBelt(seed: number, innerRadius: number, outerRadius: number, count: number): THREE.InstancedMesh {
  const random = seededRandom(seed);
  const geometry = new THREE.DodecahedronGeometry(0.5, 0);
  const material = new THREE.MeshStandardMaterial({ color: '#514a50', roughness: 1, metalness: 0.04 });
  const belt = new THREE.InstancedMesh(geometry, material, count);
  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Euler();
  const scale = new THREE.Vector3();
  const color = new THREE.Color();
  for (let i = 0; i < count; i += 1) {
    const angle = random() * Math.PI * 2;
    const radius = innerRadius + Math.pow(random(), 0.7) * (outerRadius - innerRadius);
    position.set(Math.cos(angle) * radius, (random() - 0.5) * 5.4, Math.sin(angle) * radius);
    rotation.set(random() * Math.PI, random() * Math.PI, random() * Math.PI);
    const size = 0.18 + Math.pow(random(), 3) * 1.9;
    scale.set(size, size * (0.7 + random() * 0.7), size * (0.7 + random() * 0.7));
    matrix.compose(position, new THREE.Quaternion().setFromEuler(rotation), scale);
    belt.setMatrixAt(i, matrix);
    color.setHSL(0.04 + random() * 0.06, 0.13 + random() * 0.15, 0.2 + random() * 0.22);
    belt.setColorAt(i, color);
  }
  belt.instanceMatrix.needsUpdate = true;
  if (belt.instanceColor) belt.instanceColor.needsUpdate = true;
  belt.computeBoundingSphere();
  belt.frustumCulled = true;
  return belt;
}

export function createAccretionSystem(options: { radius: number; inner: string; outer: string; jet?: string }): AccretionSystem {
  const group = new THREE.Group();
  const core = new THREE.Mesh(
    new THREE.SphereGeometry(options.radius * 0.7, 48, 32),
    new THREE.MeshBasicMaterial({ color: '#000000', toneMapped: false }),
  );
  const time = { value: 0 };
  const diskMaterial = new THREE.ShaderMaterial({
    vertexShader: diskVertexShader,
    fragmentShader: diskFragmentShader,
    uniforms: {
      uTime: time,
      uInner: { value: new THREE.Color(options.inner) },
      uOuter: { value: new THREE.Color(options.outer) },
    },
    transparent: true,
    depthWrite: false,
    side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending,
  });
  const disk = new THREE.Mesh(new THREE.RingGeometry(options.radius * 1.05, options.radius * 5.9, 192, 1), diskMaterial);
  disk.rotation.x = Math.PI / 2 + 0.25;
  const lensMaterial = new THREE.MeshBasicMaterial({ color: '#ffd6a1', transparent: true, opacity: 0.26, blending: THREE.AdditiveBlending, depthWrite: false });
  const lensA = new THREE.Mesh(new THREE.TorusGeometry(options.radius * 1.15, options.radius * 0.08, 8, 128), lensMaterial);
  lensA.rotation.set(Math.PI / 2 + 0.34, 0.24, -0.18);
  const lensB = new THREE.Mesh(new THREE.TorusGeometry(options.radius * 1.42, options.radius * 0.025, 6, 128, Math.PI * 1.35), lensMaterial.clone());
  lensB.rotation.set(Math.PI / 2 - 0.28, -0.3, 0.5);
  group.add(disk, lensA, lensB, core);
  if (options.jet) {
    const jetMaterial = new THREE.MeshBasicMaterial({ color: options.jet, transparent: true, opacity: 0.58, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const topJet = new THREE.Mesh(new THREE.ConeGeometry(options.radius * 0.42, options.radius * 13, 16, 1, true), jetMaterial);
    topJet.position.y = options.radius * 6.5;
    const bottomJet = topJet.clone();
    bottomJet.rotation.z = Math.PI;
    bottomJet.position.y = -options.radius * 6.5;
    group.add(topJet, bottomJet);
  }
  return { group, time };
}

export function createCometVisual(color = '#bce9ff'): { group: THREE.Group; tail: THREE.Line; head: THREE.Mesh } {
  const group = new THREE.Group();
  const head = new THREE.Mesh(new THREE.SphereGeometry(1.35, 20, 16), new THREE.MeshBasicMaterial({ color, toneMapped: false }));
  const tailPoints = new Float32Array(72 * 3);
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(tailPoints, 3));
  const tail = new THREE.Line(geometry, new THREE.LineBasicMaterial({ color, transparent: true, opacity: 0.84, blending: THREE.AdditiveBlending, depthWrite: false }));
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: createRadialTexture([[0, 'rgba(255,255,255,1)'], [0.3, 'rgba(160,220,255,0.72)'], [1, 'rgba(0,0,0,0)']]), color, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  glow.scale.setScalar(19);
  group.add(tail, glow, head);
  return { group, tail, head };
}
