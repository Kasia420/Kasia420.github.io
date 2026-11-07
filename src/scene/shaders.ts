/**
 * GLSL for the night field. Every surface shares the same light: a soft pool
 * in screen space (the flashlight), the camera flash, fog into the night
 * colour with a faint glow along the horizon, and film grain. Colours are
 * written as sRGB and output unchanged, to match the CSS tokens.
 */

export const POOL = /* glsl */ `
uniform vec2 uLightPx;
uniform float uR;
uniform float uFlash;
uniform float uHorizon;
uniform float uSpan;
uniform float uGrainT;
const vec3 NIGHT = vec3(0.0392, 0.0353, 0.0275);
// the flashlight: a soft round pool in screen space (squashed a little vertically)
float pool() {
  vec2 d = (gl_FragCoord.xy - uLightPx) * vec2(1.0, 1.25);
  return pow(max(0.0, 1.0 - length(d) / uR), 1.6);
}
// the night, with a faint straw glow along the horizon (as in the first design)
vec3 nightAt() {
  float t = 1.0 - smoothstep(0.0, uSpan, abs(gl_FragCoord.y - uHorizon));
  return NIGHT + vec3(0.788, 0.678, 0.416) * t * t * (0.03 + uFlash * 0.15);
}
// film grain, drawn here rather than as a CSS overlay (blending over a moving canvas is costly)
float grain() { return fract(sin(dot(gl_FragCoord.xy + uGrainT, vec2(12.9898, 78.233))) * 43758.5453) - 0.5; }
vec3 fogged(vec3 c, float f) {
  vec3 o = mix(nightAt(), c, f);
  float g = grain();
  return max(o * (1.0 + g * 0.18) + g * 0.014, 0.0);
}`

export const NOISE = /* glsl */ `
float hash13(vec3 p) {
  p = fract(p * 0.1031);
  p += dot(p, p.zyx + 31.32);
  return fract((p.x + p.y) * p.z);
}
float vnoise(vec3 x) {
  vec3 i = floor(x);
  vec3 f = fract(x);
  f = f * f * (3.0 - 2.0 * f);
  float a = hash13(i);
  float b = hash13(i + vec3(1.0, 0.0, 0.0));
  float c = hash13(i + vec3(0.0, 1.0, 0.0));
  float d = hash13(i + vec3(1.0, 1.0, 0.0));
  float e = hash13(i + vec3(0.0, 0.0, 1.0));
  float g = hash13(i + vec3(1.0, 0.0, 1.0));
  float h = hash13(i + vec3(0.0, 1.0, 1.0));
  float k = hash13(i + vec3(1.0, 1.0, 1.0));
  return mix(mix(mix(a, b, f.x), mix(c, d, f.x), f.y), mix(mix(e, g, f.x), mix(h, k, f.x), f.y), f.z);
}
float fbm(vec3 p) {
  return 0.55 * vnoise(p) + 0.3 * vnoise(p * 2.03 + 11.0) + 0.15 * vnoise(p * 4.07 + 23.0);
}`

/** The bank at the end of the walk: a ragged line across the field, water beyond it. */
export const SHORE = /* glsl */ `
uniform vec2 uShore; // z of the shore, on/off
float shoreAt(float x) { return uShore.x + sin(x * 0.37) * 1.3 + sin(x * 1.13 + 1.7) * 0.5; }`

