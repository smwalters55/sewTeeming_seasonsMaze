document.addEventListener("DOMContentLoaded",()=>{


/* ======================================================
   CANVAS + CONTEXT
   ====================================================== */
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");

/* ======================================================
   DOM UI (inventory box + map overlay from index.html)
   ====================================================== */
const invEl = document.getElementById("inv");
const overlayEl = document.getElementById("overlay");

/* ======================================================
   WORLD CONSTANTS
   ====================================================== */
const gy = 300;
const groundY = 0;

let lastTime = performance.now();

const stump = {
  x: 360,
  width: 44,
  topWorld: 0,       // stump sits on world ground, not screen ground
  height: 32,
  top: 0 + 32
};
  
const lowfog = {
  x: 0,
  speed: 0.15,
  height: 48
};


/* ======================================================
   INPUT
   ====================================================== */
const keys = { left:false, right:false, up:false, down:false, space:false };

window.addEventListener("keydown", e => {
  if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," "].includes(e.key)) {
    e.preventDefault();
  }
  if (e.key==="ArrowLeft") keys.left=true;
  if (e.key==="ArrowRight") keys.right=true;
  if (e.key==="ArrowUp") keys.up=true;
  if (e.key==="ArrowDown") keys.down=true;
  if (e.key===" ") keys.space=true;
});

window.addEventListener("keyup", e => {
  if (e.key==="ArrowLeft") keys.left=false;
  if (e.key==="ArrowRight") keys.right=false;
  if (e.key==="ArrowUp") keys.up=false;
  if (e.key==="ArrowDown") keys.down=false;
  if (e.key===" ") keys.space=false;
});

// orchard choice 
let orchardChoice = null; // "left" | "right"
const orchardPaths = [
  { id: "left",  x: 300 },
  { id: "center", x: 560 },
  { id: "right", x: 820 }
];

/* ======================================================
   CAMERA
   ====================================================== */
let cameraX = 0;
const camera = { topDown:false, locked:false };

/* ======================================================
   ORCHARD COLOURS
   ====================================================== */
const ORCHARD = {
  skyTop: "#cfd6d1",
  skyWarm: "#e8d3a8",
  skyAmber: "#d1b07a",
  skyHorizon: "#b28a58",

  leafDark: "rgba(70,85,55,0.45)",
  leafMid: "rgba(85,110,70,0.45)",
  leafFar: "rgba(70,85,70,0.25)",

  trunk: "#6b4026",
  ground: "#6a6f4a",

  fogLight: "rgba(255,245,235,0.12)",
  fogHeavy: "rgba(220,210,190,0.35)",

  appleRed: "#8b2e2a",
  appleFlesh: "#f2d6b3",
  glow: "rgba(255,210,140,0.18)"
};

/* ======================================================
   PLAYER
   ====================================================== */
const player = {
  x: 120,
  y: 0,               // height above ground
  width: 40,
  height: 54,
  speed: 3,
  jumping: false,
  vy: 0
};

/* ======================================================
   INVENTORY
   ====================================================== */
const inventory = {}; // e.g. { appleSlice: 2, feather: 1 }

const ITEM_ICONS = {
  appleSlice: "🍎"
};

function addToInventory(itemType) {
  inventory[itemType] = (inventory[itemType] || 0) + 1;
  updateInventoryUI();
}

function updateInventoryUI() {
  const entries = Object.entries(inventory);
  invEl.textContent = entries.length
    ? entries.map(([type, count]) => `${ITEM_ICONS[type] || "?"} x${count}`).join("  ")
    : "(empty)";
}

/* ======================================================
   FROG NPC
   ====================================================== */
const frog = {
  x: 820,
  y: 0,
  width: 48,
  height: 36,
  bob: 0
};
let frogTalked = false;
let frogActive = false;
let frogNoticedApple = false;
let frogHatTip = 0; // animation timer

/* ======================================================
   PLATFORM (anchored from ground)
   ====================================================== */
const platforms = [
  {
    x: 560,
    heightAboveGround: 48,
    width: 120,
    thickness: 14
  }
];

/* ======================================================
   ATMOSPHERE
   ====================================================== */
const fog = {
  x: 0,
  speed: 0.015,
  height: 180
};

const crows = [
  { x: 780, y: 60, speed: 0.25, phase: Math.random()*Math.PI*2 },
  { x: 620, y: 90, speed: 0.18, phase: Math.random()*Math.PI*2 }
];

const leaves = Array.from({ length: 8 }, (_, i) => ({
  x: Math.random() * canvas.width,
  y: Math.random() * gy * 0.6,
  speedY: 0.15 + Math.random() * 0.25,
  drift: Math.random() * 0.6 + 0.2,
  phase: Math.random() * Math.PI * 2
}));


