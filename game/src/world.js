// Sky Ledger's small deterministic world model. Coordinates are world units: +z is forward.
export const WORLD_SEED = 0x51ced;
export const RING_SPACING = 245;
export const RUNWAY = Object.freeze({ x: 0, z: 1850, width: 46, length: 430, heading: 0 });

function hash2(x, z, seed) {
  let n = Math.imul((x | 0) ^ seed, 0x45d9f3b) ^ Math.imul((z | 0) + seed, 0x27d4eb2d);
  n = Math.imul(n ^ (n >>> 16), 0x45d9f3b);
  n ^= n >>> 16;
  return (n >>> 0) / 4294967295;
}
function smooth(t) { return t * t * (3 - 2 * t); }
function valueNoise(x, z, scale, seed) {
  const gx = x / scale, gz = z / scale;
  const ix = Math.floor(gx), iz = Math.floor(gz);
  const fx = smooth(gx - ix), fz = smooth(gz - iz);
  const a = hash2(ix, iz, seed), b = hash2(ix + 1, iz, seed);
  const c = hash2(ix, iz + 1, seed), d = hash2(ix + 1, iz + 1, seed);
  const top = a + (b - a) * fx, bottom = c + (d - c) * fx;
  return top + (bottom - top) * fz;
}

export function terrainHeight(x, z, seed = WORLD_SEED) {
  const broad = valueNoise(x, z, 520, seed) * 52;
  const hills = valueNoise(x + 130, z - 80, 185, seed ^ 0x2a91) * 30;
  const ridgeNoise = valueNoise(x - 310, z + 260, 88, seed ^ 0x739b);
  const ridge = Math.pow(Math.max(0, (ridgeNoise - 0.55) * 2.2), 1.5) * 125;
  // Keep a broad, gently rolling valley around the flight corridor.
  const corridor = Math.max(0, 1 - Math.abs(x) / 255);
  return Math.max(0, 8 + broad * 0.35 + hills * 0.3 + ridge * (1 - corridor * 0.7));
}

export function riverCenter(z) {
  return Math.sin(z * 0.00135) * 125 + Math.sin(z * 0.0031 + 1.2) * 44;
}
export function terrainKind(x, z) {
  const distance = Math.abs(x - riverCenter(z));
  if (distance < 20) return 'water';
  if (distance < 28) return 'bank';
  return 'field';
}

export function createWorld(seed = WORLD_SEED) {
  return { seed: seed >>> 0, collected: new Set(), lastRing: -1, runway: RUNWAY };
}

export function ringAt(index, seed = WORLD_SEED) {
  if (index < 0) return null;
  const n = index + 1;
  const lane = (hash2(n, 17, seed) * 2 - 1) * 100;
  const z = n * RING_SPACING + 90;
  const floor = terrainHeight(lane, z, seed);
  return { id: index, x: lane, y: floor + 72 + hash2(n, 31, seed) * 32, z, radius: 13 };
}

export function ringsNear(world, z, behind = 100, ahead = 1500) {
  const first = Math.max(0, Math.floor((z - behind - 90) / RING_SPACING));
  const last = Math.max(first, Math.ceil((z + ahead - 90) / RING_SPACING));
  const rings = [];
  for (let i = first; i <= last; i++) {
    if (!world.collected.has(i)) rings.push(ringAt(i, world.seed));
  }
  return rings;
}

// Ring credit is awarded only while crossing its plane, through its open radius.
export function collectCrossedRings(world, previous, current) {
  let gained = 0;
  const low = Math.min(previous.z, current.z) - 24;
  const high = Math.max(previous.z, current.z) + 24;
  const first = Math.max(0, Math.floor((low - 90) / RING_SPACING));
  const last = Math.ceil((high - 90) / RING_SPACING);
  for (let i = first; i <= last; i++) {
    if (world.collected.has(i)) continue;
    const ring = ringAt(i, world.seed);
    if ((previous.z - ring.z) * (current.z - ring.z) <= 0) {
      const dx = current.x - ring.x, dy = current.y - ring.y;
      if (dx * dx + dy * dy <= ring.radius * ring.radius) {
        world.collected.add(i); gained++;
      }
    }
  }
  return gained;
}

export function terrainCollision(x, y, z, seed = WORLD_SEED) {
  return y <= terrainHeight(x, z, seed) + 3;
}

export function runwayContains(x, z) {
  const r = RUNWAY;
  return Math.abs(x - r.x) <= r.width * 0.5 && Math.abs(z - r.z) <= r.length * 0.5;
}
