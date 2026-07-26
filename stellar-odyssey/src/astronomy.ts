import * as THREE from 'three';

export const AU_SCENE = 34;
export const LIGHT_YEAR_AU = 63_241.077;
export const SOLAR_MU_AU_DAY = 0.0002959122082855911;

export type ObjectKind = 'star' | 'planet' | 'moon' | 'black-hole' | 'nebula' | 'comet' | 'belt' | 'anomaly';

export type CelestialMeta = {
  id: string;
  name: string;
  kind: ObjectKind;
  subtitle: string;
  mass: string;
  radius: string;
  temperature: string;
  period?: string;
  description: string;
  accent: string;
};

export type OrbitalSpec = {
  semimajorAU: number;
  eccentricity: number;
  inclination: number;
  longitude: number;
  argument: number;
  meanAnomaly: number;
  periodDays?: number;
};

export class KeplerOrbit {
  readonly spec: OrbitalSpec;
  readonly position = new THREE.Vector3();
  readonly periapsisAU: number;
  readonly apoapsisAU: number;
  readonly periodDays: number;
  private readonly meanMotion: number;

  constructor(spec: OrbitalSpec) {
    this.spec = spec;
    this.periodDays = spec.periodDays ?? (Math.PI * 2 * Math.sqrt(Math.pow(spec.semimajorAU, 3) / SOLAR_MU_AU_DAY));
    this.meanMotion = (Math.PI * 2) / this.periodDays;
    this.periapsisAU = spec.semimajorAU * (1 - spec.eccentricity);
    this.apoapsisAU = spec.semimajorAU * (1 + spec.eccentricity);
  }

  update(timeDays: number, scale = AU_SCENE): THREE.Vector3 {
    const meanAnomaly = normalizeAngle(this.spec.meanAnomaly + timeDays * this.meanMotion);
    const eccentricAnomaly = solveKepler(meanAnomaly, this.spec.eccentricity);
    const e = this.spec.eccentricity;
    const a = this.spec.semimajorAU;
    const x = a * (Math.cos(eccentricAnomaly) - e);
    const z = a * Math.sqrt(1 - e * e) * Math.sin(eccentricAnomaly);
    const cosO = Math.cos(this.spec.longitude);
    const sinO = Math.sin(this.spec.longitude);
    const cosI = Math.cos(this.spec.inclination);
    const sinI = Math.sin(this.spec.inclination);
    const cosW = Math.cos(this.spec.argument);
    const sinW = Math.sin(this.spec.argument);
    const px = (cosO * cosW - sinO * sinW * cosI) * x + (-cosO * sinW - sinO * cosW * cosI) * z;
    const py = (sinW * sinI) * x + (cosW * sinI) * z;
    const pz = (sinO * cosW + cosO * sinW * cosI) * x + (-sinO * sinW + cosO * cosW * cosI) * z;
    return this.position.set(px * scale, py * scale, pz * scale);
  }
}

export function solveKepler(meanAnomaly: number, eccentricity: number): number {
  let eccentricAnomaly = eccentricity < 0.8 ? meanAnomaly : Math.PI;
  for (let i = 0; i < 8; i += 1) {
    const delta = (eccentricAnomaly - eccentricity * Math.sin(eccentricAnomaly) - meanAnomaly) / (1 - eccentricity * Math.cos(eccentricAnomaly));
    eccentricAnomaly -= delta;
    if (Math.abs(delta) < 1e-8) break;
  }
  return eccentricAnomaly;
}

export function normalizeAngle(value: number): number {
  const full = Math.PI * 2;
  return ((value % full) + full) % full;
}

export function formatDistance(sceneUnits: number): string {
  const au = sceneUnits / AU_SCENE;
  if (au < 0.01) return `${Math.max(1, Math.round(au * 149_597_870.7)).toLocaleString()} km`;
  if (au < 1_000) return `${au.toFixed(au < 10 ? 2 : 0)} AU`;
  const ly = au / LIGHT_YEAR_AU;
  if (ly < 0.1) return `${(au / 1_000).toFixed(1)} kAU`;
  return `${ly.toFixed(ly < 10 ? 2 : 0)} ly`;
}

export function formatSimulationDate(days: number): string {
  const start = Date.UTC(2247, 3, 18);
  const date = new Date(start + days * 86_400_000);
  return date.toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

export function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state += 0x6d2b79f5;
    let value = state;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4_294_967_296;
  };
}
