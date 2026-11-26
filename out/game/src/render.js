import { terrainHeight, terrainKind, ringsNear, RUNWAY } from './world.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const mix = (a, b, t) => a + (b - a) * t;

function project(x, y, z, s, bank = 0) {
  const depth = Math.max(18, z - s.z + 112);
  const focal = Math.min(s.w, s.h) * 0.92;
  const horizon = s.h * 0.385;
  const cameraY = s.y + 52;
  let sx = s.w * 0.5 + ((x - s.x) * focal) / depth;
  let sy = horizon + ((cameraY - y) * focal) / depth;
  const roll = bank * 0.52;
  const ox = sx - s.w * 0.5, oy = sy - horizon;
  return { x: s.w * 0.5 + ox * Math.cos(roll) - oy * Math.sin(roll), y: horizon + ox * Math.sin(roll) + oy * Math.cos(roll), depth };
}
function polygon(ctx, points, fill, stroke = null, width = 1) {
  if (points.some(p => !Number.isFinite(p.x + p.y))) return;
  ctx.beginPath(); ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = width; ctx.stroke(); }
}
function seeded(n) { const v = Math.sin(n * 127.1 + 311.7) * 43758.5453; return v - Math.floor(v); }

function drawSky(ctx, s, bank) {
  const horizon = s.h * 0.385;
  const sky = ctx.createLinearGradient(0, 0, 0, horizon + 30);
  sky.addColorStop(0, '#4d9fd0'); sky.addColorStop(0.65, '#9bd6eb'); sky.addColorStop(1, '#e5e5bd');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, s.w, s.h);
  // Soft cloud bands drift slowly with the aircraft.
  for (let i = 0; i < 8; i++) {
    const x = ((i * 193 + s.z * 0.025) % (s.w + 260)) - 130;
    const y = 32 + seeded(i + 2) * horizon * 0.66;
    const width = 52 + seeded(i + 21) * 90;
    ctx.fillStyle = 'rgba(255,255,255,.22)';
    ctx.beginPath(); ctx.ellipse(x, y, width, 5 + width * 0.09, 0, 0, Math.PI * 2); ctx.fill();
  }
  // Distant angular mountain silhouettes.
  const baseY = horizon + 27;
  ctx.fillStyle = '#738b80'; ctx.beginPath(); ctx.moveTo(0, baseY);
  for (let i = -1; i < Math.ceil(s.w / 105) + 2; i++) {
    const x = i * 105 - (s.z * 0.012 % 105);
    const peak = baseY - 14 - seeded(i + 85) * 48;
    ctx.lineTo(x + 52, peak); ctx.lineTo(x + 106, baseY);
  }
  ctx.lineTo(s.w, baseY); ctx.closePath(); ctx.fill();
  ctx.fillStyle = '#91a08a'; ctx.beginPath(); ctx.moveTo(0, baseY + 8);
  for (let i = -1; i < Math.ceil(s.w / 145) + 2; i++) {
    const x = i * 145 - (s.z * 0.008 % 145);
    ctx.lineTo(x + 73, baseY - 10 - seeded(i + 121) * 34); ctx.lineTo(x + 146, baseY + 8);
  }
  ctx.lineTo(s.w, baseY + 8); ctx.closePath(); ctx.fill();
}

