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
const mapEl = document.getElementById("map");

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
const keys = { left:false, right:false, up:false, down:false, space:false, ctrl:false, upJustPressed:false, leftJustPressed:false, rightJustPressed:false };

window.addEventListener("keydown", e => {
  if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," ","Control"].includes(e.key)) {
    e.preventDefault();
  }
  if (e.key==="ArrowLeft") {
    if (!keys.left) keys.leftJustPressed = true;
    keys.left=true;
  }
  if (e.key==="ArrowRight") {
    if (!keys.right) keys.rightJustPressed = true;
    keys.right=true;
  }
  if (e.key==="ArrowUp") {
    if (!keys.up) keys.upJustPressed = true; // edge only — ignore key-repeat while held
    keys.up = true;
  }
  if (e.key==="ArrowDown") keys.down=true;
  if (e.key===" ") keys.space=true;
  if (e.key==="Control") keys.ctrl=true;
});

window.addEventListener("keyup", e => {
  if (e.key==="ArrowLeft") keys.left=false;
  if (e.key==="ArrowRight") keys.right=false;
  if (e.key==="ArrowUp") keys.up=false;
  if (e.key==="ArrowDown") keys.down=false;
  if (e.key===" ") keys.space=false;
  if (e.key==="Control") keys.ctrl=false;
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
   SCENE STATE (which world the player is currently in)
   ====================================================== */
let currentScene = "autumn"; // "autumn" | "spring" | "clouds"

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
  usedDoubleJump: false, // resets whenever player lands on anything
  vy: 0,
  vx: 0,               // horizontal momentum — only used during a swing launch
  launched: false,     // true while mid-flight from a swing release
  launchPeakHeight: 0  // tracks how high THIS launch has reached, for the cloud threshold check
};

/* ======================================================
   INVENTORY
   ====================================================== */
const inventory = {}; // e.g. { appleSlice: 2, boomerang: 1 }

const ITEM_ICONS = {
  appleSlice: "🍎",
  boomerang: "🪃",
  tulip: "🌷",
  crystal: "💎",
  bucket: "🪣"
};

// the bucket is stateful (empty/filling/full), unlike every other item
// which is just a count — tracked separately from the inventory dict
let bucketDropCount = 0;
let bucketFilled = false;
const BUCKET_DROPS_NEEDED = 3;

// heldItem = the item type currently "picked up" in hand, ready to place
// into a slot. Click an inventory chip to select/deselect it.
let heldItem = null;

// World-space position of the held item's floating indicator (above the
// player's head, gently bobbing). Shared by the draw call AND by the place
// animation's starting point, so the flight begins exactly where the
// indicator was hovering — no visual jump.
function getHeldItemWorldPos() {
  const bob = Math.sin(performance.now() * 0.005) * 4;
  return {
    x: player.x + player.width / 2,
    y: gy - player.y - player.height - 14 + bob
  };
}

function addToInventory(itemType) {
  inventory[itemType] = (inventory[itemType] || 0) + 1;
  updateInventoryUI();
}

function selectHeldItem(itemType) {
  if (!inventory[itemType] || inventory[itemType] <= 0) return;
  heldItem = heldItem === itemType ? null : itemType; // click again to deselect
  updateInventoryUI();
}

// items whose inventory chip should show the ACTUAL drawn world-shape
// (with live state) instead of an emoji — for anything stateful, or
// anything without a good emoji match. Bucket is the first user; any
// future item can opt in the same way.
const ITEM_CANVAS_RENDER = {
  bucket: (iconCtx) => {
    iconCtx.clearRect(0, 0, 20, 20);
    drawBucketShape(iconCtx, 10, 12, 7, 0);
  }
};

function updateInventoryUI() {
  const entries = Object.entries(inventory);
  invEl.innerHTML = "";

  if (!entries.length) {
    invEl.textContent = "(empty)";
    return;
  }

  entries.forEach(([type, count]) => {
    const chip = document.createElement("span");
    chip.style.cursor = "pointer";
    chip.style.marginRight = "8px";
    chip.style.padding = "1px 5px";
    chip.style.borderRadius = "4px";
    chip.style.border = heldItem === type ? "2px solid #2b2b2b" : "2px solid transparent";
    chip.style.display = "inline-flex";
    chip.style.alignItems = "center";

    if (ITEM_CANVAS_RENDER[type]) {
      const iconCanvas = document.createElement("canvas");
      iconCanvas.width = 20;
      iconCanvas.height = 20;
      iconCanvas.style.verticalAlign = "middle";
      ITEM_CANVAS_RENDER[type](iconCanvas.getContext("2d"));
      chip.appendChild(iconCanvas);

      chip.title = type === "bucket"
        ? (bucketFilled ? "Full — carry it down to spring" : `${bucketDropCount}/${BUCKET_DROPS_NEEDED} drops collected`)
        : "Click to hold this item";
    } else {
      chip.textContent = `${ITEM_ICONS[type] || "?"} x${count}`;
      chip.title = "Click to hold this item";
    }

    chip.addEventListener("click", () => selectHeldItem(type));
    invEl.appendChild(chip);
  });
}

/* ======================================================
   FROG NPC
   ====================================================== */
const frog = {
  x: 1090,
  y: 0,
  width: 48,
  height: 36,
  bob: 0,
  bobSpeed: 0.04,
  active: false,  // generic NPC shell field — has the player approached & activated it
  tip: 0          // generic NPC shell field — brief "reacted to something" animation timer
};
let frogTalked = false;
let frogNoticedApple = false; // bespoke to frog's story beat, not part of the generic shell

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
   RAMP (simple slope, no momentum yet — walk speed only)
   ====================================================== */
const ramps = [
  {
    x: 870,
    width: 60,
    heightStart: 25,  // elevated above ground — requires a jump to get onto it
    heightEnd: 78      // ground height at right edge — leads up to the boomerang
  }
];

/* ======================================================
   BOOMERANG (static collectible, tucked into tree 2's canopy)
   ====================================================== */
const boomerang = {
  x: 918,
  heightAboveGround: 82, // sits just above the top of the new, elevated ramp
  collected: false,
  collecting: false
};

/* ======================================================
   SCENE CONNECTIONS (bidirectional links between scenes —
   one definition generates a matching door on both sides,
   so every doorway in the game is visually/behaviorally
   consistent instead of hand-building each end separately)
   ====================================================== */

// glow palette used on a door, keyed by WHICH SCENE IT LEADS TO —
// so a door hints at its destination regardless of which side you view it from
const DOOR_GLOW = {
  spring: { // seen while standing in autumn, leads to spring — light green hint
    stops: ["rgba(210,235,175,0.95)", "rgba(175,215,140,0.75)", "rgba(140,190,120,0.55)"],
    bleed: "170,205,130"
  },
  autumn: { // seen while standing in spring, leads to autumn — med-dark amber
    stops: ["rgba(165,115,58,0.92)", "rgba(122,82,42,0.8)", "rgba(80,55,28,0.65)"],
    bleed: "120,80,40"
  }
};

const connections = [
  {
    id: "autumn-spring",
    doors: {
      autumn: { x: 1200, width: 56, height: 92, leadsTo: "spring" },
      spring: { x: 200,  width: 56, height: 92, leadsTo: "autumn" }
    },
    acceptsItemType: "appleSlice",
    filled: false,
    filledItemType: null
  },
  {
    // map-only entry — spring<->clouds travel is already handled by the
    // swing (up) and the cloud-hole (down), not a door pair. This exists
    // purely so updateMapUI() draws an edge between the two nodes; the
    // "doors" data here is never used for anything physical.
    id: "spring-clouds",
    doors: {
      spring: { leadsTo: "clouds" },
      clouds: { leadsTo: "spring" }
    },
    acceptsItemType: null,
    filled: true,
    filledItemType: null
  }
];

/* ======================================================
   MAP (fog-of-war, graph-driven — replaces the old
   hardcoded HTML nodes). Nodes = scenes, edges = connections.
   A scene only appears once you've actually been there.
   ====================================================== */
const sceneMapInfo = {
  autumn: { label: "Autumn", x: 40,  y: 40 },
  spring: { label: "Spring", x: 220, y: 40 },
  clouds: { label: "Clouds", x: 400, y: 40 }
};

const discoveredScenes = { autumn: true }; // autumn is where you start

// a thin rotated div connecting two node centers — same visual language
// (dashed border) as the existing .map-node CSS, no new stylesheet needed
function createEdgeLine(x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const length = Math.sqrt(dx * dx + dy * dy);
  const angle = Math.atan2(dy, dx) * 180 / Math.PI;

  const line = document.createElement("div");
  line.style.position = "absolute";
  line.style.left = x1 + "px";
  line.style.top = y1 + "px";
  line.style.width = length + "px";
  line.style.height = "0";
  line.style.borderTop = "3px dashed #2b2b2b";
  line.style.opacity = "0.55";
  line.style.transformOrigin = "0 0";
  line.style.transform = `rotate(${angle}deg)`;
  return line;
}

// where a ray from a rectangle's center, heading in a given direction,
// exits that rectangle — used to clip edges to node boundaries instead
// of running straight through their centers
function rectEdgeIntersection(cx, cy, halfW, halfH, dirX, dirY) {
  const tX = dirX !== 0 ? halfW / Math.abs(dirX) : Infinity;
  const tY = dirY !== 0 ? halfH / Math.abs(dirY) : Infinity;
  const t = Math.min(tX, tY);
  return { x: cx + dirX * t, y: cy + dirY * t };
}

// rebuilds the map from scratch each time — cheap, and guarantees it never
// drifts out of sync with discoveredScenes/currentScene
function updateMapUI() {
  if (!mapEl) return;
  mapEl.innerHTML = "";

  const NODE_W = 120, NODE_H = 60; // matches .map-node's CSS dimensions

  // edges first, so nodes render on top of them
  connections.forEach(conn => {
    const [sceneA, sceneB] = Object.keys(conn.doors);
    if (!discoveredScenes[sceneA] || !discoveredScenes[sceneB]) return;

    const a = sceneMapInfo[sceneA];
    const b = sceneMapInfo[sceneB];
    if (!a || !b) return;

    const aCenterX = a.x + NODE_W / 2, aCenterY = a.y + NODE_H / 2;
    const bCenterX = b.x + NODE_W / 2, bCenterY = b.y + NODE_H / 2;

    const dx = bCenterX - aCenterX, dy = bCenterY - aCenterY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;
    const dirX = dx / dist, dirY = dy / dist;

    const start = rectEdgeIntersection(aCenterX, aCenterY, NODE_W / 2, NODE_H / 2, dirX, dirY);
    const end = rectEdgeIntersection(bCenterX, bCenterY, NODE_W / 2, NODE_H / 2, -dirX, -dirY);

    mapEl.appendChild(createEdgeLine(start.x, start.y, end.x, end.y));
  });

  // nodes — only discovered scenes appear at all (true fog-of-war, not
  // "visible but greyed out" like the old .locked approach)
  Object.entries(discoveredScenes).forEach(([scene, discovered]) => {
    if (!discovered) return;
    const info = sceneMapInfo[scene];
    if (!info) return;

    const node = document.createElement("div");
    node.className = "map-node";
    node.style.left = info.x + "px";
    node.style.top = info.y + "px";
    node.textContent = info.label;

    if (scene === "spring") {
      node.style.background = "rgba(180,222,150,0.35)"; // slight light green
    }

    if (scene === currentScene) {
      node.style.borderStyle = "solid";
      node.style.borderColor = "#c9a25a";
      if (scene !== "spring") {
        node.style.background = "rgba(201,162,90,0.15)";
      }
    }

    mapEl.appendChild(node);
  });
}

// push the map down below the inventory box (#ui sits at top:8px) so they
// don't overlap — done here in JS rather than editing index.html's CSS
if (mapEl) {
  mapEl.style.marginTop = "70px";
}

updateMapUI(); // populate once at load, so autumn shows up immediately

// per-scene spawn points — landing right in front of whichever door you
// just came through, on either side
const sceneSpawns = {
  autumn: { x: connections[0].doors.autumn.x - 25 },
  spring: { x: connections[0].doors.spring.x - 25 },
  clouds: { x: 420 } // no door here — you arrive by launch; positioned right of the return hole (300-360)
};

/* ======================================================
   PLACEMENT SLOTS (generic "hold an item, walk up, press
   down to place it" — reusable for any future lock/item)
   ====================================================== */
const placementSlots = [
  {
    id: "doorwaySlot",
    x: connections[0].doors.autumn.x + connections[0].doors.autumn.width / 2,
    heightAboveGround: 8, // low enough to reach while standing — doorway stays on the ground
    acceptsItemType: connections[0].acceptsItemType,
    filled: false,
    onFill: (itemType) => {
      // unlocking is shared across the whole connection — both doors
      // reflect it, and both show the item that unlocked them
      connections[0].filled = true;
      connections[0].filledItemType = itemType;
    }
  }
];

/* ======================================================
   SEASON TRANSITION (fade -> scene swap -> fade back)
   ====================================================== */
const seasonTransition = {
  phase: "idle", // "idle" -> "fadeOut" -> "hold" -> "fadeIn" -> back to "idle"
  t: 0,
  targetScene: null
};

// the brief moment of visibly landing/settling on the goal cloud before
// the actual fade-to-clouds transition kicks in — contact isn't instant fade
const cloudLanding = { active: false, t: 0 };
const CLOUD_LANDING_HOLD = 550; // ms

const TRANSITION_DURATIONS = { fadeOut: 600, hold: 1400, fadeIn: 600 };

function startSeasonTransition(targetScene) {
  seasonTransition.phase = "fadeOut";
  seasonTransition.t = 0;
  seasonTransition.targetScene = targetScene;
}

function updateSeasonTransition(deltaTime) {
  if (seasonTransition.phase === "idle") return;

  seasonTransition.t += deltaTime * 1000;
  const dur = TRANSITION_DURATIONS[seasonTransition.phase];

  if (seasonTransition.t >= dur) {
    seasonTransition.t = 0;

    if (seasonTransition.phase === "fadeOut") {
      // screen is fully white now — swap the actual scene behind it
      currentScene = seasonTransition.targetScene;
      discoveredScenes[currentScene] = true;
      updateMapUI(); // covers both "newly discovered" and "current-scene highlight moved"
      const spawn = sceneSpawns[currentScene];
      player.x = spawn.x;
      player.y = 0;
      player.vy = 0;
      player.jumping = false;
      player.usedDoubleJump = false;
      cameraX = 0;

      seasonTransition.phase = "hold";
    } else if (seasonTransition.phase === "hold") {
      seasonTransition.phase = "fadeIn";
    } else if (seasonTransition.phase === "fadeIn") {
      seasonTransition.phase = "idle";
      seasonTransition.targetScene = null;
    }
  }
}

function drawSeasonTransition(ctx) {
  if (seasonTransition.phase === "idle") return;

  let alpha = 1;
  if (seasonTransition.phase === "fadeOut") {
    alpha = seasonTransition.t / TRANSITION_DURATIONS.fadeOut;
  } else if (seasonTransition.phase === "fadeIn") {
    alpha = 1 - seasonTransition.t / TRANSITION_DURATIONS.fadeIn;
  }
  alpha = Math.min(Math.max(alpha, 0), 1);

  const target = seasonTransition.targetScene;

  // soft multi-tone wash, blended per target scene — reads as a gentle
  // blur rather than a flat card, without needing an actual blur filter
  ctx.save();
  ctx.globalAlpha = alpha;

  const cx = canvas.width / 2;
  const cy = canvas.height / 2;
  const washRadius = canvas.width * 0.75;
  const wash = ctx.createRadialGradient(cx, cy, 30, cx, cy, washRadius);

  if (target === "autumn") {
    wash.addColorStop(0, "#c9a25a");   // warm amber center
    wash.addColorStop(0.55, "#a98a4a"); // olive-amber
    wash.addColorStop(1, "#6b5a30");   // deep olive edge
  } else if (target === "spring") {
    wash.addColorStop(0, "#d7edb0");   // soft light green center
    wash.addColorStop(0.55, "#bfe3a0"); // light green
    wash.addColorStop(1, "#9ccf90");   // deeper green edge
  } else {
    wash.addColorStop(0, "#f7f4ee");
    wash.addColorStop(1, "#f7f4ee");
  }

  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.restore();

  // scene name card, once mostly faded in
  if (alpha > 0.5 && target) {
    const textAlpha = (alpha - 0.5) / 0.5;
    const label = target[0].toUpperCase() + target.slice(1);
    ctx.fillStyle = `rgba(43,43,43,${textAlpha})`;
    ctx.font = "20px ui-monospace";
    const prevAlign = ctx.textAlign;
    ctx.textAlign = "center";
    ctx.fillText(label, canvas.width / 2, canvas.height / 2);
    ctx.textAlign = prevAlign;
  }
}

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
  { x: 620, y: 90, speed: 0.18, phase: Math.random()*Math.PI*2 },
  { x: 1050, y: 140, speed: 0.22, phase: Math.random()*Math.PI*2 },
  { x: 900, y: 170, speed: 0.15, phase: Math.random()*Math.PI*2 },
  { x: 1300, y: 115, speed: 0.3, phase: Math.random()*Math.PI*2 }
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
   ITEM FLIGHT ANIMATION (collect: piece -> basket, or
   place: basket -> a placement slot). Both share one system.
   ====================================================== */
const flyingItems = [];

const COLLECT_DURATIONS = { toCenter: 800, hold: 400, toBasket: 900 };
const PLACE_DURATIONS = { fromPlayer: 500, hold: 300, toTarget: 700 };

function easeOutCubic(t) {
  return 1 - Math.pow(1 - t, 3);
}

// Deterministic pseudo-random: same input always gives the same output.
// Used anywhere something should look "randomized" but stay stable frame
// to frame (fruit layout per tree, infinite grass/flower scatter, etc.)
// instead of actually re-rolling every render.
function pseudoRandom(n) {
  const x = Math.sin(n * 12.9898) * 43758.5453;
  return x - Math.floor(x);
}

function startCollectAnimation(piece, itemType) {
  flyingItems.push({
    mode: "collect",
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

// itemType already deducted from inventory by the caller before this starts —
// the flight is purely visual at this point.
function startPlaceAnimation(itemType, targetWorldX, targetWorldY, onArrive) {
  const startPos = getHeldItemWorldPos(); // begins right where the indicator was hovering

  flyingItems.push({
    mode: "place",
    itemType,
    x: startPos.x,
    y: startPos.y,
    startX: startPos.x,
    startY: startPos.y,
    targetX: targetWorldX,
    targetY: targetWorldY,
    phase: "fromPlayer",     // "fromPlayer" -> "hold" -> "toTarget"
    t: 0,
    size: 10,
    scale: 1.2,
    rotation: 0,
    onArrive
  });
}

function updateFlyingItems(deltaTime, camX) {
  const dtMs = deltaTime * 1000;

  for (let i = flyingItems.length - 1; i >= 0; i--) {
    const f = flyingItems[i];
    f.t += dtMs;

    if (f.mode === "collect") {
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

    } else if (f.mode === "place") {
      if (f.phase === "fromPlayer") {
        const dur = PLACE_DURATIONS.fromPlayer;
        const p = easeOutCubic(Math.min(f.t / dur, 1));

        const centerWorldX = camX + canvas.width / 2;
        const centerWorldY = canvas.height / 2;

        f.x = f.startX + (centerWorldX - f.startX) * p;
        f.y = f.startY + (centerWorldY - f.startY) * p;
        f.scale = 1.2 - p * 0.2;

        if (f.t >= dur) {
          f.phase = "hold";
          f.t = 0;
          f.holdX = f.x;
          f.holdY = f.y;
        }

      } else if (f.phase === "hold") {
        if (f.t >= PLACE_DURATIONS.hold) {
          f.phase = "toTarget";
          f.t = 0;
        }

      } else if (f.phase === "toTarget") {
        const dur = PLACE_DURATIONS.toTarget;
        const p = easeOutCubic(Math.min(f.t / dur, 1));

        f.x = f.holdX + (f.targetX - f.holdX) * p;
        f.y = f.holdY + (f.targetY - f.holdY) * p;
        f.scale = 1 - p * 0.3; // settles smaller into the slot

        if (f.t >= dur) {
          if (f.onArrive) f.onArrive();
          flyingItems.splice(i, 1);
        }
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
   TRIGGER ZONES (generic proximity + "press down" helper)
   ====================================================== */
// Every interactive thing in the game (frog, pickups, orchard paths, and
// eventually doorways) is checked against the player the same way: how far
// horizontally, and how far vertically — using "height above ground" for
// BOTH, the same units player.y/platforms/ramps/stump/frog already use.
// This replaced 4 separate hand-rolled proximity checks that had each
// drifted slightly different from each other.
function isPlayerNear(targetX, targetHeight, radiusX, radiusYUp = 10, radiusYDown = 10) {
  const dx = (player.x + player.width / 2) - targetX;
  const dy = player.y - targetHeight; // positive = player is above the target

  return Math.abs(dx) <= radiusX && dy <= radiusYUp && dy >= -radiusYDown;
}

function pressedDownNear(targetX, targetHeight, radiusX, radiusYUp, radiusYDown) {
  return keys.space && isPlayerNear(targetX, targetHeight, radiusX, radiusYUp, radiusYDown);
}

// generic NPC shell: idle bob + brief "reacted to something" timer decay.
// Any NPC with {bob, bobSpeed, tip} can use this — no frog-specific logic here.
function updateNPCIdle(npc) {
  npc.bob += npc.bobSpeed;
  if (npc.tip > 0) npc.tip--;
}

/* ======================================================
   INPUT HANDLING
   ====================================================== */
function handleInput(){
  if (!camera.topDown && seasonTransition.phase === "idle" && !fallState.active && !swing.mounted && !player.launched && !cloudLanding.active && !rabbitShuttle.mounted) {
    if (keys.left) player.x -= player.speed;
    if (keys.right) player.x += player.speed;

    if (keys.upJustPressed) {
      const nearSwing = currentScene === "spring" &&
        isPlayerNear(swing.pivotX, swing.pivotHeightAboveGround - SWING_ROPE_LENGTH, 30, 20, 55);

      if (nearSwing) {
        // jumping onto the swing takes priority over a normal jump here
        swing.mounted = true;
        swing.angularVelocity = 0;
        swing.mountTime = 0;
        swing.peakAngularVelocity = 0;
      } else if (!player.jumping) {
        // first jump
        player.jumping = true;
        player.vy = 12;
        player.usedDoubleJump = false;
      } else if (!player.usedDoubleJump) {
        // double jump — a bit weaker than the first, so it reads as a
        // secondary boost rather than an equally strong second jump
        player.vy = 9;
        player.usedDoubleJump = true;
      }
    }
  }
  // NOTE: upJustPressed is NOT consumed here — updateSwing() (called later
  // this same frame, for the release action) still needs to see it. It gets
  // consumed once, at the very end of the frame, alongside left/right.

  // hard left world boundary — the camera also clamps at 0, so this keeps
  // "camera stops" and "character stops" happening at the same moment
  if (player.x < 0) player.x = 0;

  if (keys.ctrl && !camera.locked) {
    camera.topDown = !camera.topDown;
    camera.locked = true;
    overlayEl.style.display = camera.topDown ? "block" : "none";
  }
  if (!keys.ctrl) camera.locked = false;
}

/* ======================================================
   PHYSICS
   ====================================================== */
function applyPhysics(){
  // while on the swing, position is fully driven by updateSwing() —
  // no normal gravity/ground physics applies at all
  if (swing.mounted) return;

  // same idea for the rabbit-shuttle — position is driven by updateRabbitShuttle()
  if (rabbitShuttle.mounted) return;

  // frozen in place during the brief "settled on the cloud" beat
  if (cloudLanding.active) return;

  if (player.launched) {
    // horizontal momentum from the swing release, plus gravity that's
    // stricter on the way up (normal jump feel) and floatier on the way
    // down if the launch didn't reach the goal cloud
    player.x += player.vx;

    const ascending = player.vy > 0;
    player.y += player.vy;
    player.vy -= ascending ? LAUNCH_GRAVITY : FLOATY_FALL_GRAVITY;

    if (player.y > player.launchPeakHeight) {
      player.launchPeakHeight = player.y;
    }

    // hit the actual visible cloud — not an invisible number
    const dx = (player.x + player.width / 2) - goalCloud.x;
    const dy = player.y - goalCloud.height;
    const hitGoalCloud = Math.sqrt(dx * dx + dy * dy) < goalCloud.radius;

    if (hitGoalCloud && seasonTransition.phase === "idle" && !cloudLanding.active) {
      // land ON the cloud, don't just clip through it — freeze here briefly
      player.launched = false;
      player.vx = 0;
      player.vy = 0;
      player.y = goalCloud.height;
      cloudLanding.active = true;
      cloudLanding.t = 0;
      return;
    }

    if (player.y <= 0) {
      player.y = 0;
      player.vy = 0;
      player.vx = 0;
      player.jumping = false;
      player.usedDoubleJump = false;
      player.launched = false;
    }

    return; // launched flight ignores platforms/ramp/stump entirely — spring has none anyway
  }

  // gravity
  player.y += player.vy;
  player.vy -= 0.8;

  // ground collision
  if (player.y <= 0) {
    player.y = 0;
    player.jumping = false;
    player.usedDoubleJump = false;
    player.vy = 0;
  }

  // everything below is autumn-specific (its platforms, ramp, stump, frog) —
  // guarded so future scenes don't inherit autumn's solid surfaces
  if (currentScene === "autumn") {

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
    player.usedDoubleJump = false;
  }
});

  // stump collision — same surface the apple lands on, now jumpable by the player too
  {
    const stumpTop = stump.height;
    const playerBottom = player.y;

    if (
      player.x + player.width > stump.x &&
      player.x < stump.x + stump.width &&
      playerBottom <= stumpTop &&
      playerBottom >= stumpTop - 14 &&
      player.vy <= 0
    ) {
      player.y = stumpTop;
      player.vy = 0;
      player.jumping = false;
      player.usedDoubleJump = false;
    }
  }

  // ramp collision — samples slope height at the player's x each frame
  ramps.forEach(r => {
    if (player.x + player.width > r.x && player.x < r.x + r.width) {
      const t = Math.min(Math.max((player.x + player.width / 2 - r.x) / r.width, 0), 1);
      const rampHeight = r.heightStart + (r.heightEnd - r.heightStart) * t;
      const heightDiff = rampHeight - player.y; // positive = ramp surface is above the player

      // only snap if actually near the surface — not just anywhere below it
      if (heightDiff >= -6 && heightDiff <= 10 && player.vy <= 0) {
        player.y = rampHeight;
        player.vy = 0;
        player.jumping = false;
        player.usedDoubleJump = false;
      }
    }
  });

  updateNPCIdle(frog);

  } else if (currentScene === "clouds") {

  // hop-cloud platform collision — same pattern as autumn's platforms.
  // Missing a jump just means falling through to the base cloud-ground,
  // no hazard — these are stepping stones, not another set of holes.
  hopClouds.forEach(p => {
    const platformTop = p.height;
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
      player.usedDoubleJump = false;
    }
  });

  } // end currentScene checks
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

// wraps a single sentence into multiple lines that each fit within maxWidth
function wrapText(ctx, text, maxWidth) {
  const words = text.split(" ");
  const lines = [];
  let current = "";

  words.forEach(word => {
    const test = current ? current + " " + word : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  });
  if (current) lines.push(current);
  return lines;
}

// generic NPC speech bubble — rounded box, border, auto-wrapped text sized
// to fit. Any NPC hands this an anchor point + its own dialogue sentences;
// the bubble figures out how many lines that actually takes and sizes
// itself accordingly, so nothing overflows regardless of length.
function drawSpeechBubble(ctx, x, y, sentences) {
  const bubbleWidth = 160;
  const maxTextWidth = bubbleWidth - 34; // padding on both sides
  const lineHeight = 13;

  ctx.font = "10px ui-monospace"; // set before measuring, so wrapping is accurate

  const allLines = [];
  sentences.forEach(sentence => {
    allLines.push(...wrapText(ctx, sentence, maxTextWidth));
  });

  const bubbleHeight = Math.max(38, allLines.length * lineHeight + 14);

  ctx.fillStyle = "rgba(255,255,248,0.95)";
  roundRect(ctx, x - 24, y, bubbleWidth, bubbleHeight, 9);
  ctx.fill();

  ctx.strokeStyle = "#2b2b2b";
  ctx.stroke();

  ctx.fillStyle = "#2b2b2b";
  allLines.forEach((line, i) => {
    ctx.fillText(line, x - 12, y + 15 + i * lineHeight);
  });
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

  // apples + highlight — count and layout vary per tree (seeded by x), but
  // structured into evenly-divided slots with bounded jitter, so spacing
  // between fruits always stays within a min/max range instead of fully
  // random placement risking overlaps or big gaps
  const appleCount = 5 + Math.floor(pseudoRandom(x * 0.077) * 3); // 5-7
  const appleAngleStep = (Math.PI * 2) / appleCount;
  const appleJitterMax = appleAngleStep * 0.25;

  for (let i = 0; i < appleCount; i++) {
    const jitter = (pseudoRandom(x * 0.31 + i * 1.7) - 0.5) * 2 * appleJitterMax;
    const angle = appleAngleStep * i + jitter;
    const radius = 22 + pseudoRandom(x * 0.53 + i * 2.3) * 14; // tighter band = more consistent ring
    const decoX = tx + Math.cos(angle) * radius;
    const decoY = (gy - 120) + Math.sin(angle) * radius;

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

// spring fruit trees — same trunk+canopy structure as drawAppleTree,
// generalized by fruit type. "pear" is the round-vs-teardrop distinction:
// plum/peach are round dots, pear gets an actual teardrop shape.
const FRUIT_STYLES = {
  plum:  { color: "#6b3f7a", size: 6, shape: "round" },
  peach: { color: "#e8935a", size: 7, shape: "round" },
  pear:  { color: "#c3cf5e", size: 7, shape: "teardrop" }
};

function drawFruitTree(x, camX, type) {
  const tx = x - camX;
  const style = FRUIT_STYLES[type];

  // trunk
  ctx.fillStyle = "#6b4026";
  ctx.fillRect(tx - 12, gy - 96, 24, 96);

  // ground shadow
  ctx.fillStyle = "rgba(120,90,60,0.18)";
  ctx.beginPath();
  ctx.ellipse(tx, gy + 2, 22, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  // bark line
  ctx.strokeStyle = "rgba(40,20,10,0.25)";
  ctx.beginPath();
  ctx.moveTo(tx - 6, gy - 20);
  ctx.lineTo(tx - 6, gy - 80);
  ctx.stroke();

  // canopy — spring green, gentle pulse (x-offset so trees don't pulse in sync)
  const pulse = 0.08 + Math.sin(performance.now() * 0.0012 + x) * 0.04;
  ctx.fillStyle = `rgba(120,170,90,${0.9 + pulse})`;
  ctx.beginPath();
  ctx.arc(tx, gy - 120, 50, 0, Math.PI * 2);
  ctx.fill();

  // fruit + highlight — count and layout vary per tree (seeded by x and
  // type), structured into evenly-divided slots with bounded jitter, so
  // spacing between fruits stays within a min/max range
  const typeSeed = { plum: 0, peach: 5, pear: 11 }[type] || 0;
  const fruitCount = 5 + Math.floor(pseudoRandom(x * 0.077 + typeSeed) * 3); // 5-7
  const fruitAngleStep = (Math.PI * 2) / fruitCount;
  const fruitJitterMax = fruitAngleStep * 0.25;

  for (let i = 0; i < fruitCount; i++) {
    const jitter = (pseudoRandom(x * 0.31 + typeSeed + i * 1.7) - 0.5) * 2 * fruitJitterMax;
    const angle = fruitAngleStep * i + jitter;
    const radius = 22 + pseudoRandom(x * 0.53 + typeSeed + i * 2.3) * 14;
    const decoX = tx + Math.cos(angle) * radius;
    const decoY = (gy - 120) + Math.sin(angle) * radius;

    ctx.fillStyle = style.color;
    if (style.shape === "teardrop") {
      ctx.beginPath();
      ctx.moveTo(decoX, decoY - style.size);
      ctx.quadraticCurveTo(decoX + style.size * 0.9, decoY, decoX, decoY + style.size);
      ctx.quadraticCurveTo(decoX - style.size * 0.9, decoY, decoX, decoY - style.size);
      ctx.closePath();
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(decoX, decoY, style.size, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.fillStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.arc(decoX - 2, decoY - 2, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}

// simple rounded bush — no trunk, just a canopy cluster at ground level
function drawBush(x, camX) {
  const bx = x - camX;

  ctx.fillStyle = "rgba(90,90,50,0.15)";
  ctx.beginPath();
  ctx.ellipse(bx + 6, gy + 3, 20, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(100,150,80,0.85)";
  ctx.beginPath();
  ctx.arc(bx - 8, gy - 10, 13, 0, Math.PI * 2);
  ctx.arc(bx + 8, gy - 15, 15, 0, Math.PI * 2);
  ctx.arc(bx + 22, gy - 9, 11, 0, Math.PI * 2);
  ctx.fill();
}

// soft cloud — a cluster of overlapping ellipses, slow parallax (further
// back than the tree layers) since it sits high in the sky
function drawCloud(x, y, scale, camX) {
  const cx = x - camX * 0.15;

  ctx.fillStyle = "rgba(255,255,255,0.75)";
  ctx.beginPath();
  ctx.ellipse(cx, y, 30 * scale, 14 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 22 * scale, y - 6 * scale, 20 * scale, 12 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(cx - 22 * scale, y - 4 * scale, 18 * scale, 11 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 8 * scale, y - 12 * scale, 16 * scale, 10 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
}

// wisp — long, flat, stretched horizontal streak
function drawCloudWisp(x, y, scale, camX) {
  const cx = x - camX * 0.15;

  ctx.fillStyle = "rgba(255,255,255,0.6)";
  ctx.beginPath();
  ctx.ellipse(cx, y, 55 * scale, 8 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 42 * scale, y - 2 * scale, 30 * scale, 6 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(cx - 46 * scale, y + 2 * scale, 32 * scale, 7 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
}

// stack — taller, layered, more vertical prominence
function drawCloudStack(x, y, scale, camX) {
  const cx = x - camX * 0.15;

  ctx.fillStyle = "rgba(255,255,255,0.8)";
  ctx.beginPath();
  ctx.ellipse(cx, y, 26 * scale, 16 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(cx - 14 * scale, y - 14 * scale, 20 * scale, 14 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 6 * scale, y - 27 * scale, 16 * scale, 12 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 18 * scale, y - 8 * scale, 18 * scale, 13 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
}

// decorative-only animal silhouettes — background clouds shaped like
// animals, not walkable. Simpler than the interactive platform versions.
function drawCloudBunnyBg(x, y, scale, camX) {
  const cx = x - camX * 0.15;
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.beginPath();
  ctx.ellipse(cx - 10 * scale, y - 20 * scale, 6 * scale, 16 * scale, -0.15, 0, Math.PI * 2);
  ctx.ellipse(cx + 6 * scale, y - 20 * scale, 6 * scale, 16 * scale, 0.15, 0, Math.PI * 2);
  ctx.ellipse(cx, y, 26 * scale, 16 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawCloudWhaleBg(x, y, scale, camX) {
  const cx = x - camX * 0.15;
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.beginPath();
  ctx.ellipse(cx, y, 38 * scale, 18 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(cx - 34 * scale, y - 10 * scale, 10 * scale, 14 * scale, 0.3, 0, Math.PI * 2);
  ctx.fill();
}

function drawCloudAlligatorBg(x, y, scale, camX) {
  const cx = x - camX * 0.15;
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.beginPath();
  ctx.ellipse(cx, y, 42 * scale, 12 * scale, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + 40 * scale, y + 2 * scale, 10 * scale, 7 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawCloudHummingbirdBg(x, y, scale, camX) {
  const cx = x - camX * 0.15;
  const wingFlap = Math.sin(performance.now() * 0.02) * 0.4;

  ctx.fillStyle = "rgba(255,255,255,0.9)";
  // body
  ctx.beginPath();
  ctx.ellipse(cx, y, 14 * scale, 7 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  // beak
  ctx.beginPath();
  ctx.moveTo(cx + 13 * scale, y);
  ctx.lineTo(cx + 23 * scale, y - 1 * scale);
  ctx.lineTo(cx + 13 * scale, y + 2 * scale);
  ctx.closePath();
  ctx.fill();

  // flapping wing
  ctx.save();
  ctx.translate(cx - 2 * scale, y - 4 * scale);
  ctx.rotate(wingFlap);
  ctx.beginPath();
  ctx.ellipse(0, 0, 11 * scale, 4 * scale, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// dispatcher — picks the right silhouette by type, "puffy" (drawCloud) is the default
function drawBackgroundCloud(x, y, scale, type, camX) {
  if (type === "wisp") drawCloudWisp(x, y, scale, camX);
  else if (type === "stack") drawCloudStack(x, y, scale, camX);
  else if (type === "bunny") drawCloudBunnyBg(x, y, scale, camX);
  else if (type === "whale") drawCloudWhaleBg(x, y, scale, camX);
  else if (type === "alligator") drawCloudAlligatorBg(x, y, scale, camX);
  else if (type === "hummingbird") drawCloudHummingbirdBg(x, y, scale, camX);
  else drawCloud(x, y, scale, camX);
}

// a gap in the ground — jump it or fall through
function drawHole(x, width, camX) {
  const hx = x - camX + width / 2;

  const pit = ctx.createRadialGradient(hx, gy + 2, 2, hx, gy + 2, width / 2 + 4);
  pit.addColorStop(0, "rgba(20,15,10,0.95)");
  pit.addColorStop(0.7, "rgba(35,28,18,0.85)");
  pit.addColorStop(1, "rgba(60,50,30,0)");

  ctx.fillStyle = pit;
  ctx.beginPath();
  ctx.ellipse(hx, gy + 2, width / 2 + 4, (width / 2 + 4) * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // rim shadow so it reads as a real gap, not just a dark smudge
  ctx.strokeStyle = "rgba(20,15,10,0.4)";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(hx, gy + 2, width / 2, width / 2 * 0.4, 0, 0, Math.PI * 2);
  ctx.stroke();
}

// rabbit NPC — bespoke art (long ears, no hat/cane), but reuses the same
// idle-bob and speech-bubble mechanics as frog via the shared shell
function drawRabbit(camX) {
  const rx = rabbit.x - camX;
  const ry = gy - rabbit.height + Math.sin(rabbit.bob) * 2;

  // shadow
  ctx.fillStyle = "rgba(40,30,20,0.22)";
  ctx.beginPath();
  ctx.ellipse(rx + rabbit.width / 2, gy + 4, 18, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  const earTwitch = rabbit.tip > 0 ? Math.sin(rabbit.tip * 0.3) * 5 : 0;

  // ears (behind body)
  ctx.fillStyle = "#e8ddc8";
  ctx.beginPath();
  ctx.ellipse(rx + 10, ry - 14 + earTwitch, 5, 16, -0.15, 0, Math.PI * 2);
  ctx.ellipse(rx + 26, ry - 14 - earTwitch, 5, 16, 0.15, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(200,150,150,0.5)"; // inner ear
  ctx.beginPath();
  ctx.ellipse(rx + 10, ry - 14 + earTwitch, 2.2, 11, -0.15, 0, Math.PI * 2);
  ctx.ellipse(rx + 26, ry - 14 - earTwitch, 2.2, 11, 0.15, 0, Math.PI * 2);
  ctx.fill();

  // body
  ctx.fillStyle = "#efe6d4";
  roundRect(ctx, rx, ry, rabbit.width, rabbit.height, 12);
  ctx.fill();
  ctx.strokeStyle = "rgba(40,30,20,0.5)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // tail
  ctx.fillStyle = "#fff";
  ctx.beginPath();
  ctx.arc(rx + rabbit.width + 2, ry + rabbit.height - 8, 5, 0, Math.PI * 2);
  ctx.fill();

  // eyes
  ctx.fillStyle = "#2b2b2b";
  ctx.beginPath();
  ctx.arc(rx + 12, ry + 14, 2, 0, Math.PI * 2);
  ctx.arc(rx + 27, ry + 14, 2, 0, Math.PI * 2);
  ctx.fill();

  if (rabbit.active && isPlayerNear(rabbit.x + rabbit.width / 2, 0, 70, 6, 999)) {
    const bubbleX = rx + rabbit.width + 39; // box left edge lands ~15px right of the rabbit
    const bubbleY = ry - 10;
    drawSpeechBubble(ctx, bubbleX, bubbleY, [
      "Not all ground remembers to hold you.",
      "Leap where the path feels certain."
    ]);
  }
}

// connection door: rounded wooden arch, always present, translucent until
// its connection is unlocked. Glow color hints at wherever THIS door leads
// (not where you currently are), so the same door looks right from either
// side of a two-way connection. The hole reflects the connection's shared
// filled state — once unlocked from either side, it shows on both.
function drawConnectionDoor(ctx, camX, doorDef, connection) {
  const dx = doorDef.x - camX;
  const frameWidth = doorDef.width;
  const frameHeight = doorDef.height;
  const postWidth = 10;

  const unlocked = connection.filled;
  const glow = DOOR_GLOW[doorDef.leadsTo];

  const archRadius = (frameWidth - postWidth * 2) / 2;
  const archCenterX = dx + frameWidth / 2;
  const archCenterY = gy - frameHeight + archRadius + postWidth;

  function tracePath(offset) {
    const left = dx + postWidth - offset;
    const right = dx + frameWidth - postWidth + offset;
    const radius = archRadius + offset;

    ctx.beginPath();
    ctx.moveTo(left, gy);
    ctx.lineTo(left, archCenterY);
    ctx.arc(archCenterX, archCenterY, radius, Math.PI, 0, false); // sweeps over the top
    ctx.lineTo(right, gy);
    ctx.closePath();
  }

  ctx.save();
  ctx.globalAlpha = unlocked ? 1 : 0.35;

  // gentle pulse once unlocked — subtle breathing, not distracting
  const pulse = unlocked ? Math.sin(performance.now() * 0.0025) * 0.5 + 0.5 : 0;

  // wooden frame (slightly larger than the interior, forms the border)
  tracePath(postWidth);
  ctx.fillStyle = "#6b4026";
  ctx.fill();

  // interior glow — visible even while locked, just faint; color hints destination
  tracePath(0);
  const interiorGlow = ctx.createLinearGradient(dx, gy - frameHeight, dx, gy);
  interiorGlow.addColorStop(0, glow.stops[0]);
  interiorGlow.addColorStop(0.6, glow.stops[1]);
  interiorGlow.addColorStop(1, glow.stops[2]);
  ctx.fillStyle = interiorGlow;
  ctx.fill();

  // light bleeding out around the frame edges themselves
  tracePath(0);
  ctx.shadowColor = glow.stops[0];
  ctx.shadowBlur = unlocked ? 14 + pulse * 8 : 6;
  ctx.strokeStyle = glow.stops[0];
  ctx.lineWidth = 3;
  ctx.stroke();
  ctx.shadowBlur = 0; // reset so it doesn't bleed into anything drawn after

  // soft outer glow bleeding onto the ground — always present, stronger + pulsing once unlocked
  const bleedAlpha = unlocked ? 0.45 + pulse * 0.15 : 0.15;
  const bleed = ctx.createRadialGradient(archCenterX, gy, 4, archCenterX, gy, 70);
  bleed.addColorStop(0, `rgba(${glow.bleed},${bleedAlpha})`);
  bleed.addColorStop(1, `rgba(${glow.bleed},0)`);
  ctx.fillStyle = bleed;
  ctx.fillRect(dx - 50, gy - 25, frameWidth + 100, 50);

  ctx.restore();

  // the hole — always fully visible, as the affordance for where to place the
  // item. Reflects the shared connection state, so both doors show it once unlocked.
  const holeX = archCenterX;
  const holeY = gy - 8; // low, reachable while standing

  ctx.beginPath();
  ctx.arc(holeX, holeY, 8, 0, Math.PI * 2);
  ctx.fillStyle = unlocked ? "rgba(90,60,30,0.9)" : "rgba(30,20,10,0.6)";
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.4)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  if (unlocked && connection.filledItemType) {
    drawCollectible(ctx, holeX, holeY, 6, 0, connection.filledItemType);
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

// boomerang: emoji glyph, sized to match the wedge pieces' scale
function drawBoomerangShape(ctx, x, y, size, rotation) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.font = `${size * 2.4}px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif`;
  ctx.fillStyle = "#2b2b2b"; // explicit — otherwise it inherits whatever faint color drew last
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🪃", 0, 0);
  ctx.restore();
}

// tulip: same emoji-glyph approach as the boomerang
function drawTulipShape(ctx, x, y, size, rotation) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.font = `${size * 2.4}px 'Apple Color Emoji','Segoe UI Emoji','Noto Color Emoji',sans-serif`;
  ctx.fillStyle = "#2b2b2b";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("🌷", 0, 0);
  ctx.restore();
}

// Cheap "tucked into the canopy" trick — NOT a real layering/z-order system,
// just a couple of translucent leaf-colored blobs painted on top of the glyph
// afterward, using the same green/alpha the decorative trees already use.
// Good enough for "half-hidden in foliage"; would need actual sprite layers
// or per-object z-index if you want this to generalize to lots of objects.
function drawFoliageOcclusion(ctx, x, y, size) {
  ctx.fillStyle = "rgba(90,120,70,0.55)";
  ctx.beginPath();
  ctx.ellipse(x - size * 0.5, y - size * 0.6, size * 0.9, size * 0.7, 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(x + size * 0.6, y - size * 0.5, size * 0.8, size * 0.6, -0.4, 0, Math.PI * 2);
  ctx.fill();
}

// crystal: hand-drawn blue gem, not an emoji — guarantees the color, plus
// a pulsing glow and a couple sparkle accents for the "sparkling" feel
function drawCrystalShape(ctx, x, y, size, rotation) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  const pulse = Math.sin(performance.now() * 0.005) * 0.5 + 0.5;

  // soft glow behind it
  ctx.fillStyle = `rgba(120,180,255,${0.25 + pulse * 0.25})`;
  ctx.beginPath();
  ctx.arc(0, 0, size * 1.8, 0, Math.PI * 2);
  ctx.fill();

  // gem body
  ctx.fillStyle = "#4a90e2";
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.7, -size * 0.2);
  ctx.lineTo(size * 0.4, size);
  ctx.lineTo(-size * 0.4, size);
  ctx.lineTo(-size * 0.7, -size * 0.2);
  ctx.closePath();
  ctx.fill();

  // facet highlight
  ctx.fillStyle = "rgba(255,255,255,0.55)";
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * 0.3, -size * 0.1);
  ctx.lineTo(0, size * 0.3);
  ctx.lineTo(-size * 0.2, -size * 0.1);
  ctx.closePath();
  ctx.fill();

  // sparkle accents
  ctx.fillStyle = `rgba(255,255,255,${0.6 + pulse * 0.4})`;
  ctx.beginPath();
  ctx.arc(size * 0.55, -size * 0.7, 1.6, 0, Math.PI * 2);
  ctx.arc(-size * 0.5, size * 0.4, 1.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// bucket: always drawn empty in-world — the only time it's ever rendered
// on canvas is sitting in the bush and flying to the basket on pickup,
// both of which happen before it's ever been filled. Fill state only
// matters for the inventory chip's display, handled in updateInventoryUI.
// bucket — now reflects its REAL fill state (checks the global bucketDropCount/
// bucketFilled directly), so the world sprite and the held-item indicator
// both show actual progress, not always the empty look. Water rises inside
// as drops are caught. Top ellipse gives a slight "looking down into it" read.
function drawBucketShape(ctx, x, y, size, rotation) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  const fillRatio = bucketFilled ? 1 : Math.min(bucketDropCount / BUCKET_DROPS_NEEDED, 1);

  const bucketPath = () => {
    ctx.beginPath();
    ctx.moveTo(-size * 0.6, -size * 0.5);
    ctx.lineTo(size * 0.6, -size * 0.5);
    ctx.lineTo(size * 0.45, size * 0.7);
    ctx.lineTo(-size * 0.45, size * 0.7);
    ctx.closePath();
  };

  ctx.fillStyle = "#c9b896";
  bucketPath();
  ctx.fill();

  // water level, clipped to the bucket's silhouette, rising from the bottom
  if (fillRatio > 0) {
    ctx.save();
    bucketPath();
    ctx.clip();
    const waterTop = size * 0.7 - size * 1.2 * fillRatio;
    ctx.fillStyle = "rgba(90,160,230,0.88)";
    ctx.fillRect(-size * 0.7, waterTop, size * 1.4, size * 1.5);
    ctx.restore();
  }

  ctx.strokeStyle = "#6b5a40";
  ctx.lineWidth = 1.5;
  bucketPath();
  ctx.stroke();

  // slight top opening, viewed a little from above — makes it read as a
  // container you can see into, not just a flat silhouette
  ctx.beginPath();
  ctx.ellipse(0, -size * 0.5, size * 0.6, size * 0.16, 0, 0, Math.PI * 2);
  ctx.strokeStyle = "rgba(107,90,64,0.7)";
  ctx.stroke();

  // handle
  ctx.beginPath();
  ctx.arc(0, -size * 0.5, size * 0.5, Math.PI, 0);
  ctx.strokeStyle = "#6b5a40";
  ctx.stroke();

  ctx.restore();
}

// dispatcher: draws the right shape for any collectible by itemType
function drawCollectible(ctx, x, y, size, rotation, itemType) {
  if (itemType === "boomerang") {
    drawBoomerangShape(ctx, x, y, size, rotation);
  } else if (itemType === "tulip") {
    drawTulipShape(ctx, x, y, size, rotation);
  } else if (itemType === "crystal") {
    drawCrystalShape(ctx, x, y, size, rotation);
  } else if (itemType === "bucket") {
    drawBucketShape(ctx, x, y, size, rotation);
  } else {
    drawApplePieceShape(ctx, x, y, size, rotation);
  }
}

/* ======================================================
   DRAW
   ====================================================== */
function drawCrows(camX) {
ctx.strokeStyle = "#3b2f28";
crows.forEach(c=>{
  c.x -= c.speed;
  c.phase += 0.18;

  // recycle relative to the CAMERA, not a fixed world position — otherwise
  // crows only ever exist near world x=0 and vanish forever once you scroll past
  if (c.x - camX < -20) {
    c.x = camX + canvas.width + Math.random() * 500; // staggered re-entry, not a synchronized clump
    c.y = 50 + Math.random() * 150;                   // spread vertically too
    c.speed = 0.15 + Math.random() * 0.2;
  }

  const flap = Math.sin(c.phase) * 4;

  ctx.beginPath();
  ctx.moveTo(c.x - camX, c.y);
  ctx.lineTo(c.x - camX + 8, c.y + flap);
  ctx.lineTo(c.x - camX + 16, c.y);
  ctx.stroke();
});

}

function drawAutumnScene(camX) {


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

drawCrows(camX);

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

/* RAMP */
ramps.forEach(r => {
  const rx = r.x - camX;
  const yStart = gy - r.heightStart;
  const yEnd = gy - r.heightEnd;
  const thickness = 10;

  ctx.beginPath();
  ctx.moveTo(rx, yStart);
  ctx.lineTo(rx + r.width, yEnd);
  ctx.lineTo(rx + r.width, yEnd + thickness);
  ctx.lineTo(rx, yStart + thickness);
  ctx.closePath();

  const wood = ctx.createLinearGradient(rx, yStart, rx, yStart + thickness);
  wood.addColorStop(0, "#c89a5a");
  wood.addColorStop(1, "#8a5a2e");
  ctx.fillStyle = wood;
  ctx.fill();

  ctx.strokeStyle = "rgba(80,50,30,0.35)";
  ctx.lineWidth = 1;
  ctx.stroke();
});

// call draw apple tree 2x
drawAppleTree(220, camX);
drawAppleTree(980, camX);
drawConnectionDoor(ctx, camX, connections[0].doors.autumn, connections[0]);

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

  // DRAW BOOMERANG (static, resting on top of the ramp, until collected)
  if (!boomerang.collected && !boomerang.collecting) {
    const bx2 = boomerang.x - camX;
    const by2 = gy - boomerang.heightAboveGround;
    drawBoomerangShape(ctx, bx2, by2, 10, 0);
  }


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
const hatLift = frog.tip > 0 ? Math.sin(frog.tip * 0.2) * 6 : 0;

ctx.fillRect(fx+10, fy-14 - hatLift, 28, 6);
ctx.fillRect(fx+16, fy-28 - hatLift, 16, 14);


// cane
ctx.strokeStyle="#6b3f2a";
ctx.lineWidth=3;
ctx.beginPath();
ctx.moveTo(fx+frog.width+4, fy+8);
ctx.lineTo(fx+frog.width+4, fy+frog.height+12);
ctx.stroke();

if (frog.active && isPlayerNear(frog.x + frog.width / 2, 0, 70, 6, 999)) {
  const bubbleY = fy - 96; // ← lift bubble above hat

  // dialogue SELECTION stays frog-specific (knows about apple.landed, etc.)
  // — only the bubble rendering itself is shared
  drawSpeechBubble(ctx, fx, bubbleY, [
    apple.landed ? "Ah… it has chosen its place." : "The orchard listens.",
    "What's freshly fallen opens new paths."
  ]);
}



}

/* ======================================================
   SPRING DECORATION
   ====================================================== */
const GRASS_SHADES = ["rgba(84,142,66,0.55)", "rgba(122,178,92,0.5)", "rgba(58,104,48,0.55)"];
const FLOWER_COLORS = ["#e0793f", "#8a5fae", "#4a90c4"];

// Grass and flowers are generated procedurally from camX each frame,
// rather than a fixed-size array — so they extend infinitely as you walk
// right instead of running out at some fixed world width. pseudoRandom(x)
// keeps each position's look stable frame to frame even though nothing is
// stored.
function drawSpringGrass(camX) {
  const step = 14;
  const startX = Math.floor((camX - 40) / step) * step;
  const endX = camX + canvas.width + 40;

  ctx.lineWidth = 1.5;
  for (let x = startX; x < endX; x += step) {
    const shade = Math.floor(pseudoRandom(x * 0.71 + 3) * GRASS_SHADES.length);
    const h = 4 + pseudoRandom(x * 0.37 + 7) * 7;
    const y = gy + 2 + pseudoRandom(x * 0.19 + 11) * 14;

    ctx.strokeStyle = GRASS_SHADES[shade];
    ctx.beginPath();
    ctx.moveTo(x - camX, y);
    ctx.lineTo(x - camX, y - h);
    ctx.stroke();
  }
}

// draws one petal in local space: tip at the origin (flower center),
// rounded/lobed end pointing outward along +y. Caller rotates/translates.
function drawPetal(length, width, shape) {
  ctx.beginPath();
  if (shape === "heart") {
    ctx.moveTo(0, 0);
    ctx.bezierCurveTo(width, length * 0.15, width, length * 0.75, 0, length * 0.6);
    ctx.bezierCurveTo(-width, length * 0.75, -width, length * 0.15, 0, 0);
  } else { // "teardrop"
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(width, length * 0.5, 0, length);
    ctx.quadraticCurveTo(-width, length * 0.5, 0, 0);
  }
  ctx.closePath();
  ctx.fill();
}

function drawSpringFlowers(camX) {
  const step = 55;
  const startX = Math.floor((camX - 40) / step) * step;
  const endX = camX + canvas.width + 40;

  for (let x = startX; x < endX; x += step) {
    if (pseudoRandom(x * 0.05 + 3) < 0.45) continue; // not every slot gets a flower

    const y = gy + 4 + pseudoRandom(x * 0.23 + 9) * 10;
    const colorIdx = Math.floor(pseudoRandom(x * 0.61 + 5) * FLOWER_COLORS.length);
    const petalCount = 3 + Math.floor(pseudoRandom(x * 0.83 + 2) * 3); // 3-5
    const shape = pseudoRandom(x * 0.97 + 6) < 0.5 ? "teardrop" : "heart";
    const baseRotation = pseudoRandom(x * 0.44 + 8) * Math.PI * 2;
    const petalLength = 4 + pseudoRandom(x * 0.29 + 4) * 2.5;
    const petalWidth = 1.6 + pseudoRandom(x * 0.13 + 10) * 1.1;

    ctx.save();
    ctx.translate(x - camX, y);
    ctx.fillStyle = FLOWER_COLORS[colorIdx];

    for (let i = 0; i < petalCount; i++) {
      const angle = baseRotation + (Math.PI * 2 * i) / petalCount;
      ctx.save();
      ctx.rotate(angle);
      drawPetal(petalLength, petalWidth, shape);
      ctx.restore();
    }

    // flower center
    ctx.fillStyle = "rgba(255,235,180,0.9)";
    ctx.beginPath();
    ctx.arc(0, 0, 1.1, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}

// tree/bush placement — pear is centered as the future-interactive slot,
// plum/peach sit further out like autumn's decorative background trees
const springFruitTrees = [
  { x: 150, type: "plum" },
  { x: 550, type: "pear" },  // future-interactive slot
  { x: 950, type: "peach" },
  { x: 1975, type: "plum" }  // the swing's tree, past the tulip
];

const springBushes = [280, 400, 700, 830, 1060, 1160].map(x => ({ x }));

/* ======================================================
   SWING — real pendulum physics. Pump with left/right timed
   to the direction it's already moving; release with up to
   launch. Clear the height threshold and you're flung into
   the clouds; otherwise a slow, floaty drop back to the ground.

   NOTE: pendulum feel is genuinely hard to hand-tune without
   playtesting — these are first-pass numbers, expect to retune
   rope length / gravity / thresholds once you've actually swung on it.
   ====================================================== */
const SWING_ROPE_LENGTH = 100;       // height units
const SWING_GRAVITY = 0.03;          // frame-based, tuned small like the rest of player physics
const SWING_MAX_ANGLE = 1.45;        // ~83° — hard amplitude clamp, prevents looping over the top
                                      // regardless of how much energy pumping adds
const SWING_MAX_ANGULAR_VEL = 0.2;   // safety cap on raw angular speed (secondary to the angle clamp)
const SWING_PUMP_BOOST = 0.02;       // base boost — actual effect is weighted by current momentum, see updateSwing
const SWING_PUMP_MIN_MULT = 0.3;     // pump effectiveness at zero momentum (slow start)
const SWING_PUMP_MULT_RANGE = 1.4;   // grows up to (MIN_MULT + this) at max momentum — compounds faster once swinging
const SWING_PUMP_COOLDOWN = 6;       // frames between pumps, so holding doesn't spam
const LAUNCH_GRAVITY = 0.3;          // ascent — lighter than a normal jump; you're being FLUNG, not hopping
const FLOATY_FALL_GRAVITY = 0.13;    // descent, if under threshold — the "slow drop"

const swing = {
  pivotX: 1975,
  pivotHeightAboveGround: 150, // where the rope attaches, up in the plum tree — idle seat rests at height 50
  angle: 0,          // radians from straight down
  angularVelocity: 0,
  mounted: false,
  pumpCooldown: 0,
  mountTime: 0,            // ms since mounting — release is ignored before SWING_MIN_MOUNT_TIME
  peakAngularVelocity: 0   // best speed reached this session, used as a release fallback
};

// the actual target — you have to hit THIS, not just clear an invisible
// height number. Positioned up and to the RIGHT of the swing, not
// straight above it — horizontal velocity never decays mid-flight, so a
// real launch arc drifts sideways well before it gets this high.
const goalCloud = {
  x: 2150,
  height: 220,
  radius: 80
};

/* ======================================================
   WIGGLE BUSH — periodic idle wiggle just to catch your eye
   (purely cosmetic, runs on its own clock). Separately, mashing
   spacebar while standing in front of it — with presses spaced
   at least half a second apart, so holding it down doesn't just
   finish it instantly — gradually parts the branches. A bucket
   sits inside once fully open.
   ====================================================== */
const WIGGLE_BUSH_PRESS_GAP = 500;   // ms — minimum spacing between presses that count
const WIGGLE_BUSH_REQUIRED = 9;      // presses needed to fully open

const wiggleBush = {
  x: 2300, // well past the swing/goal cloud — a real "keep exploring" find
  noticeTimer: 3000 + Math.random() * 3000,
  noticeWiggle: 0,     // >0 while the idle "notice me" shake plays
  presses: 0,
  pressCooldown: 0,
  opened: false,
  bucketTaken: false
};

function swingBobPosition(angle) {
  return {
    x: swing.pivotX + SWING_ROPE_LENGTH * Math.sin(angle),
    height: swing.pivotHeightAboveGround - SWING_ROPE_LENGTH * Math.cos(angle)
  };
}

const SWING_MIN_MOUNT_TIME = 4000; // ms — must stay on for at least this long before release does anything

function updateSwing(deltaTime) {
  if (swing.mounted) {
    swing.mountTime += deltaTime * 1000;

    // real pendulum restoring force toward straight-down
    const angularAccel = -(SWING_GRAVITY / SWING_ROPE_LENGTH) * Math.sin(swing.angle);
    swing.angularVelocity += angularAccel;
    swing.angle += swing.angularVelocity;

    // gentle damping — without continued pumping, amplitude decays back
    // toward hanging still, instead of swinging forever like a frictionless pendulum
    swing.angularVelocity *= 0.997;

    if (swing.pumpCooldown > 0) swing.pumpCooldown--;

    // pump: pressing the direction it's ALREADY moving adds energy —
    // forgiving on purpose, no tight phase-locked timing required.
    // Effectiveness is WEIGHTED by current momentum: starting from a dead
    // hang, pumps add relatively little (matches how hard it actually is
    // to start a swing from rest); once you've got real motion going,
    // each pump compounds faster — a visible build-up, not a flat rate.
    if (swing.pumpCooldown <= 0) {
      const momentumRatio = Math.min(Math.abs(swing.angularVelocity) / SWING_MAX_ANGULAR_VEL, 1);
      const pumpMultiplier = SWING_PUMP_MIN_MULT + momentumRatio * SWING_PUMP_MULT_RANGE;
      const boost = SWING_PUMP_BOOST * pumpMultiplier;

      if (keys.leftJustPressed && swing.angularVelocity <= 0) {
        swing.angularVelocity -= boost;
        swing.pumpCooldown = SWING_PUMP_COOLDOWN;
      } else if (keys.rightJustPressed && swing.angularVelocity >= 0) {
        swing.angularVelocity += boost;
        swing.pumpCooldown = SWING_PUMP_COOLDOWN;
      }
    }

    swing.angularVelocity = Math.max(-SWING_MAX_ANGULAR_VEL, Math.min(SWING_MAX_ANGULAR_VEL, swing.angularVelocity));

    // hard amplitude clamp — this, not the velocity cap, is what actually
    // prevents looping over the top. NOTE: this zeros angularVelocity right
    // at the visual extreme of the swing — the exact moment that LOOKS like
    // the best time to release. Real pendulum velocity actually bottoms out
    // there too, but releasing right after a clamp-zero would give a
    // launch of essentially nothing, which is why peak tracking (below)
    // exists — it's what actually fixes that trap.
    if (swing.angle > SWING_MAX_ANGLE) {
      swing.angle = SWING_MAX_ANGLE;
      swing.angularVelocity = 0;
    } else if (swing.angle < -SWING_MAX_ANGLE) {
      swing.angle = -SWING_MAX_ANGLE;
      swing.angularVelocity = 0;
    }

    // track the best speed reached this session — release uses this as a
    // fallback so releasing near the (momentarily zero-velocity) top of
    // the arc still gives you the launch your pumping actually earned
    if (Math.abs(swing.angularVelocity) > Math.abs(swing.peakAngularVelocity)) {
      swing.peakAngularVelocity = swing.angularVelocity;
    }

    // player position is just the bob's position while mounted
    const bob = swingBobPosition(swing.angle);
    player.x = bob.x;
    player.y = bob.height;

    if (keys.upJustPressed) {
      if (swing.mountTime >= SWING_MIN_MOUNT_TIME) {
        releaseSwing();
      }
      // too early — press is just ignored, you have to stay on a bit longer
    } else if (keys.down) {
      // safe dismount — no launch, just step off wherever you are and
      // let normal gravity carry you down
      swing.mounted = false;
      swing.angularVelocity = 0;
    }
  } else {
    // idle sway — purely cosmetic, so the swing reads as alive even unmounted
    swing.angle = Math.sin(performance.now() * 0.001) * 0.08;
  }
}

function releaseSwing() {
  // if the instant-of-release speed is small relative to the best speed
  // this session reached (e.g. released right at the amplitude clamp,
  // where velocity is always momentarily zero), use the tracked peak
  // instead — otherwise a "perfectly maxed out" swing could launch you
  // with essentially nothing, which is exactly backwards
  const useVelocity =
    Math.abs(swing.angularVelocity) > Math.abs(swing.peakAngularVelocity) * 0.3
      ? swing.angularVelocity
      : swing.peakAngularVelocity;

  const vx = SWING_ROPE_LENGTH * Math.cos(swing.angle) * useVelocity;
  const vHeight = SWING_ROPE_LENGTH * Math.sin(swing.angle) * useVelocity;

  swing.mounted = false;
  swing.angularVelocity = 0;
  swing.peakAngularVelocity = 0;

  player.vx = vx;
  player.vy = vHeight;
  player.launched = true;
  player.launchPeakHeight = player.y;
  player.jumping = true;
}

const springClouds = [
  { x: 150, y: 70, scale: 1 },
  { x: 500, y: 45, scale: 0.8 },
  { x: 850, y: 90, scale: 1.2 },
  { x: 1400, y: 60, scale: 0.9 }
];

/* ======================================================
   RABBIT NPC — uses the same generic shell as frog
   (updateNPCIdle, drawSpeechBubble); art + dialogue bespoke
   ====================================================== */
const rabbit = {
  x: 1250,
  y: 0,
  width: 40,
  height: 32,
  bob: 0,
  bobSpeed: 0.05,
  active: false,
  tip: 0
};

/* ======================================================
   HOLES — jump over them or fall through; placed after
   the rabbit so it can warn you before you reach them
   ====================================================== */
const springHoles = [
  { x: 1550, width: 36 },
  { x: 1640, width: 68 },  // large — combined with the small one, wider than a single jump can clear
  { x: 1708, width: 27 },  // small, right after — together they force a double jump
  { x: 1800, width: 36 }
];

/* ======================================================
   TULIP — reward for clearing the holes, static ground
   collectible using the same shell as boomerang/apple pieces
   ====================================================== */
const tulip = {
  x: 1875, // right after the last hole
  heightAboveGround: 0, // sits right on the ground
  collected: false,
  collecting: false
};

// falling-through-a-hole sequence: body sinks downward and is clipped
// away at ground level. mode determines what happens on completion —
// "hole" = respawn in the same scene (spring's own holes), "cloudHole" =
// switch to spring and arrive mid-air, floating down (the clouds' return route)
const fallState = { active: false, t: 0, mode: "hole" };
const FALL_DURATION = 700; // ms

function drawSpringScene(camX) {
  // --- SKY: 5-stop soft pastel gradient ---
  const sky = ctx.createLinearGradient(0, 0, 0, gy);
  sky.addColorStop(0, "#bcdff0");    // soft morning blue
  sky.addColorStop(0.3, "#d7ecd0");  // pale green haze
  sky.addColorStop(0.6, "#eaf5c8");  // warm yellow-green
  sky.addColorStop(0.85, "#fbf0d8"); // cream near horizon
  sky.addColorStop(1, "#f7e6c9");    // soft ground blend
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, gy);

  // soft horizon glow
  const glow = ctx.createLinearGradient(0, gy - 130, 0, gy + 30);
  glow.addColorStop(0, "rgba(255,250,220,0)");
  glow.addColorStop(0.5, "rgba(255,245,200,0.15)");
  glow.addColorStop(1, "rgba(255,235,180,0.25)");
  ctx.fillStyle = glow;
  ctx.fillRect(0, gy - 150, canvas.width, 200);

  springClouds.forEach(c => drawCloud(c.x, c.y, c.scale, camX));

  // far silhouettes (most distant, most translucent)
  ctx.fillStyle = "rgba(110,150,95,0.22)";
  for (let i = 0; i < 8; i++) {
    const tx = (i * 210) - (camX * 0.2);
    ctx.beginPath();
    ctx.arc(tx, gy - 130, 100, 0, Math.PI * 2);
    ctx.fill();
  }

  // distant trees
  for (let i = 0; i < 7; i++) {
    const tx = i * 230 - (camX * 0.3) + Math.sin(i * 2.1) * 55;
    const radius = 65 + Math.sin(i * 1.3) * 16;
    const ty = gy - 115 + Math.sin(i * 0.9) * 10;
    ctx.fillStyle = "rgba(120,165,90,0.32)";
    ctx.beginPath();
    ctx.arc(tx, ty, radius, 0, Math.PI * 2);
    ctx.fill();
  }

  // mid-distance greenery clusters
  ctx.fillStyle = "rgba(130,180,95,0.4)";
  for (let i = 0; i < 5; i++) {
    const tx = (i * 340) - (camX * 0.45);
    ctx.beginPath();
    ctx.arc(tx + 40, gy - 100, 62, 0, Math.PI * 2);
    ctx.arc(tx + 95, gy - 105, 58, 0, Math.PI * 2);
    ctx.arc(tx + 65, gy - 135, 65, 0, Math.PI * 2);
    ctx.fill();
  }

  drawCrows(camX); // same birds, consistent across zones

  // --- GROUND ---
  ctx.fillStyle = "#a8ce85"; // base grass fill
  ctx.fillRect(-camX, gy, canvas.width + camX, canvas.height - gy);

  const groundGlow = ctx.createLinearGradient(0, gy, 0, gy + 80);
  groundGlow.addColorStop(0, "rgba(230,235,150,0.15)");
  groundGlow.addColorStop(1, "rgba(180,210,120,0)");
  ctx.fillStyle = groundGlow;
  ctx.fillRect(0, gy, canvas.width, 80);

  // ground texture strokes
  ctx.strokeStyle = "rgba(60,100,50,0.08)";
  for (let i = 0; i < canvas.width; i += 22) {
    ctx.beginPath();
    ctx.moveTo(i - camX % 22, gy + 2);
    ctx.lineTo(i - camX % 22 + 10, gy + 7);
    ctx.stroke();
  }

  // grass blades — 3 shades for depth/texture, extends infinitely with camera
  drawSpringGrass(camX);

  // scattered flowers — same infinite approach
  drawSpringFlowers(camX);

  // holes — drawn after grass/flowers so the pit reads as a real gap in the ground
  springHoles.forEach(h => drawHole(h.x, h.width, camX));

  // tulip — reward sitting right past the holes
  if (!tulip.collected && !tulip.collecting) {
    drawTulipShape(ctx, tulip.x - camX, gy - tulip.heightAboveGround, 10, 0);
  }

  // bushes, then fruit trees on top (trees read as taller/foreground)
  springBushes.forEach(b => drawBush(b.x, camX));
  springFruitTrees.forEach(t => drawFruitTree(t.x, camX, t.type));

  drawSwing(camX);

  drawGoalCloud(camX);

  drawWiggleBush(camX);

  drawRabbit(camX);

  drawConnectionDoor(ctx, camX, connections[0].doors.spring, connections[0]);
}

// swing: rope + wooden seat, position derived from its current angle
function drawSwing(camX) {
  const bob = swingBobPosition(swing.angle);
  const pivotScreenX = swing.pivotX - camX;
  const pivotScreenY = gy - swing.pivotHeightAboveGround;
  const bobScreenX = bob.x - camX;
  const bobScreenY = gy - bob.height;

  ctx.strokeStyle = "#5a4530";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(pivotScreenX, pivotScreenY);
  ctx.lineTo(bobScreenX, bobScreenY);
  ctx.stroke();

  // seat, perpendicular to the rope so it reads as hanging naturally
  ctx.save();
  ctx.translate(bobScreenX, bobScreenY);
  ctx.rotate(swing.angle);
  ctx.fillStyle = "#8a5a2e";
  ctx.fillRect(-14, 0, 28, 6);
  ctx.restore();
}

// the goal cloud — bigger than decorative clouds, with a soft pulsing glow,
// so it clearly reads as "aim here" rather than blending into the sky
function drawGoalCloud(camX) {
  const gx = goalCloud.x - camX;
  const gy2 = gy - goalCloud.height;
  const pulse = Math.sin(performance.now() * 0.003) * 0.5 + 0.5;

  ctx.save();
  ctx.globalAlpha = 0.85;

  const glow = ctx.createRadialGradient(gx, gy2, 10, gx, gy2, goalCloud.radius + 20 + pulse * 10);
  glow.addColorStop(0, "rgba(255,250,220,0.5)");
  glow.addColorStop(1, "rgba(255,250,220,0)");
  ctx.fillStyle = glow;
  ctx.beginPath();
  ctx.arc(gx, gy2, goalCloud.radius + 20 + pulse * 10, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

  // draw the cloud shape itself directly at the goal's actual screen position
  ctx.save();
  ctx.globalAlpha = 0.95;
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.ellipse(gx, gy2, 42, 20, 0, 0, Math.PI * 2);
  ctx.ellipse(gx + 32, gy2 - 8, 28, 17, 0, 0, Math.PI * 2);
  ctx.ellipse(gx - 32, gy2 - 6, 26, 16, 0, 0, Math.PI * 2);
  ctx.ellipse(gx + 10, gy2 - 18, 24, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// the two halves visibly split apart as progress builds; a notice-wiggle
// shake plays on its own clock, independent of player interaction
function drawWiggleBush(camX) {
  const bx = wiggleBush.x - camX;
  const progress = wiggleBush.opened ? 1 : wiggleBush.presses / WIGGLE_BUSH_REQUIRED;
  const gap = progress * 26;
  const shake = wiggleBush.noticeWiggle > 0 ? Math.sin(wiggleBush.noticeWiggle * 0.4) * 1.5 : 0;

  // left half
  ctx.save();
  ctx.translate(-gap + shake, 0);
  ctx.fillStyle = "rgba(90,90,50,0.15)";
  ctx.beginPath();
  ctx.ellipse(bx - 6, gy + 3, 18, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(95,145,75,0.9)";
  ctx.beginPath();
  ctx.arc(bx - 14, gy - 9, 13, 0, Math.PI * 2);
  ctx.arc(bx - 2, gy - 14, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // right half
  ctx.save();
  ctx.translate(gap + shake, 0);
  ctx.fillStyle = "rgba(95,145,75,0.9)";
  ctx.beginPath();
  ctx.arc(bx + 14, gy - 9, 13, 0, Math.PI * 2);
  ctx.arc(bx + 2, gy - 14, 14, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // bucket visible in the gap once open, until taken — sits up in the
  // parted canopy (peak ~28), not at chest height where your own
  // character would block the view of it
  if (wiggleBush.opened && !wiggleBush.bucketTaken) {
    drawBucketShape(ctx, bx, gy - 26, 12, 0);
  }
}

function updateWiggleBush(deltaTime) {
  // cosmetic notice-wiggle — runs on its own clock, regardless of the player
  wiggleBush.noticeTimer -= deltaTime * 1000;
  if (wiggleBush.noticeTimer <= 0) {
    wiggleBush.noticeWiggle = 180;
    wiggleBush.noticeTimer = 7000 + Math.random() * 4000;
  }
  if (wiggleBush.noticeWiggle > 0) wiggleBush.noticeWiggle--;

  if (wiggleBush.pressCooldown > 0) wiggleBush.pressCooldown -= deltaTime * 1000;

  if (!wiggleBush.opened) {
    const nearBush = isPlayerNear(wiggleBush.x, 0, 40, 10, 10);

    if (!nearBush) {
      wiggleBush.presses = 0; // reset if you walk away mid-attempt
    } else if (keys.space && wiggleBush.pressCooldown <= 0) {
      wiggleBush.presses++;
      wiggleBush.pressCooldown = WIGGLE_BUSH_PRESS_GAP;

      if (wiggleBush.presses >= WIGGLE_BUSH_REQUIRED) {
        wiggleBush.opened = true;
      }
    }
  } else if (!wiggleBush.bucketTaken) {
    if (pressedDownNear(wiggleBush.x, 26, 30, 15, 30)) {
      wiggleBush.bucketTaken = true;
      startCollectAnimation(
        { x: wiggleBush.x, y: gy - 26, size: 12, rotation: 0 },
        "bucket"
      );
    }
  }
}

// --- CLOUDS ---
const cloudsDecor = [
  { x: 60,   y: 100, scale: 1.4, type: "puffy" },
  { x: 280,  y: 60,  scale: 1.0, type: "wisp" },
  { x: 520,  y: 130, scale: 1.6, type: "stack" },
  { x: 780,  y: 80,  scale: 1.1, type: "puffy" },
  { x: 950,  y: 150, scale: 1.3, type: "wisp" },
  { x: 1150, y: 55,  scale: 0.9, type: "stack" },
  { x: 1400, y: 110, scale: 1.5, type: "puffy" },
  { x: 200,  y: 170, scale: 0.8, type: "bunny" },      // decorative — not walkable
  { x: 1050, y: 40,  scale: 1.0, type: "whale" },       // decorative — not walkable
  { x: 1770, y: 160, scale: 0.9, type: "alligator" },   // decorative — not walkable
  { x: 900,  y: 140, scale: 1.3, type: "hummingbird" } // decorative — not walkable
];

// the way back down — same fall-through mechanic as spring's holes, just
// leads to a scene switch + floaty descent instead of a same-scene respawn
const cloudHole = { x: 300, width: 60 };

// the main hop-path — a real mix of single-jump, double-jump, and climbing
// gaps. Missing a jump just drops you to the base cloud-ground, no hazard.
// Ends at a shuttle dock — the alligator beyond it is NOT reachable by
// jumping; the gap is deliberately wider than anything jump/double-jump can cross.
//
// The two "GAP" clouds below were verified against actual jump physics
// (frame-based simulation, landing only counts while descending — vy<=0 —
// same as the real platform collision code), not just eyeballed distance:
// single-jump's real max reach at a ~90-height climb is ~50-57px, so an
// 80px edge gap is genuinely single-jump-impossible; double-jump reaches
// ~120px there, comfortably clearing it.
const hopClouds = [
  { x: 480,  height: 45,  width: 70 },
  { x: 580,  height: 90,  width: 60 },
  { x: 690,  height: 95,  width: 130, type: "whale" },      // big stationary anchor
  { x: 860,  height: 60,  width: 60 },
  { x: 960,  height: 60,  width: 60 },
  { x: 1100, height: 150, width: 60 },                      // GAP 1 — 80px edge gap, genuinely needs the double jump
  { x: 1200, height: 190, width: 60 },
  { x: 1370, height: 220, width: 60 },                      // GAP 2 — 110px edge gap, also genuinely needs the double jump
  { x: 1470, height: 230, width: 60 },                      // shuttle's near dock — last normally-reachable cloud

  // --- everything below is only reachable via the shuttle ---
  { x: 1770, height: 220, width: 140, type: "alligator" },  // shuttle's far dock — the destination
  { x: 1900, height: 200, width: 60 },
  { x: 2000, height: 170, width: 60 },
  { x: 2100, height: 140, width: 70 },

  // --- two lower tiers under the shuttle zone — reachable without ever
  // touching the shuttle, so that whole horizontal stretch isn't just empty air ---
  { x: 1520, height: 40,  width: 60 },
  { x: 1640, height: 90,  width: 60 },
  { x: 1770, height: 40,  width: 60 },
  { x: 1900, height: 90,  width: 60 },
  { x: 2020, height: 40,  width: 70 }
];

// rabbit-shuttle — travels between two docks (a real destination, not a
// patrol going nowhere). Docks for 4s at each end so you can mount without
// needing to time a moving target; the crossing itself is a gentle
// multi-hop sequence, not a smooth glide or a rigid stop-start.
const rabbitShuttle = {
  dockA: { x: 1470, height: 230 }, // matches the last normally-reachable hop-cloud
  dockB: { x: 1770, height: 220 }, // matches the alligator — otherwise unreachable
  state: "docked",   // "docked" | "traveling"
  dockedAt: "A",
  t: 0,
  DOCK_TIME: 4000,
  TRAVEL_TIME: 4500,  // slow, deliberate crossing
  HOP_COUNT: 5,        // how many gentle hops the crossing is broken into
  mounted: false,
  currentX: 1470,
  currentHeight: 230,
  width: 64
};

// the crystal — sits on the alligator cloud, only reachable via the shuttle
const crystal = {
  x: 1865, // right-of-center on the alligator platform (spans 1770-1910), not its left edge
  heightAboveGround: 240, // just above the alligator platform's surface (height 220)
  collected: false,
  collecting: false
};

function drawCrystalOnCloud(camX) {
  if (crystal.collected || crystal.collecting) return;
  drawCrystalShape(ctx, crystal.x - camX, gy - crystal.heightAboveGround, 11, 0);
}

/* ======================================================
   WATER DRIPS — a few clouds periodically release a single
   falling drop. Purely visual for now; this is the setup for
   a future bucket-collection mechanic (pinned, not built yet).
   ====================================================== */
const WATER_DRIP_INTERVAL_MIN = 7000;  // ms
const WATER_DRIP_INTERVAL_MAX = 11000; // ms — "every 7 seconds or so, maybe longer"
const WATER_DRIP_FALL_SPEED = 40;      // height units per second

const waterDrips = [
  { x: 1900, sourceHeight: 200, dropHeight: null, timer: 3000 + Math.random() * 3000 },  // highest cloud past the jewel area
  { x: 2000, sourceHeight: 170, dropHeight: null, timer: 4000 + Math.random() * 3000 }   // second-highest, same stretch
];

function updateWaterDrips(deltaTime) {
  waterDrips.forEach(drip => {
    if (drip.dropHeight === null) {
      drip.timer -= deltaTime * 1000;
      if (drip.timer <= 0) {
        drip.dropHeight = drip.sourceHeight;
        drip.timer = WATER_DRIP_INTERVAL_MIN + Math.random() * (WATER_DRIP_INTERVAL_MAX - WATER_DRIP_INTERVAL_MIN);
      }
    } else {
      drip.dropHeight -= WATER_DRIP_FALL_SPEED * deltaTime;

      // auto-catch: bucket must be actively HELD (clicked/selected), not
      // just sitting uncollected-from in inventory — "in play" means equipped.
      // Position matters, timing doesn't — no button press needed.
      if (heldItem === "bucket" && !bucketFilled) {
        const playerCenterX = player.x + player.width / 2;
        const nearX = Math.abs(playerCenterX - drip.x) < 40;
        const nearHeight = Math.abs(player.y - drip.dropHeight) < 20;

        if (nearX && nearHeight) {
          bucketDropCount++;
          drip.dropHeight = null; // caught — gone until the next cycle
          if (bucketDropCount >= BUCKET_DROPS_NEEDED) {
            bucketFilled = true;
          }
          updateInventoryUI(); // refresh the chip immediately
          return;
        }
      }

      if (drip.dropHeight <= 0) {
        drip.dropHeight = null; // reached the ground, gone until the next cycle
      }
    }
  });
}

function drawWaterDrips(camX) {
  waterDrips.forEach(drip => {
    if (drip.dropHeight === null) return;

    const dx = drip.x - camX;
    const dy = gy - drip.dropHeight;

    ctx.fillStyle = "rgba(120,180,255,0.85)";
    ctx.beginPath();
    ctx.ellipse(dx, dy, 3, 5, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

// generic hop-cloud platform — flatter/more elongated than the puffy
// decorative shape, reads more clearly as "a thing you stand on"
function drawPlatformCloud(x, height, width, camX) {
  const cx = x - camX;
  const cy = gy - height;

  ctx.fillStyle = "rgba(255,255,255,0.92)";
  ctx.beginPath();
  ctx.ellipse(cx + width * 0.2, cy, width * 0.32, 14, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + width * 0.6, cy - 4, width * 0.28, 13, 0, 0, Math.PI * 2);
  ctx.ellipse(cx + width * 0.85, cy, width * 0.22, 12, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,255,255,0.98)";
  ctx.beginPath();
  ctx.ellipse(cx + width * 0.5, cy - 6, width * 0.45, 8, 0, 0, Math.PI * 2);
  ctx.fill();
}

// whale anchor platform — long body, tail flip, small spout
function drawWhaleCloud(x, height, width, camX) {
  const cx = x - camX;
  const cy = gy - height;

  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.beginPath();
  ctx.ellipse(cx + width * 0.45, cy, width * 0.42, 22, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx + width * 0.02, cy);
  ctx.quadraticCurveTo(cx - width * 0.08, cy - 26, cx - width * 0.02, cy - 30);
  ctx.quadraticCurveTo(cx + width * 0.06, cy - 10, cx + width * 0.1, cy);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(cx + width * 0.75, cy - 24, 8, 10, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#2b2b2b";
  ctx.beginPath();
  ctx.arc(cx + width * 0.75, cy - 6, 2, 0, Math.PI * 2);
  ctx.fill();
}

// alligator anchor platform — long low body, snout, back-ridge bumps
function drawAlligatorCloud(x, height, width, camX) {
  const cx = x - camX;
  const cy = gy - height;

  ctx.fillStyle = "rgba(255,255,255,0.96)";
  ctx.beginPath();
  ctx.ellipse(cx + width * 0.5, cy, width * 0.48, 16, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(cx + width * 0.95, cy + 2, width * 0.12, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.ellipse(cx + width * (0.25 + i * 0.15), cy - 12, 8, 8, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.fillStyle = "#2b2b2b";
  ctx.beginPath();
  ctx.arc(cx + width * 0.85, cy - 2, 2, 0, Math.PI * 2);
  ctx.fill();
}

// dispatcher for the interactive hop-clouds
function drawHopCloud(cloud, camX) {
  if (cloud.type === "whale") drawWhaleCloud(cloud.x, cloud.height, cloud.width, camX);
  else if (cloud.type === "alligator") drawAlligatorCloud(cloud.x, cloud.height, cloud.width, camX);
  else drawPlatformCloud(cloud.x, cloud.height, cloud.width, camX);
}

// the shuttle itself — same rabbit silhouette as before
function drawRabbitShuttleCloud(camX) {
  const cx = rabbitShuttle.currentX - camX;
  const cy = gy - rabbitShuttle.currentHeight;

  ctx.fillStyle = "rgba(255,255,255,0.95)";
  ctx.beginPath();
  ctx.ellipse(cx - 10, cy - 22, 7, 20, -0.15, 0, Math.PI * 2);
  ctx.ellipse(cx + 6, cy - 22, 7, 20, 0.15, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.ellipse(cx, cy, 30, 18, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.arc(cx + 28, cy + 4, 8, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#2b2b2b";
  ctx.beginPath();
  ctx.arc(cx - 14, cy - 2, 2, 0, Math.PI * 2);
  ctx.fill();
}

// docked: gentle idle bob in place, not a rigid stop. traveling: a real
// multi-hop sequence across the gap (bounces along the way, not a glide),
// trending from one dock's height to the other's as it goes.
function updateRabbitShuttle(deltaTime) {
  rabbitShuttle.t += deltaTime * 1000;

  if (rabbitShuttle.state === "docked") {
    const dock = rabbitShuttle.dockedAt === "A" ? rabbitShuttle.dockA : rabbitShuttle.dockB;
    rabbitShuttle.currentX = dock.x;
    rabbitShuttle.currentHeight = dock.height + Math.abs(Math.sin(rabbitShuttle.t * 0.0025)) * 6;

    if (rabbitShuttle.t >= rabbitShuttle.DOCK_TIME) {
      rabbitShuttle.state = "traveling";
      rabbitShuttle.t = 0;
    }
  } else {
    const from = rabbitShuttle.dockedAt === "A" ? rabbitShuttle.dockA : rabbitShuttle.dockB;
    const to = rabbitShuttle.dockedAt === "A" ? rabbitShuttle.dockB : rabbitShuttle.dockA;

    const progress = Math.min(rabbitShuttle.t / rabbitShuttle.TRAVEL_TIME, 1);
    const hopPhase = (progress * rabbitShuttle.HOP_COUNT) % 1;
    const hopArc = Math.abs(Math.sin(hopPhase * Math.PI)) * 35; // gentle bounce per hop

    rabbitShuttle.currentX = from.x + (to.x - from.x) * progress;
    rabbitShuttle.currentHeight = from.height + (to.height - from.height) * progress + hopArc;

    if (rabbitShuttle.mounted) {
      player.x = rabbitShuttle.currentX;
      player.y = rabbitShuttle.currentHeight;
    }

    if (progress >= 1) {
      rabbitShuttle.state = "docked";
      rabbitShuttle.dockedAt = rabbitShuttle.dockedAt === "A" ? "B" : "A";
      rabbitShuttle.t = 0;
    }
  }

  if (rabbitShuttle.mounted && keys.down) {
    rabbitShuttle.mounted = false; // dismount wherever it currently is, even mid-crossing
  }
}

function drawCloudsScene(camX) {
  // multi-stop sky — deeper blue up top, fading toward near-white
  const sky = ctx.createLinearGradient(0, 0, 0, canvas.height);
  sky.addColorStop(0, "#a9d4f0");
  sky.addColorStop(0.35, "#c9e6f5");
  sky.addColorStop(0.65, "#e8f5fc");
  sky.addColorStop(1, "#fbfdff");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // varied background cloud shapes, not just repeats of one silhouette
  cloudsDecor.forEach(c => drawBackgroundCloud(c.x, c.y, c.scale, c.type, camX * 0.3));

  drawCrows(camX); // same birds, consistent across every zone

  // ground here IS cloud — soft and pale, not the usual grass/dirt
  const groundGrad = ctx.createLinearGradient(0, gy, 0, gy + 60);
  groundGrad.addColorStop(0, "#f0f8ff");
  groundGrad.addColorStop(1, "#dceef8");
  ctx.fillStyle = groundGrad;
  ctx.fillRect(-camX, gy, canvas.width + camX, canvas.height - gy);

  // soft rolling texture so the surface doesn't read as flat
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  for (let i = -2; i < 8; i++) {
    const bx = i * 180 - camX % 180;
    ctx.beginPath();
    ctx.ellipse(bx, gy + 4, 95, 18, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.fillStyle = "rgba(200,225,245,0.35)";
  for (let i = -2; i < 8; i++) {
    const bx = i * 180 - camX % 180 + 60;
    ctx.beginPath();
    ctx.ellipse(bx, gy + 14, 60, 10, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawHole(cloudHole.x, cloudHole.width, camX); // same visual language as spring's holes

  hopClouds.forEach(c => drawHopCloud(c, camX));
  drawCrystalOnCloud(camX);
  drawWaterDrips(camX);
  drawRabbitShuttleCloud(camX);
}

function updateCloudsScene(deltaTime) {
  if (fallState.active) return; // handled globally by updateFallState

  updateWaterDrips(deltaTime);
  updateRabbitShuttle(deltaTime);

  // mount via spacebar — same interact key as everything else, so it
  // stays free for picking things up while riding, not claimed by mounting.
  // Only mountable while DOCKED — that's the whole point of the dock pause,
  // so you never have to time a moving target
  if (!rabbitShuttle.mounted && !player.launched && rabbitShuttle.state === "docked") {
    if (pressedDownNear(rabbitShuttle.currentX, rabbitShuttle.currentHeight, 40, 30, 30)) {
      rabbitShuttle.mounted = true;
    }
  }

  // CRYSTAL PICKUP — same shape as tulip/boomerang's pickup
  if (!crystal.collected && !crystal.collecting) {
    if (pressedDownNear(crystal.x, crystal.heightAboveGround, 26, 15, 25)) {
      crystal.collecting = true;
      startCollectAnimation(
        { x: crystal.x, y: gy - crystal.heightAboveGround, size: 11, rotation: 0 },
        "crystal"
      );
    }
  }

  if (player.y <= 0) {
    const playerCenterX = player.x + player.width / 2;
    if (playerCenterX > cloudHole.x && playerCenterX < cloudHole.x + cloudHole.width) {
      fallState.active = true;
      fallState.t = 0;
      fallState.mode = "cloudHole";
    }
  }
}

function draw(){
ctx.clearRect(0,0,canvas.width,canvas.height);

if (camera.topDown) {
  ctx.fillStyle="rgba(245,245,240,0.94)";
  ctx.fillRect(0,0,canvas.width,canvas.height);
  ctx.fillStyle="#2b2b2b";
  ctx.fillText("Orchard → Paths",120,120);
} else {

const camX = cameraX;

if (currentScene === "autumn") {
  drawAutumnScene(camX);
} else if (currentScene === "spring") {
  drawSpringScene(camX);
} else if (currentScene === "clouds") {
  drawCloudsScene(camX);
}

// flying (collecting/placing) items — shared across scenes, drawn here so
// a pickup animation started in ANY scene actually renders, not just autumn's
flyingItems.forEach(f => {
  drawCollectible(ctx, f.x - camX, f.y, f.size * f.scale, f.rotation, f.itemType);
});

/* PLAYER */
const px = player.x - camX;
const py = gy - player.height - player.y;

// while falling through a hole, the body actually MOVES downward — it
// isn't frozen in place; only what crosses below ground level (gy) gets
// clipped away, so it reads as sinking into the hole rather than a static cutoff
const fallProgress = fallState.active ? Math.min(fallState.t / FALL_DURATION, 1) : 0;
const sinkAmount = fallProgress * (player.height + 20); // how far down the body has moved
const drawPy = py + sinkAmount;

// shadow shrinks along with the body sinking in
ctx.fillStyle = `rgba(60,40,20,${0.18 * (1 - fallProgress)})`;
ctx.beginPath();
ctx.ellipse(px + player.width/2, gy + 5, 18 * (1 - fallProgress * 0.5), 6 * (1 - fallProgress * 0.5), 0, 0, Math.PI*2);
ctx.fill();
// ground contact tint
ctx.fillStyle = `rgba(90,70,40,${0.08 * (1 - fallProgress)})`;
ctx.beginPath();
ctx.ellipse(px + player.width/2, gy + 6, 22, 8, 0, 0, Math.PI*2);
ctx.fill();

if (drawPy < gy) { // still at least partly above ground — worth drawing
  ctx.save();
  ctx.beginPath();
  ctx.rect(px - 2, 0, player.width + 4, gy); // only the region above ground level is visible
  ctx.clip();

  // body
  ctx.fillStyle = "#7a78b8";
  roundRect(ctx, px, drawPy, player.width, player.height, 8);
  ctx.fill();

  // outline body
  ctx.strokeStyle = "rgba(40,30,20,0.6)";
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // eyes
  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(px + 12, drawPy + 16, 3, 0, Math.PI*2);
  ctx.arc(px + 28, drawPy + 16, 3, 0, Math.PI*2);
  ctx.fill();

  ctx.fillStyle = "#2b2b2b";
  ctx.beginPath();
  ctx.arc(px + 12, drawPy + 17, 1.5, 0, Math.PI*2);
  ctx.arc(px + 28, drawPy + 17, 1.5, 0, Math.PI*2);
  ctx.fill();

  ctx.restore();
}

// held item — floats above the head while selected, so it's clear it's "in play"
if (heldItem && !fallState.active) {
  const heldPos = getHeldItemWorldPos();
  drawCollectible(ctx, heldPos.x - camX, heldPos.y, 10, 0, heldItem);
}

drawSeasonTransition(ctx);
}
}
/* ======================================================
   MAIN LOOP
   ====================================================== */
function updateAutumnScene(deltaTime) {
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

    const pieceHeight = gy - p.y; // piece coords are world-space; convert to height-above-ground

    if (pressedDownNear(p.x, pieceHeight, 26, 10, 10)) {
      p.collecting = true; // stops it being drawn/re-triggered as a ground piece
      startCollectAnimation(p, "appleSlice");
      pickupHandledThisFrame = true;
    }
  });

  // boomerang: elevated, but same helper — just a different target height
  if (!boomerang.collected && !boomerang.collecting && !pickupHandledThisFrame) {
    if (pressedDownNear(boomerang.x, boomerang.heightAboveGround, 26, 20, 20)) {
      boomerang.collecting = true;
      startCollectAnimation(
        { x: boomerang.x, y: gy - boomerang.heightAboveGround, size: 10, rotation: 0 },
        "boomerang"
      );
      pickupHandledThisFrame = true;
    }
  }


  // apple glitter decay
if (apple.glitter > 0) apple.glitter--;
if (apple.splitTimer > 0) apple.splitTimer--;

  // --- FROG INTERACTION (per-frame, correct place) ---
  const frogCenterX = frog.x + frog.width / 2;

  if (pressedDownNear(frogCenterX, 0, 70, 6, 999) && !frog.active && !pickupHandledThisFrame) {
    frog.active = true;
    frog.tip = 30;
  }

if (apple.landed && !frogNoticedApple) {
  frogNoticedApple = true;
  frog.tip = 40;
}

if (frog.active && apple.cracked && inventory.appleSlice > 0 && orchardChoice === null && keys.space) {
  orchardPaths.forEach(p => {
    if (isPlayerNear(p.x, 0, 40, 0, 0)) {
      orchardChoice = p.id;
      frog.tip = 40;
    }
  });
}

// PLACEMENT SLOTS: place the currently held item into a matching slot
placementSlots.forEach(slot => {
  if (slot.filled) return;

  if (
    heldItem === slot.acceptsItemType &&
    inventory[heldItem] > 0 &&
    pressedDownNear(slot.x, slot.heightAboveGround, 30, 10, 10)
  ) {
    const itemToPlace = heldItem;

    inventory[itemToPlace]--;
    if (inventory[itemToPlace] <= 0) delete inventory[itemToPlace];
    heldItem = null;
    updateInventoryUI();

    startPlaceAnimation(itemToPlace, slot.x, gy - slot.heightAboveGround, () => {
      slot.filled = true;
      slot.onFill(itemToPlace);
    });
  }
});

// DOORWAY: only enterable once the connection is unlocked
if (
  connections[0].filled &&
  seasonTransition.phase === "idle" &&
  pressedDownNear(
    connections[0].doors.autumn.x + connections[0].doors.autumn.width / 2,
    0, 30, 6, 6
  )
) {
  startSeasonTransition("spring");
}

}

// shared — the brief "settled on the cloud" beat, then the real transition fires
function updateCloudLanding(deltaTime) {
  if (!cloudLanding.active) return;

  cloudLanding.t += deltaTime * 1000;

  if (cloudLanding.t >= CLOUD_LANDING_HOLD) {
    cloudLanding.active = false;
    cloudLanding.t = 0;
    startSeasonTransition("clouds");
  }
}

// shared — runs regardless of which scene initiated the fall, so a fall
// started in the clouds (via cloudHole) completes correctly even though
// updateCloudsScene, not updateSpringScene, is what's running that frame
function updateFallState(deltaTime) {
  if (!fallState.active) return;

  fallState.t += deltaTime * 1000;

  if (fallState.t >= FALL_DURATION) {
    fallState.active = false;
    fallState.t = 0;

    if (fallState.mode === "cloudHole") {
      // switch scenes and arrive mid-air — floating down out of the clouds,
      // not teleported straight to the ground
      currentScene = "spring";
      discoveredScenes.spring = true;
      updateMapUI();

      // direct x-correspondence: player.x hasn't moved since falling in
      // (movement is frozen during the fall), so it's already sitting
      // exactly where the cloud-hole was — landing directly below it
      player.y = 200;
      player.vy = 0;
      player.vx = 0;
      player.jumping = true;
      player.launched = true;       // reuses the same floaty-descent physics as a failed swing launch
      player.launchPeakHeight = player.y;
      cameraX = Math.max(0, player.x - canvas.width * 0.4);
    } else {
      // faze back to the start of the spring zone
      player.x = sceneSpawns.spring.x;
      player.y = 0;
      player.vy = 0;
      player.jumping = false;
      player.usedDoubleJump = false;
      cameraX = 0;
    }
  }
}

function updateSpringScene(deltaTime) {

  // mid-fall — timer/completion handled globally now, just don't run
  // anything else in this scene while it's happening
  if (fallState.active) {
    return;
  }

  // RABBIT INTERACTION — same shape as frog's trigger
  const rabbitCenterX = rabbit.x + rabbit.width / 2;
  if (pressedDownNear(rabbitCenterX, 0, 70, 6, 999) && !rabbit.active) {
    rabbit.active = true;
    rabbit.tip = 30;
  }
  updateNPCIdle(rabbit);

  // mounting the swing now happens via jump, in handleInput — just run its physics here
  updateSwing(deltaTime);

  updateWiggleBush(deltaTime);

  // HOLES — only trip the fall if grounded (player.y<=0) and NOT mid-jump
  // over it; jumping keeps player.y > 0 while crossing the hole's x-range
  if (player.y <= 0) {
    const playerCenterX = player.x + player.width / 2;
    const overHole = springHoles.some(h => playerCenterX > h.x && playerCenterX < h.x + h.width);

    if (overHole) {
      fallState.active = true;
      fallState.t = 0;
      fallState.mode = "hole";
    }
  }

  // TULIP PICKUP — same shape as boomerang's pickup in autumn
  if (!tulip.collected && !tulip.collecting) {
    if (pressedDownNear(tulip.x, tulip.heightAboveGround, 26, 10, 10)) {
      tulip.collecting = true;
      startCollectAnimation(
        { x: tulip.x, y: gy - tulip.heightAboveGround, size: 10, rotation: 0 },
        "tulip"
      );
    }
  }

  // walk through the same connection, back to autumn — same door,
  // same unlock state, just approached from the other side
  if (
    connections[0].filled &&
    seasonTransition.phase === "idle" &&
    pressedDownNear(
      connections[0].doors.spring.x + connections[0].doors.spring.width / 2,
      0, 30, 6, 6
    )
  ) {
    startSeasonTransition("autumn");
  }
}

function update(){

  // console.log("UPDATE START y =", apple.y);

const now = performance.now();
const deltaTime = Math.min((now - lastTime) / 1000, 0.05);
lastTime = now;

  handleInput();
  applyPhysics();



updateFallState(deltaTime); // shared — runs before scene dispatch, regardless of which scene started the fall
updateCloudLanding(deltaTime);

if (currentScene === "autumn") {
  updateAutumnScene(deltaTime);
} else if (currentScene === "spring") {
  updateSpringScene(deltaTime);
} else if (currentScene === "clouds") {
  updateCloudsScene(deltaTime);
}

  updateFlyingItems(deltaTime, cameraX); // shared system, runs in any scene

updateSeasonTransition(deltaTime);

  draw();

  const targetCam = player.x - canvas.width*0.4;
  cameraX += (targetCam - cameraX)*0.08;
  if (cameraX<0) cameraX=0;

  keys.leftJustPressed = false;
  keys.rightJustPressed = false;
  keys.upJustPressed = false;

  // console.log("UPDATE END y =", apple.y);
  
  requestAnimationFrame(update);
}


update();


});