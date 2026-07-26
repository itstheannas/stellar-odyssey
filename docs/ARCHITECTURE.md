# Stellar Odyssey — architecture notes

## Experience design

The experience is built as one continuous coordinate space. The galaxy, its nebulae, the Aurelis system, and the planets are all present at once. Camera travel is a smooth eased movement through that shared space; the jump controls only choose cinematic focus targets.

The macro galaxy uses a compressed navigational scale so the camera can move from a galactic panorama to a system orbit in a practical browser session. Local orbital simulation remains expressed in astronomical units and days.

## Rendering

The galaxy is a single instanced billboard draw with 56,000 temperature-coloured stars. The two nebulae are additive instanced billboards. The asteroid belt is an `InstancedMesh` of 2,500 rocky fragments. Individual planets are `THREE.LOD` objects with high, medium, and low sphere levels, and ordinary Three.js frustum culling stays enabled for all renderable objects.

Bloom is implemented using `EffectComposer`, `RenderPass`, `UnrealBloomPass`, and `OutputPass`. Tone mapping uses ACES filmic output. Bright objects use emissive or additive materials so bloom represents light rather than a flat colour treatment.

No external scene assets are required. Planet surfaces, cloud layers, rings, radial glows, and particle appearance are generated procedurally at runtime.

## Motion and simulation

Planet and comet positions are solved from elliptical Kepler orbits. The solver advances mean anomaly in simulation days, solves Kepler’s equation iteratively, and produces lower velocity at apoapsis and higher velocity at periapsis. Orbital periods are derived from the solar gravitational parameter unless a local moon period is supplied.

The perturb lab maintains ten small particles in AU-space. Every update combines the central Newtonian inverse-square acceleration with a deliberately small mutual gravitational contribution. The control applies a tangential velocity impulse so the user can visibly disturb the cluster.

The time controls range from `1×` to `1,000,000×`. One display speed unit advances an intentionally cinematic base rate of 0.0005 simulation days per real second, ensuring the lowest speed remains calm while high speeds make long orbital eras observable.

## Interaction model

`OrbitControls` provides damping, orbit, pan, wheel/touch traversal, and a continuous distance range. Each named landmark is assigned a focus root, metadata, and a context-sensitive camera distance. Picking a landmark opens its data panel and begins a smooth camera transition. The guided tour reuses the same focus system.

Keyboard navigation: `1` galactic core, `2` Aurelis system, `3` Nerida, `4` Nocturne X-1, and `Space` to pause or resume time.

## Local development

```bash
npm install
npm run dev
```

For a production bundle:

```bash
npm run build
npm run preview
```