function drawTerrain(ctx, s) {
  const columns = [];
  for (let x = -880; x <= 880; x += 55) columns.push(x);
  const rows = [12];
  for (let i = 1; i <= 43; i++) rows.push(12 + i * i * 0.72);
  for (let ri = rows.length - 2; ri >= 0; ri--) {
    const z0 = s.z + rows[ri], z1 = s.z + rows[ri + 1];
    for (let ci = 0; ci < columns.length - 1; ci++) {
      const x0 = s.x + columns[ci], x1 = s.x + columns[ci + 1];
      const h00 = terrainHeight(x0, z0, s.seed), h10 = terrainHeight(x1, z0, s.seed);
      const h01 = terrainHeight(x0, z1, s.seed), h11 = terrainHeight(x1, z1, s.seed);
      const a = project(x0, h00, z0, s, s.bank), b = project(x1, h10, z0, s, s.bank);
      const c = project(x1, h11, z1, s, s.bank), d = project(x0, h01, z1, s, s.bank);
      const mx = (x0 + x1) * 0.5, mz = (z0 + z1) * 0.5;
      const kind = terrainKind(mx, mz);
      const height = (h00 + h10 + h01 + h11) * 0.25;
      const shade = clamp(Math.floor(height / 22), 0, 5);
      let color;
      if (kind === 'water') color = ['#398e9d','#378997','#337e91','#30778a','#2b7084','#296b7e'][shade];
      else if (kind === 'bank') color = '#b3ae70';
      else if (height > 65) color = ['#637e5b','#617956','#5a704f','#53694a','#4a6045','#435942'][shade];
      else color = ['#579044','#548a40','#51843d','#4e803a','#4a7938','#477235'][shade];
      polygon(ctx, [a,b,c,d], color);
      // Faceted triangular slopes make the procedural ridges read as mountain faces.
      if (height > 82 && ((ci + ri) % 2 === 0)) {
        const high = Math.max(h00,h10,h01,h11);
        const p = project(mx, high + 2, (z0 + z1) * 0.5, s, s.bank);
        polygon(ctx, [a,p,d], 'rgba(205,210,177,.18)');
      }
    }
  }
}

function drawRunway(ctx, s) {
  const near = RUNWAY.z - RUNWAY.length * 0.5, far = RUNWAY.z + RUNWAY.length * 0.5;
  if (far < s.z + 5 || near > s.z + 4500) return;
  const left = RUNWAY.x - RUNWAY.width * 0.5, right = RUNWAY.x + RUNWAY.width * 0.5;
  const corners = [project(left, terrainHeight(left, near, s.seed) + 2, near, s, s.bank), project(right, terrainHeight(right, near, s.seed) + 2, near, s, s.bank), project(right, terrainHeight(right, far, s.seed) + 2, far, s, s.bank), project(left, terrainHeight(left, far, s.seed) + 2, far, s, s.bank)];
  polygon(ctx, corners, '#454b4b', '#d4d4bd', 1.2);
  // White centerline dashes.
  for (let z = Math.ceil(near / 50) * 50; z < far; z += 50) {
    const a = project(RUNWAY.x - 1.2, terrainHeight(RUNWAY.x, z, s.seed) + 3, z, s, s.bank);
    const b = project(RUNWAY.x + 1.2, terrainHeight(RUNWAY.x, z, s.seed) + 3, z, s, s.bank);
    const c = project(RUNWAY.x + 1.2, terrainHeight(RUNWAY.x, z + 22, s.seed) + 3, z + 22, s, s.bank);
    const d = project(RUNWAY.x - 1.2, terrainHeight(RUNWAY.x, z + 22, s.seed) + 3, z + 22, s, s.bank);
    polygon(ctx, [a,b,c,d], '#e5e2ce');
  }
  const threshold = [project(left, terrainHeight(left, near, s.seed) + 4, near, s, s.bank), project(right, terrainHeight(right, near, s.seed) + 4, near, s, s.bank)];
  ctx.strokeStyle = '#fff4b1'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(threshold[0].x, threshold[0].y); ctx.lineTo(threshold[1].x, threshold[1].y); ctx.stroke();
  for (let side = -1; side <= 1; side += 2) {
    for (let j = 0; j < 6; j++) {
      const p = project(RUNWAY.x + side * (RUNWAY.width * 0.5 + 7), terrainHeight(RUNWAY.x, near + j * 12, s.seed) + 5, near + j * 12, s, s.bank);
      const r = clamp(7 / p.depth * 140, 1.2, 4);
      ctx.fillStyle = '#ffe783'; ctx.shadowColor = '#ffd44c'; ctx.shadowBlur = 8;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill(); ctx.shadowBlur = 0;
    }
  }
}