/* ======================================================
   TREE
   ====================================================== */
const tree = {
  x: 400,               // horizontal tree position
  y: groundY,           // bottom of tree
  width: 80,
  height: 180,          // tree height
  canopyY: gy - 180 // top of tree for apple spawn (screen space, ground = gy)

};

/* ======================================================
   APPLE
   ====================================================== */
const apple = {
  x: tree.x,
  y: tree.canopyY,
  r: 7,

  vy: 0,

  falling: false,
  landed: false,
  settled: false,

  cracked: false,
  split: false,
  splitTimer: 0,

  collected: false,
  rollingToStump: false,

  glitter: 0,
  bounce: 0,
  bounceVy: 0,

  spawnTime: performance.now(),
  spawnDelay: 2400,

  // physics (time-based, screen-scaled)
  gravity: canvas.height * 0.75, // px/s² — apple falls ~1/3 screen in ~1s
  airDrag: 0.995,                // velocity retained per frame
  terminalVelocity: canvas.height * 1.2,

  bounceRestitution: 0.55,       // fraction of speed kept each bounce (material property)
  targetBounces: 4,              // how many hops before it's considered settled
  settleThreshold: 0,            // derived at impact from actual fall speed

  canFall: (now) => now - apple.spawnTime > apple.spawnDelay
};

const applePieces = [];

/* ======================================================
   COLLECT ANIMATION (piece -> center -> inventory box)
   ====================================================== */
const flyingItems = [];

const COLLECT_DURATIONS = { toCenter: 800, hold: 400, toBasket: 900 };

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

function startCollectAnimation(piece, itemType) {
  flyingItems.push({
    itemType,
    x: piece.x,              // world x/y — camera-relative, matches applePieces convention
    y: piece.y,
    startX: piece.x,
    startY: piece.y,
    phase: "toCenter",       // "toCenter" -> "hold" -> "toBasket"
    t: 0,
    size: piece.size,
    scale: 1,
    rotation: piece.rotation
  });
}

function updateFlyingItems(deltaTime, camX) {
  const dtMs = deltaTime * 1000;

  for (let i = flyingItems.length - 1; i >= 0; i--) {
    const f = flyingItems[i];
    f.t += dtMs;

    if (f.phase === "toCenter") {
      const dur = COLLECT_DURATIONS.toCenter;
      const p = easeOutCubic(Math.min(f.t / dur, 1));

      // target is screen-center, expressed in WORLD space (+ camX)
      // so it stays consistent with how f.x/f.y are drawn (- camX in draw())
      const centerWorldX = camX + canvas.width / 2;
      const centerWorldY = canvas.height / 2;

      f.x = f.startX + (centerWorldX - f.startX) * p;
      f.y = f.startY + (centerWorldY - f.startY) * p;
      f.scale = 1 + p * 0.6; // grows slightly on the way in

      if (f.t >= dur) {
        f.phase = "hold";
        f.t = 0;
        f.holdX = f.x;
        f.holdY = f.y;
      }

    } else if (f.phase === "hold") {
      if (f.t >= COLLECT_DURATIONS.hold) {
        f.phase = "toBasket";
        f.t = 0;

        // basket's real on-screen position, converted into the same
        // WORLD-space coordinates f.x/f.y already use (+ camX)
        const rect = document.getElementById("basket").getBoundingClientRect();
        const canvasRect = canvas.getBoundingClientRect();
        f.targetX = camX + (rect.left + rect.width / 2 - canvasRect.left);
        f.targetY = rect.top + rect.height / 2 - canvasRect.top;
      }

    } else if (f.phase === "toBasket") {
      const dur = COLLECT_DURATIONS.toBasket;
      const p = easeOutCubic(Math.min(f.t / dur, 1));

      f.x = f.holdX + (f.targetX - f.holdX) * p;
      f.y = f.holdY + (f.targetY - f.holdY) * p;
      f.scale = 1.6 - p * 1.6; // shrinks down as it settles in

      if (f.t >= dur) {
        addToInventory(f.itemType); // counter updates ONLY on arrival
        flyingItems.splice(i, 1);
      }
    }
  }
}


// hay positions (generated ONCE)
const hay = Array.from({length: 90}, () => ({
  x: Math.random()*canvas.width,
  y: gy + 6 + Math.random()*10,
  h: 4 + Math.random()*6
}));

/* ======================================================
   INPUT HANDLING
   ====================================================== */