export const GRASS_VERT = /* glsl */ `
${SHORE}
attribute vec3 aOffset;
attribute float aHeight;
attribute float aTone;
attribute float aPhase;
attribute float aHead;
uniform float uTime;
uniform float uCamZ;
uniform float uTile;
uniform float uWidth;
uniform vec4 uReed; // reeds behind the fence: z where they begin, z where they end, x beyond which they grow, on/off
uniform vec4 uYard; // tall dry grass round the farmhouse: the same, but growing where x is below the edge
uniform vec3 uClear; // trodden clearings: x, z, radius (round the table, and round the laundry)
uniform vec3 uClear2;
uniform vec3 uPath; // the path through the corn: z where it begins, z where it ends, half its width
varying float vH;
varying float vTone;
varying float vDist;
varying float vHead;
varying float vEdge;
varying float vReed;
void main() {
  float h = position.y;
  vec3 base = aOffset;
  float back = mod(uCamZ + 4.0 - aOffset.z, uTile);
  base.z = uCamZ + 4.0 - back;
  vEdge = 1.0 - smoothstep(uTile - 14.0, uTile - 3.0, back); // fade in at the far edge instead of popping
  // tall reeds behind the fence
  float inZ = (1.0 - smoothstep(uReed.x - 6.0, uReed.x, base.z)) * smoothstep(uReed.y, uReed.y + 6.0, base.z);
  float reed = inZ * smoothstep(uReed.z, uReed.z + 0.5, base.x) * uReed.w;
  float inYard = (1.0 - smoothstep(uYard.x - 6.0, uYard.x, base.z)) * smoothstep(uYard.y, uYard.y + 6.0, base.z);
  float yard = inYard * (1.0 - smoothstep(uYard.z - 0.8, uYard.z, base.x)) * uYard.w;
  // the stalks part around the viewer
  vec2 away = base.xz - cameraPosition.xz;
  float part = smoothstep(0.6, 1.9, length(away));
  // each stalk's own sway plus a slow wave rolling across the field
  float sway = sin(uTime * 1.1 + aPhase + base.x * 0.21) * (0.08 + 0.12 * fract(aPhase * 7.31))
             + sin(uTime * 0.37 + base.x * 0.09 + base.z * 0.06) * 0.08;
  // the marsh: no grass in the water (a few reeds stand in it), a band of reeds along the bank
  float sz = shoreAt(base.x);
  float wet = step(base.z, sz) * uShore.y;
  float bank = (1.0 - smoothstep(sz, sz + 1.0, base.z)) * (1.0 - wet) * uShore.y;
  float standing = step(fract(aPhase * 9.13), 0.06);
  float marsh = max(bank, wet * standing);
  float trodden = (1.0 - smoothstep(sz + 1.0, sz + 7.0, base.z)) * (1.0 - bank) * (1.0 - wet) * uShore.y; // a muddy bank, grass short
  float tall = aHeight * (1.0 + reed * (0.75 + 0.6 * fract(aPhase * 3.3)) + yard * (0.35 + 0.4 * fract(aPhase * 5.7)) + marsh * (0.1 + 0.35 * fract(aPhase * 2.9)))
             * (1.0 - wet * (1.0 - standing)) * (1.0 - 0.6 * trodden) * mix(0.45, 1.0, part)
             * (1.0 - 0.7 * (1.0 - smoothstep(uClear.z * 0.55, uClear.z, length(base.xz - uClear.xy))))
             * (1.0 - 0.7 * (1.0 - smoothstep(uClear2.z * 0.55, uClear2.z, length(base.xz - uClear2.xy))))
             * (1.0 - (1.0 - smoothstep(uPath.x - 3.0, uPath.x, base.z)) * smoothstep(uPath.y, uPath.y + 3.0, base.z)
                    * mix(0.5, 0.78, 1.0 - smoothstep(uPath.z * 0.7, uPath.z, abs(base.x - cameraPosition.x))));
  vec3 p = base + vec3(0.0, h * tall, 0.0);
  p.x += sway * tall * h * h;
  p.xz += normalize(away + 1e-4) * (1.0 - part) * h * h * 0.8;
  // a ribbon that always faces the viewer, never thinner than about a pixel
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  float dist = distance(base, cameraPosition);
  float taper = 1.0 - 0.8 * h;
  float bulge = aHead * smoothstep(0.84, 0.92, h) * (1.0 - smoothstep(0.93, 1.0, h)) * 2.6;
  p += right * position.x * uWidth * (1.0 + 0.5 * reed) * max(1.0, dist / 7.0) * (taper + bulge);
  vH = h;
  vTone = aTone;
  vDist = dist;
  vHead = aHead;
  vReed = max(max(reed, yard), marsh);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`

