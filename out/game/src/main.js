import * as Config from './config.js';
import * as Input from './input.js';
import * as Random from './random.js';
import * as Render from './render.js';
import { createWorld, terrainHeight, terrainCollision, collectCrossedRings } from './world.js';

const canvas = document.querySelector('#game');
const ctx = canvas.getContext('2d', { alpha: false });
const FIXED_DT = 1 / 60;
const held = new Set();
let width = 960, height = 600, accumulator = 0, previousTime = 0;
let game;

function configNumber(names, fallback) {
  for (const name of names) {
    const value = Config[name];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'object' && value && typeof value.value === 'number') return value.value;
  }
  return fallback;
}
const MIN_SPEED = configNumber(['MIN_SPEED', 'SPEED_MIN', 'minSpeed'], 38);
const MAX_SPEED = configNumber(['MAX_SPEED', 'SPEED_MAX', 'maxSpeed'], 132);
const THROTTLE_RATE = configNumber(['THROTTLE_RATE', 'ACCELERATION', 'throttleRate'], 27);
let seedCounter = 0;
function nextSeed() {
  const candidates = ['random', 'rand', 'next'];
  for (const name of candidates) {
    if (typeof Random[name] === 'function') {
      try { const value = Random[name](); if (Number.isFinite(value)) return (Math.floor(Math.abs(value) * 0xffffffff) ^ ++seedCounter) >>> 0; } catch { /* A random module may require its own seed. */ }
    }
  }
  return (0x51ced ^ (++seedCounter * 0x9e3779b9)) >>> 0;
}
function resize() {
  const rect = canvas.getBoundingClientRect();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  width = Math.max(320, rect.width); height = Math.max(240, rect.height);
  canvas.width = Math.round(width * dpr); canvas.height = Math.round(height * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize, { passive: true });
resize();

window.addEventListener('keydown', event => {
  held.add(event.code);
  if (['ArrowLeft','ArrowRight','ArrowUp','ArrowDown','Space'].includes(event.code)) event.preventDefault();
  if ((game.state === 'title' && (event.code === 'Enter' || event.code === 'Space')) || (game.state === 'over' && event.code === 'KeyR')) startFlight();
});
window.addEventListener('keyup', event => held.delete(event.code));
window.addEventListener('blur', () => held.clear());
canvas.addEventListener('pointerdown', () => { canvas.focus(); if (game.state === 'title') startFlight(); });

function externalDown(code, aliases) {
  for (const name of ['isDown', 'down', 'keyDown', 'pressed']) {
    const fn = Input[name]; if (typeof fn !== 'function') continue;
    for (const key of [code, ...aliases]) { try { if (fn(key)) return true; } catch { /* Keep the local keyboard fallback available. */ } }
  }
  return false;
}
function down(code, ...aliases) { return held.has(code) || aliases.some(key => held.has(key)) || externalDown(code, aliases); }
function startFlight() {
  const seed = nextSeed();
  const world = createWorld(seed);
  game = { state: 'fly', world, seed, x: 0, z: 0, y: terrainHeight(0, 0, seed) + 122, speed: 76, pitch: 0, bank: 0, heading: 0, score: 0, reason: '' };
  accumulator = 0;
}
function resetTitle() {
  const world = createWorld(0x51ced);
  game = { state: 'title', world, seed: world.seed, x: 0, z: 0, y: terrainHeight(0, 0, world.seed) + 122, speed: 76, pitch: 0, bank: 0, heading: 0, score: 0, reason: '' };
}
resetTitle();

function update(dt) {
  if (game.state !== 'fly') return;
  const left = down('KeyA', 'ArrowLeft'), right = down('KeyD', 'ArrowRight');
  const climb = down('KeyW', 'ArrowUp'), dive = down('KeyS', 'ArrowDown');
  const accelerate = down('ShiftLeft', 'ShiftRight'), decelerate = down('ControlLeft', 'ControlRight');
  const bankInput = (right ? 1 : 0) - (left ? 1 : 0);
  const pitchInput = (climb ? 1 : 0) - (dive ? 1 : 0);
  const targetBank = bankInput * 0.72;
  game.bank += (targetBank - game.bank) * Math.min(1, dt * 3.8);
  game.pitch = Math.max(-0.48, Math.min(0.48, game.pitch + pitchInput * dt * 0.62));
  if (!pitchInput) game.pitch *= Math.max(0, 1 - dt * 0.10);
  game.speed = Math.max(MIN_SPEED, Math.min(MAX_SPEED, game.speed + ((accelerate ? 1 : 0) - (decelerate ? 1 : 0)) * THROTTLE_RATE * dt));
  const previous = { x: game.x, y: game.y, z: game.z };
  game.heading = (game.heading + game.bank * dt * 23 + 360) % 360;
  const angle = game.heading * Math.PI / 180;
  const forwardSpeed = game.speed * Math.max(0.45, Math.cos(game.pitch));
  game.x += Math.sin(angle) * forwardSpeed * dt;
  game.z += Math.cos(angle) * forwardSpeed * dt;
  game.y += Math.sin(game.pitch) * game.speed * 0.78 * dt;
  game.score += collectCrossedRings(game.world, previous, game);
  if (terrainCollision(game.x, game.y, game.z, game.seed)) {
    game.state = 'over'; game.reason = 'Terrain contact';
  }
}
function frame(timestamp) {
  if (!previousTime) previousTime = timestamp;
  const elapsed = Math.min(0.1, (timestamp - previousTime) / 1000); previousTime = timestamp;
  accumulator += elapsed;
  while (accumulator >= FIXED_DT) { update(FIXED_DT); accumulator -= FIXED_DT; }
  Render.renderFrame(ctx, width, height, game);
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