function handleInput(){
  if (!camera.topDown) {
    if (keys.left) player.x -= player.speed;
    if (keys.right) player.x += player.speed;
    if (keys.up && !player.jumping) {
      player.jumping = true;
      player.vy = 12;
    }
  }

  if (keys.space && !camera.locked) {
    camera.topDown = !camera.topDown;
    camera.locked = true;
    overlayEl.style.display = camera.topDown ? "block" : "none";
  }
  if (!keys.space) camera.locked = false;
}

/* ======================================================
   PHYSICS
   ====================================================== */
function applyPhysics(){
  // gravity
  player.y += player.vy;
  player.vy -= 0.8;

  // ground collision
  if (player.y <= 0) {
    player.y = 0;
    player.jumping = false;
    player.vy = 0;
  }

  // platform collision
  platforms.forEach(p => {
  const platformTop = p.heightAboveGround;

  const playerBottom = player.y;

  if (
    player.x + player.width > p.x &&
    player.x < p.x + p.width &&
    playerBottom <= platformTop &&
    playerBottom >= platformTop - 14 &&
    player.vy <= 0
  ) {
    player.y = platformTop;
    player.vy = 0;
    player.jumping = false;
  }
});

  frog.bob += 0.04;
  if (frogHatTip > 0) frogHatTip--;
}

/* ======================================================
   DRAW HELPERS
   ====================================================== */
function roundRect(ctx,x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.lineTo(x+w-r,y);
  ctx.quadraticCurveTo(x+w,y,x+w,y+r);
  ctx.lineTo(x+w,y+h-r);
  ctx.quadraticCurveTo(x+w,y+h,x+w-r,y+h);
  ctx.lineTo(x+r,y+h);
  ctx.quadraticCurveTo(x,y+h,x,y+h-r);
  ctx.lineTo(x,y+r);
  ctx.quadraticCurveTo(x,y,x+r,y);
  ctx.closePath();
}

// draw apple trees
function drawAppleTree(x, camX){
  const tx = x - camX;

  // trunk
  ctx.fillStyle="#6b4026";
  ctx.fillRect(tx-12, gy-96, 24, 96);

// apple gravity shadow
ctx.fillStyle = "rgba(120,90,60,0.18)";
ctx.beginPath();
ctx.ellipse(tx, gy + 2, 22, 6, 0, 0, Math.PI * 2);
ctx.fill();

// bark lines
ctx.strokeStyle="rgba(40,20,10,0.25)";
ctx.beginPath();
ctx.moveTo(tx-6, gy-20);
ctx.lineTo(tx-6, gy-80);
ctx.stroke();

  // canopy
  const applePulse = 0.08 + Math.sin(performance.now() * 0.0012) * 0.04;
  ctx.fillStyle = `rgba(90,120,70,${0.9 + applePulse})`;

  ctx.beginPath();
  ctx.arc(tx, gy-120, 50, 0, Math.PI*2);
  ctx.fill();

  // apples + highlight
for (let i = 0; i < 4; i++) {
  const decoX = tx + Math.cos(i * 1.7) * 30;
  const decoY = gy - 110 + Math.sin(i * 1.3) * 20;

  // apple body
  ctx.fillStyle = "#8b2e2a";
  ctx.beginPath();
  ctx.arc(decoX, decoY, 6, 0, Math.PI * 2);
  ctx.fill();

  // highlight
  ctx.fillStyle = "rgba(255,220,200,0.4)";
  ctx.beginPath();
  ctx.arc(decoX - 2, decoY - 2, 2, 0, Math.PI * 2);
  ctx.fill();
  }
}

// apple pieces for split animation
function createApplePiece(x, y, angle, speed) {
  return {
    x,
    y,
    r: 6,
    size: 9,
    rotation: angle + Math.PI / 2,
    spin: (Math.random() - 0.5) * 6,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    gravity: 1200,
    airDrag: 0.98,
    settled: false,
    collected: false,
  };
}

// apple-slice wedge: rounded outer edge, pointed inner tip (toward the core)
function drawApplePieceShape(ctx, x, y, size, rotation) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.quadraticCurveTo(size * 0.9, -size * 0.2, size * 0.55, size * 0.85);
  ctx.quadraticCurveTo(0, size * 0.5, -size * 0.55, size * 0.85);
  ctx.quadraticCurveTo(-size * 0.9, -size * 0.2, 0, -size);
  ctx.closePath();
  ctx.fillStyle = "#8b2e2a";
  ctx.fill();

  // flesh sliver along the inner edge
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.7);
  ctx.lineTo(size * 0.18, size * 0.5);
  ctx.lineTo(-size * 0.18, size * 0.5);
  ctx.closePath();
  ctx.fillStyle = "#f2d6b3";
  ctx.fill();

  ctx.restore();
}