export const GRASS_FRAG = /* glsl */ `
${POOL}
uniform vec3 uLo;
uniform vec3 uHi;
uniform vec3 uReedLo;
uniform vec3 uReedHi;
uniform vec3 uPaper;
uniform float uFog;
varying float vH;
varying float vTone;
varying float vDist;
varying float vHead;
varying float vEdge;
varying float vReed;
void main() {
  float near = 1.0 - clamp(vDist / 26.0, 0.0, 1.0);
  float lit = pool() * (0.75 + 0.25 * near);
  float b = min(1.3, 0.065 + lit * 1.15 + uFlash * (0.75 + 0.45 * near));
  vec3 base = mix(uLo, uHi, vTone) * (0.62 + 0.38 * vH);
  base = mix(base, uHi, vHead * smoothstep(0.84, 0.95, vH) * 0.4); // paler seed heads
  base = mix(base, mix(uReedLo, uReedHi, vTone) * (0.55 + 0.45 * vH), vReed); // warmer, rust-brown reeds
  vec3 c = base * b;
  c = mix(c, uPaper, clamp((b - 0.9) * 2.2, 0.0, 1.0)); // overexposed toward paper white
  gl_FragColor = vec4(fogged(c, exp(-uFog * vDist) * vEdge), 1.0);
}`

export const SURFACE_VERT = /* glsl */ `
varying vec3 vWorld;
varying vec2 vUv;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vUv = uv;
  gl_Position = projectionMatrix * viewMatrix * w;
}`

export const GROUND_FRAG = /* glsl */ `
${POOL}
${SHORE}
uniform vec3 uSoil;
uniform vec3 uStraw;
uniform float uFog;
varying vec3 vWorld;
void main() {
  if (uShore.y > 0.5 && vWorld.z < shoreAt(vWorld.x) - 0.25) discard; // the water takes over
  float d = distance(vWorld, cameraPosition);
  vec3 c = uSoil * 0.35 + uStraw * (0.12 * pool() + 0.22 * uFlash);
  gl_FragColor = vec4(fogged(c, exp(-uFog * d)), 1.0);
}`

export const SKY_VERT = /* glsl */ `
void main() { gl_Position = vec4(position.xy, 0.999, 1.0); }`

export const SKY_FRAG = /* glsl */ `
${POOL}
void main() { gl_FragColor = vec4(fogged(NIGHT, 0.0), 1.0); }`

export const STRUCT_VERT = /* glsl */ `
attribute float aMat;
varying vec3 vWorld;
varying vec3 vObj;
varying vec3 vN;
varying float vMat;
void main() {
  vec4 w = modelMatrix * vec4(position, 1.0);
  vWorld = w.xyz;
  vObj = position;
  vN = normalize(mat3(modelMatrix) * normal);
  vMat = aMat;
  gl_Position = projectionMatrix * viewMatrix * w;
}`

/**
 * Surfaces of everything built in the field:
 * 0 whitewashed clapboard, 1 dark shingles, 2 black openings,
 * 3 bare weathered wood, 4 bark, 5 rusted iron, 6 old brick,
 * 7 rough stone under falling lime plaster, 8 clapboard weathered almost bare, 9 paper.
 */