function drawRings(ctx, s, world) {
  const rings = ringsNear(world, s.z, 30, 1550).sort((a,b) => b.z - a.z);
  for (const ring of rings) {
    if (ring.z < s.z + 5) continue;
    const p = project(ring.x, ring.y, ring.z, s, s.bank);
    const radius = clamp(ring.radius * Math.min(s.w,s.h) * 0.92 / p.depth, 2, 150);
    if (p.x < -radius || p.x > s.w + radius || p.y < -radius || p.y > s.h + radius) continue;
    ctx.save(); ctx.translate(p.x, p.y); ctx.scale(1, 0.78);
    ctx.lineWidth = clamp(radius * 0.16, 1.5, 9); ctx.strokeStyle = '#ffe56b'; ctx.shadowColor = '#ffcf42'; ctx.shadowBlur = clamp(radius * 0.35, 3, 18);
    ctx.beginPath(); ctx.arc(0, 0, radius, 0, Math.PI * 2); ctx.stroke(); ctx.shadowBlur = 0;
    ctx.lineWidth = Math.max(1, ctx.lineWidth * 0.28); ctx.strokeStyle = '#fff9cf'; ctx.beginPath(); ctx.arc(0, 0, radius * 0.82, 0, Math.PI * 2); ctx.stroke();
    ctx.restore();
  }
}

function drawAircraft(ctx, s) {
  const cx = s.w * 0.5, cy = s.h * 0.77;
  ctx.save(); ctx.translate(cx, cy); ctx.rotate(s.bank * 0.35);
  // Tail and swept wings sit behind the fuselage.
  polygon(ctx, [{x:-8,y:2},{x:-98,y:27},{x:-72,y:35},{x:-11,y:20},{x:11,y:20},{x:72,y:35},{x:98,y:27},{x:8,y:2}], '#253b47', '#b8d8df', 1);
  polygon(ctx, [{x:-35,y:21},{x:-24,y:-5},{x:-5,y:-22},{x:5,y:-22},{x:24,y:-5},{x:35,y:21},{x:13,y:15},{x:0,y:18},{x:-13,y:15}], '#dce8e4', '#314f59', 1.5);
  polygon(ctx, [{x:-12,y:-15},{x:0,y:-30},{x:12,y:-15},{x:8,y:9},{x:0,y:16},{x:-8,y:9}], '#f1f1d9', '#314f59', 1.2);
  polygon(ctx, [{x:-8,y:-14},{x:0,y:-25},{x:8,y:-14},{x:5,y:-6},{x:-5,y:-6}], '#4b93ae');
  ctx.strokeStyle = '#edf4dd'; ctx.lineWidth = 2; ctx.beginPath(); ctx.moveTo(-66,29); ctx.lineTo(-82,32); ctx.moveTo(66,29); ctx.lineTo(82,32); ctx.stroke();
  ctx.restore();
}