/* ======================================================
   DRAW
   ====================================================== */
function draw(){
ctx.clearRect(0,0,canvas.width,canvas.height);

if (camera.topDown) {
  ctx.fillStyle="rgba(245,245,240,0.94)";
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle="#2b2b2b";
  ctx.fillText("Orchard → Paths",120,120);
} else {

const camX = cameraX;

// low fog gradient
 const lowFogGrad = ctx.createLinearGradient(0, gy - 40, 0, gy + 60);
  lowFogGrad.addColorStop(0, "rgba(255,255,255,0)");
  lowFogGrad.addColorStop(0.4, "rgba(240,230,210,0.18)");
  lowFogGrad.addColorStop(1, "rgba(220,210,190,0.35)");

  ctx.fillStyle = lowFogGrad;
  ctx.fillRect(0, gy - 40, canvas.width, 100);

  /* SKY */
const sky = ctx.createLinearGradient(0, 0, 0, gy);

sky.addColorStop(0, "#cfd6d1");   // soft cool top
sky.addColorStop(0.28, "#e8d3a8"); // warm haze
sky.addColorStop(0.55, "#d1b07a"); // orchard amber
sky.addColorStop(0.82, "#b28a58"); // near horizon glow
sky.addColorStop(1, "#8f6b45");    // deep ground blend

ctx.fillStyle = sky;
ctx.fillRect(0, 0, canvas.width, gy);

// === FALLING APPLE SCREEN SPACE ===
const appleScreenX = apple.x - camX;
const appleScreenY = apple.y - apple.bounce;

// orchard dust motes
ctx.fillStyle = "rgba(255,240,210,0.06)";
for (let i = 0; i < 30; i++) {
  const x = (i * 90 + cameraX * 0.2) % canvas.width;
  const y = 60 + Math.sin(i + performance.now()*0.0004) * 8;
  ctx.fillRect(x, y, 2, 2);
}

// orchard horizon glow
const glow = ctx.createLinearGradient(0, gy - 120, 0, gy + 40);
glow.addColorStop(0, "rgba(255,230,180,0)");
glow.addColorStop(0.4, "rgba(255,210,140,0.12)");
glow.addColorStop(0.7, "rgba(255,190,110,0.18)");
glow.addColorStop(1, "rgba(255,190,110,0)");

ctx.fillStyle = glow;
ctx.fillRect(0, gy - 140, canvas.width, 220);

// light shafts
ctx.fillStyle = "rgba(255,235,190,0.04)";
for (let i = 0; i < 5; i++) {
  ctx.fillRect(120 + i*140 - cameraX*0.15, 0, 80, gy);
}

  /* FOG */
// ??? maybe delete except for one line for distand fog layer ?
  // distant fog layer
  ctx.fillStyle = "rgba(255,245,230,0.08)";
// atmospheric haze
  ctx.fillStyle = "rgba(255,245,235,0.04)";
  ctx.fillRect(0, gy - 160, canvas.width, 140);

/* FAR TREE SILHOUETTES */
ctx.fillStyle = "rgba(70,85,70,0.25)";
for (let i = 0; i < 10; i++) {
  const tx = (i * 200) - (cameraX * 0.2);
  ctx.beginPath();
  ctx.arc(tx, gy - 140, 110, 0, Math.PI * 2);
  ctx.fill();
}

/* DISTANT TREES */
for (let i = 0; i < 9; i++) {
  const tx = i * 220 - (cameraX * 0.3) + Math.sin(i * 2.1) * 60;
  const radius = 70 + Math.sin(i * 1.3) * 18;
  const ty = gy - 120 + Math.sin(i * 0.9) * 10;

  ctx.fillStyle = "rgba(70,85,55,0.35)";
  ctx.beginPath();
  ctx.arc(tx, ty, radius, 0, Math.PI * 2);
  ctx.fill();
}

/* MID ORCHARD TREES */
ctx.fillStyle = "rgba(85,110,70,0.45)";
for (let i = 0; i < 6; i++) {
  const tx = (i * 320) - (cameraX * 0.45);
  ctx.beginPath();
  ctx.arc(tx + 40, gy - 110, 70, 0, Math.PI * 2);
  ctx.arc(tx + 100, gy - 115, 65, 0, Math.PI * 2);
  ctx.arc(tx + 70, gy - 150, 75, 0, Math.PI * 2);
  ctx.fill();
}

// falling leaves
ctx.fillStyle = "rgba(155,120,70,0.55)";
leaves.forEach(l => {
  l.y += l.speedY;
  l.x += Math.sin(l.phase) * l.drift;
  l.phase += 0.01;

  if (l.y > gy - 4) {
    l.y = -10;
    l.x = Math.random() * canvas.width;
  }

  ctx.beginPath();
  ctx.ellipse(l.x - camX * 0.4, l.y, 3, 2, 0.6, 0, Math.PI * 2);
  ctx.fill();
});

/* CROWS */
ctx.strokeStyle = "#3b2f28";
crows.forEach(c=>{
  c.x -= c.speed;
  c.phase += 0.18;

  if (c.x < -20) c.x = canvas.width+20;

  const flap = Math.sin(c.phase) * 4;

  ctx.beginPath();
  ctx.moveTo(c.x - camX, c.y);
  ctx.lineTo(c.x - camX + 8, c.y + flap);
  ctx.lineTo(c.x - camX + 16, c.y);
  ctx.stroke();
});

/* NEAR TREE TRUNKS */
ctx.fillStyle = "rgba(90,65,40,0.18)";
for (let i = 0; i < 5; i++) {
  const tx = (i * 420) - (cameraX * 0.7);
  ctx.fillRect(tx + 120, gy - 60, 16, 60);
}

  /* GROUND */
  ctx.fillStyle = "#6a6f4a"; // olive-moss base;
  ctx.fillRect(-camX, gy, canvas.width+camX, canvas.height-gy);
// ground warmth glaze
const groundGlow = ctx.createLinearGradient(0, gy, 0, gy + 80);
groundGlow.addColorStop(0, "rgba(180,150,90,0.12)");
groundGlow.addColorStop(1, "rgba(120,90,40,0)");

ctx.fillStyle = groundGlow;
ctx.fillRect(0, gy, canvas.width, 80);


/* LOW MOVING FOG */
lowfog.x += lowfog.speed;

const fogGrad = ctx.createLinearGradient(0, gy - lowfog.height, 0, gy + 20);
fogGrad.addColorStop(0, "rgba(255,245,235,0)");
fogGrad.addColorStop(0.4, "rgba(255,245,235,0.12)");
fogGrad.addColorStop(1, "rgba(255,245,235,0.22)");

ctx.fillStyle = fogGrad;
ctx.fillRect(
  -((lowfog.x + camX * 0.4) % canvas.width),
  gy - lowfog.height,
  canvas.width * 2,
  lowfog.height + 20
);

// subtle ground texture
ctx.strokeStyle = "rgba(80,60,30,0.08)";
for (let i = 0; i < canvas.width; i += 24) {
  ctx.beginPath();
  ctx.moveTo(i - camX % 24, gy + 2);
  ctx.lineTo(i - camX % 24 + 12, gy + 8);

  ctx.stroke();
}

  /* HAY */
  ctx.fillStyle = "rgba(210,180,120,0.35)";
  hay.forEach(h=>{
    ctx.fillRect(h.x - camX, h.y, 2, h.h);
  });

// soil speckle
ctx.fillStyle="rgba(80,60,30,0.12)";
for(let i=0;i<80;i++){
  ctx.fillRect(
    Math.random()*canvas.width,
    gy + Math.random()*30,
    1,1
  );
}

// hay bale
ctx.fillStyle="#caa76b";
roundRect(ctx, 360 - camX, gy - 32, 44, 32, 6);
ctx.fill();

ctx.strokeStyle="rgba(120,80,40,0.4)";
ctx.beginPath();
ctx.moveTo(360-camX, gy-18);
ctx.lineTo(404-camX, gy-18);
ctx.stroke();

/* LOW GROUND FOG */
fog.x += fog.speed * 0.6;

/* LOW ORCHARD FOG */
const lowFogGrad2 = ctx.createLinearGradient(0, gy - 40, 0, gy + 60);
lowFogGrad2.addColorStop(0, "rgba(255,255,255,0)");
lowFogGrad2.addColorStop(0.4, "rgba(240,230,210,0.18)");
lowFogGrad2.addColorStop(1, "rgba(220,210,190,0.35)");

ctx.fillStyle = lowFogGrad2;
ctx.fillRect(0, gy - 40, canvas.width, 100);

/* PLATFORM */
platforms.forEach(p=>{
  const px = p.x - camX;
  const py = gy - p.heightAboveGround;

  const wood = ctx.createLinearGradient(px,py,px,py+p.thickness);
  wood.addColorStop(0,"#c89a5a");
  wood.addColorStop(1,"#8a5a2e");

  ctx.fillStyle = wood;
  ctx.fillRect(px, py, p.width, p.thickness);

  // wood knots
  ctx.fillStyle="rgba(80,50,30,0.35)";
  ctx.beginPath();
  ctx.arc(px+24, py+7, 3, 0, Math.PI*2);
  ctx.arc(px+78, py+9, 2.5, 0, Math.PI*2);
  ctx.fill();
});

// call draw apple tree 2x
drawAppleTree(220, camX);
drawAppleTree(980, camX);

/* DRAW APPLE */

 // debug apple etc not drawing
if (
  Number.isNaN(appleScreenX) ||
  Number.isNaN(appleScreenY)
) {
  // console.warn("APPLE SCREEN COORDS NaN", apple);
}

if (!apple.collected && !apple.cracked) {

  if (!apple.split) {
    // whole apple
    ctx.fillStyle = "#8b2e2a";
    ctx.beginPath();
    ctx.arc(appleScreenX, appleScreenY, apple.r, 0, Math.PI * 2);
    ctx.fill();
  } else {
    const spread = 18;
  
    for (let i = -1; i <= 1; i++) {
      ctx.fillStyle = "#8b2e2a";
      ctx.beginPath();
      ctx.arc(
        appleScreenX + i * spread,
        appleScreenY,
        apple.r * 0.75,
        0,
        Math.PI * 2
      );
      ctx.fill();

      // flesh highlight
      ctx.fillStyle = "#f2d6b3";
      ctx.fillRect(
        appleScreenX + i * spread - 2,
        appleScreenY - apple.r * 0.5,
        4,
        apple.r
      );
    }
  }
  // stem (always)
  ctx.strokeStyle = "#4a2e1c";
  ctx.beginPath();
  ctx.moveTo(appleScreenX, appleScreenY-apple.r);
  ctx.lineTo(appleScreenX+2, appleScreenY-apple.r-6);
  ctx.stroke();

  // glitter moment
  if (apple.glitter > 0) {
    ctx.fillStyle = `rgba(255,220,160,${apple.glitter/120})`;
    for (let i=0;i<4;i++){
      ctx.fillRect(
        appleScreenX + Math.cos(i*1.6)*10,
        apple.y - 6 + Math.sin(i*1.6)*6,
        2,2
      );
    }
  }
}

// falling apple shine
if (apple.falling) {
  const shineX = appleScreenX - 2 + Math.sin(performance.now() * 0.006) * 1.5;
  const shineY = appleScreenY - apple.r + 3;

  ctx.fillStyle = "rgba(255,230,200,0.55)";
  ctx.beginPath();
  ctx.ellipse(shineX, shineY, 2, 4, -0.6, 0, Math.PI * 2);
  ctx.fill();
}

// apple split in 3, pieces bounce
const bounceY = apple.bounce * 0.6;

  // DRAW APPLE PIECES
  applePieces.forEach(p => {
    if (p.collected || p.collecting) return;
    drawApplePieceShape(ctx, p.x - camX, p.y, p.size, p.rotation);
  });

  // DRAW FLYING (collecting) ITEMS
  flyingItems.forEach(f => {
    drawApplePieceShape(ctx, f.x - camX, f.y, f.size * f.scale, f.rotation);
  });


/* FROG */
const fx = frog.x - camX;
const fy = gy - frog.height + Math.sin(frog.bob)*2;

// frog shadow
ctx.fillStyle="rgba(40,30,20,0.25)";
ctx.beginPath();
ctx.ellipse(fx + frog.width/2, gy + 4, 20, 6, 0, 0, Math.PI*2);
ctx.fill();
// ground contact tint
ctx.fillStyle = "rgba(90,70,40,0.08)";
ctx.beginPath();
ctx.ellipse(fx + frog.width/2, gy + 6, 22, 8, 0, 0, Math.PI*2);
ctx.fill();


// body
ctx.fillStyle="#6f8f6a";
roundRect(ctx, fx, fy, frog.width, frog.height, 10);
ctx.fill();

// outline body
ctx.strokeStyle = "rgba(40,30,20,0.6)";
ctx.lineWidth = 1.5;
ctx.stroke();

// eyes
ctx.fillStyle="#fff";
ctx.beginPath();
ctx.arc(fx+14, fy+10, 4, 0, Math.PI*2);
ctx.arc(fx+34, fy+10, 4, 0, Math.PI*2);
ctx.fill();

ctx.fillStyle="#2b2b2b";
ctx.beginPath();
ctx.arc(fx+14, fy+11, 2, 0, Math.PI*2);
ctx.arc(fx+34, fy+11, 2, 0, Math.PI*2);
ctx.fill();

// top hat
ctx.fillStyle="#2a2320";
const hatLift = frogHatTip > 0 ? Math.sin(frogHatTip * 0.2) * 6 : 0;

ctx.fillRect(fx+10, fy-14 - hatLift, 28, 6);
ctx.fillRect(fx+16, fy-28 - hatLift, 16, 14);


// cane
ctx.strokeStyle="#6b3f2a";
ctx.lineWidth=3;
ctx.beginPath();
ctx.moveTo(fx+frog.width+4, fy+8);
ctx.lineTo(fx+frog.width+4, fy+frog.height+12);
ctx.stroke();

if (frogActive) {
  const bubbleY = fy - 96; // ← lift bubble above hat

  ctx.fillStyle = "rgba(255,255,248,0.95)";
  roundRect(ctx, fx - 24, bubbleY, 190, 48, 10);
  ctx.fill();

  ctx.strokeStyle = "#2b2b2b";
  ctx.stroke();

  ctx.fillStyle = "#2b2b2b";
  ctx.font = "12px ui-monospace";
ctx.fillText(
  apple.landed ? "Ah… it has chosen its place." : "The orchard listens.",
  fx - 12,
  bubbleY + 18
);
ctx.fillText("Some weight unlocks paths.",
 fx - 12,
 bubbleY + 34
);
}


/* PLAYER */
const px = player.x - camX;
const py = gy - player.height - player.y;

// shadow
ctx.fillStyle = "rgba(60,40,20,0.18)";
ctx.beginPath();
ctx.ellipse(px + player.width/2, gy + 5, 18, 6, 0, 0, Math.PI*2);
ctx.fill();
// ground contact tint
ctx.fillStyle = "rgba(90,70,40,0.08)";
ctx.beginPath();
ctx.ellipse(px + player.width/2, gy + 6, 22, 8, 0, 0, Math.PI*2);
ctx.fill();


// body
ctx.fillStyle = "#7a78b8";
roundRect(ctx, px, py, player.width, player.height, 8);
ctx.fill();

// outline body
ctx.strokeStyle = "rgba(40,30,20,0.6)";
ctx.lineWidth = 1.5;
ctx.stroke();

// eyes
ctx.fillStyle = "#ffffff";
ctx.beginPath();
ctx.arc(px + 12, py + 16, 3, 0, Math.PI*2);
ctx.arc(px + 28, py + 16, 3, 0, Math.PI*2);
ctx.fill();

ctx.fillStyle = "#2b2b2b";
ctx.beginPath();
ctx.arc(px + 12, py + 17, 1.5, 0, Math.PI*2);
ctx.arc(px + 28, py + 17, 1.5, 0, Math.PI*2);
ctx.fill();
}
}
/* ======================================================
   MAIN LOOP
   ====================================================== */