export const STRUCT_FRAG = /* glsl */ `
${POOL}
${NOISE}
uniform float uReveal;
uniform float uFlood;
uniform vec3 uFloodDir;
uniform vec3 uPaper;
uniform vec3 uPaint; // the paint: white on the chapel, warm cream on the farm
uniform vec3 uBare; // the wood under it
uniform vec3 uRoof;
uniform float uDim; // 1, or less for the reflection in the water
uniform float uFog;
varying vec3 vWorld;
varying vec3 vObj;
varying vec3 vN;
varying float vMat;
void main() {
  vec3 N = normalize(vN);
  vec3 col;
  float paint = 0.0;
  int m = int(vMat + 0.5);
  if (m == 0 || m == 8) {
    // clapboard: boards a hand wide, each a slightly different white, a shadow under each lap
    float by = vObj.y * 5.3;
    float lap = 0.72 + 0.28 * smoothstep(0.0, 0.14, fract(by));
    float tone = 0.9 + 0.1 * hash13(vec3(floor(by), floor((vObj.x + vObj.z) * 0.8), 7.0));
    // the paint comes away in small ragged flakes, worst near the ground and under the eaves
    float worn = 0.13 * (1.0 - smoothstep(0.0, 1.3, vObj.y)) + 0.08 * smoothstep(2.0, 2.7, vObj.y);
    float flake = fbm(vObj * vec3(4.2, 9.0, 4.2) + 3.1);
    float peel = smoothstep(0.645 - worn, 0.68 - worn, flake);
    if (m == 8) peel = 1.0 - 0.75 * smoothstep(0.7, 0.78, flake); // the paint almost all gone, a few patches left
    vec3 wood = uBare * (0.8 + 0.3 * vnoise(vec3((vObj.x + vObj.z) * 30.0, vObj.y * 2.0, 0.0)));
    col = mix(uPaint * tone, wood, peel);
    // grime running down, dirt splashed up from the ground
    float streak = vnoise(vec3((vObj.x + vObj.z) * 9.0, vObj.y * 0.35, 3.0));
    col *= lap * (1.0 - 0.3 * smoothstep(0.45, 0.8, streak)) * mix(0.45, 1.0, smoothstep(0.0, 0.7, vObj.y));
    paint = 1.0 - peel;
  } else if (m == 1) {
    // shingles in rows, some lighter, some missing
    float row = floor(vObj.y * 8.0);
    float sh = hash13(vec3(floor((vObj.x + vObj.z) * 4.0 + row * 0.5), row, 3.0));
    col = uRoof * (0.6 + 0.55 * sh) * (0.8 + 0.2 * smoothstep(0.0, 0.15, fract(vObj.y * 8.0)));
    col *= 0.85 + 0.3 * fbm(vObj * 3.0);
  } else if (m == 2) {
    col = vec3(0.025, 0.022, 0.018);
  } else if (m == 3) {
    // silvered old wood, streaked along the grain
    float g = 0.5 * fbm(vObj * vec3(7.0, 1.4, 7.0)) + 0.5 * fbm(vObj * vec3(7.0, 7.0, 1.4));
    col = vec3(0.44, 0.41, 0.36) * (0.62 + 0.5 * g) * (0.9 + 0.1 * vnoise(vObj * vec3(40.0, 3.0, 40.0)));
    paint = 0.4;
  } else if (m == 4) {
    // bark: pale and dry, almost white in a flash, furrowed up and down the trunk
    float furrow = vnoise(vec3((vObj.x + vObj.z) * 9.0 + N.x * 3.0, vObj.y * 0.9, N.z * 3.0));
    col = vec3(0.48, 0.44, 0.39) * (0.62 + 0.5 * fbm(vObj * 9.0)) * (0.7 + 0.45 * furrow);
    paint = 0.7;
  } else if (m == 5) {
    // rusted iron, darker where it has flaked
    col = mix(vec3(0.38, 0.18, 0.085), vec3(0.15, 0.085, 0.05), smoothstep(0.4, 0.72, fbm(vObj * 12.0)));
  } else if (m == 6) {
    // old brick: courses offset row by row, pale mortar, soot toward the top
    vec2 b = vec2((vObj.x + vObj.z) * 4.6, vObj.y * 13.0);
    b.x += 0.5 * mod(floor(b.y), 2.0);
    vec2 f = fract(b);
    float mortar = 1.0 - smoothstep(0.02, 0.07, min(f.x, 1.0 - f.x)) * smoothstep(0.03, 0.1, min(f.y, 1.0 - f.y));
    vec3 brick = vec3(0.46, 0.2, 0.13) * (0.72 + 0.42 * hash13(vec3(floor(b), 9.0))) * (0.85 + 0.3 * fbm(vObj * 5.0));
    col = mix(brick, vec3(0.42, 0.39, 0.34), mortar) * mix(1.0, 0.55, smoothstep(6.5, 7.8, vObj.y));
    col = mix(col, vec3(0.6, 0.6, 0.5), smoothstep(0.52, 0.68, fbm(vObj * 1.8 + 5.0)) * 0.75); // old lime-wash
    col = mix(col, vec3(0.3, 0.34, 0.2), smoothstep(0.6, 0.76, fbm(vObj * 3.0 + 9.0)) * 0.5); // moss
    paint = 0.2;
  } else if (m == 7) {
    // rough stone in uneven courses, under lime plaster that has fallen away in patches, damp streaks
    vec2 bl = vec2((vObj.x + vObj.z) * 2.4, vObj.y * 3.2);
    bl.x += 0.5 * mod(floor(bl.y), 2.0) + 0.3 * hash13(vec3(floor(bl.y), 1.0, 2.0));
    vec2 f = fract(bl);
    float joint = 1.0 - smoothstep(0.03, 0.09, min(f.x, 1.0 - f.x)) * smoothstep(0.04, 0.12, min(f.y, 1.0 - f.y));
    vec3 stone = vec3(0.42, 0.38, 0.32) * (0.7 + 0.45 * hash13(vec3(floor(bl), 4.0))) * (0.8 + 0.3 * fbm(vObj * 6.0));
    stone = mix(stone, vec3(0.2, 0.18, 0.15), joint);
    float plaster = smoothstep(0.42, 0.5, fbm(vObj * vec3(2.2, 2.6, 2.2) + 2.0));
    col = mix(stone, vec3(0.74, 0.7, 0.62) * (0.85 + 0.2 * fbm(vObj * 11.0)), plaster);
    col *= 1.0 - 0.35 * smoothstep(0.55, 0.85, vnoise(vec3((vObj.x + vObj.z) * 7.0, vObj.y * 0.5, 2.0)));
    paint = plaster * 0.6;
  } else {
    // paper
    col = vec3(0.84, 0.8, 0.7) * (0.9 + 0.1 * fbm(vObj * 30.0));
    paint = 1.0;
  }
  float d = distance(vWorld, cameraPosition);
  vec3 V = normalize(cameraPosition - vWorld);
  float flood = uFlood * (0.3 + 0.7 * max(dot(N, uFloodDir), 0.0));
  float facing = 0.4 + 0.6 * max(dot(N, V), 0.0);
  float torch = pool() * 0.9 * facing / (1.0 + 0.0006 * d * d);
  float fl = uFlash * 1.6 * facing / (1.0 + 0.0008 * d * d);
  float light = (flood + torch + fl) * uReveal;
  vec3 c = col * (0.015 + light);
  c = mix(c, uPaper, clamp((light - 1.2) * 0.6, 0.0, 1.0) * paint) * uDim;
  gl_FragColor = vec4(fogged(c, exp(-uFog * d)), 1.0);
}`

