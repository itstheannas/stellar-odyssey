export const starVertexShader = `
attribute vec3 aPosition;
attribute vec3 aColor;
attribute float aScale;
attribute float aPhase;
uniform float uTime;
varying vec2 vUv;
varying vec3 vColor;
varying float vPulse;
void main() {
  vec4 viewPosition = viewMatrix * vec4(aPosition, 1.0);
  float pulse = 0.88 + sin(uTime * (0.35 + aPhase * 0.7) + aPhase * 31.0) * 0.12;
  float scale = max(1.0, -viewPosition.z * 0.00135) * aScale * pulse;
  viewPosition.xy += position.xy * scale;
  gl_Position = projectionMatrix * viewPosition;
  vUv = position.xy * 0.5 + 0.5;
  vColor = aColor;
  vPulse = pulse;
}
`;

export const starFragmentShader = `
varying vec2 vUv;
varying vec3 vColor;
varying float vPulse;
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p);
  float core = smoothstep(0.18, 0.0, r);
  float halo = smoothstep(0.55, 0.0, r) * 0.42;
  float alpha = core + halo;
  if (alpha < 0.008) discard;
  gl_FragColor = vec4(vColor * (1.0 + core * 1.8) * vPulse, alpha);
}
`;

export const nebulaVertexShader = `
attribute vec3 aPosition;
attribute vec3 aColor;
attribute float aScale;
attribute float aPhase;
uniform float uTime;
varying vec2 vUv;
varying vec3 vColor;
void main() {
  vec4 viewPosition = viewMatrix * vec4(aPosition, 1.0);
  float drift = sin(uTime * 0.08 + aPhase * 17.0) * 0.08;
  float scale = max(18.0, -viewPosition.z * 0.008) * aScale * (1.0 + drift);
  viewPosition.xy += position.xy * scale;
  gl_Position = projectionMatrix * viewPosition;
  vUv = position.xy * 0.5 + 0.5;
  vColor = aColor;
}
`;

export const nebulaFragmentShader = `
varying vec2 vUv;
varying vec3 vColor;
void main() {
  vec2 p = vUv - 0.5;
  float r = length(p);
  float soft = smoothstep(0.68, 0.06, r);
  float grain = sin((p.x + p.y) * 45.0) * 0.025 + 0.975;
  float alpha = soft * soft * 0.16 * grain;
  if (alpha < 0.002) discard;
  gl_FragColor = vec4(vColor, alpha);
}
`;

export const atmosphereVertexShader = `
varying vec3 vNormal;
varying vec3 vView;
void main() {
  vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
  vNormal = normalize(normalMatrix * normal);
  vView = normalize(-mvPosition.xyz);
  gl_Position = projectionMatrix * mvPosition;
}
`;

export const atmosphereFragmentShader = `
uniform vec3 uColor;
uniform float uIntensity;
varying vec3 vNormal;
varying vec3 vView;
void main() {
  float fresnel = pow(1.0 - max(dot(vNormal, vView), 0.0), 3.0);
  gl_FragColor = vec4(uColor * fresnel * uIntensity, fresnel * 0.72);
}
`;

export const diskVertexShader = `
uniform float uTime;
varying vec2 vUv;
varying float vRadius;
void main() {
  vUv = uv;
  vRadius = uv.y;
  vec3 p = position;
  p.z += sin(vRadius * 5.0 - uTime * 2.0) * 0.03;
  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
}
`;

export const diskFragmentShader = `
uniform float uTime;
uniform vec3 uInner;
uniform vec3 uOuter;
varying vec2 vUv;
varying float vRadius;
void main() {
  float band = sin(vRadius * 18.0 - uTime * 3.0 + atan(vUv.y - 0.5, vUv.x - 0.5) * 7.0) * 0.5 + 0.5;
  float inner = smoothstep(0.16, 0.34, vRadius);
  float outer = 1.0 - smoothstep(0.72, 0.98, vRadius);
  float alpha = inner * outer * (0.36 + band * 0.5);
  vec3 color = mix(uInner, uOuter, smoothstep(0.18, 0.9, vRadius));
  gl_FragColor = vec4(color * (1.1 + band), alpha);
}
`;