function update(){

  // console.log("UPDATE START y =", apple.y);

const now = performance.now();
const deltaTime = Math.min((now - lastTime) / 1000, 0.05);
lastTime = now;

  handleInput();
  applyPhysics();



// APPLE DROP LOGIC
// ================== APPLE STATE MACHINE ==================

const dt = deltaTime;

// --- geometry ---
const appleBottom = apple.y + apple.r;
const appleCenterX = apple.x;

const overStump =
  stump &&
  appleCenterX > stump.x &&
  appleCenterX < stump.x + stump.width;

const landingY = overStump ? gy - stump.height : gy;

// --- support check ---
const supported = appleBottom >= landingY && apple.vy >= 0;

// The apple comes to rest through the LAND step below, which also
// kicks off the bounce. (The old hard-lock here pre-empted that and
// stopped the apple from ever bouncing.)

// --- falling permission ---
if (!supported && apple.canFall(performance.now())) {
  apple.falling = true;
}

// --- falling physics ---
if (apple.falling) {
  apple.vy += apple.gravity * dt;

  if (apple.vy > apple.terminalVelocity) {
    apple.vy = apple.terminalVelocity;
  }

  apple.vy *= apple.airDrag;
  apple.y += apple.vy * dt;
}


// console.log(
//   "STATE",
//   "falling:", apple.falling,
//   "vy:", apple.vy,
//   "landed:", apple.landed,
//   "bottom>=ground:", appleBottom >= landingY
// );  


// LAND 

if (
  apple.falling &&
  apple.vy > 0 &&
  !apple.landed &&
  appleBottom >= landingY
  
) {
  const impactVy = apple.vy;   // how fast it was actually falling on impact

  apple.y = landingY - apple.r;
  apple.vy = 0;
  apple.falling = false;
  apple.landed = true;

  apple.bounce = 0;
  apple.bounceVy = impactVy * apple.bounceRestitution;   // first hop derived from real fall speed
  apple.settleThreshold =
    impactVy * Math.pow(apple.bounceRestitution, apple.targetBounces); // velocity floor for ~4 hops
  apple.glitter = 90;
}
  
// bounce + crack
if (apple.landed && !apple.settled) {
  
  apple.bounceVy -= apple.gravity * dt;   // same gravity the apple fell under
  apple.bounce += apple.bounceVy * dt;    // hop height above the rest surface

  if (apple.bounce <= 0) {          // came back down to the surface
    apple.bounce = 0;
    apple.bounceVy = -apple.bounceVy * apple.bounceRestitution;   // rebound, losing energy

    if (Math.abs(apple.bounceVy) < apple.settleThreshold) {   // hop too weak now — settle and split
      apple.bounceVy = 0;
      apple.settled = true;
      apple.landed = false;

      if (!apple.cracked) {
        apple.cracked = true;
        apple.split = true;
        apple.splitTimer = 90;
      }
    }
  }
} 
// --- CREATE 3 APPLE PIECES ---
// ================== APPLE SPLIT SPAWN ==================
if (apple.split) {

  const appleCenterX = apple.x;
  const appleCenterY = apple.y;

  const spread = Math.PI / 3;      // total 60° fan
  const baseAngle = -Math.PI / 2;  // upward

  for (let i = 0; i < 3; i++) {
    const angle = baseAngle + spread * (i - 1);
    const speed = 180 + Math.random() * 40;

    applePieces.push(
      createApplePiece(appleCenterX, appleCenterY, angle, speed));
  }

  apple.split = false; // 🔒 one-time spawn
  apple.pickupReady = true;
}

//       // apple can now be collected
//     apple.pickupReady = true;
//     }
//   }
// }
    

  

  // UPDATE APPLE PIECES (E1 GOES HERE)
  applePieces.forEach(p => {
    if (p.settled || p.collected) return;

    p.vy += p.gravity * deltaTime;
    p.vx *= p.airDrag;
    p.vy *= p.airDrag;

    p.x += p.vx * deltaTime;
    p.y += p.vy * deltaTime;
    p.rotation += p.spin * deltaTime;

    if (p.y + p.r >= gy) {
      p.y = gy - p.r;
      p.vx *= 0.4;
      p.vy = 0;
      p.spin *= 0.3;
      p.settled = true;
    }
  });

  // PICKUP: press down near a settled apple piece (checked before frog interaction)
  let pickupHandledThisFrame = false;

  applePieces.forEach(p => {
    if (!p.settled || p.collected || p.collecting) return;

    const dx = (player.x + player.width / 2) - p.x;
    const nearGround = player.y < 10; // player.y is jump-height above ground, not world y

    if (Math.abs(dx) < 26 && nearGround && keys.down) {
      p.collecting = true; // stops it being drawn/re-triggered as a ground piece
      startCollectAnimation(p, "appleSlice");
      pickupHandledThisFrame = true;
    }
  });

  updateFlyingItems(deltaTime, cameraX);

  // apple glitter decay
if (apple.glitter > 0) apple.glitter--;
if (apple.splitTimer > 0) apple.splitTimer--;

  // --- FROG INTERACTION (per-frame, correct place) ---
  const frogCenterX = frog.x + frog.width / 2;
  const playerCenterX = player.x + player.width / 2;

  const nearFrog =
    Math.abs(playerCenterX - frogCenterX) < 70 &&
    player.y < 6;

  if (nearFrog && keys.down && !frogActive && !pickupHandledThisFrame) {
    frogActive = true;
    frogHatTip = 30;
  }

if (apple.landed && !frogNoticedApple) {
  frogNoticedApple = true;
  frogHatTip = 40;
}

// check for player location near apple pieces
// if (apple.split && orchardChoice === null) {
//   orchardPaths.forEach(p => {
//     if (
//       Math.abs(player.x - p.x) < 30 &&
//       player.y === 0 &&
//       Math.abs(player.vy) < 0.1
//     ) {
//       orchardChoice = p.id;
//     }
//   });
// }

if (frogActive && apple.cracked && inventory.appleSlice > 0 && orchardChoice === null && keys.down) {
  orchardPaths.forEach(p => {
    if (
      Math.abs(player.x + player.width/2 - p.x) < 40 &&
      player.y === 0
    ) {
      orchardChoice = p.id;
      frogHatTip = 40;
      document.querySelectorAll(".map-node.locked").forEach(el => el.classList.remove("locked"));
    }
  });
}

  draw();

  const targetCam = player.x - canvas.width*0.4;
  cameraX += (targetCam - cameraX)*0.08;
  if (cameraX<0) cameraX=0;

  // console.log("UPDATE END y =", apple.y);
  
  requestAnimationFrame(update);
}


update();


});