/** A painted tin plaque: its own texture, lit only by the flashlight and the flash. */
export const PLAQUE_FRAG = /* glsl */ `
${POOL}
uniform sampler2D uMap;
uniform float uReveal;
uniform float uFog;
varying vec3 vWorld;
varying vec2 vUv;
void main() {
  vec3 c = texture2D(uMap, vUv).rgb;
  float d = distance(vWorld, cameraPosition);
  float light = (0.02 + pool() * 1.15 / (1.0 + 0.0006 * d * d) + uFlash * 1.4 / (1.0 + 0.0008 * d * d)) * uReveal;
  gl_FragColor = vec4(fogged(c * light, exp(-uFog * d)), 1.0);
}`

/** Still black water: slow ripples, the flashlight glinting on it; what stands in it shows through as a reflection. */
export const WATER_FRAG = /* glsl */ `
${POOL}
${NOISE}
${SHORE}
uniform float uTime;
uniform float uReveal;
varying vec3 vWorld;
void main() {
  if (vWorld.z > shoreAt(vWorld.x) + 0.15) discard;
  float d = distance(vWorld, cameraPosition);
  vec2 p = vWorld.xz;
  float rip = 0.6 * vnoise(vec3(p * 1.6, uTime * 0.22)) + 0.4 * vnoise(vec3(p * 4.1 + 7.0, uTime * 0.37));
  float lit = pool();
  float glint = smoothstep(0.66, 0.92, rip) * lit;
  vec3 c = vec3(0.016, 0.018, 0.016) + vec3(0.79, 0.68, 0.42) * (lit * 0.05 + glint * 0.32 + uFlash * 0.1) * uReveal;
  gl_FragColor = vec4(fogged(c, exp(-0.03 * d)), mix(1.0, 0.7, uReveal));
}`