function panel(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(5,17,25,.77)'; ctx.fillRect(x,y,w,h);
  ctx.strokeStyle = 'rgba(173,219,224,.58)'; ctx.lineWidth = 1; ctx.strokeRect(x+.5,y+.5,w-1,h-1);
}
function drawHud(ctx, s, game) {
  const pad = Math.max(12, s.w * 0.018);
  ctx.textBaseline = 'top'; ctx.font = `bold ${Math.max(12,s.w*.014)}px ui-monospace, monospace`; ctx.fillStyle = '#f4f4df';
  panel(ctx,pad,pad,142,58); ctx.fillStyle='#9fcbd0'; ctx.fillText('ALTITUDE',pad+10,pad+8);
  ctx.fillStyle='#fff4c2'; ctx.font=`bold ${Math.max(17,s.w*.021)}px ui-monospace, monospace`; ctx.fillText(`${Math.max(0,Math.round(s.y))} FT`,pad+10,pad+28);
  panel(ctx,s.w-pad-146,pad,146,58); ctx.fillStyle='#9fcbd0'; ctx.font=`bold ${Math.max(12,s.w*.014)}px ui-monospace, monospace`; ctx.fillText('AIRSPEED',s.w-pad-136,pad+8);
  ctx.fillStyle='#fff4c2'; ctx.font=`bold ${Math.max(17,s.w*.021)}px ui-monospace, monospace`; ctx.fillText(`${Math.round(s.speed * 1.94384)} KT`,s.w-pad-136,pad+28);
  const tapeW = Math.min(440,s.w*.52), tapeX=(s.w-tapeW)*.5, tapeY=pad+9, heading=((s.heading%360)+360)%360;
  panel(ctx,tapeX,tapeY,tapeW,50); ctx.save(); ctx.beginPath(); ctx.rect(tapeX+8,tapeY+4,tapeW-16,41); ctx.clip();
  ctx.textAlign='center'; ctx.font=`${Math.max(10,s.w*.012)}px ui-monospace, monospace`; ctx.fillStyle='#d8e9dc';
  for(let d=Math.floor((heading-75)/10)*10; d<=heading+75; d+=10){const x=s.w*.5+(d-heading)*2.15;const norm=((d%360)+360)%360;ctx.strokeStyle='rgba(225,240,224,.76)';ctx.beginPath();ctx.moveTo(x,tapeY+20);ctx.lineTo(x,tapeY+(norm%30===0?33:27));ctx.stroke();if(norm%30===0)ctx.fillText(String(norm).padStart(3,'0'),x,tapeY+4);}
  ctx.restore(); ctx.fillStyle='#ffd85b'; ctx.beginPath(); ctx.moveTo(s.w*.5-6,tapeY+48);ctx.lineTo(s.w*.5+6,tapeY+48);ctx.lineTo(s.w*.5,tapeY+40);ctx.fill();
  const scoreY=pad+72; panel(ctx,pad,scoreY,142,43);ctx.fillStyle='#9fcbd0';ctx.font=`bold ${Math.max(11,s.w*.012)}px ui-monospace, monospace`;ctx.fillText('LEDGER',pad+10,scoreY+6);ctx.fillStyle='#ffe56b';ctx.font=`bold ${Math.max(16,s.w*.019)}px ui-monospace, monospace`;ctx.fillText(String(game.score||0).padStart(5,'0'),pad+10,scoreY+22);
  ctx.textAlign='right';ctx.font=`${Math.max(10,s.w*.011)}px ui-monospace, monospace`;ctx.fillStyle='rgba(255,255,240,.83)';ctx.fillText('A/D OR ←/→ BANK   W/S PITCH   SHIFT/CTRL THROTTLE',s.w-pad,s.h-18);ctx.textAlign='left';
}
function overlay(ctx,s,title,lines,accent='#ffe56b'){
  ctx.fillStyle='rgba(4,14,21,.58)';ctx.fillRect(0,0,s.w,s.h);const w=Math.min(560,s.w*.84),h=190,x=(s.w-w)/2,y=(s.h-h)/2;panel(ctx,x,y,w,h);
  ctx.textAlign='center';ctx.fillStyle=accent;ctx.font=`900 ${Math.max(28,s.w*.045)}px ui-monospace, monospace`;ctx.fillText(title,s.w/2,y+28);
  ctx.fillStyle='#edf2e3';ctx.font=`${Math.max(13,s.w*.016)}px ui-monospace, monospace`;lines.forEach((line,i)=>ctx.fillText(line,s.w/2,y+94+i*25));ctx.textAlign='left';
}

export function renderFrame(ctx, width, height, game) {
  const s={w:width,h:height,x:game.x||0,y:game.y||80,z:game.z||0,bank:game.bank||0,heading:game.heading||0,speed:game.speed||0,seed:game.world?.seed??0x51ced};
  drawSky(ctx,s,s.bank); drawTerrain(ctx,s); drawRunway(ctx,s); if(game.world)drawRings(ctx,s,game.world); drawAircraft(ctx,s);
  if(game.state==='fly')drawHud(ctx,s,game);
  if(game.state==='title')overlay(ctx,s,'SKY LEDGER',['A flight game of rings, ridgelines, and clean approaches','ENTER TO FLY  ·  A/D BANK  ·  W/S PITCH']);
  if(game.state==='over')overlay(ctx,s,'FLIGHT ENDED',[game.reason||'Terrain contact','SCORE  '+String(game.score||0).padStart(5,'0')+'   ·   PRESS R TO RESTART'], '#ff9f79');
}