/** Strands of moss hanging from the branches, swaying; ribbons that face the viewer. */
export const MOSS_VERT = /* glsl */ `
attribute vec3 aHook;
attribute float aLen;
attribute float aPhase;
attribute float aTone;
uniform float uTime;
uniform float uWidth;
varying float vH;
varying float vTone;
varying float vDist;
void main() {
  float h = position.y; // 0 at the branch, 1 at the tip
  vec3 local = aHook + vec3(0.0, -h * aLen, 0.0);
  float sw = sin(uTime * 0.7 + aPhase) * 0.5 + sin(uTime * 1.9 + aPhase * 2.3) * 0.2;
  local.x += sw * 0.18 * h * h * aLen;
  local.z += cos(uTime * 0.6 + aPhase) * 0.1 * h * h * aLen;
  vec4 world = modelMatrix * vec4(local, 1.0);
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  float dist = distance(world.xyz, cameraPosition);
  world.xyz += right * position.x * uWidth * (1.0 - 0.75 * h) * (0.6 + 0.8 * fract(aPhase * 3.1)) * max(1.0, dist / 9.0);
  vH = h;
  vTone = aTone;
  vDist = dist;
  gl_Position = projectionMatrix * viewMatrix * world;
}`

export const MOSS_FRAG = /* glsl */ `
${POOL}
uniform vec3 uMoss;
uniform float uReveal;
uniform float uDim;
uniform float uFog;
varying float vH;
varying float vTone;
varying float vDist;
void main() {
  float near = 1.0 - clamp(vDist / 30.0, 0.0, 1.0);
  float b = 0.12 + pool() * (0.6 + 0.4 * near) * 1.1 + uFlash * (0.8 + 0.4 * near);
  vec3 c = uMoss * (0.75 + 0.35 * vTone) * (0.7 + 0.3 * (1.0 - vH)) * b * uReveal * uDim;
  gl_FragColor = vec4(fogged(c, exp(-uFog * vDist)), 1.0);
}`

/** Low mist drifting over the water; it glows where the light or the flash catches it. */
export const MIST_FRAG = /* glsl */ `
${POOL}
${NOISE}
uniform float uTime;
uniform float uReveal;
uniform float uSeed;
varying vec3 vWorld;
void main() {
  float d = distance(vWorld, cameraPosition);
  vec3 q = vec3(vWorld.xz * 0.09 + vec2(uTime * 0.015, uTime * 0.007) + uSeed, uTime * 0.02);
  float n = 0.65 * vnoise(q) + 0.35 * vnoise(q * 2.3 + 4.0);
  float a = smoothstep(0.45, 0.85, n) * 0.22 * uReveal;
  a *= smoothstep(4.0, 14.0, d) * (1.0 - smoothstep(55.0, 85.0, d));
  vec3 c = vec3(0.86, 0.84, 0.76) * (0.06 + pool() * 0.5 + uFlash * 0.7);
  gl_FragColor = vec4(c, a);
}`

/** Laundry left on the line: cloth hanging from its pegs, blown out by the wind. */
export const CLOTH_VERT = /* glsl */ `
attribute float aTop;
attribute float aLen;
attribute float aPhase;
uniform float uTime;
varying vec3 vWorld;
varying float vH;
void main() {
  vec3 p = position;
  float h = clamp((aTop - p.y) / aLen, 0.0, 1.0); // 0 at the pegs, 1 at the hem
  float wave = sin(uTime * 1.7 + p.x * 1.4 + aPhase) * 0.6 + sin(uTime * 0.9 + aPhase * 1.7) * 0.4;
  p.z += wave * 0.22 * h * h + 0.1 * h;
  p.x += sin(uTime * 1.2 + aPhase) * 0.04 * h;
  vec4 w = modelMatrix * vec4(p, 1.0);
  vWorld = w.xyz;
  vH = h;
  gl_Position = projectionMatrix * viewMatrix * w;
}`

export const CLOTH_FRAG = /* glsl */ `
${POOL}
uniform float uReveal;
uniform float uFog;
varying vec3 vWorld;
varying float vH;
void main() {
  float d = distance(vWorld, cameraPosition);
  float b = 0.1 + pool() * 1.1 / (1.0 + 0.0006 * d * d) + uFlash * 1.5 / (1.0 + 0.0008 * d * d);
  vec3 c = vec3(0.82, 0.79, 0.7) * (0.85 + 0.15 * (1.0 - vH)) * b * uReveal;
  c = mix(c, vec3(0.965, 0.945, 0.906), clamp((b - 1.1) * 0.6, 0.0, 1.0) * uReveal);
  gl_FragColor = vec4(fogged(c, exp(-uFog * d)), 1.0);
}`

/** Dry corn: tall stalks, ribbons facing the viewer, each with a tassel; swaying a little. */
export const CORN_STALK_VERT = /* glsl */ `
attribute vec3 aRoot;
attribute float aHeight;
attribute float aLean;
attribute float aYaw;
attribute float aPhase;
attribute float aTone;
uniform float uTime;
varying float vH;
varying float vTone;
varying float vDist;
void main() {
  float h = position.y;
  vec3 dir = vec3(cos(aYaw), 0.0, sin(aYaw));
  float sway = sin(uTime * 1.0 + aPhase + aRoot.x * 0.25) * 0.05 + sin(uTime * 0.37 + aRoot.z * 0.06) * 0.04;
  float up = h * aHeight;
  vec3 p = aRoot + dir * sin(aLean) * up + vec3(0.0, cos(aLean) * up, 0.0) + vec3(sway, 0.0, sway * 0.4) * h * h * aHeight;
  vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
  float dist = distance(aRoot, cameraPosition);
  float w = (0.075 * (1.0 - 0.6 * h) + 0.035 * smoothstep(0.88, 0.95, h) * (1.0 - smoothstep(0.96, 1.0, h))) * max(1.0, dist / 9.0);
  p += right * position.x * w;
  vH = h;
  vTone = aTone;
  vDist = distance(p, cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`

/** Corn leaves: long blades growing out of the stalk, arching, drooping and curling at the tip. */
export const CORN_LEAF_VERT = /* glsl */ `
attribute vec3 aRoot;
attribute float aY;
attribute float aYaw;
attribute float aLen;
attribute float aDroop;
attribute float aPhase;
attribute float aTone;
uniform float uTime;
varying float vH;
varying float vTone;
varying float vDist;
void main() {
  float t = position.y; // 0 at the stalk, 1 at the tip
  vec3 outward = vec3(cos(aYaw), 0.0, sin(aYaw));
  vec3 side = vec3(-sin(aYaw), 0.0, cos(aYaw));
  float L = aLen;
  vec3 p = aRoot + vec3(0.0, aY, 0.0) + outward * t * L * 0.7 + vec3(0.0, 0.5 * t * L - aDroop * t * t * L, 0.0); // up, then hanging
  float width = 0.17 * sin(3.14159 * min(1.0, t * 1.05 + 0.06)) * (1.0 - 0.3 * t);
  p += side * position.x * width;
  p.y += abs(position.x) * width * 1.4 * t; // the edges curl up
  float sw = sin(uTime * 1.3 + aPhase + aRoot.x * 0.3) * 0.08 * t * t * L;
  p.x += sw;
  p.z += sw * 0.5;
  vH = 0.35 + 0.5 * aY / 2.6;
  vTone = aTone;
  vDist = distance(p, cameraPosition);
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`

export const CORN_FRAG = /* glsl */ `
${POOL}
uniform float uReveal;
uniform vec3 uLo;
uniform vec3 uHi;
uniform vec3 uPaper;
varying float vH;
varying float vTone;
varying float vDist;
void main() {
  float near = 1.0 - clamp(vDist / 26.0, 0.0, 1.0);
  float lit = pool() * (0.75 + 0.25 * near);
  float b = min(1.35, 0.045 + lit * 1.2 + uFlash * (0.8 + 0.45 * near));
  vec3 base = mix(uLo, uHi, vTone) * (0.6 + 0.4 * vH);
  vec3 c = base * b;
  c = mix(c, uPaper, clamp((b - 0.95) * 2.0, 0.0, 1.0));
  gl_FragColor = vec4(fogged(c * uReveal, exp(-0.03 * vDist)), 1.0);
}`
