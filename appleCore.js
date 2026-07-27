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
  if (["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," ","Control","Tab"].includes(e.key)) {
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
  if (e.key===" ") {
    if (!keys.space) keys.spaceJustPressed = true;
    keys.space=true;
  }
  if (e.key==="Control") keys.ctrl=true;
  if (e.key==="Tab" && !e.repeat) cycleHeldItem();
  if ((e.key==="c" || e.key==="C") && !e.repeat) keys.cJustPressed = true;
  if ((e.key==="b" || e.key==="B") && !e.repeat) selectBoomerangIfAvailable();
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
let currentScene = "spring"; // TEMPORARY — starting in spring to test the new Forest entrance easily, revert to "autumn" when done
let hasReturnedFromClouds = false; // set true the moment a cloud-hole fall completes — the willow's real unlock condition

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
  x: 3050, // TEMPORARY — spawns near the new spring-forest door for easy testing, revert to 400 when done
  y: 0,               // height above ground
  width: 40,
  height: 54,
  speed: 3,
  jumping: false,
  usedDoubleJump: false, // resets whenever player lands on anything
  vy: 0,
  vx: 0,               // horizontal momentum — only used during a swing launch
  launched: false,     // true while mid-flight from a swing release
  launchPeakHeight: 0, // tracks how high THIS launch has reached, for the cloud threshold check
  vineFlying: false,   // true while mid-flight from a vine release — real horizontal+vertical momentum, checks for grabbing the NEXT vine
  onSeesawBounce: false, // true while airborne from a seesaw jump-pump — uses its own slower gravity instead of standard physics
  facing: 1,           // 1 = right, -1 = left — last direction moved, used to aim thrown items
  cloudLandingImmunity: 0 // ms — brief grace period after landing from a cloud-hole, prevents an instant re-trigger of the goal-cloud hit check
};

/* ======================================================
   INVENTORY
   ====================================================== */
const inventory = { appleSlice: 2 }; // TEMPORARY — seeded for testing the new forest door, revert to {} when done

const ITEM_ICONS = {
  appleSlice: "🍎",
  boomerang: "🪃",
  tulip: "🌷",
  crystal: "💎",
  bucket: "🪣",
  honey: "🍯",
  cloudPiece: "☁️",
  peanut: "🥜",
  shovel: "🛠️",
  plumStick: "🌿",
  pearStick: "🌿",
  peachStick: "🌿",
  apple: "🍏",
  roundLeaf: "🍂",
  mapleLeaf: "🍁",
  acorn: "🌰",
  worm: "🪱",
  pumpkin: "🎃",
  goldPile: "🪙",
  lamp: "🏮",
  bridgePiece: "🪵",
  feather: "🪶"
};

// the bucket is stateful (empty/filling/full), unlike every other item
// which is just a count — tracked separately from the inventory dict
let bucketDropCount = 0;
let bucketFilled = false;
const BUCKET_DROPS_NEEDED = 3;

// heldItem = the item type currently "picked up" in hand, ready to place
// into a slot. Click an inventory chip to select/deselect it.
let heldItem = null; // nothing held by default -- lamp is no longer seeded, so there's nothing to default to holding
// separate from heldItem/inventory -- books are unique, non-stackable,
// and picking up a new one swaps out whatever was already carried,
// rather than accumulating like normal collectibles
let carriedBook = null;
let carriedFeather = false;

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

let cloudPieceBurstPending = false; // consumed once by the chip's one-time grow+sparkle animation

let honeyScoops = 0; // set to 8 on collection

// explicit collection-order tracking, newest first -- cycling relies on
// this instead of raw object key order, which was never actually
// designed on purpose (it just happened to put whichever item type was
// FIRST ever collected at the front, forever)
let inventoryOrder = ["appleSlice"]; // TEMPORARY — matches the current debug inventory seed, revert to ["acorn", "pumpkin"] when done
function touchInventoryOrder(itemType) {
  const idx = inventoryOrder.indexOf(itemType);
  if (idx !== -1) inventoryOrder.splice(idx, 1);
  inventoryOrder.unshift(itemType);
}

function addToInventory(itemType) {
  inventory[itemType] = (inventory[itemType] || 0) + 1;
  touchInventoryOrder(itemType);
  if (itemType === "cloudPiece" && inventory[itemType] === 8) {
    cloudPieceBurstPending = true;
  }
  if (itemType === "honey") {
    honeyScoops = 8; // reusable tool — 6 needed for the graft combinations, extra for sticking other items on honey
  }
  if (itemType === "boomerang" && inventory[itemType] === 1 && !boomerangPromptState.promptEverShown) {
    boomerangPromptState.promptAnimT = 0;
  }
  updateInventoryUI();
}

function selectHeldItem(itemType) {
  if (itemType === "feather") return; // display-only in the inventory chip strip -- carried via carriedFeather instead, same pattern as books
  if (!inventory[itemType] || inventory[itemType] <= 0) return;
  heldItem = heldItem === itemType ? null : itemType; // click again to deselect
  carriedBook = null; // same "put it back" logic as leaving oak -- both share the above-head display slot
  updateInventoryUI();
}

// dedicated shortcut -- boomerang stays reliably one keypress away
// regardless of collection order or how many other items are in
// inventory, rather than needing to tab-cycle to find it
function selectBoomerangIfAvailable() {
  if (!inventory.boomerang || inventory.boomerang <= 0) return;
  heldItem = "boomerang";
  carriedBook = null;
  boomerangPromptState.promptEverShown = true; // retired for good the first time B is actually used
  updateInventoryUI();
}

// Tab cycles through held items — a keyboard-only way to select, since
// everything else in this game is keyboard-driven except clicking chips
function cycleHeldItem() {
  const types = inventoryOrder.filter(t => inventory[t] > 0 && t !== "feather");
  if (types.length === 0) return;
  const currentIdx = types.indexOf(heldItem);
  const nextIdx = (currentIdx + 1) % types.length;
  heldItem = types[nextIdx];
  carriedBook = null;
  updateInventoryUI();
}

// items whose inventory chip should show the ACTUAL drawn world-shape
// (with live state) instead of an emoji — for anything stateful, or
// anything without a good emoji match. Bucket is the first user; any
// future item can opt in the same way.
const ITEM_CANVAS_RENDER = {
  paperAirplane: (iconCtx) => {
    iconCtx.clearRect(0, 0, 20, 20);
    iconCtx.save();
    iconCtx.translate(10, 10);
    iconCtx.rotate(-0.2);
    iconCtx.fillStyle = "#f0e8d8";
    iconCtx.beginPath();
    iconCtx.moveTo(8, 0);
    iconCtx.lineTo(-7, -5);
    iconCtx.lineTo(-3, 0);
    iconCtx.lineTo(-7, 5);
    iconCtx.closePath();
    iconCtx.fill();
    iconCtx.strokeStyle = "rgba(0,0,0,0.2)";
    iconCtx.lineWidth = 0.6;
    iconCtx.stroke();
    iconCtx.beginPath();
    iconCtx.moveTo(8, 0);
    iconCtx.lineTo(-3, 0);
    iconCtx.stroke();
    iconCtx.restore();
  },
  marble: (iconCtx) => {
    iconCtx.clearRect(0, 0, 20, 20);
    iconCtx.fillStyle = "#c85a8a";
    iconCtx.beginPath();
    iconCtx.arc(10, 10, 6, 0, Math.PI * 2);
    iconCtx.fill();
    iconCtx.fillStyle = "rgba(255,255,255,0.6)";
    iconCtx.beginPath();
    iconCtx.arc(8, 8, 1.8, 0, Math.PI * 2);
    iconCtx.fill();
  },
  bucket: (iconCtx) => {
    iconCtx.clearRect(0, 0, 20, 20);
    drawBucketShape(iconCtx, 10, 12, 7, 0);
  },
  shovel: (iconCtx) => {
    iconCtx.clearRect(0, 0, 20, 20);
    drawShovelShape(iconCtx, 10, 12, 7, 0.3);
  },
  goldPile: (iconCtx) => {
    iconCtx.clearRect(0, 0, 20, 20);
    drawGoldPileShape(iconCtx, 10, 11, 9, 0);
  },
  honey: (iconCtx) => {
    iconCtx.clearRect(0, 0, 20, 20);
    drawHoneyPotShape(iconCtx, 10, 11, 8, honeyScoops / 8);
  },
  plumStick: (iconCtx) => {
    iconCtx.clearRect(0, 0, 20, 20);
    drawStickShape(iconCtx, 10, 13, 13, 0.5, sticks.plum.color);
    iconCtx.fillStyle = FRUIT_STYLES.plum.color;
    iconCtx.beginPath();
    iconCtx.arc(6, 6, 3.5, 0, Math.PI * 2);
    iconCtx.fill();
  },
  pearStick: (iconCtx) => {
    iconCtx.clearRect(0, 0, 20, 20);
    drawStickShape(iconCtx, 10, 13, 13, 0.5, sticks.pear.color);
    iconCtx.fillStyle = FRUIT_STYLES.pear.color;
    iconCtx.beginPath();
    iconCtx.ellipse(6, 6, 3, 4, 0, 0, Math.PI * 2);
    iconCtx.fill();
  },
  peachStick: (iconCtx) => {
    iconCtx.clearRect(0, 0, 20, 20);
    drawStickShape(iconCtx, 10, 13, 13, 0.5, sticks.peach.color);
    iconCtx.fillStyle = FRUIT_STYLES.peach.color;
    iconCtx.beginPath();
    iconCtx.arc(6, 6, 3.5, 0, Math.PI * 2);
    iconCtx.fill();
  },
  apple: (iconCtx) => {
    iconCtx.clearRect(0, 0, 20, 20);
    drawWholeAppleShape(iconCtx, 10, 11, 8, 0);
  },
  appleSlice: (iconCtx) => {
    iconCtx.clearRect(0, 0, 20, 20);
    drawApplePieceShape(iconCtx, 10, 11, 8, 0);
  },
  Pearchy: (iconCtx) => {
    iconCtx.clearRect(0, 0, 20, 20);
    drawPearchyFruit(iconCtx, 10, 11, 8);
  },
  Peachum: (iconCtx) => {
    iconCtx.clearRect(0, 0, 20, 20);
    drawPeachumFruit(iconCtx, 10, 11, 8);
  },
  Plear: (iconCtx) => {
    iconCtx.clearRect(0, 0, 20, 20);
    drawPlearFruit(iconCtx, 10, 11, 8);
  },
  roundLeaf: (iconCtx) => {
    iconCtx.clearRect(0, 0, 20, 20);
    drawLeafShape(iconCtx, 10, 11, 7, 0, "round", "#e0722a");
  },
  mapleLeaf: (iconCtx) => {
    iconCtx.clearRect(0, 0, 20, 20);
    drawLeafShape(iconCtx, 10, 11, 7, 0, "maple", "#e8481f");
  },
  acorn: (iconCtx) => {
    iconCtx.clearRect(0, 0, 20, 20);
    drawAcornShape(iconCtx, 10, 12, 7, 0);
  },
  worm: (iconCtx) => {
    iconCtx.clearRect(0, 0, 20, 20);
    drawWormShape(iconCtx, 10, 10, 7, 0);
  },
  pumpkin: (iconCtx) => {
    iconCtx.clearRect(0, 0, 20, 20);
    drawPumpkinShape(iconCtx, 10, 11, 8, 0);
  },
  lamp: (iconCtx) => {
    iconCtx.clearRect(0, 0, 20, 20);
    drawLampShape(iconCtx, 10, 11, 8, 0, false);
  },
  feather: (iconCtx) => {
    iconCtx.clearRect(0, 0, 20, 20);
    drawFeatherShape(iconCtx, 10, 10, 8, 0.3);
  }
};

function updateInventoryUI() {
  const entries = Object.entries(inventory).filter(([type]) => !CARRYING_ITEM_TYPES.has(type));
  invEl.innerHTML = "";
  updateCarryingUI();

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
    chip.style.verticalAlign = "middle"; // overrides default baseline alignment, which differed between text-only and canvas-backed chips

    if (ITEM_CANVAS_RENDER[type]) {
      const iconCanvas = document.createElement("canvas");
      iconCanvas.width = 20;
      iconCanvas.height = 20;
      iconCanvas.style.display = "block"; // removes the inline element's baseline gap, so flex centering is exact
      ITEM_CANVAS_RENDER[type](iconCanvas.getContext("2d"));
      chip.appendChild(iconCanvas);

      const NO_COUNT_LABEL = ["bucket", "honey", "plumStick", "pearStick", "peachStick", "roundLeaf", "mapleLeaf", "boomerang", "lamp", "marble", "paperAirplane"];
      if (!NO_COUNT_LABEL.includes(type)) {
        const label = document.createElement("span");
        label.textContent = ` x${count}`;
        chip.appendChild(label);
      }

      chip.title = type === "bucket"
        ? (bucketFilled ? "Full — carry it down to spring" : `${bucketDropCount}/${BUCKET_DROPS_NEEDED} drops collected`)
        : "Click to hold this item";
    } else if (type === "cloudPiece") {
      chip.textContent = `${ITEM_ICONS[type]} x${count}/8`;
      chip.title = "Click to hold this item";
      if (cloudPieceBurstPending) {
        cloudPieceBurstPending = false;
        chip.animate([
          { transform: "scale(1)", filter: "brightness(1)" },
          { transform: "scale(1.8)", filter: "brightness(1.6)" },
          { transform: "scale(1)", filter: "brightness(1)" }
        ], { duration: 500, easing: "ease-out" });
      }
    } else {
      chip.textContent = `${ITEM_ICONS[type] || "?"} x${count}`;
      chip.title = "Click to hold this item";
    }

    chip.addEventListener("click", () => selectHeldItem(type));
    invEl.appendChild(chip);
  });
}

function initCarryingUI() {
  if (carryingUIEl) return;
  const wrapper = document.createElement("div");
  wrapper.id = "carryingWrapper";
  wrapper.style.marginTop = "6px";
  const label = document.createElement("div");
  label.textContent = "Carrying";
  label.style.fontSize = "11px";
  label.style.color = "#888";
  label.style.marginBottom = "2px";
  wrapper.appendChild(label);

  carryingUIEl = document.createElement("div");
  wrapper.appendChild(carryingUIEl);

  invEl.insertAdjacentElement("afterend", wrapper);
  carryingUIEl._wrapper = wrapper;
}

function updateCarryingUI() {
  if (!carryingUIEl) initCarryingUI();
  const entries = Object.entries(inventory).filter(([type]) => CARRYING_ITEM_TYPES.has(type) && inventory[type] > 0);
  carryingUIEl._wrapper.style.display = entries.length ? "" : "none";
  carryingUIEl.innerHTML = "";

  entries.forEach(([type, count]) => {
    const chip = document.createElement("span");
    const selectable = type !== "feather"; // feather just needs to be carried, not selected -- worm still needs selecting to place on the seesaw
    chip.style.cursor = selectable ? "pointer" : "default";
    chip.style.marginRight = "8px";
    chip.style.padding = "1px 5px";
    chip.style.borderRadius = "4px";
    chip.style.border = type === "feather"
      ? "2px solid #c9a04a" // always highlighted -- meaningfully active whenever present
      : heldItem === type ? "2px solid #2b2b2b" : "2px solid transparent";
    chip.style.display = "inline-flex";
    chip.style.alignItems = "center";
    chip.style.verticalAlign = "middle";

    if (ITEM_CANVAS_RENDER[type]) {
      const iconCanvas = document.createElement("canvas");
      iconCanvas.width = 20;
      iconCanvas.height = 20;
      iconCanvas.style.display = "block";
      ITEM_CANVAS_RENDER[type](iconCanvas.getContext("2d"));
      chip.appendChild(iconCanvas);
    } else {
      chip.textContent = `${ITEM_ICONS[type] || "?"} `;
    }
    if (type !== "feather") {
      const label = document.createElement("span");
      label.textContent = ` x${count}`;
      chip.appendChild(label);
    }
    chip.title = selectable ? "Click to hold this item" : "Bring it to where it belongs";
    if (selectable) chip.addEventListener("click", () => selectHeldItem(type));
    carryingUIEl.appendChild(chip);
  });
}

/* ======================================================
   FROG NPC
   ====================================================== */
const frog = {
  x: 820, // middle of the gap between the two platforms (560 and 1080)
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
  },
  {
    // required to reach the (raised) hive. At the tightened radius, only
    // ~1130-1190 (the right portion) is actually in range — verified the
    // left ~50px genuinely misses, so it's not "anywhere on the platform"
    x: 1080,
    heightAboveGround: 60,
    width: 110,
    thickness: 14
  },

  // vine-area stepping stones — the mid-tier platform is now only reachable
  // via the ground-tier vine's swing, not a paved jump-chain (removed the
  // lower stepping-stone that was providing an unintended easy shortcut)
  { x: 2300, heightAboveGround: 190, width: 70, thickness: 14 }, // under mid-tier vine 1

  // new jump-around platforms, purely for breathing room — no payoff,
  // just something to hop between, positioned left of the oak after the crown trees
  { x: 2180, heightAboveGround: 90, width: 60, thickness: 14 },
  { x: 2250, heightAboveGround: 150, width: 60, thickness: 14 }
];

/* ======================================================
   RAMP (simple slope, no momentum yet — walk speed only)
   ====================================================== */
const ramps = [
  {
    x: 870,
    width: 90,          // widened — same rise, spread over more distance, so the slope reads as gentler
    heightStart: 45,     // raised well clear of walking-snap tolerance — unambiguously requires a jump
    heightEnd: 78         // ground height at right edge — leads up to the boomerang
  }
];

/* ======================================================
   BOOMERANG (static collectible, tucked into tree 2's canopy)
   ====================================================== */
const boomerang = {
  x: 1025, // offset from tree(980)'s center so the canopy occludes part of it, not dead-center under it
  heightAboveGround: 120, // unreachable from a ground jump (~90 max) or stepping off the ramp — needs a jump from the ramp's peak
  collected: false, // normally false
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
  },
  forest: { // seen while standing in spring, leads to forest — deep mossy green, darker and stranger than spring's own light green
    stops: ["rgba(90,120,70,0.9)", "rgba(60,90,50,0.75)", "rgba(35,60,32,0.6)"],
    bleed: "55,85,45"
  }
};

const connections = [
  {
    id: "autumn-spring",
    doors: {
      autumn: { x: 3400, width: 56, height: 92, leadsTo: "spring" },
      spring: { x: 200,  width: 56, height: 92, leadsTo: "autumn" }
    },
    acceptsItemType: "appleSlice",
    filled: true, // TEMPORARY — pre-unlocked since starting directly in spring for testing, revert to false when done
    filledItemType: "appleSlice"
  },
  {
    id: "spring-forest",
    doors: {
      spring: { x: 3100, width: 56, height: 92, leadsTo: "forest" },
      forest: { x: 200,  width: 56, height: 92, leadsTo: "spring" }
    },
    acceptsItemType: "appleSlice", // same item type -- the apple already splits into 3 pieces, so a second slice is already reachable without any new collection mechanic
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
  },
  {
    // map-only entry — autumn<->oak travel is handled by the seesaw
    // launch and the oak scene's return door, not a standard door pair.
    id: "autumn-oak",
    doors: {
      autumn: { leadsTo: "oak" },
      oak: { leadsTo: "autumn" }
    },
    acceptsItemType: null,
    filled: true,
    filledItemType: null
  },
  {
    // map-only entry — oak<->ratroom travel is handled by the trap
    // door and its return spawn, not a standard door pair.
    id: "oak-ratroom",
    doors: {
      oak: { leadsTo: "ratroom" },
      ratroom: { leadsTo: "oak" }
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
  autumn: { label: "Autumn", x: 40,  y: 110 },
  spring: { label: "Spring", x: 220, y: 110 },
  forest: { label: "Forest", x: 400, y: 110 }, // continues the main line past spring
  clouds: { label: "Clouds", x: 220, y: 20 },  // above spring, not on the main line -- reached via the swing, a branch off spring
  oak:    { label: "Oak",    x: 40,  y: 20 },  // above autumn, not on the main line -- reached via the seesaw, a branch off autumn
  ratroom: { label: "Ratroom", x: 95, y: 65, w: 60, h: 30 } // diagonal nudge to the right, between oak and autumn -- some overlap with both is unavoidable given how tightly the existing four nodes are packed, but this avoids colliding with clouds/spring at least. Half-size, since it's a small side room off oak. Reached via the trap door from oak.
};

const discoveredScenes = { autumn: true, spring: true }; // TEMPORARY -- spring added since starting there directly to test forest, revert to just { autumn: true } when done

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
  // aged paper look -- cream background, reads as an old physical
  // object without needing burnt edges or a peeling corner on top of it
  mapEl.style.backgroundColor = "#ddd0a8";
  mapEl.innerHTML = "";

  const NODE_W = 120, NODE_H = 60; // matches .map-node's CSS dimensions

  // edges first, so nodes render on top of them
  connections.forEach(conn => {
    const [sceneA, sceneB] = Object.keys(conn.doors);
    if (!discoveredScenes[sceneA] || !discoveredScenes[sceneB]) return;

    const a = sceneMapInfo[sceneA];
    const b = sceneMapInfo[sceneB];
    if (!a || !b) return;

    const aW = a.w || NODE_W, aH = a.h || NODE_H, bW = b.w || NODE_W, bH = b.h || NODE_H;
    const aCenterX = a.x + aW / 2, aCenterY = a.y + aH / 2;
    const bCenterX = b.x + bW / 2, bCenterY = b.y + bH / 2;

    const dx = bCenterX - aCenterX, dy = bCenterY - aCenterY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist === 0) return;
    const dirX = dx / dist, dirY = dy / dist;

    const start = rectEdgeIntersection(aCenterX, aCenterY, aW / 2, aH / 2, dirX, dirY);
    const end = rectEdgeIntersection(bCenterX, bCenterY, bW / 2, bH / 2, -dirX, -dirY);

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
    if (info.w) node.style.width = info.w + "px";
    if (info.h) { node.style.height = info.h + "px"; node.style.fontSize = "0.75em"; }

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
  forest: { x: connections[1].doors.forest.x - 25 },
  clouds: { x: 420 }, // no door here — you arrive by launch; positioned right of the return hole (300-360)
  oak: { x: 380 }, // arrives via seesaw launch -- moved closer to the actual entrance door (oakReturnDoor at x:294), was landing 370 units away from it despite the door being the visual entry point
  ratroom: { x: 310 } // arrives via the trap door, lands near the base of the stairs
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
  },
  {
    id: "forestDoorwaySlot",
    x: connections[1].doors.spring.x + connections[1].doors.spring.width / 2,
    heightAboveGround: 8,
    acceptsItemType: connections[1].acceptsItemType,
    filled: false,
    onFill: (itemType) => {
      connections[1].filled = true;
      connections[1].filledItemType = itemType;
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

  // clear every special-movement state — a transition firing mid-vine,
  // mid-swing, etc. was leaving that state permanently true, which
  // silently blocks all input in the new scene since handleInput's guard
  // checks these flags before allowing any movement at all
  vines.forEach(v => { v.mounted = false; });
  swing.mounted = false;
  player.launched = false;
  player.vineFlying = false;
  player.vineFlyingSource = null;
  player.onSeesawBounce = false;
  if (typeof rabbitShuttle !== "undefined") rabbitShuttle.mounted = false;
  if (typeof peanutVine !== "undefined") peanutVine.mounted = false;
  seesaw.mounted = false;
  seesaw.playerOnPlank = false;
}

function updateSeasonTransition(deltaTime) {
  if (seasonTransition.phase === "idle") return;

  seasonTransition.t += deltaTime * 1000;
  const dur = TRANSITION_DURATIONS[seasonTransition.phase];

  if (seasonTransition.t >= dur) {
    seasonTransition.t = 0;

    if (seasonTransition.phase === "fadeOut") {
      // screen is fully white now — swap the actual scene behind it
      if (currentScene === "spring" && seasonTransition.targetScene !== "spring") {
        // graft sticks only matter in spring — clear them out once you leave
        delete inventory.plumStick;
        delete inventory.pearStick;
        delete inventory.peachStick;
        if (heldItem === "plumStick" || heldItem === "pearStick" || heldItem === "peachStick") heldItem = null;
        updateInventoryUI();
      }
      const previousScene = currentScene;
      currentScene = seasonTransition.targetScene;
      discoveredScenes[currentScene] = true;
      updateMapUI(); // covers both "newly discovered" and "current-scene highlight moved"
      if (currentScene === "ratroom" && previousScene !== "ratroom") {
        ratDialogueRestSuppressed = false; // fresh visit -- a genuine return greeting is fair game again
        ratRoomHighShelves.forEach(s => { if (s.tier > 0) s.unlocked = false; });
        snakeDialogue.everShownThisVisit = false;
        // the lamp automatically comes back "above your head" on every
        // ratroom entry once it's ever actually been used here, rather
        // than needing to be manually re-selected each time
        if (lampEverUsedInRatroom && inventory.lamp > 0) heldItem = "lamp";
      }
      if (currentScene === "oak" && previousScene === "ratroom") {
        // once the lamp has actually been used in ratroom, it never
        // leaves at all -- not just deselected when heading further to
        // autumn, but the moment it's carried back up to oak itself
        if (lampEverUsedInRatroom && heldItem === "lamp") heldItem = null;
        player.x = nookRug.x; // land next to the trap door, not the generic oak spawn
      } else if (currentScene === "autumn" && previousScene === "oak") {
        player.x = seesaw.x - 120; // land just left of the seesaw, clear of the plank itself
      } else {
        const spawn = sceneSpawns[currentScene];
        player.x = spawn.x;
      }
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
  } else if (target === "oak") {
    wash.addColorStop(0, "#d8b878");   // lighter warm wood-tone center
    wash.addColorStop(0.55, "#b8925a"); // warm amber-brown
    wash.addColorStop(1, "#8a6a3a");   // deeper wood edge
  } else if (target === "ratroom") {
    wash.addColorStop(0, "#4a2e18");   // dark brown center
    wash.addColorStop(0.55, "#2e1c0e"); // darker brown
    wash.addColorStop(1, "#100a06");   // near-black edge
  } else {
    wash.addColorStop(0, "#f7f4ee");
    wash.addColorStop(1, "#f7f4ee");
  }

  ctx.fillStyle = wash;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // oak gets a soft tree-line silhouette across the lower portion,
  // a lighter echo of the room itself rather than the flat wash alone
  if (target === "oak" && alpha > 0.3) {
    ctx.globalAlpha = alpha * 0.5;
    ctx.fillStyle = "#6a4a28";
    const baseY = canvas.height * 0.72;
    ctx.beginPath();
    ctx.moveTo(0, canvas.height);
    ctx.lineTo(0, baseY);
    for (let tx = 0; tx <= canvas.width; tx += 40) {
      const treeH = 30 + Math.sin(tx * 0.05) * 15 + Math.sin(tx * 0.13) * 8;
      ctx.lineTo(tx, baseY - treeH);
      ctx.lineTo(tx + 20, baseY - treeH * 0.6);
    }
    ctx.lineTo(canvas.width, canvas.height);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = alpha;
  }

  ctx.restore();

  // scene name card, once mostly faded in
  if (alpha > 0.5 && target) {
    const textAlpha = (alpha - 0.5) / 0.5;
    if (target === "ratroom") {
      // its own distinct treatment -- white text, small winking rat
      // face in the corner, a deliberately different feel from the
      // other scene cards since this one's meant to read as a little secret
      ctx.fillStyle = `rgba(255,255,255,${textAlpha})`;
      ctx.font = "20px ui-monospace";
      const prevAlign = ctx.textAlign;
      ctx.textAlign = "center";
      ctx.fillText("Ratroom", canvas.width / 2, canvas.height / 2);
      ctx.textAlign = prevAlign;

      // rat face, matching the actual rat NPC's features -- centered
      // below the text and enlarged, since tucked in the corner at
      // its old size it was too small and out of the way to actually see
      const fx = canvas.width / 2, fy = canvas.height / 2 + 45;
      ctx.globalAlpha = textAlpha;
      ctx.save();
      ctx.translate(fx, fy);
      ctx.scale(1.8, 1.8);
      ctx.fillStyle = "#8a8880";
      ctx.beginPath();
      ctx.ellipse(0, 0, 12, 10, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#7a7268";
      ctx.beginPath();
      ctx.arc(-5, -8, 4, 0, Math.PI * 2);
      ctx.arc(5, -8, 4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#c98a8a";
      ctx.beginPath();
      ctx.arc(-5, -8, 2, 0, Math.PI * 2);
      ctx.arc(5, -8, 2, 0, Math.PI * 2);
      ctx.fill();
      // nose, matching the real rat's pink snout tone -- moved up to
      // y=2, clearly separated from the smirk below (which starts at
      // y=4.2) rather than sitting inside the mouth's own curve
      ctx.fillStyle = "#d89a9a";
      ctx.beginPath();
      ctx.arc(0, 2, 1.8, 0, Math.PI * 2);
      ctx.fill();
      // winking eye -- a genuine squint rather than the flat emoji-arc
      // curve: an asymmetric closed lid with a small crease above it
      // for real dimension, plus a smirk on the snout that wasn't
      // there at all before
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 1.1;
      ctx.lineCap = "round";
      ctx.beginPath();
      ctx.moveTo(-5.4, -0.6);
      ctx.quadraticCurveTo(-4, 0.6, -2.6, -0.4);
      ctx.stroke();
      // open eye, with a tiny highlight for some life
      ctx.fillStyle = "#1a1a1a";
      ctx.beginPath();
      ctx.arc(4, -1, 1.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.7)";
      ctx.beginPath();
      ctx.arc(4.4, -1.4, 0.35, 0, Math.PI * 2);
      ctx.fill();
      // whiskers, same as the real rat -- drawn after the eyes since
      // they sit in front of them on the face
      ctx.strokeStyle = "rgba(230,230,230,0.6)";
      ctx.lineWidth = 0.5;
      [-1.5, 0, 1.5].forEach(dy => {
        ctx.beginPath();
        ctx.moveTo(1, 1 + dy * 0.5);
        ctx.lineTo(9, dy);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(-1, 1 + dy * 0.5);
        ctx.lineTo(-9, dy);
        ctx.stroke();
      });
      // smirk -- genuinely asymmetric this time, corner clearly raised
      // on the winking side (left), not the roughly-symmetric curve
      // from before that peaked at dead center despite the comment
      // claiming otherwise
      ctx.strokeStyle = "#1a1a1a";
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(3.5, 6.2);
      ctx.quadraticCurveTo(-1, 6.8, -4.5, 4.2);
      ctx.stroke();
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }
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
  canopyY: (gy - 120) - 28 // same ring-radius logic as decorative apples (center gy-120, radius 28), straight up

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

function startCollectAnimation(piece, itemType, extra) {
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
    rotation: piece.rotation,
    extra: extra || null
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

          if (f.itemType === "leaf") {
            // leaves fly to the crown-in-progress, not the fixed basket
            f.targetX = player.x + player.width / 2;
            f.targetY = gy - player.height - player.y + 6;
          } else {
            // basket's real on-screen position, converted into the same
            // WORLD-space coordinates f.x/f.y already use (+ camX)
            const rect = document.getElementById("basket").getBoundingClientRect();
            const canvasRect = canvas.getBoundingClientRect();
            f.targetX = camX + (rect.left + rect.width / 2 - canvasRect.left);
            f.targetY = rect.top + rect.height / 2 - canvasRect.top;
          }
        }

      } else if (f.phase === "toBasket") {
        const dur = COLLECT_DURATIONS.toBasket;
        const p = easeOutCubic(Math.min(f.t / dur, 1));

        f.x = f.holdX + (f.targetX - f.holdX) * p;
        f.y = f.holdY + (f.targetY - f.holdY) * p;
        f.scale = 1.6 - p * 1.6; // shrinks down as it settles in

        if (f.t >= dur) {
          if (f.itemType === "leaf" && f.extra) {
            crownLeaves.push({ shape: f.extra.shape, color: f.extra.color });
            if (crownLeaves.length >= CROWN_LEAVES_NEEDED && !crownState.ready) {
              crownState.ready = true;
              crownState.completeSparkleT = 0;
              crownState.completeAnimT = 0;
              crownState.promptAnimT = 0;
            }
          } else {
            addToInventory(f.itemType); // counter updates ONLY on arrival
          }
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

/* ======================================================
   BOOMERANG THROW — spacebar while held, launches in the
   direction you're currently facing. Does a real out-and-back
   arc in open air; if it passes near a valid target (the hive,
   for now), it redirects into a hit instead of continuing past.
   ====================================================== */
const BOOMERANG_OUT_DISTANCE = 250;
const BOOMERANG_OUT_DURATION = 850;     // ms — slower, matches the game's slower pace
const BOOMERANG_RETURN_DURATION = 1000; // ms
const BOOMERANG_HIT_RADIUS = 15; // tightened further — verified honey/vault windows narrow to ~40-60px real zones, not "anywhere"

let boomerangThrow = null; // null when not in flight

function throwBoomerang() {
  boomerangThrow = {
    startX: player.x + player.width / 2,
    startY: player.y + player.height * 0.6,
    x: player.x + player.width / 2,
    y: player.y + player.height * 0.6,
    facing: player.facing,
    phase: "out", // "out" -> "returning"
    t: 0,
    rotation: 0,
    thrownWhileAirborne: player.jumping // general flag — any target can require this, not just one vault
  };
  heldItem = null; // no longer sitting in your hand — it's in the air
}

function updateBoomerangThrow(deltaTime) {
  if (!boomerangThrow) return;
  const b = boomerangThrow;
  b.t += deltaTime * 1000;
  b.rotation += deltaTime * 20; // fast visual spin, purely cosmetic

  if (b.phase === "out") {
    const p = Math.min(b.t / BOOMERANG_OUT_DURATION, 1);
    const eased = 1 - Math.pow(1 - p, 2); // ease-out — fast start, settles at the far point
    b.x = b.startX + b.facing * BOOMERANG_OUT_DISTANCE * eased;
    b.y = b.startY + Math.sin(p * Math.PI) * 90; // real upward arc — has to reach the hive's height

    // hit-checking only counts near the PEAK of the flight (p=0.45-0.55), not
    // anywhere along the whole arc. The peak is also the slowest, most visually
    // readable moment (velocity ~0 there, same as a real arc's high point), so
    // a hit reads as "caught it at the top" rather than a lucky graze anywhere.
    const withinPeakWindow = p >= 0.45 && p <= 0.55;

    // check for a redirect — the hive in autumn, or a vault cloud in clouds
    if (withinPeakWindow && currentScene === "autumn" && !beehive.knocked) {
      const dx = b.x - beehive.x;
      const dy = b.y - beehive.heightAboveGround;
      if (Math.sqrt(dx * dx + dy * dy) < BOOMERANG_HIT_RADIUS) {
        beehive.knocked = true;
        honey.x = beehive.x;
        honey.heightAboveGround = beehive.heightAboveGround; // starts falling from the hive's actual height
        honey.available = true;
        honey.falling = true;

        b.phase = "returning";
        b.t = 0;
        b.returnFromX = b.x;
        b.returnFromY = b.y;
      }
    } else if (withinPeakWindow && currentScene === "spring") {
      ["plum", "pear", "peach"].forEach(type => {
        if (!graftState[type].hybrid) return; // only knockable once grafted
        knockableFruits[type].forEach(fruit => {
          if (fruit.knocked) return;
          const dx = b.x - fruit.x;
          const dy = b.y - fruit.heightAboveGround;
          if (Math.sqrt(dx * dx + dy * dy) < BOOMERANG_HIT_RADIUS) {
            fruit.knocked = true;
            fruit.falling = true;
          }
        });
      });
    } else if (withinPeakWindow && currentScene === "clouds") {
      for (let i = 0; i < vaultClouds.length; i++) {
        const v = vaultClouds[i];
        if (v.phase !== "closed") continue;
        if (v.requiresAirborne && !b.thrownWhileAirborne) continue;
        const dx = b.x - v.x;
        const dy = b.y - v.heightAboveGround;
        if (Math.sqrt(dx * dx + dy * dy) < BOOMERANG_HIT_RADIUS) {
          v.phase = "opening";
          v.phaseT = 0;

          b.phase = "returning";
          b.t = 0;
          b.returnFromX = b.x;
          b.returnFromY = b.y;
          break;
        }
      }

      // the elephant's tail — only hittable once fully built, releases the peanut bonus
      if (b.phase === "out" && elephantSpot.piecesPlaced >= 8 && !peanut.available) {
        const tailPart = ELEPHANT_PARTS[3]; // tail
        const tailX = elephantSpot.cloudX + tailPart.dx;
        const tailHeight = 300 - (elephantSpot.cloudY + tailPart.dy); // screen y -> heightAboveGround
        const tdx = b.x - tailX;
        const tdy = b.y - tailHeight;
        if (Math.sqrt(tdx * tdx + tdy * tdy) < BOOMERANG_HIT_RADIUS + 7) { // slightly more forgiving than the shared radius
          peanut.available = true;
          peanut.falling = true;

          b.phase = "returning";
          b.t = 0;
          b.returnFromX = b.x;
          b.returnFromY = b.y;
        }
      }
    }

    if (b.phase === "out" && p >= 1) {
      b.phase = "returning";
      b.t = 0;
      b.returnFromX = b.x;
      b.returnFromY = b.y;
    }
  } else {
    // returning — curves back to wherever it was originally thrown from
    const p = Math.min(b.t / BOOMERANG_RETURN_DURATION, 1);
    const eased = p * p; // ease-in, accelerating back toward you
    b.x = b.returnFromX + (b.startX - b.returnFromX) * eased;
    b.y = b.returnFromY + (b.startY - b.returnFromY) * eased;

    if (p >= 1) {
      // it was never actually removed from inventory when thrown — just
      // un-held. Restore it as held instead of calling addToInventory(),
      // which would incorrectly count it as a second boomerang.
      heldItem = "boomerang";
      updateInventoryUI();
      boomerangThrow = null;
    }
  }
}

function drawBoomerangThrow(camX) {
  if (!boomerangThrow) return;
  const b = boomerangThrow;
  drawBoomerangShape(ctx, b.x - camX, gy - b.y, 12, b.rotation);
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
  const aboutToMountSeesaw = seesawNPC.onSeesaw && seesawNPC.talkedTo && !seesaw.mounted && !seesaw.launching &&
    Math.abs((player.x + player.width / 2) - (seesaw.x - 90)) < 35;
  if (!camera.topDown && seasonTransition.phase === "idle" && !fallState.active && !swing.mounted && !player.launched && !cloudLanding.active && !rabbitShuttle.mounted && !peanutVine.mounted && !vines.some(v => v.mounted) && !seesaw.mounted) {
    const woozySpeedFactor = playerWoozyT > 0 ? 0.4 : 1;
    if (keys.left) { player.x -= player.speed * woozySpeedFactor; player.facing = -1; }
    if (keys.right) { player.x += player.speed * woozySpeedFactor; player.facing = 1; }

    // CONFIRMED BUG FIX: aboutToMountSeesaw was excluding the entire
    // movement block above (left/right included), not just the jump —
    // meaning a player standing near the mount zone lost ALL movement,
    // effectively locking them in place if they weren't mounting.
    // Now it only guards the jump-trigger specifically, which was the
    // actual thing that needed suppressing.
    if (keys.upJustPressed && !aboutToMountSeesaw) {
      const nearSwing = currentScene === "spring" &&
        isPlayerNear(swing.pivotX, swing.pivotHeightAboveGround - SWING_ROPE_LENGTH, 30, 20, 55);
      const nearVine = currentScene === "spring" && peanutVine.grown && !peanutVine.mounted &&
        isPlayerNear(peanutVine.x, 0, 30, 10, 10);

      if (nearSwing) {
        // jumping onto the swing takes priority over a normal jump here
        swing.mounted = true;
        swing.angularVelocity = 0;
        swing.mountTime = 0;
        swing.peakAngularVelocity = 0;
        swing.displayedCharge = 0;
      } else if (nearVine) {
        // same priority pattern as the swing — mounting takes precedence over a normal jump
        peanutVine.mounted = true;
        peanutVine.playerClimbHeight = 0;
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

  // ratroom's own right boundary -- keeps it feeling like the small
  // enclosed space it's meant to be, rather than technically
  // unbounded. Placed where the hay ground cover's own range actually
  // ends (x=1400), so the wall lines up with something visually
  // justified instead of stopping in the middle of nothing. Easy to
  // push further out later if more gets added to this room.
  if (currentScene === "ratroom" && player.x > 1400) player.x = 1400;

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

  // same idea for the vines — position is fully driven by updateVines()
  if (vines.some(v => v.mounted)) return;

  // while mid-bounce off the seesaw, gravity is handled inside updateSeesaw
  // itself (slower descent than standard) — skip normal gravity here
  if (player.onSeesawBounce) return;

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

    if (hitGoalCloud && seasonTransition.phase === "idle" && !cloudLanding.active && player.cloudLandingImmunity <= 0) {
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

  if (player.vineFlying) {
    player.x += player.vx;
    player.y += player.vy;
    const vineAscending = player.vy > 0;
    player.vy -= vineAscending ? 0.22 : 0.12; // reverted to last known-working value — the further slowdown broke hop reachability across most vine pairs

    // mid-flight: grab the next vine if close enough — this IS the vine-to-vine mechanic.
    // Excludes the vine just released from until the player has actually
    // moved outside its own grab radius — otherwise the very next frame
    // could immediately re-catch the SAME vine you just left, which is
    // what was causing the "snap back to neutral" symptom.
    for (const v2 of vines) {
      if (v2.mounted) continue;
      if (player.vineFlyingSource && v2.tier !== player.vineFlyingSource.tier) continue; // don't snag a different tier's vine just because it's nearby
      const grabX = v2.x + Math.sin(v2.angle) * v2.length;
      const grabH = v2.anchorHeight - Math.cos(v2.angle) * v2.length;
      const dx = (player.x + player.width / 2) - grabX;
      const dy = player.y - grabH;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (v2 === player.vineFlyingSource && dist < VINE_GRAB_RADIUS) continue; // haven't left the source vine's reach yet
      if (dist < VINE_GRAB_RADIUS) {
        player.vineFlying = false;
        v2.mounted = true;
        v2.angle = Math.atan2(dx, v2.length); // pick up the swing roughly where it was grabbed, not reset to zero
        v2.angularVel = 0;
        v2.pumpCooldown = 0;
        v2.swingCycles = 0;

        // collect any acorn tied to this specific vine pair — the hop
        // itself succeeded, so it's collected regardless of the exact
        // arc shape or height at any point during the flight
        const source = player.vineFlyingSource;
        if (source) {
          hopAcorns.forEach(ha => {
            if (ha.collected || ha.collecting) return;
            const matchesForward = ha.vineA.x === source.x && ha.vineA.tier === source.tier && ha.vineB.x === v2.x && ha.vineB.tier === v2.tier;
            const matchesBackward = ha.vineB.x === source.x && ha.vineB.tier === source.tier && ha.vineA.x === v2.x && ha.vineA.tier === v2.tier;
            if (matchesForward || matchesBackward) {
              ha.collecting = true;
              startCollectAnimation({ x: ha.displayX, y: gy - ha.displayHeight, size: 6, rotation: 0 }, "acorn");
            }
          });
        }
        break;
      }
    }

    if (player.y <= 0) {
      player.vineFlying = false; // missed everything — falls to the ground, no penalty
      player.vineFlyingSource = null;
    }
  }

  // gravity -- much slower during the snake's knockback, and even
  // slower during the giant pile's scripted collapse fall, so both
  // moments read as clearly intentional and dramatic rather than
  // happening too fast to actually see
  player.y += player.vy;
  player.vy -= giantPileCollapse.phase === "falling" ? 0.12 : (snakeState.hissing > 0 ? 0.22 : 0.8);

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
  const bubbleWidth = 180;
  const maxTextWidth = bubbleWidth - 34; // padding on both sides
  const lineHeight = 13;

  ctx.font = "10px ui-monospace"; // set before measuring, so wrapping is accurate

  const allLines = [];
  sentences.forEach(sentence => {
    allLines.push(...wrapText(ctx, sentence, maxTextWidth));
  });

  const bubbleHeight = Math.max(40, allLines.length * lineHeight + 20);

  ctx.fillStyle = "rgba(255,255,248,0.95)";
  roundRect(ctx, x - 24, y, bubbleWidth, bubbleHeight, 9);
  ctx.fill();

  ctx.strokeStyle = "#2b2b2b";
  ctx.stroke();

  ctx.fillStyle = "#2b2b2b";
  allLines.forEach((line, i) => {
    ctx.fillText(line, x - 12, y + 18 + i * lineHeight);
  });
}

// sized to fit the actual text, not the fixed 160-wide default — for
// short NPC lines where the standard bubble was wasting half its width
function drawFittedSpeechBubble(ctx, x, y, sentences) {
  const lineHeight = 13;
  ctx.font = "10px ui-monospace";
  const widths = sentences.map(s => ctx.measureText(s).width);
  const bubbleWidth = Math.max(...widths) + 24; // padding on both sides
  const bubbleHeight = Math.max(30, sentences.length * lineHeight + 14);

  ctx.fillStyle = "rgba(255,255,248,0.95)";
  roundRect(ctx, x, y, bubbleWidth, bubbleHeight, 9);
  ctx.fill();
  ctx.strokeStyle = "#2b2b2b";
  ctx.stroke();

  ctx.fillStyle = "#2b2b2b";
  sentences.forEach((line, i) => {
    ctx.fillText(line, x + 12, y + 15 + i * lineHeight);
  });
}

// draw apple trees
// the stump — has always had real collision (the apple's landing target,
// a jumpable platform), but was never actually drawn until now
function drawStump(camX) {
  const sx = stump.x - camX;
  const stumpTop = gy - stump.height;

  // sides
  ctx.fillStyle = "#7a5738";
  ctx.fillRect(sx, stumpTop, stump.width, stump.height);

  // subtle shading down the side
  ctx.fillStyle = "rgba(0,0,0,0.12)";
  ctx.fillRect(sx, stumpTop + 6, stump.width, stump.height - 6);

  // top surface
  ctx.fillStyle = "#c9a06c";
  ctx.beginPath();
  ctx.ellipse(sx + stump.width / 2, stumpTop, stump.width / 2, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // tree rings
  ctx.strokeStyle = "rgba(120,80,40,0.4)";
  ctx.lineWidth = 1.5;
  for (let r = 5; r < stump.width / 2; r += 6) {
    ctx.beginPath();
    ctx.ellipse(sx + stump.width / 2, stumpTop, r, r * (8 / (stump.width / 2)), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

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

/* ======================================================
   BEEHIVE TREE — a standalone new tree with an extra branch
   sticking out and a hive hanging off it. The boomerang's target.
   ====================================================== */
const hiveTree = { x: 1322 };

/* ======================================================
   LEAF TREES + WREATH — two new trees, one shedding rounded
   leaves, one shedding classic maple-shaped leaves. Colors vary
   independently. Side-to-side drift as they fall, proximity-based
   catch (no jump restriction, matches the water drips). Wreath
   builds procedurally from your actual caught leaves — visible
   growing in real time on both the held indicator and the
   inventory chip — then hangs on an old wooden board.
   ====================================================== */
const LEAF_COLORS = ["#e8481f", "#ff9518", "#ffcc18", "#e0722a", "#d4381f"];
const LEAF_FALL_MIN = 6000;
const LEAF_FALL_MAX = 12000;
const LEAF_FALL_SPEED = 35;
const CROWN_LEAVES_NEEDED = 8;
const CROWN_SPARKLE_DURATION = 1200;

const leafTreeTimers = {
  round: LEAF_FALL_MIN + Math.random() * (LEAF_FALL_MAX - LEAF_FALL_MIN),
  maple: LEAF_FALL_MIN + Math.random() * (LEAF_FALL_MAX - LEAF_FALL_MIN)
};

let fallingLeaves = []; // {x, height, shape, color, driftSeed}
let crownLeaves = []; // {shape, color} — the actual leaves you've caught, in order

const crownState = {
  ready: false,   // true once needed leaves collected — crown exists, waiting to be worn
  worn: false,
  completeSparkleT: 9999, // plays once, on reaching the needed count
  completeAnimT: 9999,     // drives the crown assembling into view, not an instant pop
  wearSparkleT: 9999,      // plays each time C is pressed to put it on
  promptAnimT: 9999,       // drives the carved-plank materialize animation — once maxed, stays maxed and the plank just stays visible
  promptEverShown: false   // true once you've worn it for the first time — the prompt never shows again after that, regardless of later toggles
};
const CROWN_COMPLETE_ANIM_DURATION = 1500;

// same pattern as the crown's carved-wood prompt, for the boomerang's
// B-key shortcut -- appears once collected, retires the first time B
// is actually pressed
const boomerangPromptState = {
  promptAnimT: 9999,
  promptEverShown: false
};
const BOOMERANG_PROMPT_LINES = [
  "Curved wood, quick to the hand \u2014",
  "press B, wherever you stand!"
];

function drawLeafShape(ctx, x, y, size, rotation, shape, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.fillStyle = color;
  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.lineWidth = 0.7;

  if (shape === "maple") {
    ctx.beginPath();
    ctx.moveTo(0, -size * 1.1);
    ctx.quadraticCurveTo(size * 0.15, -size * 0.75, size * 0.42, -size * 0.65);
    ctx.quadraticCurveTo(size * 0.55, -size * 0.55, size * 0.75, -size * 0.35);
    ctx.quadraticCurveTo(size * 0.55, -size * 0.22, size * 0.42, -size * 0.05);
    ctx.quadraticCurveTo(size * 0.62, size * 0.05, size * 0.85, size * 0.15);
    ctx.quadraticCurveTo(size * 0.55, size * 0.2, size * 0.35, size * 0.35);
    ctx.quadraticCurveTo(size * 0.2, size * 0.55, 0, size * 0.65);
    ctx.quadraticCurveTo(-size * 0.2, size * 0.55, -size * 0.35, size * 0.35);
    ctx.quadraticCurveTo(-size * 0.55, size * 0.2, -size * 0.85, size * 0.15);
    ctx.quadraticCurveTo(-size * 0.62, size * 0.05, -size * 0.42, -size * 0.05);
    ctx.quadraticCurveTo(-size * 0.55, -size * 0.22, -size * 0.75, -size * 0.35);
    ctx.quadraticCurveTo(-size * 0.55, -size * 0.55, -size * 0.42, -size * 0.65);
    ctx.quadraticCurveTo(-size * 0.15, -size * 0.75, 0, -size * 1.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  } else {
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.quadraticCurveTo(size * 0.8, -size * 0.3, size * 0.5, size * 0.6);
    ctx.quadraticCurveTo(0, size * 0.9, -size * 0.5, size * 0.6);
    ctx.quadraticCurveTo(-size * 0.8, -size * 0.3, 0, -size);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
  }

  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(0, shape === "maple" ? -size * 1.0 : -size * 0.8);
  ctx.lineTo(0, shape === "maple" ? size * 0.5 : size * 0.6);
  ctx.stroke();
  ctx.restore();
}

// prettier layered trees — multiple overlapping canopy clusters instead of
// one flat circle, warm autumn tones pulled from the same palette their
// own leaves use, instead of a mismatched green
// scales an existing leaf tree up around its own base point (ground
// level, at its x position) -- avoids touching drawLeafTree's own
// internal coordinate math, which is long and easy to break
function drawProminentLeafTree(x, camX, shape, scale) {
  const tx = x - camX;
  ctx.save();
  ctx.translate(tx, gy);
  ctx.scale(scale, scale);
  ctx.translate(-tx, -gy);
  drawLeafTree(x, camX, shape);
  ctx.restore();
}

function drawLeafTree(x, camX, shape) {
  const tx = x - camX;
  const baseColor = shape === "maple" ? "#e8481f" : "#ffcc18";
  const shadeColor = shape === "maple" ? "#ff9518" : "#e0722a";

  // wavy organic trunk outline, not a plain rectangle
  ctx.fillStyle = "#6b4026";
  ctx.beginPath();
  ctx.moveTo(tx - 10, gy);
  ctx.quadraticCurveTo(tx - 12, gy - 60, tx - 8, gy - 90);
  ctx.quadraticCurveTo(tx - 10, gy - 115, tx - 6, gy - 130);
  ctx.lineTo(tx + 6, gy - 130);
  ctx.quadraticCurveTo(tx + 10, gy - 115, tx + 8, gy - 90);
  ctx.quadraticCurveTo(tx + 12, gy - 60, tx + 10, gy);
  ctx.closePath();
  ctx.fill();

  // subtle wavy bark texture lines
  ctx.strokeStyle = "rgba(74,44,20,0.4)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tx - 3, gy - 125);
  ctx.quadraticCurveTo(tx - 5, gy - 75, tx - 2, gy - 20);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tx + 4, gy - 100);
  ctx.quadraticCurveTo(tx + 6, gy - 60, tx + 4, gy - 15);
  ctx.stroke();

  // a small knot-hole for character
  ctx.fillStyle = "rgba(50,30,14,0.6)";
  ctx.beginPath();
  const knotX = tx + (pseudoRandom(x * 0.9) - 0.5) * 10;
  const knotY = gy - 40 - pseudoRandom(x * 1.3) * 45;
  ctx.ellipse(knotX, knotY, 3, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // layered canopy clusters — extended lower to genuinely cover the trunk
  // top (was only ~3px overlap, an easily-visible seam)
  const clusters = [
    { dx: -20, dy: -8, r: 26 }, { dx: 18, dy: -12, r: 28 },
    { dx: 0, dy: -30, r: 30 }, { dx: -8, dy: -2, r: 24 }, { dx: 22, dy: 8, r: 20 },
    { dx: 0, dy: 22, r: 26 }, { dx: -14, dy: 16, r: 20 }
  ];
  clusters.forEach((c, i) => {
    ctx.fillStyle = i % 2 === 0 ? baseColor : shadeColor;
    ctx.globalAlpha = 0.88;
    ctx.beginPath();
    ctx.arc(tx + c.dx, gy - 155 + c.dy, c.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.globalAlpha = 1;

  // dense individual leaf accents on the canopy, not sparse/pasted-on
  for (let i = 0; i < 16; i++) {
    const a = pseudoRandom(x * 0.4 + i * 2.1) * Math.PI * 2;
    const r = 18 + pseudoRandom(x * 0.7 + i * 1.3) * 24;
    const accentX = tx + Math.cos(a) * r;
    const accentY = gy - 155 + Math.sin(a) * r * 0.7;
    const isMaple = shape === "maple";
    drawLeafShape(ctx, accentX, accentY, isMaple ? 7 : 5,
      pseudoRandom(x * 1.1 + i) * Math.PI, shape, LEAF_COLORS[i % LEAF_COLORS.length]);
    if (isMaple) {
      ctx.fillStyle = "rgba(255,240,200,0.35)";
      ctx.beginPath();
      ctx.arc(accentX, accentY, 2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

const LEAF_MIN_STAGGER = 2500; // minimum gap enforced between the two trees' falls, prevents coincidental clustering

function updateLeafTrees(deltaTime) {
  ["round", "maple"].forEach(shape => {
    leafTreeTimers[shape] -= deltaTime * 1000;
    if (leafTreeTimers[shape] <= 0) {
      const treeX = shape === "maple" ? 1820 : 1620;
      const color = LEAF_COLORS[Math.floor(Math.random() * LEAF_COLORS.length)];
      fallingLeaves.push({ x: treeX, height: gy - (gy - 155), shape, color, driftSeed: Math.random() * 100 });
      leafTreeTimers[shape] = LEAF_FALL_MIN + Math.random() * (LEAF_FALL_MAX - LEAF_FALL_MIN);

      const otherShape = shape === "maple" ? "round" : "maple";
      if (leafTreeTimers[otherShape] < LEAF_MIN_STAGGER) {
        leafTreeTimers[otherShape] += LEAF_MIN_STAGGER;
      }
    }
  });

  fallingLeaves.forEach(leaf => {
    leaf.height -= LEAF_FALL_SPEED * deltaTime;
  });

  fallingLeaves = fallingLeaves.filter(leaf => {
    if (leaf.height <= 0) return false; // hit the ground, missed
    if (crownState.ready) return true; // crown's done — no use case yet for further leaves, so they just fall past harmlessly

    const driftX = leaf.x + Math.sin(performance.now() * 0.0015 + leaf.driftSeed) * 25;
    const playerCenterX = player.x + player.width / 2;
    const nearX = Math.abs(playerCenterX - driftX) < 30;
    const nearHeight = Math.abs(player.y - leaf.height) < 20;
    if (nearX && nearHeight && keys.space) {
      startCollectAnimation(
        { x: driftX, y: gy - leaf.height, size: leaf.shape === "maple" ? 11 : 8, rotation: 0 },
        "leaf",
        { shape: leaf.shape, color: leaf.color }
      );
      return false;
    }
    return true;
  });
}

function drawFallingLeaves(camX) {
  fallingLeaves.forEach(leaf => {
    const driftX = leaf.x + Math.sin(performance.now() * 0.0015 + leaf.driftSeed) * 25;
    drawLeafShape(ctx, driftX - camX, gy - leaf.height, leaf.shape === "maple" ? 11 : 8, performance.now() * 0.001 + leaf.driftSeed, leaf.shape, leaf.color);
  });
}

// draws the crown procedurally from whatever leaves have actually been
// caught — used both while in-progress and once complete
function drawCrownProcedural(ctx, cx, cy, radius, progressOverride) {
  const shown = progressOverride != null ? Math.round(progressOverride * CROWN_LEAVES_NEEDED) : Math.min(crownLeaves.length, CROWN_LEAVES_NEEDED);
  ctx.strokeStyle = "#5a4020";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(cx, cy, radius * 0.55, 0, Math.PI * 2);
  ctx.stroke();

  for (let i = 0; i < shown; i++) {
    const leaf = crownLeaves[i] || { shape: i % 2 ? "maple" : "round", color: LEAF_COLORS[i % LEAF_COLORS.length] };
    const angle = (i / CROWN_LEAVES_NEEDED) * Math.PI * 2 - Math.PI / 2;
    const lx = cx + Math.cos(angle) * radius * 0.75;
    const ly = cy + Math.sin(angle) * radius * 0.75;
    drawLeafShape(ctx, lx, ly, radius * (leaf.shape === "maple" ? 0.36 : 0.28), angle + Math.PI / 2, leaf.shape, leaf.color);
  }
}

// worn crown — dense, overlapping leaves following the top curve of the
// player's actual shape (a single rounded rectangle, not a separate head)
// reorders leaves for DISPLAY only (catch order in crownLeaves itself is
// untouched) — interleaves both types and maps them center-outward, so
// the front-facing middle of the crown always shows a mix, never one
// type dominating just because of catch-order luck
function getCrownDisplayLeaves() {
  const maples = crownLeaves.filter(l => l.shape === "maple");
  const rounds = crownLeaves.filter(l => l.shape === "round");
  const interleaved = [];
  const pairCount = Math.min(maples.length, rounds.length);
  for (let i = 0; i < pairCount; i++) interleaved.push(maples[i], rounds[i]);
  interleaved.push(...maples.slice(pairCount), ...rounds.slice(pairCount));

  const slots = new Array(CROWN_LEAVES_NEEDED);
  const mid = (CROWN_LEAVES_NEEDED - 1) / 2;
  let li = 0, step = 0;
  while (li < interleaved.length && step <= mid) {
    const leftIdx = Math.floor(mid - step);
    const rightIdx = Math.ceil(mid + step);
    if (li < interleaved.length) slots[leftIdx] = interleaved[li++];
    if (step > 0 && li < interleaved.length) slots[rightIdx] = interleaved[li++];
    step++;
  }
  return slots;
}

function drawCrownOnHead(camX, sinkAmount) {
  const px = player.x - camX + player.width / 2;
  const lowerOffset = 7; // sits closer to the head, more like a resting crown than perched at the peak
  const topY = gy - player.height - player.y + (sinkAmount || 0) + lowerOffset;

  const isFalling = fallState.active;
  const widthScale = isFalling ? 0.85 : 1; // narrower while falling through a hole, so it stays inside the hole's own width — but still close to the player's own body width, not tiny

  ctx.fillStyle = "#7a4a28";
  ctx.beginPath();
  ctx.moveTo(px - player.width * 0.55 * widthScale, topY + 4);
  ctx.quadraticCurveTo(px, topY - 10, px + player.width * 0.55 * widthScale, topY + 4);
  ctx.quadraticCurveTo(px + player.width * 0.44 * widthScale, topY - 2, px, topY - 4);
  ctx.quadraticCurveTo(px - player.width * 0.44 * widthScale, topY - 2, px - player.width * 0.55 * widthScale, topY + 4);
  ctx.closePath();
  ctx.fill();

  const leafCount = CROWN_LEAVES_NEEDED;
  const displayLeaves = getCrownDisplayLeaves();
  for (let i = 0; i < leafCount; i++) {
    const leaf = displayLeaves[i] || { shape: i % 2 ? "maple" : "round", color: LEAF_COLORS[i % LEAF_COLORS.length] };
    const spacingJitter = (pseudoRandom(i * 3.7) - 0.5) * 0.16; // stable per-leaf, not flickering — some overlap, some gaps
    const t = i / leafCount + spacingJitter;
    const lx = px - player.width * 0.5 * widthScale + t * player.width * widthScale;
    const ly = topY - 1 - Math.sin(t * Math.PI) * 1;
    drawLeafShape(ctx, lx, ly, leaf.shape === "maple" ? 6.5 : 5, (t - 0.5) * 1.4, leaf.shape, leaf.color);
  }
  // a couple peeking near the back, suggesting it wraps around — dropped
  // entirely while falling, since these are what stuck out past the hole
  if (!isFalling) {
    drawLeafShape(ctx, px - player.width * 0.5, topY + 2, 5, -1.2, "maple", LEAF_COLORS[1]);
    drawLeafShape(ctx, px + player.width * 0.5, topY + 2, 5, 1.2, "round", LEAF_COLORS[3]);
  }
}

const CROWN_PROMPT_MATERIALIZE_DURATION = 1400;
const CROWN_PROMPT_LINES = [
  "A crown of leaves, freshly grown \u2014",
  "press C, and make it your own!"
];

function updateCrown(deltaTime) {
  if (crownState.completeSparkleT < CROWN_SPARKLE_DURATION) crownState.completeSparkleT += deltaTime * 1000;
  if (crownState.completeAnimT < CROWN_COMPLETE_ANIM_DURATION) crownState.completeAnimT += deltaTime * 1000;
  if (crownState.wearSparkleT < CROWN_SPARKLE_DURATION) crownState.wearSparkleT += deltaTime * 1000;
  if (crownState.ready && !crownState.worn && crownState.promptAnimT < CROWN_PROMPT_MATERIALIZE_DURATION) {
    crownState.promptAnimT += deltaTime * 1000;
  }

  if (crownState.ready && keys.cJustPressed) {
    crownState.worn = !crownState.worn;
    if (crownState.worn) {
      crownState.wearSparkleT = 0;
      crownState.promptEverShown = true; // once worn for the first time, the prompt is retired for good
    }
  }

  updateCrownUI();
}

// world-space: worn crown on the head, and the one-time sparkle/prompt
// moments — everything else (in-progress, ready-unworn) lives in the
// Special UI slot instead, so nothing sits beside the player at all
function drawCrown(camX) {
  if (crownLeaves.length === 0) return;

  const fallProgress = fallState.active ? Math.min(fallState.t / FALL_DURATION, 1) : 0;
  const sinkAmount = fallProgress * (player.height + 20);

  const px = player.x - camX + player.width / 2;
  const py = gy - player.height - player.y + 6 + sinkAmount;

  if (crownState.worn) {
    drawCrownOnHead(camX, sinkAmount);
  } else if (!crownState.ready) {
    // in-progress — visible beside the player so catching a leaf feels
    // like real, immediate progress. Moves to the Special UI slot once
    // complete, so it doesn't linger in the world indefinitely after that.
    drawCrownProcedural(ctx, px + 24, py, 13);
  }

  if (crownState.ready && !crownState.worn && !crownState.promptEverShown) {
    drawCarvedWoodPrompt(px, py - 46);
  }

  if (crownState.completeSparkleT < CROWN_SPARKLE_DURATION) {
    const p = crownState.completeSparkleT / CROWN_SPARKLE_DURATION;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2 + performance.now() * 0.003;
      const r = 20 + Math.sin(performance.now() * 0.005 + i) * 5;
      ctx.fillStyle = `rgba(255,240,180,${(1 - p) * 0.9})`;
      ctx.beginPath();
      ctx.arc(px + Math.cos(a) * r, py + Math.sin(a) * r * 0.7, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (crownState.wearSparkleT < CROWN_SPARKLE_DURATION) {
    const p = crownState.wearSparkleT / CROWN_SPARKLE_DURATION;
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - performance.now() * 0.004;
      const r = 18 + Math.sin(performance.now() * 0.006 + i) * 3;
      ctx.fillStyle = `rgba(255,250,210,${(1 - p) * 0.95})`;
      ctx.beginPath();
      ctx.arc(px + Math.cos(a) * r, py - 10 + Math.sin(a) * r * 0.6, 1.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

// same prompt style as the crown, positioned above the player -- shows
// once the boomerang is collected, retires the first time B is pressed
function drawBoomerangPrompt(camX) {
  if (boomerangPromptState.promptEverShown) return;
  if (!inventory.boomerang || inventory.boomerang <= 0) return;
  const px = player.x - camX + player.width / 2;
  const py = gy - player.height - player.y + 6;
  drawCarvedWoodPrompt(px, py - 46, boomerangPromptState.promptAnimT, BOOMERANG_PROMPT_LINES);
}

// carved-wood-plank prompt — materializes slowly via wood-chip particles
// converging inward, then a wider plank sized to actually fit the text,
// deeper engraved shading. Materializes once, then stays visible the whole time you're ready-but-unworn.
function drawCarvedWoodPrompt(px, py, animT, lines) {
  animT = animT === undefined ? crownState.promptAnimT : animT;
  lines = lines || CROWN_PROMPT_LINES;
  const p = Math.min(animT / CROWN_PROMPT_MATERIALIZE_DURATION, 1);
  const ease = 1 - Math.pow(1 - p, 2);

  if (p < 1) {
    ctx.fillStyle = "rgba(120,84,50,0.85)";
    for (let i = 0; i < 14; i++) {
      const seed = i * 7.3;
      const startX = px + (pseudoRandom(seed) - 0.5) * 160;
      const startY = py + (pseudoRandom(seed + 1) - 0.5) * 70;
      const endX = px + (pseudoRandom(seed + 2) - 0.5) * 200;
      const endY = py + (pseudoRandom(seed + 3) - 0.5) * 30;
      const cx2 = startX + (endX - startX) * ease;
      const cy2 = startY + (endY - startY) * ease;
      ctx.beginPath();
      ctx.arc(cx2, cy2, 1.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  if (p < 0.25) return;

  const plankAlpha = Math.min((p - 0.25) / 0.5, 1);
  ctx.save();
  ctx.globalAlpha = plankAlpha;

  ctx.fillStyle = "#8a6a45";
  ctx.strokeStyle = "#5a4020";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(px - 130, py - 20, 260, 38, 4) : ctx.rect(px - 130, py - 20, 260, 38);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "rgba(90,64,32,0.35)";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(px - 118, py - 12); ctx.lineTo(px + 110, py - 10);
  ctx.moveTo(px - 100, py + 12); ctx.lineTo(px + 122, py + 14);
  ctx.stroke();

  ctx.fillStyle = "rgba(60,42,20,0.4)";
  ctx.beginPath();
  ctx.arc(px - 126, py - 14, 2, 0, Math.PI * 2);
  ctx.arc(px + 128, py + 15, 1.6, 0, Math.PI * 2);
  ctx.fill();

  // single-direction shadow only — a light highlight sandwiched against
  // the shadow was adding noise around the letterforms, not clarity
  ctx.font = "10px sans-serif";
  ctx.textAlign = "center";
  lines.forEach((line, i) => {
    const ly = py - 4 + i * 13;
    ctx.fillStyle = "rgba(30,18,8,0.6)";
    ctx.fillText(line, px + 1, ly + 1);
    ctx.fillStyle = "#2e2010";
    ctx.fillText(line, px, ly);
  });
  ctx.textAlign = "left";

  ctx.restore();
}

/* ======================================================
   SPECIAL UI SLOT — a small dedicated row under the main
   inventory for the crown, so it's always reachable without
   ever cluttering the world next to the player. C is still the
   only control; this is purely a display location.
   ====================================================== */
let crownUIEl = null;
let carryingUIEl = null;
const CARRYING_ITEM_TYPES = new Set(["worm", "feather"]); // carry-to-a-destination items, shown in their own section instead of the regular tool strip

function initCrownUI() {
  if (crownUIEl) return;
  const wrapper = document.createElement("div");
  wrapper.style.marginTop = "6px";
  const label = document.createElement("div");
  label.textContent = "Special";
  label.style.fontSize = "11px";
  label.style.color = "#888";
  label.style.marginBottom = "2px";
  wrapper.appendChild(label);

  crownUIEl = document.createElement("canvas");
  crownUIEl.width = 20;
  crownUIEl.height = 20;
  crownUIEl.style.borderRadius = "4px";
  crownUIEl.style.transition = "border 0.2s";
  wrapper.appendChild(crownUIEl);
  crownUIEl._wrapper = wrapper;

  invEl.insertAdjacentElement("afterend", wrapper);
}

function updateCrownUI() {
  if (crownLeaves.length === 0) return;
  if (!crownUIEl) initCrownUI();

  const iconCtx = crownUIEl.getContext("2d");
  iconCtx.clearRect(0, 0, 20, 20);
  const progress = crownState.ready ? 1 : crownLeaves.length / CROWN_LEAVES_NEEDED;
  drawCrownProcedural(iconCtx, 10, 11, 9, progress);

  if (crownState.worn) {
    crownUIEl.style.border = "2px solid #2b2b2b";
  } else if (crownState.ready) {
    // gentle idle animation so it's not easy to forget about
    const pulse = 0.5 + Math.sin(performance.now() * 0.003) * 0.5;
    crownUIEl.style.border = `2px solid rgba(200,120,30,${0.4 + pulse * 0.6})`;
  } else {
    crownUIEl.style.border = "2px solid transparent";
  }
}

const beehive = {
  x: 1370, // matches the branch's offset from the tree
  heightAboveGround: 170, // raised beyond ground-level throw reach — verified via simulation
  knocked: false
};

const honey = {
  x: 0,
  heightAboveGround: 0,
  available: false, // only true once the hive's been knocked
  collected: false,
  collecting: false,
  falling: false
};

const HONEY_FALL_SPEED = 55; // height units/sec — a bit slower than the cloud pieces' fall

function drawHiveTree(camX) {
  const tx = hiveTree.x - camX;

  // trunk
  ctx.fillStyle = "#6b4026";
  ctx.fillRect(tx - 12, gy - 96, 24, 96);

  ctx.fillStyle = "rgba(120,90,60,0.18)";
  ctx.beginPath();
  ctx.ellipse(tx, gy + 2, 22, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.strokeStyle = "rgba(40,20,10,0.25)";
  ctx.beginPath();
  ctx.moveTo(tx - 6, gy - 20);
  ctx.lineTo(tx - 6, gy - 80);
  ctx.stroke();

  // canopy — same green pulse language as the other trees
  const pulse = 0.08 + Math.sin(performance.now() * 0.0012 + hiveTree.x) * 0.04;
  ctx.fillStyle = `rgba(90,120,70,${0.9 + pulse})`;
  ctx.beginPath();
  ctx.arc(tx, gy - 120, 50, 0, Math.PI * 2);
  ctx.fill();

  // the extra branch, sticking out and reaching up toward the hive's height
  ctx.strokeStyle = "#5a3d20";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.moveTo(tx + 6, gy - 100);
  ctx.lineTo(tx + 45, gy - 160);
  ctx.stroke();

  if (!beehive.knocked) {
    drawHiveShape(tx + 48, gy - beehive.heightAboveGround + 8);
  }
}

function drawHiveShape(hx, hy) {
  ctx.fillStyle = "#d4a24c";
  ctx.strokeStyle = "#8a6220";
  ctx.lineWidth = 1.5;

  const layers = [{ w: 22, h: 8 }, { w: 18, h: 8 }, { w: 14, h: 8 }, { w: 10, h: 7 }];
  let yOff = 0;
  layers.forEach(l => {
    roundRect(ctx, hx - l.w / 2, hy + yOff, l.w, l.h, 3);
    ctx.fill();
    ctx.stroke();
    yOff += l.h - 1;
  });

  // a few bees buzzing around it
  const buzzT = performance.now() * 0.006;
  ctx.fillStyle = "#2b2b2b";
  for (let i = 0; i < 3; i++) {
    const a = buzzT + i * 2.1;
    const bx = hx + Math.cos(a) * 14;
    const by = hy + Math.sin(a) * 6 - 5;
    ctx.beginPath();
    ctx.arc(bx, by, 1.5, 0, Math.PI * 2);
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

function blendHexColors(hexA, hexB, t) {
  const a = [parseInt(hexA.slice(1, 3), 16), parseInt(hexA.slice(3, 5), 16), parseInt(hexA.slice(5, 7), 16)];
  const b = [parseInt(hexB.slice(1, 3), 16), parseInt(hexB.slice(3, 5), 16), parseInt(hexB.slice(5, 7), 16)];
  const r = Math.round(a[0] + (b[0] - a[0]) * t);
  const g = Math.round(a[1] + (b[1] - a[1]) * t);
  const bl = Math.round(a[2] + (b[2] - a[2]) * t);
  return `rgb(${r},${g},${bl})`;
}

function drawFruitTree(x, camX, type) {
  const tx = x - camX;
  const graftedState = graftState[type] && GRAFT_TREE_X[type] === x ? graftState[type] : null;
  const targetHybridName = graftedState ? (graftedState.hybrid || (graftedState.morphing ? graftedState.morphTo : null)) : null;
  const morphAlpha = graftedState && graftedState.morphing ? graftedState.morphT / GRAFT_MORPH_DURATION : (targetHybridName ? 1 : 0);
  let style = FRUIT_STYLES[type];
  if (targetHybridName) {
    style = HYBRID_STYLES[targetHybridName];
  }

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
  const isHybridPattern = !!targetHybridName;
  const fruitCount = 5 + Math.floor(pseudoRandom(x * 0.077 + typeSeed) * 3); // 5-7, same as normal
  const fruitAngleStep = (Math.PI * 2) / fruitCount;
  const fruitJitterMax = fruitAngleStep * 0.25;

  for (let i = 0; i < fruitCount; i++) {
    let angle, radius;
    if (isHybridPattern) {
      // same evenly-spaced base as normal trees, but much looser jitter —
      // distributed all around the canopy, not clumped to one or two sides,
      // while still reading as organically different from a uniform ring
      const looseJitter = (pseudoRandom(x * 0.31 + typeSeed + i * 1.7) - 0.5) * fruitAngleStep * 1.3;
      angle = fruitAngleStep * i + looseJitter;
      radius = 18 + pseudoRandom(x * 0.53 + typeSeed + i * 2.3) * 20;
    } else {
      const jitter = (pseudoRandom(x * 0.31 + typeSeed + i * 1.7) - 0.5) * 2 * fruitJitterMax;
      angle = fruitAngleStep * i + jitter;
      radius = 22 + pseudoRandom(x * 0.53 + typeSeed + i * 2.3) * 14;
    }
    const decoX = tx + Math.cos(angle) * radius;
    const decoY = (gy - 120) + Math.sin(angle) * radius;

    if (isHybridPattern && HYBRID_DRAW_FN[targetHybridName]) {
      if (morphAlpha < 1) {
        // cross-fade: fading original dot underneath the emerging hybrid
        ctx.save();
        ctx.globalAlpha = 1 - morphAlpha;
        ctx.fillStyle = FRUIT_STYLES[type].color;
        ctx.beginPath();
        ctx.arc(decoX, decoY, FRUIT_STYLES[type].size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.save();
      ctx.globalAlpha = morphAlpha;
      HYBRID_DRAW_FN[targetHybridName](ctx, decoX, decoY, style.size);
      ctx.restore();
      continue;
    }

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

function drawCloudLobsterBg(x, y, scale, camX) {
  const cx = x - camX * 0.15;
  ctx.fillStyle = "rgba(255,255,255,0.9)";

  // central oblong body, running through the middle
  ctx.beginPath();
  ctx.ellipse(cx, y, 22 * scale, 9 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  // fanned tail at the back (left) end — several segments spreading out symmetrically
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(cx - 20 * scale, y);
    ctx.lineTo(cx - 34 * scale, y + i * 8 * scale);
    ctx.lineTo(cx - 27 * scale, y + i * 3 * scale);
    ctx.closePath();
    ctx.fill();
  }

  // small paired legs along both sides of the body — perfectly symmetric
  for (let i = 0; i < 3; i++) {
    [-1, 1].forEach(side => {
      ctx.beginPath();
      ctx.ellipse(cx - 8 * scale + i * 8 * scale, y + side * 10 * scale, 5 * scale, 2 * scale, side * 0.3, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // two symmetric claws at the front (right) end, each with a pincer
  [-1, 1].forEach(side => {
    ctx.save();
    ctx.translate(cx + 20 * scale, y + side * 11 * scale);
    ctx.rotate(side * 0.3);
    ctx.beginPath();
    ctx.ellipse(0, 0, 11 * scale, 6 * scale, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(9 * scale, -3 * scale);
    ctx.lineTo(18 * scale, -5 * scale);
    ctx.lineTo(11 * scale, 2 * scale);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });

  // antennae, extending forward between the claws — also symmetric
  ctx.strokeStyle = "rgba(255,255,255,0.7)";
  ctx.lineWidth = 1;
  [-1, 1].forEach(side => {
    ctx.beginPath();
    ctx.moveTo(cx + 22 * scale, y + side * 4 * scale);
    ctx.lineTo(cx + 38 * scale, y + side * 15 * scale);
    ctx.stroke();
  });
}

// dispatcher — picks the right silhouette by type, "puffy" (drawCloud) is the default
function drawBackgroundCloud(x, y, scale, type, camX) {
  if (type === "wisp") drawCloudWisp(x, y, scale, camX);
  else if (type === "stack") drawCloudStack(x, y, scale, camX);
  else if (type === "bunny") drawCloudBunnyBg(x, y, scale, camX);
  else if (type === "whale") drawCloudWhaleBg(x, y, scale, camX);
  else if (type === "alligator") drawCloudAlligatorBg(x, y, scale, camX);
  else if (type === "lobster") drawCloudLobsterBg(x, y, scale, camX);
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
  const hopBounce = rabbit.hopState === "hopping" ? Math.sin(rabbit.hopPhase * Math.PI) * RABBIT_HOP_HEIGHT : 0;
  const ry = gy - rabbit.height + Math.sin(rabbit.bob) * 2 - hopBounce;

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
  ctx.fillStyle = "#4a2c18";
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
  ctx.beginPath();
  ctx.ellipse(archCenterX, gy, 78, 25, 0, 0, Math.PI * 2);
  ctx.fill();

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
// whole apple — round body, stem, small leaf, genuinely distinct from the
// slice's wedge-with-visible-flesh design, not just a recolor
function drawWholeAppleShape(ctx, x, y, size, rotation) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  ctx.fillStyle = "#8b2e2a";
  ctx.strokeStyle = "#6a1f1c";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, size * 0.05, size * 0.75, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "#5a3a1a";
  ctx.lineWidth = size * 0.12;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.68);
  ctx.lineTo(size * 0.08, -size * 0.95);
  ctx.stroke();

  ctx.fillStyle = "#5a8a3e";
  ctx.beginPath();
  ctx.ellipse(size * 0.22, -size * 0.85, size * 0.22, size * 0.12, 0.6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "rgba(255,220,200,0.4)";
  ctx.beginPath();
  ctx.arc(-size * 0.25, -size * 0.15, size * 0.18, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

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

// honey — a small dripping-jar shape
function drawHoneyShape(ctx, x, y, size, rotation) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  ctx.fillStyle = "#e8a838";
  ctx.strokeStyle = "#a86b18";
  ctx.lineWidth = 1.5;

  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.quadraticCurveTo(size * 0.8, -size * 0.3, size * 0.5, size * 0.6);
  ctx.quadraticCurveTo(0, size, -size * 0.5, size * 0.6);
  ctx.quadraticCurveTo(-size * 0.8, -size * 0.3, 0, -size);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.ellipse(-size * 0.2, -size * 0.3, size * 0.15, size * 0.3, -0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// honey pot — the reusable graft tool, fill level visibly drops with each
// of its 6 scoops used, both in-world and in the inventory chip
function drawHoneyPotShape(ctx, x, y, size, fillRatio) {
  ctx.save();
  ctx.translate(x, y);

  const potPath = () => {
    ctx.beginPath();
    ctx.moveTo(-size * 0.35, -size * 0.5);
    ctx.bezierCurveTo(-size * 0.75, -size * 0.4, -size * 0.75, size * 0.6, -size * 0.45, size * 0.85);
    ctx.bezierCurveTo(-size * 0.25, size * 1.0, size * 0.25, size * 1.0, size * 0.45, size * 0.85);
    ctx.bezierCurveTo(size * 0.75, size * 0.6, size * 0.75, -size * 0.4, size * 0.35, -size * 0.5);
    ctx.closePath();
  };

  // rounded classic pot body
  ctx.fillStyle = "#c9915a";
  ctx.strokeStyle = "#8a5f34";
  ctx.lineWidth = 1;
  potPath();
  ctx.fill();
  ctx.stroke();

  // honey level, clipped to the whole pot silhouette, semi-transparent —
  // same technique as the bucket's water, clearly rising and falling
  if (fillRatio > 0) {
    ctx.save();
    potPath();
    ctx.clip();
    const honeyTop = size * 0.85 - size * 1.35 * Math.max(0, fillRatio);
    ctx.fillStyle = "rgba(232,168,56,0.82)";
    ctx.fillRect(-size * 0.8, honeyTop, size * 1.6, size * 1.9);
    ctx.restore();
  }

  // label band
  ctx.fillStyle = "rgba(255,248,235,0.65)";
  ctx.beginPath();
  ctx.ellipse(0, size * 0.15, size * 0.55, size * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();

  // lid
  ctx.fillStyle = "#a86b18";
  ctx.strokeStyle = "#6a4318";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(0, -size * 0.55, size * 0.4, size * 0.12, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // knob on top
  ctx.fillStyle = "#8a5f34";
  ctx.beginPath();
  ctx.arc(0, -size * 0.66, size * 0.09, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// cloud piece — a small, round puff, distinct from the fluffy background clouds
function drawCloudPieceShape(ctx, x, y, size, rotation) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  ctx.fillStyle = "#ffffff";
  ctx.strokeStyle = "rgba(200,215,230,0.6)";
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.arc(0, 0, size, 0, Math.PI * 2);
  ctx.arc(size * 0.55, -size * 0.15, size * 0.65, 0, Math.PI * 2);
  ctx.arc(-size * 0.55, -size * 0.1, size * 0.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

// peanut — the classic figure-8 shell silhouette
function drawPeanutShape(ctx, x, y, size, rotation) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  ctx.fillStyle = "#d4a86a";
  ctx.strokeStyle = "#a87c40";
  ctx.lineWidth = 1.2;

  ctx.beginPath();
  ctx.ellipse(-size * 0.45, 0, size * 0.55, size * 0.4, -0.2, 0, Math.PI * 2);
  ctx.ellipse(size * 0.45, 0, size * 0.55, size * 0.4, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // shell texture lines
  ctx.strokeStyle = "rgba(140,100,50,0.4)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-size * 0.7, -size * 0.15);
  ctx.lineTo(size * 0.7, size * 0.15);
  ctx.stroke();

  ctx.restore();
}

// shovel — simple diagonal handle + a rounded blade
function drawShovelShape(ctx, x, y, size, rotation) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  // handle shaft
  ctx.strokeStyle = "#8a6a3e";
  ctx.lineWidth = size * 0.22;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-size * 0.75, -size * 0.85);
  ctx.lineTo(size * 0.2, size * 0.3);
  ctx.stroke();

  // D-handle grip at the top
  ctx.strokeStyle = "#6a4e2a";
  ctx.lineWidth = size * 0.16;
  ctx.beginPath();
  ctx.arc(-size * 0.85, -size * 0.95, size * 0.22, 0.3, Math.PI * 1.5);
  ctx.stroke();

  // foot-ridge, where you'd step to drive it into the ground
  ctx.strokeStyle = "#5a5a5a";
  ctx.lineWidth = size * 0.14;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(size * 0.02, size * 0.18);
  ctx.lineTo(size * 0.24, size * 0.1);
  ctx.stroke();

  // tapered spade blade, pointed at the tip instead of a rounded blob
  ctx.fillStyle = "#9a9a9a";
  ctx.strokeStyle = "#6a6a6a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(size * 0.05, size * 0.2);
  ctx.lineTo(size * 0.62, size * 0.32);
  ctx.quadraticCurveTo(size * 0.78, size * 0.6, size * 0.5, size * 1.0);
  ctx.quadraticCurveTo(size * 0.4, size * 1.12, size * 0.3, size * 1.0);
  ctx.quadraticCurveTo(size * 0.16, size * 0.68, size * 0.05, size * 0.2);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.restore();
}

// gold pile — a small stack of overlapping coins, with a soft glow and
// shine accents like the crystal, matching the "treasure find" language
function drawGoldPileShape(ctx, x, y, size, rotation) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  const pulse = Math.sin(performance.now() * 0.004) * 0.5 + 0.5;

  // soft glow
  ctx.fillStyle = `rgba(255,215,120,${0.2 + pulse * 0.2})`;
  ctx.beginPath();
  ctx.arc(0, 0, size * 1.5, 0, Math.PI * 2);
  ctx.fill();

  // stacked square gold pieces, not round coins
  const squarePositions = [
    { dx: -size * 0.4, dy: size * 0.3, s: size * 0.5, rot: -0.15 },
    { dx: size * 0.25, dy: size * 0.35, s: size * 0.48, rot: 0.2 },
    { dx: -size * 0.05, dy: 0, s: size * 0.55, rot: 0.05 },
    { dx: size * 0.15, dy: -size * 0.3, s: size * 0.45, rot: -0.1 }
  ];
  squarePositions.forEach(sq => {
    ctx.save();
    ctx.translate(sq.dx, sq.dy);
    ctx.rotate(sq.rot);
    ctx.fillStyle = "#e8c44a";
    ctx.strokeStyle = "#b8912a";
    ctx.lineWidth = 1;
    ctx.fillRect(-sq.s / 2, -sq.s / 2, sq.s, sq.s);
    ctx.strokeRect(-sq.s / 2, -sq.s / 2, sq.s, sq.s);
    ctx.restore();
  });

  // shine accents
  ctx.fillStyle = `rgba(255,250,220,${0.7 + pulse * 0.3})`;
  ctx.beginPath();
  ctx.arc(size * 0.1, -size * 0.3, 1.3, 0, Math.PI * 2);
  ctx.arc(-size * 0.3, size * 0.2, 1, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

// dispatcher: draws the right shape for any collectible by itemType
function drawCollectible(ctx, x, y, size, rotation, itemType) {
  if (itemType === "boomerang") {
    drawBoomerangShape(ctx, x, y, size, rotation);
  } else if (itemType === "roundLeaf" || itemType === "mapleLeaf") {
    drawLeafShape(ctx, x, y, size, rotation, itemType === "mapleLeaf" ? "maple" : "round", itemType === "mapleLeaf" ? "#e8481f" : "#e0722a");
  } else if (HYBRID_DRAW_FN[itemType]) {
    HYBRID_DRAW_FN[itemType](ctx, x, y, size);
  } else if (itemType === "worm") {
    drawWormShape(ctx, x, y, size, rotation);
  } else if (itemType === "lamp") {
    drawLampShape(ctx, x, y, size, rotation, false);
  } else if (itemType === "feather") {
    drawFeatherShape(ctx, x, y, size, rotation);
  } else if (itemType === "acorn") {
    drawAcornShape(ctx, x, y, size, rotation);
  } else if (itemType === "pumpkin") {
    drawPumpkinShape(ctx, x, y, size, rotation);
  } else if (itemType === "apple") {
    drawWholeAppleShape(ctx, x, y, size, rotation);
  } else if (itemType === "shovel") {
    drawShovelShape(ctx, x, y, size, rotation);
  } else if (itemType === "plumStick" || itemType === "pearStick" || itemType === "peachStick") {
    const treeType = itemType.replace("Stick", "");
    drawStickShape(ctx, x, y, size * 1.3, rotation + 0.5, sticks[treeType].color);
  } else if (itemType === "goldPile") {
    drawGoldPileShape(ctx, x, y, size, rotation);
  } else if (itemType === "cloudPiece") {
    drawCloudPieceShape(ctx, x, y, size, rotation);
  } else if (itemType === "peanut") {
    drawPeanutShape(ctx, x, y, size, rotation);
  } else if (itemType === "tulip") {
    drawTulipShape(ctx, x, y, size, rotation);
  } else if (itemType === "crystal") {
    drawCrystalShape(ctx, x, y, size, rotation);
  } else if (itemType === "bucket") {
    drawBucketShape(ctx, x, y, size, rotation);
  } else if (itemType === "honey") {
    drawHoneyShape(ctx, x, y, size, rotation);
  } else if (itemType === "marble") {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.fillStyle = "#c85a8a";
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.arc(-size * 0.15, -size * 0.15, size * 0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  } else if (itemType === "paperAirplane") {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);
    ctx.fillStyle = "#f0e8d8";
    ctx.beginPath();
    ctx.moveTo(size * 0.9, 0);
    ctx.lineTo(-size * 0.7, -size * 0.5);
    ctx.lineTo(-size * 0.3, 0);
    ctx.lineTo(-size * 0.7, size * 0.5);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.lineWidth = 0.6;
    ctx.stroke();
    ctx.strokeStyle = "rgba(0,0,0,0.2)";
    ctx.beginPath();
    ctx.moveTo(size * 0.9, 0);
    ctx.lineTo(-size * 0.3, 0);
    ctx.stroke();
    ctx.restore();
  } else {
    drawApplePieceShape(ctx, x, y, size, rotation);
  }
}

/* ======================================================
   DRAW
   ====================================================== */
function drawCrows(camX) {
ctx.strokeStyle = "#3b2f28";
ctx.lineWidth = 1;
ctx.fillStyle = "#3b2f28";
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

  // tip-led flap — the tip moves first, the mid-wing trails behind with a
  // phase lag, so the motion propagates outward-in instead of the whole
  // wing rotating as one rigid unit
  const tipFlap = Math.sin(c.phase) * 5;
  const midFlap = Math.sin(c.phase - 0.5) * 3;
  const cx = c.x - camX;

  ctx.beginPath();
  ctx.ellipse(cx + 8, c.y, 3, 1.6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(cx + 8, c.y);
  ctx.lineTo(cx + 4, c.y + midFlap);
  ctx.lineTo(cx, c.y + tipFlap);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(cx + 8, c.y);
  ctx.lineTo(cx + 12, c.y + midFlap);
  ctx.lineTo(cx + 16, c.y + tipFlap);
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
for (let i = 0; i < 10; i++) {
  const tx = (i * 200) - (cameraX * 0.2);
  if (i % 3 === 1) {
    ctx.fillStyle = "rgba(200,90,50,0.22)";
    ctx.beginPath();
    ctx.arc(tx - 20, gy - 148, 60, 0, Math.PI * 2);
    ctx.arc(tx + 22, gy - 140, 65, 0, Math.PI * 2);
    ctx.arc(tx, gy - 168, 58, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = "rgba(70,85,70,0.25)";
    ctx.beginPath();
    ctx.arc(tx, gy - 140, 110, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* DISTANT TREES */
for (let i = 0; i < 9; i++) {
  const tx = i * 220 - (cameraX * 0.3) + Math.sin(i * 2.1) * 60;
  const radius = 70 + Math.sin(i * 1.3) * 18;
  const ty = gy - 120 + Math.sin(i * 0.9) * 10;

  if (i % 3 === 2) {
    ctx.fillStyle = "rgba(230,150,30,0.3)";
    ctx.beginPath();
    ctx.arc(tx - radius * 0.3, ty + 6, radius * 0.72, 0, Math.PI * 2);
    ctx.arc(tx + radius * 0.32, ty, radius * 0.78, 0, Math.PI * 2);
    ctx.arc(tx, ty - radius * 0.4, radius * 0.68, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = "rgba(70,85,55,0.35)";
    ctx.beginPath();
    ctx.arc(tx, ty, radius, 0, Math.PI * 2);
    ctx.fill();
  }
}

/* MID ORCHARD TREES */
for (let i = 0; i < 6; i++) {
  const tx = (i * 320) - (cameraX * 0.45);
  if (i % 3 === 0) {
    ctx.fillStyle = "rgba(220,110,30,0.4)";
    ctx.beginPath();
    ctx.arc(tx + 40, gy - 118, 55, 0, Math.PI * 2);
    ctx.arc(tx + 100, gy - 122, 52, 0, Math.PI * 2);
    ctx.arc(tx + 70, gy - 158, 58, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.fillStyle = "rgba(85,110,70,0.45)";
    ctx.beginPath();
    ctx.arc(tx + 40, gy - 110, 70, 0, Math.PI * 2);
    ctx.arc(tx + 100, gy - 115, 65, 0, Math.PI * 2);
    ctx.arc(tx + 70, gy - 150, 75, 0, Math.PI * 2);
    ctx.fill();
  }
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
drawTallOak(camX);
drawVines(camX);
drawHayBales(camX);
drawAcorns(camX);
drawHopAcorns(camX);
drawVinePumpkin(camX);
drawWormRock(camX);
drawSeesaw(camX);
drawSeesawNPC(camX);
drawWoodpecker(camX);
drawSeesawProjectile(camX);
drawAppleTree(tree.x, camX); // the actual source tree — apple spawns/falls from here, was previously empty ground
drawStump(camX); // drawn AFTER the tree so it renders in front, not covered by it

// boomerang drawn BEFORE the tree it sticks out of, so the canopy renders
// on top and partially occludes it — sitting IN the tree, not floating
if (!boomerang.collected && !boomerang.collecting) {
  const bx2 = boomerang.x - camX;
  const by2 = gy - boomerang.heightAboveGround;
  drawBoomerangShape(ctx, bx2, by2, 10, 0);
}
drawAppleTree(980, camX);
drawHiveTree(camX);
drawLeafTree(1620, camX, "round");
drawLeafTree(1820, camX, "maple");
drawFallingLeaves(camX);
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

// apple shine — matches the simple round highlight dot used on every
// decorative apple in the trees, instead of a mismatched ellipse shape
{
  ctx.fillStyle = "rgba(255,220,200,0.4)";
  ctx.beginPath();
  ctx.arc(appleScreenX - 2, appleScreenY - apple.r * 0.5, 2, 0, Math.PI * 2);
  ctx.fill();
}

// apple split in 3, pieces bounce
const bounceY = apple.bounce * 0.6;

  // DRAW APPLE PIECES
  applePieces.forEach(p => {
    if (p.collected || p.collecting) return;
    drawApplePieceShape(ctx, p.x - camX, p.y, p.size, p.rotation);
  });

  // (boomerang now drawn earlier, before the tree it sticks out of)

  // DRAW HONEY (once the hive's been knocked, until collected)
  if (honey.available && !honey.collected && !honey.collecting) {
    drawHoneyShape(ctx, honey.x - camX, gy - honey.heightAboveGround, 10, 0);
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

  // welcome dialogue -- whimsical, not formal, gently foreshadows the
  // boomerang the player is about to find just past the frog without
  // naming it outright
  drawSpeechBubble(ctx, fx, bubbleY, [
    "Welcome to the autumn lands — not quite what they seem.",
    "What you cast away may return, like the tail of a dream."
  ]);
}

drawCrow(camX);
drawTreeCrow(camX);
drawCarvingStation(camX);
if (hayBales.toppled) {
  drawProminentLeafTree(4210, camX, "maple", 1.35);
  drawProminentLeafTree(5010, camX, "round", 1.3);
}
drawDecorativeHayPiles(camX);
drawSmallCrows(camX);
drawBat(camX);
drawDecorativeSquashField(camX);



}

/* ======================================================
   SPRING DECORATION
   ====================================================== */
const GRASS_SHADES = ["rgba(84,142,66,0.55)", "rgba(122,178,92,0.5)", "rgba(58,104,48,0.55)"];
const FLOWER_COLORS = ["#e0793f", "#8a5fae", "#4a90c4"];
const FOREST_BORROWED_FLOWER_COLOR = "#5a7846"; // deep mossy green, doesn't belong to spring's own palette -- mixed in near the forest door

// Grass and flowers are generated procedurally from camX each frame,
// rather than a fixed-size array — so they extend infinitely as you walk
// right instead of running out at some fixed world width. pseudoRandom(x)
// keeps each position's look stable frame to frame even though nothing is
// stored.
function drawSpringGrass(camX) {
  const step = 14;
  const startX = Math.floor((camX - 40) / step) * step;
  const endX = camX + canvas.width + 40;
  const forestDoorX = connections[1].doors.spring.x;
  const STRANGE_RADIUS = 320;

  for (let x = startX; x < endX; x += step) {
    const proximity = Math.max(0, 1 - Math.abs(x - forestDoorX) / STRANGE_RADIUS);
    const shade = Math.floor(pseudoRandom(x * 0.71 + 3) * GRASS_SHADES.length);
    const h = (4 + pseudoRandom(x * 0.37 + 7) * 7) * (1 + proximity * 1.6); // noticeably taller near the door
    const y = gy + 2 + pseudoRandom(x * 0.19 + 11) * 14;

    ctx.lineWidth = 1.5 + proximity * 0.8;
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
  const forestDoorX = connections[1].doors.spring.x;
  const STRANGE_RADIUS = 320; // how far out the door's influence gradually spreads

  for (let x = startX; x < endX; x += step) {
    const proximity = Math.max(0, 1 - Math.abs(x - forestDoorX) / STRANGE_RADIUS); // 0 = normal spring, 1 = right at the door

    // denser near the door -- fewer slots skipped, so it reads as
    // genuinely more filled in, not just stranger-shaped
    if (pseudoRandom(x * 0.05 + 3) < 0.45 - proximity * 0.35) continue;

    const y = gy + 4 + pseudoRandom(x * 0.23 + 9) * 10;
    const isOddColor = proximity > 0.3 && pseudoRandom(x * 0.71 + 11) < proximity * 0.6;
    const colorIdx = Math.floor(pseudoRandom(x * 0.61 + 5) * FLOWER_COLORS.length);
    const petalCount = 3 + Math.floor(pseudoRandom(x * 0.83 + 2) * (3 + proximity * 3)); // shaggier -- more petals possible near the door
    const shape = pseudoRandom(x * 0.97 + 6) < 0.5 ? "teardrop" : "heart";
    const baseRotation = pseudoRandom(x * 0.44 + 8) * Math.PI * 2;
    const rotationLooseness = proximity * 0.5; // petals sit less evenly spaced the closer to the door
    const sizeBoost = 1 + proximity * 0.7; // noticeably bigger near the door, not just shaggier
    const petalLength = (4 + pseudoRandom(x * 0.29 + 4) * (2.5 + proximity * 2)) * sizeBoost;
    const petalWidth = (1.6 + pseudoRandom(x * 0.13 + 10) * 1.1) * sizeBoost;

    ctx.save();
    ctx.translate(x - camX, y);
    ctx.fillStyle = isOddColor ? FOREST_BORROWED_FLOWER_COLOR : FLOWER_COLORS[colorIdx];

    for (let i = 0; i < petalCount; i++) {
      const jitter = (pseudoRandom(x * 1.3 + i * 7.1) - 0.5) * rotationLooseness;
      const angle = baseRotation + (Math.PI * 2 * i) / petalCount + jitter;
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
  { x: 330, type: "plum" },
  { x: 550, type: "pear" },  // future-interactive slot
  { x: 950, type: "peach" },
  { x: 1975, type: "plum" }  // the swing's tree, past the tulip
];

/* ======================================================
   GRAFT STICKS — one per fruit tree, reusable once collected
   (never consumed — the 6 honey scoops are what limits total
   graft attempts, not the sticks themselves). Visibly cracking
   while attached, requires a jump to reach, consistent across
   all three.
   ====================================================== */
const STICK_HEIGHT_ABOVE_GROUND = 65;

const sticks = {
  plum: { x: 330, collected: false, color: "#5a3a5e", cracking: false, crackT: 0 },
  pear: { x: 550, collected: false, color: "#7a9a4a", cracking: false, crackT: 0 },
  peach: { x: 950, collected: false, color: "#c98a4a", cracking: false, crackT: 0 }
};
const STICK_CRACK_DURATION = 700; // ms — a real delay before it actually detaches
const STICK_BURST_DURATION = 500; // ms — wood-bit particles fly off and fade

function drawStickShape(ctx, x, y, size, rotation, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.strokeStyle = color || "#7a5a3a";
  ctx.lineWidth = size * 0.22;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-size * 0.6, -size * 0.3);
  ctx.lineTo(size * 0.5, size * 0.4);
  ctx.stroke();
  ctx.lineWidth = size * 0.12;
  ctx.beginPath();
  ctx.moveTo(-size * 0.1, 0);
  ctx.lineTo(size * 0.15, -size * 0.25);
  ctx.stroke();
  ctx.restore();
}

function drawTreeSticks(camX) {
  Object.entries(sticks).forEach(([treeType, stick]) => {
    const sx = stick.x - camX;
    const sy = gy - STICK_HEIGHT_ABOVE_GROUND;

    if (stick.collected) {
      // visible broken stub — a real stump of branch, not an abstract
      // crack line, in a bright freshly-broken-wood color that stands
      // out against the darker bark instead of blending into it
      ctx.fillStyle = "#e8d4a8";
      ctx.strokeStyle = "#c9a860";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(sx - 5, sy + 4);
      ctx.lineTo(sx + 2, sy + 1);
      ctx.lineTo(sx + 3, sy - 4);
      ctx.lineTo(sx - 4, sy - 6);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // jagged snap-line detail across the stub's broken face
      ctx.strokeStyle = "#a8863c";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(sx - 3, sy);
      ctx.lineTo(sx, sy - 2);
      ctx.lineTo(sx - 1, sy - 4);
      ctx.stroke();

      // wood-bit particles, only while the burst is still playing
      if (stick.crackT < STICK_BURST_DURATION) {
        const p = stick.crackT / STICK_BURST_DURATION;
        for (let i = 0; i < 6; i++) {
          const angle = (i / 6) * Math.PI * 2;
          const dist = p * 16;
          ctx.fillStyle = `rgba(120,90,60,${1 - p})`;
          ctx.fillRect(sx + Math.cos(angle) * dist - 1, sy - p * 10 + Math.sin(angle) * dist * 0.4 - 1, 2, 2);
        }
      }
      return;
    }

    const shake = stick.cracking ? Math.sin(stick.crackT * 0.05) * (stick.crackT / STICK_CRACK_DURATION) * 2 : 0;

    ctx.strokeStyle = "#4a3020";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(sx - 4 + shake, sy + 3);
    ctx.lineTo(sx + 1 + shake, sy - 2);
    ctx.lineTo(sx - 2 + shake, sy - 6);
    ctx.stroke();

    drawStickShape(ctx, sx + shake, sy, 16, 0.5, stick.color);
  });
}

function updateTreeSticks(deltaTime) {
  Object.entries(sticks).forEach(([treeType, stick]) => {
    if (stick.collected) {
      if (stick.crackT < STICK_BURST_DURATION) stick.crackT += deltaTime * 1000;
      return;
    }

    if (stick.cracking) {
      stick.crackT += deltaTime * 1000;
      if (stick.crackT >= STICK_CRACK_DURATION) {
        stick.collected = true;
        stick.crackT = 0; // reused as the burst-particle timer now
        inventory[treeType + "Stick"] = 2; // grants 2 automatically per collection, not just 1
        touchInventoryOrder(treeType + "Stick");
        updateInventoryUI();
      }
      return;
    }

    if (player.jumping && pressedDownNear(stick.x, STICK_HEIGHT_ABOVE_GROUND, 26, 20, 20)) {
      stick.cracking = true;
      stick.crackT = 0;
    }
  });
}

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
const SWING_PUMP_BOOST = 0.024;      // base boost — actual effect is weighted by current momentum, see updateSwing
const SWING_PUMP_MIN_MULT = 0.08;    // pump effectiveness at zero momentum (very weak start — genuinely has to build)
const SWING_PUMP_MULT_RANGE = 2.0;   // grows up to (MIN_MULT + this) at max momentum — compounds much faster once swinging
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
  peakAngularVelocity: 0,  // best speed reached this session, used as a release fallback
  displayedCharge: 0,      // the bar's VISUAL value — deliberately lags the real momentum via
                            // smoothing, so it keeps visibly climbing toward ~4s even after
                            // real momentum has already plateaued (which it reliably does, physically)
  settleBounceT: 9999,     // drives a purely cosmetic wobble when the amplitude clamp is hit — never affects real angle/velocity
  lastClampedHigh: false,
  lastClampedLow: false
};

const SWING_SETTLE_BOUNCE_DURATION = 350;

/* ======================================================
   TALL OAK TRUNK — real physical presence towering over the
   vine section, extending well above the canopy line. The
   vines hang from its actual branches, and the seesaw launches
   into this same tree (the oak scene reached via that launch).
   ====================================================== */
const TALL_OAK_X = 2400;
const TALL_OAK_TOP = 300;

function drawTallOak(camX) {
  const tx = TALL_OAK_X - camX;

  ctx.fillStyle = "#3a2412";
  ctx.beginPath();
  ctx.moveTo(tx - 30, gy);
  ctx.quadraticCurveTo(tx - 26, gy - 120, tx - 16, gy - 220);
  ctx.quadraticCurveTo(tx - 10, gy - 270, tx - 7, gy - TALL_OAK_TOP);
  ctx.lineTo(tx + 7, gy - TALL_OAK_TOP);
  ctx.quadraticCurveTo(tx + 10, gy - 270, tx + 16, gy - 220);
  ctx.quadraticCurveTo(tx + 26, gy - 120, tx + 30, gy);
  ctx.closePath();
  ctx.fill();

  // a visible hollow high up — foreshadows the owl's room, reasonable to
  // notice now, without knowing yet what it actually is
  ctx.fillStyle = "rgba(20,12,6,0.85)";
  ctx.beginPath();
  ctx.ellipse(tx - 3, gy - 240, 6, 9, 0.1, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(60,36,16,0.5)";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.strokeStyle = "rgba(20,12,6,0.4)";
  ctx.lineWidth = 1;
  [-16, -5, 7, 18].forEach(off => {
    ctx.beginPath();
    ctx.moveTo(tx + off, gy - 20);
    ctx.quadraticCurveTo(tx + off * 0.8, gy - 130, tx + off * 0.4, gy - 260);
    ctx.stroke();
  });

  // long, curving branches — reach out well beyond the trunk so multiple
  // vines can hang at the SAME height along one branch, not one short
  // straight line per vine
  ctx.strokeStyle = "#3a2412";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  // ground tier branch — one long curve spanning both ground-tier vines
  ctx.beginPath();
  ctx.moveTo(tx, gy - 190);
  ctx.quadraticCurveTo(tx - 100, gy - 205, tx - 100, gy - 200);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tx, gy - 190);
  ctx.quadraticCurveTo(tx + 100, gy - 205, tx + 100, gy - 200);
  ctx.stroke();
  // mid tier branch
  ctx.beginPath();
  ctx.moveTo(tx, gy - 260);
  ctx.quadraticCurveTo(tx - 100, gy - 275, tx - 100, gy - 280);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tx, gy - 260);
  ctx.quadraticCurveTo(tx + 100, gy - 275, tx + 100, gy - 280);
  ctx.stroke();
  // upper tier branch — left side unchanged (tight, close vines)
  ctx.beginPath();
  ctx.moveTo(tx, gy - TALL_OAK_TOP + 15);
  ctx.quadraticCurveTo(tx - 40, gy - 258, tx - 40, gy - 260);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tx, gy - TALL_OAK_TOP + 15);
  ctx.quadraticCurveTo(tx + 30, gy - 258, tx + 30, gy - 260);
  ctx.stroke();

  // right side — extended significantly further, genuine wavy twists and
  // turns (multiple alternating curve segments, not one smooth arc) to
  // reach the two new vines further out on the branch
  ctx.beginPath();
  ctx.moveTo(tx + 30, gy - 260);
  ctx.quadraticCurveTo(tx + 70, gy - 245, tx + 100, gy - 262);
  ctx.quadraticCurveTo(tx + 118, gy - 275, tx + 130, gy - 265);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(tx + 130, gy - 265);
  ctx.quadraticCurveTo(tx + 165, gy - 250, tx + 190, gy - 260);
  ctx.quadraticCurveTo(tx + 200, gy - 266, tx + 210, gy - 258);
  ctx.stroke();

  ctx.fillStyle = "rgba(190,110,40,0.9)";
  const cy0 = gy - TALL_OAK_TOP;
  ctx.beginPath();
  ctx.moveTo(tx - 180, cy0 + 13);
  ctx.quadraticCurveTo(tx - 195, cy0 - 52, tx - 115, cy0 - 78);
  ctx.quadraticCurveTo(tx - 78, cy0 - 124, tx - 13, cy0 - 117);
  ctx.quadraticCurveTo(tx + 40, cy0 - 130, tx + 90, cy0 - 98);
  ctx.quadraticCurveTo(tx + 170, cy0 - 78, tx + 175, cy0 - 7);
  ctx.quadraticCurveTo(tx + 190, cy0 + 45, tx + 115, cy0 + 58);
  ctx.quadraticCurveTo(tx + 52, cy0 + 78, tx - 26, cy0 + 58);
  ctx.quadraticCurveTo(tx - 104, cy0 + 72, tx - 155, cy0 + 45);
  ctx.quadraticCurveTo(tx - 188, cy0 + 33, tx - 180, cy0 + 13);
  ctx.closePath();
  ctx.fill();
}

/* ======================================================
   BITTERSWEET VINES — autumn-flavored swing-from-vine-to-vine
   stretch between the crown trees and the seesaw. Genuinely
   new movement (grab-and-swing), not a reskin of the rope
   swing. Idle sway at rest. A pumpkin and a few acorns to
   grab along the way — pure "that felt good," no payoff for
   the acorns, the pumpkin feeds into carving later.
   ====================================================== */
const vines = [
  // two small trees' vines — an isolated, self-contained teaching moment
  // for the whole hop mechanic, positioned clear of the bigger oak
  // complex. Both reachable via a genuine double-jump straight from the
  // ground (grab height 110, matching the same established pattern as
  // the ground-tier vine and the bump apple), no platform dependency.
  { x: 1950, anchorHeight: 200, length: 90, angle: 0, angularVel: 0, mounted: false, tier: "standalone" },
  { x: 2065, anchorHeight: 200, length: 90, angle: 0, angularVel: 0, mounted: false, tier: "standalone" },

  // ground tier — grab point 110, genuinely requires double-jump (110 < 140.6 double-jump max,
  // and 110-15(tolerance) still exceeds the 90 single-jump max)
  { x: 2300, anchorHeight: 200, length: 90, angle: 0, angularVel: 0, mounted: false, tier: "ground" },
  { x: 2410, anchorHeight: 200, length: 90, angle: 0, angularVel: 0, mounted: false, tier: "ground" },

  // mid tier — grab point 190, same Y, matches the platforms directly beneath them
  { x: 2300, anchorHeight: 280, length: 90, angle: 0, angularVel: 0, mounted: false, tier: "mid" },
  { x: 2410, anchorHeight: 280, length: 90, angle: 0, angularVel: 0, mounted: false, tier: "mid" },

  // upper tier — vine-to-vine ONLY, no platform or ground access. Same Y,
  // tightly clustered — re-verified against the slowed swing's real
  // reach (~25-35 units at realistic release), not the old faster values
  { x: 2360, anchorHeight: 260, length: 65, angle: 0, angularVel: 0, mounted: false, tier: "upper" },
  { x: 2430, anchorHeight: 260, length: 65, angle: 0, angularVel: 0, mounted: false, tier: "upper" },
  { x: 2520, anchorHeight: 265, length: 65, angle: 0, angularVel: 0, mounted: false, tier: "upper" },
  { x: 2610, anchorHeight: 258, length: 65, angle: 0, angularVel: 0, mounted: false, tier: "upper" }
];
const VINE_GRAVITY = 0.01; // reverted to last known-working value — the further slowdown broke hop reachability
const VINE_SWING_INPUT = 0.025;
const VINE_PUMP_COOLDOWN = 120; // ms between pumps
const VINE_HOP_MIN_CYCLES = 2; // real back-and-forth swings needed before a hop is even available
const VINE_HOP_STRONG_ANGLE = 0.8; // out of max 1.1 — how strong the swing needs to be at commit for a FULL-distance hop
const VINE_HOP_ARC_FRAMES = 40; // standardized hop arc duration

// finds the nearest OTHER vine reasonably near this one's height, in
// either direction — the hop's actual target, not a fixed physics result
function findVineHopTarget(v) {
  let best = null, bestDist = Infinity;
  vines.forEach(v2 => {
    if (v2 === v || v2.mounted) return;
    if (v2.tier !== v.tier) return; // same tier only — a nearby different tier is NOT a valid hop target
    const dist = Math.abs(v2.x - v.x);
    if (dist < 260 && dist < bestDist) { // generous — the hop is self-scaling to whatever distance is configured anyway
      best = v2;
      bestDist = dist;
    }
  });
  return best;
}
const VINE_GRAB_RADIUS = 50; // widened further — the oscillating near-miss pattern in testing showed even moderate strength swings could narrowly miss with the old radius

// hop-tied acorns — collected the instant a successful vine-to-vine hop
// connects the two referenced vines, regardless of the exact arc shape
// or height at any given moment. Display position is purely cosmetic
// (drawn at the visual midpoint), not used for collision anymore — this
// was the actual fix for the narrow-window bug: different successful
// swing strengths produce different arc heights at the same x, so
// checking spatial proximity during flight could never reliably cover
// every valid hop. Tying it to the hop event itself sidesteps that
// entirely: any successful hop between these two vines collects it.
const hopAcorns = [
  { vineA: { x: 1950, tier: "standalone" }, vineB: { x: 2065, tier: "standalone" }, displayX: 2008, displayHeight: 190, collected: false, collecting: false },
  { vineA: { x: 2300, tier: "ground" }, vineB: { x: 2410, tier: "ground" }, displayX: 2355, displayHeight: 180, collected: false, collecting: false },
  { vineA: { x: 2300, tier: "mid" }, vineB: { x: 2410, tier: "mid" }, displayX: 2355, displayHeight: 265, collected: false, collecting: false },
  { vineA: { x: 2360, tier: "upper" }, vineB: { x: 2430, tier: "upper" }, displayX: 2395, displayHeight: 170, collected: false, collecting: false },
  { vineA: { x: 2430, tier: "upper" }, vineB: { x: 2520, tier: "upper" }, displayX: 2475, displayHeight: 255, collected: false, collecting: false },
  { vineA: { x: 2520, tier: "upper" }, vineB: { x: 2610, tier: "upper" }, displayX: 2565, displayHeight: 260, collected: false, collecting: false }
];

const acorns = [
  { x: 2180, heightAboveGround: 220, collected: false, collecting: false } // double-jump straight up from platform 5 (h:90), verified 130-unit gap -- unrelated to vines, keeps the original spatial-proximity collection
];

const vinePumpkin = { x: 2641, heightAboveGround: 232, collected: false, collecting: false }; // genuinely requires the vine now — previous position (h:102) was comfortably within double-jump range (140.6), reachable by simply walking up and jumping, never checked against that. This one is safely beyond it (232), verified with a real generous margin: moderate-strong swing closest approach 0.4, weak swing closest approach 26.2

// hay bales -- right of the spring door (x=3400), visible early as a
// standing pile that blocks passage entirely. Once the player has
// visited both oak and the ratden, the next time they're actually
// looking at the bales (not off-screen), they topple over into a
// climbable platform leading up toward the pumpkin carving area.
const hayBales = {
  x: 3480,
  toppled: false,
  waiting: false, // the beat before toppling actually begins, giving the player a moment to register what's about to happen
  waitT: 0,
  toppling: false,
  toppleT: 0
};
const HAY_BALE_ROWS = 10; // tall stack, two columns wide -- reads as genuinely imposing, "all the way up"
const HAY_BALE_ROW_HEIGHT = 22;
const HAY_BALE_STANDING_HEIGHT = HAY_BALE_ROWS * HAY_BALE_ROW_HEIGHT;
const HAY_BALE_TOPPLED_HEIGHT = 32;  // low, climbable platform once fallen
const HAY_BALE_WAIT_MS = 2200; // the pause before the topple actually starts
const HAY_BALE_TOPPLE_MS = 1300; // faster fall -- the waiting beat beforehand already gives time to register what's about to happen

function updateHayBales(deltaTime) {
  if (hayBales.toppled) return;
  if (hayBales.toppling) {
    hayBales.toppleT += deltaTime * 1000;
    if (hayBales.toppleT >= HAY_BALE_TOPPLE_MS) {
      hayBales.toppling = false;
      hayBales.toppled = true;
    }
    return;
  }
  if (hayBales.waiting) {
    hayBales.waitT += deltaTime * 1000;
    if (hayBales.waitT >= HAY_BALE_WAIT_MS) {
      hayBales.waiting = false;
      hayBales.toppling = true;
      hayBales.toppleT = 0;
    }
    return;
  }
  if (!discoveredScenes.oak || !discoveredScenes.ratroom) return;
  // only trigger while the bales are actually visible on screen --
  // this event needs to be witnessed, not happen off-camera
  const screenX = hayBales.x - cameraX;
  if (screenX < -40 || screenX > canvas.width + 40) return;
  hayBales.waiting = true;
  hayBales.waitT = 0;
}

// crow -- sly, mischievous, waits past the toppled hay bales at the
// pumpkin carving area. Not interactable until the bales have
// actually toppled, since the area isn't reachable before then.
const crow = {
  x: 4050,
  y: HAY_BALE_TOPPLED_HEIGHT,
  width: 52,
  height: 40,
  bob: 0,
  bobSpeed: 0.035,
  active: false,
  tip: 0,
  facing: -1, // -1 = default/left, 1 = flipped to face right, toward the carving station
  offeredPumpkin: false // true once the player has offered the pumpkin and heard the second line
};
let crowTalked = false;

// pumpkin carving UI -- keyboard only, matching the book reader's own
// interaction language (left/right to browse, space to confirm/
// advance). Eyes are chosen together first (mirrored live preview),
// then the right eye can be edited independently before moving on to
// the mouth, so someone who wants a normal symmetric face never has
// to make the same choice twice, but mismatched eyes are just as easy.
const CARVING_EYE_COUNT = 8;
const CARVING_MOUTH_COUNT = 8;
const CARVING_OPEN_CLOSE_MS = 500;

const carvingUI = {
  active: false,
  opening: false,
  openT: 0,
  closing: false,
  closeT: 0,
  step: "eyes", // "eyes" -> "eyeRight" -> "mouth" -> "finalize"
  cursorIndex: 0,
  transitionT: 999, // time since cursorIndex last changed -- starts high so nothing animates before the first change
  eyeLeft: 0,
  eyeRight: 0,
  mouth: 0
};

function startCarvingUI() {
  carvingUI.opening = true;
  carvingUI.openT = 0;
  carvingUI.step = "eyes";
  carvingUI.cursorIndex = 0;
  carvingUI.eyeLeft = 0;
  carvingUI.eyeRight = 0;
  carvingUI.mouth = 0;
}

// the finalized design -- what the compositing render (piece 4) reads
// from, and what the in-world carving animation (piece 5) will
// eventually act on
const carvedPumpkinDesign = { eyeLeft: 0, eyeRight: 0, mouth: 0, ready: false };

function finalizeCarvedPumpkin() {
  carvedPumpkinDesign.eyeLeft = carvingUI.eyeLeft;
  carvedPumpkinDesign.eyeRight = carvingUI.eyeRight;
  carvedPumpkinDesign.mouth = carvingUI.mouth;
  carvedPumpkinDesign.ready = true;
  carvingUI.active = false;
  carvingUI.closing = true;
  carvingUI.closeT = 0;
  // shifts the player left of the station so they can actually see
  // the pumpkin being carved, rather than standing right in front of
  // it -- stays within the station's own platform range
  player.x = carvingStation.x - 102 - player.width / 2;
  player.y = 0; // ground level, not the station's own platform
  startCarvingStation();
}

// carving station -- physically near the crow, where the finalized
// design actually gets carved in-world. Blank pumpkin appears first,
// then eyes reveal with a sparkle flash, then the mouth, ending in a
// finished pumpkin the player can pick up.
const carvingStation = {
  x: 4655, // pulled back in from the overly-wide layout, middle ground
  platformHeight: 26,
  pumpkinPlaced: false,
  placingT: 0,
  active: false,
  phase: "carving", // "carving" -> "done"
  carveT: 0,
  pickedUp: false
};
const CARVING_PLACE_SPARKLE_MS = 900;
const CARVING_STATION_DURATION_MS = 2600;
const CARVING_EYES_REVEAL_AT = 0.42; // fraction of the duration when eyes appear
const CARVING_MOUTH_REVEAL_AT = 0.75; // fraction of the duration when mouth appears

function startCarvingStation() {
  carvingStation.active = true;
  carvingStation.phase = "beat1";
  carvingStation.carveT = 0;
  carvingStation.pickedUp = false;
}

const CARVING_BEAT1_MS = 700;
const CARVING_CARVE_MS = 5500;
const CARVING_BEAT2_MS = 600;
const CARVING_SPARKLE_MS = 800;
const CARVING_GROW_MS = 2400;

function updateCarvingStation(deltaTime) {
  if (carvingStation.pumpkinPlaced && !carvingStation.active) {
    carvingStation.placingT += deltaTime * 1000;
    if (carvingStation.placingT >= CARVING_PLACE_SPARKLE_MS) {
      startCarvingUI();
    }
    return;
  }
  if (!carvingStation.active) return;
  const dtMs = deltaTime * 1000;
  carvingStation.carveT += dtMs;

  if (carvingStation.phase === "beat1" && carvingStation.carveT >= CARVING_BEAT1_MS) {
    carvingStation.phase = "carving";
    carvingStation.carveT = 0;
  } else if (carvingStation.phase === "carving" && carvingStation.carveT >= CARVING_CARVE_MS) {
    carvingStation.phase = "beat2";
    carvingStation.carveT = 0;
  } else if (carvingStation.phase === "beat2" && carvingStation.carveT >= CARVING_BEAT2_MS) {
    carvingStation.phase = "sparkle";
    carvingStation.carveT = 0;
  } else if (carvingStation.phase === "sparkle" && carvingStation.carveT >= CARVING_SPARKLE_MS) {
    carvingStation.phase = "growing";
    carvingStation.carveT = 0;
  } else if (carvingStation.phase === "growing" && carvingStation.carveT >= CARVING_GROW_MS) {
    carvingStation.phase = "done";
    carvingStation.carveT = CARVING_GROW_MS;
  }
}

// -- compositing render: 7 eye shapes, 7 mouth shapes, each drawn as
// a carved cutout at position (x,y) scaled by s. Shared between the
// live UI preview and the eventual in-world finished pumpkin, so the
// two always match exactly.
function drawPumpkinEye(idx, x, y, s, fillColor) {
  fillColor = fillColor || "#2a1608";
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = fillColor;
  ctx.strokeStyle = fillColor;
  if (idx === 0) { // round
    ctx.beginPath();
    ctx.arc(0, 0, s * 0.5, 0, Math.PI * 2);
    ctx.fill();
  } else if (idx === 1) { // classic triangle
    ctx.beginPath();
    ctx.moveTo(0, -s * 0.55);
    ctx.lineTo(s * 0.5, s * 0.4);
    ctx.lineTo(-s * 0.5, s * 0.4);
    ctx.closePath();
    ctx.fill();
  } else if (idx === 2) { // wink -- a thick curved squint, not a cutout shape
    ctx.lineWidth = s * 0.22;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, 0);
    ctx.quadraticCurveTo(0, s * 0.35, s * 0.5, 0);
    ctx.stroke();
  } else if (idx === 3) { // star
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? s * 0.55 : s * 0.24;
      const a = (Math.PI / 5) * i - Math.PI / 2;
      const px = Math.cos(a) * r, py = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  } else if (idx === 4) { // diamond
    ctx.save();
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-s * 0.35, -s * 0.35, s * 0.7, s * 0.7);
    ctx.restore();
  } else if (idx === 5) { // angry slant
    ctx.beginPath();
    ctx.moveTo(-s * 0.5, -s * 0.3);
    ctx.lineTo(s * 0.5, s * 0.1);
    ctx.lineTo(s * 0.3, s * 0.4);
    ctx.lineTo(-s * 0.5, s * 0.15);
    ctx.closePath();
    ctx.fill();
  } else if (idx === 6) { // wide surprised oval
    ctx.beginPath();
    ctx.ellipse(0, 0, s * 0.55, s * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
  } else { // hexagon
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i - Math.PI / 2;
      const px = Math.cos(a) * s * 0.5, py = Math.sin(a) * s * 0.5;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawPumpkinMouth(idx, x, y, s, fillColor) {
  fillColor = fillColor || "#2a1608";
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = fillColor;
  ctx.strokeStyle = fillColor;
  if (idx === 0) { // simple grin
    ctx.lineWidth = s * 0.16;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-s * 0.7, s * 0.1);
    ctx.quadraticCurveTo(0, s * 0.55, s * 0.7, s * 0.1);
    ctx.stroke();
  } else if (idx === 1) { // jagged teeth
    ctx.beginPath();
    ctx.moveTo(-s * 0.7, 0);
    for (let i = 0; i < 6; i++) {
      const px = -s * 0.7 + (s * 1.4 / 6) * (i + 1);
      const py = i % 2 === 0 ? s * 0.4 : -s * 0.05;
      ctx.lineTo(px, py);
    }
    ctx.lineTo(s * 0.7, -s * 0.2);
    ctx.lineTo(-s * 0.7, -s * 0.2);
    ctx.closePath();
    ctx.fill();
  } else if (idx === 2) { // round o
    ctx.beginPath();
    ctx.ellipse(0, s * 0.15, s * 0.32, s * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (idx === 3) { // frown
    ctx.lineWidth = s * 0.16;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-s * 0.6, s * 0.35);
    ctx.quadraticCurveTo(0, -s * 0.05, s * 0.6, s * 0.35);
    ctx.stroke();
  } else if (idx === 4) { // wide grin with teeth gaps
    ctx.fillRect(-s * 0.75, -s * 0.05, s * 1.5, s * 0.4);
    ctx.fillStyle = "#c9863a"; // punches tooth gaps back to the pumpkin's own color
    for (let i = 1; i < 5; i++) {
      ctx.fillRect(-s * 0.75 + (s * 1.5 / 5) * i - s * 0.03, -s * 0.05, s * 0.06, s * 0.4);
    }
  } else if (idx === 5) { // smirk -- asymmetric, one corner raised
    ctx.lineWidth = s * 0.16;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-s * 0.55, s * 0.3);
    ctx.quadraticCurveTo(0, s * 0.15, s * 0.6, -s * 0.15);
    ctx.stroke();
  } else if (idx === 6) { // straight slit
    ctx.fillRect(-s * 0.6, -s * 0.06, s * 1.2, s * 0.12);
  } else { // wide open happy mouth -- a big genuine laugh, corners
    // curling up into a smile rather than a flat oval
    ctx.beginPath();
    ctx.moveTo(-s * 0.65, s * 0.05);
    ctx.quadraticCurveTo(-s * 0.55, -s * 0.28, 0, -s * 0.3);
    ctx.quadraticCurveTo(s * 0.55, -s * 0.28, s * 0.65, s * 0.05);
    ctx.quadraticCurveTo(s * 0.5, s * 0.42, 0, s * 0.48);
    ctx.quadraticCurveTo(-s * 0.5, s * 0.42, -s * 0.65, s * 0.05);
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();
}

function drawPumpkinFace(cx, cy, size, eyeLeftIdx, eyeRightIdx, mouthIdx, eyeLeftReveal, eyeRightReveal, mouthReveal, glowColor) {
  if (eyeLeftReveal === undefined) eyeLeftReveal = 1;
  if (eyeRightReveal === undefined) eyeRightReveal = 1;
  if (mouthReveal === undefined) mouthReveal = 1;

  // pumpkin body -- round, warm orange, ribbed like a real pumpkin
  const bodyRx = size * 0.55, bodyRy = size * 0.5;
  ctx.fillStyle = "#c9863a";
  ctx.beginPath();
  ctx.ellipse(cx, cy, bodyRx, bodyRy, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(120,60,20,0.4)";
  ctx.lineWidth = 2;
  // each rib follows the ellipse's actual contour -- computed from
  // the real ellipse equation at every point along its height, so it
  // narrows in step with the pumpkin's own silhouette instead of
  // poking straight through it near the top and bottom
  const vInset = 0.94; // stops just short of the very pole, where a rib would go vertical
  for (let i = -2; i <= 2; i++) {
    const lateral = i / 2.6; // how far toward the side this particular rib sits, as a fraction
    ctx.beginPath();
    for (let s = 0; s <= 12; s++) {
      const t = (s / 12) * 2 - 1; // -1 (top) to 1 (bottom)
      const y = cy + t * bodyRy * vInset;
      const localHalfWidth = bodyRx * Math.sqrt(Math.max(0, 1 - t * t * vInset * vInset));
      const x = cx + lateral * localHalfWidth * 0.92; // stays inside the actual edge, not riding right on it
      if (s === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
  // stem
  ctx.fillStyle = "#5a7a3a";
  ctx.fillRect(cx - size * 0.06, cy - size * 0.62, size * 0.12, size * 0.16);

  // each feature clips to a rectangle that grows left-to-right as its
  // own reveal progresses, so the shape looks like it's genuinely
  // being cut into existence by the knife's sweep rather than
  // appearing all at once the instant the cut window ends
  function drawRevealed(reveal, drawFn) {
    if (reveal >= 1) { drawFn(); return; }
    if (reveal <= 0) return;
    ctx.save();
    ctx.beginPath();
    const clipW = size * 0.7 * reveal;
    ctx.rect(cx - size * 0.55, cy - size * 0.5, clipW, size);
    ctx.clip();
    drawFn();
    ctx.restore();
  }

  if (eyeLeftIdx !== null) drawRevealed(eyeLeftReveal, () => drawPumpkinEye(eyeLeftIdx, cx - size * 0.2, cy - size * 0.12, size * 0.26, glowColor));
  if (eyeRightIdx !== null) drawRevealed(eyeRightReveal, () => drawPumpkinEye(eyeRightIdx, cx + size * 0.2, cy - size * 0.12, size * 0.26, glowColor));
  if (mouthIdx !== null) drawRevealed(mouthReveal, () => drawPumpkinMouth(mouthIdx, cx, cy + size * 0.18, size * 0.3, glowColor));
}

function updateCarvingUI(deltaTime) {
  const dtMs = deltaTime * 1000;
  carvingUI.transitionT += dtMs;

  if (carvingUI.opening) {
    carvingUI.openT += dtMs;
    if (carvingUI.openT >= CARVING_OPEN_CLOSE_MS) {
      carvingUI.opening = false;
      carvingUI.active = true;
    }
    return;
  }

  if (carvingUI.closing) {
    carvingUI.closeT += dtMs;
    if (carvingUI.closeT >= CARVING_OPEN_CLOSE_MS) {
      carvingUI.closing = false;
    }
    return;
  }

  if (!carvingUI.active) return;

  const count = carvingUI.step === "mouth" ? CARVING_MOUTH_COUNT : CARVING_EYE_COUNT;

  if (keys.rightJustPressed) {
    carvingUI.cursorIndex = (carvingUI.cursorIndex + 1) % count;
    carvingUI.transitionT = 0;
  } else if (keys.leftJustPressed) {
    carvingUI.cursorIndex = (carvingUI.cursorIndex - 1 + count) % count;
    carvingUI.transitionT = 0;
  } else if (keys.upJustPressed) {
    // go back a step, restoring the cursor to whatever was previously
    // chosen for that step rather than resetting to the first option
    if (carvingUI.step === "eyeRight") {
      carvingUI.step = "eyes";
      carvingUI.cursorIndex = carvingUI.eyeLeft;
    } else if (carvingUI.step === "mouth") {
      carvingUI.step = "eyeRight";
      carvingUI.cursorIndex = carvingUI.eyeRight;
    } else if (carvingUI.step === "finalize") {
      carvingUI.step = "mouth";
      carvingUI.cursorIndex = carvingUI.mouth;
    }
  } else if (keys.spaceJustPressed) {
    if (carvingUI.step === "eyes") {
      carvingUI.eyeLeft = carvingUI.cursorIndex;
      carvingUI.eyeRight = carvingUI.cursorIndex; // mirrored by default
      carvingUI.step = "eyeRight";
      carvingUI.cursorIndex = carvingUI.eyeRight;
    } else if (carvingUI.step === "eyeRight") {
      carvingUI.eyeRight = carvingUI.cursorIndex;
      carvingUI.step = "mouth";
      carvingUI.cursorIndex = carvingUI.mouth;
    } else if (carvingUI.step === "mouth") {
      carvingUI.mouth = carvingUI.cursorIndex;
      carvingUI.step = "finalize";
    } else if (carvingUI.step === "finalize") {
      finalizeCarvedPumpkin();
    }
  }
}


// tree-sighting crow -- a smaller, wordless glimpse of the same crow,
// perched in the maple tree's canopy. Flies off if the player gets
// close, no dialogue, no interaction -- just a "wait, was that a
// bird?" moment that plants the crow's presence before the real
// meeting at the carving area later.
const treeCrow = {
  x: 1820,
  y: 175, // perched in the maple's upper canopy
  width: 26,
  height: 20,
  bob: 0,
  bobSpeed: 0.03,
  fleeing: false,
  fleeT: 0
};
const TREE_CROW_FLEE_RADIUS = 95;
const TREE_CROW_FLEE_MS = 1400;

function updateTreeCrow(deltaTime) {
  if (currentScene !== "autumn") return;
  updateNPCIdle(treeCrow);
  if (!treeCrow.fleeing) {
    const dist = Math.abs((player.x + player.width / 2) - (treeCrow.x + treeCrow.width / 2));
    if (dist < TREE_CROW_FLEE_RADIUS) {
      treeCrow.fleeing = true;
      treeCrow.fleeT = 0;
    }
  } else {
    treeCrow.fleeT += deltaTime * 1000;
  }
}

function updateVines(deltaTime) {
  // idle sway for everything not mounted
  vines.forEach((v, i) => {
    if (!v.mounted) {
      v.angle = Math.sin(performance.now() * 0.0012 + i * 1.7) * 0.12;
      v.angularVel = 0;
    }
  });

  // mount — find the SINGLE closest in-range vine, not "every vine within
  // radius." Previously each vine checked independently, so overlapping
  // grab-zones (closely spaced vines) could mount more than one at once,
  // which is what caused them to visibly fight over the player's position.
  if (keys.up && !vines.some(v => v.mounted)) {
    let closest = null, closestDist = Infinity;
    vines.forEach(v => {
      const grabHeight = v.anchorHeight - v.length;
      const dx = (player.x + player.width / 2) - v.x;
      const dy = player.y - grabHeight;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < VINE_GRAB_RADIUS && dist < closestDist) {
        closest = v;
        closestDist = dist;
      }
    });
    if (closest) {
      closest.mounted = true;
      closest.angle = 0;
      closest.angularVel = 0;
      closest.pumpCooldown = 0;
      closest.swingCycles = 0;
      closest.lastSign = 0;
    }
  }

  vines.forEach((v, i) => {
    if (!v.mounted) return;

    if (v.pumpCooldown > 0) v.pumpCooldown -= deltaTime * 1000;

    if (keys.upJustPressed) {
      // pure momentum release — no rhythm gate, no target requirement.
      // Real arc driven by your actual angular velocity right now. A weak
      // swing naturally produces a short arc and falls short of any
      // neighboring vine (or just lands on the ground/a platform); a
      // strong swing naturally reaches far enough to get auto-caught.
      const tangentSpeed = v.angularVel * v.length;
      const releaseVx = Math.cos(v.angle) * tangentSpeed;
      const releaseVy = Math.sin(v.angle) * tangentSpeed + 2;
      v.mounted = false;
      player.vineFlyingSource = v;
      player.vx = releaseVx;
      player.vy = releaseVy;
      player.vineFlying = true;
      player.jumping = true;
      return;
    }

    // edge-triggered pump, matching the swing's gentle-pump pattern — was
    // previously continuous (keys.left/right held) with no cooldown,
    // meaning every single held frame added force, causing the wild
    // erratic swinging instead of a real gentle pendulum feel
    if (v.pumpCooldown <= 0) {
      if (keys.leftJustPressed) {
        v.angularVel -= VINE_SWING_INPUT;
        v.pumpCooldown = VINE_PUMP_COOLDOWN;
      } else if (keys.rightJustPressed) {
        v.angularVel += VINE_SWING_INPUT;
        v.pumpCooldown = VINE_PUMP_COOLDOWN;
      }
    }
    v.angularVel += -Math.sin(v.angle) * VINE_GRAVITY;
    v.angularVel *= 0.995; // slight damping
    v.angle += v.angularVel;
    v.angle = Math.max(-1.1, Math.min(1.1, v.angle));

    const vx = v.x + Math.sin(v.angle) * v.length;
    const vh = v.anchorHeight - Math.cos(v.angle) * v.length;
    player.x = vx - player.width / 2;
    player.y = vh;

    if (keys.down) {
      // safe dismount — no launch, just step off and let normal gravity take over
      v.mounted = false;
      player.vx = 0;
      player.vy = 0;
    }
  });
}

function drawSmallTree(tx, canopyScreenY) {
  ctx.fillStyle = "#4a2e18";
  ctx.beginPath();
  ctx.moveTo(tx - 12, gy);
  ctx.quadraticCurveTo(tx - 10, gy - 100, tx - 6, gy - 180);
  ctx.lineTo(tx + 6, gy - 180);
  ctx.quadraticCurveTo(tx + 10, gy - 100, tx + 12, gy);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "rgba(200,120,45,0.9)";
  ctx.beginPath();
  ctx.arc(tx, gy - 205, 45, 0, Math.PI * 2);
  ctx.arc(tx - 25, gy - 190, 32, 0, Math.PI * 2);
  ctx.arc(tx + 25, gy - 195, 34, 0, Math.PI * 2);
  ctx.fill();
}

const HAY_BALE_STRAW_COLOR = "#c9a24a", HAY_BALE_STRAW_DARK = "#a8802f", HAY_BALE_STRAW_LINE = "rgba(90,64,18,0.4)", HAY_BALE_STRAW_WISP = "#d4af5a";

function drawHayBaleShape(cx, cy, w, h, rot, seed) {
  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate(rot);
  // individual straw strands sticking out from the edges -- drawn
  // first so the rectangle body sits on top of their base, only the
  // tips poke out visibly
  ctx.strokeStyle = HAY_BALE_STRAW_WISP;
  ctx.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    const hash = Math.sin(seed + i * 12.9898) * 43758.5453 % 1; // seeded, not random -- stays consistent frame to frame
    const edge = i % 4; // 0=top, 1=bottom, 2=left, 3=right
    let sx, sy, ex, ey;
    const along = (hash + 1) * 0.5 * (edge < 2 ? w : h) - (edge < 2 ? w / 2 : h / 2);
    const len = 5 + Math.abs(hash) * 5;
    const spread = hash * 0.7;
    if (edge === 0) { sx = along; sy = -h / 2; ex = along + spread * len; ey = -h / 2 - len; }
    else if (edge === 1) { sx = along; sy = h / 2; ex = along + spread * len; ey = h / 2 + len; }
    else if (edge === 2) { sx = -w / 2; sy = along; ex = -w / 2 - len; ey = along + spread * len; }
    else { sx = w / 2; sy = along; ex = w / 2 + len; ey = along + spread * len; }
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(ex, ey);
    ctx.stroke();
  }
  // the bale body itself -- a rectangle with slightly rounded
  // corners, not a plain round shape
  ctx.fillStyle = HAY_BALE_STRAW_COLOR;
  const r = 3;
  ctx.beginPath();
  ctx.moveTo(-w / 2 + r, -h / 2);
  ctx.lineTo(w / 2 - r, -h / 2);
  ctx.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
  ctx.lineTo(w / 2, h / 2 - r);
  ctx.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
  ctx.lineTo(-w / 2 + r, h / 2);
  ctx.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
  ctx.lineTo(-w / 2, -h / 2 + r);
  ctx.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = HAY_BALE_STRAW_DARK;
  ctx.lineWidth = 2;
  ctx.stroke();
  // binding lines, twine wrapped around the bale
  ctx.strokeStyle = HAY_BALE_STRAW_LINE;
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(-w * 0.28, -h / 2);
  ctx.lineTo(-w * 0.28, h / 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(w * 0.28, -h / 2);
  ctx.lineTo(w * 0.28, h / 2);
  ctx.stroke();
  ctx.restore();
}

// shared scatter generator -- both drawHayBales and the per-bale
// collision system call this, so what's visually drawn and what's
// actually climbable always match exactly, never drift apart
function getHayBaleToppledPositions() {
  const positions = [];
  for (let i = 0; i < 20; i++) {
    const hashX = Math.sin(i * 12.9898) * 43758.5453 % 1;
    const hashY = Math.sin(i * 78.233 + 1) * 12345.6789 % 1;
    const hashRot = Math.sin(i * 39.346 + 2) * 6543.21 % 1;
    positions.push({
      dx: 90 + hashX * 140,
      dy: -4 - Math.abs(hashY) * 50,
      rot: Math.PI / 2 + hashRot * 2.2
    });
  }
  return positions;
}

function drawHayBales(camX) {
  const hx = hayBales.x - camX;
  const baseY = gy;
  const drawBale = drawHayBaleShape;

  // standing layout -- 2 columns x 10 rows, generated programmatically
  // rather than hardcoded, since 20 individual bale positions would be
  // unwieldy to hand-write
  const standingPositions = [];
  for (let row = 0; row < HAY_BALE_ROWS; row++) {
    for (let col = 0; col < 2; col++) {
      standingPositions.push({
        dx: col === 0 ? -9 : 9,
        dy: -11 - row * HAY_BALE_ROW_HEIGHT
      });
    }
  }
  // toppled layout -- a genuinely messy scatter, same seeded-hash
  // approach used for the giant book pile's own collapse, rather than
  // an organized grid. Now each bale is individually jumpable
  // matching its own actual height, not one flat zone across the pile
  const toppledPositions = getHayBaleToppledPositions();

  if (hayBales.toppled) {
    toppledPositions.forEach((p, i) => {
      drawBale(hx + p.dx, baseY + p.dy, 26, 30, p.rot, i + 1);
    });
  } else if (hayBales.toppling) {
    // mid-topple -- each bale falls independently, staggered rather
    // than the whole stack rotating as one rigid unit. Bales higher
    // up in the stack (least stable) start falling first
    for (let i = 0; i < 20; i++) {
      const row = Math.floor(i / 2); // which row this bale started in
      const jitterHash = Math.sin(i * 91.345 + 7) * 24681.35 % 1; // per-bale timing jitter, breaks up the lockstep look
      const fallDelay = (HAY_BALE_ROWS - 1 - row) * 38 + Math.abs(jitterHash) * 150;
      const localT = Math.max(0, hayBales.toppleT - fallDelay);
      const totalForThis = HAY_BALE_TOPPLE_MS - fallDelay;
      const rawP = Math.min(1, localT / Math.max(1, totalForThis));

      // per-bale easing style -- not every bale moves the same way.
      // some overshoot past their target and settle back, some snap
      // fast then coast, some build up speed toward the end
      const styleHash = Math.abs(Math.sin(i * 13.7 + 2));
      let eased;
      if (styleHash < 0.34) {
        const overshoot = 1.18;
        eased = rawP < 0.68 ? (rawP / 0.68) * overshoot : overshoot - (overshoot - 1) * ((rawP - 0.68) / 0.32);
      } else if (styleHash < 0.67) {
        eased = 1 - Math.pow(1 - rawP, 3);
      } else {
        eased = Math.pow(rawP, 2.3);
      }

      const start = standingPositions[i];
      const target = toppledPositions[i];
      // wobble along the actual path -- decays as the fall completes,
      // oscillates a couple of times so it's not a clean straight line
      const wobbleSeed = Math.sin(i * 47.3 + 3) * 10;
      const wobble = Math.sin(rawP * Math.PI * 3 + wobbleSeed) * (1 - rawP) * 9;
      const x = start.dx + (target.dx - start.dx) * eased + wobble;
      const y = start.dy + (target.dy - start.dy) * eased - Math.abs(wobble) * 0.4;
      const tumble = (1 - eased) * 3; // extra spin while still falling, settles as it lands
      const rot = eased * target.rot + tumble;
      drawBale(hx + x, baseY + y, 34, 22, rot, i + 1);
    }
  } else {
    // standing wall -- two columns, ten rows tall, blocking passage entirely
    standingPositions.forEach((p, i) => {
      drawBale(hx + p.dx, baseY + p.dy, 34, 22, 0, i + 1);
    });
  }
}

// shared shape -- both the main crow and the smaller tree-sighting
// crow use this exact same visual language, just at different scales
function drawCrowShape(w, h) {
  // tail feathers, behind the body -- angles diagonally down and
  // back, like a real crow's tail, thick and fanned rather than a
  // thin point
  ctx.fillStyle = "#1e1e22";
  ctx.beginPath();
  ctx.moveTo(5, h * 0.42);
  ctx.lineTo(-18, h * 0.75);
  ctx.lineTo(-24, h * 1.0);
  ctx.lineTo(-6, h * 0.72);
  ctx.closePath();
  ctx.fill();

  // body -- rounded, dark, slightly glossy
  ctx.fillStyle = "#26262b";
  ctx.beginPath();
  ctx.ellipse(w * 0.42, h * 0.55, w * 0.4, h * 0.42, 0, 0, Math.PI * 2);
  ctx.fill();

  // head, slightly forward and raised
  ctx.beginPath();
  ctx.arc(w * 0.72, h * 0.32, h * 0.32, 0, Math.PI * 2);
  ctx.fill();

  // a hint of gloss -- a small lighter patch, catches the eye without
  // being a full highlight
  ctx.fillStyle = "rgba(120,120,150,0.25)";
  ctx.beginPath();
  ctx.ellipse(w * 0.4, h * 0.42, w * 0.16, h * 0.12, -0.3, 0, Math.PI * 2);
  ctx.fill();

  // beak
  ctx.fillStyle = "#3a2a1a";
  ctx.beginPath();
  ctx.moveTo(w * 0.95, h * 0.3);
  ctx.lineTo(w * 1.15, h * 0.34);
  ctx.lineTo(w * 0.95, h * 0.4);
  ctx.closePath();
  ctx.fill();

  // eye -- small, sharp, a little knowing
  ctx.fillStyle = "#e8d888";
  ctx.beginPath();
  ctx.arc(w * 0.78, h * 0.28, 3.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.arc(w * 0.8, h * 0.28, 2, 0, Math.PI * 2);
  ctx.fill();
}

function drawCrow(camX) {
  if (!hayBales.toppled) return;
  const cx = crow.x - camX;
  const cy = gy - crow.height - crow.y + Math.sin(crow.bob) * 2;

  // shadow
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(cx + crow.width / 2, gy + 3, 24, 6, 0, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(crow.facing, 1);
  drawCrowShape(crow.width, crow.height);
  ctx.restore();

  if (crow.active && isPlayerNear(crow.x + crow.width / 2, crow.y, 130, 45, 999)) {
    const bubbleY = cy - 60;
    if (!crow.offeredPumpkin) {
      drawSpeechBubble(ctx, cx, bubbleY, [
        "Well now — got a squash on you, by any chance?"
      ]);
    } else {
      drawSpeechBubble(ctx, cx, bubbleY, [
        "There's a nice place to carve such a squash, over yonder."
      ]);
    }
  }
}

function drawSparkleBurst(cx, cy, progress, scale) {
  // progress 0-1 across a short window right at a reveal moment --
  // a handful of points radiating outward, fading as they go. scale
  // defaults to 1, used larger for the initial placement sparkle
  scale = scale || 1;
  const count = 6;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 / count) * i + progress * 0.6;
    const dist = progress * 26 * scale;
    const px = cx + Math.cos(angle) * dist;
    const py = cy + Math.sin(angle) * dist;
    const alpha = Math.max(0, 1 - progress);
    ctx.fillStyle = `rgba(255,230,160,${alpha})`;
    ctx.beginPath();
    ctx.arc(px, py, 2.2 * scale * (1 - progress * 0.4), 0, Math.PI * 2);
    ctx.fill();
  }
}

// moves from startX to endX overall, but oscillates back and forth
// several times along the way rather than one clean sweep -- the
// oscillation shrinks to zero as p approaches 1, so it still lands
// exactly on endX at completion
function sawPosition(p, startX, endX, passes) {
  const amplitude = (1 - p) * 0.55;
  const saw = Math.sin(p * Math.PI * passes) * amplitude;
  const eased = Math.max(0, Math.min(1, p + saw));
  return startX + (endX - startX) * eased;
}

function drawKnife(x, y, angle) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  // blade -- tapers to an actual sharp point, tip pointing down by
  // default (angle=0), the natural orientation for actively cutting
  // into a surface below rather than pointing away from it
  ctx.fillStyle = "#c8c8c0";
  ctx.beginPath();
  ctx.moveTo(0, 22);        // sharp tip, pointing down
  ctx.lineTo(2.2, 6);       // back edge, slight belly
  ctx.lineTo(2.2, -2);
  ctx.lineTo(-2.2, -2);
  ctx.lineTo(-1.6, 6);      // cutting edge, straighter
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(80,80,75,0.5)";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.fillStyle = "#5a3a20";
  ctx.fillRect(-3, -12, 6, 10);
  ctx.restore();
}

function drawPumpkinGuts(gx, gy2) {
  // gooey stringy insides -- irregular pale orange-yellow blob
  ctx.fillStyle = "#d4a24a";
  ctx.beginPath();
  ctx.moveTo(gx - 18, gy2);
  ctx.quadraticCurveTo(gx - 20, gy2 - 10, gx - 10, gy2 - 9);
  ctx.quadraticCurveTo(gx - 2, gy2 - 14, gx + 6, gy2 - 8);
  ctx.quadraticCurveTo(gx + 16, gy2 - 10, gx + 17, gy2 - 2);
  ctx.quadraticCurveTo(gx + 20, gy2 + 4, gx + 10, gy2 + 5);
  ctx.quadraticCurveTo(gx, gy2 + 8, gx - 10, gy2 + 5);
  ctx.quadraticCurveTo(gx - 20, gy2 + 4, gx - 18, gy2);
  ctx.closePath();
  ctx.fill();
  // stringy texture within the blob
  ctx.strokeStyle = "rgba(180,130,50,0.5)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 5; i++) {
    const sx2 = gx - 14 + i * 7;
    ctx.beginPath();
    ctx.moveTo(sx2, gy2 - 6);
    ctx.quadraticCurveTo(sx2 + 2, gy2, sx2 - 1, gy2 + 5);
    ctx.stroke();
  }
  // a couple of curved skin scraps peeking out from beneath
  ctx.fillStyle = "#c9863a";
  ctx.beginPath();
  ctx.ellipse(gx - 20, gy2 + 4, 8, 4, 0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.ellipse(gx + 19, gy2 + 3, 7, 3.5, -0.3, 0, Math.PI * 2);
  ctx.fill();
  // seeds scattered across the top
  ctx.fillStyle = "#e8dcb0";
  const seedSpots = [[-8, -4], [-2, -8], [5, -6], [10, -2], [-4, 2], [3, 4], [-11, 0]];
  seedSpots.forEach(([dx, dy]) => {
    ctx.save();
    ctx.translate(gx + dx, gy2 + dy);
    ctx.rotate(dx * 0.3);
    ctx.beginPath();
    ctx.ellipse(0, 0, 2.6, 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawCarvingStation(camX) {
  if (!hayBales.toppled) return;
  const sx = carvingStation.x - camX;
  const stationTopY = gy - carvingStation.platformHeight;

  // small hay bale platform -- two bales lying on their side, same
  // shape and straw detail as every other bale in the game
  ctx.fillStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.ellipse(sx, gy + 3, 32, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  drawHayBaleShape(sx - 17, gy - 15, 26, 30, Math.PI / 2, 41);
  drawHayBaleShape(sx + 17, gy - 15, 26, 30, Math.PI / 2, 42);

  // off-white cloth draped over the bales -- hangs down over the left
  // and right sides where there's nothing underneath to support it,
  // staying higher in the middle where the bales do. Tighter angle on
  // the side droop -- hugs the bales rather than flaring out wide.
  ctx.fillStyle = "#e8ddc0";
  ctx.beginPath();
  ctx.moveTo(sx - 32, stationTopY - 8);
  ctx.quadraticCurveTo(sx - 33, stationTopY + 6, sx - 27, stationTopY + 12); // left edge hangs down, tighter and steeper
  ctx.quadraticCurveTo(sx - 16, stationTopY + 6, sx - 8, stationTopY + 7);  // wavy drape along the bottom
  ctx.quadraticCurveTo(sx, stationTopY + 4, sx + 8, stationTopY + 7);
  ctx.quadraticCurveTo(sx + 16, stationTopY + 6, sx + 27, stationTopY + 12);
  ctx.quadraticCurveTo(sx + 33, stationTopY + 6, sx + 32, stationTopY - 8); // right edge hangs down, tighter and steeper
  ctx.quadraticCurveTo(sx + 16, stationTopY - 14, sx, stationTopY - 12); // top edge, flatter across the middle
  ctx.quadraticCurveTo(sx - 16, stationTopY - 14, sx - 32, stationTopY - 8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 1;
  ctx.stroke();
  // a couple of soft fold lines for a little fabric texture
  ctx.strokeStyle = "rgba(140,120,90,0.25)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(sx - 30, stationTopY - 4);
  ctx.quadraticCurveTo(sx - 32, stationTopY + 3, sx - 28, stationTopY + 8);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(sx + 30, stationTopY - 4);
  ctx.quadraticCurveTo(sx + 32, stationTopY + 3, sx + 28, stationTopY + 8);
  ctx.stroke();

  // knife resting off-center to the right, when nothing else is using it
  if (!carvingStation.pumpkinPlaced || (carvingStation.active && carvingStation.phase !== "carving")) {
    drawKnife(sx + 20, stationTopY - 8, 0.3);
  }

  if (!carvingStation.pumpkinPlaced) return;

  const sy = stationTopY - 18;

  if (!carvingStation.active) {
    // placement sparkle -- larger particles than the reveal bursts,
    // pumpkin sitting blank while it settles onto the cloth
    const p = Math.min(1, carvingStation.placingT / CARVING_PLACE_SPARKLE_MS);
    drawPumpkinFace(sx, sy, 100, null, null, null);
    drawSparkleBurst(sx, sy - 10, p, 1.6);
    drawSparkleBurst(sx - 18, sy + 6, p, 1.3);
    drawSparkleBurst(sx + 18, sy + 6, p, 1.3);
    return;
  }

  if (carvingStation.phase === "beat1") {
    // a genuine pause before carving even starts -- nothing happening yet
    drawPumpkinFace(sx, sy, 130, null, null, null);
    return;
  }

  if (carvingStation.phase === "beat2") {
    // carving just finished -- the guts are now sitting there
    drawPumpkinFace(sx, sy, 130, carvedPumpkinDesign.eyeLeft, carvedPumpkinDesign.eyeRight, carvedPumpkinDesign.mouth);
    drawPumpkinGuts(sx - 145, gy - 8);
    return;
  }

  if (carvingStation.phase === "carving") {
    // knife visibly cutting each feature in, reusing the same
    // eyes-then-mouth staggered timing as before
    const progress = carvingStation.carveT / CARVING_CARVE_MS;
    const eyesRevealed = progress >= CARVING_EYES_REVEAL_AT;
    const mouthRevealed = progress >= CARVING_MOUTH_REVEAL_AT;
    const eyesCutProgress = (progress - (CARVING_EYES_REVEAL_AT - 0.22)) / 0.22;
    const mouthCutProgress = (progress - (CARVING_MOUTH_REVEAL_AT - 0.18)) / 0.18;
    const eyeRevealAmount = eyesRevealed ? 1 : Math.max(0, Math.min(1, eyesCutProgress));
    const mouthRevealAmount = mouthRevealed ? 1 : Math.max(0, Math.min(1, mouthCutProgress));
    drawPumpkinFace(
      sx, sy, 130,
      eyeRevealAmount > 0 ? carvedPumpkinDesign.eyeLeft : null,
      eyeRevealAmount > 0 ? carvedPumpkinDesign.eyeRight : null,
      mouthRevealAmount > 0 ? carvedPumpkinDesign.mouth : null,
      eyeRevealAmount, eyeRevealAmount, mouthRevealAmount
    );
    if (eyesCutProgress >= 0 && eyesCutProgress <= 1) {
      const kx = sawPosition(eyesCutProgress, sx - 26, sx + 26, 7);
      const kAngle = sawPosition(eyesCutProgress, -0.15, 0.15, 7);
      drawKnife(kx, sy - 16 - 22, kAngle); // shifted up so the tip (22 below origin) lands on the cut line
    } else if (eyesRevealed) {
      const sparkleP = Math.min(1, (progress - CARVING_EYES_REVEAL_AT) / 0.12);
      if (sparkleP <= 1) { drawSparkleBurst(sx - 26, sy - 16, sparkleP); drawSparkleBurst(sx + 26, sy - 16, sparkleP); }
    }
    if (mouthCutProgress >= 0 && mouthCutProgress <= 1) {
      const kx = sawPosition(mouthCutProgress, sx - 16, sx + 16, 6);
      const kAngle = sawPosition(mouthCutProgress, -0.15, 0.15, 6);
      drawKnife(kx, sy + 24 - 22, kAngle);
    } else if (mouthRevealed) {
      const sparkleP = Math.min(1, (progress - CARVING_MOUTH_REVEAL_AT) / 0.12);
      if (sparkleP <= 1) drawSparkleBurst(sx, sy + 24, sparkleP);
    }
    return;
  }

  if (carvingStation.phase === "sparkle") {
    const p = carvingStation.carveT / CARVING_SPARKLE_MS;
    drawPumpkinFace(sx, sy, 130, carvedPumpkinDesign.eyeLeft, carvedPumpkinDesign.eyeRight, carvedPumpkinDesign.mouth);
    drawPumpkinGuts(sx - 145, gy - 8);
    drawSparkleBurst(sx, sy, p, 1.8);
    return;
  }

  if (carvingStation.phase === "growing" || carvingStation.phase === "done") {
    // slow but genuinely visible growth, not a sudden pop and not
    // dragged out either
    const p = carvingStation.phase === "done" ? 1 : carvingStation.carveT / CARVING_GROW_MS;
    const eased = p * p * (3 - 2 * p);
    const size = 130 + eased * 55;
    const bob = carvingStation.phase === "done" ? Math.sin(performance.now() * 0.003) * 3 : 0;
    // anchors the bottom edge in place as it grows, rather than
    // expanding downward -- the base stays exactly where it started
    // instead of creeping down over where the player is standing
    const growY = -(size - 130) * 0.5;
    let glowColor = null;
    if (carvingStation.phase === "done") {
      // layered sine waves at different frequencies for a natural,
      // irregular flicker rather than a smooth mechanical pulse
      const t = performance.now();
      const flicker = 0.7 + Math.sin(t * 0.0012) * 0.14 + Math.sin(t * 0.0034 + 1.3) * 0.09 + Math.sin(t * 0.0081 + 2.7) * 0.05;
      const brightness = Math.max(0.5, Math.min(1, flicker));
      const r = Math.round(255 * brightness);
      const g = Math.round(180 * brightness + 40);
      const b = Math.round(40 * brightness);
      glowColor = `rgb(${r},${g},${b})`;
      // soft warm halo behind the pumpkin, flickering along with the candle
      const haloGrad = ctx.createRadialGradient(sx, sy + growY + bob, size * 0.1, sx, sy + growY + bob, size * 0.75);
      haloGrad.addColorStop(0, `rgba(255,180,60,${0.28 * brightness})`);
      haloGrad.addColorStop(1, "rgba(255,180,60,0)");
      ctx.fillStyle = haloGrad;
      ctx.beginPath();
      ctx.arc(sx, sy + growY + bob, size * 0.75, 0, Math.PI * 2);
      ctx.fill();
    }
    drawPumpkinFace(sx, sy + growY + bob, size, carvedPumpkinDesign.eyeLeft, carvedPumpkinDesign.eyeRight, carvedPumpkinDesign.mouth, 1, 1, 1, glowColor);
    drawPumpkinGuts(sx - 145, gy - 8);
  }
}

// decorative hay piles scattered around the carving area -- purely
// visual dressing, no collision, reusing the same bale shape as the
// main pile. Varied arrangements (not identical repeats) so the area
// reads as a real hay-strewn space rather than a copy-pasted prop
const decorativeHayPiles = [
  { x: 4226, topHeight: 22, bales: [{ dx: 0, dy: -11, rot: 0.08, seed: 5 }] },
  { x: 4434, topHeight: 44, bales: [{ dx: 0, dy: -11, rot: 0, seed: 11 }, { dx: 0, dy: -33, rot: 0, seed: 12 }] },
  { x: 4850, topHeight: 22, bales: [{ dx: -12, dy: -11, rot: -0.1, seed: 16 }, { dx: 12, dy: -11, rot: 0.12, seed: 17 }] },
  { x: 5032, topHeight: 41, bales: [{ dx: -14, dy: -11, rot: Math.PI / 2, seed: 21 }, { dx: 14, dy: -11, rot: Math.PI / 2, seed: 22 }, { dx: 0, dy: -30, rot: 0.15, seed: 23 }] },
  { x: 5253, topHeight: 66, bales: [{ dx: 0, dy: -11, rot: 0, seed: 31 }, { dx: 0, dy: -33, rot: 0, seed: 32 }, { dx: 0, dy: -55, rot: 0, seed: 33 }] },
  { x: 5435, topHeight: 28, bales: [{ dx: -13, dy: -11, rot: Math.PI / 2, seed: 41 }, { dx: 13, dy: -11, rot: Math.PI / 2, seed: 42 }] },
  { x: 5591, topHeight: 44, bales: [{ dx: 0, dy: -11, rot: -0.06, seed: 51 }, { dx: 0, dy: -33, rot: 0.1, seed: 52 }] }
];

function drawDecorativeHayPiles(camX) {
  decorativeHayPiles.forEach(pile => {
    const px = pile.x - camX;
    if (px < -60 || px > canvas.width + 60) return; // skip off-screen piles
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.beginPath();
    ctx.ellipse(px, gy + 3, 22, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    pile.bales.forEach(b => {
      drawHayBaleShape(px + b.dx, gy + b.dy, 34, 22, b.rot, b.seed);
    });
  });
}

// small ambient crows -- perched on the decorative piles, purely for
// atmosphere. Reuses the same shared crow shape at a smaller scale.
const smallCrows = [
  { x: 4434, y: 46, width: 20, height: 15, bob: 0, bobSpeed: 0.04, facing: 1,
    baseY: 46, flyState: "perched", flyT: 0, flyCooldown: 3000 + Math.random() * 2500, flyOffset: 0 },
  { x: 5253, y: 68, width: 18, height: 14, bob: 1.2, bobSpeed: 0.045, facing: -1 }
];

const SMALL_CROW_RISE_MS = 1300;
const SMALL_CROW_HOLD_MS = 500;
const SMALL_CROW_SETTLE_MS = 1100;
const SMALL_CROW_RISE_HEIGHT = 60;

function updateSmallCrows(deltaTime) {
  const dtMs = deltaTime * 1000;
  smallCrows.forEach(c => {
    c.bob += c.bobSpeed;
    if (c.flyState === undefined) return; // this crow just idle-bobs, no fly cycle

    if (c.flyState === "perched") {
      c.flyT += dtMs;
      if (c.flyT >= c.flyCooldown) {
        c.flyState = "rising";
        c.flyT = 0;
      }
    } else if (c.flyState === "rising") {
      c.flyT += dtMs;
      const p = Math.min(1, c.flyT / SMALL_CROW_RISE_MS);
      const eased = p * p * (3 - 2 * p);
      c.flyOffset = eased * SMALL_CROW_RISE_HEIGHT;
      if (p >= 1) { c.flyState = "holding"; c.flyT = 0; }
    } else if (c.flyState === "holding") {
      c.flyT += dtMs;
      // gentle horizontal loop while up there -- reads as actual
      // flying around, not just hovering statically in place
      c.flyOffsetX = Math.sin(c.flyT * 0.0025) * 14;
      if (c.flyT >= SMALL_CROW_HOLD_MS) { c.flyState = "settling"; c.flyT = 0; }
    } else if (c.flyState === "settling") {
      c.flyT += dtMs;
      const p = Math.min(1, c.flyT / SMALL_CROW_SETTLE_MS);
      const eased = p * p * (3 - 2 * p);
      c.flyOffset = (1 - eased) * SMALL_CROW_RISE_HEIGHT;
      c.flyOffsetX = (1 - eased) * (c.flyOffsetX || 0);
      if (p >= 1) {
        c.flyState = "perched";
        c.flyT = 0;
        c.flyOffset = 0;
        c.flyOffsetX = 0;
        c.flyCooldown = 3500 + Math.random() * 3000; // wait a while before flying again
      }
    }
  });
}

function drawSmallCrows(camX) {
  smallCrows.forEach(c => {
    const cx = c.x - camX + (c.flyOffsetX || 0);
    if (cx < -40 || cx > canvas.width + 40) return;
    const flyOffset = c.flyOffset || 0;
    const cy = gy - c.height - c.y + Math.sin(c.bob) * 1.5 - flyOffset;
    // shadow fades out a little as it rises, since it's further from the ground
    ctx.fillStyle = `rgba(0,0,0,${0.18 * (1 - flyOffset / (SMALL_CROW_RISE_HEIGHT * 1.5))})`;
    ctx.beginPath();
    ctx.ellipse(cx + c.width / 2, gy + 2, 10, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(c.facing, 1);
    drawCrowShape(c.width, c.height);
    ctx.restore();
  });
}

// decorative squash -- varied shapes and colors scattered around the
// carving area, matching the range actually sold at Halloween rather
// than uniform orange pumpkins
function drawDecorativeSquash(cx, cy, size, type) {
  ctx.save();
  ctx.translate(cx, cy);

  if (type === "white") {
    // pale cream pumpkin, same rounded shape as the main pumpkin
    ctx.fillStyle = "#e8e0cc";
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.55, size * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(180,170,140,0.5)";
    ctx.lineWidth = 1.5;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * size * 0.16, -size * 0.48);
      ctx.quadraticCurveTo(i * size * 0.2, 0, i * size * 0.16, size * 0.48);
      ctx.stroke();
    }
  } else if (type === "gourd") {
    // dark green, warty/bumpy irregular surface
    ctx.fillStyle = "#3a5a2e";
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 0.5, size * 0.42, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(60,90,40,0.6)";
    for (let i = 0; i < 10; i++) {
      const a = Math.sin(i * 17.3) * 43758.5453 % 1;
      const angle = (i / 10) * Math.PI * 2;
      const r = size * (0.25 + Math.abs(a) * 0.18);
      const wx = Math.cos(angle) * r, wy = Math.sin(angle) * r * 0.85;
      ctx.beginPath();
      ctx.arc(wx, wy, size * 0.055, 0, Math.PI * 2);
      ctx.fill();
    }
  } else if (type === "hubbard") {
    // tall blue-gray teardrop shape, distinct silhouette from a round
    // pumpkin -- with real ribbing and warty texture so it reads
    // clearly as a squash rather than an abstract smooth shape
    ctx.fillStyle = "#6b7a82";
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.65);
    ctx.quadraticCurveTo(size * 0.45, -size * 0.2, size * 0.38, size * 0.35);
    ctx.quadraticCurveTo(size * 0.2, size * 0.62, 0, size * 0.62);
    ctx.quadraticCurveTo(-size * 0.2, size * 0.62, -size * 0.38, size * 0.35);
    ctx.quadraticCurveTo(-size * 0.45, -size * 0.2, 0, -size * 0.65);
    ctx.closePath();
    ctx.fill();
    // warty texture, same seeded-bump approach as the gourd
    ctx.fillStyle = "rgba(90,100,108,0.55)";
    for (let i = 0; i < 8; i++) {
      const a = Math.sin(i * 21.7) * 43758.5453 % 1;
      const t = (i + 0.5) / 8;
      const wy = -size * 0.55 + t * size * 1.05;
      const maxWx = size * (0.42 - Math.abs(t - 0.5) * 0.3);
      const wx = (a * 2 - 1) * maxWx * 0.7;
      ctx.beginPath();
      ctx.arc(wx, wy, size * 0.045, 0, Math.PI * 2);
      ctx.fill();
    }
    // multiple ribbing lines, not just one center seam
    ctx.strokeStyle = "rgba(40,50,55,0.4)";
    ctx.lineWidth = 1.2;
    for (let i = -1; i <= 1; i++) {
      ctx.beginPath();
      ctx.moveTo(i * size * 0.16, -size * 0.6);
      ctx.quadraticCurveTo(i * size * 0.22 + size * 0.06, 0, i * size * 0.16, size * 0.58);
      ctx.stroke();
    }
  } else if (type === "turban") {
    // single continuous silhouette -- wide base narrowing gently to a
    // subtle waist, then the cap bulging back out before rounding off.
    // One closed path, not two stacked shapes, so there's no seam
    ctx.beginPath();
    ctx.moveTo(0, -size * 0.58); // top of cap
    ctx.bezierCurveTo(size * 0.26, -size * 0.56, size * 0.34, -size * 0.42, size * 0.3, -size * 0.28);
    ctx.bezierCurveTo(size * 0.27, -size * 0.16, size * 0.3, -size * 0.1, size * 0.4, size * 0.02);
    ctx.bezierCurveTo(size * 0.52, size * 0.16, size * 0.5, size * 0.32, size * 0.34, size * 0.42);
    ctx.bezierCurveTo(size * 0.2, size * 0.5, -size * 0.2, size * 0.5, -size * 0.34, size * 0.42);
    ctx.bezierCurveTo(-size * 0.5, size * 0.32, -size * 0.52, size * 0.16, -size * 0.4, size * 0.02);
    ctx.bezierCurveTo(-size * 0.3, -size * 0.1, -size * 0.27, -size * 0.16, -size * 0.3, -size * 0.28);
    ctx.bezierCurveTo(-size * 0.34, -size * 0.42, -size * 0.26, -size * 0.56, 0, -size * 0.58);
    ctx.closePath();
    ctx.fillStyle = "#c9863a";
    ctx.fill();
    ctx.strokeStyle = "rgba(120,60,20,0.4)";
    ctx.lineWidth = 1.2;
    ctx.stroke();

    // cream cap color, clipped to just the top portion so it blends
    // into the base color rather than sitting behind a hard outline
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "#e8ddb8";
    ctx.beginPath();
    ctx.ellipse(0, -size * 0.4, size * 0.36, size * 0.24, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // ribbing that flows continuously from base through cap, following
    // the same silhouette rather than two separate sets of lines
    ctx.strokeStyle = "rgba(120,70,30,0.35)";
    ctx.lineWidth = 1;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * size * 0.12, -size * 0.55);
      ctx.quadraticCurveTo(i * size * 0.22, -size * 0.05, i * size * 0.12, size * 0.46);
      ctx.stroke();
    }
  } else if (type === "pattypan") {
    // wide, flattened shape with a scalloped wavy rim all the way
    // around -- pale yellow, the classic Trader Joe's autumn scallop squash
    ctx.fillStyle = "#e0d060";
    const bumps = 11;
    ctx.beginPath();
    for (let i = 0; i <= bumps; i++) {
      const t = i / bumps;
      const angle = t * Math.PI * 2 - Math.PI / 2;
      const wobble = Math.sin(t * bumps * Math.PI * 2) * size * 0.05;
      const r = size * 0.52 + wobble;
      const px = Math.cos(angle) * r, py = Math.sin(angle) * r * 0.42;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(160,140,30,0.45)";
    ctx.lineWidth = 1.2;
    ctx.stroke();
    // faint ridge lines radiating from the center, echoing a real
    // scallop squash's segmented look
    ctx.strokeStyle = "rgba(160,140,30,0.3)";
    ctx.lineWidth = 0.8;
    for (let i = 0; i < bumps; i++) {
      const angle = (i / bumps) * Math.PI * 2 - Math.PI / 2;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(angle) * size * 0.46, Math.sin(angle) * size * 0.46 * 0.42);
      ctx.stroke();
    }
  } else {
    // wonky lopsided orange pumpkin -- asymmetric, one side bulging more
    ctx.fillStyle = "#c9863a";
    ctx.beginPath();
    ctx.ellipse(-size * 0.06, size * 0.02, size * 0.56, size * 0.46, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(120,60,20,0.4)";
    ctx.lineWidth = 1.5;
    for (let i = -2; i <= 2; i++) {
      ctx.beginPath();
      ctx.moveTo(i * size * 0.15 - size * 0.06, -size * 0.42);
      ctx.quadraticCurveTo(i * size * 0.2 - size * 0.06, size * 0.02, i * size * 0.15 - size * 0.06, size * 0.44);
      ctx.stroke();
    }
  }

  // stem, positioned relative to each type's own actual top edge --
  // fixes it floating way above the flatter shapes like the pattypan
  const topExtent = SQUASH_TOP_EXTENT[type] || 0.5;
  ctx.fillStyle = "#5a7a3a";
  ctx.fillRect(-size * 0.05, -size * (topExtent + 0.1), size * 0.1, size * 0.14);

  ctx.restore();
}

const decorativeSquash = [
  { x: 4505, size: 30, type: "gourd" },
  { x: 5110, size: 34, type: "white" },
  { x: 4915, size: 42, type: "hubbard" },
  { x: 5318, size: 32, type: "wonky" },
  { x: 5656, size: 28, type: "white" },
  { x: 5740, size: 30, type: "gourd" },
  { x: 4265, size: 38, type: "turban" },
  { x: 5500, size: 36, type: "pattypan" }
];

// each squash type has a different actual vertical extent -- a flat
// pattypan is much shorter than a round pumpkin -- so a single
// one-size-fits-all ground offset left some floating and others
// sinking in. This maps each type to how far its own bottom edge
// actually extends below its center, as a fraction of size.
const SQUASH_BOTTOM_EXTENT = {
  white: 0.5,
  gourd: 0.42,
  hubbard: 0.62,
  turban: 0.5,
  pattypan: 0.22,
  wonky: 0.48
};

// each type's actual top edge, computed from its own shape -- used
// to position the stem correctly instead of one fixed height that
// left it floating way above flatter shapes like the pattypan
const SQUASH_TOP_EXTENT = {
  white: 0.5,
  gourd: 0.42,
  hubbard: 0.65,
  turban: 0.58,
  pattypan: 0.218,
  wonky: 0.44
};

function drawDecorativeSquashField(camX) {
  decorativeSquash.forEach(s => {
    const sx = s.x - camX;
    if (sx < -50 || sx > canvas.width + 50) return;
    ctx.fillStyle = "rgba(0,0,0,0.15)";
    ctx.beginPath();
    ctx.ellipse(sx, gy + 3, s.size * 0.4, s.size * 0.1, 0, 0, Math.PI * 2);
    ctx.fill();
    const bottomExtent = SQUASH_BOTTOM_EXTENT[s.type] || 0.45;
    drawDecorativeSquash(sx, gy - s.size * bottomExtent, s.size, s.type);
  });
}

// fly nothing like birds: sharp unpredictable direction changes, a
// fluttery bounce rather than a smooth glide, erratic zigzagging
// instead of clean arcs. Purely ambient, no interaction.
const bat = {
  x: 4600,
  y: 90,
  vx: 0.15,
  vy: 0,
  turnT: 0,
  turnInterval: 500 + Math.random() * 500,
  wingPhase: 0,
  boundsMinX: 3550,
  boundsMaxX: 5850,
  boundsMinY: 45,
  boundsMaxY: 135
};

function updateBat(deltaTime) {
  const dtMs = deltaTime * 1000;
  bat.wingPhase += dtMs * 0.03;
  bat.turnT += dtMs;

  if (bat.turnT >= bat.turnInterval) {
    bat.turnT = 0;
    bat.turnInterval = 650 + Math.random() * 600; // slightly longer between direction changes -- a touch less erratic
    const speed = 0.09 + Math.random() * 0.14; // slower still
    const angle = Math.random() * Math.PI * 2;
    bat.vx = Math.cos(angle) * speed;
    bat.vy = Math.sin(angle) * speed;
  }

  bat.x += bat.vx * dtMs;
  bat.y -= bat.vy * dtMs; // y here is height-above-ground, so positive vy should raise it

  // soft bounds -- steer back in rather than hard clamp, keeps the
  // erratic feel instead of snapping to a wall
  if (bat.x < bat.boundsMinX) bat.vx = Math.abs(bat.vx) + 0.08;
  if (bat.x > bat.boundsMaxX) bat.vx = -Math.abs(bat.vx) - 0.08;
  if (bat.y < bat.boundsMinY) bat.vy = -Math.abs(bat.vy) - 0.08;
  if (bat.y > bat.boundsMaxY) bat.vy = Math.abs(bat.vy) + 0.08;
}

function drawBat(camX) {
  if (!hayBales.toppled) return;
  const bx = bat.x - camX;
  if (bx < -40 || bx > canvas.width + 40) return;
  const by = gy - bat.y;

  ctx.save();
  ctx.translate(bx, by);

  const flap = Math.sin(bat.wingPhase) * 0.9; // fast flutter, not a slow glide

  ctx.fillStyle = "#1c1c20";
  // wings -- membranous, jagged finger segments, distinct from any bird
  [-1, 1].forEach(side => {
    ctx.save();
    ctx.scale(side, 1);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(10, -6 - flap * 5);
    ctx.lineTo(16, -2 - flap * 3);
    ctx.lineTo(13, 2);
    ctx.lineTo(8, 1 - flap * 2);
    ctx.lineTo(4, 4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  });

  // small round body
  ctx.beginPath();
  ctx.ellipse(0, 0, 4.5, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // small pointed ears
  ctx.beginPath();
  ctx.moveTo(-3, -4);
  ctx.lineTo(-4.5, -8);
  ctx.lineTo(-1.5, -5);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(3, -4);
  ctx.lineTo(4.5, -8);
  ctx.lineTo(1.5, -5);
  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawTreeCrow(camX) {
  const cx = treeCrow.x - camX;
  let flyOffsetX = 0, flyOffsetY = 0, alpha = 1, tilt = 0;
  if (treeCrow.fleeing) {
    const p = Math.min(1, treeCrow.fleeT / TREE_CROW_FLEE_MS);
    const eased = p * p; // accelerates -- slow start (still registers as a real takeoff), faster as it goes
    // flies further and faster before fading -- stays fully visible
    // through almost the whole flight, only fading in the last stretch
    // once it's genuinely flown off into the distance
    flyOffsetX = eased * 160;
    flyOffsetY = -eased * 130 + Math.sin(p * Math.PI * 4) * 6; // fluttery bounce along the climb, not a smooth glide
    alpha = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
    tilt = -0.3 - eased * 0.25; // banks upward into the flight direction
    if (p >= 1) return; // fully fled, nothing left to draw
  }
  const cy = gy - treeCrow.height - treeCrow.y + Math.sin(treeCrow.bob) * 1.5 + flyOffsetY;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(cx + flyOffsetX, cy);
  ctx.rotate(tilt);
  drawCrowShape(treeCrow.width, treeCrow.height);
  ctx.restore();
}

function drawVines(camX) {
  vines.forEach(v => {
    const ax = v.x - camX, ay = gy - v.anchorHeight;
    const vx = v.x + Math.sin(v.angle) * v.length - camX;
    const vy = gy - (v.anchorHeight - Math.cos(v.angle) * v.length);

    if (v.tier === "standalone") {
      drawSmallTree(v.x - camX, ay + v.length * 0.3);
    }

    ctx.strokeStyle = "#8a3a1a";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(vx, vy);
    ctx.stroke();

    ctx.fillStyle = "#c9481f";
    for (let t = 0.3; t < 1; t += 0.35) {
      const bx = ax + (vx - ax) * t, by = ay + (vy - ay) * t;
      ctx.beginPath();
      ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

const VINE_CATCH_GRACE_MS = 350; // coyote-time window — once genuinely in range, space still counts for a bit after, even if you've drifted slightly further by the time you react

function updateAcorns() {
  acorns.forEach(a => {
    if (a.collected || a.collecting) return;
    const inRange = isPlayerNear(a.x, a.heightAboveGround, 20, 40, 40);
    if (player.vineFlying && inRange) {
      // auto-collect on contact during vine-to-vine flight — no space
      // press needed, removes the mid-air timing problem entirely
      a.collecting = true;
      startCollectAnimation({ x: a.x, y: gy - a.heightAboveGround, size: 6, rotation: 0 }, "acorn");
      return;
    }
    if (inRange) a.graceUntil = performance.now() + VINE_CATCH_GRACE_MS;
    const withinGrace = a.graceUntil && performance.now() < a.graceUntil;
    if (keys.space && (inRange || withinGrace)) {
      a.collecting = true;
      startCollectAnimation({ x: a.x, y: gy - a.heightAboveGround, size: 6, rotation: 0 }, "acorn");
    }
  });
}

function drawAcorns(camX) {
  acorns.forEach(a => {
    if (a.collected || a.collecting) return;
    drawAcornShape(ctx, a.x - camX, gy - a.heightAboveGround, 6, 0);
  });
}

function drawHopAcorns(camX) {
  hopAcorns.forEach(ha => {
    if (ha.collected || ha.collecting) return;
    drawAcornShape(ctx, ha.displayX - camX, gy - ha.displayHeight, 6, 0);
  });
}

function drawAcornShape(ctx, x, y, size, rotation) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.fillStyle = "#a8622e";
  ctx.beginPath();
  ctx.ellipse(0, size * 0.15, size * 0.55, size * 0.65, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#5a3a1a";
  ctx.beginPath();
  ctx.arc(0, -size * 0.35, size * 0.6, Math.PI, 0);
  ctx.fill();
  ctx.restore();
}

function updateVinePumpkin() {
  if (vinePumpkin.collected || vinePumpkin.collecting) return;
  const inRange = isPlayerNear(vinePumpkin.x, vinePumpkin.heightAboveGround, 24, 20, 20);
  if (player.vineFlying && inRange) {
    // auto-collect on contact, matching the acorns — no space press needed
    vinePumpkin.collecting = true;
    startCollectAnimation({ x: vinePumpkin.x, y: gy - vinePumpkin.heightAboveGround, size: 10, rotation: 0 }, "pumpkin");
    return;
  }
  if (inRange) vinePumpkin.graceUntil = performance.now() + VINE_CATCH_GRACE_MS;
  const withinGrace = vinePumpkin.graceUntil && performance.now() < vinePumpkin.graceUntil;
  if (keys.space && (inRange || withinGrace)) {
    vinePumpkin.collecting = true;
    startCollectAnimation({ x: vinePumpkin.x, y: gy - vinePumpkin.heightAboveGround, size: 10, rotation: 0 }, "pumpkin");
  }
}

function drawVinePumpkin(camX) {
  if (vinePumpkin.collected || vinePumpkin.collecting) return;
  drawPumpkinShape(ctx, vinePumpkin.x - camX, gy - vinePumpkin.heightAboveGround, 10, 0);
}

function drawPumpkinShape(ctx, x, y, size, rotation) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.fillStyle = "#e0722a";
  ctx.beginPath();
  ctx.ellipse(0, 0, size * 0.85, size * 0.7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#c9501a";
  ctx.lineWidth = 1;
  [-0.4, 0, 0.4].forEach(off => {
    ctx.beginPath();
    ctx.moveTo(off * size, -size * 0.65);
    ctx.quadraticCurveTo(off * size * 1.3, 0, off * size, size * 0.65);
    ctx.stroke();
  });
  ctx.strokeStyle = "#5a3a1a";
  ctx.lineWidth = size * 0.15;
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.65);
  ctx.lineTo(0, -size * 0.9);
  ctx.stroke();
  ctx.restore();
}

// the recurring symbol -- outer circle, small center circle, and an
// equilateral triangle (point-up) with a gap at each corner rather
// than fully closed lines. Reusable so every appearance across the
// game stays visually identical.
function drawTeemingSymbol(ctx, x, y, size, color) {
  const rOuter = size, rTriangle = size * 0.8, rCenter = size * 0.175;
  const gapFraction = 0.14;
  ctx.save();
  ctx.translate(x, y);
  ctx.strokeStyle = color || "#3a2818";
  ctx.lineWidth = size * 0.08;
  ctx.lineCap = "round";

  // outer circle
  ctx.beginPath();
  ctx.arc(0, 0, rOuter, 0, Math.PI * 2);
  ctx.stroke();

  // triangle vertices, point-up, at -90/30/150 degrees
  const angles = [-Math.PI / 2, Math.PI / 6, (5 * Math.PI) / 6];
  const vertices = angles.map(a => [rTriangle * Math.cos(a), rTriangle * Math.sin(a)]);
  for (let i = 0; i < 3; i++) {
    const a = vertices[i], b = vertices[(i + 1) % 3];
    const startX = a[0] + gapFraction * (b[0] - a[0]);
    const startY = a[1] + gapFraction * (b[1] - a[1]);
    const endX = a[0] + (1 - gapFraction) * (b[0] - a[0]);
    const endY = a[1] + (1 - gapFraction) * (b[1] - a[1]);
    ctx.beginPath();
    ctx.moveTo(startX, startY);
    ctx.lineTo(endX, endY);
    ctx.stroke();
  }

  // small center circle
  ctx.beginPath();
  ctx.arc(0, 0, rCenter, 0, Math.PI * 2);
  ctx.stroke();

  ctx.restore();
}

function drawHeartLeaf(ctx, x, y, size, rotation, color, veinColor, variegated) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, size * 0.3);
  ctx.bezierCurveTo(-size * 0.6, -size * 0.3, -size * 0.5, -size * 0.8, 0, -size * 0.55);
  ctx.bezierCurveTo(size * 0.5, -size * 0.8, size * 0.6, -size * 0.3, 0, size * 0.3);
  ctx.closePath();
  ctx.fill();
  if (variegated) {
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "rgba(240,235,215,0.75)";
    ctx.beginPath();
    ctx.moveTo(size * 0.1, -size * 0.4);
    ctx.quadraticCurveTo(size * 0.4, -size * 0.2, size * 0.3, size * 0.15);
    ctx.quadraticCurveTo(size * 0.05, size * 0.25, -size * 0.05, 0);
    ctx.quadraticCurveTo(-size * 0.1, -size * 0.25, size * 0.1, -size * 0.4);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }
  ctx.strokeStyle = veinColor || "rgba(255,255,255,0.25)";
  ctx.lineWidth = size * 0.04;
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.4);
  ctx.lineTo(0, size * 0.2);
  ctx.stroke();
  ctx.restore();
}

function drawPothosVine(ctx, startX, startY, hangLength, waveAmp, leafColor, seed, groundLength, groundDir, emergeDir) {
  const points = [];
  const segments = 12;
  const EMERGE_END = 0.3;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const u = Math.min(t / EMERGE_END, 1);
    const emergeBump = Math.pow(Math.sin(Math.PI * u), 2); // zero slope at both ends -- smooth candy-cane hook, no kink
    const x = startX + emergeDir * 13 * emergeBump + Math.sin(t * 3.2 + seed) * waveAmp * (0.3 + t * 0.7);
    const y = startY + t * (hangLength + 6);
    points.push({ x, y });
  }
  if (groundLength) {
    const last = points[points.length - 1];
    const groundSteps = 8;
    for (let i = 1; i <= groundSteps; i++) {
      const t = i / groundSteps;
      points.push({
        x: last.x + t * groundLength * groundDir,
        y: last.y + Math.sin(t * Math.PI * 0.9 + seed * 0.2) * 7
      });
    }
  }
  ctx.strokeStyle = "#4a7a3a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length - 1; i++) {
    const midX = (points[i].x + points[i + 1].x) / 2;
    const midY = (points[i].y + points[i + 1].y) / 2;
    ctx.quadraticCurveTo(points[i].x, points[i].y, midX, midY);
  }
  ctx.lineTo(points[points.length - 1].x, points[points.length - 1].y);
  ctx.stroke();
  for (let i = 2; i < points.length; i += 1) {
    const p = points[i];
    const prev = points[i - 1];
    const angle = Math.atan2(p.y - prev.y, p.x - prev.x);
    const side = i % 2 === 0 ? 1 : -1;
    const leafSize = Math.max(4, 7 - (i / points.length) * 2.6);
    drawHeartLeaf(ctx, p.x + Math.cos(angle + side * 1.4) * 5, p.y + Math.sin(angle + side * 1.4) * 5, leafSize, angle + side * 0.3, leafColor, null, i % 3 !== 0);
  }
}

// lavender plant, with a trailing vine draped over the pot's edge --
// sits between the tea table and the cushion pile, giving that whole
// corner more vibe: upright lavender stalks for the tea-adjacent
// herbal note, plus a vine reusing the same draping technique as the
// pothos so it ties the greenery together across the space
// pothos -- hanging near the cushion pile, right side, several vines
// trailing down with some pooling gently on the ground
const pothosSpot = { x: 2825, hangY: 260 };

const lavenderSpot = { x: 2540 };
// Joshua tree, tucked into the ratroom's right side -- a real
// personal touch rather than a generic desert plant, with its actual
// distinctive silhouette: a thick, gnarled, irregularly-branching
// trunk, each branch ending in a spiky rosette of pointed leaves
// radiating outward, not a smooth-armed saguaro shape
const joshuaTreeSpot = { x: 1280 };
// a single old, dusty, ragged book pile for the ratroom -- distinct
// from the clean stacks in the oak scene: duller palette, torn page
// edges instead of clean rectangles, a couple of loose pages fallen
// nearby
const raggedPileSpot = { x: 1000 };
const raggedPileColors = ["#5a4a3a", "#4a4238", "#6a5648", "#544840"];
function drawRaggedBookPile(camX) {
  const px = raggedPileSpot.x - camX, py = gy;
  const count = 9;
  let dy = 0;
  for (let i = 0; i < count; i++) {
    const w = 24 + ((i * 7) % 10);
    const h = 5 + ((i * 3) % 3);
    const rot = (((i * 11) % 16) - 8) / 90; // modest tilt, close to the clean piles' own range
    const dx = ((i * 5) % 6) - 3;
    ctx.save();
    ctx.translate(px + dx, py - dy);
    ctx.rotate(rot);
    ctx.fillStyle = raggedPileColors[i % raggedPileColors.length];
    // a clear rectangular book, same shape language as the clean piles --
    // frayed wear lives only in a small notch torn out of one top corner,
    // not across the whole silhouette
    const notchSide = i % 2 === 0 ? 1 : -1;
    const notchW = w * 0.18, notchD = h * 0.5;
    ctx.beginPath();
    ctx.moveTo(-w / 2, 0);
    ctx.lineTo(-w / 2, -h);
    if (notchSide < 0) {
      ctx.lineTo(-w / 2 + notchW * 0.3, -h);
      ctx.lineTo(-w / 2 + notchW * 0.6, -h + notchD);
      ctx.lineTo(-w / 2 + notchW, -h);
    }
    ctx.lineTo(notchSide > 0 ? w / 2 - notchW : w / 2, -h);
    if (notchSide > 0) {
      ctx.lineTo(w / 2 - notchW * 0.6, -h + notchD);
      ctx.lineTo(w / 2 - notchW * 0.3, -h);
      ctx.lineTo(w / 2, -h);
    }
    ctx.lineTo(w / 2, 0);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.3)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.restore();
    dy += h;
  }
  // several loose pages, scattered flat near the base -- separate
  // fallen sheets, not another small folded stack
  const scatterPages = [
    { ox: -20, oy: -1, rot: -0.5, w: 8, skew: 0.6 },
    { ox: -15, oy: -0.5, rot: 0.3, w: 7, skew: -0.4 },
    { ox: 19, oy: -1.5, rot: 0.55, w: 8.5, skew: 0.5 },
    { ox: 24, oy: -0.5, rot: -0.25, w: 6.5, skew: -0.3 },
    { ox: 3, oy: -0.8, rot: 0.15, w: 7, skew: 0.4 }
  ];
  scatterPages.forEach((page, pi) => {
    ctx.save();
    ctx.translate(px + page.ox, py + page.oy);
    ctx.rotate(page.rot);
    // a single flat sheet, lying down -- skewed quad rather than a
    // folded/curled shape, so it reads as one dropped page
    ctx.fillStyle = pi % 2 === 0 ? "#c8bca4" : "#bcb096";
    ctx.beginPath();
    ctx.moveTo(-page.w, 0);
    ctx.lineTo(page.w, page.skew);
    ctx.lineTo(page.w - 0.6, page.skew - 1.6);
    ctx.lineTo(-page.w + 0.6, -1.6);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.lineWidth = 0.4;
    ctx.stroke();
    // faint text lines on this one sheet
    ctx.strokeStyle = "rgba(70,60,45,0.3)";
    ctx.lineWidth = 0.3;
    for (let ln = 0; ln < 2; ln++) {
      const ly = -1.1 + ln * 0.55;
      ctx.beginPath();
      ctx.moveTo(-page.w + 1.2, ly);
      ctx.lineTo(page.w - 1.4 - ln * 0.4, ly + page.skew * 0.3);
      ctx.stroke();
    }
    ctx.restore();
  });
}

function drawJoshuaTree(camX) {
  const px = joshuaTreeSpot.x - camX, py = gy;
  const trunkColor = "#6a5a42";
  const leafColor = "#5a8a48";
  const leafColorDark = "#4a7a3a";

  function drawRosette(cx, cy, angle, scale) {
    const spikeCount = 13;
    for (let i = 0; i < spikeCount; i++) {
      const a = angle + (i / (spikeCount - 1) - 0.5) * Math.PI * 0.9;
      const len = (10 + (i % 3) * 2) * scale;
      ctx.fillStyle = i % 2 === 0 ? leafColor : leafColorDark;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * len, cy + Math.sin(a) * len - len * 0.15);
      ctx.lineTo(cx + Math.cos(a + 0.12) * len * 0.3, cy + Math.sin(a + 0.12) * len * 0.3);
      ctx.closePath();
      ctx.fill();
    }
    // dead, drooping lower leaves -- the shaggy skirt real Joshua
    // trees have below each rosette as old leaves die back
    ctx.strokeStyle = "rgba(120,100,70,0.6)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const a = angle + Math.PI * 0.5 + (i - 2) * 0.25;
      ctx.beginPath();
      ctx.moveTo(cx, cy);
      ctx.lineTo(cx + Math.cos(a) * 10 * scale, cy + Math.sin(a) * 10 * scale);
      ctx.stroke();
    }
  }

  // draws a genuinely gnarled limb -- walks from base to tip building
  // up irregular bumps and knots along both edges via seeded jitter,
  // rather than the single smooth curve per side used before, which
  // never actually looked gnarled despite the comment claiming it did
  function drawGnarledLimb(x1, y1, x2, y2, baseWidth, tipWidth, seed) {
    const segments = 7;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.hypot(dx, dy);
    const ux = dx / len, uy = dy / len; // unit vector along the limb
    const nx = -uy, ny = ux; // perpendicular unit vector

    const leftPts = [], rightPts = [];
    for (let i = 0; i <= segments; i++) {
      const t = i / segments;
      const cx = x1 + dx * t, cy = y1 + dy * t;
      const width = (baseWidth + (tipWidth - baseWidth) * t) / 2;
      // seeded jitter -- irregular per-segment bump, different on
      // each side so the limb doesn't stay a uniform thickness
      const jL = Math.sin(seed + t * 11) * 1.8 + Math.sin(seed * 2.3 + t * 23) * 0.9;
      const jR = Math.sin(seed + 1.7 + t * 13) * 1.8 + Math.sin(seed * 1.9 + t * 19) * 0.9;
      leftPts.push({ x: cx + nx * (width + jL), y: cy + ny * (width + jL) });
      rightPts.push({ x: cx - nx * (width + jR), y: cy - ny * (width + jR) });
    }

    ctx.beginPath();
    ctx.moveTo(leftPts[0].x, leftPts[0].y);
    for (let i = 1; i < leftPts.length; i++) {
      const mid = { x: (leftPts[i - 1].x + leftPts[i].x) / 2, y: (leftPts[i - 1].y + leftPts[i].y) / 2 };
      ctx.quadraticCurveTo(leftPts[i - 1].x, leftPts[i - 1].y, mid.x, mid.y);
    }
    ctx.lineTo(leftPts[leftPts.length - 1].x, leftPts[leftPts.length - 1].y);
    for (let i = rightPts.length - 1; i >= 0; i--) {
      ctx.lineTo(rightPts[i].x, rightPts[i].y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#4a3e2c";
    ctx.lineWidth = 0.6;
    ctx.stroke();
  }

  // trunk -- thinner than before, now genuinely gnarled with irregular
  // knots along both edges instead of a single smooth taper
  ctx.fillStyle = trunkColor;
  drawGnarledLimb(px, py, px + 1, py - 51, 9, 4.5, 4.1);
  // bark texture -- a few short irregular horizontal marks
  ctx.strokeStyle = "rgba(74,62,44,0.5)";
  ctx.lineWidth = 0.6;
  [-38, -25, -12].forEach((dy, i) => {
    ctx.beginPath();
    ctx.moveTo(px - 3.5 + (i % 2), py + dy);
    ctx.lineTo(px + 2 - (i % 2), py + dy + 2);
    ctx.stroke();
  });
  drawRosette(px + 0.5, py - 51, -Math.PI / 2, 1.4);

  // right side branch -- gnarled, rosette drawn immediately after so
  // it's unambiguously on top of this specific limb
  ctx.fillStyle = trunkColor;
  drawGnarledLimb(px + 2, py - 34, px + 22, py - 53, 7, 3.5, 9.7);
  drawRosette(px + 22, py - 53, -Math.PI / 2 + 0.3, 1.1);

  // left side branch -- the third limb, balancing the composition,
  // splitting off lower down the trunk than the right one
  ctx.fillStyle = trunkColor;
  drawGnarledLimb(px - 2, py - 22, px - 21, py - 43, 6.5, 3.2, 15.3);
  drawRosette(px - 21, py - 43, -Math.PI / 2 - 0.35, 1.0);
}

// fireflies -- a small drifting group near the Joshua tree, each with
// its own gentle wander and independent on/off flicker timing, so the
// glow itself (not fixed eyes) is what makes these read as alive
const fireflies = [
  { baseX: 1260, baseY: 60, seed: 3, phaseOffset: 0 },
  { baseX: 1295, baseY: 85, seed: 17, phaseOffset: 0.6 },
  { baseX: 1315, baseY: 45, seed: 41, phaseOffset: 1.2 },
  { baseX: 1245, baseY: 90, seed: 23, phaseOffset: 1.8 },
  { baseX: 1330, baseY: 70, seed: 31, phaseOffset: 2.4 }
];
let fireflyT = 0;
function updateFireflies(deltaTime) {
  fireflyT += deltaTime * 1000;
}
function drawFireflies(camX) {
  const playerScreenX = player.x + player.width / 2 - camX;
  fireflies.forEach(f => {
    const wx = f.baseX + Math.sin(fireflyT * 0.0006 + f.seed) * 14;
    const wy = f.baseY + Math.cos(fireflyT * 0.0004 + f.seed * 1.3) * 10;
    const fx = wx - camX, fy = gy - wy;
    const dist = Math.hypot(fx - playerScreenX, fy - (gy - player.y));
    // the glow itself is always visible, no lamp needed -- fireflies
    // make their own light, so requiring an external lamp to see them
    // at all was backwards. Wider range than the lamp's own radius,
    // since a glowing point stands out more in real darkness.
    if (dist > 150) return;
    // independent flicker -- irregular on/off rather than a smooth
    // pulse, closer to how real fireflies actually blink
    const flickerCycle = (fireflyT * 0.001 + f.phaseOffset) % 3;
    const glowP = flickerCycle < 1.5 ? Math.sin((flickerCycle / 1.5) * Math.PI) : 0;
    if (glowP < 0.05) return; // fully off, don't even draw the dark body -- reads as truly absent, not just dim
    const grad = ctx.createRadialGradient(fx, fy, 0, fx, fy, 6);
    grad.addColorStop(0, `rgba(220,240,140,${0.9 * glowP})`);
    grad.addColorStop(0.5, `rgba(200,220,100,${0.4 * glowP})`);
    grad.addColorStop(1, "rgba(200,220,100,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(fx, fy, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = `rgba(230,250,180,${glowP})`;
    ctx.beginPath();
    ctx.arc(fx, fy, 1.3, 0, Math.PI * 2);
    ctx.fill();
    // actual bug shape, only visible with the lamp on and close
    // enough -- a small dark body and two wing shapes flanking the
    // glow, the detail the glow alone can't show in the dark
    if (lampLit && dist <= LAMP_LIGHT_RADIUS) {
      ctx.fillStyle = "rgba(30,26,16,0.85)";
      ctx.beginPath();
      ctx.ellipse(fx, fy, 1.6, 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(60,55,40,0.4)";
      const wingFlap = Math.sin(fireflyT * 0.02 + f.seed) * 0.3;
      [-1, 1].forEach(side => {
        ctx.save();
        ctx.translate(fx, fy);
        ctx.rotate(side * (0.5 + wingFlap));
        ctx.beginPath();
        ctx.ellipse(side * 2, 0, 1.8, 0.7, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      });
    }
  });
}

// dust motes -- small particles drifting within the lamp's light zone,
// each with its own offset from the player and gentle independent
// wander, only ever visible while the lamp is lit (they only catch
// light that's actually there, unlike the fireflies which glow on
// their own)
const dustMotes = Array.from({ length: 22 }, (_, i) => ({
  offsetAngle: (i / 22) * Math.PI * 2 + (i * 0.7) % 1,
  offsetDist: 20 + (i * 13) % 65,
  seed: i * 3.7,
  driftSeed: i * 1.9
}));
function drawDustMotes(camX) {
  if (!lampLit) return;
  const playerScreenX = player.x + player.width / 2 - camX;
  const playerScreenY = gy - player.y - player.height / 2;
  dustMotes.forEach(d => {
    const baseX = playerScreenX + Math.cos(d.offsetAngle) * d.offsetDist;
    const baseY = playerScreenY + Math.sin(d.offsetAngle) * d.offsetDist * 0.6;
    const dist = Math.hypot(baseX - playerScreenX, baseY - playerScreenY);
    if (dist > LAMP_LIGHT_RADIUS * 0.85) return; // stay a little inside the lit edge, not right at the boundary
    const driftX = Math.sin(fireflyT * 0.0003 + d.driftSeed) * 6;
    const driftY = Math.cos(fireflyT * 0.0002 + d.driftSeed * 1.4) * 4;
    const dx = baseX + driftX, dy = baseY + driftY;
    const twinkle = 0.15 + 0.15 * Math.sin(fireflyT * 0.0015 + d.seed);
    ctx.fillStyle = `rgba(230,220,190,${twinkle})`;
    ctx.beginPath();
    ctx.arc(dx, dy, 0.9, 0, Math.PI * 2);
    ctx.fill();
  });
}

// moth -- flutters gradually closer to the player the longer the lamp
// stays continuously lit, easing back out (not snapping) once it goes
// off, since a moth vanishing instantly would read as a bug rather
// than losing interest
const mothState = { approachT: 0, wanderSeed: 7.3 };
const MOTH_MAX_APPROACH_MS = 16000;
function updateMoth(deltaTime) {
  if (currentScene !== "ratroom") return;
  if (lampLit) {
    mothState.approachT = Math.min(MOTH_MAX_APPROACH_MS, mothState.approachT + deltaTime * 1000);
  } else {
    mothState.approachT = Math.max(0, mothState.approachT - deltaTime * 1000 * 0.6); // eases back out slower than it approached
  }
}
function drawMoth(camX) {
  if (mothState.approachT <= 0 || !lampLit) return;
  const playerScreenX = player.x + player.width / 2 - camX;
  const playerScreenY = gy - player.y - player.height / 2;
  const approachP = mothState.approachT / MOTH_MAX_APPROACH_MS;
  const dist = 130 - (130 - 22) * approachP; // starts far, flutters down to a close hover
  const wanderAngle = fireflyT * 0.0006 + mothState.wanderSeed;
  const flutterX = Math.sin(wanderAngle) * dist;
  const flutterY = Math.cos(wanderAngle * 1.3) * dist * 0.5 - 20;
  const mx = playerScreenX + flutterX, my = playerScreenY + flutterY;
  ctx.save();
  ctx.translate(mx, my);
  const bodyAngle = Math.atan2(flutterY, flutterX);
  ctx.rotate(bodyAngle + Math.PI / 2);
  ctx.fillStyle = "rgba(210,200,170,0.75)";
  ctx.beginPath();
  ctx.ellipse(0, 0, 1.2, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();
  const flap = Math.sin(fireflyT * 0.03 + mothState.wanderSeed) * 0.5 + 0.6;
  ctx.fillStyle = "rgba(190,180,150,0.55)";
  [-1, 1].forEach(side => {
    ctx.save();
    ctx.rotate(side * flap);
    ctx.beginPath();
    ctx.ellipse(side * 3, -0.5, 3, 1.6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  ctx.restore();
}
function drawLavenderPlant(camX) {
  if (!oakLamp.collected) return; // same unlock condition as the rest of this cozy corner
  const px = lavenderSpot.x - camX, py = gy;
  // small terracotta pot
  ctx.fillStyle = "#a85838";
  ctx.beginPath();
  ctx.moveTo(px - 12, py);
  ctx.lineTo(px + 12, py);
  ctx.lineTo(px + 10, py - 16);
  ctx.lineTo(px - 10, py - 16);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#7a3a20";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.fillStyle = "#3a2818";
  ctx.beginPath();
  ctx.ellipse(px, py - 16, 10, 2.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // upright lavender stalks -- minty gray-green stems (lavender's
  // actual signature color, not a muted olive), more of them for a
  // genuinely bushy look, each topped with a denser cluster of
  // smaller purple buds
  const stalkAngles = [-0.4, -0.28, -0.15, -0.02, 0.1, 0.22, 0.32, -0.08, 0.05];
  const stalkHeights = [40, 50, 44, 52, 38, 46, 42, 48, 36];
  stalkAngles.forEach((a, i) => {
    ctx.save();
    ctx.translate(px, py - 16);
    ctx.rotate(a * 0.4);
    const h = stalkHeights[i];
    ctx.strokeStyle = "#9cc49c";
    ctx.lineWidth = 1.1;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.quadraticCurveTo(-1, -h * 0.5, 0, -h);
    ctx.stroke();
    // bud cluster -- smaller still, with horizontal jitter and
    // alternating shades so individual buds actually read as texture
    // rather than blending into a smooth vertical cylinder
    const budColors = ["#7a5aa8", "#8a6ab8", "#9a7ac8"];
    for (let b = 0; b < 11; b++) {
      const bt = b / 10;
      const jitterX = ((b * 37) % 7 - 3) * 0.35;
      ctx.fillStyle = budColors[b % 3];
      ctx.beginPath();
      ctx.ellipse(jitterX, -h + bt * h * 0.32, 0.6, 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  });

  // trailing vine, draped over the pot's edge and hanging down --
  // reuses the pothos technique for a consistent look
  drawPothosVine(ctx, px + 9, py - 15, 34, 4, "#5a8a4a", 7, 0, 1, 1);
}
// snake plant -- tall, stiff upright blades with dark mottled banding,
// near the entry door as a welcoming statement piece
const snakePlantSpot = { x: 760, y: 0 };
const entrywayFernSpot = { x: 420, y: 0 };
function drawEntrywayFern(camX) {
  const px = entrywayFernSpot.x - camX, py = gy - entrywayFernSpot.y;
  // small terracotta pot, simpler than the snake plant's since this
  // is a smaller fill-in piece for the entryway rather than a set piece
  ctx.fillStyle = "#8a4a2e";
  ctx.beginPath();
  ctx.moveTo(px - 12, py); ctx.lineTo(px + 12, py); ctx.lineTo(px + 10, py - 16); ctx.lineTo(px - 10, py - 16);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#5a2c18";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#3a2818";
  ctx.beginPath();
  ctx.ellipse(px, py - 16, 10, 2.6, 0, 0, Math.PI * 2);
  ctx.fill();

  const fronds = [-0.55, -0.25, 0, 0.25, 0.55];
  const frondLens = [38, 48, 52, 46, 36];
  fronds.forEach((a, i) => {
    ctx.save();
    ctx.translate(px, py - 16);
    ctx.rotate(a * 0.5);
    const len = frondLens[i];
    ctx.fillStyle = i % 2 === 0 ? "#3a6a34" : "#4a7a3e";
    ctx.beginPath();
    ctx.moveTo(-1.5, 0);
    ctx.quadraticCurveTo(-2.5, -len * 0.5, -0.5, -len);
    ctx.quadraticCurveTo(0, -len * 1.02, 0.5, -len);
    ctx.quadraticCurveTo(2.5, -len * 0.5, 1.5, 0);
    ctx.closePath();
    ctx.fill();
    // small leaflet notches along the frond, since a fern reads as
    // feathery rather than a solid blade
    ctx.strokeStyle = "rgba(20,45,20,0.4)";
    ctx.lineWidth = 0.5;
    for (let ly = -len * 0.15; ly > -len * 0.9; ly -= len * 0.12) {
      ctx.beginPath();
      ctx.moveTo(-1.2, ly); ctx.lineTo(-2.4, ly - 3);
      ctx.moveTo(1.2, ly); ctx.lineTo(2.4, ly - 3);
      ctx.stroke();
    }
    ctx.restore();
  });
}
function drawMonsteraLeaf(ctx, x, y, size, rotation, color, seed, holeColor) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.bezierCurveTo(size * 0.55, -size * 0.9, size * 0.7, -size * 0.3, size * 0.62, 0);
  ctx.bezierCurveTo(size * 0.7, size * 0.15, size * 0.5, size * 0.35, size * 0.55, size * 0.6);
  ctx.bezierCurveTo(size * 0.3, size * 0.5, size * 0.15, size * 0.65, 0, size * 0.75);
  ctx.bezierCurveTo(-size * 0.15, size * 0.65, -size * 0.3, size * 0.5, -size * 0.55, size * 0.6);
  ctx.bezierCurveTo(-size * 0.5, size * 0.35, -size * 0.7, size * 0.15, -size * 0.62, 0);
  ctx.bezierCurveTo(-size * 0.7, -size * 0.3, -size * 0.55, -size * 0.9, 0, -size);
  ctx.closePath();
  ctx.fill();

  // real holes -- filled with an approximation of the oak room's own
  // background tone instead of destination-out, which was erasing
  // through everything already painted on the canvas (the whole room
  // background), not just this leaf shape, hence the stray white.
  // Pattern genuinely varies per leaf via the seed.
  ctx.fillStyle = holeColor || "#4a3420";
  const holeCount = 3 + (seed % 2);
  for (let i = 0; i < holeCount; i++) {
    const a = (i / holeCount) * Math.PI * 1.3 - Math.PI * 0.55 + (seed % 5) * 0.1;
    const r = size * (0.25 + ((seed + i * 3) % 5) * 0.03);
    const hx = Math.sin(a) * size * 0.32;
    const hy = -size * 0.15 + Math.cos(a) * size * 0.28 + (i % 2) * size * 0.15;
    ctx.beginPath();
    ctx.ellipse(hx, hy, r * 0.4, r * 0.65, a, 0, Math.PI * 2);
    ctx.fill();
  }
  const notchCount = 3 + (seed % 2);
  for (let i = 0; i < notchCount; i++) {
    const side = i % 2 === 0 ? -1 : 1;
    const t = 0.15 + ((seed + i * 7) % 6) * 0.12;
    const nx = side * size * 0.6;
    const ny = -size * 0.5 + t * size;
    ctx.beginPath();
    ctx.ellipse(nx, ny, size * 0.08, size * 0.18, Math.atan2(ny, nx), 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = "rgba(255,255,255,0.2)";
  ctx.lineWidth = size * 0.025;
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.9); ctx.lineTo(0, size * 0.7);
  ctx.moveTo(0, -size * 0.3); ctx.lineTo(size * 0.4, -size * 0.05);
  ctx.moveTo(0, 0); ctx.lineTo(-size * 0.42, size * 0.15);
  ctx.stroke();
  ctx.restore();
}


// monstera -- shorter, fuller, drooping leaves at irregular angles,
// near the nook but offset so it doesn't overlap the sitting area
const monsteraSpot = { x: 1640, y: 0 };
function drawHeartVine(ctx, startX, startY, length, waveAmp, seed, emergeDir) {
  const points = [];
  const segments = 16;
  const EMERGE_END = 0.3;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const u = Math.min(t / EMERGE_END, 1);
    const emergeBump = Math.pow(Math.sin(Math.PI * u), 2); // zero slope at both ends -- smooth candy-cane hook, no kink
    const x = startX + emergeDir * 13 * emergeBump + Math.sin(t * 3.5 + seed) * waveAmp * (0.2 + t * 0.8);
    const y = startY + t * (length + 7);
    points.push({ x, y });
  }
  ctx.strokeStyle = "rgba(150,120,150,0.5)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
  for (let i = 3; i < points.length; i += 4) {
    const p = points[i];
    drawHeartLeaf(ctx, p.x, p.y, 6, Math.PI, i % 8 === 0 ? "#8a7a9a" : "#9a8aac", "rgba(200,180,210,0.3)");
  }
}

// string of hearts -- small hanging pot, higher up and right of the
// circle painting, thin sparse wiry vines
const heartsSpot = { x: 1853, hangY: 235 };
function drawStringOfHearts(camX) {
  const px = heartsSpot.x - camX, py = gy - heartsSpot.hangY;
  // small round hanging pot, distinct shape from the others -- shortened
  ctx.strokeStyle = "#4a3018";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(px - 3, py - 12); ctx.lineTo(px - 3, py - 7);
  ctx.moveTo(px + 3, py - 12); ctx.lineTo(px + 3, py - 7);
  ctx.stroke();
  // single consistent base color, not a partial arc that leaves a
  // mismatched wedge showing through
  ctx.fillStyle = "#5a4048";
  ctx.beginPath();
  ctx.arc(px, py, 11, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#3a2028";
  ctx.lineWidth = 1;
  ctx.stroke();
  // proper offset highlight, a genuine closed shape, not an auto-closed wedge
  ctx.fillStyle = "rgba(140,110,120,0.4)";
  ctx.beginPath();
  ctx.ellipse(px - 3, py - 4, 5, 4, -0.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#3a2818";
  ctx.beginPath();
  ctx.ellipse(px, py - 4, 8, 2.4, 0, 0, Math.PI * 2);
  ctx.fill();

  const vines = [
    [-6, -5, 155, 15, 0.3, -1], [0, -5, 190, 18, 2.4, 1], [7, -5, 130, 12, 4.6, 1]
  ];
  vines.forEach(v => {
    drawHeartVine(ctx, px + v[0], py + v[1], v[2], v[3], v[4], v[5]);
  });
}

function drawMonstera(camX) {
  const px = monsteraSpot.x - camX, py = gy - monsteraSpot.y;

  // ground-contact shadow -- the pot's base narrows to a small point,
  // which reads as floating without something anchoring it visually
  ctx.fillStyle = "rgba(0,0,0,0.3)";
  ctx.beginPath();
  ctx.ellipse(px, py + 1, 10, 3, 0, 0, Math.PI * 2);
  ctx.fill();

  // dark yellow oval bulb pot -- narrow at the base, wide in the
  // middle, narrowing again at the mouth, with very thin horizontal
  // yellow-brown lines
  ctx.fillStyle = "#8a7020";
  ctx.beginPath();
  ctx.moveTo(px - 6, py);
  ctx.quadraticCurveTo(px - 20, py - 4, px - 19, py - 16);
  ctx.quadraticCurveTo(px - 17, py - 27, px - 9, py - 31);
  ctx.lineTo(px - 10, py - 34);
  ctx.lineTo(px + 10, py - 34);
  ctx.lineTo(px + 9, py - 31);
  ctx.quadraticCurveTo(px + 17, py - 27, px + 19, py - 16);
  ctx.quadraticCurveTo(px + 20, py - 4, px + 6, py);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#5a4a10";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  ctx.strokeStyle = "rgba(90,68,20,0.6)";
  ctx.lineWidth = 0.5;
  [-24, -18, -11, -4].forEach(dy => {
    ctx.beginPath();
    ctx.moveTo(px - 18, py + dy);
    ctx.lineTo(px + 18, py + dy);
    ctx.stroke();
  });
  // dirt in the mouth
  ctx.fillStyle = "#3a2818";
  ctx.beginPath();
  ctx.ellipse(px, py - 33, 9, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // bigger leaves with real weight variation -- a couple noticeably
  // larger and heavier, hanging lower under their own weight, rest
  // smaller, rather than uniform sizing
  const leaves = [
    [-0.6, 38, 10, 11, null], [-0.3, 50, 14, 17, null], [-0.05, 42, 9, 22, null],
    [0.25, 56, 13, 29, null], [0.5, 46, 10, 33, null], [0.75, 52, 15, 41, null],
    [0.95, 40, 9, 46, null]
  ];
  leaves.forEach(([angle, stemLen, leafSize, seed, holeColor]) => {
    const bx = px, by = py - 33;
    // emergence bulge -- the stem curves outward over the pot's rim
    // right at the base before rising, rather than starting flat
    const bulgeX = bx + Math.sin(angle) * 10;
    const bulgeY = by + 4;
    const tipX = bx + Math.sin(angle) * stemLen;
    const tipY = by - Math.cos(angle) * stemLen * 0.85;
    // twisty-turny path -- several short segments with an alternating
    // perpendicular wobble, instead of one smooth curve
    const segments = 5;
    const perpX = Math.cos(angle), perpY = Math.sin(angle);
    ctx.strokeStyle = "#3a6a34";
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.quadraticCurveTo(bulgeX, bulgeY, bx + Math.sin(angle) * 14, by - Math.cos(angle) * 10);
    let prevX = bx + Math.sin(angle) * 14, prevY = by - Math.cos(angle) * 10;
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const wobble = Math.sin(t * Math.PI * 2.4 + seed) * 4 * (1 - t * 0.4);
      const px2 = bx + (tipX - bx) * t + perpX * wobble;
      const py2 = by + (tipY - by) * t + perpY * wobble;
      ctx.lineTo(px2, py2);
      prevX = px2; prevY = py2;
    }
    ctx.stroke();
    drawMonsteraLeaf(ctx, prevX, prevY, leafSize, angle * 0.5, "#3a7a3a", seed, holeColor);
  });

  // a genuine gem-cut diamond -- flat top table facet, symmetric
  // angled sides, pointed bottom, with facet lines and a sparkle
  // highlight for real gem-like read, rather than a simple irregular
  // quadrilateral
  ctx.fillStyle = "#e08838";
  ctx.beginPath();
  ctx.moveTo(px - 1.5, py - 34.5); // top-left of the flat table facet
  ctx.lineTo(px + 2, py - 34.5); // top-right of the table facet
  ctx.lineTo(px + 4.8, py - 32); // right shoulder
  ctx.lineTo(px + 0.25, py - 27.5); // bottom point
  ctx.lineTo(px - 4.3, py - 32); // left shoulder
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(140,70,20,0.6)";
  ctx.lineWidth = 0.4;
  ctx.stroke();
  // facet lines from the table's corners down to the point, the
  // detail that actually reads as a cut gem rather than a flat shape
  ctx.beginPath();
  ctx.moveTo(px - 1.5, py - 34.5); ctx.lineTo(px + 0.25, py - 27.5);
  ctx.moveTo(px + 2, py - 34.5); ctx.lineTo(px + 0.25, py - 27.5);
  ctx.stroke();
  // small sparkle highlight on the table facet
  ctx.fillStyle = "rgba(255,235,200,0.75)";
  ctx.beginPath();
  ctx.moveTo(px - 0.6, py - 34.2);
  ctx.lineTo(px, py - 33.4);
  ctx.lineTo(px + 0.6, py - 34.2);
  ctx.lineTo(px, py - 33.9);
  ctx.closePath();
  ctx.fill();
}

function drawPearlVine(ctx, startX, startY, length, waveAmp, seed, emergeDir) {
  const points = [];
  const segments = 20;
  const EMERGE_END = 0.3;
  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const u = Math.min(t / EMERGE_END, 1);
    const emergeBump = Math.pow(Math.sin(Math.PI * u), 2); // zero slope at both ends -- smooth candy-cane hook, no kink
    const x = startX + emergeDir * 16 * emergeBump + Math.sin(t * 4 + seed) * waveAmp * (0.2 + t * 0.8);
    const y = startY + t * (length + 9);
    points.push({ x, y });
  }
  ctx.strokeStyle = "rgba(30,80,55,0.55)";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();
  points.forEach((p, i) => {
    if (i === 0) return;
    ctx.fillStyle = i % 3 === 0 ? "#1e5a3e" : "#2a6a4a";
    ctx.beginPath();
    ctx.arc(p.x, p.y, 1.8 - (i / points.length) * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.15)";
    ctx.beginPath();
    ctx.arc(p.x - 0.5, p.y - 0.5, 0.5, 0, Math.PI * 2);
    ctx.fill();
  });
}

// string of pearls -- small hanging pot, tucked in the gap between the
// entry door and the water-bird painting
const pearlsSpot = { x: 408, hangY: 245 };
function drawStringOfPearls(camX) {
  const px = pearlsSpot.x - camX, py = gy - pearlsSpot.hangY;
  // distinct rounded bowl, not the shared trapezoid shape -- shrunk down further
  ctx.fillStyle = "#6a5040";
  ctx.beginPath();
  ctx.ellipse(px, py + 4, 8, 5.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#8a6a52";
  ctx.beginPath();
  ctx.ellipse(px, py + 1.5, 8, 4.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#4a3628";
  ctx.lineWidth = 0.7;
  ctx.stroke();
  ctx.fillStyle = "#3a2818";
  ctx.beginPath();
  ctx.ellipse(px, py, 7.2, 2, 0, 0, Math.PI * 2);
  ctx.fill();

  const pearlSeeds = [[0.3, -1], [1.2, 1], [2.4, -1], [3.1, 1], [4.0, -1], [4.9, 1], [5.8, -1]];
  pearlSeeds.forEach(([s, dir], i) => {
    drawPearlVine(ctx, px - 6 + i * 2, py - 1.5, 85 + (i % 3) * 24, 10 + (i % 4) * 2, s, dir);
  });
}

function drawSnakePlant(camX) {
  const px = snakePlantSpot.x - camX, py = gy - snakePlantSpot.y;
  // tall cylindrical ceramic pot, distinct dark charcoal-blue glaze
  ctx.fillStyle = "#3a4048";
  ctx.beginPath();
  ctx.moveTo(px - 18, py); ctx.lineTo(px + 18, py); ctx.lineTo(px + 16, py - 30); ctx.lineTo(px - 16, py - 30);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#1e2226";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.strokeStyle = "rgba(90,110,120,0.35)";
  ctx.lineWidth = 0.5;
  [-24, -16, -8].forEach(dy => {
    ctx.beginPath();
    ctx.moveTo(px - 15.5, py + dy); ctx.lineTo(px + 15.5, py + dy);
    ctx.stroke();
  });
  // dirt at the top
  ctx.fillStyle = "#3a2818";
  ctx.beginPath();
  ctx.ellipse(px, py - 30, 15, 3.5, 0, 0, Math.PI * 2);
  ctx.fill();

  const bladeAngles = [-0.5, -0.28, -0.08, 0.1, 0.3, 0.5];
  const bladeHeights = [80, 100, 115, 105, 88, 73];
  bladeAngles.forEach((a, i) => {
    ctx.save();
    ctx.translate(px, py - 30);
    ctx.rotate(a * 0.35);
    const h = bladeHeights[i];
    ctx.fillStyle = i % 2 === 0 ? "#3a6a34" : "#4a7a3e";
    ctx.beginPath();
    ctx.moveTo(-2.5, 0);
    ctx.quadraticCurveTo(-3.5, -h * 0.5, -1, -h);
    ctx.quadraticCurveTo(0, -h * 1.03, 1, -h);
    ctx.quadraticCurveTo(3.5, -h * 0.5, 2.5, 0);
    ctx.closePath();
    ctx.fill();
    ctx.save();
    ctx.clip();
    ctx.fillStyle = "rgba(20,45,20,0.55)";
    for (let by = -h * 0.1; by > -h * 0.95; by -= h * 0.13) {
      const bw = 3 - Math.abs(by / h) * 1.5;
      ctx.beginPath();
      ctx.ellipse(Math.sin(by * 0.3) * 0.8, by, bw, h * 0.045, 0.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.strokeStyle = "rgba(230,225,180,0.6)";
    ctx.lineWidth = 0.6;
    ctx.beginPath();
    ctx.moveTo(-2.2, -1.5); ctx.lineTo(-2, -h * 0.98);
    ctx.moveTo(2.2, -1.5); ctx.lineTo(2, -h * 0.98);
    ctx.stroke();
    ctx.restore();
  });
}

function drawPothos(camX) {
  if (!oakLamp.collected) return; // same unlock condition as the cushion pile it sits beside
  const px = pothosSpot.x - camX, py = gy - pothosSpot.hangY;
  // woven hanging basket -- rounded, distinct from the other pots
  ctx.fillStyle = "#c9a878";
  ctx.beginPath();
  ctx.ellipse(px, py + 12, 22, 14, 0, 0, Math.PI);
  ctx.fill();
  ctx.strokeStyle = "#8a6a48";
  ctx.lineWidth = 0.7;
  for (let wy = 2; wy <= 20; wy += 4) {
    ctx.beginPath();
    const wr = 22 * Math.sin(Math.acos(Math.min(1, wy / 14)));
    ctx.moveTo(px - wr, py + 12 - (14 - wy));
    ctx.lineTo(px + wr, py + 12 - (14 - wy));
    ctx.stroke();
  }
  // dirt and rim at the top opening
  ctx.fillStyle = "#3a2818";
  ctx.beginPath();
  ctx.ellipse(px, py, 20, 6, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#8a6a48";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.ellipse(px, py, 22, 7, 0, 0, Math.PI * 2);
  ctx.stroke();
  const vines = [
    [-12, 193, 18, 0.5, false, 0, 1, -1], [-4, 246, 20, 1.4, true, 28, 1, -1],
    [4, 246, 16, 2.6, false, 0, 0.6, 1], [12, 251, 22, 3.5, true, 32, 1.3, 1],
    [20, 246, 14, 4.7, false, 0, 0.9, 1]
  ];
  vines.forEach((v, i) => {
    drawPothosVine(ctx, px + v[0], py + 2, v[1], v[2], i % 2 === 0 ? "#4a823c" : "#589144", v[3], v[5], v[6], v[7]);
  });
}

function drawFeatherShape(ctx, x, y, size, rotation) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  // the vane -- one continuous filled silhouette, not sparse lines.
  // Classic quill shape: pointed tip, asymmetric sides (one wider than
  // the other, like a real feather), soft rounded base.
  function traceVane() {
    ctx.beginPath();
    ctx.moveTo(0, -size);
    ctx.quadraticCurveTo(-size * 0.32, -size * 0.55, -size * 0.34, -size * 0.05);
    ctx.quadraticCurveTo(-size * 0.3, size * 0.4, -size * 0.1, size * 0.85);
    ctx.quadraticCurveTo(0, size * 1.05, 0, size);
    ctx.quadraticCurveTo(0, size * 1.05, size * 0.14, size * 0.82);
    ctx.quadraticCurveTo(size * 0.4, size * 0.35, size * 0.42, -size * 0.1);
    ctx.quadraticCurveTo(size * 0.4, -size * 0.55, 0, -size);
    ctx.closePath();
  }

  // base fill, then clipped horizontal bands -- black/white with a
  // touch of red, echoing the woodpecker's own coloring
  ctx.save();
  traceVane();
  ctx.clip();
  const bands = [
    { from: -1.1, to: -0.5, color: "#f0ead8" },
    { from: -0.5, to: -0.05, color: "#2b2b2b" },
    { from: -0.05, to: 0.25, color: "#c9382a" },
    { from: 0.25, to: 1.1, color: "#3a3a3a" }
  ];
  bands.forEach(b => {
    ctx.fillStyle = b.color;
    ctx.fillRect(-size, b.from * size, size * 2, (b.to - b.from) * size);
  });
  // fine barb-texture lines within the vane, subtle, suggesting the
  // feathery grain without being the primary structure
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = size * 0.02;
  for (let t = -0.9; t <= 1.0; t += 0.14) {
    ctx.beginPath();
    ctx.moveTo(-size * 0.4, t * size);
    ctx.lineTo(size * 0.4, t * size + size * 0.06);
    ctx.stroke();
  }
  ctx.restore();

  // vane outline
  traceVane();
  ctx.strokeStyle = "rgba(20,16,10,0.5)";
  ctx.lineWidth = size * 0.04;
  ctx.stroke();

  // central shaft/rachis, on top of the fill
  ctx.strokeStyle = "#e8ddc0";
  ctx.lineWidth = size * 0.05;
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.95);
  ctx.lineTo(0, size * 0.95);
  ctx.stroke();

  ctx.restore();
}

function drawWormShape(ctx, x, y, size, rotation) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);
  ctx.strokeStyle = "#c9705a";
  ctx.lineWidth = size * 0.5;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(-size * 0.7, size * 0.2);
  ctx.quadraticCurveTo(-size * 0.2, -size * 0.5, 0, 0);
  ctx.quadraticCurveTo(size * 0.2, size * 0.5, size * 0.7, -size * 0.1);
  ctx.stroke();
  ctx.restore();
}

function drawLampShape(ctx, x, y, size, rotation, lit) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(rotation);

  // wide, sturdy base -- a classic hurricane lantern's footprint.
  // Bright brass, not dark metal, so it doesn't blend into the room's
  // dark wood-toned background.
  ctx.fillStyle = "#8a6a2a";
  ctx.beginPath();
  ctx.ellipse(0, size * 0.7, size * 0.5, size * 0.14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#b8923a";
  ctx.beginPath();
  ctx.moveTo(-size * 0.42, size * 0.6);
  ctx.lineTo(size * 0.42, size * 0.6);
  ctx.lineTo(size * 0.3, size * 0.25);
  ctx.lineTo(-size * 0.3, size * 0.25);
  ctx.closePath();
  ctx.fill();

  // round glass globe, the body of the lantern
  ctx.fillStyle = lit ? "rgba(255, 220, 140, 0.9)" : "rgba(230, 238, 245, 0.75)";
  ctx.beginPath();
  ctx.ellipse(0, size * 0.05, size * 0.4, size * 0.35, 0, 0, Math.PI * 2);
  ctx.fill();

  // small flame, only when lit
  if (lit) {
    ctx.fillStyle = "#f0a838";
    ctx.beginPath();
    ctx.moveTo(0, size * 0.2);
    ctx.quadraticCurveTo(size * 0.14, size * 0.02, 0, -size * 0.15);
    ctx.quadraticCurveTo(-size * 0.14, size * 0.02, 0, size * 0.2);
    ctx.closePath();
    ctx.fill();
  }

  // metal cage struts around the globe -- classic lantern-frame look
  ctx.strokeStyle = "#c9a860";
  ctx.lineWidth = size * 0.06;
  [-0.28, 0, 0.28].forEach(dx => {
    ctx.beginPath();
    ctx.moveTo(dx * size, size * 0.32);
    ctx.lineTo(dx * 0.6 * size, -size * 0.22);
    ctx.stroke();
  });
  ctx.beginPath();
  ctx.ellipse(0, size * 0.05, size * 0.4, size * 0.35, 0, 0, Math.PI * 2);
  ctx.stroke();

  // top cap where the globe meets the handle
  ctx.fillStyle = "#8a6a2a";
  ctx.beginPath();
  ctx.ellipse(0, -size * 0.28, size * 0.22, size * 0.08, 0, 0, Math.PI * 2);
  ctx.fill();

  // large handle loop -- prominent and clearly grabbable, the defining
  // feature of an old-school carry lantern
  ctx.strokeStyle = "#c9a860";
  ctx.lineWidth = size * 0.11;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.arc(0, -size * 0.5, size * 0.42, Math.PI * 1.08, Math.PI * 1.92);
  ctx.stroke();

  ctx.restore();
}

/* ======================================================
   WORM UNDER A ROCK — found at ground level near the
   ground-tier right vine. Two-stage: space lifts the rock,
   space again collects the wiggling worm underneath.
   ====================================================== */
const wormRock = {
  x: 2530,
  lifted: false,
  liftProgress: 0, // 0 = resting flat, 1 = fully tipped up on its edge
  settling: false, // true once worm is collected, animating back down
  wormCollected: false,
  wormCollecting: false
};

function updateWormRock() {
  if (wormRock.wormCollecting) {
    if (!wormRock.settling) wormRock.settling = true;
    if (wormRock.liftProgress > 0) {
      wormRock.liftProgress = Math.max(wormRock.liftProgress - 0.03, 0);
    }
    return;
  }

  if (!wormRock.lifted) {
    if (keys.spaceJustPressed && isPlayerNear(wormRock.x, 10, 24, 18, 18)) {
      wormRock.lifted = true;
    }
    return;
  }

  if (wormRock.liftProgress < 1) {
    wormRock.liftProgress = Math.min(wormRock.liftProgress + 0.04, 1);
  }

  if (keys.spaceJustPressed && isPlayerNear(wormRock.x, 8, 24, 15, 15)) {
    wormRock.wormCollecting = true;
    startCollectAnimation({ x: wormRock.x, y: gy - 8, size: 7, rotation: 0 }, "worm");
  }
}

function drawWormRock(camX) {
  const rx = wormRock.x - camX;

  if (wormRock.lifted && !wormRock.wormCollecting) {
    // more wiggly, genuinely looks embedded — most of it still "in" the
    // ground, only the top curling up and out
    const t = performance.now() * 0.005;
    const wiggle1 = Math.sin(t) * 4;
    const wiggle2 = Math.sin(t * 1.7 + 1) * 3;
    ctx.strokeStyle = "#c9705a";
    ctx.lineWidth = 3.5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(rx - 20, gy + 3); // starts below ground level — genuinely embedded, under the side that's now lifting
    ctx.quadraticCurveTo(rx - 22 + wiggle1, gy - 6, rx - 18 + wiggle2, gy - 9);
    ctx.quadraticCurveTo(rx - 14 + wiggle1 * 0.6, gy - 12, rx - 16 - wiggle2 * 0.4, gy - 15);
    ctx.stroke();
  }

  // rock pivots around its grounded left edge — rotates up like tipping
  // over, rather than floating straight up. Settles back down (liftProgress
  // decaying) once the worm is collected, instead of staying suspended.
  const lift = wormRock.liftProgress;
  const pivotX = rx + 20, pivotY = gy;
  ctx.save();
  ctx.translate(pivotX, pivotY);
  ctx.rotate(lift * 0.9);
  ctx.fillStyle = "#5a5548";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-4, -14);
  ctx.lineTo(-14, -20);
  ctx.lineTo(-28, -18);
  ctx.lineTo(-38, -9);
  ctx.lineTo(-40, 2);
  ctx.lineTo(-32, 6);
  ctx.lineTo(-10, 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#3a3830";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-14, -20);
  ctx.lineTo(-17, -6);
  ctx.moveTo(-28, -18);
  ctx.lineTo(-24, -4);
  ctx.stroke();

  if (!wormRock.lifted) {
    const glintT = performance.now() * 0.003;
    [[-12, -10, 0], [-25, -13, 1.4], [-18, -3, 2.8]].forEach(([gx, gyOff, phase]) => {
      const twinkle = (Math.sin(glintT + phase) + 1) / 2;
      if (twinkle > 0.5) {
        ctx.fillStyle = `rgba(220,230,255,${(twinkle - 0.5) * 1.4})`;
        ctx.beginPath();
        ctx.arc(gx, gyOff, 1.3, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }
  ctx.restore();
}

const seesawProjectile = { active: false, type: null, x: 0, y: 0, vx: 0, vy: 0 };

function launchSeesawItem(itemType, energy) {
  const scale = energy / 0.5;
  seesawProjectile.active = true;
  seesawProjectile.type = itemType;
  seesawProjectile.x = seesaw.x - 90;
  seesawProjectile.y = 64; // was 10 -- near ground, well below where the worm actually sits on the seat (~64, matching the seesaw's base surface height)
  seesawProjectile.vx = 1.2 * scale; // tightened and slowed further — less sweeping, more direct arc
  seesawProjectile.vy = 8 * scale;
}

function updateSeesawProjectile() {
  if (!seesawProjectile.active) return;
  seesawProjectile.x += seesawProjectile.vx;
  seesawProjectile.y += seesawProjectile.vy;
  seesawProjectile.vy -= 0.1;

  if (seesawProjectile.type === "worm" && !woodpecker.fed &&
      Math.abs(seesawProjectile.x - woodpeckerPlatform.x) < woodpeckerPlatform.width / 2 + 8 &&
      Math.abs(seesawProjectile.y - woodpeckerPlatform.heightAboveGround) < 12) {
    seesawProjectile.active = false;
    // snap precisely to the nest's actual visual center — previously
    // could register as "landed" anywhere within a fairly wide window,
    // which could visually look like it landed near/past the nest
    // rather than genuinely in it
    seesawProjectile.x = woodpeckerPlatform.x;
    seesawProjectile.y = woodpeckerPlatform.heightAboveGround;
    woodpecker.fed = true;
    woodpecker.danceT = -1;
    woodpecker.landedT = 0;
    woodpecker.eatingT = 0;
    return;
  }

  if (seesawProjectile.y <= 0) {
    seesawProjectile.active = false;
  }
}

function drawSeesawProjectile(camX) {
  if (!seesawProjectile.active) return;
  const px = seesawProjectile.x - camX;
  const py = gy - seesawProjectile.y;
  if (seesawProjectile.type === "worm") {
    drawWormShape(ctx, px, py, 7, Math.atan2(-seesawProjectile.vy, seesawProjectile.vx));
  }
}

/* ======================================================
   BABY WOODPECKER — lives on a branch-perch near the seesaw,
   reachable only via the worm catapult. Verified: height 290
   is well above the double-jump-safe threshold (160.6), and
   matches the seesaw catapult's real verified arc.
   ====================================================== */
const woodpeckerPlatform = { x: 2977, heightAboveGround: 250, width: 55, thickness: 12 }; // lowered from 290 -- the bird's own crest/wings extended past the top of the screen at that height. Re-verified: the existing arc passes within ~3 units of this height at x_offset=57 from launch, and 250 still comfortably clears the double-jump-safe threshold (160.6)
const woodpecker = {
  fed: false,
  beakOpen: 0,
  landedT: 0,  // worm has landed and is visible, bird hasn't started eating yet
  eatingT: 0,  // brief lean-over-and-eat animation, plays after the landed pause
  danceT: -1   // -1 = hasn't started yet (still landed/eating)
};

function updateWoodpecker(deltaTime) {
  if (!woodpecker.fed) {
    woodpecker.beakOpen = (Math.sin(performance.now() * 0.0035) + 1) / 2;
  } else if (woodpecker.landedT < 1400) {
    woodpecker.landedT += deltaTime * 1000; // worm visibly landed, brief beat before the bird reacts
  } else if (woodpecker.danceT < 0) {
    woodpecker.eatingT += deltaTime * 1000;
    if (woodpecker.eatingT >= 2200) {
      woodpecker.danceT = 0; // eating done, worm consumed, now dance
    }
  } else if (woodpecker.danceT < 2000) {
    woodpecker.danceT += deltaTime * 1000;
  }
}

function drawWoodpecker(camX) {
  const wx = woodpeckerPlatform.x - camX;
  const wy = gy - woodpeckerPlatform.heightAboveGround - 6;

  ctx.strokeStyle = "#3a2412";
  ctx.lineWidth = 8;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(wx - 45, wy + 14);
  ctx.quadraticCurveTo(wx - 10, wy + 20, wx + 30, wy + 12);
  ctx.stroke();

  // small woven nest — makes it read as a baby bird's home, not just a perch
  ctx.strokeStyle = "#8a6a3a";
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 3; i++) {
    const ny = wy + 8 + i * 1.3;
    const spread = 15 - i * 1.5;
    ctx.beginPath();
    ctx.ellipse(wx, ny, spread, 4, 0, Math.PI, Math.PI * 2); // back half only — front half drawn after the bird
    ctx.stroke();
  }

  const landed = woodpecker.fed && woodpecker.landedT < 1400;
  const eating = woodpecker.fed && !landed && woodpecker.danceT < 0;
  const dance = woodpecker.fed && woodpecker.danceT >= 0 && woodpecker.danceT < 2000;
  const danceWobble = dance ? Math.sin(woodpecker.danceT * 0.012) * 6 : 0;
  const eatLean = eating ? Math.min(woodpecker.eatingT / 200, 1) * 6 : 0; // leans down toward the worm
  const bodyX = wx + danceWobble;
  const bodyY = wy + eatLean;

  ctx.fillStyle = "#3a3a3a";
  ctx.beginPath();
  ctx.moveTo(bodyX - 10, bodyY + 4);
  ctx.lineTo(bodyX - 13, bodyY + 14);
  ctx.lineTo(bodyX - 6, bodyY + 8);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#e8e2d0";
  ctx.beginPath();
  ctx.ellipse(bodyX, bodyY, 11, 13, 0, 0, Math.PI * 2);
  ctx.fill();

  // crest — real woodpecker crests sweep back in a pointed ridge along the
  // top of the head, not a simple oval blob
  ctx.fillStyle = "#c9382a";
  ctx.beginPath();
  ctx.moveTo(bodyX - 5, bodyY - 10);
  ctx.quadraticCurveTo(bodyX - 7, bodyY - 20, bodyX - 1, bodyY - 24);
  ctx.quadraticCurveTo(bodyX + 4, bodyY - 20, bodyX + 3, bodyY - 12);
  ctx.quadraticCurveTo(bodyX + 6, bodyY - 17, bodyX + 8, bodyY - 10);
  ctx.quadraticCurveTo(bodyX + 2, bodyY - 8, bodyX - 5, bodyY - 10);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#3a3a3a";
  ctx.beginPath();
  ctx.ellipse(bodyX + 6, bodyY, 6, 9, 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#e8e2d0";
  if (dance) {
    const flap = Math.sin(woodpecker.danceT * 0.025) * 0.5; // genuine up-down flapping motion
    ctx.beginPath();
    ctx.ellipse(bodyX - 9, bodyY + 3 - flap * 4, 4, 6, -0.4 - flap, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(bodyX + 10, bodyY + 3 - flap * 4, 4, 6, 0.4 + flap, 0, Math.PI * 2);
    ctx.fill();
  }

  const beakGap = woodpecker.fed ? 1 : woodpecker.beakOpen;
  // beak specifically bends down toward the worm during eating -- distinct
  // from the whole-body lean, gives a real "pecking down at it" read
  const beakBend = eating ? Math.min(woodpecker.eatingT / 300, 1) * 8 : 0;
  ctx.fillStyle = "#2b2b2b";
  ctx.beginPath();
  ctx.arc(bodyX - 4, bodyY - 8, 1.4, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#e0a020";
  ctx.beginPath();
  ctx.moveTo(bodyX - 10, bodyY - 9);
  ctx.lineTo(bodyX - 18, bodyY - 9 - beakGap * 3 + beakBend);
  ctx.lineTo(bodyX - 11, bodyY - 6);
  ctx.closePath();
  ctx.fill();
  if (beakGap > 0.15) {
    ctx.beginPath();
    ctx.moveTo(bodyX - 10, bodyY - 9);
    ctx.lineTo(bodyX - 18, bodyY - 9 + beakGap * 2 + beakBend);
    ctx.lineTo(bodyX - 11, bodyY - 6);
    ctx.closePath();
    ctx.fill();
  }

  ctx.strokeStyle = "#e0a020";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(bodyX - 4, bodyY + 12);
  ctx.lineTo(bodyX - 4, bodyY + 13.5);
  ctx.moveTo(bodyX + 4, bodyY + 12);
  ctx.lineTo(bodyX + 4, bodyY + 13.5);
  ctx.stroke();

  // front nest rim — drawn after the bird so it visibly wraps up around
  // the legs, not just sits behind as a flat backdrop
  ctx.strokeStyle = "#8a6a3a";
  ctx.lineWidth = 2.5;
  for (let i = 0; i < 4; i++) {
    const ny = wy + 8 + i * 1.6;
    const spread = 15 - i * 1.5;
    ctx.beginPath();
    ctx.ellipse(wx, ny, spread, 4, 0, 0, Math.PI);
    ctx.stroke();
  }

  if (landed) {
    // worm has landed, fully visible, bird hasn't started eating yet
    drawWormShape(ctx, bodyX - 15, wy + 7, 8, 0.32);
  } else if (eating) {
    const shrink = 1 - Math.min(woodpecker.eatingT / 2200, 1); // worm gets consumed, shrinks over the eating duration
    if (shrink > 0.05) {
      drawWormShape(ctx, bodyX - 15, wy + 7, 8 * shrink, 0.32);
    }
  }

  if (!woodpecker.fed && inventory.worm > 0) {
    drawFittedSpeechBubble(ctx, bodyX + 16, bodyY - 15, ["tweet tweet!", "hungry!"]);
  }
  if (eating) {
    drawFittedSpeechBubble(ctx, bodyX + 16, bodyY - 15, ["yum yum!"]);
  }
}

/* ======================================================
   SEESAW — talk to the NPC first, they hop onto the fixed
   end, mount the other side and pump (repeated space) to
   build charge, then launch up into the oak.
   ====================================================== */
const seesawNPC = {
  x: 3180,
  homeX: 3180,
  talkedTo: false,
  hopping: false,
  onSeesaw: false,
  bob: 0,
  hopT: 9999 // tracks her own hop-bounce, triggered each time the player charges
};

// the player's own kick, opposite-phase from the hedgehog's hop --
// rises while she's still descending and peaks right at her landing
// impact (t=700, the moment her own hop offset returns to 0), rather
// than at her hop's own midpoint. Grows taller with each successive
// charge, since more of her weight has been landing on it.
const playerHop = { t: 9999 };
const PLAYER_HOP_RISE_START = 450, PLAYER_HOP_PEAK = 700, PLAYER_HOP_SETTLE = 1000;
const PLAYER_HOP_BASE_HEIGHT = 34;

function getPlayerHopOffset() {
  if (playerHop.t >= PLAYER_HOP_SETTLE) return 0;
  const peakHeight = PLAYER_HOP_BASE_HEIGHT * (seesaw.charge / SEESAW_CHARGE_NEEDED);
  if (playerHop.t < PLAYER_HOP_RISE_START) return 0;
  if (playerHop.t < PLAYER_HOP_PEAK) {
    const p = (playerHop.t - PLAYER_HOP_RISE_START) / (PLAYER_HOP_PEAK - PLAYER_HOP_RISE_START);
    return peakHeight * Math.sin(p * Math.PI / 2);
  }
  const p = (playerHop.t - PLAYER_HOP_PEAK) / (PLAYER_HOP_SETTLE - PLAYER_HOP_PEAK);
  return peakHeight * Math.cos(p * Math.PI / 2);
}

const seesaw = {
  x: 3010,
  pivotHeightAboveGround: 40,
  angle: 0,       // current tilt, radians — positive means player's side down
  charge: 0,
  mounted: false,
  launching: false,
  launchT: 0,
  playerOnPlank: false, // must jump to activate; walking near it alone does nothing
  heldItemPlaced: null, // item type currently sitting on the far end, ready to launch
  pumpEnergy: 0
};
const SEESAW_CHARGE_NEEDED = 6;

// her own weight landing back down should actually move the seesaw --
// near ground level (start/end of her hop) her side presses down,
// lifting the player's side; mid-air she's not affecting it at all.
// Computed fresh each call from her current hop phase, never stored,
// so it can't accumulate across frames the way mutating seesaw.angle
// directly would have.
function getSeesawHopExtraTilt() {
  if (seesawNPC.hopT > 700) return 0;
  const hopProgress = seesawNPC.hopT / 700;
  const groundCloseness = 1 - Math.sin(hopProgress * Math.PI);
  return -0.20 * groundCloseness;
}
function getSeesawDisplayAngle() {
  return seesaw.angle + getSeesawHopExtraTilt();
}

const SEESAW_LAUNCH_DURATION = 2600; // slowed substantially for a gentle, whimsical arc

function updateSeesaw(deltaTime) {
  // bounce-gravity now runs completely unconditionally, regardless of
  // playerOnPlank's state — this was the actual root cause of the
  // frozen-player bug. It used to be nested inside the playerOnPlank
  // block, so clearing that flag mid-bounce (e.g. right when the worm
  // launches) silently stopped this from ever running again, leaving the
  // player permanently stuck at whatever height they were at.
  if (player.onSeesawBounce) {
    player.y += player.vy;
    player.vy -= 0.65;
    // safety net — the precise seesaw-surface landing check below only
    // runs while genuinely on the plank; this ensures the player can
    // never fall through the ground indefinitely if that's ever skipped
    if (player.y <= 0 && player.vy <= 0) {
      player.y = 0;
      player.vy = 0;
      player.jumping = false;
      player.usedDoubleJump = false;
      player.onSeesawBounce = false;
    }
  }

  // walk-on platform physics — works anytime, independent of the NPC/
  // launch sequence. Continuous tilt: whichever side you're standing on
  // goes down, proportional to how far from center; standing dead center
  // keeps it flat like a normal platform.
  const seesawHalfWidth = 100;
  const px = player.x + player.width / 2;
  const onPlank = px > seesaw.x - seesawHalfWidth && px < seesaw.x + seesawHalfWidth &&
                  !seesaw.mounted && !seesaw.launching; // don't fight with the NPC charge-sequence

  if (onPlank) {
    const relX = px - seesaw.x;
    const t = relX / seesawHalfWidth; // -1 to 1

    // CONFIRMED BUG FIX, properly this time: my last fix excluded the
    // entire left half from onPlank itself, which also broke normal
    // walking/standing physics on that side, not just the thing I meant
    // to block. Now onPlank stays intact everywhere (so standing/walking
    // works normally across the whole plank), and only the JUMP-
    // ACTIVATION specifically is blocked near the mount target while
    // she's waiting there — that's the only part that was ever actually
    // causing the false-tilt/hop-illusion bug.
    const nearMountTarget = seesawNPC.onSeesaw && seesawNPC.talkedTo && px < seesaw.x;
    if (nearMountTarget && seesaw.playerOnPlank) {
      // CONFIRMED BUG FIX: this flag can be stuck true from earlier use
      // elsewhere (e.g. the worm-catapult on the right side) — my
      // previous fix only blocked NEW activation, but never cleared an
      // already-true value, so the tilt/hop-illusion bug could still
      // happen whenever this was left over from something unrelated.
      seesaw.playerOnPlank = false;
      player.onSeesawBounce = false;
    }
    if (!seesaw.playerOnPlank && !nearMountTarget) {
      // not yet activated — only landing via a genuine jump counts
      const currentSurfaceHeight = (seesaw.pivotHeightAboveGround + 24) - relX * Math.sin(seesaw.angle);
      if (player.jumping && player.vy <= 0 && player.y <= currentSurfaceHeight + 12 && player.y >= currentSurfaceHeight - 20) {
        seesaw.playerOnPlank = true;
      }
    }

    // CONFIRMED BUG FIX: the tilt formula was responding purely to
    // horizontal position, with no check on whether the player was
    // actually near the plank vertically — so simply standing at ground
    // level anywhere in the horizontal zone (even well below the actual
    // seat height) still tilted the seesaw as if they were on it.
    // Verified directly against two reported screenshots (both matched
    // the pure-horizontal formula exactly). Now checks vertical
    // proximity against the surface height BEFORE this frame's update,
    // using the same tolerance as the support-snap below.
    const currentSurfaceHeight = (seesaw.pivotHeightAboveGround + 24) - relX * Math.sin(seesaw.angle);
    const nearPlankVertically = player.y >= currentSurfaceHeight - 30 && player.y <= currentSurfaceHeight + 40;
    const pumpBoost = (seesaw.playerOnPlank && !nearMountTarget)
      ? Math.sign(t || 1) * Math.min((seesaw.pumpEnergy || 0) / 0.35, 1) * 0.5
      : 0; // rescaled against the actual 0.35 launch threshold, not the raw 0.5 cap -- otherwise the seesaw only ever looks 70% tilted at the exact moment it launches, which read as launching too early
    const targetAngle = nearPlankVertically ? (t * 0.25 + pumpBoost) : 0; // settles back toward flat if nobody's genuinely near it
    seesaw.angle += (targetAngle - seesaw.angle) * Math.min(deltaTime * 5, 1);
    const surfaceHeight = (seesaw.pivotHeightAboveGround + 24) - relX * Math.sin(seesaw.angle);
    if (player.vy <= 0 && player.y <= surfaceHeight && player.y >= surfaceHeight - 30) {
      player.y = surfaceHeight;
      player.vy = 0;
      player.jumping = false;
      player.usedDoubleJump = false;
      player.onSeesawBounce = false;
    }

    // place an item — space while standing near the far (empty) end,
    // holding something, places it there ready to be launched. Works via
    // simple proximity, no jump required — this was incorrectly gated
    // behind playerOnPlank before, which meant you had to jump onto the
    // seesaw before placement would even register at all.
    // CONFIRMED BUG FIX: any held item could be placed here, not just
    // the worm -- accidentally placing something else (like an acorn)
    // with no way to retrieve it without launching permanently blocked
    // the worm from ever being placed. Restricted to worm only, plus a
    // pickup-back-up path for anything already stuck from before this fix.
    if (keys.spaceJustPressed && !seesaw.heldItemPlaced && heldItem === "worm" && Math.abs(relX) > 60) {
      seesaw.heldItemPlaced = heldItem;
      // CONFIRMED BUG FIX: inventory was never decremented on use, so
      // placed/launched items stayed in the inventory count forever
      if (inventory[heldItem]) {
        inventory[heldItem] -= 1;
        if (inventory[heldItem] <= 0) delete inventory[heldItem];
      }
      heldItem = null;
      updateInventoryUI(); // CONFIRMED BUG FIX: data was correct immediately, but the chip display didn't refresh until some unrelated later action happened to call this
    } else if (keys.spaceJustPressed && seesaw.heldItemPlaced && !heldItem && Math.abs(relX) > 60) {
      // pick it back up instead of leaving it stuck there forever
      addToInventory(seesaw.heldItemPlaced);
      heldItem = seesaw.heldItemPlaced;
      seesaw.heldItemPlaced = null;
    }

    if (seesaw.playerOnPlank && !nearMountTarget) {
      // auto-fires once pump energy reaches near-max (96% of the 0.5 cap)
      // — no space press needed anymore. Using a near-max threshold
      // rather than the exact max avoids a single-frame timing window,
      // since energy decays slightly every frame even at the peak.
      if (seesaw.heldItemPlaced && seesaw.pumpEnergy >= 0.35) {
        launchSeesawItem(seesaw.heldItemPlaced, 0.5); // always full-send strength
        seesaw.heldItemPlaced = null;
        seesaw.pumpEnergy = 0;
        seesaw.playerOnPlank = false; // CONFIRMED BUG FIX: this was staying true after launch, silently blocking the NPC-launch mount-check's !playerOnPlank requirement since the two systems share this flag
      }

      // jump to pump — genuine accumulation, each jump adds more energy
      // rather than just a single bounce
      if (keys.upJustPressed && !player.onSeesawBounce) {
        seesaw.pumpEnergy = Math.min((seesaw.pumpEnergy || 0) + 0.12, 0.5);
        player.vy = 8; // reduced from 12 -- combined with the base seesaw height, 12 was still reaching ~160-180 total peak, nearly double a normal jump. This targets a real, normal-feeling jump height instead.
        player.onSeesawBounce = true;
      } else if (!player.onSeesawBounce) {
        seesaw.pumpEnergy = (seesaw.pumpEnergy || 0) * 0.96; // decays over time
      }
    }
  } else if (!seesaw.mounted && !seesaw.launching) {
    seesaw.playerOnPlank = false; // walked off — deactivated, must jump again to reactivate
    player.onSeesawBounce = false; // CONFIRMED BUG FIX: this was never clearing if you left the zone mid-bounce, permanently blocking all gravity (the "floating in oblivion" bug)
    // nobody on it — settle back toward flat
    seesaw.angle += (0 - seesaw.angle) * Math.min(deltaTime * 4, 1);
  }

  // talk to the NPC first
  if (!seesawNPC.talkedTo && keys.spaceJustPressed && isPlayerNear(seesawNPC.x, 0, 45, 25, 25)) {
    seesawNPC.talkedTo = true;
  }

  // she only starts walking over once you're near the seesaw AND the worm
  // has genuinely been delivered to the woodpecker — makes that content a
  // real prerequisite, not just an optional side thing available in parallel.
  // CONFIRMED BUG FIX: this used to check seesaw.playerOnPlank, but that
  // flag belongs to the worm-catapult system and gets cleared the instant
  // the worm launches — exactly the moment a player would try to get her
  // moving, so the hop could never actually trigger. Simple proximity
  // instead, since this doesn't need to know about the other system at all.
  if (seesawNPC.talkedTo && !seesawNPC.hopping && !seesawNPC.onSeesaw && isPlayerNear(seesaw.x, 0, 110, 90, 40) && woodpecker.fed) {
    seesawNPC.hopping = true;
  }

  if (seesawNPC.hopping) {
    const targetX = seesaw.x + 90; // fixed end, matches the wider plank
    if (Math.abs(seesawNPC.x - targetX) < 2) {
      seesawNPC.x = targetX;
      seesawNPC.hopping = false;
      seesawNPC.onSeesaw = true;
    } else {
      seesawNPC.x += Math.sign(targetX - seesawNPC.x) * 60 * deltaTime;
    }
  }

  seesawNPC.bob = Math.sin(performance.now() * 0.004) * 3;
  if (seesawNPC.hopT < 700) seesawNPC.hopT += deltaTime * 1000; // slowed for a gentler bounce

  if (!seesawNPC.onSeesaw) return; // can't use the seesaw until the NPC is actually on it

  // mount — same UP-key priority pattern as the swing. Edge-triggered
  // (was held), and explicitly excludes the walk-on/jump-pump system —
  // these were conflicting: holding UP near this spot while trying to
  // jump-activate the platform would silently steal the interaction,
  // blocking worm placement and the jump-pump entirely.
  const mountTargetSurfaceHeight = (seesaw.pivotHeightAboveGround + 24) - (-90) * Math.sin(getSeesawDisplayAngle());
  const nearMountHorizontally = Math.abs((player.x + player.width / 2) - (seesaw.x - 90)) < 35;
  if (!seesaw.mounted && !seesaw.launching && !seesaw.playerOnPlank && keys.upJustPressed &&
      nearMountHorizontally) {
    seesaw.mounted = true;
    seesaw.charge = 0;
    // CONFIRMED BUG FIX: handleInput runs before updateSeesaw in the real
    // game loop, so on this exact frame the jump-suppression check ran
    // BEFORE seesaw.mounted became true — meaning a real jump could
    // already be triggered from the very same keypress that just
    // mounted. Cancel it explicitly now that mounting has actually happened.
    player.jumping = false;
    player.vy = 0;
  }

  if (seesaw.mounted) {
    // CONFIRMED BUG FIX: if you walk away mid-charge, this needs to clear
    // — previously nothing ever reset it except reaching full charge, so
    // falling off early permanently blocked re-mounting. Only checks
    // horizontal distance — this mount sequence is stationary (charge via
    // space, no jumping), so a y<=0 check was wrong: standing normally at
    // ground level also satisfies that, which was un-mounting immediately
    // on the same frame as a successful mount.
    if (!nearMountHorizontally) {
      seesaw.mounted = false;
      seesaw.charge = 0;
      playerHop.t = 9999;
    }
  }

  if (seesaw.mounted) {
    // CONFIRMED BUG FIX: hold the player's position fixed for the whole
    // duration of being mounted, not just cancel one jump on the mount
    // frame — this is meant to be a stationary interaction (press up
    // repeatedly while seated), but nothing was otherwise stopping
    // normal gravity from continuing to apply every subsequent frame,
    // since onPlank support logic doesn't run while mounted.
    player.y = mountTargetSurfaceHeight + getPlayerHopOffset();
    player.vy = 0;
    player.jumping = false;
    player.usedDoubleJump = false;
    playerHop.t += deltaTime * 1000;

    if (keys.upJustPressed && seesaw.charge < SEESAW_CHARGE_NEEDED) {
      seesaw.charge = Math.min(seesaw.charge + 1, SEESAW_CHARGE_NEEDED);
      seesawNPC.hopT = 0; // triggers her own hop animation, synced to the player's jump
      playerHop.t = 0; // opposite-phase kick, peaks at her landing rather than her hop's own midpoint
    }
    // tilt follows charge — dampened per press so the visual buildup
    // reads more gradually, matching the actual charge progression
    // rather than snapping hard toward each new target
    const targetAngle = -0.28 * (seesaw.charge / SEESAW_CHARGE_NEEDED);
    seesaw.angle += (targetAngle - seesaw.angle) * Math.min(deltaTime * 4, 1);

    // full charge doesn't launch instantly -- wait for that final kick
    // to actually reach its peak, so the launch genuinely starts from
    // the built-up height rather than snapping away mid-rise
    if (seesaw.charge >= SEESAW_CHARGE_NEEDED && playerHop.t >= PLAYER_HOP_PEAK) {
      seesaw.mounted = false;
      seesaw.launching = true;
      seesaw.launchT = 0;
    }
  }

  if (seesaw.launching) {
    const prevT = seesaw.launchT;
    seesaw.launchT += deltaTime * 1000;

    // purely visual arc — not physically simulated, just a convincing
    // parabolic path from the seesaw toward the oak's hollow
    const launchProgress = Math.min(seesaw.launchT / SEESAW_LAUNCH_DURATION, 1);
    if (prevT === 0) {
      seesaw.launchStartX = seesaw.x - 90;
      seesaw.launchStartY = player.y; // the actual height the kick had reached at that instant, not a flat ground value
    }
    const arcTargetX = TALL_OAK_X - 3;
    const arcTargetY = 280; // raised into the canopy proper — was 240, which visually landed near the hollow/trunk level rather than up in the leaves
    const arcPeak = 90; // extra height at the midpoint, for a real arc shape
    player.x = seesaw.launchStartX + (arcTargetX - seesaw.launchStartX) * launchProgress - player.width / 2;
    player.y = seesaw.launchStartY + (arcTargetY - seesaw.launchStartY) * launchProgress + Math.sin(launchProgress * Math.PI) * arcPeak;

    if (seesaw.launchT >= SEESAW_LAUNCH_DURATION) {
      seesaw.launching = false;
      seesaw.charge = 0;
      seesaw.angle = 0;
      startSeasonTransition("oak");
    }
  }
}

function drawSeesawNPC(camX) {
  let nx = seesawNPC.x - camX;
  let ny;
  if (seesawNPC.onSeesaw) {
    // match the seat bump's ACTUAL rotated position, not a fixed x with
    // only y adjusted — the real seat moves in both x and y as the plank tilts
    const sx = seesaw.x - camX, sy = gy - seesaw.pivotHeightAboveGround;
    const localX = 90, localY = -8; // matches the seat bump's own local coordinates
    const cos = Math.cos(seesaw.angle), sin = Math.sin(seesaw.angle);
    nx = sx + localX * cos - localY * sin;
    ny = (sy - 10) + localX * sin + localY * cos + seesawNPC.bob - 6; // -6 lifts her to sit ON the seat, not centered on it
  } else {
    ny = gy - 12 + seesawNPC.bob;
  }

  // her own hop-bounce, synced to each charge-building jump — a real
  // two-person seesaw effort, not just passively following the tilt
  if (seesawNPC.hopT < 700) {
    const hopProgress = seesawNPC.hopT / 700;
    ny -= Math.sin(hopProgress * Math.PI) * 55;
  }

  // spikes — single shared drawing function for both edge and on-body
  // spikes, guaranteeing truly identical shape and width (the previous
  // version used two different formulas -- angular offset at a radius
  // for edge spikes, direct perpendicular offset for on-body ones --
  // which don't actually produce the same visual width even with
  // matching color, despite looking like they should on paper).
  ctx.save();
  ctx.translate(nx, ny);
  ctx.scale(1.4, 1.4); // larger still, per request
  ctx.translate(-nx, -ny);

  const drawSpike = (baseX, baseY, angle, length) => {
    const baseHalfWidth = length * 0.1; // scales with length so all spikes share the same proportion, regardless of which loop draws them
    ctx.beginPath();
    ctx.moveTo(baseX + Math.cos(angle + 1.5708) * baseHalfWidth, baseY + Math.sin(angle + 1.5708) * baseHalfWidth);
    ctx.lineTo(baseX + Math.cos(angle) * length, baseY + Math.sin(angle) * length);
    ctx.lineTo(baseX + Math.cos(angle - 1.5708) * baseHalfWidth, baseY + Math.sin(angle - 1.5708) * baseHalfWidth);
    ctx.closePath();
    ctx.fill();
  };

  ctx.fillStyle = "#2e2314";
  for (let i = -11; i <= 8; i++) {
    const jitter = Math.sin(i * 2.7) * 0.07; // breaks the perfectly uniform spacing
    const ang = -Math.PI / 2 + i * 0.28 + jitter;
    const spikeLen = 13 + Math.sin(i * 0.9) * 4; // 9-17, verified clear of the body radius (15) at every value
    drawSpike(nx + Math.cos(ang) * 7, ny + Math.sin(ang) * 7, ang, spikeLen);
  }

  // body — larger, rounder than before, sized up slightly per request
  ctx.fillStyle = "#c9a878";
  ctx.beginPath();
  ctx.ellipse(nx, ny, 15, 13, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#8a6a4a";
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.fillStyle = "#2e2314";
  const onBodySpikes = [
    [-7, -7, 0.3], [-3, -9, -0.5], [2, -8, 0.8], [-9, -1, -1.2],
    [-5, 2, 0.4], [0, -3, -0.7], [3, 4, 1.1], [-8, 5, -0.3], [-2, 7, 0.6],
    [-6, -4, 1.0], [4, -5, -1.0], [-4, -1, 1.3], [6, 1, -0.6], [1, 6, -1.3],
    [-7, 2, 0.9], [5, -1, 0.2],
    [8, -3, 1.4], [7, 4, -1.1], [-1, -6, 0.5], [-3, 6, 1.2],
    [3, -2, -0.4], [-9, 4, 0.7], [0, 8, -0.9], [6, -6, 0.3],
    [-5, -6, -0.8], [2, 2, 1.0], [-1, 3, -0.2], [4, 7, 0.5]
  ];
  onBodySpikes.forEach(([dx, dy, tilt], idx) => {
    const len = 6 + (idx % 4) * 1.5; // 6-10.5, comparable visual scale to edge spikes given the different starting offset
    drawSpike(nx + dx, ny + dy, tilt, len);
  });

  // small feet
  ctx.fillStyle = "#8a6a4a";
  [-6, 6].forEach(fx => {
    ctx.beginPath();
    ctx.ellipse(nx + fx, ny + 12, 3, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // little pale face/snout
  ctx.fillStyle = "#e8ddc8";
  ctx.beginPath();
  ctx.ellipse(nx + 8, ny + 2, 6, 5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#2b2b2b";
  ctx.beginPath();
  ctx.arc(nx + 13, ny + 2, 1.5, 0, Math.PI * 2); // nose
  ctx.fill();
  ctx.beginPath();
  ctx.arc(nx + 6, ny - 1, 1.2, 0, Math.PI * 2);
  ctx.arc(nx + 10, ny - 1, 1.2, 0, Math.PI * 2); // eyes
  ctx.fill();

  // small stubby tail at the back, opposite the face -- real hedgehogs
  // have very short tails, not a prominent feature
  ctx.fillStyle = "#8a6a4a";
  ctx.beginPath();
  ctx.ellipse(nx - 15, ny + 6, 3, 2.2, 0.3, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore(); // closes the scale transform opened before the spikes

  // real dialogue, positioned to genuinely sit on her right — removed the
  // blank "..." placeholder entirely, it wasn't adding anything and was
  // confusingly positioned
  if (seesawNPC.talkedTo && !seesawNPC.onSeesaw) {
    drawFittedSpeechBubble(ctx, nx + 40, ny - 32, ["ready to fly high?", "hop on the other", "side of the seesaw!"]);
  }

  // hint once both are on the seesaw but the player hasn't started
  // pumping yet — the "keep pressing up" mechanic wasn't obvious enough
  if (seesaw.mounted && seesaw.charge === 0) {
    drawFittedSpeechBubble(ctx, nx + 40, ny - 32, ["jump up to", "pump up!"]);
  }
}

function drawSeesaw(camX) {
  const sx = seesaw.x - camX;
  const sy = gy - seesaw.pivotHeightAboveGround;

  // rounder, friendlier fulcrum — red as the primary color now, dark walnut as the outline accent
  ctx.fillStyle = "#a8402e";
  ctx.strokeStyle = "#4a3018";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(sx - 12, gy);
  ctx.quadraticCurveTo(sx - 12, sy - 6, sx - 4, sy - 12);
  ctx.quadraticCurveTo(sx, sy - 15, sx + 4, sy - 12);
  ctx.quadraticCurveTo(sx + 12, sy - 6, sx + 12, gy);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#4a3018";
  ctx.beginPath();
  ctx.arc(sx, sy - 12, 4, 0, Math.PI * 2);
  ctx.fill();

  // plank — red as the primary body color, wider, rounded ends
  ctx.save();
  ctx.translate(sx, sy - 10);
  ctx.rotate(getSeesawDisplayAngle());

  ctx.fillStyle = "#a8402e";
  ctx.strokeStyle = "#4a3018";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.roundRect ? ctx.roundRect(-100, -5, 200, 10, 5) : ctx.fillRect(-100, -5, 200, 10);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "#4a3018";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-70, -1);
  ctx.lineTo(70, -1);
  ctx.stroke();

  // little seat bumps at each end, so it reads as somewhere to actually sit
  ctx.fillStyle = "#4a3018";
  [-90, 90].forEach(ex => {
    ctx.beginPath();
    ctx.ellipse(ex, -8, 12, 6, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // the placed item itself — was being tracked in state but never actually
  // drawn, so placing it looked like it just vanished with no confirmation
  if (seesaw.heldItemPlaced === "worm") {
    drawWormShape(ctx, -90, -14, 7, 0.3);
  }

  ctx.restore();
}

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

/* ======================================================
   WILLOW TREE — hides a shovel behind its drooping branches.
   Positioned past the wiggle bush, further right of the cloud
   drop-off, so it's naturally found after a trip to the clouds
   rather than on a first pass through spring. Reveal is a
   continuous HOLD (not discrete taps like the bush) — a slower,
   more deliberate "parting the branches" feel.
   ====================================================== */
const WILLOW_HOLD_DURATION = 2500; // ms — continuous hold to fully part the branches

const willow = {
  x: 2500, // moved further right
  noticeTimer: 6500 + Math.random() * 3000, // offset from the bush's 3000-6000 range so they don't sync
  noticeWiggle: 0,
  holdProgress: 0, // ms held so far — resets if you let go or walk away
  opened: false, // reverted — the pre-loaded shovel doesn't need this, and it was disabling the wiggle entirely
  shovelTaken: false
};

const shovel = {
  x: 2500,
  heightAboveGround: 30,
  collected: false, // normally false
  collecting: false
};

/* ======================================================
   DIG SITE / PEANUT VINE — dig with the shovel, plant a
   peanut, water with a full bucket, grow a climbable vine
   that genuinely reaches height a double-jump cannot
   (verified max double-jump ~140.6; vine climbs to 300).
   Once grown, periodically drops peanuts — a renewable
   resource, rarer cadence than the water drips.
   ====================================================== */
const digSite = {
  x: 2680, // verified clear of squirrel's max wander position
  dug: false,
  digAnimT: 9999, // ms since dig animation started — high so nothing plays before the first dig
  planted: false,
  plantAnimT: 9999, // ms since planting — drives the peanut's gentle fall into the pit
  watered: false
};
const PEANUT_PIT_DEPTH = 14; // how far below the flat ground line the peanut/vine base sits
const PLANT_FALL_DURATION = 700; // ms — gentle fall, not instant
const DIG_ANIM_DURATION = 1800;

const peanutVine = {
  x: 2680,
  growProgress: 1, // TEMPORARY — fully grown for the door-decoration debug view, revert to 0 when done
  grown: true, // TEMPORARY — revert to false when done
  climbHeight: 250, // reduced — verified: 50px margin below screen top, still well beyond double-jump max (~140.6)
  mounted: false,
  playerClimbHeight: 0
};
const VINE_GROW_DURATION = 4000;
const VINE_CLIMB_SPEED = 70; // units/sec while holding up

const vineGoldPile = {
  collected: false,
  collecting: false
};

let vineDropTimer = 0;
const VINE_FIRST_DROP_DELAY = 6000; // short — lands while the bucket is still freshly empty from watering
const VINE_DROP_MIN = 220000; // ~4 minutes-ish, with natural variance
const VINE_DROP_MAX = 260000;
let fallingVinePeanuts = []; // {x, heightAboveGround, falling}

/* ======================================================
   SNAIL NPC — drives the graft interaction. Slimes slowly near
   the graft trees, same wander behavior as the other spring
   animals (direction switches, brief pauses) but sliding instead
   of hopping. Dialogue content pending — visual first.
   ====================================================== */
const snail = {
  homeX: 680, // clear of the pear tree (550) — verified: even at closest wander point, well outside its own reveal radius
  x: 680,
  y: 0,
  bob: 0,
  bobSpeed: 0.04,
  tip: 0,
  direction: 1,
  walkState: "sliding", // "sliding" | "paused"
  pauseTimer: 0,
  wanderRange: 20,
  dialogueRevealed: false // requires an actual press, not just proximity
};
const SNAIL_SLIME_SPEED = 8; // much slower than the squirrel's walk

/* ======================================================
   GRAFT SYSTEM — honey (reusable, 6 scoops) placed first at a
   tree's stick-break point, leaving a visible gloop, then a
   DIFFERENT tree's stick placed on top triggers a slow morph
   into the hybrid. Re-graftable: honeyGloop resets after each
   successful graft, so any tree can be re-grafted with a
   different stick later. Sticks are never consumed.
   ====================================================== */
const GRAFT_TREE_X = { plum: 330, pear: 550, peach: 950 };

// each tree gets its own distinct layout (not the same offsets copy-pasted
// three times) — independently verified via arc simulation: in-canopy,
// each fruit individually reachable, and the pair separated well past the
// ~55-unit effective single-throw band so it genuinely takes two throws
const knockableFruits = {
  plum: [
    { x: GRAFT_TREE_X.plum - 42, heightAboveGround: 120, knocked: false, falling: false, collected: false, collecting: false },
    { x: GRAFT_TREE_X.plum + 30, heightAboveGround: 145, knocked: false, falling: false, collected: false, collecting: false }
  ],
  pear: [
    { x: GRAFT_TREE_X.pear - 36, heightAboveGround: 140, knocked: false, falling: false, collected: false, collecting: false },
    { x: GRAFT_TREE_X.pear + 39, heightAboveGround: 120, knocked: false, falling: false, collected: false, collecting: false }
  ],
  peach: [
    { x: GRAFT_TREE_X.peach + 42, heightAboveGround: 120, knocked: false, falling: false, collected: false, collecting: false },
    { x: GRAFT_TREE_X.peach - 30, heightAboveGround: 145, knocked: false, falling: false, collected: false, collecting: false }
  ]
};
const KNOCK_FRUIT_FALL_SPEED = 60;

const GRAFT_MORPH_DURATION = 3000;

const graftState = {
  plum: { honeyGloop: false, hybrid: null, morphing: false, morphT: 0, morphTo: null },
  pear: { honeyGloop: false, hybrid: null, morphing: false, morphT: 0, morphTo: null },
  peach: { honeyGloop: false, hybrid: null, morphing: false, morphT: 0, morphTo: null }
};

const HYBRID_NAMES = {
  "peach+pear": "Pearchy",
  "peach+plum": "Peachum",
  "pear+plum": "Plear"
};

const HYBRID_STYLES = {
  Pearchy: { color: "#e8a05a", size: 10, shape: "teardrop" },
  Peachum: { color: "#9c2f66", size: 9, shape: "round" },
  Plear:   { color: "#6b1f2e", size: 9, shape: "teardrop" }
};

function drawPearchyFruit(ctx, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#e8a05a";
  ctx.strokeStyle = "#c9793a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.9);
  ctx.bezierCurveTo(-size * 0.5, -size * 0.6, -size * 0.7, size * 0.1, -size * 0.55, size * 0.6);
  ctx.bezierCurveTo(-size * 0.4, size * 1.1, size * 0.4, size * 1.1, size * 0.55, size * 0.6);
  ctx.bezierCurveTo(size * 0.7, size * 0.1, size * 0.5, -size * 0.6, 0, -size * 0.9);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "#a85a28";
  ctx.lineWidth = size * 0.12;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.55);
  ctx.lineTo(0, size * 0.85);
  ctx.stroke();

  ctx.strokeStyle = "#8a4520";
  ctx.lineWidth = 0.9;
  const shimmerPhase = performance.now() * 0.0025 + x * 0.02;
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    const r = size * 0.55;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r * 1.05);
    ctx.lineTo(Math.cos(a) * (r + size * 0.3), Math.sin(a) * (r + size * 0.3) * 1.05);
    ctx.stroke();

    const glint = Math.sin(shimmerPhase + i * 1.5);
    if (glint > 0.75) {
      ctx.fillStyle = `rgba(255,245,220,${(glint - 0.75) * 3})`;
      ctx.beginPath();
      ctx.arc(Math.cos(a) * (r + size * 0.3), Math.sin(a) * (r + size * 0.3) * 1.05, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.beginPath();
  ctx.moveTo(-size * 0.05, -size * 0.95);
  ctx.quadraticCurveTo(-size * 0.15, -size * 1.15, -size * 0.02, -size * 1.1);
  ctx.stroke();
  ctx.restore();
}

function drawPeachumFruit(ctx, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = "#9c2f66";
  ctx.strokeStyle = "#6e1f49";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, size * 0.68, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.strokeStyle = "rgba(110,31,73,0.5)";
  ctx.lineWidth = size * 0.06;
  [-0.15, 0, 0.15].forEach(offset => {
    ctx.beginPath();
    ctx.moveTo(offset * size, -size * 0.6);
    ctx.quadraticCurveTo(offset * size * 1.5, 0, offset * size, size * 0.6);
    ctx.stroke();
  });

  ctx.fillStyle = "rgba(240,201,222,0.9)";
  const bloomSeed = 42; // fully stable now — dot positions never jitter, only the glint animates
  const bloomPositions = [];
  for (let i = 0; i < 10; i++) {
    const a = pseudoRandom(bloomSeed + i * 3.1) * Math.PI * 2;
    const r = pseudoRandom(bloomSeed + i * 2.3) * size * 0.55;
    const dx = Math.cos(a) * r, dy = Math.sin(a) * r;
    bloomPositions.push([dx, dy]);
    ctx.beginPath();
    ctx.arc(dx, dy, size * 0.09, 0, Math.PI * 2);
    ctx.fill();
  }

  // continuous time-based hazy glint — same mechanism as Pearchy's shimmer,
  // but diffuse/soft rather than a sharp dot, matching bloom dust's chalky quality
  const glintPhase = performance.now() * 0.0025 + x * 0.02;
  bloomPositions.forEach(([dx, dy], i) => {
    const glint = Math.sin(glintPhase + i * 1.7);
    if (glint > 0.68) {
      const a2 = (glint - 0.68) * 3.1;
      ctx.fillStyle = `rgba(225,210,240,${a2 * 0.85})`;
      ctx.beginPath();
      ctx.arc(dx, dy, size * 0.18, 0, Math.PI * 2);
      ctx.fill();
    }
  });

  ctx.strokeStyle = "#4a3320";
  ctx.lineWidth = size * 0.1;
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.68);
  ctx.lineTo(0, -size * 0.8);
  ctx.stroke();
  ctx.restore();
}

function drawPlearFruit(ctx, x, y, size) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(-0.18);

  const pulsePhase = performance.now() * 0.0018 + x * 0.01;
  const wholePulse = 1 + Math.sin(pulsePhase) * 0.035;
  const dimplePulse = 1 + Math.sin(pulsePhase) * 0.18;
  ctx.scale(wholePulse, wholePulse);

  ctx.fillStyle = "#a02f42";
  ctx.strokeStyle = "#7a1f2e";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.85);
  ctx.bezierCurveTo(-size * 0.45, -size * 0.55, -size * 0.6, size * 0.05, -size * 0.5, size * 0.55);
  ctx.bezierCurveTo(-size * 0.35, size * 1.0, size * 0.35, size * 1.0, size * 0.5, size * 0.55);
  ctx.bezierCurveTo(size * 0.6, size * 0.05, size * 0.45, -size * 0.55, 0, -size * 0.85);
  ctx.closePath();
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = "#5d1a28";
  const bumps = [
    [-0.2, -0.1, 0.16], [0.18, -0.28, 0.14], [0.28, 0.08, 0.16],
    [-0.12, 0.28, 0.14], [-0.32, 0.32, 0.12], [0.1, 0.55, 0.16], [-0.05, -0.4, 0.12]
  ];
  bumps.forEach(b => {
    ctx.beginPath();
    ctx.arc(b[0] * size, b[1] * size, b[2] * size * dimplePulse, 0, Math.PI * 2);
    ctx.fill();
  });

  // continuous time-based star-flare glint — sharp cross shape, cool pink,
  // matching a smooth bulging surface rather than fuzz or chalky bloom
  const glintPhase = performance.now() * 0.0025 + x * 0.02;
  bumps.forEach((b, i) => {
    const glint = Math.sin(glintPhase + i * 1.9);
    if (glint > 0.78) {
      const a2 = (glint - 0.78) * (1 / 0.22);
      const gx = b[0] * size, gy2 = b[1] * size, flareLen = size * 0.13;
      ctx.strokeStyle = `rgba(240,170,200,${a2 * 0.85})`;
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(gx - flareLen, gy2); ctx.lineTo(gx + flareLen, gy2);
      ctx.moveTo(gx, gy2 - flareLen); ctx.lineTo(gx, gy2 + flareLen);
      ctx.stroke();
    }
  });

  ctx.strokeStyle = "#4a3320";
  ctx.lineWidth = size * 0.14;
  ctx.beginPath();
  ctx.moveTo(0, -size * 0.85);
  ctx.lineTo(0, -size * 0.95);
  ctx.stroke();
  ctx.restore();
}

const HYBRID_DRAW_FN = { Pearchy: drawPearchyFruit, Peachum: drawPeachumFruit, Plear: drawPlearFruit };

function updateKnockableFruits(deltaTime) {
  ["plum", "pear", "peach"].forEach(type => {
    knockableFruits[type].forEach(fruit => {
      if (fruit.collected || fruit.collecting) return;

      if (fruit.knocked && fruit.falling) {
        fruit.heightAboveGround -= KNOCK_FRUIT_FALL_SPEED * deltaTime;
        if (fruit.heightAboveGround <= 15) {
          fruit.heightAboveGround = 15;
          fruit.falling = false;
        }
        return;
      }

      if (fruit.knocked && !fruit.falling &&
          pressedDownNear(fruit.x, fruit.heightAboveGround, 26, 20, 20)) {
        fruit.collecting = true;
        startCollectAnimation({ x: fruit.x, y: gy - fruit.heightAboveGround, size: 9, rotation: 0 }, graftState[type].hybrid);
      }
    });
  });
}

function drawKnockableFruits(camX) {
  ["plum", "pear", "peach"].forEach(type => {
    if (!graftState[type].hybrid) return; // not visible until grafted
    const hybrid = graftState[type].hybrid;
    const unknockedSize = hybrid === "Pearchy" ? 16 : 13; // Pearchy's warm color blends into the canopy more than the other two's, needs more size to read as distinct
    knockableFruits[type].forEach(fruit => {
      if (fruit.collected || fruit.collecting) return;
      const fx = fruit.x - camX;
      const fy = gy - fruit.heightAboveGround;
      HYBRID_DRAW_FN[hybrid](ctx, fx, fy, fruit.knocked ? 9 : unknockedSize);
    });
  });
}

function updateGraftTrees(deltaTime) {
  Object.keys(graftState).forEach(treeType => {
    const state = graftState[treeType];
    const treeX = GRAFT_TREE_X[treeType];

    if (state.morphing) {
      state.morphT += deltaTime * 1000;
      if (state.morphT >= GRAFT_MORPH_DURATION) {
        state.morphing = false;
        state.hybrid = state.morphTo;
        // fresh fruit to knock down on the new hybrid, regardless of
        // whether the old hybrid's fruit had already been harvested
        knockableFruits[treeType].forEach(fruit => {
          fruit.knocked = false;
          fruit.falling = false;
          fruit.collected = false;
          fruit.collecting = false;
        });
      }
      return;
    }

    // honey placement — requires the reusable pot, still has scoops left
    if (!state.honeyGloop && heldItem === "honey" && honeyScoops > 0 && player.jumping &&
        pressedDownNear(treeX, STICK_HEIGHT_ABOVE_GROUND, 26, 20, 20)) {
      state.honeyGloop = true;
      honeyScoops--;
      updateInventoryUI();
      return;
    }

    // stick placement — only once honey's down, only a DIFFERENT tree's stick
    let graftTriggered = false;
    if (state.honeyGloop) {
      for (const stickType of ["plum", "pear", "peach"]) {
        if (stickType === treeType) continue; // can't graft a tree's own stick onto itself
        const itemKey = stickType + "Stick";
        if (heldItem === itemKey && inventory[itemKey] > 0 && player.jumping &&
            pressedDownNear(treeX, STICK_HEIGHT_ABOVE_GROUND, 26, 20, 20)) {
          const comboKey = [treeType, stickType].sort().join("+");
          state.morphing = true;
          state.morphT = 0;
          state.morphTo = HYBRID_NAMES[comboKey];
          state.honeyGloop = false; // consumed for this graft — tree can be re-grafted later
          graftTriggered = true;
          break;
        }
      }
    }

  });
}

function drawGraftEffects(camX) {
  Object.keys(graftState).forEach(treeType => {
    const state = graftState[treeType];
    const tx = GRAFT_TREE_X[treeType] - camX;
    const ty = gy - STICK_HEIGHT_ABOVE_GROUND;

    if (state.honeyGloop) {
      ctx.fillStyle = "#c98a1a";

      // irregular bumpy main blob — varying radius around the circle, not a smooth curve
      ctx.beginPath();
      const splatPoints = 10;
      for (let i = 0; i <= splatPoints; i++) {
        const a = (i / splatPoints) * Math.PI * 2;
        const r = 6 + pseudoRandom(GRAFT_TREE_X[treeType] * 0.7 + i * 3.3) * 5;
        const px = tx + Math.cos(a) * r;
        const py = ty + Math.sin(a) * r * 0.8;
        if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();

      // scattered satellite droplets, thrown-paint style
      const dropletCount = 7;
      for (let i = 0; i < dropletCount; i++) {
        const a = pseudoRandom(GRAFT_TREE_X[treeType] * 1.3 + i * 2.1) * Math.PI * 2;
        const dist = 9 + pseudoRandom(GRAFT_TREE_X[treeType] * 0.9 + i * 4.7) * 14;
        const dropSize = 1 + pseudoRandom(GRAFT_TREE_X[treeType] * 1.7 + i * 3.9) * 2.5;
        const dx = tx + Math.cos(a) * dist;
        const dy = ty + Math.sin(a) * dist * 0.75;
        ctx.beginPath();
        ctx.ellipse(dx, dy, dropSize, dropSize * 0.8, a, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = "rgba(255,235,180,0.4)";
      ctx.beginPath();
      ctx.ellipse(tx - 2, ty - 3, 2, 1.3, -0.4, 0, Math.PI * 2);
      ctx.fill();
    }

    if (state.morphing) {
      const p = state.morphT / GRAFT_MORPH_DURATION;
      for (let i = 0; i < 5; i++) {
        const angle = performance.now() * 0.002 + i * 1.3;
        const r = 14 + Math.sin(performance.now() * 0.003 + i) * 4;
        const twinkle = Math.sin(performance.now() * 0.01 + i * 2) * 0.5 + 0.5;
        ctx.fillStyle = `rgba(255,240,180,${0.4 + twinkle * 0.6})`;
        ctx.beginPath();
        ctx.arc(tx + Math.cos(angle) * r, ty - 10 + Math.sin(angle) * r * 0.6, 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    if (state.hybrid && !state.morphing) {
      // hanging wooden name sign — below the scar with real separation,
      // never overlapping it. Redraws automatically since it just reads
      // state.hybrid fresh every frame, so a regraft updates it for free.
      const signY = ty + 30;
      ctx.strokeStyle = "#5a4020";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(tx, ty + 8);
      ctx.lineTo(tx, signY);
      ctx.stroke();

      ctx.fillStyle = "#8a6a45";
      ctx.strokeStyle = "#5a4020";
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect ? ctx.roundRect(tx - 24, signY, 48, 18, 3) : ctx.rect(tx - 24, signY, 48, 18);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = "#2e2010";
      ctx.font = "9px sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(state.hybrid, tx, signY + 12);
      ctx.textAlign = "left";
    }
  });
}

function updateSnailWander(deltaTime) {
  if (keys.spaceJustPressed && isPlayerNear(snail.x, 0, 70, 15, 15)) {
    snail.dialogueRevealed = true;
  }

  if (snail.walkState === "paused") {
    snail.pauseTimer -= deltaTime * 1000;
    if (snail.pauseTimer <= 0) {
      snail.walkState = "sliding";
      if (Math.random() < 0.4) snail.direction *= -1;
    }
    return;
  }

  snail.x += snail.direction * SNAIL_SLIME_SPEED * deltaTime;

  if (snail.x <= snail.homeX - snail.wanderRange) snail.direction = 1;
  else if (snail.x >= snail.homeX + snail.wanderRange) snail.direction = -1;

  if (Math.random() < 0.002) {
    snail.walkState = "paused";
    snail.pauseTimer = 2000 + Math.random() * 3000;
  }
}

function drawSnail(camX) {
  const nx = snail.x - camX;
  const ny = gy - 10 + Math.sin(snail.bob) * 1.5;

  // slime trail
  ctx.strokeStyle = "rgba(200,220,200,0.35)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(nx - snail.direction * 14, ny + 4);
  ctx.lineTo(nx - snail.direction * 4, ny + 4);
  ctx.stroke();

  // shell
  ctx.fillStyle = "#c98a4a";
  ctx.strokeStyle = "#8a5a28";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(nx, ny - 5, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.strokeStyle = "rgba(140,90,40,0.5)";
  ctx.beginPath();
  ctx.arc(nx, ny - 5, 5, 0, Math.PI * 2);
  ctx.stroke();

  // body
  ctx.fillStyle = "#8ba876";
  ctx.beginPath();
  ctx.ellipse(nx + snail.direction * 6, ny + 3, 11, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // eye stalks
  ctx.strokeStyle = "#8ba876";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(nx + snail.direction * 14, ny + 1);
  ctx.lineTo(nx + snail.direction * 17, ny - 4);
  ctx.stroke();
  ctx.fillStyle = "#2b2b2b";
  ctx.beginPath();
  ctx.arc(nx + snail.direction * 17, ny - 4, 1.3, 0, Math.PI * 2);
  ctx.fill();

  if (snail.dialogueRevealed && isPlayerNear(snail.x, 0, 70, 15, 15)) {
    const anyHoneyWaiting = Object.values(graftState).some(s => s.honeyGloop);
    drawSpeechBubble(ctx, nx - 20, ny - 30, anyHoneyWaiting ? [
      "I know you love your graph-ts, don't you?",
      "A branch might stick nicely there now."
    ] : [
      "Something sweet and sappy goes a long way."
    ]);
  }
}

/* ======================================================
   SQUIRREL NPC — wanders near the dig site, staged dialogue
   matching real progress (dug-not-planted, planted-not-watered).
   No line yet for "shovel found" (dirt pile redesign might make
   that obvious on its own) or "fully grown" (untested for now).
   ====================================================== */
const squirrel = {
  homeX: 2590,
  x: 2590,
  y: 0,
  width: 26,
  height: 20,
  bob: 0,
  bobSpeed: 0.05,
  tip: 0,
  tailTwitch: 0,
  direction: 1,
  walkState: "walking", // "walking" | "paused"
  pauseTimer: 0,
  wanderRange: 25,
  dialogueRevealed: false, // requires an actual press, not just proximity
  lastStage: null // tracks stage changes so dialogueRevealed resets per new advice
};
const SQUIRREL_WALK_SPEED = 20;

function getSquirrelStage() {
  if (digSite.dug && !digSite.planted) return "dug";
  if (digSite.planted && !digSite.watered) return "planted";
  return null;
}

const SQUIRREL_DIALOGUE = {
  dug: ["Now THAT'S a hole.", "A circus snack might do well in there."],
  planted: ["All planted and patient.", "Thirsty dirt doesn't grow much."]
};

function updateSquirrelWander(deltaTime) {
  squirrel.tailTwitch += deltaTime * 1000 * 0.15;

  const currentStage = getSquirrelStage();
  if (currentStage !== squirrel.lastStage) {
    squirrel.lastStage = currentStage;
    squirrel.dialogueRevealed = false; // new advice — needs a fresh press again
  }
  if (currentStage && keys.spaceJustPressed && isPlayerNear(squirrel.x, 0, 90, 20, 20)) {
    squirrel.dialogueRevealed = true;
  }

  if (squirrel.walkState === "paused") {
    squirrel.pauseTimer -= deltaTime * 1000;
    if (squirrel.pauseTimer <= 0) {
      squirrel.walkState = "walking";
      if (Math.random() < 0.4) squirrel.direction *= -1;
    }
    return;
  }

  squirrel.x += squirrel.direction * SQUIRREL_WALK_SPEED * deltaTime;

  if (squirrel.x <= squirrel.homeX - squirrel.wanderRange) squirrel.direction = 1;
  else if (squirrel.x >= squirrel.homeX + squirrel.wanderRange) squirrel.direction = -1;

  if (Math.random() < 0.003) {
    squirrel.walkState = "paused";
    squirrel.pauseTimer = 1500 + Math.random() * 2500;
  }
}

function drawSquirrel(camX) {
  const sx = squirrel.x - camX;
  const sy = gy - squirrel.height + Math.sin(squirrel.bob) * 2;
  const twitch = Math.sin(squirrel.tailTwitch * 0.3) * 4;

  // fuzzy tail — thick curved stroke, upside-down J shape curling up behind
  ctx.strokeStyle = "#a0693a";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(sx - 8, sy + 10);
  ctx.quadraticCurveTo(sx - 24, sy - 6, sx - 15 + twitch * 0.3, sy - 18);
  ctx.quadraticCurveTo(sx - 9 + twitch, sy - 22, sx - 4 + twitch, sy - 17);
  ctx.stroke();
  // softer overlaid stroke for a fuzzy edge
  ctx.strokeStyle = "rgba(160,115,70,0.5)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(sx - 8, sy + 10);
  ctx.quadraticCurveTo(sx - 24, sy - 6, sx - 15 + twitch * 0.3, sy - 18);
  ctx.quadraticCurveTo(sx - 9 + twitch, sy - 22, sx - 4 + twitch, sy - 17);
  ctx.stroke();

  // body
  ctx.fillStyle = "#a0693a";
  ctx.beginPath();
  ctx.ellipse(sx, sy + 10, 10, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // head
  ctx.beginPath();
  ctx.arc(sx + 8, sy + 3, 6, 0, Math.PI * 2);
  ctx.fill();

  // ears
  ctx.beginPath();
  ctx.arc(sx + 5, sy - 3, 2, 0, Math.PI * 2);
  ctx.arc(sx + 11, sy - 3, 2, 0, Math.PI * 2);
  ctx.fill();

  // eye — same simple dot style as the rabbit
  ctx.fillStyle = "#2b2b2b";
  ctx.beginPath();
  ctx.arc(sx + 10, sy + 2, 1.4, 0, Math.PI * 2);
  ctx.fill();

  // staged dialogue — requires an actual press to reveal (not just being
  // nearby), and stays visible while nearby as long as the stage hasn't
  // changed. A fresh press is needed again once real progress happens.
  if (squirrel.dialogueRevealed && squirrel.lastStage && isPlayerNear(squirrel.x, 0, 90, 20, 20)) {
    drawSpeechBubble(ctx, sx + 15, sy - 40, SQUIRREL_DIALOGUE[squirrel.lastStage]);
  }
}

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
      if (!swing.lastClampedHigh) swing.settleBounceT = 0;
      swing.lastClampedHigh = true;
      swing.angle = SWING_MAX_ANGLE;
      swing.angularVelocity = 0;
    } else if (swing.angle < -SWING_MAX_ANGLE) {
      if (!swing.lastClampedLow) swing.settleBounceT = 0;
      swing.lastClampedLow = true;
      swing.angle = -SWING_MAX_ANGLE;
      swing.angularVelocity = 0;
    } else {
      swing.lastClampedHigh = false;
      swing.lastClampedLow = false;
    }
    if (swing.settleBounceT !== undefined && swing.settleBounceT < SWING_SETTLE_BOUNCE_DURATION) {
      swing.settleBounceT += deltaTime * 1000;
    }

    // track the best speed reached this session — release uses this as a
    // fallback so releasing near the (momentarily zero-velocity) top of
    // the arc still gives you the launch your pumping actually earned
    if (Math.abs(swing.angularVelocity) > Math.abs(swing.peakAngularVelocity)) {
      swing.peakAngularVelocity = swing.angularVelocity;
    }

    // the bar's DISPLAYED value deliberately lags the real momentum via
    // continuous smoothing (closes ~2/3 of the remaining gap per second,
    // not per frame — per-frame would converge almost instantly). Since
    // real momentum reliably plateaus early (a known property of this
    // pendulum physics), the lag keeps the bar visibly creeping upward
    // toward the plateaued value for a while after it's stopped changing —
    // giving a smooth ~4-second climb without needing the physics itself
    // to cooperate.
    const SWING_REALISTIC_MAX_ANGULAR_VEL = 0.09; // recalibrated — 0.105 still needed near-perfect play to look full; this makes good/realistic play (~70-75% correct timing) read as visually near-100%
    const realMomentumProgress = Math.min(Math.abs(swing.peakAngularVelocity) / SWING_REALISTIC_MAX_ANGULAR_VEL, 1);
    const realTimeProgress = Math.min(swing.mountTime / SWING_MIN_MOUNT_TIME, 1);
    const realTarget = Math.min(realMomentumProgress, realTimeProgress);
    swing.displayedCharge += (realTarget - swing.displayedCharge) * (1 - Math.pow(1 / 3, deltaTime));

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
  { x: 150, y: 70, scale: 1,   type: "puffy" },
  { x: 500, y: 45, scale: 0.8, type: "wisp" },
  { x: 850, y: 90, scale: 1.2, type: "stack" },
  { x: 1400, y: 60, scale: 0.9, type: "puffy" }
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
  tip: 0,
  // gentle wander-hop — bounded range stays well clear of the holes (1550+),
  // so there's no need for any special hole-avoidance logic
  hopState: "hopping", // "hopping" | "paused"
  hopDirection: 1,
  hopsRemaining: 3 + Math.floor(Math.random() * 3),
  hopPhase: 0,
  pauseTimer: 0,
  wanderMinX: 900,
  wanderMaxX: 1450
};

const RABBIT_HOP_DURATION = 500;   // ms per individual hop
const RABBIT_HOP_DISTANCE = 25;    // horizontal distance per hop
const RABBIT_HOP_HEIGHT = 8;       // vertical bounce height, visual only
const RABBIT_PAUSE_MIN = 2000;
const RABBIT_PAUSE_MAX = 4000;

function updateRabbitWander(deltaTime) {
  if (rabbit.hopState === "paused") {
    rabbit.pauseTimer -= deltaTime * 1000;
    if (rabbit.pauseTimer <= 0) {
      rabbit.hopState = "hopping";
      rabbit.hopsRemaining = 3 + Math.floor(Math.random() * 3);
      rabbit.hopPhase = 0;
      if (Math.random() < 0.4) rabbit.hopDirection *= -1; // sometimes switches direction
    }
    return;
  }

  rabbit.hopPhase += (deltaTime * 1000) / RABBIT_HOP_DURATION;

  if (rabbit.hopPhase >= 1) {
    rabbit.hopPhase = 0;
    rabbit.hopsRemaining--;

    if (rabbit.x <= rabbit.wanderMinX) rabbit.hopDirection = 1;
    else if (rabbit.x >= rabbit.wanderMaxX) rabbit.hopDirection = -1;

    if (rabbit.hopsRemaining <= 0) {
      rabbit.hopState = "paused";
      rabbit.pauseTimer = RABBIT_PAUSE_MIN + Math.random() * (RABBIT_PAUSE_MAX - RABBIT_PAUSE_MIN);
    }
  }

  // horizontal movement scaled by a bounce curve — fastest mid-hop, slows at landing
  const bounceCurve = Math.sin(rabbit.hopPhase * Math.PI);
  rabbit.x += rabbit.hopDirection * bounceCurve * (RABBIT_HOP_DISTANCE / (RABBIT_HOP_DURATION / 1000)) * deltaTime;
}

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

  springClouds.forEach(c => drawBackgroundCloud(c.x, c.y, c.scale, c.type, camX));

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
  drawTreeSticks(camX);
  drawGraftEffects(camX);
  drawKnockableFruits(camX);
  drawSnail(camX);

  drawSwing(camX);
  drawSwingChargeBar(camX);

  drawGoalCloud(camX);

  drawWiggleBush(camX);
  drawWillow(camX);
  drawDigSitePlantVine(camX);
  drawSquirrel(camX);

  drawRabbit(camX);

  drawConnectionDoor(ctx, camX, connections[0].doors.spring, connections[0]);
  drawConnectionDoor(ctx, camX, connections[1].doors.spring, connections[1]);
  drawSpringDoorVineTendril(camX);
}

// a single thin, pale tendril curling onto one corner of the spring-side
// door's arch -- reads as something recently reaching through, not an
// established mossy growth. Computed from the door's real arch geometry
// (same approach as the forest-side vine fix) so it sits on the curve
// properly instead of floating above it.
function drawSpringDoorVineTendril(camX) {
  const doorDef = connections[1].doors.spring;
  const dx = doorDef.x - camX;
  const frameWidth = doorDef.width;
  const frameHeight = doorDef.height;
  const postWidth = 10;
  const archRadius = (frameWidth - postWidth * 2) / 2;
  const archCenterX = dx + frameWidth / 2;
  const archCenterY = gy - frameHeight + archRadius + postWidth;

  // anchored near the top-right of the arch
  const anchorVx = archRadius - 3;
  const anchorY = archCenterY - Math.sqrt(Math.max(0, archRadius * archRadius - anchorVx * anchorVx));
  const anchorX = archCenterX + anchorVx;

  ctx.strokeStyle = "#7a9e5a"; // pale spring green, not forest's deep moss
  ctx.lineWidth = 3;
  ctx.lineCap = "round";

  // main tendril, longer reach and a real curl at the end
  ctx.beginPath();
  ctx.moveTo(anchorX, anchorY);
  ctx.quadraticCurveTo(anchorX + 18, anchorY - 10, anchorX + 30, anchorY + 8);
  ctx.quadraticCurveTo(anchorX + 36, anchorY + 18, anchorX + 28, anchorY + 22);
  ctx.stroke();

  // a second, shorter tendril branching off for more presence
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(anchorX + 12, anchorY - 2);
  ctx.quadraticCurveTo(anchorX + 16, anchorY - 14, anchorX + 8, anchorY - 18);
  ctx.stroke();

  // a bud at the tip of the main tendril
  ctx.fillStyle = "#c98fae";
  ctx.beginPath();
  ctx.arc(anchorX + 28, anchorY + 22, 3.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#e0a8c0";
  ctx.beginPath();
  ctx.arc(anchorX + 27, anchorY + 20.5, 1.6, 0, Math.PI * 2);
  ctx.fill();

  // a smaller bud on the second tendril
  ctx.fillStyle = "#c98fae";
  ctx.beginPath();
  ctx.arc(anchorX + 8, anchorY - 18, 2.6, 0, Math.PI * 2);
  ctx.fill();

  // several leaves along both curls, bigger and more visible
  ctx.fillStyle = "#8fbf6a";
  [[anchorX + 8, anchorY - 4, -0.4], [anchorX + 20, anchorY, 0.5], [anchorX + 26, anchorY + 14, -0.3], [anchorX + 13, anchorY - 9, 0.7]].forEach(([lx, ly, rot]) => {
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 2.8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// FOREST -- entered from Spring via a second apple slice, same door
// mechanic reused deliberately (keeps the game's language consistent)
// but everything about the space itself signals "this isn't the next
// season, this is somewhere else": darker, mossier, a little wilder.
// Base environment only for this pass -- stream/snake/branches come later.
function drawForestScene(camX) {
  // deep, muted under-canopy sky -- darker and greener than spring's
  // light pastels, no bright horizon glow
  const sky = ctx.createLinearGradient(0, 0, 0, gy);
  sky.addColorStop(0, "#2e3b26");
  sky.addColorStop(0.4, "#3a4a2e");
  sky.addColorStop(0.75, "#4a5c38");
  sky.addColorStop(1, "#5a6a42");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, gy);

  // dappled light -- a few soft, irregular pale patches, like sun
  // breaking weakly through a canopy rather than an open sky
  ctx.fillStyle = "rgba(220,225,180,0.06)";
  for (let i = 0; i < 6; i++) {
    const dx = (i * 260 + 90) - camX * 0.35;
    ctx.beginPath();
    ctx.ellipse(dx, 60 + Math.sin(i * 1.7) * 30, 70, 40, 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // dense background tree silhouettes, tall and close together --
  // reads as thicker, more enclosed than spring's open orchard feel
  ctx.fillStyle = "rgba(20,28,16,0.5)";
  for (let i = 0; i < 10; i++) {
    const tx = i * 150 - camX * 0.4 + Math.sin(i * 2.3) * 30;
    const th = 220 + Math.sin(i * 1.1) * 40;
    ctx.fillRect(tx - 9, gy - th, 18, th);
    ctx.beginPath();
    ctx.arc(tx, gy - th, 48 + Math.sin(i * 0.7) * 10, 0, Math.PI * 2);
    ctx.fill();
  }

  // mid-distance foliage clusters, a touch warmer/lighter so the
  // background doesn't read as one flat wall of dark green
  ctx.fillStyle = "rgba(70,95,45,0.4)";
  for (let i = 0; i < 6; i++) {
    const tx = i * 240 - camX * 0.55;
    ctx.beginPath();
    ctx.arc(tx + 30, gy - 90, 55, 0, Math.PI * 2);
    ctx.arc(tx + 80, gy - 100, 50, 0, Math.PI * 2);
    ctx.fill();
  }

  // ground -- mossy green, lightened a touch per feedback, no
  // grass-blade texture yet, kept simple for this base pass
  ctx.fillStyle = "#4d5c35";
  ctx.fillRect(0, gy, canvas.width, canvas.height - gy);
  ctx.fillStyle = "rgba(30,38,20,0.35)";
  for (let i = -30; i < canvas.width + 30; i += 26) {
    ctx.beginPath();
    ctx.ellipse((i - camX % 26), gy + 6, 10, 4, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  drawForestEntranceFerns(camX);
  drawForestBrambleBehind(camX);
  drawForestSnake(camX);
  // drawForestBrambleFront now called after the player sprite in the
  // main draw() function -- the player is drawn globally after the
  // whole scene, so calling it here never actually put anything in
  // front of the player
  drawForestBridgePlatform(camX);

  drawConnectionDoor(ctx, camX, connections[1].doors.forest, connections[1]);
  drawMossyDoorOverlay(camX);
}

// moss patches and hanging vines layered on top of the standard door
// shape -- reuses the proven door mechanic underneath while still
// giving this entrance its own distinct, overgrown look
function drawMossyDoorOverlay(camX) {
  const doorDef = connections[1].doors.forest;
  const dx = doorDef.x - camX;
  const frameWidth = doorDef.width;
  const frameHeight = doorDef.height;
  const postWidth = 10;
  const archRadius = (frameWidth - postWidth * 2) / 2;
  const archCenterX = dx + frameWidth / 2;
  const archCenterY = gy - frameHeight + archRadius + postWidth;

  // vines now start from the door's actual curved arch surface -- each
  // one's starting y is computed from the real circle geometry at its
  // x-offset, so it always sits right on the door instead of floating
  // above it once the offset goes past the arch's own radius
  ctx.strokeStyle = "#4a6a2e";
  ctx.lineWidth = 3;
  const vineOffsets = [-14, -3, 8, 16];
  vineOffsets.forEach((vx, i) => {
    const clampedVx = Math.max(-archRadius + 2, Math.min(archRadius - 2, vx));
    const archY = archCenterY - Math.sqrt(Math.max(0, archRadius * archRadius - clampedVx * clampedVx));
    const startX = archCenterX + clampedVx;
    const dropLen = 26 + (i % 3) * 10;
    ctx.beginPath();
    ctx.moveTo(startX, archY);
    ctx.quadraticCurveTo(startX + Math.sin(i * 1.7) * 5, archY + dropLen * 0.6, startX + Math.sin(i * 2.3) * 4, archY + dropLen);
    ctx.stroke();
    // a couple small leaves along each vine
    ctx.fillStyle = "#5d7a3a";
    ctx.beginPath();
    ctx.ellipse(startX + 3, archY + dropLen * 0.5, 4, 2.4, 0.6, 0, Math.PI * 2);
    ctx.fill();
  });

  // moss patches on the frame itself
  ctx.fillStyle = "rgba(90,120,60,0.55)";
  [[dx + 6, gy - 30, 12], [dx + frameWidth - 10, gy - 60, 10], [dx + 10, gy - frameHeight + 20, 9], [dx + frameWidth - 8, gy - frameHeight + 35, 8]].forEach(([mx, my, mr]) => {
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, Math.PI * 2);
    ctx.fill();
  });
}

// a few ferns scattered near the entrance, simple ground texture for
// this first pass
function drawForestEntranceFerns(camX) {
  const fernSpots = [connections[1].doors.forest.x + 60, connections[1].doors.forest.x + 140, connections[1].doors.forest.x + 220];
  fernSpots.forEach((fx, i) => {
    const sx = fx - camX;
    ctx.strokeStyle = "#4a6a2e";
    ctx.lineWidth = 2;
    for (let j = -2; j <= 2; j++) {
      ctx.beginPath();
      ctx.moveTo(sx, gy);
      ctx.quadraticCurveTo(sx + j * 8, gy - 18, sx + j * 14, gy - 30 - Math.abs(j) * 2);
      ctx.stroke();
    }
  });
}

// forest snake -- a big, loosely-winding creature doing its own slow
// loop, entirely on the near side (never crosses the eventual stream).
// The player can hop on, ride the loop, and grab a bridge piece at
// one specific point along it if the timing lines up -- missing it
// just means going around again, no fail state. Positioned close to
// the entrance for now; will move dockB further into the zone once
// more content exists to fill that gap.
const FOREST_SNAKE_HEIGHT_ABOVE_GROUND = 32; // raised enough that reaching it actually requires a jump
const forestSnake = {
  dockA: { x: 450 }, // offset from the forest door
  dockB: { x: 850 }, // move this further right later, once more content fills the gap
  state: "docked", // "docked" | "traveling"
  dockedAt: "A",
  t: 0,
  DOCK_TIME: 3500,
  TRAVEL_TIME: 6000, // slow, deliberate crossing
  currentX: 450,
  riding: false,
  dismountCooldown: 0, // brief window after hopping off where re-mounting is suppressed, so hopping off doesn't immediately re-catch the player at the same height
  facingDir: 1 // smoothly eased toward the target direction, rather than snapping instantly when dockedAt flips -- fixes the body jumping to the opposite side of the head the moment it turns around
};

// fixed relative body shape, trailing behind the head (dx=0) with
// some vertical undulation -- direction of the trail flips depending
// on which way the snake is currently heading, so the body always
// trails behind rather than leading
const FOREST_SNAKE_BODY = [
  { dx: 0, dy: 0 },
  { dx: -20, dy: 6 },
  { dx: -45, dy: -3 },
  { dx: -70, dy: 8 },
  { dx: -95, dy: -4 },
  { dx: -120, dy: 7 },
  { dx: -145, dy: -2 },
  { dx: -170, dy: 5 }
];

// where along the body (0 to 1, head to tail) the bridge piece can be grabbed
const FOREST_SNAKE_GRAB_AT = 0.5;

function getForestSnakePoint(progress) {
  // progress 0 = head, 1 = tail
  const n = FOREST_SNAKE_BODY.length;
  const scaled = Math.max(0, Math.min(1, progress)) * (n - 1);
  const i0 = Math.floor(scaled);
  const i1 = Math.min(i0 + 1, n - 1);
  const t = scaled - i0;
  const p0 = FOREST_SNAKE_BODY[i0];
  const p1 = FOREST_SNAKE_BODY[i1];
  const dir = forestSnake.facingDir; // smoothly eased, not an instant flip -- see updateForestScene
  return {
    x: forestSnake.currentX + dir * (p0.dx + (p1.dx - p0.dx) * t),
    y: p0.dy + (p1.dy - p0.dy) * t
  };
}

// bramble barrier -- blocks ground travel entirely between the two
// snake docks, dense enough that walking through isn't a readable
// option. Split into behind/front layers around the snake's own
// drawing call so it genuinely weaves through rather than just
// passing in front of a flat backdrop.
const FOREST_BRAMBLE_X1 = 530;
const FOREST_BRAMBLE_X2 = 770;

function drawForestBrambleBehind(camX) {
  const x1 = FOREST_BRAMBLE_X1 - camX, x2 = FOREST_BRAMBLE_X2 - camX;
  const w = x2 - x1;
  const baseY = gy - 6;
  ctx.lineCap = "round";

  ctx.strokeStyle = "#2e3520";
  ctx.lineWidth = 10;
  ctx.beginPath();
  ctx.moveTo(x1, baseY - 24);
  ctx.bezierCurveTo(x1 + w * 0.22, baseY - 55, x1 + w * 0.37, baseY - 12, x1 + w * 0.52, baseY - 48);
  ctx.bezierCurveTo(x1 + w * 0.67, baseY - 78, x1 + w * 0.78, baseY - 25, x2, baseY - 50);
  ctx.stroke();

  ctx.strokeStyle = "#3f5527";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(x1 + w * 0.04, baseY - 50);
  ctx.bezierCurveTo(x1 + w * 0.26, baseY - 20, x1 + w * 0.4, baseY - 68, x1 + w * 0.58, baseY - 32);
  ctx.bezierCurveTo(x1 + w * 0.74, baseY - 10, x1 + w * 0.84, baseY - 58, x2 - 5, baseY - 18);
  ctx.stroke();

  ctx.strokeStyle = "#2e3520";
  ctx.lineWidth = 8;
  ctx.beginPath();
  ctx.moveTo(x1 + w * 0.1, baseY - 8);
  ctx.bezierCurveTo(x1 + w * 0.3, baseY - 42, x1 + w * 0.46, baseY - 6, x1 + w * 0.63, baseY - 40);
  ctx.bezierCurveTo(x1 + w * 0.8, baseY - 68, x1 + w * 0.9, baseY - 15, x2 - w * 0.02, baseY - 36);
  ctx.stroke();

  ctx.fillStyle = "#2e3520";
  [0.14, 0.3, 0.45, 0.6, 0.75, 0.88].forEach((f, i) => {
    const tx = x1 + w * f, ty = baseY - (25 + (i % 3) * 15);
    ctx.beginPath();
    ctx.moveTo(tx, ty); ctx.lineTo(tx + 8, ty - 9); ctx.lineTo(tx + 2, ty + 7);
    ctx.closePath(); ctx.fill();
  });
  [0.22, 0.5, 0.7].forEach((f, i) => {
    const fx = x1 + w * f, fy = baseY - (35 + (i % 2) * 18);
    ctx.fillStyle = "#d98fae";
    ctx.beginPath(); ctx.arc(fx, fy, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f0d8c8";
    ctx.beginPath(); ctx.arc(fx, fy, 2, 0, Math.PI * 2); ctx.fill();
  });
}

function drawForestBrambleFront(camX) {
  const x1 = FOREST_BRAMBLE_X1 - camX, x2 = FOREST_BRAMBLE_X2 - camX;
  const w = x2 - x1;
  const baseY = gy - 6;
  ctx.lineCap = "round";

  ctx.strokeStyle = "#2e3520";
  ctx.lineWidth = 11;
  ctx.beginPath();
  ctx.moveTo(x1 - 5, baseY);
  ctx.bezierCurveTo(x1 + w * 0.24, baseY - 82, x1 + w * 0.4, baseY - 100, x1 + w * 0.56, baseY - 70);
  ctx.bezierCurveTo(x1 + w * 0.72, baseY - 45, x1 + w * 0.86, baseY - 95, x2 + 5, baseY - 62);
  ctx.stroke();

  ctx.strokeStyle = "#3f5527";
  ctx.lineWidth = 7;
  ctx.beginPath();
  ctx.moveTo(x1 + w * 0.02, baseY - 10);
  ctx.bezierCurveTo(x1 + w * 0.28, baseY - 92, x1 + w * 0.44, baseY - 62, x1 + w * 0.6, baseY - 100);
  ctx.bezierCurveTo(x1 + w * 0.76, baseY - 130, x1 + w * 0.88, baseY - 68, x2, baseY - 100);
  ctx.stroke();

  ctx.strokeStyle = "#2e3520";
  ctx.lineWidth = 9;
  ctx.beginPath();
  ctx.moveTo(x1 + w * 0.08, baseY - 5);
  ctx.bezierCurveTo(x1 + w * 0.32, baseY - 58, x1 + w * 0.5, baseY - 28, x1 + w * 0.68, baseY - 62);
  ctx.bezierCurveTo(x1 + w * 0.82, baseY - 82, x1 + w * 0.92, baseY - 40, x2 - 10, baseY - 55);
  ctx.stroke();

  ctx.fillStyle = "#2e3520";
  [0.1, 0.24, 0.4, 0.53, 0.68, 0.82, 0.93].forEach((f, i) => {
    const tx = x1 + w * f, ty = baseY - (40 + (i % 4) * 18);
    ctx.beginPath();
    ctx.moveTo(tx, ty); ctx.lineTo(tx + 9, ty - 10); ctx.lineTo(tx + 2, ty + 8);
    ctx.closePath(); ctx.fill();
  });
  [0.18, 0.46, 0.64, 0.85].forEach((f, i) => {
    const fx = x1 + w * f, fy = baseY - (48 + (i % 3) * 20);
    ctx.fillStyle = "#e0a8c0";
    ctx.beginPath(); ctx.arc(fx, fy, 6, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#f0d8c8";
    ctx.beginPath(); ctx.arc(fx, fy, 2.2, 0, Math.PI * 2); ctx.fill();
  });
}

// bridge-piece platform -- sits within the bramble span, below the
// snake's own height, reachable only by hopping off mid-crossing.
// Collect it here, then hop back on the snake before it moves too
// far away, or wait for the next crossing.
const FOREST_BRIDGE_PLATFORM_X = 650;
const FOREST_BRIDGE_PLATFORM_HEIGHT = 22;

function drawForestBridgePlatform(camX) {
  if (inventory.bridgePiece) return; // already collected, nothing left to show
  const px = FOREST_BRIDGE_PLATFORM_X - camX;
  const py = gy - FOREST_BRIDGE_PLATFORM_HEIGHT;
  ctx.fillStyle = "#6b4a2a";
  ctx.fillRect(px - 22, py, 44, 8);
  ctx.strokeStyle = "#4a3018";
  ctx.lineWidth = 1;
  ctx.strokeRect(px - 22, py, 44, 8);
  // the bridge piece itself -- a small log-like chunk
  ctx.fillStyle = "#8a6030";
  ctx.beginPath();
  ctx.ellipse(px, py - 8, 11, 7, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#4a3018";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#c9a878";
  ctx.beginPath();
  ctx.ellipse(px - 6, py - 8, 3, 5, 0, 0, Math.PI * 2);
  ctx.fill();
}

function drawForestSnake(camX) {
  const segments = 60; // how finely to sample the loop for a smooth body
  const basePoints = [];
  for (let i = 0; i <= segments; i++) {
    const p = getForestSnakePoint(i / segments);
    basePoints.push({ x: p.x - camX, y: gy - FOREST_SNAKE_HEIGHT_ABOVE_GROUND + p.y });
  }

  // slithering wave -- perpendicular offset that travels along the
  // body over time, purely visual, doesn't affect the actual loop
  // position used for riding
  const t = performance.now();
  const points = basePoints.map((pt, i) => {
    const prev = basePoints[Math.max(0, i - 1)];
    const next = basePoints[Math.min(basePoints.length - 1, i + 1)];
    const dx = next.x - prev.x, dy = next.y - prev.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    const nx = -dy / len, ny = dx / len; // perpendicular unit vector
    const wave = Math.sin(i * 0.5 - t * 0.006) * 5;
    return { x: pt.x + nx * wave, y: pt.y + ny * wave };
  });

  // body -- thick rounded-line path, dark outline then lighter fill,
  // same two-pass technique as the color-pattern sketch
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = "#3a2c14";
  ctx.lineWidth = 30;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();

  ctx.strokeStyle = "#c99a2e";
  ctx.lineWidth = 23;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
  ctx.stroke();

  // diamond markings along the body, alternating rust-red and olive,
  // sized to actually fit within the body width
  const diamondColors = ["#a8452e", "#8a9a5a"];
  for (let i = 0; i < segments; i += 3) {
    const p = points[i];
    const next = points[Math.min(i + 1, points.length - 1)];
    const angle = Math.atan2(next.y - p.y, next.x - p.x);
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(angle);
    ctx.strokeStyle = "#3a2c14";
    ctx.lineWidth = 1.2;
    ctx.fillStyle = diamondColors[(i / 3) % 2];
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(9, 0);
    ctx.lineTo(0, 9);
    ctx.lineTo(-9, 0);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }

  // head at the front, facing the actual direction of travel (not
  // toward its own trailing body, which was the earlier bug) -- a
  // small wobble keeps it from looking perfectly rigid
  const headP = points[0];
  const headWobble = Math.sin(t * 0.006) * 0.12;
  const headAngle = Math.acos(Math.max(-1, Math.min(1, forestSnake.facingDir))) + headWobble;
  ctx.save();
  ctx.translate(headP.x, headP.y);
  ctx.rotate(headAngle);
  ctx.fillStyle = "#c99a2e";
  ctx.strokeStyle = "#3a2c14";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, 19, 15, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  // tongue -- flicks in and out rather than staying fixed
  const tongueOut = Math.max(0, Math.sin(t * 0.004));
  if (tongueOut > 0.05) {
    ctx.strokeStyle = "#a8302a";
    ctx.lineWidth = 1.3;
    const tongueLen = 10 * tongueOut;
    ctx.beginPath();
    ctx.moveTo(18, 2);
    ctx.lineTo(18 + tongueLen, 2);
    ctx.moveTo(18 + tongueLen, 2);
    ctx.lineTo(18 + tongueLen + 3, -1.5);
    ctx.moveTo(18 + tongueLen, 2);
    ctx.lineTo(18 + tongueLen + 3, 5.5);
    ctx.stroke();
  }
  // eye -- light iris ring, dark pupil, sized to actually read at this scale
  ctx.fillStyle = "#f0ead9";
  ctx.strokeStyle = "#3a2c14";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.arc(6, -3, 4.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = "#20200f";
  ctx.beginPath();
  ctx.arc(5, -3, 2.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function updateForestScene(deltaTime) {
  // bramble blocks ground-level travel entirely -- only passable by
  // riding the snake over it, well above the ground-level threshold
  if (player.y < 18) {
    if (player.x + player.width > FOREST_BRAMBLE_X1 && player.x < FOREST_BRAMBLE_X1 && keys.right) {
      player.x = FOREST_BRAMBLE_X1 - player.width;
    }
    if (player.x < FOREST_BRAMBLE_X2 && player.x + player.width > FOREST_BRAMBLE_X2 && keys.left) {
      player.x = FOREST_BRAMBLE_X2;
    }
    if (player.x > FOREST_BRAMBLE_X1 - player.width && player.x < FOREST_BRAMBLE_X2) {
      // already inside somehow (e.g. hopped off the snake mid-span) -- push back out the nearest side
      const distToLeft = player.x - FOREST_BRAMBLE_X1;
      const distToRight = FOREST_BRAMBLE_X2 - player.x;
      player.x = Math.abs(distToLeft) < Math.abs(distToRight) ? FOREST_BRAMBLE_X1 - player.width : FOREST_BRAMBLE_X2;
    }
  }

  // bridge-piece platform -- standard platform landing, then a space
  // press while standing on it collects the piece
  if (!inventory.bridgePiece) {
    const platTop = FOREST_BRIDGE_PLATFORM_HEIGHT;
    if (
      player.x + player.width > FOREST_BRIDGE_PLATFORM_X - 22 &&
      player.x < FOREST_BRIDGE_PLATFORM_X + 22 &&
      player.y <= platTop &&
      player.y >= platTop - 20 &&
      player.vy <= 0
    ) {
      player.y = platTop;
      player.vy = 0;
      player.jumping = false;
      player.usedDoubleJump = false;
    }
    if (
      Math.abs(player.y - platTop) < 2 &&
      player.x + player.width > FOREST_BRIDGE_PLATFORM_X - 22 &&
      player.x < FOREST_BRIDGE_PLATFORM_X + 22 &&
      keys.spaceJustPressed
    ) {
      inventory.bridgePiece = 1;
      updateInventoryUI();
    }
  }

  forestSnake.t += deltaTime * 1000;

  // ease the facing direction smoothly toward whichever way the snake
  // is currently supposed to be heading, rather than snapping
  // instantly -- this is what stops the body jumping to the opposite
  // side of the head the moment it docks and turns around
  const targetDir = forestSnake.dockedAt === "A" ? 1 : -1;
  const dirDiff = targetDir - forestSnake.facingDir;
  if (Math.abs(dirDiff) > 0.01) {
    forestSnake.facingDir += dirDiff * Math.min(1, 0.005 * deltaTime * 1000);
  } else {
    forestSnake.facingDir = targetDir;
  }

  if (forestSnake.state === "docked") {
    const dock = forestSnake.dockedAt === "A" ? forestSnake.dockA : forestSnake.dockB;
    forestSnake.currentX = dock.x;
    if (forestSnake.t >= forestSnake.DOCK_TIME) {
      forestSnake.state = "traveling";
      forestSnake.t = 0;
    }
  } else {
    const from = forestSnake.dockedAt === "A" ? forestSnake.dockA : forestSnake.dockB;
    const to = forestSnake.dockedAt === "A" ? forestSnake.dockB : forestSnake.dockA;
    const progress = Math.min(forestSnake.t / forestSnake.TRAVEL_TIME, 1);
    forestSnake.currentX = from.x + (to.x - from.x) * progress;
    if (progress >= 1) {
      forestSnake.state = "docked";
      forestSnake.dockedAt = forestSnake.dockedAt === "A" ? "B" : "A";
      forestSnake.t = 0;
    }
  }

  if (forestSnake.dismountCooldown > 0) forestSnake.dismountCooldown -= deltaTime * 1000;

  if (!forestSnake.riding) {
    // requires an actual jump and landing on the body, same pattern
    // as landing on any other platform -- not just standing nearby
    // and pressing a button. Suppressed briefly right after hopping
    // off so it doesn't immediately re-catch the player at the same
    // height they just dismounted from.
    if (player.vy <= 0 && forestSnake.dismountCooldown <= 0) {
      const segments = 30;
      for (let i = 0; i <= segments; i++) {
        const p = getForestSnakePoint(i / segments);
        const bodyTop = FOREST_SNAKE_HEIGHT_ABOVE_GROUND - p.y;
        if (
          player.x + player.width > p.x - 16 &&
          player.x < p.x + 16 &&
          player.y <= bodyTop &&
          player.y >= bodyTop - 15
        ) {
          forestSnake.riding = true;
          forestSnake.riderBodyProgress = i / segments; // where along the body, head to tail, the player landed
          player.jumping = false;
          player.usedDoubleJump = false;
          player.vy = 0;
          break;
        }
      }
    }
  } else {
    // while riding, follow the same fixed point along the body,
    // which travels along with the snake as a whole
    const riderP = getForestSnakePoint(forestSnake.riderBodyProgress);
    player.x = riderP.x - player.width / 2;
    player.y = FOREST_SNAKE_HEIGHT_ABOVE_GROUND - riderP.y;

    // hop off with the down key -- upJustPressed was also triggering
    // a normal jump in handleInput() (which runs before this scene
    // code), launching the player upward unexpectedly right as they
    // tried to dismount. down matches the same pattern already used
    // to dismount the rabbit shuttle elsewhere in the game.
    if (keys.down) {
      forestSnake.riding = false;
      forestSnake.dismountCooldown = 400;
    }
  }

  if (
    connections[1].filled &&
    seasonTransition.phase === "idle" &&
    pressedDownNear(
      connections[1].doors.forest.x + connections[1].doors.forest.width / 2,
      0, 30, 6, 6
    )
  ) {
    startSeasonTransition("spring");
  }
}

// swing: rope + wooden seat, position derived from its current angle
function drawSwing(camX) {
  // purely cosmetic settle-bounce — a quick decaying wobble right when the
  // amplitude clamp is hit, so it reads as a soft bounce instead of an
  // instant wall-stop. Never touches the real swing.angle/angularVelocity.
  let displayAngle = swing.angle;
  if (swing.settleBounceT < SWING_SETTLE_BOUNCE_DURATION) {
    const bp = swing.settleBounceT / SWING_SETTLE_BOUNCE_DURATION;
    const wobble = Math.sin(bp * Math.PI * 3) * 0.07 * (1 - bp);
    displayAngle = swing.angle - wobble * Math.sign(swing.angle || 1);
  }

  const bob = swingBobPosition(displayAngle);
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
  ctx.rotate(displayAngle);
  ctx.fillStyle = "#8a5a2e";
  ctx.fillRect(-14, 0, 28, 6);
  ctx.restore();
}

// charge bar — fixed below the swing's base (not tracking the player), with
// its own opaque backing panel so the fill color never has to fight
// spring's green background directly. Orange -> green as charge builds,
// gentle sparkle once fully charged.
function drawSwingChargeBar(camX) {
  if (!swing.mounted) return;

  const barWidth = 60;
  const barHeight = 8;
  const barX = swing.pivotX - camX - barWidth / 2;
  const barY = gy + 15;

  // reads the smoothed value maintained in updateSwing — deliberately lags
  // the real (plateauing) momentum so it keeps visibly climbing toward ~4s
  const chargeProgress = swing.displayedCharge;

  // backing panel
  ctx.fillStyle = "rgba(30,30,30,0.6)";
  ctx.fillRect(barX - 3, barY - 3, barWidth + 6, barHeight + 6);

  // fill — orange to green
  const r = Math.round(230 - chargeProgress * 150);
  const g = Math.round(140 + chargeProgress * 90);
  ctx.fillStyle = `rgb(${r},${g},60)`;
  ctx.fillRect(barX, barY, barWidth * chargeProgress, barHeight);

  ctx.strokeStyle = "rgba(255,255,255,0.4)";
  ctx.lineWidth = 1;
  ctx.strokeRect(barX, barY, barWidth, barHeight);

  if (chargeProgress >= 0.9) {
    for (let i = 0; i < 3; i++) {
      const sx = barX + (barWidth / 3) * i + barWidth / 6;
      const sy = barY + barHeight / 2 + Math.sin(performance.now() * 0.008 + i) * 2;
      const twinkle = Math.sin(performance.now() * 0.01 + i * 2) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(255,255,255,${0.5 + twinkle * 0.5})`;
      ctx.beginPath();
      ctx.arc(sx, sy, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }
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
  // cosmetic notice-wiggle — runs on its own clock, but stops for good
  // once the bush has actually been used (nothing left to draw attention to)
  if (!wiggleBush.bucketTaken) {
    wiggleBush.noticeTimer -= deltaTime * 1000;
    if (wiggleBush.noticeTimer <= 0) {
      wiggleBush.noticeWiggle = 180;
      wiggleBush.noticeTimer = 7000 + Math.random() * 4000;
    }
    if (wiggleBush.noticeWiggle > 0) wiggleBush.noticeWiggle--;
  }

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

function drawWillow(camX) {
  if (!hasReturnedFromClouds) return;

  const wx = willow.x - camX;
  const progress = willow.opened ? 1 : (willow.holdProgress > 0 ? 0.15 + (willow.holdProgress / WILLOW_HOLD_DURATION) * 0.85 : 0);
  const gap = progress * 22;
  const shake = willow.noticeWiggle > 0 ? Math.sin(willow.noticeWiggle * 0.4) * 1.5 : 0;

  // trunk
  ctx.fillStyle = "#6b4a30";
  ctx.fillRect(wx - 9, gy - 95, 18, 95);

  // canopy top — unified with the strand color so the whole plant blends as one green
  ctx.fillStyle = "rgba(85,120,70,0.85)";
  ctx.beginPath();
  ctx.arc(wx, gy - 125, 40, 0, Math.PI * 2);
  ctx.fill();

  // drooping strands — origins stay fixed at the canopy; only the TIPS
  // spread outward as the willow opens, forming a genuine teepee shape
  // rather than the whole strand sliding sideways. Each strand is a wavy
  // S-curve (two connected quadratics), with a gentle sway for life.
  ctx.strokeStyle = "rgba(85,120,70,0.85)";
  ctx.lineWidth = 2;
  const sway = Math.sin(performance.now() * 0.0012) * 3;

  function drawStrandHalf(sideSign) {
    const strandCount = 7;
    for (let i = 0; i < strandCount; i++) {
      // spread origins along the canopy's lower curve, not a flat row
      const originAngle = sideSign > 0
        ? (0.15 + (i / strandCount) * 0.55) * Math.PI
        : (1 - 0.15 - (i / strandCount) * 0.55) * Math.PI;
      const originX = wx + Math.cos(originAngle) * 36;
      const originY = (gy - 125) + Math.sin(originAngle) * 20;

      const droop = 85 + Math.sin(i * 1.3) * 15; // nearly double the old length
      const strandSway = sway * (0.5 + (i / strandCount) * 0.8) * sideSign;
      const tipSpread = gap * sideSign; // ONLY the tip moves as the willow opens

      const midX = originX + strandSway * 0.6 + Math.sin(i * 2.1) * 4 + tipSpread * 0.5 + shake * 0.5;
      const midY = originY + droop * 0.5;
      const endX = originX + strandSway + Math.sin(i * 1.7) * 3 + tipSpread + shake;
      const endY = originY + droop;

      ctx.beginPath();
      ctx.moveTo(originX, originY);
      ctx.quadraticCurveTo(originX + 5 * sideSign, originY + droop * 0.28, midX, midY);
      ctx.quadraticCurveTo(midX - 3 * sideSign, midY + droop * 0.28, endX, endY);
      ctx.stroke();
    }
  }

  drawStrandHalf(-1);
  drawStrandHalf(1);

  // shovel visible in the gap once fully parted, until taken — soft glow
  // and gentle bob so it actually catches the eye against the strand lines
  if (willow.opened && !willow.shovelTaken) {
    const shovelBob = Math.sin(performance.now() * 0.003) * 3;
    const glowPulse = Math.sin(performance.now() * 0.004) * 0.5 + 0.5;

    ctx.fillStyle = `rgba(255,225,150,${0.25 + glowPulse * 0.2})`;
    ctx.beginPath();
    ctx.arc(wx, gy - 50 + shovelBob, 22, 0, Math.PI * 2);
    ctx.fill();

    drawShovelShape(ctx, wx, gy - 50 + shovelBob, 17, 0.3);
  }
}

function drawDigSitePlantVine(camX) {
  if (!hasReturnedFromClouds) return;

  const dx = digSite.x - camX;

  // visually distinct turned-earth patch — visible even before digging,
  // an "already sitting there, waiting to be noticed" element like the stump.
  // Built from a cluster of small irregular clumps for a granular, actually
  // dirt-like texture instead of one flat smooth shape.
  const dirtClumps = [
    { dx: -16, dy: 1, r: 5 }, { dx: -9, dy: -2, r: 4 }, { dx: -3, dy: 2, r: 5.5 },
    { dx: 4, dy: -1, r: 4.5 }, { dx: 11, dy: 2, r: 5 }, { dx: 17, dy: -1, r: 4 },
    { dx: -12, dy: 3, r: 3.5 }, { dx: 0, dy: -3, r: 3.5 }, { dx: 8, dy: 3, r: 3.5 },
    { dx: 15, dy: 1, r: 3 }, { dx: -18, dy: -1, r: 3 }, { dx: 20, dy: 2, r: 3 }
  ];
  dirtClumps.forEach((c, i) => {
    ctx.fillStyle = i % 2 === 0 ? "rgba(100,72,44,0.75)" : "rgba(80,56,34,0.75)";
    ctx.beginPath();
    ctx.ellipse(dx + c.dx, gy + 2 + c.dy, c.r, c.r * 0.6, 0, 0, Math.PI * 2);
    ctx.fill();
  });

  // a small partial indent, visible even before digging — suggests
  // "diggable" through the environment itself, no dialogue needed
  if (!digSite.dug) {
    ctx.fillStyle = "rgba(50,36,22,0.5)";
    ctx.beginPath();
    ctx.ellipse(dx, gy + 2, 6, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  const pitDepth = gy + PEANUT_PIT_DEPTH; // the below-ground anchor everything shares

  if (digSite.dug) {
    // the hole itself — genuinely deep now, real radial-gradient shading
    const pit = ctx.createRadialGradient(dx, gy + 8, 1, dx, gy + 8, 28);
    pit.addColorStop(0, "rgba(15,11,7,0.97)");
    pit.addColorStop(0.6, "rgba(30,24,15,0.9)");
    pit.addColorStop(1, "rgba(60,50,30,0)");
    ctx.fillStyle = pit;
    ctx.beginPath();
    ctx.ellipse(dx, gy + 8, 22, 16, 0, 0, Math.PI * 2);
    ctx.fill();

    // one-shot dirt-flourish animation — slower, full circle, bigger and more visible
    if (digSite.digAnimT < DIG_ANIM_DURATION) {
      const p = digSite.digAnimT / DIG_ANIM_DURATION;
      for (let i = 0; i < 10; i++) {
        const angle = (i / 10) * Math.PI * 2;
        const dist = p * 30;
        ctx.fillStyle = `rgba(120,88,55,${1 - p})`;
        ctx.beginPath();
        ctx.arc(dx + Math.cos(angle) * dist, gy - p * 20 + Math.sin(angle) * dist * 0.4, 3.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // water pooled around the planted peanut, once watered
    if (digSite.watered) {
      ctx.fillStyle = "rgba(90,150,210,0.55)";
      ctx.beginPath();
      ctx.ellipse(dx, gy + 5, 17, 8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "rgba(150,200,230,0.4)";
      ctx.beginPath();
      ctx.ellipse(dx - 4, gy + 3, 5, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // the peanut itself — falls gently from hand height down into the pit,
  // settling below the flat ground line, until it's watered and grows
  if (digSite.planted && !peanutVine.grown) {
    const fallP = Math.min(digSite.plantAnimT / PLANT_FALL_DURATION, 1);
    const startY = gy - 25;
    const peanutY = startY + (pitDepth - startY) * fallP;
    drawPeanutShape(ctx, dx, peanutY, 9, fallP * 0.5);
  }

  if (peanutVine.grown || digSite.watered) {
    // growing/grown — the sprout scales continuously from the pit all the
    // way to full climbHeight, so there's no sudden jump once "grown" flips
    const currentHeight = peanutVine.grown ? peanutVine.climbHeight : peanutVine.growProgress * peanutVine.climbHeight;
    ctx.strokeStyle = "#5a8a4a";
    ctx.lineWidth = peanutVine.grown ? 6 : 3 + (currentHeight / peanutVine.climbHeight) * 3;
    ctx.beginPath();
    ctx.moveTo(dx, pitDepth); // anchored below ground, at the peanut's depth
    const segments = Math.max(2, Math.round((currentHeight / peanutVine.climbHeight) * 12));
    for (let i = 1; i <= segments; i++) {
      const t = i / segments;
      const segH = t * currentHeight;
      const segX = dx + Math.sin(segH * 0.05) * 15;
      ctx.lineTo(segX, pitDepth - segH);
    }
    ctx.stroke();

    // a few leaves along the way, only once there's enough height for them to make sense
    if (currentHeight > 40) {
      ctx.fillStyle = "rgba(90,140,70,0.85)";
      for (let i = 1; i < segments; i += 2) {
        const t = i / segments;
        const segH = t * currentHeight;
        const segX = dx + Math.sin(segH * 0.05) * 15;
        ctx.beginPath();
        ctx.ellipse(segX + 8, pitDepth - segH, 7, 4, 0.4, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // gold pile near the top, until collected — only once FULLY grown
    if (peanutVine.grown && !vineGoldPile.collected) {
      const topX = dx + Math.sin(peanutVine.climbHeight * 0.05) * 15;
      drawGoldPileShape(ctx, topX, pitDepth - (peanutVine.climbHeight - 20), 12, 0);
    }
  }

  // falling / settled vine-dropped peanuts
  fallingVinePeanuts.forEach(p => {
    drawPeanutShape(ctx, p.x - camX, gy - p.heightAboveGround, 9, 0);
  });
}

function updateWillow(deltaTime) {
  if (!hasReturnedFromClouds) return; // locked entirely until a genuine clouds round-trip

  // notice-wiggle — same "runs until actually used" behavior as the bush
  if (!willow.shovelTaken) {
    willow.noticeTimer -= deltaTime * 1000;
    if (willow.noticeTimer <= 0) {
      willow.noticeWiggle = 180;
      willow.noticeTimer = 7000 + Math.random() * 4000;
    }
    if (willow.noticeWiggle > 0) willow.noticeWiggle--;
  }

  if (!willow.opened) {
    const nearWillow = isPlayerNear(willow.x, 0, 40, 10, 10);

    if (!nearWillow) {
      willow.holdProgress = 0; // resets if you walk away mid-hold
    } else if (keys.space) {
      willow.holdProgress += deltaTime * 1000;
      if (willow.holdProgress >= WILLOW_HOLD_DURATION) {
        willow.opened = true;
      }
    } else {
      willow.holdProgress = 0; // letting go also resets — a genuine continuous hold, not accumulated taps
    }
  } else if (!willow.shovelTaken) {
    if (pressedDownNear(willow.x, 50, 30, 20, 25)) {
      willow.shovelTaken = true;
      startCollectAnimation(
        { x: willow.x, y: gy - 50, size: 14, rotation: 0.3 },
        "shovel"
      );
    }
  }
}

function updateDigPlantVine(deltaTime) {
  if (digSite.digAnimT < DIG_ANIM_DURATION) digSite.digAnimT += deltaTime * 1000;
  if (digSite.plantAnimT < PLANT_FALL_DURATION) digSite.plantAnimT += deltaTime * 1000;

  // DIG — requires the shovel, one simple flourish, no multi-stage digging.
  // Requires a FRESH press (spaceJustPressed), not just being near while
  // already holding space — otherwise walking in with space held from a
  // prior action triggers it instantly with no visible anticipation.
  if (!digSite.dug) {
    if (heldItem === "shovel" && keys.spaceJustPressed && isPlayerNear(digSite.x, 0, 30, 10, 10)) {
      digSite.dug = true;
      digSite.digAnimT = 0;
    }
    return;
  }

  // PLANT — separate step, requires holding a peanut, the hole must exist first
  if (digSite.dug && !digSite.planted) {
    if (heldItem === "peanut" && inventory.peanut > 0 && keys.spaceJustPressed && isPlayerNear(digSite.x, 0, 30, 10, 10)) {
      digSite.planted = true;
      digSite.plantAnimT = 0;
      inventory.peanut--;
      if (inventory.peanut <= 0) { delete inventory.peanut; heldItem = null; }
      updateInventoryUI();
    }
    return;
  }

  // WATER — separate step, requires a genuinely FULL bucket
  if (digSite.planted && !digSite.watered) {
    if (heldItem === "bucket" && bucketFilled && keys.spaceJustPressed && isPlayerNear(digSite.x, 0, 30, 10, 10)) {
      digSite.watered = true;
      bucketFilled = false;
      bucketDropCount = 0; // bucket empties — same "pour it out, refillable" pattern as everywhere else
      updateInventoryUI();
    }
    return;
  }

  // GROWTH — once watered, grows over a few seconds into the climbable vine
  if (digSite.watered && !peanutVine.grown) {
    peanutVine.growProgress = Math.min(peanutVine.growProgress + deltaTime * 1000 / VINE_GROW_DURATION, 1);
    if (peanutVine.growProgress >= 1) {
      peanutVine.grown = true;
      vineDropTimer = VINE_FIRST_DROP_DELAY; // first drop comes soon, while the bucket's still freshly empty
    }
  }

  // CLIMBING — mounting is handled in handleInput (same priority block as
  // the swing); this just drives movement once mounted
  if (peanutVine.grown) {
    if (peanutVine.mounted) {
      if (keys.up) {
        peanutVine.playerClimbHeight = Math.min(peanutVine.playerClimbHeight + VINE_CLIMB_SPEED * deltaTime, peanutVine.climbHeight);
      } else if (keys.down) {
        peanutVine.playerClimbHeight = Math.max(peanutVine.playerClimbHeight - VINE_CLIMB_SPEED * deltaTime, 0);
      }
      if (peanutVine.playerClimbHeight <= 0) {
        peanutVine.mounted = false;
        player.y = 0;
      } else {
        player.x = peanutVine.x + Math.sin(peanutVine.playerClimbHeight * 0.05) * 15; // spiral
        player.y = peanutVine.playerClimbHeight - PEANUT_PIT_DEPTH;
      }
    }
  }

  // GOLD PILE — sits near the vine's top, collectible once grown.
  // Wider tolerance than a typical pickup, since the spiral climb motion
  // drifts the player left-right — needs real forgiveness to reliably reach.
  if (peanutVine.grown && !vineGoldPile.collected && !vineGoldPile.collecting) {
    if (pressedDownNear(peanutVine.x, peanutVine.climbHeight - 20, 40, 30, 30)) {
      vineGoldPile.collecting = true;
      startCollectAnimation(
        { x: peanutVine.x, y: gy + PEANUT_PIT_DEPTH - (peanutVine.climbHeight - 20), size: 12, rotation: 0 },
        "goldPile"
      );
      vineGoldPile.collected = true;
    }
  }

  // PERIODIC PEANUT DROPS — a real renewable resource, rarer than water drips
  if (peanutVine.grown) {
    vineDropTimer -= deltaTime * 1000;
    if (vineDropTimer <= 0) {
      fallingVinePeanuts.push({ x: peanutVine.x, heightAboveGround: peanutVine.climbHeight - 30, falling: true });
      vineDropTimer = VINE_DROP_MIN + Math.random() * (VINE_DROP_MAX - VINE_DROP_MIN);
    }
    fallingVinePeanuts.forEach(p => {
      if (!p.falling) return;
      p.heightAboveGround -= 60 * deltaTime;
      if (p.heightAboveGround <= 15) { p.heightAboveGround = 15; p.falling = false; }
    });
    fallingVinePeanuts = fallingVinePeanuts.filter(p => {
      if (p.falling) return true;
      if (pressedDownNear(p.x, p.heightAboveGround, 26, 15, 15)) {
        startCollectAnimation({ x: p.x, y: gy - p.heightAboveGround, size: 9, rotation: 0 }, "peanut");
        return false; // collected, remove from the array
      }
      return true;
    });
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
  { x: 1860, y: 160, scale: 0.9, type: "alligator" },   // decorative — not walkable
  { x: 700,  y: 140, scale: 2.4, type: "lobster" } // decorative — not walkable, separated from the stack cloud at 520
];

// the way back down — same fall-through mechanic as spring's holes, just
// leads to a scene switch + floaty descent instead of a same-scene respawn
const cloudHole = { x: 300, width: 60 };

// a small plane, drifting passively across the sky — purely atmospheric,
// same camera-relative recycling as the crows, just heading the OPPOSITE
// direction for a bit of visual contrast (birds one way, plane the other)
const clouds_plane = { x: 400, y: 90, speed: 0.35 };

function drawPlane(camX) {
  const px = clouds_plane.x - camX;
  const py = clouds_plane.y;

  // contrail trailing behind (behind = left, since it flies rightward)
  ctx.strokeStyle = "rgba(255,255,255,0.5)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(px - 40, py);
  ctx.lineTo(px - 8, py);
  ctx.stroke();

  ctx.fillStyle = "rgba(80,80,95,0.85)";

  // body
  ctx.beginPath();
  ctx.ellipse(px, py, 16, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // wings
  ctx.beginPath();
  ctx.moveTo(px - 2, py);
  ctx.lineTo(px - 10, py - 10);
  ctx.lineTo(px - 6, py);
  ctx.closePath();
  ctx.fill();

  ctx.beginPath();
  ctx.moveTo(px - 2, py);
  ctx.lineTo(px - 10, py + 10);
  ctx.lineTo(px - 6, py);
  ctx.closePath();
  ctx.fill();

  // tail fin
  ctx.beginPath();
  ctx.moveTo(px + 12, py);
  ctx.lineTo(px + 16, py - 6);
  ctx.lineTo(px + 14, py);
  ctx.closePath();
  ctx.fill();
}

function updatePlane(camX) {
  clouds_plane.x += clouds_plane.speed;

  if (clouds_plane.x - camX > canvas.width + 60) {
    clouds_plane.x = camX - 200 - Math.random() * 400; // staggered re-entry from the left
    clouds_plane.y = 60 + Math.random() * 80;
  }
}

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
  { x: 920,  height: 60,  width: 100 }, // widened for comfortable positioning — the actual hit-window stays as tight as before
  { x: 1150, height: 150, width: 60 },                      // GAP 1 — 130px edge gap, verified double-jump-only INCLUDING player width forgiveness
  { x: 1250, height: 190, width: 60 },
  { x: 1460, height: 220, width: 60 },                      // GAP 2 — 150px edge gap, same verification
  { x: 1560, height: 230, width: 60 },                      // shuttle's near dock — last normally-reachable cloud

  // --- everything below is only reachable via the shuttle ---
  { x: 1860, height: 220, width: 140, type: "alligator" },  // shuttle's far dock — the destination
  { x: 1990, height: 200, width: 60 },
  { x: 2090, height: 170, width: 60 },
  { x: 2140, height: 140, width: 90 },
  { x: 2250, height: 105, width: 80 }, // required standing spot for the elephant tail-hit — widened for comfort, verified via windowed arc

  // --- two lower tiers under the shuttle zone — reachable without ever
  // touching the shuttle, so that whole horizontal stretch isn't just empty air ---
  { x: 1610, height: 40,  width: 60 },
  { x: 1860, height: 40,  width: 60 },
  { x: 1990, height: 90,  width: 60 },
  { x: 2110, height: 40,  width: 70 }
];

// rabbit-shuttle — travels between two docks (a real destination, not a
// patrol going nowhere). Docks for 4s at each end so you can mount without
// needing to time a moving target; the crossing itself is a gentle
// multi-hop sequence, not a smooth glide or a rigid stop-start.
const rabbitShuttle = {
  dockA: { x: 1600, height: 230 }, // near the right side of the landing cloud (spans 1560-1620), not its left edge
  dockB: { x: 1860, height: 220 }, // matches the alligator — otherwise unreachable
  state: "docked",   // "docked" | "traveling"
  dockedAt: "A",
  t: 0,
  DOCK_TIME: 4000,
  TRAVEL_TIME: 4500,  // slow, deliberate crossing
  HOP_COUNT: 5,        // how many gentle hops the crossing is broken into
  mounted: false,
  currentX: 1600,
  currentHeight: 230,
  width: 64
};

// the crystal — sits on the alligator cloud, only reachable via the shuttle
const crystal = {
  x: 1955, // right-of-center on the alligator platform (spans 1860-2000), not its left edge
  heightAboveGround: 240, // just above the alligator platform's surface (height 220)
  collected: false,
  collecting: false
};

function drawCrystalOnCloud(camX) {
  if (crystal.collected || crystal.collecting) return;
  drawCrystalShape(ctx, crystal.x - camX, gy - crystal.heightAboveGround, 11, 0);
}

/* ======================================================
   CLOUD PIECES — 8 total. 6 sit as simple static pickups
   scattered across existing clouds; 2 are locked inside larger
   "vault" clouds that only open when hit by a thrown boomerang.
   Collect all 8, then place them one at a time (click to hold,
   walk to the gold oval, spacebar) to build an elephant.
   ====================================================== */
const cloudPieces = [
  { x: 480,  heightAboveGround: 60,  collected: false, collecting: false, active: true },
  { x: 690,  heightAboveGround: 115, collected: false, collecting: false, active: true },
  { x: 960,  heightAboveGround: 75,  collected: false, collecting: false, active: true },
  { x: 1560, heightAboveGround: 245, collected: false, collecting: false, active: true },
  { x: 1460, heightAboveGround: 235, collected: false, collecting: false, active: true },
  { x: 2110, heightAboveGround: 55,  collected: false, collecting: false, active: true },
  // these two are released by the vault clouds below — inactive (invisible,
  // unpickable) until then, and land at ground level once released, same
  // as honey, since the vault clouds themselves sit way too high to reach
  { x: 1146, heightAboveGround: 222, collected: false, collecting: false, active: false, falling: false },
  { x: 2176, heightAboveGround: 211, collected: false, collecting: false, active: false, falling: false }
];

// vault clouds — same notice-wiggle language as the wiggle bush. Hitting
// one with the boomerang starts a real sequence: parts open, pauses so you
// actually see the piece revealed inside, then closes back up as the piece
// drops out and falls. Once used, it stays closed and never wiggles again.
const VAULT_OPENING_DURATION = 500;  // ms — branches visibly parting
const VAULT_REVEALED_DURATION = 700; // ms — pause, piece visible in the gap
const VAULT_CLOSING_DURATION = 500;  // ms — closes back up as the piece drops

const vaultClouds = [
  { x: 1146, heightAboveGround: 222, phase: "closed", phaseT: 0, noticeWiggle: 0, noticeTimer: 3000 + Math.random() * 3000, requiresAirborne: true },
  { x: 2176, heightAboveGround: 211, phase: "closed", phaseT: 0, noticeWiggle: 0, noticeTimer: 4000 + Math.random() * 3000 }
];

const CLOUD_PIECE_FALL_SPEED = 80; // height units/sec — pushed faster again per feedback

function drawSimpleCloudPieces(camX) {
  cloudPieces.forEach(p => {
    if (!p.active || p.collected || p.collecting) return;
    drawCloudPieceShape(ctx, p.x - camX, gy - p.heightAboveGround, 9, 0);
  });
}

// finds the highest hopCloud platform genuinely below a given x/startHeight,
// so falling pieces can rest on an intermediate cloud instead of always
// dropping all the way to the ground
function findRestHeightBelow(x, startHeight) {
  let best = 15; // ground-level default if nothing else qualifies
  hopClouds.forEach(c => {
    if (x < c.x - c.width / 2 || x > c.x + c.width / 2) return;
    if (c.height >= startHeight) return; // must be genuinely below the start point
    if (c.height > best) best = c.height + 6; // land just on top of the platform's surface
  });
  return best;
}

function updateFallingCloudPieces(deltaTime) {
  cloudPieces.forEach(p => {
    if (!p.falling) return;
    if (p.restHeight == null) p.restHeight = findRestHeightBelow(p.x, p.heightAboveGround);
    p.heightAboveGround -= CLOUD_PIECE_FALL_SPEED * deltaTime;
    if (p.heightAboveGround <= p.restHeight) {
      p.heightAboveGround = p.restHeight;
      p.falling = false; // settled — now pickupable
    }
  });
}

function updatePeanutFall(deltaTime) {
  if (!peanut.falling) return;
  peanut.heightAboveGround -= PEANUT_FALL_SPEED * deltaTime;
  if (peanut.heightAboveGround <= 15) {
    peanut.heightAboveGround = 15;
    peanut.falling = false;
  }
}

function drawPeanut(camX) {
  if (!peanut.available || peanut.collected || peanut.collecting) return;
  drawPeanutShape(ctx, peanut.x - camX, gy - peanut.heightAboveGround, 9, 0);
}

function updatePeanutPickup() {
  if (!peanut.available || peanut.collected || peanut.collecting || peanut.falling) return;
  if (pressedDownNear(peanut.x, peanut.heightAboveGround, 26, 15, 25)) {
    peanut.collecting = true;
    startCollectAnimation({ x: peanut.x, y: gy - peanut.heightAboveGround, size: 9, rotation: 0 }, "peanut");
  }
}

function updateSimpleCloudPiecePickups() {
  cloudPieces.forEach(p => {
    if (!p.active || p.collected || p.collecting || p.falling) return;
    if (pressedDownNear(p.x, p.heightAboveGround, 26, 15, 25)) {
      p.collecting = true;
      startCollectAnimation({ x: p.x, y: gy - p.heightAboveGround, size: 9, rotation: 0 }, "cloudPiece");
    }
  });
}

// vault clouds each have a matching piece in cloudPieces (last two entries,
// same order) — hitting the vault just activates its piece
const vaultReleasePieces = [cloudPieces[6], cloudPieces[7]];

function drawVaultCloud(v, camX) {
  if (v.phase === "done") return; // permanently closed, empty — gone for good

  const vx = v.x - camX;
  const vy = gy - v.heightAboveGround;

  let gap = 0;
  if (v.phase === "opening") gap = (v.phaseT / VAULT_OPENING_DURATION) * 18;
  else if (v.phase === "revealed") gap = 18;
  else if (v.phase === "closing") gap = 18 * (1 - v.phaseT / VAULT_CLOSING_DURATION);

  // notice-wiggle only plays while fully closed and unused
  const shake = (v.phase === "closed" && v.noticeWiggle > 0) ? Math.sin(v.noticeWiggle * 0.4) * 2 : 0;

  ctx.fillStyle = "rgba(255,255,255,0.95)";

  // left half
  ctx.save();
  ctx.translate(-gap + shake, 0);
  ctx.beginPath();
  ctx.arc(vx - 6, vy, 24, 0, Math.PI * 2);
  ctx.arc(vx - 20, vy - 3, 17, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // right half
  ctx.save();
  ctx.translate(gap + shake, 0);
  ctx.beginPath();
  ctx.arc(vx + 14, vy - 5, 18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  // the piece, visible sitting in the gap during the reveal pause
  if (v.phase === "revealed") {
    drawCloudPieceShape(ctx, vx, vy, 9, 0);
  }
}

function updateVaultCloud(v, index, deltaTime) {
  if (v.phase === "closed") {
    v.noticeTimer -= deltaTime * 1000;
    if (v.noticeTimer <= 0) {
      v.noticeWiggle = 120;
      v.noticeTimer = 7000 + Math.random() * 4000;
    }
    if (v.noticeWiggle > 0) v.noticeWiggle--;
  } else if (v.phase === "opening") {
    v.phaseT += deltaTime * 1000;
    if (v.phaseT >= VAULT_OPENING_DURATION) {
      v.phase = "revealed";
      v.phaseT = 0;
    }
  } else if (v.phase === "revealed") {
    v.phaseT += deltaTime * 1000;
    if (v.phaseT >= VAULT_REVEALED_DURATION) {
      v.phase = "closing";
      v.phaseT = 0;
      // the piece detaches and starts falling right as the vault begins closing
      vaultReleasePieces[index].active = true;
      vaultReleasePieces[index].falling = true;
    }
  } else if (v.phase === "closing") {
    v.phaseT += deltaTime * 1000;
    if (v.phaseT >= VAULT_CLOSING_DURATION) {
      v.phase = "done"; // permanently closed and empty, no more wiggle
    }
  }
}

/* ======================================================
   ELEPHANT SPOT — a dedicated high cloud, always visible, that
   gains a gold rim once all 8 pieces are collected. A gold oval
   appears on the ground beneath it; stand there, hold a cloud
   piece, press spacebar to place it — repeat 8 times to build
   the elephant, one part revealed per placement. No doorway here —
   it's a capstone, not a gate.
   ====================================================== */
const elephantSpot = {
  cloudX: 2400,
  cloudY: 55,       // background-layer style screen-ish y, matches cloudsDecor convention
  groundOvalX: 2400, // directly under the cloud — elephant now builds on top of it, same center
  unlocked: false,   // set once, stays true — true fog-of-war-style reveal
  piecesPlaced: 0,
  appearT: 9999,     // ms since the newest piece was placed — starts high so nothing animates before the first placement
  tailNoticeTimer: 3000 + Math.random() * 3000,
  tailNoticeWiggle: 0
};

const ELEPHANT_APPEAR_DURATION = 3000; // ms — 3 seconds per piece, particles gather in over this long

/* ======================================================
   BALLOON NPC — a hot air balloon that rises up from behind the
   clouds once you've collected at least 4 pieces AND are nearby.
   Two-stage dialogue (some pieces vs. all 8 collected), same
   shared speech-bubble system as the frog/rabbit. Retires once
   the elephant's fully built — nothing left to hint about.
   ====================================================== */
const BALLOON_RISE_DURATION = 4500; // ms — slower, more gradual rise
const BALLOON_ELIGIBLE_PIECES = 4;

const balloonNPC = {
  x: elephantSpot.cloudX + 120, // opposite side from vault2 (x:2176) — was only 44 units apart before
  restHeight: 140,
  active: false, // becomes true once eligible+nearby, stays true forever after
  riseT: 0,
  colors: ["#e05c4a", "#f0a830", "#5aa8d8"]
};

function totalCloudProgress() {
  return (inventory.cloudPiece || 0) + elephantSpot.piecesPlaced;
}

function updateBalloonNPC(deltaTime) {
  if (!balloonNPC.active) {
    if (totalCloudProgress() >= BALLOON_ELIGIBLE_PIECES &&
        isPlayerNear(elephantSpot.cloudX, 0, 400, 300, 300)) {
      balloonNPC.active = true;
      balloonNPC.riseT = 0;
    }
    return;
  }
  if (balloonNPC.riseT < BALLOON_RISE_DURATION) {
    balloonNPC.riseT += deltaTime * 1000;
  }
}

function drawBalloonNPC(camX) {
  if (!balloonNPC.active) return;

  const riseProgress = Math.min(balloonNPC.riseT / BALLOON_RISE_DURATION, 1);
  const currentHeight = (balloonNPC.restHeight - 150) + 150 * riseProgress;
  const bx = balloonNPC.x - camX;
  const by = gy - currentHeight;

  // envelope — teardrop shape (rounded top, pointed bottom), with the
  // same radial color wedges clipped to that silhouette instead of a plain circle
  const radius = 20;
  ctx.save();
  ctx.beginPath();
  ctx.arc(bx, by - 4, radius, Math.PI, 0); // rounded top half
  ctx.quadraticCurveTo(bx + radius * 0.55, by + 10, bx, by + radius * 1.15); // taper to point, right side
  ctx.quadraticCurveTo(bx - radius * 0.55, by + 10, bx - radius, by - 4); // taper back up, left side
  ctx.closePath();
  ctx.clip();

  const wedgeCount = 8;
  for (let i = 0; i < wedgeCount; i++) {
    const startAngle = (i / wedgeCount) * Math.PI * 2 - Math.PI / 2;
    const endAngle = ((i + 1) / wedgeCount) * Math.PI * 2 - Math.PI / 2;
    ctx.fillStyle = balloonNPC.colors[i % balloonNPC.colors.length];
    ctx.beginPath();
    ctx.moveTo(bx, by);
    ctx.arc(bx, by, radius * 1.6, startAngle, endAngle); // oversized, safely clipped to the teardrop
    ctx.closePath();
    ctx.fill();
  }
  ctx.restore();

  // basket
  ctx.fillStyle = "#8a5a2e";
  ctx.fillRect(bx - 10, by + 24, 20, 12);

  // ropes
  ctx.strokeStyle = "rgba(80,60,30,0.6)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(bx - 10, by + 18); ctx.lineTo(bx - 8, by + 24);
  ctx.moveTo(bx + 10, by + 18); ctx.lineTo(bx + 8, by + 24);
  ctx.stroke();

  // tiny stick-figure passengers, peeking up over the basket rim
  ctx.strokeStyle = "#5a4530";
  ctx.lineWidth = 1;
  [-4, 4].forEach(offsetX => {
    const px = bx + offsetX;
    const py = by + 24; // basket rim
    // head
    ctx.beginPath();
    ctx.arc(px, py - 6, 1.4, 0, Math.PI * 2);
    ctx.stroke();
    // body
    ctx.beginPath();
    ctx.moveTo(px, py - 4.5);
    ctx.lineTo(px, py);
    ctx.stroke();
    // arms
    ctx.beginPath();
    ctx.moveTo(px - 2, py - 2);
    ctx.lineTo(px + 2, py - 2);
    ctx.stroke();
  });

  // staged dialogue, only once fully risen and player's nearby
  if (riseProgress >= 1 && isPlayerNear(balloonNPC.x, currentHeight, 150, 200, 999)) {
    const progress = totalCloudProgress();
    if (progress >= 8 && elephantSpot.piecesPlaced < 8) {
      drawSpeechBubble(ctx, bx - 30, by - 50, [
        "All eight! My, what a haul.",
        "That glowing circle down there is waiting for you."
      ]);
    } else if (progress >= BALLOON_ELIGIBLE_PIECES && progress < 8) {
      drawSpeechBubble(ctx, bx - 30, by - 50, [
        "Ooh, a few little clouds already!",
        "More are scattered about — some shaking ones keep theirs locked tight."
      ]);
    }
  }
}

// bonus collectible — released by hitting the elephant's tail with the
// boomerang, but only once it's fully built. Falls from the middle of the
// cloud once triggered, same falling pattern as honey/vault pieces.
const peanut = {
  x: 2400,
  heightAboveGround: 245, // falls from the middle of the cloud
  available: false,
  collected: false,
  collecting: false,
  falling: false
};
const PEANUT_FALL_SPEED = 60;

// second exit hole — forms once the elephant is fully built, sits just
// right of the ground oval, and leads to the exact same spot in spring as
// the original cloud-hole does
const elephantHole = { x: 2470, width: 60 };

// shifted +55 right of center so the assembly builds ADJACENT to the base
// cloud (which now sits small, off to the left) rather than on top of it —
// the old design had the body piece almost exactly duplicate the base
// cloud's own circle, making the first placement invisible
// reordered so the shape stays ambiguous as long as possible — body/legs/
// tail could be almost any animal; the trunk (split across two pieces, so
// even ITS first half doesn't give it away) and head+ears land last,
// which is the moment it actually becomes unmistakably an elephant
const ELEPHANT_PARTS = [
  { dx: 0,   dy: 5,   r: 30 },                 // body
  { dx: -14, dy: 31,  r: 9  },                 // front leg
  { dx: 14,  dy: 31,  r: 9  },                 // back leg
  { dx: 32,  dy: 17,  r: 7  },                 // tail
  { dx: 0,   dy: 0,   r: 0, type: "trunk1" },  // trunk — first half, ambiguous alone
  { dx: 0,   dy: 0,   r: 0, type: "trunk2" },  // trunk — completes the curl, reads as a trunk now
  { dx: -40, dy: -7,  r: 20 },                 // head
  { dx: 0,   dy: 0,   r: 0, type: "ears" }     // both ears together — the "oh, it's an elephant" moment
];

// the base cloud — sized to roughly cover the WHOLE elephant's footprint,
// gold-tinted, and pieces land directly on top of it. Overlap is the
// point this time: white-on-gold has real contrast (unlike the old
// white-on-white bug), and the gold visibly fades as more of it gets
// covered, so the mystery cloud reads as "resolving into" the shape.
const BASE_CLOUD_CIRCLES = [
  { dx: 0,   dy: 0,  r: 14 },
  { dx: 10,  dy: -4, r: 10 },
  { dx: -10, dy: -3, r: 9  }
];

// trunk points — segment 1 draws the stub near the head (points 0-1,
// ambiguous alone), segment 2 completes the hanging curl (points 1-3)
const TRUNK_POINTS = [
  { x: -40, y: -5,  w: 11 },
  { x: -50, y: 5,   w: 9  },
  { x: -56, y: 15,  w: 7  },
  { x: -54, y: 25,  w: 5  }
];

function drawTrunkSegment(cx, cy, segment) {
  ctx.save();
  ctx.strokeStyle = "rgba(255,255,255,0.97)";
  ctx.lineCap = "round";

  const range = segment === 1 ? [0, 1] : [1, 2, 3];
  for (let i = 0; i < range.length - 1; i++) {
    const a = TRUNK_POINTS[range[i]];
    const b = TRUNK_POINTS[range[i + 1]];
    ctx.lineWidth = a.w;
    ctx.beginPath();
    ctx.moveTo(cx + a.x, cy + a.y);
    ctx.lineTo(cx + b.x, cy + b.y);
    ctx.stroke();
  }
  ctx.restore();
}

function drawEarsPart(cx, cy) {
  ctx.fillStyle = "rgba(255,255,255,0.97)";
  ctx.beginPath();
  ctx.arc(cx - 52, cy - 21, 12, 0, Math.PI * 2);
  ctx.arc(cx - 34, cy - 23, 12, 0, Math.PI * 2);
  ctx.fill();
}

function drawElephantSpot(camX) {
  const cx = elephantSpot.cloudX - camX;
  const cy = elephantSpot.cloudY;

  // gold fades as more pieces get placed — the mystery cloud visibly
  // "resolving into" the shape underneath, not a per-patch mask (simpler,
  // same overall feel)
  const goldOpacity = Math.max(0.06, 1 - elephantSpot.piecesPlaced / 8);

  if (elephantSpot.unlocked) {
    // genuine white <-> gold color cycle (real RGB interpolation, not just
    // an opacity shimmer on a fixed color) — a slower cycle than the
    // sparkle twinkle below, so it reads as a deliberate breathing pulse
    const colorCycle = Math.sin(performance.now() * 0.0008) * 0.5 + 0.5;
    const cycleR = Math.round(255 - colorCycle * (255 - 232));
    const cycleG = Math.round(255 - colorCycle * (255 - 147));
    const cycleB = Math.round(255 - colorCycle * (255 - 90));

    // the gold cloud body itself — sized to the elephant's footprint.
    // No separate rim anymore — the pulsing fill alone carries the
    // "this is special" signal, a thin outline on top just added clutter.
    ctx.save();
    ctx.globalAlpha = goldOpacity;
    ctx.fillStyle = `rgb(${cycleR},${cycleG},${cycleB})`;
    ctx.beginPath();
    BASE_CLOUD_CIRCLES.forEach(c => ctx.arc(cx + c.dx, cy + c.dy, c.r, 0, Math.PI * 2));
    ctx.fill();
    ctx.restore();

    // glitter — small, bright, genuinely noticeable twinkling points
    const rimSparkles = [
      { dx: -15, dy: -10 }, { dx: 14, dy: -8 }, { dx: 18, dy: 6 },
      { dx: -18, dy: 4 }, { dx: 2, dy: -14 }, { dx: -4, dy: 12 }
    ];
    rimSparkles.forEach((s, i) => {
      const twinkle = Math.sin(performance.now() * 0.007 + i * 1.9) * 0.5 + 0.5;
      ctx.globalAlpha = goldOpacity;
      ctx.fillStyle = `rgba(255,225,195,${0.6 + twinkle * 0.4})`;
      ctx.beginPath();
      ctx.arc(cx + s.dx, cy + s.dy, 0.8 + twinkle * 0.7, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.globalAlpha = 1;
  } else {
    // not yet unlocked — plain white cloud, no gold at all
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    BASE_CLOUD_CIRCLES.forEach(c => ctx.arc(cx + c.dx, cy + c.dy, c.r, 0, Math.PI * 2));
    ctx.fill();
  }

  // the elephant itself, built from placed parts, directly on top of the gold cloud
  const appearProgress = Math.min(elephantSpot.appearT / ELEPHANT_APPEAR_DURATION, 1);
  // the actual shape only resolves into visibility in the final 40% —
  // before that, it's just the particles gathering, not a fading shape
  const shapeAlpha = Math.max(0, (appearProgress - 0.6) / 0.4);

  // hop-float: once the shape starts resolving, it also settles down into
  // place from slightly above — faster than the water droplets (80/sec)
  // but still a gentle float, not an instant snap
  const HOP_FLOAT_START_OFFSET = 35;
  const HOP_FLOAT_SPEED = 130; // units/sec
  const hopPhaseMs = Math.max(0, elephantSpot.appearT - ELEPHANT_APPEAR_DURATION * 0.6);
  const hopOffsetY = Math.max(0, HOP_FLOAT_START_OFFSET - (hopPhaseMs / 1000) * HOP_FLOAT_SPEED);

  for (let i = 0; i < elephantSpot.piecesPlaced; i++) {
    const part = ELEPHANT_PARTS[i];
    const isNewest = i === elephantSpot.piecesPlaced - 1;

    // gathering particles — a little snowy whirlwind spiraling inward
    // toward the piece's final position, not a straight-line converge
    if (isNewest && elephantSpot.appearParticles) {
      const ease = 1 - Math.pow(1 - appearProgress, 2);
      const particleAlpha = Math.max(0, 1 - appearProgress * 1.3);
      elephantSpot.appearParticles.forEach((pt, idx) => {
        const startRadius = Math.hypot(pt.startDx, pt.startDy);
        const startAngle = Math.atan2(pt.startDy, pt.startDx);
        const curRadius = startRadius * (1 - ease);
        const spin = (1 - ease) * Math.PI * 2.5;
        const curAngle = startAngle + spin + idx * 0.4;
        const curDx = Math.cos(curAngle) * curRadius;
        const curDy = Math.sin(curAngle) * curRadius;
        const twinkle = 0.7 + Math.sin(performance.now() * 0.01 + idx * 2) * 0.3;
        ctx.fillStyle = `rgba(255,255,255,${particleAlpha * 0.9 * twinkle})`;
        ctx.beginPath();
        ctx.arc(cx + part.dx + curDx, cy + part.dy + curDy, 2, 0, Math.PI * 2);
        ctx.fill();
      });
    }

    ctx.globalAlpha = isNewest ? shapeAlpha : 1;
    ctx.save();
    if (isNewest) ctx.translate(0, -hopOffsetY);

    if (part.type === "trunk1") {
      drawTrunkSegment(cx, cy, 1);
    } else if (part.type === "trunk2") {
      drawTrunkSegment(cx, cy, 2);
    } else if (part.type === "ears") {
      drawEarsPart(cx, cy);
    } else {
      // the tail (index 3) gets a gentle notice-wiggle once it's a real target
      const tailShake = (i === 3 && elephantSpot.tailNoticeWiggle > 0)
        ? Math.sin(elephantSpot.tailNoticeWiggle * 0.4) * 2
        : 0;
      ctx.fillStyle = "rgba(255,255,255,0.97)";
      ctx.beginPath();
      ctx.arc(cx + part.dx + tailShake, cy + part.dy, part.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
  ctx.globalAlpha = 1;

  // the gold ground oval, only once unlocked
  if (elephantSpot.unlocked) {
    const ox = elephantSpot.groundOvalX - camX;
    const pulse = Math.sin(performance.now() * 0.003) * 0.5 + 0.5;
    ctx.save();
    ctx.globalAlpha = 0.6 + pulse * 0.3;
    ctx.strokeStyle = "#e8935a";
    ctx.fillStyle = "rgba(232,147,90,0.25)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(ox, gy + 3, 26, 8, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // glitter accents — smaller, brighter, more noticeable
    const ovalSparkles = [
      { dx: -14, dy: 2 }, { dx: 8, dy: -2 }, { dx: 16, dy: 3 }, { dx: -6, dy: 4 }
    ];
    ovalSparkles.forEach((s, i) => {
      const twinkle = Math.sin(performance.now() * 0.008 + i * 2.3) * 0.5 + 0.5;
      ctx.fillStyle = `rgba(255,225,195,${0.6 + twinkle * 0.4})`;
      ctx.beginPath();
      ctx.arc(ox + s.dx, gy + 3 + s.dy, 0.6 + twinkle * 0.6, 0, Math.PI * 2);
      ctx.fill();
    });
  }
}

function updateElephantSpot(deltaTime) {
  elephantSpot.appearT += deltaTime * 1000;

  if (!elephantSpot.unlocked) {
    if ((inventory.cloudPiece || 0) >= 8) {
      elephantSpot.unlocked = true; // one-time reveal — stays true even as pieces get placed
    }
    return;
  }

  // tail notice-wiggle — only once the elephant is fully built (the tail
  // is a real target then) and only until the peanut's been claimed
  if (elephantSpot.piecesPlaced >= 8 && !peanut.available) {
    elephantSpot.tailNoticeTimer -= deltaTime * 1000;
    if (elephantSpot.tailNoticeTimer <= 0) {
      elephantSpot.tailNoticeWiggle = 120;
      elephantSpot.tailNoticeTimer = 7000 + Math.random() * 4000;
    }
    if (elephantSpot.tailNoticeWiggle > 0) elephantSpot.tailNoticeWiggle--;
  }

  if (elephantSpot.piecesPlaced >= 8) return; // fully built

  if (heldItem === "cloudPiece" && inventory.cloudPiece > 0) {
    // must actually be standing IN the oval now, not just generally nearby —
    // small wiggle room (radiusX 20 vs the oval's own visual radius of 26)
    if (pressedDownNear(elephantSpot.groundOvalX, 0, 20, 12, 12)) {
      inventory.cloudPiece--;
      const morePiecesRemain = inventory.cloudPiece > 0;
      if (!morePiecesRemain) delete inventory.cloudPiece;
      heldItem = morePiecesRemain ? "cloudPiece" : null;
      updateInventoryUI();
      elephantSpot.piecesPlaced++;
      elephantSpot.appearT = 0; // starts the newest piece's slow-appear animation
      elephantSpot.appearParticles = Array.from({ length: 8 }, () => {
        const angle = Math.random() * Math.PI * 2;
        const dist = 25 + Math.random() * 30;
        return { startDx: Math.cos(angle) * dist, startDy: Math.sin(angle) * dist };
      });
    }
  }
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
  { x: 1990, sourceHeight: 200, dropHeight: null, timer: 3000 + Math.random() * 3000 },  // highest cloud past the jewel area
  { x: 2150, sourceHeight: 170, dropHeight: null, timer: 4000 + Math.random() * 3000 }   // second-highest, same stretch
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

/* ======================================================
   OAK SCENE — a cozy little room inside a tall oak, reached
   via the seesaw launch. Books, cushions, an owl. Full
   interaction with the owl deliberately deferred for later —
   for now this is just the space existing.
   ====================================================== */
const oakReturnDoor = { x: 294, width: 50, height: 90 };

/* ======================================================
   WALL ART — the player's own paintings, hung in the oak
   room. Loaded once as real image assets (base64-embedded
   so they travel with this single file), drawn with a
   simple antique-style frame per piece, each slightly
   different so they don't read as a template repeated.
   Sized relatively small and specific, like real framed
   pieces, not room-filling murals. Positioned high on the
   walls, clear of the shelves/piles/owl below.
   ====================================================== */
const wallArtWaterBird = new Image();
wallArtWaterBird.src = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAkGBwgHBgkIBwgKCgkLDRYPDQwMDRsUFRAWIB0iIiAdHx8kKDQsJCYxJx8fLT0tMTU3Ojo6Iys/RD84QzQ5Ojf/2wBDAQoKCg0MDRoPDxo3JR8lNzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzf/wAARCAA/AF8DASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDk9Qubh4w0sw5HRQMn6kmsyaJ4hkjOfzrak05Z4yYh80aAuTnCHPzE/T+efSqr+ZPasqosjDgsCQw+o6U1TUUR7RtmbG2AGAOfpVyJyQSdp4+7JwfwoaCaFfljG0ckhsionmadArMdq9cEdKzS5nZGjdldjSXlB8vcqnr05NSyWt1C0aNuLMm/ZjoO3Fami2n/AC9MgOwEqpHA9B+eKfcSq8jTYG4sQCckso46Y+pq52irIiDcncyRZSj53R+ecnrVy1sWlw2xiB94+n5irfm26oTPcS7c8BYgP0JzVg6jYyRkRyjAI+R4Tkj8653KXY2SRXRnjxu2qPRmH8qu28xZh9niLswwx24x7nPSoruUSuGS2ZNw+V9nB96nsSlurSuiyFSAg56t0yPzqXqrmuxSv4iWYKVJQZbPyg+wPeufvSrNkZx6E9K6rUoJ5UE4aIADJcDA/AVzt/IJiiSfM4B57itaHvMzrKyep0tg+/T3soo5JZp7j96wXgIACQSPb9WNJHpl1C1uhlt4Jcs8qn5y7Mec47AYFaEbkaYRayeVIGLTFjtIHsPWqK2kczGedWkkPCDcVVB/M/55rr+LRHDfl1Zn6lJJHLKI1tndTtYLABj681mt5UrGSZ8uecf/AFulaeoiMna8ssg6bIlCrx/Oqr+WFA2BB2yRmmlYd7mjb3MbpaWu3y95BZe4HufU9fxFLfRW7anMiyxLEoVQpHJOOTx0rMUlGVtg3HoSc5rStIJGCgr8ocZDrnbkZJB6j86nkvqNzsQXbQBcQwDOOTkk5z2qibgAqJLRAB0whB/GtOaCb7Q0B2BH+62MY/Gqc9tcxMQWJYDja+aXKilLuOdvNym6dSV+UMxxn8qs2txbRR3EEsxi2hArbM5IIPT8Kr25D3CNmUSLEd+5RjPbvzUM8IUEsBnswP8AP1rmkrOzOlSTRe1nUElMdtCCqjjDDBI7f41zl2wedthOAAAfpV8bZrdwGIZRwD2+lZMjcjbwcAGtKMUiKui0PQMPc2yOy/JG2Rt4yf696r37bYwIxgEc9zk/zOKvNcR2gSBiY1bJU54JIH+efWoXWAruleF1PBU8HP8AjXXBKxwTundHOy2crQu8YeSQOPMw27A7H6e9QyW8kO4KyOq5ztJOa66PT4JhuhyMDqAOnpuHamzaBb4DT3CqrLkB3bkD0Gaho1jI5KxH71IyzhJWwVC7sjtx65rqVjkigRVkO5doMuMgAdvc9BUBFlZMGEMaqCRuUks31PQCon1TzEEcKZ59OB7+1KwNk2qsHeEIcuq7vlyTz0UY68c/lTi62iBHcNMw4w+79Ko3UN1GBKyO3zEMR0b647f4VFbMVE84xJMrAR91GBknAqal0tDSmlJ+8F3MyMCwA3HB4wfbNQX0REUbxtvaVQAg7VXNy1xdSCcsPNIBLtnDA9j2qxaQXL58twyR8jI+9zjiuaScXdmyaa0KhiFraO7OGIG76k1lRoHDHPPX9a09ZjaOZISCAOD+FZq9CBwTzWsPhuJu7SO+4lhCzRrLH/Eu7B49M+lV3srIPuDXUb+jKCPqT3pYmE8SSCZ2VfvA8f8A6xVj7fAH2rF904BxwWPr3Nb3sjltdlu3lkSHy0A2Z7rgD9B+VVZ7txM3lkSTYwVKZqtPqf7tnyyoON/Un6elZ51CIlWXzAMjcSc5oWoPQfqCXEjZkd1ZeNoGRk9foKoJI9pyuG3LzuHTnNaNyytbAo5dX+YZHP1rJnuYpY/LIwc8HrV6JExu2dBptzI8UTnD5ODnnH/16o6vG0d00qMBFnPJHGeO1S6EsUgw4GV5AIyPril1ZfPhkAO4FskHgAUr6amkvi0OYuFI+YgZBwyjsa0tH1RYS0U+QTwrlsA+zf41n3RVVdQwYDjIzyOx5qtCwZsfT8a55xUtGbJ2VzpdQjimt96EmRD/ABHIJ+v0rmpgAxA4GeK0IrnyYGjBIRuDjt71muwPXkjvUwTiminvc//Z";
const wallArtArch = new Image();
wallArtArch.src = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAkGBwgHBgkIBwgKCgkLDRYPDQwMDRsUFRAWIB0iIiAdHx8kKDQsJCYxJx8fLT0tMTU3Ojo6Iys/RD84QzQ5Ojf/2wBDAQoKCg0MDRoPDxo3JR8lNzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzf/wAARCACtAIIDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDQP4UwjnqOKfz3P6U1un8q807yPBxgY/OmkHOcU89+ajOAc+1ACYGO+aYRg044JpjfzNADW6fyphPH+NPemN9PegBjZxTD/P1qRulRk8HrSGN/UU3POOAPSnd/rTOg6/jQA2kYcc9KniNvlVmVuVPQ9T2+lMkCvIojUBWwME5/Wr5dL3J5tbWIijiMuVO3P3scfnUJ/wA81fv55pv9c2QOg3ZA69qoZ5GfSicVF2QQk5K7DFFJt+n5UVBZ1Lc465qNm+tPf8M49alsIEuLjbLnaFzgHrVxi5SSRnKSirsqqjOOMgZxnGaRozsJ3K2DjArpYoIY8IkShfXOaescecmNVHTG0V3xwcbavU4pYt30WhynlSnkI2O3FSfYbo42ws2eeK6dSMZVQBSF06DnPoKf1KPcX1yXY5CWORSQY23KcFcUsdpcyE7YHOOpxXWPtzvXGF6nHX0pSWyOoI5Ix1H+f5U1g4W1Yni5t6HFujggCJyenSmKrK6hkbdu6L1rs1t487jGCoyD14NQtY2skxZ4lJJG3Ixt/wA+9H1OFtGH1ud/I5lSfM5DhhjkKMmi5gMjqIVd5MHIVMk/lXVQ2sELF44lRm6sev60/wAsbhIqgSKDtYcH3FVLDJxauRHENNM5iDSpWtBM5KsoPytHVQJFmUyy+XsjYxjySd7dh7fWutVtyLKjcEZLDpjFVriyknYOvlpvOCTyRzR9WjayK+sO92crKrOC4C44Hyrg1UIIYhhg9wa7X7IkkZiOEyCDtA+X6HvXKajA0F3IrZz6nua5sTQ5EpI6MPW5m0yrkeoopaK4zrudI/4Va0lissoHXaDj1qq578/WmW0rxXsRUFtzbcY7GtqDtURjWV6bOlEp2lVHIHU+h6CozlmYnqcU5V2ZMagE8n3z60h4OwHLDnP4V7J5A/IyozgBcnHU+36VEjspI/uj8qkBAVmOSQpHNNMeFIIG4kYoGNJDj5QcHgH0pt1dxWqYfLO5OAOowMZ/HgVJK/kgELkk4jXP61mhluTLEr4jIClyOGJPPvjqK4sTivZ+7Hc7MLhfa+9LYZFqd7K8ytbhV/2j6+wpJNYWGeJ7mNowXABTpnkZPfoanaVI2JaP5VG1sEfKegBHvWFrBJgIGGOehI9O3+e1cUMXVUtWejLCUZLRWOqdtwKqQUYgrj0P/wBekAywUnIZSD9DXDaDrlxbahbQTP8A6L/qmVhnGT29OcV3D745ZJG6ZDKPTsf5V61KqqiujyK9B0ZWYkXACZAUcdOvNOBKx7j95R1A9ajGAwUDIJxx371JN/q8E85G4j0rQwIzwAU4JHH07VzGvjN9IWxkHOQex7V1Dbim7ADEfl2H5ZFcprFx5lzLEAu1HIBA59K5sVb2ep04W/PoZuDRS8e9FeSemdC/fOKt6TEzM0wUAKdu4nuc8VSf9a1NLybJhtJQSZ3A8E9wfT1rowyTqIwxDtTZoQKyrh3DswyT05/yaRWVbgrtyMgj6Y//AF1KuAQ3rxj/AD9KiuP3Ue5cDaSzY6k4AFeueUJ8y7FPJKH5h3PQ0+SVYcyscYUAfyojjz07jI9BWJNP9ruSxIMcLMI/Q843fpXPiK6oxv1OnDYd1p26LcW8ZpfNLPhnCjk/cUY4HqeP1NTw7drs4Ulufl6E/wCNVWfDZcMB69h+PbNKm6WcozEc8oH/ALpxmvDlJy1Z76gklFC3BLKCqKpJAOTkn6Dv9ao3Jxbynkd8Zxg9Ks3NxGXcK6AgYHzcisvVLryrdYVkHmt8oDtgnA5NEE73HsrHNXClJzASFaRtygHpg5xXc+HdWF7bCC5lVrqNcgsf9Yh4rg2jzdLKHDFSckLjJ9varmnymxkjnCjdFIOPVc4IJ+lehRqckkzlxNFVYW6no4ASFlOSU5BPfA6/zpJGLspHRl/rUrZwxQjJjJVm5A+vrUMeV2pyQvJJ9q9U8AkmwCi93ZcfTqf5Vw1yxNxKXBBLtnJ5zmu5wGk3nqHXb7DoR/OuIu8G6lK7cFyRt6da4ca/dR2YNe8yL8KKT8KK809A6CQcemfet2Eq4SWBEjjkw2xDkBsY6YHPr9KwX654NbVncK2xliCHcTtAIC88AV14S3OcuKvyFqdgqRZJIL5Jx07c/nS3ADLwMKePrmmbSBKpw23DAn6/yqQ5MSAfMWyc16h5pW1uY2umSSIccbfTjvXG6ZfBYFbcillDOp6DjpXR+MriIaQLd32s2HYA87AcH8+ledWe7ask2VQZKrnlvavLxbUqlux7WAjalfudZNq0cipE6OvOc4zv9AO4/GprW6kuH2wrsmP3Q45b2/l+FYGnyI8y+YRheWJPA4710vhhHuriW6WMrbLhYmYctjO78+M1y0qLqTUTor1fZQcjF1iS9srtbKQI/wAisSqcOKq2lo6Ou4+YpHCuMkZ6gn09q7HXbMyWXmITvhUYbqdvQ/l/WuLfUYoRPbyRhzE20Dd94+uew5rWvTdOXLHYnDVva079SVYEKBV3ArxuPORVS5Xa5RQNsg2KPQ461GHvLzb5gKqnAwdv5ioFmkkvA+eFydoACjA7flWcU+rN7HqGkOH0y3ZiTuiAz1LHGKfKGYhF4Y43H2/+vVHwpI0miWhbouQOfetID5ix9AK9um7wTPnKq5akl5sYWWJNzHhAWPvxXDOSZCTnk5rs9RYGzn6bcEc/TFcWRkn0zXDjXqkdeDWjYY+n50UmPc/lRXAdx0EhweCc1oaTHIYtwYMpfG09QazHweOM/WtnTN0dgGijBk3DG9uOTyePbtXVhF+8OXFO1MvqVZiRwFG3j8eKW3wwVj+VNt0SOB4kJwPXk5/rzUV7dR2VisjBiWYIAnXkHP5V6cpKKuzzoxcnZHGeJvOvdWm8uIsRhEYdBj1/H+dczdR3JBhKNmNtvHPIrv8AT9lxO6blZEkPmFjjOOT+GaqW9ja3CbseX8x3AeoJ6CvnXivecpLc+jhHkioroc9pNg85it9jCSVsMG4wgxk16RDClrBHbwrhQu0Y7DH865/SrJbe+U5JZJCoyM/wnn8/5V0aryoYnGOf616uBcZQc11PLx825qPREF5Abi1aBW2l4WjB9zz+mK4SXw68cxN5GYC/z+bnIPrznivRYlUuRnLgZA9jWX4nif8As2SWMFxAQzgf3RnP5ZzWmJpqcW1ujPCVpU5cvRnNixa1t2jtoi7Fcb3bAA/nXHXEZgvJIFfcFOckccckAV3DBpk82OU7cAFQcjnoRXIXMO7WJEkYliWGQc9RXlUnqz2E2z0jRCiaJbRRKRiPg+pJ4P55rQmJGcDocD8KytDLR6FbhRn5CTk+55rQhuEljdnb5towPT/69e5TfuL0PArL97L1ZHfIPsE6kZ/dEjArij3x/Ou5kCSQXCuV+WMkDoOQM/yrhiRz+lcON3R14PZh+dFJn3NFcR2HQunuK1NJXbCgUjJyzY7en8qzzwwJGRnpWvbIu1SqjD47YrqwtlLmOXE35bExKRo+05baQfqRmsXxY8im2jjHylTgep7/ANK0HDfvmUfMy8j1bj+mKLhEliVJxlVbk++R/MVviZc1JpGOG9yqmcwLZwN2VUuoI/2j/kVPYXHk8zea2/8A2v5ZqeG4i3HeEHl5Uc56D19Kszi0uAoVUJxwV5OfT2rwZTa0a0PdKVpeGfWLRInPl7WLu3QkZwfck8fhxXUxyh5CCMZwQO+O9c3ZW0S3pljQlRFjJOfmJ7enH863RtjKgdW6kf417mAt7FWPFx1va6FhGESAhSCjcc9R2pkn79JLZgB58TA575GP61ExZ0AHOT+XqabEEa4jJOGRSgz6E5z+ldbscaucM80tvH5LII2WJlBHXg9R6VkaZYnzJJ33M3VSR1Puf8mtrUP3mpz25yN0jxhuMAbj1qZrRI2jSE7IxGec8E4HJPrxXiTlytpH0cdUmdDoCj+yocglMFMEdAT/AIGrkcCR5GcsvQ+uP/rVgeGrxmtZEaMMiv8AKT2yP17H8a3GkTYwIYccDHSvZoSvTTPBxMWqsl5jrsAwSIx27wRuA5B9v8964++t/s1zJETkA8MeOK6md0xJIXACjkk9Dg/41yczPI5aRtzGuXGNXR0YROzG5NFJx36/SiuE7DpGAPUCtpSqoJHYkYUHvxWSy+/NT3F1JBaRMbVpVGC2w8gDjODW1KVmY1YOS0LcpkHm7FzIqO+PXIOB+AxVDV2P9k5V8h0AB9Tzz+WfyrSimVsTurKJASQw5HHA+uMVl6yqNaRwq5Jjfdgfn/U1dWquVkUab9otDlIpG2vsfBZtxX06fpVuJ5SxbGRHzu6AVQnwnzqwBPBqFZWJZFZmyecE1yuKaPVOh0ubN0obJDHJKjrt/kOf0roWZyxaQAIGOzHUjsa5TSpRBqNuHYc/Lgnk5wM47c12CJvTJ4Ucc9xXZhnywsjy8ZH95fyGNktkN8ueeeAPWmpInmOOkQQ85655J/p+FJcBsKgGFJwc/wAR5P8AKoNSBj06bBwfLJz689P0rp5tGzljG7S7nHrcxzaxM8rbY5pX5xxycgZqbVpxFYFVdT5hCIi9SMHNUdLi3X7Rk4SMFt7DH0/z7Ul6FnvyYgxCKMsT945wfyzXkyXNO7PeSWx1+iQJBp8cgXM0kYZifXH+RU5ZvtB3Dao7df8APep7UL9nj2cjyxg+2BUbIu6TfznJ+ozXpxlZJI8OouaTbK85H2WVQ+DIWOCM/hXM468j866W7cx2gcD98HDAbc4I5rniMlye59K5sS7yR0YdWiR/gPzop4RCOSwP0ornOg6mTYgy5AHuaz/t7eXsVi2CcfMcn9Kl1lGkUIoyT0wuSD9c/wBKzktLiPlkkbbz83atYLS5nKS2uIutSLPc7W+XzSNu4g9cVbgaVTD5wyzxk56cjBP5AgfhVDT7F/Od3i+RpSyluM85x71qNne7E5aK32YHQEnd/QVnXeljWg027HPXKCYuCcEsW47DNMiiXevl5yvJJPQU7e4QbsqwHzk/zpyFzsKjODlm6gj0pK9jrJVgiS685Djbj5iOTnuD7cV08euWTRRmORCeAFLckcVz06O/mOqMoSFmyB0IOAMf561LLpm4AiVDGQAAwztA6YrSlJnNXhGVrm+dRgJdsnzIyWXHODzxUWq3MUlhcxRhw0iAKMcgE9fauem00CZz9rjBkBAOQCex/rU1zB9iSDE/mh87QvJ+XAH4AGtXUlZnPCjDnViDT0KRHzwgAJbDD5gO4qO5HnS+XbJmRgi+gA3Z49fStO3ZWtwUhLdjurObdbTB5RmRnBdj/d9f6VxR1kz0TsbaHyYY4uvlR7T7mklUngcYP50H7OEJO9BJxuDHBHaqUqrI67WkC/dJY+vFdiqq1rHluk273NFZEtLWe4KRyOuFVHYDI79a5C4Cs7EKEUkkKDnHtWtJCrxDgnjvWe0asdsStnupHNRVm5WNKdPkKwgkI4Bx9aKUjnmisTQ2tVjMc8dyXPl/cZT2z6VHNe2gDqhCkdMHIA9/WrmpwNd25jUgYO71z/hXJSRyCcwspLKeV5reEtLGDw6lJyOiju7e5vEeGNFWEYDgDJJH+Gaa4MaTPuGyRyVOPX+nSq1nGkKqNhKKAxYeuMfjU01033UiYZXrsJ5rnqtylc76NKNONkUGi83C7MgsGyw7Dt9DWza2CW8IZ41ZsZLHoKx/MuVZAsbDKnOcZWnG71LcrNPLk9VU5H5VMozasi2zehhKoYmAZGYEZABbHP8AkfSuOe9dGlEdy4C9PnPriugsL/UWngF1FujDZLFMYx0z61y2oRLFfXKKQVL5HORyc1WGjKLakY1EpWuWJNQdl82SdpJNwzkZz69eOladsPNtRsz5juCCVwdvqPr/AENc8QBEUHJJro7ZlMUUE4cIqgqV4PTt34zW1Vu1iaVGKlzIekuAwRc7XKsueRzg1Tv0aOIytt5IGOoA9PrVqxlmlgkgkB3LIUZtvD46N+I/rUOswXD20a8FI3LnA68d6wgrSNpq8WiFbtjP+6OwLyNrdv61I890pYrdOC3CjqCf8eKwVV1fbjaGT+9n8Kk8+YAZJwOmTmuzQ4vZ1IrR39Tp7e4+0WSkyDeP7rYP5GoQ5SQMGO4GszTGaViqsFK88jg1oXETOAA7KfVaxmlcalOzutSwbyLPMQz34oqkLd8D/SJKKXzFzS/lOtwB3oQLG7uqqGYEMdvUEYpTGcH5v0pNmTy3apTa1RbSasyFI0ghSKIARqoUDrxQCe3apNvbJphUDpkc0DGsBknAyR1xTf4vbNPkPbmmHGMjr9aAHW8iRTh5E8xVyQh6E44z7VnpYWkbyuYVdnYH5lz9anll29s81C05PO39ad2hFSbRrSV5JMvGx5VV+7VzG23it/vRx5Kg+p6mqUt66MflU4pJL1ifuAZpuTkrMS917lwRptwMg56AmkeP5ChBIPbNUpL91XhF7UrXMr7DlQT/ALNTylc77j57O3kC/u8Bffmm/Z4SMeWFx6GozPKRyw/KpEDtjL+vaq5pdxaCRRIikpnnsRg0j56n1qdIg7spduAD2pjoqhjljj3H+FLVhcZt/wB2inLsIH+s6f3h/hRRysLn/9k=";
const wallArtCircles = new Image();
wallArtCircles.src = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAkGBwgHBgkIBwgKCgkLDRYPDQwMDRsUFRAWIB0iIiAdHx8kKDQsJCYxJx8fLT0tMTU3Ojo6Iys/RD84QzQ5Ojf/2wBDAQoKCg0MDRoPDxo3JR8lNzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzf/wAARCAB+AF8DASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwC9cz2tnHcPNMIlkPAI3OQW7AVmHX7aN2kt7KV9uT88gUt1zgYPTHrWFazEkgt5m45Yk5b8ala3YgSxSBQ3GQfujjP49/wrz7Xdmd17bI1bbXMQQr5U0AWXYoRhJxjlsEAHk44PrWmkysFe5AliOSrquAp9wemawrcNaxgMiNtX5U5wg6gY/E1LFJc2kqyRxlo2wZomGGZT324/Kk432KjK25fvYribc3lrEhXakgG7B9j3+o/CoSjxkMu5Rnbhjgnj6da2NJjZdTfT5AyoyM8QXnBHPIPqK1H0hQYm3xF34BdM4/SlaUtkNyjF2ZzJtTNh48qsg4JXBHqDUtnoyMqERBIIyWZ3O3J7n2rp10mFZPNnld1AzzgLgdQRXM+INbk+zrHbRL5Zb9zBwN4B4Zh1P0qlBxtcjnTvykdwkMMge3bCHq9wdij29TVC41GOMHNyXCfM3kQZ7+rVQkl+1lZLrzTMWAyeinr8vTDD06Hp71MLdFRtwChSN/bAJ6+3bH1OelaNvqyEo9ETPr1vnbuvscfNtQZz6VIbgy/PDejoP3dygU4rJvgEubiICP5CFXjqAcZP+eauuYYImuJh5gTYoDdXGMcAj6n1qW2tmUrdUC6XbqkLXBkVmYBUA3HcegGO/wCVX4DDHEFit87QN/mjLHJ2/MR7kHioIIliKl498yRmRt33goz8o9M4A45560pneNJJlIZyAjHHBJbJ/wDZsemKyd2aaFXEyKrSSSKiNswijcpHUN/j9D3qewe8mkBhaQQnO1pAFz6ZPc+/Nalmsbo9xcxoI4lMdxu/jGf19se4qRr9Z8iFAIlX7+/D/wD1hjt+dHtGlsPlT3Lmlb7fU7eeZXdI4ijHGGdiMZwe1bo1C3kVT+8jK9N64x+VefRS4jMsuxnwYyzAk4yevpV+1SOKNJDPLbBVIURkjjOcc9eeMn8KqMpR2IlFTep1uuZl0tikgKMu35EyW56E1yV/Yxzyu1wYmkz8ilgSBngY7Hv3+lW4Nbaa5kt5LdooZDgSqcgD/bHYe9RvbvFcOjRBgTkHg/lkH+RpTm3LsKMUo23M4RbA0cib9wyDjByO4OcZFRSwt5THzDtfJRmGCp64bjofyrVKmRW8wzlD8uFhAB9e3NJdW+B5KB0cDaglPOfzJoTYWMmSLdqsUaToIrlhvJf7uM45xkg5z9eKhuo4ZSbe5d/KjJAjhzvOD1wc8Z7+1aM0MKzRiVGEqvkAHauQcgjPr6e9QXlnKqDZFctE4DZtyMhu4Kqf1H41qmrJiemhveVvvmiYo+1FTa65wSM4z+XFINLgKRxT2wPzq+xZGUYweaqT6jPc3d79gxDAH+ad8DaAMAkngDj61kT3VlHM7vNc3reU2XRtoyOuCck1nJQvoXHnt7xvTuqRwkr5SOpYyDqT2Ge9VZRC0kWQJS4bG0deOenUfnVi6YXejiS1cM9nguFbjaw57duv51UtrMRE7iQsuCyx4JC9c+gzgcdaw5VvfUuUtSKO2JLrAC5bbkseBg5HXr/Pt0qVIHnnG0RbVOWOcFvYDsPc1OsiSERQv5USDO5D9046/U5Ax71TuARISqf6hG8yNCffv169/etY3JZemjVYHSQlAeoQgg5Ht6ZqZWiv9NhltlLMkYwgHLAZH9Kx4ZGvbUwoApJJKuxyD1x7Y/zkV1+jaUn2Z1Vgp2LGsnuBnNTy66bg5K2uxgrI4VizwxR4Awpxs/EdDTYw22OVnIUEHfgDcPp2z69atatoztcqxUBlJJiLYQt/eHr9KztZuPsdqomEhYcglerY4z/hVJXdiG9LkGp3rCNbueFfPRjlc9FJBAz7c4P9KZDdtbqJPK32xdgrcqQR24+o/wA9ZHxdWNucEtcRDHOfmB9/xqjpsqQI6o5MoAZ1POV7HA5yMgfjWkErWJk3e5DfXUt2DDbLsgRzi3HDLj+I/wB5j3/KqaRuivk58sZCnjIxjp/StJSsqtI2xX6BuvPpyOaJoFkjPm7UXCgEe56+oFZqVtDXcm06/uNNgMsSxyR+ZGWAP3ww29fwz+daXlxahKXgvpYTOpVIpcbARkEgjkHAPHTmsFw0WyR5CGWUFnQAnKsPmde4HqPXrU9swEkccxG5HfA5AwSctg8jGTx/jVOKbutwv0ZsfZb23hEMBhYAAkmUZ6ht2PTA/P6UPZzSPDcTtFayEDzQGzzuDDGOMdaqAzSmIQzyum04Ck7uB3Pfp09hUVy82xGjUGfIAkcknPr1yB7YqVF31Y3axbE1npzySLG0srjEkrcMwJyD6fgAOldPoV4ZlgSAL5WCV4xwcda4swzbGMm0TMeWkYY57gfh6Vv+HJltlh8t1cRyYYg54PP+NWrRdzOXvKx1VxbrLEuTub7xHXIwarSW9rDB5jSMEzjPXBPTI/SrM8RlZMylVwHUA4I+g/oaztRnBmKSY8uEbnK/dzjrj6VvVcVG7RhS5nKyZVuYLV182WCM+XzuZRlR6+1UvtmmWMsZtrdIw+f3qRgBTjPJPPNUtRvzNtG7apO6MdMEdPrVN7iGR5Y5VKxs/Ab+fHTt+vrXJys6ubUz4LhQSDEc9wSGX3PIz+NI98q27xxuoRmADyRHgj+6f6VWWSN96K5GMiSTqD6YB5x06+/BpHQxwQRkFw7/ALvc3B47A9M/hVqCFzE0E0mySJnG04bfCcMrdM89eD071p27rBMs1yrkHeDMo+YMOjYPr6+wrKtI2efZZPkN78qRxn82698H2rWuyyqyKGa1jURIgzv64zkfQfTNKSSHFsdeiE7GRsIF2l4jzjpkgdfy/Kq8exs+cmM4WOaMnGMdNwPBPrTZpBYsokUT20yrmZSVdT03EdjSWzfYr2V0O6Hdw+cjp0dMEEHPX+VEbpA2m9Rp08wqzQLJ5RP+r3nrjjPOevr+eK1NK3QNNC24s6LLktkDnp16+1N87fyoAPUMACpB7D29DWhZwyNFJI6gdAOeTjvTc21YUUlK52GRIqF0yQOPyzXPaoV33Sn5stgV0Hmx+YMkYOAfxFYHiAkmd9hwVU4U9xwfwrSom0jKja7OdljSUhCCp5UDGSfcVGkHl3TERIo2/d3FgDx6g/lV2OZUX5I5SznlYuSR6nPvTnmM8OIoCk4PDFww9wR3P16VKTeho2jl4IonleIjzmH3PmIBPtj6d+OKG8uRYwHVSkrSFwCd2Bzx6849hzVm70meydry0i3QOu3zYyTs553Dt9ajkVZxbqxU7FY7gcb/AJuPwJxxRGStdCas7Mu2aPb2t7dqg+SJSisDlVB+QH1z1z6YqXUCiyIFxsWMEqD1JO79dvWqs0krwXDyvkuXVlJ+X2KkfTGKlvFVZWiDh1KZjB6gqRwfQ9qzl8RS2I7jbCVifc0ZdjFLjcjA84J7HPH459aazQyW8XJjYOUwOCO4z+tWIZ4m0qWzWMeXnKSDgkk/cYeuePxFR2tmby8YICY9o8wnjoD/AJzRF6ajt2LVhBPcZj8tZIuik8EY/u/4Vqrdwwh7dLpFCL5f7oZKkgnBPr/jXPa1qfmQC1g3CyQmNmj43sPmBz/dI6VY0+0/fM0R2u7ASBuQ3cMPwquS6uHNZ2RsvqMbJHIfPdGKhWLd8H/CnnWLaUGCYyoVG7DrkDtzjpnmsa4kKpCiqF2T5Kt0x6gfUmpILItMcoWD/KXLHIHp6jj+tOME92Jya2JtQb7A5VtxiYjZIF7eh/Liq1pqBSRzAUgCgs0zpnbkgAfj0z9aRLiWwtrme/lL2DzqDaSj5/mzkD6Dkj69Knk8O2GoWcUthdSi3IyPK+fJ6d/bselUmo7ia5ti7DcPaySrHz+82AAZB49Kr6ppFnehWgcW1wY9xUfcOT6dulQxXsAvDbyyBpmLOyrggHPQ+hP40j6wBd74tLYx+WVVhcAbwncADr/PmueaXNenuVG9rTKP9hahFDNFHGkrMwyI5QBtHJIz3JqSfTry4ubeZbOSMmEeYxIGHz359utaenahZXMshjnMNw4OIbgBS2c9D0NTRuIbtFnUCLyVU5XgHnmhOTdmVyq11qZVvpNzumkuXjjjZ23qrb26ccDjNWL+4trG3gtfMMU94PmfbkgZyTgevT/HFa17KhsYkiODcz7Sm37rAAnB9q57UrW0vL55JRIJQAikv8oCnHyjGTWjjaVnqTFuUfdRHJaxpHsnwInICzITtwOOQRzx9CKUNMfsssTqGmXyjl9xYg4U+xwBjp3qeC3H2iWK31WB7hQRHGhOZWHVSvO7j1HFWI7cbvLksjHJIdyLKwVU53ZBPYHPHXmrTezHykTbJbneHdQGQopHJYAYHoCcVYnu082FbKKR5pBvdwMNgHsOnBGM+1Nlhu1mQwqrrI+JAW2lcADI46c96Y1tLGAsF1tCZ3pgsrZ528gFeecZx3ojom2J7liZ7OE5eASsCQieXv2sTz/wL171T8N6g9vrU6SKUspy3zdAjjnPbryPyp1tbxGckiASYwNpaM+vJx83tnP1qeZVXBG1mf5ixJOe33jQ5pqxNm3c5xLdInsinCu21J07Hrn+YNaNvKIIfNOI9rhl3fdYFmyM9j96sqKZ7W3VZTuhuG8sbfvI2OGFKLkvpkwAwYLiMv6SDkdPxNQ1oXHcsXoi8+W0VFIjbAdv4RvIwfw5/Kp7bVjCfKmffbHCqCdxX3B9BxUomh1KeS5WIx+Z8/uDtIA9+Tn8BUX2HzYYri7fiREVEjGPlAwAT2/CplKKVmPld7o6C4kQRW7fe8uXgZ6ZX098fpXIid57vzopJ7No/njfLAsd3Pt09q6XQZzdxmGQHzYFJD567Tx+lczPby3N3NE0gWOGTbnJYkYzj6UU5atMVR2SaNZriK5j3fI+GJ8xkwST1z3P4U7Di1X7wiDq3lyPuKsB2HYc0aeqTwx4yEP3VwOMDPP+HFQSXAbfIc+Z06cFRk8/kPyqotydgeiuWrhsSYjdwJJF2BX7dOnf7vIqW3vHFnGTcSpdLM0YlIBA9A394YIqrHGt0rrKBut7ZLgFeOcjI/8AHjSWNw0GotEWJFyFU4UYB2nBx68U5CT6mhcaq623mPZKsoGSYRweeSFzjI57f/Wzbe5D3Mhto8KygkZ3Bz/ex0H0FOuY3jkUOwdGG9OxB3ANz68j64/Nxt1iuvLwFZ13FkGM+/1pqWlmD3P/2Q==";

const wallArtTeaNook = new Image();
wallArtTeaNook.src = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wAARCABIAHMDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDc0Xwz4d0Se8vrzVrSW2mtmAhGDtVjnIzkjPqM9O1UtY+Gfh/V7eJ9LhAmkBQsHYMM4wyk8D/6/NS674ebWLqaC1hTzbVhtjfowwcjPTkh+P8AGr+t2+oWmjW9rpGnrPJ5vlec0hEkMQAcq3QlM5IB9BXjROxvseexfCd01cwujizhH764iRnLcdEOcMehPoAavXfgbWItSs7PTbiaEzMnlSYGIwTyxbOBjHIP41t33i61tPD7XGmRmU2U5guoRkzJLjBAUcENzhjwQc8HNYOi/EvSbHU5NSNpqdpJb/LG7ygoqsRklQw5HHb15q2myeZoW60nVtL1caRFq9zqWqTwu6SmRjE/bcfQfT8a5GC+1y58YaTp2m3zDWHuo/s95fRfu4PL+d3JI4ChCSSCMDpW5p/jW413xpPd6FdLZaLdEI819ukngwAXCr6k5bqRknNeiT/Djwl4h8Q6Vqg8TalpWv2h4khQp55YsGPJIOV3KV6c9DST5dzRS7nqXx91bTPE0GlapY6s17c2u9IVSJkW4YplVycbGbbgHB5IBxkY8cvPGMdtY2t5PBqCx30SfZxqGP3xZScgZyFbaSOPT1rO1K6bxN8K4rAXTWs66wkKsrmN0QMV3AENjdH5gPTG7k5r1LRfG9poPiXxFo+l6PZ6nbPC+pQ3VtLHHMyRqkf2Uxy48yQsSV2nbtfPykGiUlUleWgaSPKZ/E+j6tdxW97cwnETG3MiZQgDBUHduH1Hpyav2/g7WfEmm28Xh/XbTQ9OMsdwtlHGDBPtOSJgsilgxGDyDg5PevOPibZvrfxWvdN07S30C8DtDqVmVQuW58x18slVVlwd3G70BPNf4c+CtGj0g6nqod5mZjHG0rrgDPGM89Omazas9GU7RNRvAXx08U6tdwa1440+TSzOkmyCSMCBQflaNQn7sA8AZxj1FdzpfgbxbYNqAF5arFCWQObhZGUqBnauAXxntjJP1rPOt6ZqvhCXR/DxvdKeaaKaSWNdrMkbZZNr5DZBxk9M98Yr260ub2e2to0ujp73YDvPalGumJxySI+TxjGAOQPSm3KWpN1J++zzqfSNM8KXegQ2Hi+xvdR1YmCc6VhpbJCpYnvtdjgb36Fs9SKzdSvJrj4s2/hbwy2p65JfO0mqXAkM8tlGIgjB5ccEhEXccEbm5JPHW/F23Wxi1XSbe5WbWDsQyDYJRHGu+4LMgBVdrRls84GOOlct+zV47vNJ8Pvb67cXLx6lPc3OlQiywjxwDfcOZc5ZnLHCHoFOOK55VJpNwjfp/Xoexh8PR91Snbm1vb8N+o3V5PhlpGpXNlq3i02+p27mO5hWac+XIPvLnd1B4PvRXUa5c/BfV9UmvdS8Kw6nfThXmu2tRmVtoyTuGfzoq1V01ibyoSUmoy0+f+ZhaN4lns/EWubIQIVY3vnRINsm3hQue5Jxg9MHrWteXNkzRzRTLPPJGV3Z2OpwMknvyW+hxVG0tGv9Y1K4gka7t7qUs1u4aNLPB3EMWIzn72BnANNt/s66hLp9lqEMjKy3EzRIWdeOcD7uCOSRzxkg1qj5tnF/2/Bp9/JqN5b2xkYFDGVAlkVeFJGOAcZAbpjpzXPzeLJfE2p3Uq2ot0iiZnRjsJIwM4I+Y5Yc9Divdbyw0DSdPjCWMCMhEgZE3ueCWIZuG5GMHuTiub07wfbwXt5arpk5hu9ytMVjwIjt+QMM8kn8O9a86Ec74Fu9MTTjeX9hBObdmEjCIhEGRzgcgjIwBxz3rtrOaytNU+1W1ok9syYWFE3pKxHzH5gemQO2cUzw/wCB7PU9Ml0VVjihikBuZ1h2tkdGxwT05Ge5rU1DTLXQ9NtdMjFz/Z4RopWjjHzDjbt5yQcnPfI9BWMmB4p4x8eJZataW+n2cDGxnkBhMG5WBB7H0JyD3qDTPFcmuRC5uLaKY5xJwUkAB65XsDjrXRa5DottcQImFEgaOWIrv8liRy3OfTC4zj9NTw54cguruC3sJY4WlYJ5gjEYVWAG5mfnknt68VN1Y3VrF2x02C7tDrUs909/fst3PcxbVCIyrlNzA54C5yeD2HSpPEGu6fZwPpcvh62R1DJF5s3+tAH3tygDJGemPavVLTw34lW9vtD8PW3h+406xhjje5uy8Ms1w8Zby1whzlVzu+VeQOoNefeJbo3tudGuLSzS4EXmJqmmh44EJwGQ7vukEZx3BBx6KEW1foKSdr9DnvD1npDzafeQXd1gbWktrfCorbuV3HnBHVeOfavUfh546h174iWmj2kMVpZRwTOkkzjzL2VFG1N+0HqS+F/5598GvJQH0IWttPLFcTFwFjilYmVm+VRuIHXPTqcjGa94+Ffw4j8IaCmra5pUMfiqYSNKqFZWsoyMiNMcKxULu28knGcCivP2VN92b4Kg69dX2Wruch498NadofgzxDd6I11I+sagthDBva6SOIY3xrI2WjErI25c4GxRgcmvPfBmp3Ph/QrqRwrWOlar5kTmMFoUYsJEUDphJCD65xXrPjOYromsW9lNe2w1ktcAm4JWORT+9jiAwIlkTeSRhiQ3PNea+B2NxDpmlW+lreW8puVulGP3bZjCvyckKGHHsT2ropUpOhGbX+fW5WJrQUmou9m9Vt5WON8X+Db5fE2o/ZI1+zGUmLcCflPI5zyPeiurg8Y+JdFiWws49NmtLb91E15Gry7BwASecAcAdgAO1FXzQNPra7lLQ/GNzYrfWks9vuLSI0M7EMxPfaOoO1QeSePrXCCJL7VvNjmMUzPuDsSiq5JI59ODyf17+m+F/gPrEviW7vPFF/HN9puGnR7MLMkYJGFG4rhQGA6Y44zipfEXgHw5oV07QGyu9NRA0pnnczK20hR5SjOB157kdQMVzKcehxSRZ0zWNWj0G/kgtBLpVvCJTqU0vlBn4AC7hl8kjkdj65o8IeLfEhijsIruyskkWV2nuLXhs4Iw7HkEYyc571x3i/xxdyWV81vIv223MdtEUDKhg5DFQf4O3TP58T+F/GFtLPJYz24eCCFWYBGYvkhc4B4GST0/lmnuZWPYtL1LULl5Li3kstRt7ZvLktWk2mZyQc7+jAdQO2cVLqGvw3aSi38LWVzIqneltPuuQWyPlUgAjr04ryDxN4xsLnxBAXCtYWsnmRxwuoKOvCIr5GQeuP6V2/gzxXpupXF34qj862lhgVVF3LFDHuP3wFAJLA++Bk8ZpNaXCxgJ8JdKsWm1DVrDU42FykUWnWU4Z7m4bgJufAQgjBLMBjJ477EEV38LJrTWR4ce1N1KEVmaO7ty+cIglTcowemcEkYB7V6DbeMr3VNSnX7BdtoMZ8yXUrgbMEnLFWbAZcE9OuDXSadfRLfOdIlt5IpNwkkVwI4sDILZwM98856YrmnKaWhvTcHpUv8AL/L/AIJn+GbLX4Lqz1PWNYnsSAtxJpEMi7hkHKbhyEOeRyOOMHmvJf2hNBmtLy71eOMmx1KZ5QYi5a3m2KNhXOG3Y+QnozEHoK93vtHsbzwxFZWEk1uzT7p7mKYyzSuQAwkkbJbIOPYfdxXmsPiiSXxlLbahYSXNpG8V1YgMXjt7hWZV8w+pV1YKAQCvJyM1y0p1faNJ3S3R7co4f6rHmjy3vZt66f1+Jy3w+8F2Hw9tbPXtZP8AbeuPzbIG/c2kxQhkgPUyRg7TM3C4YqCcV6Voni+a30q7h1eZTbC2VY5IYzuDMAuCMksWLfL7Kc8hjXDaleLda9cSSxTzxWUiQiCJMyyKwDZReAc71PvgDjsyzI1HxVdWN/JayXF1bs+k3MTfK00YeSArkAnzFaVSOMbinUGvqKeDpzo3m/el/SPA+uSoz5oKyXQTUtSv4RciFWnkUb0RuNxjZun0+Y/nXGfCjULjQbvz9ZMF+l9I90q28X7uJWhnKZB4BHljvjnrxXpWha3bePdAuZ1tYtO1iOT7NHaxuAkjsoDsN3Jx8xOOxHGTXG/2CLbw3p1hPdbGfTpllTYC0gja5ZO/ZFI7Zzj0rtw0JRouT6Sj+LPLqTXwd0zn/EGoNe6zd3CaXKwkfcWMgBLY+Y4HHXNFcZrer3c2pSy2d7CLWUJJHkP91lBHTjvRXhcrOs9k8d+N9Z0y4vbfRTCkEFxEbxpLUzboVQNO21eSMFhtXHPfmqXxN0X4a6p8J4/EPh2e/sLBLZp7a9ilIvJbl3bKef8AelLn5QASowAuMGqPja606bX78WqHzYxM2pagZsraxlt5ZUIwZWA+UfwjBPTB6HxH4L8BeJ/h9omh3msQ6HpNiqtaxvOsYhcJkZDkHeqnPJzhiSOa8Ori40Uqfdq7W6/4f8j6zLsBKvGVVpbOyfX/AIb8z568QxvfeI0muJJZt8ES+cHaBrmMxq0MwwDhWBzxxndnmtG21bS7XS7PT0sby81+5uF8rTbLcZJNvCr75GCT2GScDmvavDfwMsbjwCdBv/GSavaxyNPp+rw2yJLa2shBMKsXKupOSvUfNwMAVQ1PUPCXwT0g2fhn7ONZkHlz6hOv2vUJ1JwQXA2p1Bx0xwF7120sT7RWjFtr5L11/L/hzixGDjRlecklvZav00/P/hjzvW/gbqNmIb2xluLi5KRNNDHgB5zlmKliAUUkAep5HGK5Pw34ztPDHiV5ddWVUtY5DcQMSRvySCmDje5OOSMACux8a+NbuyubUyyxzyON813Hcm4GQwDArnIIHYYIrxzx/dzXeqXNxdPJKX3szBcqFJyCPVTzj6dK9CN3ozzXaT0R9MaB43M9rZzxyTqJ5VUWy5KAuAx8w7iQvON5zzjArvPgzoN/a+Irqa8jEOn3g+1M00oCQSmLbtCdwGIXrjHzDrXyf8INRvrnxN4Z0axunEl1fEveowDeXtywYkHcAqFQoxncc84I+tfF39nw/B/U3vZEiurmd7OBVUkCQsEQ8HcOeeOgB7Cu/wBlSVFzt5GvLBQudFqfiOfTbK1tI42QwmRTEWw24YBLg9ByT+NeV6Tqt1H431a3vZV2eWs4CNtL8gAcdyMg/Q460vg1Na8V3GpaFqLeZ4h0yySaJmR0lMZXPluG5wZFIUt7Hp0z7yye7mgez8wTy3EMU8wXc8FsyYMpU9ADk49QK4qWGpwpSkviJxOLlXSi1ax3PiuF9WsrqZ0htZbYG0mVXESybXBAc7gVIjZVzkZ6jHFVPijaw2HgrS/GFsYjfeFJrW6upFxuVVmjkYt1yHXy5Q3Q75OTmr/xjtdUu/DGmWPhnTbSTVPFd3/Z7SzSeUwlKjaw4OSUU7jyQACOBXP/AAh+H3xQ8DeN9Kg8XXGka5oiWaaY9rJfw3DG1Vm8pQm3dIE8wqN+cIxHQAV6NGrFuMNla3z7/eeTON1zN7GN8U9I1Hwp4uWw8PXU32SfxJNdW5t0YrBbyW8RXJ2ngtIo+n0rrNd0aW70zTJrW4C3C3y2iMh8xLeMRtGC3t1c98sDzmutu7u9vb5Wu/IgltEVri3sojtDbUbKk9Ag2L83OBkegoeJtQtLzR9Zi09XVw7SW7QR7o4jGspRlOcZ+XnPYR4zkV6FSUrKktr3+7/hzmilu97WPj/XdIN3q93K+j6pfkyEC500A27gcApnBxgD9aK7jQLjVbfSYI4NG1C4hG4rLBEGRssTkE8nrRXAqdNpPmO6/kT6R8OrvW9KNhYXct5E0hkllGGluJM5Z+eDlhnce+OeK9A8FeBvCnw4uUn8baz/AGzfiU3EWji63wpM3XeAoMpIxnnbgY+cc0UV8VhY87fN3Pr8zrSpSjShorHmfxe+PF5r2u3SaXePBpjZDRBGjk2g8hRwRzkDGMLmvPNA8QNDuaUSWljO2ZIY/mc+mWzk9PSiivoIxSWh8/ZHW3jWHi3TLuDSbeCBtLje7k847b687FEYDBK5GEPXtzWfoFtp3ibwmdIunaOe31S3eJmtnDiG4cRNE/y5OCFIwSPvdM0UVrDqCWtjc8TfB7VfDWs6dqvhuRbA2MK6ixhzhn8wrsQBiVUhTgE5IZjwBx6Xr3jBrm31KGQQ3lpavFc29vBkyqsyRyHJ9SzAk4/hx3oorVyfspLzX6hJvkZ7f4P8Ktqmg6DfWzyxXJhaE27IBI6lS3J6DBGQPqK4LxJpNx4L8ewiW0hnuWkWBI7vgPHI4yDznk4HJx35oop4STi5LyZwSMj4j6Tr/jzXPtWoarfeFNB0OV7TTZrCRZA8w6XeGHCtyMhgeOMYrqvCUyQeEPD1trN7da54zhvXkg8RLcMsEtr5ob542PzEKrKVOCCCQxPFFFXB2sTKTasei6xoVhb+IvFmPtNuEvobp5Y3UMweH7PheOAskHIPGSp7muJvtKh8Ea9e6bKZLm0Szu72ViQ0txn5WlYkYLs5Oc+wFFFexPWf3fqcFNvb+uhwFv4Pgkgjk1G61BbyRQ7rbXJjjUEZUBe2AQPwooorxOZncf/Z";

const wallArtPieces = [
  { img: wallArtWaterBird, x: 518, y: 60, w: 95, h: 63, frame: "ornate" },
  { img: wallArtArch, x: 1102, y: 40, w: 100, h: 133, frame: "plain" }, // right side of the right bookshelf, more breathing room from it, made smaller per request
  { img: wallArtCircles, x: 1685, y: 55, w: 72, h: 95, frame: "oval", darken: true }, // right side of the nook, moved with it, made smaller per request
  { img: wallArtTeaNook, x: 2285, y: 120, w: 88, h: 56, frame: "thin", requiresLamp: true } // lower on the wall, midpoint between the previous two positions -- a personal piece, someone close to the developer's own art. thin frame since a heavy border overwhelms the delicate subject. gated behind the lamp, same as the rest of this cozy corner
];

function drawAntiqueFrame(x, y, w, h, style) {
  const pad = 6;
  if (style === "ornate") {
    ctx.fillStyle = "#4a3818";
    ctx.fillRect(x - pad, y - pad, w + pad * 2, h + pad * 2);
    ctx.strokeStyle = "#8a6a2a";
    ctx.lineWidth = 2;
    ctx.strokeRect(x - pad + 2, y - pad + 2, w + pad * 2 - 4, h + pad * 2 - 4);
    // small corner flourishes
    [[x - pad, y - pad], [x + w + pad, y - pad], [x - pad, y + h + pad], [x + w + pad, y + h + pad]].forEach(([cx, cy]) => {
      ctx.fillStyle = "#8a6a2a";
      ctx.beginPath();
      ctx.arc(cx, cy, 3, 0, Math.PI * 2);
      ctx.fill();
    });
  } else if (style === "oval") {
    ctx.fillStyle = "#4a3420";
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2 + pad + 4, h / 2 + pad + 4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#8a6a3a";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(x + w / 2, y + h / 2, w / 2 + pad, h / 2 + pad, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (style === "thin") {
    // delicate, minimal frame -- a single hairline border, no heavy
    // solid block, for pieces where a heavy frame would overpower
    // a soft/delicate subject
    const thinPad = 3;
    ctx.strokeStyle = "rgba(196,155,90,0.85)";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - thinPad, y - thinPad, w + thinPad * 2, h + thinPad * 2);
  } else {
    // plain -- simple dark wood, slightly thicker for the bigger piece
    ctx.fillStyle = "#3a2818";
    ctx.fillRect(x - pad, y - pad, w + pad * 2, h + pad * 2);
    ctx.strokeStyle = "#5a4028";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(x - pad + 3, y - pad + 3, w + pad * 2 - 6, h + pad * 2 - 6);
  }
}

function drawWallArt(camX) {
  wallArtPieces.forEach(piece => {
    if (piece.requiresLamp && !oakLamp.collected) return;
    const px = piece.x - camX;
    if (piece.frame === "oval") {
      drawAntiqueFrame(px, piece.y, piece.w, piece.h, piece.frame);
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(px + piece.w / 2, piece.y + piece.h / 2, piece.w / 2, piece.h / 2, 0, 0, Math.PI * 2);
      ctx.clip();
      if (piece.darken) ctx.filter = "brightness(0.72) contrast(1.2)";
      if (piece.img.complete && piece.img.naturalWidth) {
        ctx.drawImage(piece.img, px, piece.y, piece.w, piece.h);
      }
      ctx.filter = "none";
      ctx.restore();
    } else {
      drawAntiqueFrame(px, piece.y, piece.w, piece.h, piece.frame);
      if (piece.img.complete && piece.img.naturalWidth) {
        ctx.drawImage(piece.img, px, piece.y, piece.w, piece.h);
      }
    }
  });
}

const owl = { x: 670, bob: 0 };
let owlTalked = false;
// book piles — hoppable platforms. heightAboveGround pre-computed to match
// the actual drawn stack height (matches drawBookPile's own accumulation
// formula), so collision lines up with what's visually there.
const bookPiles = [
  { x: 2278, seed: 41, count: 3, heightAboveGround: 22 }, // moved to the right of the rightmost (medium) shelf, with breathing room
  { x: 350, seed: 52, count: 4, heightAboveGround: 20 }, // fills the empty stretch right after the entrance door
  { x: 460, seed: 8, count: 3, heightAboveGround: 26 }, // second pile in the same gap, before the existing 571 one
  { x: 571, seed: 2, count: 4, heightAboveGround: 30 },
  { x: 839, seed: 23, count: 3, heightAboveGround: 24 },
  { x: 912, seed: 31, count: 12, heightAboveGround: 66 }, // much taller than the others
  { x: 1147, seed: 13, count: 2, heightAboveGround: 16 }, // moved off the door, now between the right shelf and the nook
  { x: 1259, seed: 17, count: 5, heightAboveGround: 34 }, // new -- fills the gap before the nook, more hop opportunities
  { isJumpRun: true, x: 3000, seed: 67, count: 5, heightAboveGround: 25 }, // scrambled jump run start -- deliberately mixed heights, no pattern
  { isJumpRun: true, x: 3100, seed: 74, count: 13, heightAboveGround: 80 },
  { isJumpRun: true, x: 3170, seed: 81, count: 7, heightAboveGround: 30 },
  { isJumpRun: true, x: 3355, seed: 88, count: 11, heightAboveGround: 55 }, // second forced double jump -- wide horizontal gap at a modest height gain, not just a tall vertical one
  { isJumpRun: true, x: 3467, seed: 95, count: 13, heightAboveGround: 78 },
  { isJumpRun: true, x: 3535, seed: 102, count: 7, heightAboveGround: 28 },
  { isJumpRun: true, x: 3643, seed: 109, count: 12, heightAboveGround: 60 },
  { isJumpRun: true, x: 3755, seed: 116, count: 13, heightAboveGround: 80 },
  { isJumpRun: true, x: 3917, seed: 123, count: 44, heightAboveGround: 175 }, // genuine double jump required here -- climbs well past single-jump range
  { isJumpRun: true, x: 3981, seed: 130, count: 22, heightAboveGround: 110 }, // zigzag instead of a smooth descent -- forces a real ascending jump right in the middle
  { isJumpRun: true, x: 4088, seed: 137, count: 24, heightAboveGround: 145 },
  { isJumpRun: true, x: 4152, seed: 144, count: 20, heightAboveGround: 80 },
  { isJumpRun: true, x: 4205, seed: 151, count: 10, heightAboveGround: 50 }, // medium/high only from here on, no more lows
  { isJumpRun: true, x: 4313, seed: 158, count: 13, heightAboveGround: 80 },
  { isJumpRun: true, x: 4363, seed: 165, count: 14, heightAboveGround: 55 },
  { isJumpRun: true, x: 4548, seed: 172, count: 16, heightAboveGround: 80 }, // third forced double jump, on the correct ascending transition this time
  { isJumpRun: true, x: 4595, seed: 179, count: 10, heightAboveGround: 60 },
  { isJumpRun: true, x: 4707, seed: 186, count: 19, heightAboveGround: 78 },
  { isJumpRun: true, x: 4819, seed: 193, count: 18, heightAboveGround: 90 }, // capstone approach -- each pile taller than the last, leading to the giant final pile
  { isJumpRun: true, x: 4927, seed: 200, count: 20, heightAboveGround: 120 },
  { isJumpRun: true, x: 5112, seed: 207, count: 37, heightAboveGround: 150 }, // fourth forced double jump, in the capstone climb itself
  { isJumpRun: true, x: 5220, seed: 214, count: 36, heightAboveGround: 180 },
  { isJumpRun: true, x: 5328, seed: 221, count: 35, heightAboveGround: 210 },
  { isJumpRun: true, x: 5436, seed: 228, count: 59, heightAboveGround: 235 } // the giant capstone pile -- paper airplane waits at the top
];
const BOOK_PILE_WIDTH = 30; // widened from 24 for a bit more forgiveness, but not so wide that adjacent piles in a dense sequence intercept each other's jumps

// fall punishment for the book-pile jump run -- landing back at ground
// level after having been on a pile triggers a brief woozy stun, plus
// (only the first time for a given pile) a scatter-then-rebuild
// animation that leaves the pile permanently looking a little messier
// afterward. Later falls from the same pile are just the stun, since
// the pile's already settled into its messy look.
const pileFallState = {}; // keyed by pile.x -- { everFallen, scattering, scatterT, messy }
const PILE_SCATTER_MS = 1000;
const WOOZY_MS = 2600;
let playerWoozyT = 0;
let playerWasFalling = false; // tracks vy<0 across frames to detect the actual landing moment, not just "currently on ground"

function getPileFallState(pileX) {
  if (!pileFallState[pileX]) pileFallState[pileX] = { everFallen: false, scattering: false, scatterT: 0, messy: false };
  return pileFallState[pileX];
}

function updateBookPileFalls(deltaTime) {
  const dtMs = deltaTime * 1000;

  // detect the actual landing moment: was falling last frame, now at
  // ground level, and remembers a pile they were on before this fall
  if (currentScene === "oak") {
    if (playerWasFalling && player.y <= 0 && player.lastPileX !== null && player.lastPileX !== undefined) {
      const state = getPileFallState(player.lastPileX);
      playerWoozyT = WOOZY_MS;
      if (!state.everFallen) {
        state.everFallen = true;
        state.scattering = true;
        state.scatterT = 0;
        state.messy = true; // permanent cosmetic tell, set the moment the first fall happens
      }
      player.lastPileX = null;
    }
  }
  playerWasFalling = player.vy < 0;

  if (playerWoozyT > 0) playerWoozyT = Math.max(0, playerWoozyT - dtMs);

  // advance any pile currently mid-scatter back toward settled
  Object.keys(pileFallState).forEach(key => {
    const state = pileFallState[key];
    if (state.scattering) {
      state.scatterT += dtMs;
      if (state.scatterT >= PILE_SCATTER_MS) {
        state.scattering = false;
      }
    }
  });
}

const pileColors = ["#7a2f2f", "#3a5a3a", "#4a3a7a", "#b8862f", "#7a4a2f", "#5a3a5a", "#2f5a6a"];

// a book pile spread across the floor -- low, wide, several separate
// small clusters rather than one tall stack, opening up the space and
// giving a broader, gentler hop option alongside the taller piles
const bookSpreads = [
  { x: 1405, width: 90, height: 12, seed: 7 }
];
function drawBookSpread(spread, camX) {
  const baseX = spread.x - camX, baseY = gy;
  const clusterCount = 4;
  for (let c = 0; c < clusterCount; c++) {
    const cx = baseX - spread.width / 2 + (c + 0.5) * (spread.width / clusterCount);
    const seed = spread.seed + c * 5;
    const bookCount = 1 + (c % 2);
    let dy = 0;
    for (let i = 0; i < bookCount; i++) {
      const w = 16 + ((seed + i * 4) % 8);
      const h = 4 + ((seed + i * 3) % 2);
      const rot = (((seed + i * 6) % 16) - 8) / 90;
      ctx.save();
      ctx.translate(cx, baseY - dy);
      ctx.rotate(rot);
      ctx.fillStyle = pileColors[(seed + i * 2) % pileColors.length];
      ctx.fillRect(-w / 2, -h, w, h);
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 1;
      ctx.strokeRect(-w / 2, -h, w, h);
      ctx.restore();
      dy += h;
    }
  }
}
const BOOK_SPREAD_HEIGHT = 9; // max cluster height, now that the base sits exactly at gy instead of 4 units above it
// generic sitting areas -- any spot in this list can trigger reading a
// carried book once the player is actually seated there. New spots
// (like a future cushion pile) just get added here, reusing the same
// trigger logic rather than each getting bespoke code.
const sittingAreas = [
  { id: "nook", x: 1573, heightAboveGround: 32, width: 100, unlocked: () => true },
  { id: "cushionPile", x: 2680, heightAboveGround: 20, width: 130, unlocked: () => oakLamp.collected }
];
const nookSeat = sittingAreas[0]; // kept as an alias -- existing nook-specific collision code references this directly

// rug — right side of the nook, ordinary-looking floor decoration for now.
// Future home of a trap door reveal (rolls up on interact), kept purely
// visual and unremarkable at this stage so it doesn't telegraph anything.
const nookRug = { x: 1797, width: 100, height: 28 };

// trap door sequence -- space while standing on the rug triggers a
// multi-stage reveal: the rug rolls up, the trap door underneath opens,
// then a normal scene transition carries the player down into the room
// below (currently a placeholder, stairs coming down with light from
// the oak room above).
const trapDoor = {
  active: false,
  t: 0,
  opened: false // stays true once opened, so the door doesn't reset each visit
};
const TRAPDOOR_ROLLUP_MS = 1200;
const TRAPDOOR_OPEN_MS = 900;
const TRAPDOOR_PAUSE_MS = 400;
const TRAPDOOR_TOTAL_MS = TRAPDOOR_ROLLUP_MS + TRAPDOOR_OPEN_MS + TRAPDOOR_PAUSE_MS;

function updateTrapDoor(deltaTime) {
  if (!trapDoor.active) return;
  trapDoor.t += deltaTime * 1000;
  if (trapDoor.t >= TRAPDOOR_TOTAL_MS) {
    trapDoor.active = false;
    trapDoor.opened = true;
    startSeasonTransition("ratroom");
  }
}

function drawNookRug(camX) {
  const rx = nookRug.x - camX;
  const ry = gy + 14;
  const w = nookRug.width, h = nookRug.height;

  // subtle tell when the player is actually standing on it -- a gentle
  // wobble, plus one corner slightly turned up, rather than anything
  // that reads as a hint from a distance
  const onRug = isPlayerNear(nookRug.x, 0, w / 2, 20, 10);
  const WOBBLE_CYCLE_MS = 4500, WOBBLE_PULSE_MS = 700;
  const cyclePos = onRug ? performance.now() % WOBBLE_CYCLE_MS : WOBBLE_CYCLE_MS;
  const inPulse = cyclePos < WOBBLE_PULSE_MS;
  const wobble = inPulse ? Math.sin((cyclePos / WOBBLE_PULSE_MS) * Math.PI * 3) * 0.015 * Math.sin((cyclePos / WOBBLE_PULSE_MS) * Math.PI) : 0;

  ctx.save();
  ctx.translate(rx, ry);
  ctx.scale(1 + wobble, 1 - wobble * 0.6);
  ctx.translate(-rx, -ry);

  const left = rx - w / 2, top = ry - h / 2;

  // base
  ctx.fillStyle = "#6a3230";
  ctx.fillRect(left, top, w, h);

  // clean border frame
  ctx.strokeStyle = "#3a1818";
  ctx.lineWidth = 2;
  ctx.strokeRect(left + 2, top + 2, w - 4, h - 4);
  ctx.strokeStyle = "#c9a860";
  ctx.lineWidth = 1;
  ctx.strokeRect(left + 5, top + 5, w - 10, h - 10);

  // abstract arrangement of varied geometric shapes -- not one repeated
  // motif, a genuine mix of triangle/circle/square/diamond in different
  // sizes, still contained cleanly within the border
  const innerLeft = left + 6, innerTop = top + 6;
  const innerW = w - 12, innerH = h - 12;
  const accent1 = "#c9a860", accent2 = "#3a1818", accent3 = "#8a5040";

  // triangle, left side
  ctx.fillStyle = accent1;
  ctx.beginPath();
  ctx.moveTo(innerLeft + 4, innerTop + innerH);
  ctx.lineTo(innerLeft + 14, innerTop);
  ctx.lineTo(innerLeft + 22, innerTop + innerH);
  ctx.closePath();
  ctx.fill();

  // small circle
  ctx.fillStyle = accent2;
  ctx.beginPath();
  ctx.arc(innerLeft + innerW * 0.32, innerTop + innerH * 0.35, 4, 0, Math.PI * 2);
  ctx.fill();

  // diamond, center
  ctx.fillStyle = accent3;
  const dcx = innerLeft + innerW * 0.5, dcy = innerTop + innerH / 2;
  ctx.beginPath();
  ctx.moveTo(dcx, dcy - 7);
  ctx.lineTo(dcx + 6, dcy);
  ctx.lineTo(dcx, dcy + 7);
  ctx.lineTo(dcx - 6, dcy);
  ctx.closePath();
  ctx.fill();

  // small square, offset
  ctx.fillStyle = accent1;
  ctx.fillRect(innerLeft + innerW * 0.68 - 4, innerTop + innerH * 0.25, 8, 8);

  // second, larger circle, right side
  ctx.fillStyle = accent2;
  ctx.beginPath();
  ctx.arc(innerLeft + innerW * 0.85, innerTop + innerH * 0.6, 5, 0, Math.PI * 2);
  ctx.fill();

  // small triangle, bottom right, pointing down
  ctx.fillStyle = accent3;
  ctx.beginPath();
  ctx.moveTo(innerLeft + innerW * 0.78, innerTop + innerH * 0.75);
  ctx.lineTo(innerLeft + innerW * 0.92, innerTop + innerH * 0.75);
  ctx.lineTo(innerLeft + innerW * 0.85, innerTop + innerH);
  ctx.closePath();
  ctx.fill();

  // one corner slightly turned up when the player is standing on it --
  // a tiny corner peeled up, showing the rug's own lighter underside/backing.
  // Which corner lifts follows the player's facing direction, so it reads
  // as rucking up behind their trailing foot rather than always the same
  // fixed corner regardless of which way they walked in from.
  if (onRug) {
    const liftAmt = 6.5 + Math.sin(performance.now() * 0.006) * 1.8;
    const cornerX = player.facing === 1 ? left : left + w;
    const cornerSign = player.facing === 1 ? 1 : -1;
    ctx.fillStyle = "#d8c8a0";
    ctx.beginPath();
    ctx.moveTo(cornerX, top);
    ctx.lineTo(cornerX + cornerSign * liftAmt, top);
    ctx.lineTo(cornerX, top + liftAmt);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#3a1818";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cornerX + cornerSign * liftAmt, top);
    ctx.lineTo(cornerX, top + liftAmt);
    ctx.stroke();
  }

  ctx.restore();
}

function easeInOutTrap(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }

function drawTrapDoorSequence(camX) {
  const rx = nookRug.x - camX;
  const ry = gy + 14;
  const w = nookRug.width, h = nookRug.height;
  const t = trapDoor.t;

  if (t < TRAPDOOR_ROLLUP_MS) {
    // the rug rolls up from the right edge toward the left, like a
    // scroll closing -- shrinking width, with a small rolled cylinder
    // shape at the leading edge
    const p = easeInOutTrap(t / TRAPDOOR_ROLLUP_MS);
    const remainingW = w * (1 - p);
    const rollX = rx + w / 2 - remainingW;
    if (remainingW > 1) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(rollX, ry - h / 2, remainingW, h);
      ctx.clip();
      ctx.translate(camX, 0);
      drawNookRug(camX);
      ctx.restore();
    }
    // the rolled-up portion, drawn as a small cylinder
    const rollWidth = 6 + Math.sin(p * Math.PI) * 4;
    const cyl = ctx.createLinearGradient(rollX - rollWidth, 0, rollX, 0);
    cyl.addColorStop(0, "#4a2020");
    cyl.addColorStop(0.5, "#8a4038");
    cyl.addColorStop(1, "#4a2020");
    ctx.fillStyle = cyl;
    ctx.beginPath();
    ctx.ellipse(rollX - rollWidth / 2, ry, rollWidth / 2, h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
  } else if (t < TRAPDOOR_ROLLUP_MS + TRAPDOOR_OPEN_MS) {
    // single hinged panel -- like a real cellar door. Hinged at the
    // right edge of the hole, it lifts up through vertical and lays
    // flat on the ground to the right, revealing the hole as it goes.
    const p = easeInOutTrap((t - TRAPDOOR_ROLLUP_MS) / TRAPDOOR_OPEN_MS);
    const doorW = w * 0.9, doorH = 5;
    const theta = p * Math.PI;
    const hingeX = rx + doorW / 2;

    // dark pit beneath, growing more visible as the door lifts clear of it
    ctx.fillStyle = "#0a0604";
    ctx.fillRect(rx - doorW / 2, ry - doorH - 2, doorW, doorH + 6);

    const farX = hingeX - doorW * Math.cos(theta);
    const farY = ry - doorW * Math.sin(theta);
    const midX = (hingeX + farX) / 2, midY = (ry + farY) / 2;
    const panelAngle = Math.atan2(farY - ry, farX - hingeX);

    ctx.save();
    ctx.translate(midX, midY);
    ctx.rotate(panelAngle);
    ctx.fillStyle = "#6a4028";
    ctx.fillRect(-doorW / 2, -doorH / 2, doorW, doorH);
    ctx.strokeStyle = "#3a2010";
    ctx.lineWidth = 1;
    ctx.strokeRect(-doorW / 2, -doorH / 2, doorW, doorH);
    ctx.restore();

    // the hinge/latch itself, a small fixed dark bracket at the pivot point
    ctx.fillStyle = "#2a1810";
    ctx.beginPath();
    ctx.arc(hingeX, ry, 2.5, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // brief pause with the door lying flat and open on the ground to
    // the right -- a normal walkable surface, not blocking anything
    const doorW = w * 0.9;
    const hingeX = rx + doorW / 2;
    ctx.fillStyle = "#0a0604";
    ctx.fillRect(rx - doorW / 2, ry - 7, doorW, 10);
    ctx.save();
    ctx.translate(hingeX + doorW / 2, ry);
    ctx.fillStyle = "#6a4028";
    ctx.fillRect(-doorW / 2, -2.5, doorW, 5);
    ctx.strokeStyle = "#3a2010";
    ctx.lineWidth = 1;
    ctx.strokeRect(-doorW / 2, -2.5, doorW, 5);
    ctx.restore();
  }
}

// short, wide shelf -- right of the rug, breathing room from it. Deliberately
// simpler than the tall left/right shelves (no mixed rows, no special-case
// books), just a squat, broad shelf with a few rows of ordinary books.
// small table with a lamp on it -- appears only once the rat has been
// fed (see ratNPC.fed), tucked in an ordinary gap in the room rather
// than somewhere obviously staged, matching the "wouldn't have noticed
// it before now" framing from the rat's own dialogue
// cushion pile -- a second sitting area, unlocked once the lamp has
// been collected. Several overlapping cushions plus a couple of small
// things hanging from the ceiling above it.
const cushionPile = sittingAreas[1];

// tea nook -- a small arched niche to the left of the cushion pile, a
// baby owl offering free tea from behind a low table. Same unlock
// condition as the cushion pile it sits beside. Purely passive,
// repeatable, no gate or one-time flag.
const teaSpot = { x: 2425 };
let spoutTipWorld = { x: 0, y: 0 }; // set when the actual kettle spout is drawn; the pour stream reads this directly instead of recomputing the spout's position independently, which is what caused it to drift out of sync
const babyOwl = {
  idleT: 0, idleNextAt: 3000 + Math.random() * 4000, idleShift: 0, idleShiftT: 0,
  sipT: 0, sipNextAt: 5000 + Math.random() * 7000, sipping: 0,
  retreatT: 0, retreatNextAt: 9000 + Math.random() * 8000, retreatShiftT: 0, retreatOffset: 0
};
const teaDialogue = { active: false, lines: [], index: 0 };
const teaAnim = { phase: "idle", t: 0 }; // idle -> pouring -> full -> sipping -> empty -> idle
let pourRetractValue = 0; // smoothly eases back to 0 once pouring ends, instead of the owl/kettle instantly snapping to resting
const TEA_SEGMENT_MS = { pouring: 2200, full: 1800, sipping: 1400, empty: 1200 };
const TEA_SPARKLE_COUNT = 6;

function drawCushionPile(camX) {
  if (!cushionPile.unlocked()) return;
  const cx = cushionPile.x - camX;
  const baseY = gy - 4;

  // hanging ornaments from the ceiling -- more of them now, varied
  // heights and shapes
  const hangs = [
    { dx: -34, len: 55, color: "#c9863a", shape: "circle" },
    { dx: -8, len: 70, color: "#8a5a2f", shape: "diamond" },
    { dx: 22, len: 48, color: "#a83a4a", shape: "circle" },
    { dx: 42, len: 62, color: "#6a8a3a", shape: "diamond" }
  ];
  hangs.forEach(h => {
    ctx.strokeStyle = "#4a3018";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx + h.dx, 0);
    ctx.lineTo(cx + h.dx, h.len);
    ctx.stroke();
    ctx.fillStyle = h.color;
    if (h.shape === "circle") {
      ctx.beginPath();
      ctx.arc(cx + h.dx, h.len + 5, 5, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.save();
      ctx.translate(cx + h.dx, h.len + 5);
      ctx.rotate(Math.PI / 4);
      ctx.fillRect(-4, -4, 8, 8);
      ctx.restore();
    }
  });

  // back cushions -- taller, propped up behind the seating spot like a
  // backrest, leaning at angles against each other
  const backCushions = [
    { dx: -30, w: 58, h: 65, rot: -0.25, color: "#4a6a5a" },
    { dx: 0, w: 63, h: 73, rot: 0.05, color: "#7a3a4a" },
    { dx: 32, w: 55, h: 63, rot: 0.28, color: "#8a5a2f" }
  ];
  backCushions.forEach(c => {
    ctx.save();
    ctx.translate(cx + c.dx, baseY - c.h * 0.42);
    ctx.rotate(c.rot);
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.ellipse(0, 0, c.w / 2, c.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
    // a seam line for texture, so it doesn't read as a flat blob
    ctx.strokeStyle = "rgba(0,0,0,0.15)";
    ctx.beginPath();
    ctx.moveTo(-c.w * 0.3, -c.h * 0.25);
    ctx.quadraticCurveTo(0, 0, -c.w * 0.3, c.h * 0.25);
    ctx.stroke();
    ctx.restore();
  });

  // sheer, semi-transparent fabric strips hanging from the ceiling,
  // draping down toward the cushions with a gentle breeze-like sway --
  // each on its own phase so they don't all move in lockstep
  const now = performance.now();
  const fabricStrips = [
    { dx: -38, len: 150, color: "rgba(230, 220, 200, 0.35)", phase: 0 },
    { dx: -12, len: 172, color: "rgba(120, 40, 55, 0.4)", phase: 1.4 },     // maroon
    { dx: 10, len: 140, color: "rgba(200, 190, 220, 0.3)", phase: 2.6 },
    { dx: 24, len: 165, color: "rgba(95, 55, 90, 0.4)", phase: 3.8 },       // plum
    { dx: 44, len: 148, color: "rgba(184, 98, 42, 0.4)", phase: 5.1 }       // burnt orange
  ];
  fabricStrips.forEach(f => {
    const fx = cx + f.dx, fy = 0;
    const sway = Math.sin(now * 0.0009 + f.phase) * 14;
    const swayMid = Math.sin(now * 0.0009 + f.phase + 0.6) * 8;
    ctx.strokeStyle = f.color;
    ctx.lineWidth = 5;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.quadraticCurveTo(fx + swayMid, fy + f.len * 0.5, fx + sway, fy + f.len);
    ctx.stroke();
  });

  // front/side cushions -- lower, squashed-looking, overlapping and
  // leaning against each other and the back cushions, forming the
  // actual enclosing "seat in the middle" shape. Genuinely varied
  // shapes now (not all ellipses), and repositioned into two loose
  // clusters with a real gap in the middle where you'd actually sit.
  const frontCushions = [
    { dx: -54, w: 38, h: 30, rot: -0.4, color: "#a83a4a", shape: "ellipse" },
    { dx: -32, w: 43, h: 38, rot: -0.2, color: "#6a8a3a", shape: "roundRect" },
    { dx: 0, w: 58, h: 23, rot: 0, color: "#4a6a8a", shape: "flatSeat" },
    { dx: 32, w: 45, h: 35, rot: 0.2, color: "#c9863a", shape: "roundRect" },
    { dx: 56, w: 35, h: 28, rot: 0.4, color: "#8a5a2f", shape: "blob" }
  ];
  frontCushions.forEach(c => {
    ctx.save();
    ctx.translate(cx + c.dx, baseY - c.h / 2 + 5);
    ctx.rotate(c.rot);
    ctx.fillStyle = c.color;
    const w = c.w, h = c.h;
    ctx.beginPath();
    if (c.shape === "ellipse") {
      ctx.ellipse(0, 0, w / 2, h / 2, 0, 0, Math.PI * 2);
    } else if (c.shape === "roundRect") {
      const r = h * 0.35;
      ctx.moveTo(-w / 2 + r, -h / 2);
      ctx.lineTo(w / 2 - r, -h / 2);
      ctx.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
      ctx.lineTo(w / 2, h / 2 - r);
      ctx.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
      ctx.lineTo(-w / 2 + r, h / 2);
      ctx.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
      ctx.lineTo(-w / 2, -h / 2 + r);
      ctx.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2);
    } else if (c.shape === "teardrop") {
      ctx.moveTo(-w / 2, h * 0.15);
      ctx.quadraticCurveTo(-w / 2, -h / 2, 0, -h / 2);
      ctx.quadraticCurveTo(w / 2, -h / 2, w / 2, h * 0.15);
      ctx.quadraticCurveTo(w / 2, h / 2, 0, h / 2);
      ctx.quadraticCurveTo(-w / 2, h / 2, -w / 2, h * 0.15);
    } else if (c.shape === "flatSeat") {
      // wide and low, with just a slight concave dip in the top-center
      const r = h * 0.5;
      ctx.moveTo(-w / 2 + r, -h / 2 + 2);
      ctx.quadraticCurveTo(-w * 0.15, -h / 2 + 2.2, 0, -h / 2 + 3.5);
      ctx.quadraticCurveTo(w * 0.15, -h / 2 + 2.2, w / 2 - r, -h / 2 + 2);
      ctx.quadraticCurveTo(w / 2, -h / 2, w / 2, -h / 2 + r);
      ctx.lineTo(w / 2, h / 2 - r);
      ctx.quadraticCurveTo(w / 2, h / 2, w / 2 - r, h / 2);
      ctx.lineTo(-w / 2 + r, h / 2);
      ctx.quadraticCurveTo(-w / 2, h / 2, -w / 2, h / 2 - r);
      ctx.lineTo(-w / 2, -h / 2 + r);
      ctx.quadraticCurveTo(-w / 2, -h / 2, -w / 2 + r, -h / 2 + 2);
    } else {
      // irregular, slightly lumpy blob -- not a clean symmetric curve
      ctx.moveTo(-w / 2, -h * 0.1);
      ctx.quadraticCurveTo(-w * 0.4, -h / 2, 0, -h * 0.45);
      ctx.quadraticCurveTo(w * 0.35, -h * 0.55, w / 2, -h * 0.05);
      ctx.quadraticCurveTo(w * 0.55, h * 0.3, w * 0.15, h / 2);
      ctx.quadraticCurveTo(-w * 0.25, h * 0.55, -w / 2, h * 0.2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.restore();
  });

  // a soft blanket draped over the dark orange (brown blob) cushion on
  // the right, following its bump on the left side, then curving down
  // to the ground with a real crease at the fold, trailing flat along
  // the floor rather than tapering back into a symmetric oval
  ctx.save();
  ctx.translate(cx + 52, baseY - 11);
  ctx.fillStyle = "#7a5a72";
  ctx.beginPath();
  ctx.moveTo(-18, -10);
  ctx.quadraticCurveTo(-9, -17, 4, -12);
  ctx.quadraticCurveTo(12, -8, 16, -3);
  ctx.quadraticCurveTo(20, 4, 27, 10);
  ctx.lineTo(31, 13);
  ctx.lineTo(16, 13);
  ctx.quadraticCurveTo(4, 12, -6, 6);
  ctx.quadraticCurveTo(-15, 2, -21, -3);
  ctx.quadraticCurveTo(-23, -7, -18, -10);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.lineWidth = 1;
  ctx.stroke();
  // fold lines -- suggests real fabric bunching, not a flat painted shape
  ctx.strokeStyle = "rgba(50,32,48,0.35)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-11, -11);
  ctx.quadraticCurveTo(0, -10, 10, -5);
  ctx.stroke();
  // the crease itself -- a distinct fold line right where the
  // blanket bends from the curved descent into the flat ground segment
  ctx.strokeStyle = "rgba(50,32,48,0.5)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(20, 6);
  ctx.lineTo(29, 12);
  ctx.stroke();
  // fringe along the lower-right edge, trailing flat on the ground --
  // each strand splays slightly outward from center rather than
  // hanging perfectly straight, suggesting they've settled and spread
  // against the floor
  ctx.strokeStyle = "#5a3f54";
  ctx.lineWidth = 1.2;
  for (let i = 0; i < 5; i++) {
    const fx = 12 + i * 4;
    const fy = 13.5;
    const splay = (i - 2) * 1.3; // negative for left strands, 0 for center, positive for right
    ctx.beginPath();
    ctx.moveTo(fx, fy);
    ctx.lineTo(fx + splay, fy + 4);
    ctx.stroke();
  }
  ctx.restore();

  /* FUTURE USE -- embroidery hoop, pulled after several positioning
     attempts still read as floating/pasted-on rather than genuinely
     resting on the cushions underneath. Left fully intact below in
     case a different approach (or a different spot entirely) works
     better later.

  // a small embroidery hoop, its bottom sitting right at the boundary
  // where the blue cushion's edge crosses the green one -- an
  // in-progress project set down mid-work, not a finished piece
  ctx.save();
  ctx.translate(cx - 20, baseY - 27);
  ctx.rotate(-0.15);
  // fabric inside the hoop
  ctx.fillStyle = "#e8ddc0";
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.fill();
  // partial stitched design -- a couple of colored thread lines
  // suggesting a shape still being worked on, not complete
  ctx.strokeStyle = "#7a3a4a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-4, -2);
  ctx.quadraticCurveTo(0, -6, 4, -2);
  ctx.stroke();
  ctx.strokeStyle = "#c9863a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-3, 2);
  ctx.lineTo(3, 2);
  ctx.stroke();
  ctx.strokeStyle = "#4a6a8a";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-2, 4);
  ctx.lineTo(2, 5);
  ctx.stroke();
  // the wooden hoop ring itself, drawn on top of the fabric edge --
  // a distinct golden-tan tone, not matching any cushion color
  ctx.strokeStyle = "#b08850";
  ctx.lineWidth = 1.8;
  ctx.beginPath();
  ctx.arc(0, 0, 9, 0, Math.PI * 2);
  ctx.stroke();
  // needle resting across the edge, thread trailing off it
  ctx.strokeStyle = "#c8c0a8";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(6, -5);
  ctx.lineTo(12, -9);
  ctx.stroke();
  ctx.strokeStyle = "#7a3a4a";
  ctx.lineWidth = 0.55;
  ctx.beginPath();
  ctx.moveTo(6, -5);
  ctx.quadraticCurveTo(3, -7, 2, -3);
  ctx.stroke();
  ctx.restore();
  */
  ctx.restore();

  /* FUTURE USE -- sketchbook + microns, pulled from this scene since
     the cushion pile was getting too visually busy once the
     embroidery hoop was added. Sketchbook is a bigger, more
     deliberate object than a small detail (rounded corners, spine,
     elastic wrap, ribbon bookmark, plus two pens) -- probably belongs
     somewhere with more room to breathe, possibly tied to wherever
     painting/drawing eventually lives as its own zone, rather than
     competing for attention here. Left fully intact below in case
     it's useful as-is later.

  // a small sketchbook, dark olive moleskine-style -- rounded corners,
  // a spine edge, elastic band wrap, and a ribbon bookmark peeking
  // out, so it reads as an actual sketchbook rather than a rectangle
  ctx.save();
  ctx.translate(cx + 58, baseY - 10);
  ctx.rotate(-0.1);
  const sbW = 20, sbH = 15;
  ctx.fillStyle = "#3a4a2a";
  ctx.beginPath();
  ctx.moveTo(-sbW / 2 + 2, -sbH / 2);
  ctx.lineTo(sbW / 2 - 2, -sbH / 2);
  ctx.quadraticCurveTo(sbW / 2, -sbH / 2, sbW / 2, -sbH / 2 + 2);
  ctx.lineTo(sbW / 2, sbH / 2 - 2);
  ctx.quadraticCurveTo(sbW / 2, sbH / 2, sbW / 2 - 2, sbH / 2);
  ctx.lineTo(-sbW / 2 + 2, sbH / 2);
  ctx.quadraticCurveTo(-sbW / 2, sbH / 2, -sbW / 2, sbH / 2 - 2);
  ctx.lineTo(-sbW / 2, -sbH / 2 + 2);
  ctx.quadraticCurveTo(-sbW / 2, -sbH / 2, -sbW / 2 + 2, -sbH / 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.3)";
  ctx.lineWidth = 0.7;
  ctx.stroke();
  // spine edge -- a darker strip along the binding side
  ctx.fillStyle = "#2a3a1e";
  ctx.fillRect(-sbW / 2, -sbH / 2 + 1, 2.5, sbH - 2);
  // elastic band wrapped vertically around the book, slightly off
  // center toward the open edge, away from the spine
  ctx.strokeStyle = "#1a2412";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(sbW * 0.18, -sbH / 2);
  ctx.lineTo(sbW * 0.18, sbH / 2);
  ctx.stroke();
  // small ribbon bookmark peeking out from the bottom edge
  ctx.fillStyle = "#8a3a3a";
  ctx.beginPath();
  ctx.moveTo(sbW / 2 - 6, sbH / 2 - 1);
  ctx.lineTo(sbW / 2 - 4, sbH / 2 + 4);
  ctx.lineTo(sbW / 2 - 5, sbH / 2 + 2);
  ctx.lineTo(sbW / 2 - 6, sbH / 2 + 4);
  ctx.closePath();
  ctx.fill();
  ctx.restore();

  // a couple of micron pens resting beside the sketchbook -- thin
  // dark bodies with color-coded caps, like real drawing pens
  const microns = [
    { dx: 82, dy: -6, rot: 0.6, capColor: "#1a1a1a" },
    { dx: 88, dy: 4, rot: 0.75, capColor: "#7a4a2a" }
  ];
  microns.forEach(m => {
    ctx.save();
    ctx.translate(cx + m.dx, baseY + m.dy - 10);
    ctx.rotate(m.rot);
    ctx.fillStyle = "#2a2a28";
    ctx.fillRect(-9, -1, 16, 2);
    ctx.fillStyle = m.capColor;
    ctx.fillRect(7, -1, 5, 2);
    ctx.beginPath();
    ctx.moveTo(-9, -1);
    ctx.lineTo(-11, 0);
    ctx.lineTo(-9, 1);
    ctx.closePath();
    ctx.fillStyle = "#4a4a48";
    ctx.fill();
    ctx.restore();
  });
  */
}

// fairy lights -- a gently sagging string draped above the cushion
// pile, small warm glowing bulbs with a subtle twinkle. Same unlock
// condition as the cushion pile it's part of.
function drawFairyLights(camX) {
  if (!cushionPile.unlocked()) return;
  const cx = cushionPile.x - camX;
  const bulbColors = ["#e8d8a0", "#f0e6c0", "#dcd0a8", "#e8dcb0"]; // cooler, softer pale-gold, not warm party-string amber
  const now = performance.now();

  function drawBulb(x, y, i, glowScale) {
    const twinkle = 0.55 + 0.35 * Math.sin(now * 0.0015 + i * 1.7);
    ctx.save();
    ctx.globalAlpha = twinkle;
    ctx.fillStyle = bulbColors[i % bulbColors.length];
    ctx.beginPath();
    ctx.arc(x, y, 1.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = twinkle * 0.3;
    ctx.beginPath();
    ctx.arc(x, y, 2.8 * glowScale, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // several drooping strands from the ceiling, uneven spacing (not
  // evenly distributed like party bunting) and varied length, each
  // with a slow drift on top of the twinkle so they feel suspended
  // in still air rather than strung up for an event
  const droops = [
    { dx: -66, len: 78, seed: 1 }, { dx: -44, len: 102, seed: 6 },
    { dx: -12, len: 88, seed: 11 }, { dx: 8, len: 112, seed: 4 },
    { dx: 30, len: 80, seed: 15 }, { dx: 58, len: 96, seed: 9 },
    { dx: 74, len: 70, seed: 18 }
  ];
  droops.forEach(d => {
    const dx0 = cx + d.dx;
    const sway = Math.sin(now * 0.0006 + d.seed) * 5;
    const drift = Math.sin(now * 0.00018 + d.seed * 2.3) * 3; // very slow, tiny -- suspended, not swinging
    ctx.strokeStyle = "rgba(70,62,44,0.45)";
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(dx0 + drift, 4);
    ctx.quadraticCurveTo(dx0 + drift + sway * 0.5, 4 + d.len * 0.5, dx0 + drift + sway, 4 + d.len);
    ctx.stroke();
    const bulbCount = 5;
    for (let i = 1; i <= bulbCount; i++) {
      const t = i / bulbCount;
      const x = dx0 + drift + sway * t;
      const y = 4 + d.len * t;
      const glowScale = 0.7 + ((d.seed * 7 + i * 3) % 5) * 0.18; // varied glow size, not uniform bulbs
      drawBulb(x, y, i + d.seed * 5, glowScale);
    }
  });
}

function drawTeaNook(camX) {
  if (!cushionPile.unlocked()) return;
  const tx = teaSpot.x - camX;
  const archW = 120, archTop = gy - 84, archBottom = gy - 2;
  const archR = (archW + 10) / 2;
  const springY = archTop + archR;

  // arch niche -- shorter and lower than the reading nook, its own
  // distinct proportions rather than a shrunk copy
  ctx.fillStyle = "#241608";
  ctx.beginPath();
  ctx.moveTo(tx - archR, springY);
  ctx.lineTo(tx - archR, archBottom + 4);
  ctx.lineTo(tx + archR, archBottom + 4);
  ctx.lineTo(tx + archR, springY);
  ctx.arc(tx, springY, archR, 0, Math.PI, true);
  ctx.closePath();
  ctx.fill();

  // subtle surface texture -- a few soft irregular patches and thin
  // strata lines suggesting rough stone/clay, confined strictly to the
  // upper arch region, well clear of where the table/owl/kettle sit,
  // to avoid any risk of repeating the earlier mistake where a shape
  // meant to be a thin sliver ended up covering most of the niche
  const texturePatches = [
    { dx: -0.35, dy: 0.15, r: 14 }, { dx: 0.15, dy: 0.05, r: 11 },
    { dx: 0.42, dy: 0.22, r: 9 }, { dx: -0.1, dy: 0.3, r: 10 }
  ];
  texturePatches.forEach(p => {
    const px = tx + archR * p.dx, py = archTop + (springY - archTop) * p.dy;
    const grad = ctx.createRadialGradient(px, py, 0, px, py, p.r);
    grad.addColorStop(0, "rgba(0,0,0,0.22)");
    grad.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(px, py, p.r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.strokeStyle = "rgba(0,0,0,0.18)";
  ctx.lineWidth = 1;
  [0.2, 0.45].forEach(f => {
    const strataY = archTop + (springY - archTop) * f;
    ctx.beginPath();
    ctx.moveTo(tx - archR * 0.7, strataY);
    ctx.quadraticCurveTo(tx, strataY + 3, tx + archR * 0.7, strataY - 2);
    ctx.stroke();
  });

  // receding into the wall -- a smooth falloff reads as real depth far
  // better than discrete rings did, which looked like flat decorative
  // circles rather than a curved surface losing light as it recedes
  const crevicedepthGrad = ctx.createRadialGradient(tx, springY - 6, 0, tx, springY - 6, archR);
  crevicedepthGrad.addColorStop(0, "rgba(0,0,0,0.55)");
  crevicedepthGrad.addColorStop(0.5, "rgba(0,0,0,0.28)");
  crevicedepthGrad.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = crevicedepthGrad;
  ctx.beginPath();
  ctx.moveTo(tx - archR, springY);
  ctx.lineTo(tx - archR, archBottom + 4);
  ctx.lineTo(tx + archR, archBottom + 4);
  ctx.lineTo(tx + archR, springY);
  ctx.arc(tx, springY, archR, 0, Math.PI, true);
  ctx.closePath();
  ctx.fill();

  // floor plane inside the niche -- flat top edge where it meets the
  // rear wall (not rounded, which read as a bulging muffin-top), sides
  // curving out to a wider front edge that extends slightly past the
  // table's own front so a sliver of floor shows in front of it too
  const floorTopY = archBottom - 38, floorBottomY = archBottom - 4;
  const floorTopHalfW = archR - 22, floorBottomHalfW = archR - 6;
  ctx.fillStyle = "#33210f";
  ctx.beginPath();
  ctx.moveTo(tx - floorTopHalfW, floorTopY);
  ctx.lineTo(tx + floorTopHalfW, floorTopY);
  ctx.quadraticCurveTo(tx + floorBottomHalfW, (floorTopY + floorBottomY) / 2, tx + floorBottomHalfW, floorBottomY);
  ctx.lineTo(tx - floorBottomHalfW, floorBottomY);
  ctx.quadraticCurveTo(tx - floorBottomHalfW, (floorTopY + floorBottomY) / 2, tx - floorTopHalfW, floorTopY);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(10,6,3,0.4)";
  ctx.beginPath();
  ctx.ellipse(tx, archBottom, archR - 8, 5, 0, 0, Math.PI * 2);
  ctx.fill();

  // low table -- genuine arc shape, curved to match the niche, with a
  // visible top surface so its short depth actually reads as a
  // crescent/moon shape rather than a thin flat line
  const tableTop = archBottom - 30;
  const tableHalfW = 52, tableDepth = 11;
  ctx.fillStyle = "#6a4a2c";
  ctx.beginPath();
  ctx.moveTo(tx - tableHalfW, tableTop + tableDepth);
  ctx.quadraticCurveTo(tx, tableTop + tableDepth - 4, tx + tableHalfW, tableTop + tableDepth);
  ctx.quadraticCurveTo(tx, tableTop + tableDepth * 1.9, tx - tableHalfW, tableTop + tableDepth);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#4a2e18";
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.fillStyle = "#5a3a22";
  ctx.beginPath();
  ctx.moveTo(tx - tableHalfW, tableTop + tableDepth);
  ctx.quadraticCurveTo(tx, tableTop + tableDepth * 1.9, tx + tableHalfW, tableTop + tableDepth);
  ctx.lineTo(tx + tableHalfW - 6, tableTop + tableDepth + 6);
  ctx.quadraticCurveTo(tx, tableTop + tableDepth * 1.9 + 6, tx - tableHalfW + 6, tableTop + tableDepth + 6);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "#3a2414";
  ctx.fillRect(tx - 30, tableTop + tableDepth + 4, 4, 8);
  ctx.fillRect(tx + 26, tableTop + tableDepth + 4, 4, 8);

  // low cushions in front of the table, for the player to visually
  // lounge on while getting tea -- three, each with a highlight and
  // outline for a plusher look rather than flat solid ellipses
  const teaCushions = [
    { dx: -24, dy: 2, w: 22, h: 8, rot: -0.15, color: "#8a5a6a" },
    { dx: 2, dy: -2, w: 13, h: 9, rot: 0.05, color: "#c9863a" },
    { dx: 21, dy: 4, w: 18, h: 5.5, rot: 0.2, color: "#6a8a5a" },
    { dx: -8, dy: 6, w: 15, h: 6.5, rot: -0.08, color: "#5a7a8a" }
  ];
  teaCushions.forEach(c => {
    const cx2 = tx + c.dx, cy2 = archBottom + 6 + c.dy;
    ctx.fillStyle = c.color;
    ctx.beginPath();
    ctx.ellipse(cx2, cy2, c.w, c.h, c.rot, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.18)";
    ctx.beginPath();
    ctx.ellipse(cx2 - c.w * 0.25, cy2 - c.h * 0.35, c.w * 0.35, c.h * 0.3, c.rot, 0, Math.PI * 2);
    ctx.fill();
  });

  // red ornate kettle, right-middle of the table -- shrunk down.
  // During pouring the owl actually lifts and tilts it rather than it
  // staying fixed on the table -- first half of the pour is the wing
  // reaching to grab the handle, second half is the lift-and-pour itself.
  const pourWingLift = pourRetractValue;
  const grabP = Math.min(1, pourWingLift / 0.28);
  const liftP = Math.max(0, (pourWingLift - 0.28) / 0.72);
  const kettleLiftX = -liftP * 6, kettleLiftY = -liftP * 24;
  const kettleTiltAngle = -liftP * 0.4;
  const kx = tx + 14, ky = tableTop + 2;
  // rotate around the handle's own position, not the kettle's center
  // -- keeps the handle anchored (as if genuinely being held) while
  // the body visibly swings and tips around it, which is what an
  // actual pour looks like, rather than the kettle appearing to spin
  // in place around its own middle
  const handlePivotX = kx + 14.75, handlePivotY = ky - 0.25;
  ctx.save();
  ctx.translate(kettleLiftX, kettleLiftY);
  ctx.translate(handlePivotX, handlePivotY);
  ctx.rotate(kettleTiltAngle);
  ctx.scale(0.85, 0.85);
  ctx.translate(-handlePivotX, -handlePivotY);
  ctx.fillStyle = "#a8342a";
  ctx.beginPath();
  ctx.ellipse(kx, ky, 11, 9, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "rgba(230,190,150,0.5)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.ellipse(kx, ky + 2, 8, 2.4, 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(kx - 7, ky - 4); ctx.lineTo(kx + 7, ky - 4);
  ctx.stroke();
  ctx.fillStyle = "#7a1f18";
  ctx.beginPath();
  ctx.arc(kx, ky - 10, 2.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#7a1f18";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(kx + 10, ky - 2);
  ctx.quadraticCurveTo(kx + 17, ky - 2, kx + 15, ky + 5);
  ctx.stroke();
  const spoutOwnTilt = -0.15 - liftP * 0.35;
  ctx.save();
  ctx.translate(kx - 9, ky - 1);
  ctx.rotate(spoutOwnTilt);
  ctx.strokeStyle = "#7a1f18"; ctx.lineWidth = 3.2; ctx.lineCap = "round";
  ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-11, 4); ctx.stroke();
  ctx.restore();
  ctx.restore();

  // compute the spout tip's actual world-space position, mirroring
  // the exact transform chain just applied above (translate ->
  // handle-pivot -> rotate -> scale -> spout's own local
  // translate+rotate), so the pour stream can read this directly
  // instead of recomputing an independent, drift-prone copy of the
  // same math
  {
    const localTipX = -11, localTipY = 4; // the spout's own endpoint, matching the line drawn above
    const cosS = Math.cos(spoutOwnTilt), sinS = Math.sin(spoutOwnTilt);
    const spoutLocalX = localTipX * cosS - localTipY * sinS;
    const spoutLocalY = localTipX * sinS + localTipY * cosS;
    const preScaleX = (kx - 9) + spoutLocalX, preScaleY = (ky - 1) + spoutLocalY;
    // now apply the outer kettle transform: translate(lift) -> handlePivot -> rotate(tilt) -> scale(0.85) -> -handlePivot
    const relX = preScaleX - handlePivotX, relY = preScaleY - handlePivotY;
    const scaledX = relX * 0.85, scaledY = relY * 0.85;
    const cosK = Math.cos(kettleTiltAngle), sinK = Math.sin(kettleTiltAngle);
    const rotX = scaledX * cosK - scaledY * sinK, rotY = scaledX * sinK + scaledY * cosK;
    spoutTipWorld.x = handlePivotX + rotX + kettleLiftX;
    spoutTipWorld.y = handlePivotY + rotY + kettleLiftY;
  }

  // baby owl behind the table -- small, its own idle shift and
  // independent sip on its own cup, unsynced from the player's.
  // Wings animate with the pour and the cup-giving beats.
  const oxBase = tx - 8, oy = tableTop - 22;
  const ox = oxBase + babyOwl.idleShift;
  const giveWingLift = teaAnim.phase === "sipping" ? Math.sin(Math.min(1, teaAnim.t / TEA_SEGMENT_MS.sipping) * Math.PI) : 0;
  const leanY = grabP * 20; // leans down toward the table while reaching, completes by the end of the grab phase rather than continuing to drift during the lift/pour
  const leanX = grabP * 15; // also shifts right toward the kettle -- same grabP cap, so the pivot stays fixed relative to the handle once grabbed instead of swinging the wing angle wildly
  const retreatActive = teaAnim.phase === "idle" ? babyOwl.retreatOffset : 0; // only during idle -- the pour sequence already has its own lean, combining both would be confusing
  ctx.save();
  ctx.translate(ox + leanX, oy + leanY - retreatActive * 10);
  ctx.scale(1.3 * (1 - retreatActive * 0.08), 1.3 * (1 - retreatActive * 0.08));

  // feet
  ctx.strokeStyle = "#c9863a";
  ctx.lineWidth = 1.2;
  [-4, 4].forEach(fx => {
    ctx.beginPath();
    ctx.moveTo(fx, 11); ctx.lineTo(fx - 2, 14);
    ctx.moveTo(fx, 11); ctx.lineTo(fx, 14.5);
    ctx.moveTo(fx, 11); ctx.lineTo(fx + 2, 14);
    ctx.stroke();
  });

  // body -- rounder, baby proportions
  ctx.fillStyle = "#6a5238";
  ctx.beginPath();
  ctx.ellipse(0, 1, 9, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  // wings -- right wing stretches and rotates to actually reach the
  // kettle's handle while pouring, as one continuous shape rather than
  // a fixed-size ellipse plus a separate connecting line
  // handle's actual transformed position -- the kettle now lifts and
  // tilts as a whole during the pour, so the handle moves with it;
  // handle now stays fixed under rotation (it's the kettle's own
  // pivot point), only moving with the lift offset -- much simpler
  // than recomputing rotation each frame like before
  const handleWorldX = handlePivotX + kettleLiftX, handleWorldY = handlePivotY + kettleLiftY;
  const handleLocalX = (handleWorldX - (ox + leanX)) / 1.3, handleLocalY = (handleWorldY - (oy + leanY)) / 1.3;
  const pivotX = 7, pivotY = 2;
  const toHandleDist = Math.hypot(handleLocalX - pivotX, handleLocalY - pivotY);
  const toHandleAngle = Math.atan2(handleLocalY - pivotY, handleLocalX - pivotX);
  const restAngle = -0.3 - Math.PI / 2; // wing's natural resting angle, in the same atan2 frame
  const wingAngleP = 1 - Math.pow(1 - grabP, 3); // cubic ease-out -- angle catches up to the handle's direction quickly, before the wing has extended far
  const wingAngle = restAngle + (toHandleAngle - restAngle) * wingAngleP;
  const wingLen = 8 + (toHandleDist - 8) * grabP;
  ctx.fillStyle = "#584428";
  ctx.save();
  ctx.translate(pivotX, pivotY);
  ctx.rotate(wingAngle + Math.PI / 2);
  ctx.beginPath();
  ctx.ellipse(0, -wingLen * 0.5, 4.5, wingLen * 0.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.save();
  ctx.translate(-7, 2);
  ctx.rotate(0.3 + giveWingLift * 0.9);
  ctx.beginPath();
  ctx.ellipse(0, 0, 4, 8, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  // wing feather lines, a couple scalloped strokes per wing
  ctx.strokeStyle = "#4a3820";
  ctx.lineWidth = 0.7;
  [[-7, 2, 0.3 + giveWingLift * 0.9, -1]].forEach(([wx, wy, rot, side]) => {
    ctx.save();
    ctx.translate(wx, wy);
    ctx.rotate(rot);
    for (let i = 0; i < 2; i++) {
      ctx.beginPath();
      ctx.arc(0, -2 + i * 4, 3, side > 0 ? Math.PI * 0.9 : -Math.PI * 0.1, side > 0 ? Math.PI * 1.6 : Math.PI * 0.6);
      ctx.stroke();
    }
    ctx.restore();
  });

  // body feather texture, a couple small scalloped rows
  ctx.strokeStyle = "#584428";
  ctx.lineWidth = 0.6;
  for (let row = 0; row < 2; row++) {
    ctx.beginPath();
    ctx.arc(0, 3 + row * 3.5, 2, 0, Math.PI);
    ctx.stroke();
  }

  // face disc, pale -- separated enough to not overlap, matching the
  // same ratio the adult owl already uses. Each side its own path.
  ctx.fillStyle = "#f0e0c0";
  ctx.beginPath();
  ctx.arc(-3.6, -3, 3, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(3.6, -3, 3, 0, Math.PI * 2);
  ctx.fill();

  // eyes, big for baby proportions -- each its own path
  ctx.fillStyle = "#2b2b2b";
  ctx.beginPath();
  ctx.arc(-3.6, -3, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(3.6, -3, 1.6, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.5)";
  ctx.beginPath();
  ctx.arc(-4.1, -3.5, 0.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(3.1, -3.5, 0.5, 0, Math.PI * 2);
  ctx.fill();

  // beak
  ctx.fillStyle = "#e0a020";
  ctx.beginPath();
  ctx.moveTo(-1.3, -0.5); ctx.lineTo(1.3, -0.5); ctx.lineTo(0, 2);
  ctx.closePath(); ctx.fill();
  ctx.restore();

  // during pouring, redraw the kettle's own body on top so the owl
  // reads as reaching from behind it, rather than always in front --
  // the wing itself still extends past the body's radius to reach the
  // handle, so it stays visible wrapping around
  if (teaAnim.phase === "pouring") {
    ctx.save();
    ctx.translate(kettleLiftX, kettleLiftY);
    ctx.translate(handlePivotX, handlePivotY);
    ctx.rotate(kettleTiltAngle);
    ctx.scale(0.85, 0.85);
    ctx.translate(-handlePivotX, -handlePivotY);
    ctx.fillStyle = "#a8342a";
    ctx.beginPath();
    ctx.ellipse(kx, ky, 11, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(230,190,150,0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.ellipse(kx, ky + 2, 8, 2.4, 0, 0, Math.PI * 2);
    ctx.stroke();
    // spout too -- the body re-draw above didn't include it, which is
    // exactly why a foot in front of the body could still end up
    // appearing on top of the spout specifically
    const spoutOwnTilt2Redraw = -0.15 - liftP * 0.35;
    ctx.save();
    ctx.translate(kx - 9, ky - 1);
    ctx.rotate(spoutOwnTilt2Redraw);
    ctx.strokeStyle = "#7a1f18"; ctx.lineWidth = 3.2; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(-11, 4); ctx.stroke();
    ctx.restore();
    ctx.restore();
  }

  // baby owl's own cup -- always held, not resting on anything, which
  // reinforces the tea moment even when the kettle isn't the focus.
  // Uses the owl's actual current position (lean + retreat offsets),
  // not raw ox/oy, since it previously sat entirely outside the
  // transform block applied to the owl's own body and so never
  // followed it during the lean or retreat motion at all.
  const ownCupBob = babyOwl.sipping > 0 ? Math.sin(Math.min(1, babyOwl.sipping) * Math.PI) * 5 : 0;
  const ownCupX = ox + leanX - 11 * (1 - retreatActive * 0.08);
  const ownCupY = oy + leanY - retreatActive * 10 + (6 - ownCupBob) * (1 - retreatActive * 0.08);
  ctx.fillStyle = "#e8ddc0";
  ctx.beginPath();
  ctx.ellipse(ownCupX, ownCupY, 4, 3, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#b8a888"; ctx.lineWidth = 0.6;
  ctx.stroke();

  drawTeaPlayerCup(tx, tableTop);

  if (teaDialogue.active) {
    drawFittedSpeechBubble(ctx, ox + 14, oy - 30, ["Would you like some tea?"]);
  }
}

function drawTeaPlayerCup(tx, tableTop) {
  if (teaAnim.phase === "idle") return;
  const cupX = tx - 2, cupY = tableTop + 5;
  const isFull = teaAnim.phase === "full" || teaAnim.phase === "sipping";
  let bx = cupX, by = cupY;
  if (teaAnim.phase === "sipping") {
    const p = Math.min(1, teaAnim.t / TEA_SEGMENT_MS.sipping);
    const bob = Math.sin(p * Math.PI);
    const towardPlayer = player.x < teaSpot.x ? -1 : 1; // bobs toward wherever the player actually is, not always to the right
    const reachDist = towardPlayer === 1 ? 50 : 34; // right confirmed perfect -- left increased a bit further to match better
    bx = cupX + bob * reachDist * towardPlayer; by = cupY - bob * 6;
  }
  // pouring stream, from the kettle spout's actual current tip
  // (computed from its real rotation) down into the cup, wavy and
  // animated with traveling droplets for a genuine pour feel -- only
  // once the kettle is actually tilted, not during the earlier reach
  if (teaAnim.phase === "pouring" && Math.max(0, (Math.min(1, teaAnim.t / TEA_SEGMENT_MS.pouring) - 0.28) / 0.72) > 0.5) {
    const p = Math.min(1, teaAnim.t / TEA_SEGMENT_MS.pouring);
    // spout tip read directly from where the actual spout was drawn
    // (spoutTipWorld, computed in the main kettle draw above) rather
    // than an independent recomputation -- the previous parallel copy
    // of this math drifted out of sync with the real spout, which is
    // what caused the stream to look disconnected and floating
    const spoutTipX = spoutTipWorld.x, spoutTipY = spoutTipWorld.y;
    const streamEndX = cupX, streamEndY = cupY - 6 + (1 - p) * 6;
    const wob = Math.sin(performance.now() * 0.02) * 1.2;
    const controlX = streamEndX + (spoutTipX - streamEndX) * 0.15 + wob;
    const controlY = spoutTipY + (streamEndY - spoutTipY) * 0.5;
    ctx.strokeStyle = "rgba(140,86,36,0.9)"; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(spoutTipX, spoutTipY);
    ctx.quadraticCurveTo(controlX, controlY, streamEndX, streamEndY);
    ctx.stroke();
    // a couple traveling droplets along the stream
    for (let d = 0; d < 2; d++) {
      const dt = (p * 3 + d * 0.5) % 1;
      const dx = spoutTipX + (streamEndX - spoutTipX) * dt + wob * Math.sin(dt * Math.PI);
      const dy = spoutTipY + (streamEndY - spoutTipY) * dt;
      ctx.fillStyle = "rgba(140,90,40,0.7)";
      ctx.beginPath();
      ctx.arc(dx, dy, 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.fillStyle = "#e8ddc0";
  ctx.beginPath();
  ctx.ellipse(bx, by, 6, 4.5, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = "#b8a888"; ctx.lineWidth = 0.8;
  ctx.stroke();
  if (isFull) {
    ctx.fillStyle = "#7a4a1e";
    ctx.beginPath();
    ctx.ellipse(bx, by - 1, 4, 2, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  if (teaAnim.phase === "full" || teaAnim.phase === "sipping") {
    const totalDuration = TEA_SEGMENT_MS.full + TEA_SEGMENT_MS.sipping;
    const elapsed = teaAnim.phase === "full" ? teaAnim.t : TEA_SEGMENT_MS.full + teaAnim.t;
    const p = Math.min(1, elapsed / totalDuration);
    for (let i = 0; i < 3; i++) {
      const wob = Math.sin(performance.now() * 0.004 + i * 2) * 1.5;
      ctx.strokeStyle = `rgba(220,220,210,${0.3 * (1 - p)})`;
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.moveTo(bx - 2 + i * 2, by - 5 - p * 6);
      ctx.quadraticCurveTo(bx - 2 + i * 2 + wob, by - 9 - p * 6, bx - 2 + i * 2, by - 13 - p * 6);
      ctx.stroke();
    }
  }
  if (teaAnim.phase === "empty" && teaAnim.t < 260) {
    const p = teaAnim.t / 260;
    for (let i = 0; i < TEA_SPARKLE_COUNT; i++) {
      const ang = (i / TEA_SPARKLE_COUNT) * Math.PI * 2;
      const r = 6 + p * 14;
      ctx.fillStyle = `rgba(245,208,96,${0.8 * (1 - p)})`;
      ctx.beginPath();
      ctx.arc(bx + Math.cos(ang) * r, by + Math.sin(ang) * r - p * 6, 1.4, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

const oakLamp = { x: 1069, collected: false };

function updateTeaNook(deltaTime) {
  if (!cushionPile.unlocked()) return;
  const dtMs = deltaTime * 1000;

  // ambient baby owl motion -- a small occasional stance shift and an
  // independent, unsynced sip on its own cup, so it reads as alive
  // rather than a static prop
  babyOwl.idleT += dtMs;
  if (babyOwl.idleT >= babyOwl.idleNextAt) {
    babyOwl.idleShiftT = 0;
    babyOwl.idleT = 0;
    babyOwl.idleNextAt = 3000 + Math.random() * 4000;
  }
  if (babyOwl.idleShiftT < 900) {
    babyOwl.idleShiftT += dtMs;
    const p = Math.min(1, babyOwl.idleShiftT / 900);
    babyOwl.idleShift = Math.sin(p * Math.PI) * 3;
  } else {
    babyOwl.idleShift = 0;
  }

  // occasional retreat further into the cove -- settles slightly
  // smaller and shifts back for a moment, a real depth cue since it's
  // visible movement into the space rather than another static trick
  babyOwl.retreatT += dtMs;
  if (babyOwl.retreatT >= babyOwl.retreatNextAt) {
    babyOwl.retreatShiftT = 0;
    babyOwl.retreatT = 0;
    babyOwl.retreatNextAt = 9000 + Math.random() * 8000;
  }
  if (babyOwl.retreatShiftT < 2400) {
    babyOwl.retreatShiftT += dtMs;
    const p = babyOwl.retreatShiftT / 2400;
    // eases back, holds briefly, eases forward again -- not a snap
    babyOwl.retreatOffset = Math.sin(p * Math.PI) * 1;
  } else {
    babyOwl.retreatOffset = 0;
  }

  babyOwl.sipT += dtMs;
  if (babyOwl.sipT >= babyOwl.sipNextAt) {
    babyOwl.sipping = 0.001;
    babyOwl.sipT = 0;
    babyOwl.sipNextAt = 5000 + Math.random() * 7000;
  }
  if (babyOwl.sipping > 0) {
    babyOwl.sipping += dtMs / 500;
    if (babyOwl.sipping >= 1) babyOwl.sipping = 0;
  }

  // interaction -- prompt, then accept to start the sequence. Walking
  // away instead of accepting just closes the prompt, no explicit
  // decline needed. Fully repeatable, no gate or one-time flag.
  const nearOwlBaseX = teaSpot.x - 8;
  const nearOwlDx = (player.x + player.width / 2) - nearOwlBaseX;
  const nearOwlDy = player.y - 0;
  const nearOwl = nearOwlDy <= 40 && nearOwlDy >= -25 &&
    (nearOwlDx >= -80 && nearOwlDx <= 102); // extends further right (102) than left (-80), broadening specifically past the table's actual right edge (52 from teaSpot.x) rather than symmetrically
  if (teaAnim.phase === "idle") {
    if (teaDialogue.active && nearOwl && keys.spaceJustPressed) {
      teaDialogue.active = false;
      teaAnim.phase = "pouring";
      teaAnim.t = 0;
    } else if (!teaDialogue.active && nearOwl && keys.spaceJustPressed) {
      teaDialogue.active = true;
    } else if (teaDialogue.active && !nearOwl) {
      teaDialogue.active = false;
    }
  } else {
    teaAnim.t += dtMs;
    // smooth retraction -- tracks live pour progress while actively
    // pouring, then eases toward 0 afterward instead of the instant
    // reset that caused the owl/kettle to visibly snap back to resting
    if (teaAnim.phase === "pouring") {
      pourRetractValue = Math.min(1, teaAnim.t / TEA_SEGMENT_MS.pouring);
    } else if (pourRetractValue > 0) {
      pourRetractValue = Math.max(0, pourRetractValue - dtMs / 700);
    }
    if (teaAnim.phase === "pouring" && teaAnim.t >= TEA_SEGMENT_MS.pouring) {
      teaAnim.phase = "full"; teaAnim.t = 0;
    } else if (teaAnim.phase === "full" && teaAnim.t >= TEA_SEGMENT_MS.full) {
      teaAnim.phase = "sipping"; teaAnim.t = 0;
    } else if (teaAnim.phase === "sipping" && teaAnim.t >= TEA_SEGMENT_MS.sipping) {
      teaAnim.phase = "empty"; teaAnim.t = 0;
    } else if (teaAnim.phase === "empty" && teaAnim.t >= TEA_SEGMENT_MS.empty) {
      teaAnim.phase = "idle"; teaAnim.t = 0;
    }
  }
}

function drawOakLampTable(camX) {
  if (!ratNPC.fed) return;
  const tx = oakLamp.x - camX;
  const tableTop = gy - 26;

  // gently ornate wooden table -- curved, scrolled legs rather than
  // plain straight lines
  ctx.strokeStyle = "#4a3018";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(tx - 14, tableTop + 4);
  ctx.quadraticCurveTo(tx - 18, tableTop + 16, tx - 12, gy - 2);
  ctx.moveTo(tx + 14, tableTop + 4);
  ctx.quadraticCurveTo(tx + 18, tableTop + 16, tx + 12, gy - 2);
  ctx.stroke();
  // small decorative scroll foot flourish at the base of each leg
  ctx.strokeStyle = "#5a4028";
  ctx.lineWidth = 1.5;
  [-12, 12].forEach(fx => {
    ctx.beginPath();
    ctx.arc(tx + fx, gy - 4, 3, 0, Math.PI * 1.4);
    ctx.stroke();
  });

  ctx.fillStyle = "#5a3a1c";
  ctx.fillRect(tx - 18, tableTop, 36, 6);
  ctx.strokeStyle = "#c9a860";
  ctx.lineWidth = 1;
  ctx.strokeRect(tx - 18, tableTop, 36, 6);
  // scalloped trim along the tabletop's front edge
  ctx.strokeStyle = "#c9a860";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i = -17; i <= 17; i += 4) {
    ctx.moveTo(tx + i, tableTop + 6);
    ctx.arc(tx + i + 2, tableTop + 6, 2, Math.PI, 0);
  }
  ctx.stroke();

  // small doily-like pattern beneath where the lamp sits
  if (!oakLamp.collected) {
    ctx.strokeStyle = "rgba(230, 220, 200, 0.5)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.ellipse(tx, tableTop - 1, 13, 3, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  if (!oakLamp.collected) {
    drawLampShape(ctx, tx, tableTop - 12, 11, 0, false);
  }
}
function updateOakLampTable() {
  if (!ratNPC.fed || oakLamp.collected) return;
  if (keys.spaceJustPressed && isPlayerNear(oakLamp.x, 38, 20, 20, 15)) {
    oakLamp.collected = true;
    inventory.lamp = 1; // set directly, not incremented -- there's only ever one lamp, so this can never double-count regardless of cause
    touchInventoryOrder("lamp");
    updateInventoryUI();
    startCollectAnimation({ x: oakLamp.x, y: 38, size: 8, rotation: 0 }, "lamp");
  }
}

const shortShelf = { x: 1987, width: 110, top: 170, bottom: gy - 2 };
const mediumShelf = { x: 2166, width: 85, top: 110, bottom: gy - 2 };
function drawMediumShelf(camX) {
  const sx = mediumShelf.x - camX;
  drawMixedBookShelf(sx, mediumShelf.width, mediumShelf.top, mediumShelf.bottom, 5);
}
// shared by every "plain" shelf (short shelf, medium shelf, and any
// future ones) -- frame with a visible border, plus rows of books with
// real spread and a mix of standing/laid-flat orientations
function drawMixedBookShelf(sx, w, top, bottom, rowCount, isShort) {
  ctx.fillStyle = "#8a5a28";
  ctx.fillRect(sx - w / 2, top, w, bottom - top);
  ctx.strokeStyle = "#c9863a";
  ctx.lineWidth = 2;
  ctx.strokeRect(sx - w / 2, top, w, bottom - top);
  ctx.fillStyle = "#5a3a1c";
  ctx.fillRect(sx - w / 2 + 4, top + 4, w - 8, bottom - top - 8);

  const rowHeight = (bottom - top - 8) / rowCount;
  const colors = ["#c9863a", "#8a5a2f", "#a83a4a", "#6a8a3a", "#4a6a8a"];
  for (let row = 0; row < rowCount; row++) {
    const rowY = top + 4 + row * rowHeight;
    ctx.fillStyle = "#5a3a1a";
    ctx.fillRect(sx - w / 2 + 4, rowY + rowHeight - 3, w - 8, 3);

    let bx = sx - w / 2 + 8;
    const rowSeed = row * 3;
    const layoutPatterns = [
      [{ standing: true }, { standing: true }, { standing: false }, { standing: true }, { standing: false }],
      [{ standing: false }, { standing: true }, { standing: false }, { standing: false }, { standing: true }],
      [{ standing: true }, { standing: false }, { standing: false }, { standing: true }, { standing: false }],
      [{ standing: true }, { standing: true }, { standing: true }, { standing: false }, { standing: false }],
      [{ standing: false }, { standing: false }, { standing: true }, { standing: false }, { standing: true }],
      [{ standing: false }, { standing: true }, { standing: false }, { standing: true }, { standing: false }],
      [{ standing: true }, { standing: false }, { standing: true }, { standing: false }, { standing: false }]
    ];
    const layout = layoutPatterns[row % layoutPatterns.length];
    layout.forEach((entry, b) => {
      if (bx >= sx + w / 2 - 8) return;
      if (isShort && row === 1 && b === 0) {
        // the Metaphors book -- title only shows/readable once the
        // cushion pile area is unlocked, matching its own cover design
        const mw = 16, mh = rowHeight - 8;
        const unlocked = oakLamp.collected;
        if (unlocked) {
          ctx.fillStyle = "#1a1a1a";
          ctx.fillRect(bx, rowY + rowHeight - 3 - mh, mw, mh);
          ctx.fillStyle = "#3f5766";
          ctx.fillRect(bx, rowY + rowHeight - 3 - mh, mw, mh / 3);
          ctx.strokeStyle = "#22303a";
          ctx.lineWidth = 1;
          ctx.strokeRect(bx, rowY + rowHeight - 3 - mh, mw, mh);
          ctx.save();
          ctx.translate(bx + mw / 2, rowY + rowHeight - 3 - mh + mh * 0.62);
          ctx.rotate(-Math.PI / 2);
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 8px Georgia, serif";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("META", 0, 0);
          ctx.restore();
        } else {
          // blank, unremarkable spine -- nothing readable yet
          ctx.fillStyle = "#4a3a2f";
          ctx.fillRect(bx, rowY + rowHeight - 3 - mh, mw, mh);
          ctx.strokeStyle = "#2e241c";
          ctx.lineWidth = 1;
          ctx.strokeRect(bx, rowY + rowHeight - 3 - mh, mw, mh);
        }
        bx += mw + 3;
        return;
      }
      const seed = rowSeed + b * 4 + row * 11 + (isShort ? 17 : 0); // more entropy so adjacent rows don't echo each other's widths, and so the two shelves don't mirror each other's colors at matching slots
      const gap = 3 + (seed % 8);
      if (entry.standing) {
        const bw = Math.min(5 + (seed % 13), sx + w / 2 - 8 - bx);
        if (bw < 3) return; // not enough room left
        const bh = rowHeight - 6 - (seed % 9);
        const lean = (((seed * 5) % 9) - 4) / 50;
        ctx.save();
        ctx.translate(bx + bw / 2, rowY + rowHeight - 3);
        ctx.rotate(lean);
        ctx.fillStyle = colors[seed % colors.length];
        ctx.fillRect(-bw / 2, -bh, bw, bh);
        ctx.restore();
        bx += bw + gap;
      } else {
        const rightBound = sx + w / 2 - 8;
        const bookW = Math.min(14 + (seed % 21), rightBound - bx);
        if (bookW < 6) return; // not enough room left for even a small book
        // horizontal books very rarely appear alone -- realistically
        // they're almost always stacked a few together. Only about 1
        // in 12 rolls a single lone book; otherwise 2-4 stacked.
        const stackRoll = seed % 12;
        const stackCount = (stackRoll < 1 && seed !== 60) ? 1 : 2 + (stackRoll % 3);
        let stackY = rowY + rowHeight - 3;
        for (let s = 0; s < stackCount; s++) {
          const bh2 = 3 + ((seed + s * 5) % 6);
          const bookW2 = Math.max(6, bookW - ((seed + s * 7) % 9)); // varied length per book in the stack, not all identical
          ctx.fillStyle = colors[(seed + s) % colors.length];
          ctx.fillRect(bx, stackY - bh2, bookW2, bh2);
          stackY -= bh2;
        }
        bx += bookW + gap;
      }
    });
  }
}

function drawShortShelf(camX) {
  const sx = shortShelf.x - camX;
  const w = shortShelf.width;
  const top = shortShelf.top, bottom = shortShelf.bottom;

  drawMixedBookShelf(sx, w, top, bottom, 3, true);

  // old broom, leaning against the shelf's right side
  const broomX = sx + w / 2 + 16, broomBottom = bottom;
  const broomTopX = broomX - 19, broomTopY = top + 30;
  ctx.strokeStyle = "#8a6a3a";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(broomX, broomBottom - 18);
  ctx.lineTo(broomTopX, broomTopY);
  ctx.stroke();
  // bristles -- a small fan of straw-colored strokes at the base
  ctx.strokeStyle = "#c9a860";
  ctx.lineWidth = 1;
  for (let i = -3; i <= 3; i++) {
    ctx.beginPath();
    ctx.moveTo(broomX, broomBottom - 18);
    ctx.lineTo(broomX + i * 2.2, broomBottom);
    ctx.stroke();
  }
  // binding around the bristles
  ctx.strokeStyle = "#5a3a1a";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(broomX - 6, broomBottom - 16);
  ctx.lineTo(broomX + 6, broomBottom - 16);
  ctx.stroke();
}

function drawOakScene(camX) {
  const sky = ctx.createLinearGradient(0, 0, 0, gy);
  sky.addColorStop(0, "#3a2818");
  sky.addColorStop(1, "#5a4028");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, canvas.width, gy);

  // interior wood-grain walls
  ctx.strokeStyle = "rgba(74,48,24,0.3)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    const gx = i * 150 - camX * 0.3;
    ctx.beginPath();
    ctx.moveTo(gx, 0);
    ctx.quadraticCurveTo(gx + 20, gy * 0.5, gx, gy);
    ctx.stroke();
  }

  drawWallArt(camX);

  // tall bookshelves along the walls, reaching nearly to the top of the
  // screen — two genuinely different styles, not the same shelf mirrored
  const shelfStyles = [
    { x: 90, frameColor: "#3a2818", innerColor: "#2a1c0e", boardColor: "#4a3018", rowCount: 6, colors: ["#7a2f2f", "#3a5a3a", "#4a3a7a", "#b8862f"], sideways: false },
    { x: 979, frameColor: "#241a12", innerColor: "#160f0a", boardColor: "#2e2015", rowCount: 5, colors: ["#7a4a2f", "#5a3a5a", "#2f5a6a", "#9a5a3a", "#3a6a4a"], sideways: true }
  ];
  shelfStyles.forEach(style => {
    const sx = style.x - camX;
    const shelfTop = 12, shelfBottom = gy - 2, shelfWidth = 70;

    // shelf frame — sides and back
    ctx.fillStyle = style.frameColor;
    ctx.fillRect(sx - shelfWidth / 2, shelfTop, shelfWidth, shelfBottom - shelfTop);
    ctx.fillStyle = style.innerColor;
    ctx.fillRect(sx - shelfWidth / 2 + 4, shelfTop + 4, shelfWidth - 8, shelfBottom - shelfTop - 8);

    // horizontal shelf boards
    const rowCount = style.rowCount;
    const rowHeight = (shelfBottom - shelfTop - 8) / rowCount;
    for (let row = 0; row < rowCount; row++) {
      const rowY = shelfTop + 4 + row * rowHeight;
      ctx.fillStyle = style.boardColor;
      ctx.fillRect(sx - shelfWidth / 2 + 4, rowY + rowHeight - 3, shelfWidth - 8, 3);

      const rowSeed = row * 3;
      const isLeftShelf = !style.sideways;

      if (isLeftShelf && row === rowCount - 1) {
        // left shelf: lowest row is mixed -- vertical books on the left,
        // a shorter horizontal stack on the right. First book is the
        // visible "apple" storybook, matching the manual's pattern.
        const standCount = 3;
        let vx = sx - shelfWidth / 2 + 7;
        for (let v = 0; v < standCount; v++) {
          if (v === 0) {
            const aw = 10, ah = rowHeight - 10;
            ctx.fillStyle = "#7a2f2f";
            ctx.fillRect(vx, rowY + rowHeight - 3 - ah, aw, ah);
            ctx.fillStyle = "#d4a520";
            ctx.beginPath();
            ctx.arc(vx + aw / 2, rowY + rowHeight - 3 - ah + 6, 2.5, 0, Math.PI * 2);
            ctx.fill();
            ctx.save();
            ctx.translate(vx + aw / 2, rowY + rowHeight - 3 - ah / 2 + 6);
            ctx.rotate(-Math.PI / 2);
            ctx.fillStyle = "#e8ddc8";
            ctx.font = "6px monospace";
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillText("apple", 0, 0);
            ctx.restore();
            vx += aw + 3;
            continue;
          }
          const bw = 5 + (v % 2) * 2;
          const bh = rowHeight - 8 - (v % 3);
          ctx.fillStyle = style.colors[(rowSeed + v) % style.colors.length];
          ctx.fillRect(vx, rowY + rowHeight - 3 - bh, bw, bh);
          vx += bw + 1.5;
        }
        let stackY = rowY + rowHeight - 4;
        for (let s = 0; s < 2; s++) {
          const sh = 3 + (s % 2); // shorter than the right shelf's stack
          ctx.save();
          ctx.translate(vx + 2, stackY - sh);
          ctx.rotate((s - 1) * 0.03);
          ctx.fillStyle = style.colors[(rowSeed + s + 2) % style.colors.length];
          ctx.fillRect(0, 0, sx + shelfWidth / 2 - 6 - (vx + 2), sh);
          ctx.restore();
          stackY -= sh + 1;
        }
        continue;
      }

      if (!isLeftShelf && row === 1) {
        // right shelf: a mixed row -- 2-3 vertical books next to a
        // horizontal stack, not a full row of just one or the other
        const standCount = 3;
        let vx = sx - shelfWidth / 2 + 7;
        for (let v = 0; v < standCount; v++) {
          const bw = 5 + (v % 2) * 2;
          const bh = rowHeight - 8 - (v % 3);
          ctx.fillStyle = style.colors[(rowSeed + v) % style.colors.length];
          ctx.fillRect(vx, rowY + rowHeight - 3 - bh, bw, bh);
          vx += bw + 1.5;
        }
        let stackY = rowY + rowHeight - 4;
        for (let s = 0; s < 3; s++) {
          const sh = 4 + (s % 2);
          ctx.save();
          ctx.translate(vx + 2, stackY - sh);
          ctx.rotate((s - 1) * 0.03);
          ctx.fillStyle = style.colors[(rowSeed + s + 2) % style.colors.length];
          ctx.fillRect(0, 0, sx + shelfWidth / 2 - 6 - (vx + 2), sh);
          ctx.restore();
          stackY -= sh + 1;
        }
        continue;
      }

      if (row % 3 === 1) {
        // remaining horizontal-stack rows elsewhere on the right shelf
        let stackY = rowY + rowHeight - 4;
        const stackCount = style.sideways ? 3 : 2;
        for (let s = 0; s < stackCount; s++) {
          const sh = 4 + (s % 2);
          const slideOffset = (s % 2) * 3; // slightly offset stacks, not perfectly aligned edges
          ctx.save();
          ctx.translate(sx - shelfWidth / 2 + 8 + slideOffset, stackY - sh);
          ctx.rotate((s - 1) * 0.03);
          ctx.fillStyle = style.colors[(rowSeed + s) % style.colors.length];
          ctx.fillRect(0, 0, shelfWidth - 20, sh);
          ctx.restore();
          stackY -= sh + 1;
        }
        continue;
      }

      // books standing on this shelf — varied width/height/color, slight
      // lean per book (not perfectly vertical), occasional gaps and a
      // leaning stack of 2 lying on top of the row for real messiness.
      // Shortened overall and given more height variety — real shelves
      // don't have every book reaching the full row height.
      let bx = sx - shelfWidth / 2 + 7;
      for (let b = 0; b < 5 && bx < sx + shelfWidth / 2 - 6; b++) {
        if (!isLeftShelf && row === 3 && b === 0) {
          // the manual — explicit blue book with a tooth icon and label,
          // second row from the bottom of the right shelf. Widened
          // further, larger font, bright cream text for real contrast,
          // and a proper tooth-shaped icon (crown + two root prongs).
          const mw = 18, mh = rowHeight - 10;
          ctx.fillStyle = "#2f5a6a";
          ctx.fillRect(bx, rowY + rowHeight - 3 - mh, mw, mh);
          const toothX = bx + mw / 2, toothCrownY = rowY + rowHeight - 3 - mh + 8;
          ctx.fillStyle = "#f5f0e0";
          ctx.beginPath();
          ctx.moveTo(toothX - 2.5, toothCrownY - 1.5);
          ctx.quadraticCurveTo(toothX - 3, toothCrownY - 4, toothX, toothCrownY - 4);
          ctx.quadraticCurveTo(toothX + 3, toothCrownY - 4, toothX + 2.5, toothCrownY - 1.5);
          ctx.quadraticCurveTo(toothX + 2.7, toothCrownY + 0.5, toothX + 1.2, toothCrownY + 3);
          ctx.quadraticCurveTo(toothX + 0.6, toothCrownY + 4, toothX, toothCrownY + 2.5);
          ctx.quadraticCurveTo(toothX - 0.6, toothCrownY + 4, toothX - 1.2, toothCrownY + 3);
          ctx.quadraticCurveTo(toothX - 2.7, toothCrownY + 0.5, toothX - 2.5, toothCrownY - 1.5);
          ctx.closePath();
          ctx.fill();
          ctx.save();
          ctx.translate(bx + mw / 2, rowY + rowHeight - 3 - mh + 28.8);
          ctx.rotate(-Math.PI / 2);
          ctx.fillStyle = "#f5f0e0";
          ctx.font = "7px monospace";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText("MANUAL", 0, 0);
          ctx.restore();
          bx += mw + 3;
          continue;
        }
        const bw = 5 + ((rowSeed + b * 2) % 4);
        const bh = rowHeight - 8 - ((rowSeed + b) % 5); // shorter, more varied -- doesn't fill all the way to the shelf above
        const lean = (((rowSeed + b * 5) % 7) - 3) / 60; // slight per-book tilt
        ctx.save();
        ctx.translate(bx + bw / 2, rowY + rowHeight - 3);
        ctx.rotate(lean);
        ctx.fillStyle = style.colors[(rowSeed + b) % style.colors.length];
        ctx.fillRect(-bw / 2, -bh, bw, bh);
        ctx.restore();
        bx += bw + 1.5 + ((rowSeed + b) % 3 === 0 ? 2.5 : 0); // occasional slightly wider gap

      }
    }
  });

  ctx.fillStyle = "#2e1c0a";
  ctx.fillRect(0, gy, canvas.width, canvas.height - gy);

  // arch entrance/exit door
  const dx = oakReturnDoor.x - camX;
  ctx.fillStyle = "#8a3428";
  ctx.beginPath();
  ctx.moveTo(dx - oakReturnDoor.width / 2, gy);
  ctx.lineTo(dx - oakReturnDoor.width / 2, gy - oakReturnDoor.height * 0.6);
  ctx.quadraticCurveTo(dx - oakReturnDoor.width / 2, gy - oakReturnDoor.height, dx, gy - oakReturnDoor.height);
  ctx.quadraticCurveTo(dx + oakReturnDoor.width / 2, gy - oakReturnDoor.height, dx + oakReturnDoor.width / 2, gy - oakReturnDoor.height * 0.6);
  ctx.lineTo(dx + oakReturnDoor.width / 2, gy);
  ctx.closePath();
  ctx.fill();
  // door slightly ajar
  ctx.fillStyle = "#3a2818";
  ctx.beginPath();
  ctx.ellipse(dx + 6, gy - oakReturnDoor.height * 0.45, 10, oakReturnDoor.height * 0.4, 0, 0, Math.PI * 2);
  ctx.fill();

  // real, messy piles of books — varied sizes, slight rotation and offset,
  // genuinely different colors, not perfectly stacked uniform rectangles.
  // Scattered at several spots around the room, each pile shaped
  // differently via its own seed rather than being identical copies.
  function drawBookPile(baseX, baseY, seed, count, fallKey) {
    // giant pile wobble -- shakes with increasing amplitude as the
    // collapse sequence builds toward the actual fall. Slow, heavy
    // oscillation with positional shake on both axes plus rotational
    // sway, deliberately overdone for the whimsy rather than a
    // realistic subtle tremor.
    let wobbleOffsetX = 0;
    let wobbleOffsetY = 0;
    let wobbleRot = 0;
    if (fallKey === GIANT_PILE_X && giantPileCollapse.phase === "wobble") {
      const wobbleP = Math.min(1, giantPileCollapse.t / COLLAPSE_WOBBLE_MS);
      const amplitude = 2 + wobbleP * 14; // builds from a small shiver to a real, heavy sway
      wobbleOffsetX = Math.sin(performance.now() * 0.008) * amplitude;
      wobbleOffsetY = Math.sin(performance.now() * 0.008 + Math.PI / 2) * amplitude * 0.35; // same frequency as X with a phase offset -- traces a smooth connected curve rather than an independent, disjointed bounce
      wobbleRot = Math.sin(performance.now() * 0.006 + 1) * 0.06 * wobbleP;
    }
    const fallState = fallKey !== undefined ? pileFallState[fallKey] : null;
    if (fallState && fallState.scattering) {
      // mid-scatter: books tumble outward, then ease back toward their
      // normal stacked positions as scatterT approaches PILE_SCATTER_MS
      const settleP = Math.min(1, fallState.scatterT / PILE_SCATTER_MS); // 0 = fully scattered, 1 = settled
      const eased = settleP * settleP * (3 - 2 * settleP); // smoothstep
      let dy = 0;
      for (let i = 0; i < count; i++) {
        const isLong = (seed + i * 7) % 5 === 0;
        const w = isLong ? 42 + ((seed + i * 3) % 10) : 20 + ((seed + i * 5) % 10);
        const h = 4 + ((seed + i * 3) % 3);
        const stackedRot = (((seed + i * 7) % 36) - 18) / 60;
        const stackedDx = (((seed + i * 4) % 6) - 3);
        // scattered target: flung outward and rotated much further
        const flingDir = i % 2 === 0 ? 1 : -1;
        const scatterDx = flingDir * (18 + (i * 9) % 22);
        const scatterDyOffset = -((i * 13) % 10);
        const scatterRot = flingDir * (0.8 + (i * 0.3) % 1.2);
        const dx = scatterDx + (stackedDx - scatterDx) * eased;
        const dyThis = dy + scatterDyOffset * (1 - eased);
        const rot = scatterRot + (stackedRot - scatterRot) * eased;
        ctx.save();
        ctx.translate(baseX - camX + dx + wobbleOffsetX, baseY - dyThis + wobbleOffsetY);
        ctx.rotate(rot);
        ctx.fillStyle = pileColors[(seed + i * 2) % pileColors.length];
        ctx.fillRect(-w / 2, -h, w, h);
        ctx.strokeStyle = "rgba(0,0,0,0.25)";
        ctx.lineWidth = 1;
        ctx.strokeRect(-w / 2, -h, w, h);
        ctx.restore();
        dy += h;
      }
      return;
    }
    // messy permanent look, once this pile has ever fallen from --
    // wider jitter than the normal neat stack, suggesting it never
    // got put back together quite right
    const messy = fallState && fallState.messy;
    let dy = 0;
    for (let i = 0; i < count; i++) {
      const isLong = (seed + i * 7) % 5 === 0; // some books noticeably longer, matching the shelf's horizontal-stack book width
      const w = isLong ? 42 + ((seed + i * 3) % 10) : 20 + ((seed + i * 5) % 10);
      const h = 4 + ((seed + i * 3) % 3);
      // how far up the stack this book sits -- the bottom stays
      // grounded while a wave of motion passes through toward the top,
      // rather than the whole pile appearing to jump as one rigid unit
      const heightP = Math.min(1, dy / 180);
      const verticalScale = heightP; // bottom book: no vertical lift at all
      const horizontalScale = 0.3 + heightP * 0.7; // bottom book still sways a little side to side, just less than the top
      const rot = (((seed + i * 7) % 36) - 18) / (messy ? 32 : 60) + wobbleRot * horizontalScale;
      const dx = (((seed + i * 4) % 6) - 3) * (messy ? 1.8 : 1);
      ctx.save();
      ctx.translate(baseX - camX + dx + wobbleOffsetX * horizontalScale, baseY - dy + wobbleOffsetY * verticalScale);
      ctx.rotate(rot);
      ctx.fillStyle = pileColors[(seed + i * 2) % pileColors.length];
      ctx.fillRect(-w / 2, -h, w, h);
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
      ctx.lineWidth = 1;
      ctx.strokeRect(-w / 2, -h, w, h);
      ctx.restore();
      dy += h;
    }
  }
  // drawn from the shared bookPiles array (also used for collision below)
  bookPiles.forEach(pile => drawBookPile(pile.x, gy, pile.seed, pile.count, pile.x));
  drawPaperAirplane(camX);
  if (giantPileCollapse.phase === "falling") {
    drawFallingBooks(camX);
  } else {
    drawScatteredBooksField(camX);
  }
  bookSpreads.forEach(spread => drawBookSpread(spread, camX));

  // book-nook — a cozy sitting alcove cut into the tree wall, extending
  // out slightly, with a small window. Moved way right of the second
  // bookshelf, with a real seat you can jump onto after grabbing a book.
  const nookX = 1573 - camX;
  const nookWidth = 130, nookTop = gy - 150, nookBottom = gy - 2;

  // the alcove itself — a genuine arch shape: straight sides up to the
  // spring line, then a true semi-circular arch top, recessed into the
  // wall (darker), with a lighter interior showing it's a real cut-in
  // space, not just a flat panel
  ctx.fillStyle = "#241608";
  const archOuterRadius = (nookWidth + 12) / 2;
  const archTop = nookTop - 10;
  const archSpringY = archTop + archOuterRadius;
  ctx.beginPath();
  ctx.moveTo(nookX - archOuterRadius, archSpringY);
  ctx.lineTo(nookX - archOuterRadius, nookBottom + 6);
  ctx.lineTo(nookX + archOuterRadius, nookBottom + 6);
  ctx.lineTo(nookX + archOuterRadius, archSpringY);
  ctx.arc(nookX, archSpringY, archOuterRadius, 0, Math.PI, true);
  ctx.closePath();
  ctx.fill();

  // subtle wood-grain texture, matching the walls' rustic character --
  // clipped to the arch shape so it stays contained within the recess
  ctx.save();
  ctx.beginPath();
  ctx.moveTo(nookX - archOuterRadius, archSpringY);
  ctx.lineTo(nookX - archOuterRadius, nookBottom + 6);
  ctx.lineTo(nookX + archOuterRadius, nookBottom + 6);
  ctx.lineTo(nookX + archOuterRadius, archSpringY);
  ctx.arc(nookX, archSpringY, archOuterRadius, 0, Math.PI, true);
  ctx.closePath();
  ctx.clip();
  ctx.strokeStyle = "rgba(90,64,40,0.25)";
  ctx.lineWidth = 1;
  for (let i = 0; i < 4; i++) {
    const gx = nookX - archOuterRadius + 10 + i * (archOuterRadius * 2 - 20) / 3;
    ctx.beginPath();
    ctx.moveTo(gx, archTop - 5);
    ctx.quadraticCurveTo(gx + 6, (archTop + nookBottom) / 2, gx, nookBottom + 6);
    ctx.stroke();
  }
  ctx.restore();

  // the extending-out part — a slightly protruding floor/ledge, like a
  // bay window bulging out from the trunk's inner wall
  ctx.fillStyle = "#3a2818";
  ctx.beginPath();
  ctx.moveTo(nookX - nookWidth / 2, nookBottom - 30);
  ctx.quadraticCurveTo(nookX - nookWidth / 2 - 18, nookBottom - 5, nookX - nookWidth / 2 - 4, nookBottom + 10);
  ctx.lineTo(nookX + nookWidth / 2 + 4, nookBottom + 10);
  ctx.quadraticCurveTo(nookX + nookWidth / 2 + 18, nookBottom - 5, nookX + nookWidth / 2, nookBottom - 30);
  ctx.closePath();
  ctx.fill();

  // interior back wall of the nook — warm, lighter than the recess
  // shadow, now arch-shaped to match the outer recess instead of a
  // clashing rectangle
  ctx.fillStyle = "#4a3420";
  const backArchRadius = archOuterRadius - 6;
  const backArchSpringY = archTop + 6 + backArchRadius;
  ctx.beginPath();
  ctx.moveTo(nookX - backArchRadius, backArchSpringY);
  ctx.lineTo(nookX - backArchRadius, nookBottom - 20);
  ctx.lineTo(nookX + backArchRadius, nookBottom - 20);
  ctx.lineTo(nookX + backArchRadius, backArchSpringY);
  ctx.arc(nookX, backArchSpringY, backArchRadius, 0, Math.PI, true);
  ctx.closePath();
  ctx.fill();

  // small window — arched, with a pale sky-blue showing through, sitting
  // near the top of the nook
  const winX = nookX, winY = nookTop + 34, winR = 25;
  ctx.fillStyle = "#bfe0ec";
  ctx.beginPath();
  ctx.arc(winX, winY, winR, Math.PI, 0);
  ctx.lineTo(winX + winR, winY + winR * 0.7);
  ctx.lineTo(winX - winR, winY + winR * 0.7);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#2a1c0e";
  ctx.lineWidth = 3;
  ctx.stroke();

  // a small branch with leaves, glimpsed through the window as if from
  // outside — near the bottom right of the pane, clipped so it never
  // spills past the window's own arched shape
  ctx.save();
  ctx.beginPath();
  ctx.arc(winX, winY, winR, Math.PI, 0);
  ctx.lineTo(winX + winR, winY + winR * 0.7);
  ctx.lineTo(winX - winR, winY + winR * 0.7);
  ctx.closePath();
  ctx.clip();
  const bx = winX + winR * 0.55, by = winY + winR * 0.5;
  ctx.strokeStyle = "#5a4028";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(bx + 14, by + 12);
  ctx.quadraticCurveTo(bx + 4, by, bx - 8, by - 6);
  ctx.stroke();
  const leafColors = ["#c96a1e", "#a83a2a", "#d4a520"];
  [[bx - 6, by - 8, 0.3, 0], [bx - 1, by - 2, -0.2, 1], [bx + 5, by - 1, 0.5, 2], [bx - 10, by - 4, -0.4, 1]].forEach(([lx, ly, rot, colorIdx]) => {
    ctx.fillStyle = leafColors[colorIdx];
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(rot);
    ctx.beginPath();
    ctx.ellipse(0, 0, 5, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
  ctx.restore();

  // window cross-bars
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(winX, winY - winR);
  ctx.lineTo(winX, winY + winR * 0.7);
  ctx.moveTo(winX - winR, winY);
  ctx.lineTo(winX + winR, winY);
  ctx.stroke();

  // the seat itself — a real bench/ledge, jumpable, fully opaque and
  // clearly distinct in color from the wall behind it. Widened to
  // actually match the protruding ledge shape beneath it -- it was
  // narrower than the ledge, leaving the ledge's darker color visibly
  // showing past the seat's edges on both sides.
  const seatHeight = nookBottom - nookSeat.heightAboveGround;
  const seatLeft = nookX - nookWidth / 2 - 2, seatWidth = nookWidth + 4;
  ctx.fillStyle = "#6a2e2e";
  ctx.fillRect(seatLeft, seatHeight, seatWidth, nookBottom - seatHeight);
  ctx.fillStyle = "#8a4040";
  ctx.fillRect(seatLeft, seatHeight, seatWidth, 5);
  ctx.strokeStyle = "#3a1818";
  ctx.lineWidth = 1;
  ctx.strokeRect(seatLeft, seatHeight, seatWidth, nookBottom - seatHeight);

  // cushions — genuine variety: ovals big and small, squares, rectangles,
  // different colors, with real dimensional shading (darker underside,
  // lighter highlight) and subtle wrinkle lines so they read as soft
  // fabric, not flat shapes. Leftmost one leans against the corner wall.
  const cushionSet = [
    { shape: "oval", dx: -48, dy: -12, w: 24, h: 32, color: "#c9793a", rot: -0.85, wrinkles: 2 },
    { shape: "square", dx: 2, dy: -3, w: 24, h: 18, color: "#5a7a8a", rot: 0, wrinkles: 1 },
    { shape: "oval", dx: 38, dy: 2, w: 26, h: 13, color: "#8a4a5a", rot: 0.08, wrinkles: 1 },
    { shape: "rect", dx: -14, dy: 4, w: 22, h: 11, color: "#6a8a4a", rot: -0.05, wrinkles: 2 }
  ];
  function shadeColor(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = Math.max(0, Math.min(255, (n >> 16) + amt));
    const g = Math.max(0, Math.min(255, ((n >> 8) & 0xff) + amt));
    const b = Math.max(0, Math.min(255, (n & 0xff) + amt));
    return `rgb(${r},${g},${b})`;
  }
  cushionSet.forEach(c => {
    const ccx = nookX + c.dx, ccy = seatHeight - 4 + c.dy;
    ctx.save();
    ctx.translate(ccx, ccy);
    ctx.rotate(c.rot);

    const drawShape = (fillStyle) => {
      ctx.fillStyle = fillStyle;
      if (c.shape === "oval") {
        ctx.beginPath();
        ctx.ellipse(0, 0, c.w / 2, c.h / 2, 0, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const cornerR = 4;
        ctx.beginPath();
        ctx.moveTo(-c.w / 2 + cornerR, -c.h / 2);
        ctx.lineTo(c.w / 2 - cornerR, -c.h / 2);
        ctx.quadraticCurveTo(c.w / 2, -c.h / 2, c.w / 2, -c.h / 2 + cornerR);
        ctx.lineTo(c.w / 2, c.h / 2 - cornerR);
        ctx.quadraticCurveTo(c.w / 2, c.h / 2, c.w / 2 - cornerR, c.h / 2);
        ctx.lineTo(-c.w / 2 + cornerR, c.h / 2);
        ctx.quadraticCurveTo(-c.w / 2, c.h / 2, -c.w / 2, c.h / 2 - cornerR);
        ctx.lineTo(-c.w / 2, -c.h / 2 + cornerR);
        ctx.quadraticCurveTo(-c.w / 2, -c.h / 2, -c.w / 2 + cornerR, -c.h / 2);
        ctx.closePath();
        ctx.fill();
      }
    };

    // base fill, then a darker underside shadow, then a lighter highlight
    // near the top — gives real dimensional roundness, not a flat shape
    drawShape(c.color);
    ctx.save();
    ctx.beginPath();
    if (c.shape === "oval") ctx.ellipse(0, 0, c.w / 2, c.h / 2, 0, 0, Math.PI * 2);
    else ctx.rect(-c.w / 2, -c.h / 2, c.w, c.h);
    ctx.clip();
    ctx.fillStyle = shadeColor(c.color, -35);
    ctx.beginPath();
    ctx.ellipse(0, c.h * 0.28, c.w * 0.55, c.h * 0.35, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = shadeColor(c.color, 30);
    ctx.beginPath();
    ctx.ellipse(-c.w * 0.15, -c.h * 0.28, c.w * 0.3, c.h * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // subtle wrinkle lines — a couple of short curved strokes
    ctx.strokeStyle = shadeColor(c.color, -50);
    ctx.lineWidth = 0.8;
    for (let w = 0; w < c.wrinkles; w++) {
      const wy = -c.h * 0.1 + w * c.h * 0.3;
      ctx.beginPath();
      ctx.moveTo(-c.w * 0.25, wy);
      ctx.quadraticCurveTo(0, wy + 2, c.w * 0.25, wy - 1);
      ctx.stroke();
    }

    ctx.restore();
  });

  if (trapDoor.active) {
    drawTrapDoorSequence(camX);
  } else if (trapDoor.opened) {
    const rx = nookRug.x - camX, ry = gy + 14;
    const doorW = nookRug.width * 0.9;
    const hingeX = rx + doorW / 2;
    ctx.fillStyle = "#0a0604";
    ctx.fillRect(rx - doorW / 2, ry - 7, doorW, 10);
    ctx.save();
    ctx.translate(hingeX + doorW / 2, ry);
    ctx.fillStyle = "#6a4028";
    ctx.fillRect(-doorW / 2, -2.5, doorW, 5);
    ctx.strokeStyle = "#3a2010";
    ctx.lineWidth = 1;
    ctx.strokeRect(-doorW / 2, -2.5, doorW, 5);
    ctx.restore();
  } else {
    drawNookRug(camX);
  }
  drawShortShelf(camX);
  drawMediumShelf(camX);
  drawOakLampTable(camX);
  drawPothos(camX);
  drawLavenderPlant(camX);
  drawSnakePlant(camX);
  drawEntrywayFern(camX);
  drawStringOfPearls(camX);
  drawMonstera(camX);
  drawStringOfHearts(camX);
  drawCushionPile(camX);
  drawFairyLights(camX);
  drawTeaNook(camX);
  drawOwl(camX);
}

function drawOwl(camX) {
  const ox = owl.x - camX;
  const oy = gy - 40 + owl.bob;

  // feet — small, perched-looking, drawn first so the body sits over them
  ctx.strokeStyle = "#c98a30";
  ctx.lineWidth = 2;
  [-6, 6].forEach(fx => {
    ctx.beginPath();
    ctx.moveTo(ox + fx, oy + 18);
    ctx.lineTo(ox + fx - 3, oy + 23);
    ctx.moveTo(ox + fx, oy + 18);
    ctx.lineTo(ox + fx, oy + 24);
    ctx.moveTo(ox + fx, oy + 18);
    ctx.lineTo(ox + fx + 3, oy + 23);
    ctx.stroke();
  });

  // body
  ctx.fillStyle = "#8a6a45";
  ctx.beginPath();
  ctx.ellipse(ox, oy, 16, 20, 0, 0, Math.PI * 2);
  ctx.fill();

  // wings — folded at the sides, suggesting real feather layering
  ctx.fillStyle = "#6e5236";
  [-1, 1].forEach(side => {
    ctx.beginPath();
    ctx.ellipse(ox + side * 13, oy + 4, 7, 15, side * 0.15, 0, Math.PI * 2);
    ctx.fill();
  });
  // wing feather lines — a few scalloped strokes per wing
  ctx.strokeStyle = "#5a4028";
  ctx.lineWidth = 1;
  [-1, 1].forEach(side => {
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(ox + side * 13, oy - 2 + i * 6, 5, side > 0 ? Math.PI * 0.9 : -Math.PI * 0.1, side > 0 ? Math.PI * 1.6 : Math.PI * 0.6);
      ctx.stroke();
    }
  });

  // body feather texture — small scalloped rows across the chest
  ctx.strokeStyle = "#6e5236";
  ctx.lineWidth = 1;
  for (let row = 0; row < 3; row++) {
    for (let col = -1; col <= 1; col++) {
      ctx.beginPath();
      ctx.arc(ox + col * 6, oy + 4 + row * 5, 3, 0, Math.PI);
      ctx.stroke();
    }
  }

  // face disc — pale, behind the eyes
  ctx.fillStyle = "#f0e0c0";
  ctx.beginPath();
  ctx.arc(ox - 6, oy - 5, 5, 0, Math.PI * 2);
  ctx.arc(ox + 6, oy - 5, 5, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#2b2b2b";
  ctx.beginPath();
  ctx.arc(ox - 6, oy - 5, 2, 0, Math.PI * 2);
  ctx.arc(ox + 6, oy - 5, 2, 0, Math.PI * 2);
  ctx.fill();

  // glasses — round frames around each eye, plus a bridge
  ctx.strokeStyle = "#2b2b2b";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(ox - 6, oy - 5, 6.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(ox + 6, oy - 5, 6.5, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(ox - 0.5, oy - 5);
  ctx.lineTo(ox + 0.5, oy - 5);
  ctx.stroke();

  // beak
  ctx.fillStyle = "#e0a020";
  ctx.beginPath();
  ctx.moveTo(ox - 2, oy - 1);
  ctx.lineTo(ox + 2, oy - 1);
  ctx.lineTo(ox, oy + 3);
  ctx.closePath();
  ctx.fill();

  if (owlTalked && isPlayerNear(owl.x, 0, 55, 35, 25)) {
    drawFittedSpeechBubble(ctx, ox + 16, oy - 40, [
      "We boast of readings in our little oak den...",
      "grab a book to take to the nook, then!"
    ]);
  }
}

function updateOakScene(deltaTime) {
  owl.bob = Math.sin(performance.now() * 0.0025) * 2;
  updateOakLampTable();
  updateTeaNook(deltaTime);

  if (isPlayerNear(owl.x, 0, 55, 35, 25) && keys.spaceJustPressed) {
    owlTalked = true;
  }

  if (isPlayerNear(oakReturnDoor.x, 0, 26, 15, 15) && keys.spaceJustPressed) {
    startSeasonTransition("autumn");
    carriedBook = null; // same as the trap door -- books can't leave oak
    if (heldItem === "lamp") heldItem = null; // the lamp stays local to oak/ratroom too, put back same as a book
  }

  updateTrapDoor(deltaTime);
  if (!trapDoor.active && keys.spaceJustPressed &&
      isPlayerNear(nookRug.x, 0, nookRug.width / 2, 20, 10)) {
    trapDoor.active = true;
    trapDoor.t = 0;
    carriedBook = null; // books can't leave oak -- nowhere to actually read one elsewhere, so it's quietly set back down
  }

  // book pile collision — same landing pattern as regular platforms.
  // CONFIRMED BUG FIX: 14-unit tolerance was narrower than the ~15-17
  // units/frame fall speed reached dropping from something tall above
  // (like the medium shelf), so landing was a coin flip depending on
  // exact frame timing -- widened with real margin.
  bookPiles.forEach(pile => {
    if (pile.collapsed) return; // mid-collapse -- no collision, player falls straight through
    const pileTop = pile.heightAboveGround;
    const playerBottom = player.y;
    if (
      player.x + player.width > pile.x - BOOK_PILE_WIDTH / 2 &&
      player.x < pile.x + BOOK_PILE_WIDTH / 2 &&
      playerBottom <= pileTop &&
      playerBottom >= pileTop - 30 &&
      player.vy <= 0
    ) {
      player.y = pileTop;
      player.vy = 0;
      player.jumping = false;
      player.usedDoubleJump = false;
      if (pile.isJumpRun) {
        player.lastPileX = pile.x; // remembers which pile to blame if they later fall to ground
      } else {
        player.lastPileX = null; // landing on a decorative pile clears any stale jump-run reference
      }
    }
  });
  updatePaperAirplane();
  updateBookPileFalls(deltaTime);
  updateGiantPileCollapse(deltaTime);

  // book spread collision — wide and low, same landing pattern
  bookSpreads.forEach(spread => {
    const spreadTop = BOOK_SPREAD_HEIGHT;
    const playerBottom = player.y;
    if (
      player.x + player.width > spread.x - spread.width / 2 &&
      player.x < spread.x + spread.width / 2 &&
      playerBottom <= spreadTop &&
      playerBottom >= spreadTop - 14 &&
      player.vy <= 0
    ) {
      player.y = spreadTop;
      player.vy = 0;
      player.jumping = false;
      player.usedDoubleJump = false;
    }
  });

  // sitting area collision — jumpable, same pattern for every unlocked spot
  sittingAreas.forEach(spot => {
    if (!spot.unlocked()) return;
    const seatTop = spot.heightAboveGround;
    const playerBottom = player.y;
    if (
      player.x + player.width > spot.x - spot.width / 2 &&
      player.x < spot.x + spot.width / 2 &&
      playerBottom <= seatTop &&
      playerBottom >= seatTop - 14 &&
      player.vy <= 0
    ) {
      player.y = seatTop;
      player.vy = 0;
      player.jumping = false;
      player.usedDoubleJump = false;
    }
  });

  // top-of-shelf collision — both the short and medium shelves are
  // jumpable platforms, same landing pattern as everything else
  [shortShelf, mediumShelf].forEach(shelf => {
    const shelfTop = gy - shelf.top;
    const playerBottom = player.y;
    if (
      player.x + player.width > shelf.x - shelf.width / 2 &&
      player.x < shelf.x + shelf.width / 2 &&
      playerBottom <= shelfTop &&
      playerBottom >= shelfTop - 14 &&
      player.vy <= 0
    ) {
      player.y = shelfTop;
      player.vy = 0;
      player.jumping = false;
      player.usedDoubleJump = false;
    }
  });

  // top-of-lamp-table collision — jumpable, same pattern as the shelves
  {
    const tableTopHeight = 26;
    const playerBottom = player.y;
    if (
      player.x + player.width > oakLamp.x - 18 &&
      player.x < oakLamp.x + 18 &&
      playerBottom <= tableTopHeight &&
      playerBottom >= tableTopHeight - 14 &&
      player.vy <= 0
    ) {
      player.y = tableTopHeight;
      player.vy = 0;
      player.jumping = false;
      player.usedDoubleJump = false;
    }
  }

  // pick up the apple storybook to carry -- no longer opens directly at
  // the shelf, must be carried to a sitting area to actually read it
  if (!bookReader.active && !bookReader.closing && !bookReader.opening &&
      keys.spaceJustPressed && isPlayerNear(90, 27, 30, 30, 30)) {
    carriedBook = "apple";
  }

  // pick up the Metaphors book -- only pickup-able once the cushion
  // pile area is unlocked, matching its shelf visibility
  if (!bookReader.active && !bookReader.closing && !bookReader.opening &&
      oakLamp.collected &&
      keys.spaceJustPressed && isPlayerNear(1948, 65, 25, 25, 25)) {
    carriedBook = "metaphors";
  }

  // pick up the manual to carry, same rule
  if (!bookReader.active && !bookReader.closing && !bookReader.opening &&
      keys.spaceJustPressed && isPlayerNear(979, 20, 32, 32, 32)) {
    carriedBook = "manual";
  }

  // reading only happens at a sitting area, and only once actually
  // seated there (not just nearby) -- carrying a book somewhere and
  // sitting down with it is the whole point of the ritual
  if (carriedBook && !bookReader.active && !bookReader.closing && !bookReader.opening && keys.spaceJustPressed) {
    sittingAreas.forEach(spot => {
      if (!spot.unlocked()) return;
      if (isPlayerNear(spot.x, spot.heightAboveGround, spot.width / 2, 10, 6)) {
        bookReader.book = carriedBook;
        bookReader.opening = true;
        bookReader.openT = 0;
        carriedBook = null;
      }
    });
  }
}

/* ======================================================
   BOOK READER — a full-overlay reading mode, stepping
   outside the normal scene entirely. Grab a book, read it
   with arrow keys turning pages, space exits any time.
   Pages transition via a sparkle-particle dissolve matching
   the existing cloud/elephant-appear visual language, not a
   flat wipe or pixel-shatter effect.
   ====================================================== */
const bookReader = {
  active: false,
  book: null,           // "apple" | "manual"
  currentPage: 0,
  opening: false,
  openT: 0,
  closing: false,
  closeT: 0,
  transitioning: false,
  transitionT: 0,
  pageTime: 0,           // how long the current page has been shown -- used for a brief grace period on the end page
  sparkles: []
};

const BOOK_READER_OUT_MS = 1500;
const BOOK_READER_PAUSE_MS = 500;
const BOOK_READER_IN_MS = 1500;
const BOOK_READER_TRANSITION_TOTAL = BOOK_READER_OUT_MS + BOOK_READER_PAUSE_MS + BOOK_READER_IN_MS;
const BOOK_OPEN_CLOSE_MS = 2800; // matches the previewed flourish timing
const BOOK_END_PAGE_GRACE_MS = 550; // brief pause on "the end" before input can close the book

const appleBookPages = [
  {
    num: 1,
    lines: ["There once was an apple tree who grew tired of choosing.", "", "Every apple she'd ever dropped had rolled toward exactly one", "place, and lived exactly one small life, and that had always", "seemed like such a waste of a good apple.", "", "So one autumn evening, she decided to try something different."],
    draw: (frX, frY) => {
      ctx.strokeStyle = "#5a4028"; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(frX, frY + 38); ctx.lineTo(frX, frY - 6); ctx.stroke();
      ctx.fillStyle = "#5a8a3a";
      [[-20, -30], [18, -26], [-10, -38], [6, -14], [-30, -15], [26, -10]].forEach(([dx, dy]) => {
        ctx.save(); ctx.translate(frX + dx, frY + dy); ctx.rotate(dx * 0.02);
        ctx.beginPath(); ctx.ellipse(0, 0, 7, 4, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      });
      ctx.fillStyle = "#c9384a"; ctx.beginPath(); ctx.arc(frX - 4, frY + 12, 7, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = "#d4a520"; ctx.beginPath(); ctx.arc(frX + 4, frY + 12, 7, 0, Math.PI * 2); ctx.fill();
    }
  },
  {
    num: 2,
    lines: ["She let go of her very last apple of the season, a plump,", "unremarkable thing, red on one cheek and gold on the other,", "and let it fall.", "", "It struck a stone at just the right angle, and broke clean", "into three.", "", "The tree hadn't planned that part. But she found she rather", "liked it."],
    draw: (frX, frY) => {
      ctx.strokeStyle = "#8a8074"; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.ellipse(frX, frY + 30, 16, 6, 0, 0, Math.PI * 2); ctx.stroke();
      ctx.save(); ctx.translate(frX - 14, frY - 4); ctx.rotate(-0.3);
      ctx.fillStyle = "#c9384a"; ctx.beginPath(); ctx.moveTo(-10, -6); ctx.quadraticCurveTo(-14, 4, -6, 10); ctx.quadraticCurveTo(0, 14, 4, 6); ctx.lineTo(-2, -8); ctx.closePath(); ctx.fill(); ctx.restore();
      ctx.save(); ctx.translate(frX + 12, frY - 2); ctx.rotate(0.4);
      ctx.fillStyle = "#d4a520"; ctx.beginPath(); ctx.moveTo(8, -6); ctx.quadraticCurveTo(14, 2, 6, 10); ctx.quadraticCurveTo(0, 12, -4, 4); ctx.lineTo(2, -8); ctx.closePath(); ctx.fill(); ctx.restore();
      ctx.save(); ctx.translate(frX, frY + 12);
      ctx.fillStyle = "#e8a840"; ctx.beginPath(); ctx.moveTo(-6, 4); ctx.quadraticCurveTo(-4, -4, 2, -2); ctx.quadraticCurveTo(6, 2, 2, 6); ctx.closePath(); ctx.fill(); ctx.restore();
      ctx.fillStyle = "#e8ddc8";
      [[frX - 1, frY - 9], [frX + 13, frY - 11], [frX - 2, frY + 6]].forEach(([sx, sy]) => { ctx.beginPath(); ctx.arc(sx, sy, 1.2, 0, Math.PI * 2); ctx.fill(); });
    }
  },
  {
    num: 3,
    lines: ["One piece rolled toward the orchard's edge, where the fences", "had never quite kept anything in, or out.", "", "One piece caught in a gust and went tumbling somewhere higher", "than fruit is meant to go.", "", "One piece simply sat still, deciding that perhaps the adventure", "would come find it, thank you very much."],
    draw: (frX, frY) => {
      ctx.fillStyle = "#c9384a"; ctx.beginPath(); ctx.arc(frX - 32, frY + 22, 5, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "rgba(90,64,40,0.4)"; ctx.lineWidth = 1; ctx.setLineDash([2, 3]);
      ctx.beginPath(); ctx.moveTo(frX, frY); ctx.quadraticCurveTo(frX - 20, frY + 15, frX - 32, frY + 22); ctx.stroke();
      ctx.fillStyle = "#d4a520"; ctx.beginPath(); ctx.arc(frX + 18, frY - 30, 5, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.moveTo(frX, frY); ctx.quadraticCurveTo(frX + 10, frY - 20, frX + 18, frY - 30); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "#e8a840"; ctx.beginPath(); ctx.arc(frX, frY + 2, 6, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = "#8a6a3a"; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(frX - 6, frY + 18); ctx.lineTo(frX + 6, frY + 18); ctx.stroke();
    }
  },
  {
    num: 4,
    lines: ["Where do the three pieces go from here? Even the tree", "couldn't say.", "", "The future was never really hers to promise. But the whimsy,", "the whimsy she could grow every single year, and that was", "enough."],
    draw: (frX, frY) => {
      ctx.strokeStyle = "#8a6a3a"; ctx.lineWidth = 1.2;
      for (let i = 0; i < 3; i++) { const r = 14 + i * 12; ctx.beginPath(); ctx.arc(frX, frY, r, 0.3 + i, 2.5 + i); ctx.stroke(); }
      ctx.fillStyle = "#d4a520";
      [[0, -38], [24, 10], [-22, 14], [10, 32]].forEach(([dx, dy], i) => {
        ctx.save(); ctx.translate(frX + dx, frY + dy);
        const s = 3 + (i % 2) * 1.5;
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          const a = (Math.PI / 2) * k; const ox = Math.cos(a) * s, oy = Math.sin(a) * s;
          const ia = a + Math.PI / 4; const ix = Math.cos(ia) * s * 0.35, iy = Math.sin(ia) * s * 0.35;
          if (k === 0) ctx.moveTo(ox, oy); else ctx.lineTo(ox, oy);
          ctx.lineTo(ix, iy);
        }
        ctx.closePath(); ctx.fill(); ctx.restore();
      });
    }
  },
  { num: null, isEndPage: true, lines: [] }
];

const manualBookPages = [
  { num: null, isToothPage: true, lines: [] },
  { num: null, isCaninePage: true, lines: [] },
  { num: null, isFrontToothPage: true, lines: [] },
  { num: null, isEndPage: true, lines: [] }
];

function drawIdeaBulb(ctx, x, y, s) {
  // an idea shape (hexagon) with a real lightbulb inside -- the
  // established marker for "this is an idea" throughout the book
  ctx.fillStyle = "#F2D9A8";
  ctx.strokeStyle = "#8a6a3a";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(x, y - s); ctx.lineTo(x + s * 0.55, y - s * 0.6); ctx.lineTo(x + s * 0.35, y + s * 0.25);
  ctx.lineTo(x - s * 0.35, y + s * 0.25); ctx.lineTo(x - s * 0.55, y - s * 0.6);
  ctx.closePath(); ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "#B5551E";
  ctx.lineWidth = s * 0.05;
  ctx.beginPath();
  ctx.arc(x, y - s * 0.4, s * 0.25, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - s * 0.13, y - s * 0.18); ctx.lineTo(x - s * 0.1, y);
  ctx.lineTo(x + s * 0.1, y); ctx.lineTo(x + s * 0.13, y - s * 0.18);
  ctx.stroke();
  ctx.strokeRect(x - s * 0.1, y, s * 0.2, s * 0.18);
  ctx.beginPath();
  ctx.moveTo(x - s * 0.1, y + s * 0.06); ctx.lineTo(x + s * 0.1, y + s * 0.06);
  ctx.moveTo(x - s * 0.1, y + s * 0.13); ctx.lineTo(x + s * 0.1, y + s * 0.13);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - s * 0.1, y - s * 0.4); ctx.quadraticCurveTo(x, y - s * 0.62, x + s * 0.1, y - s * 0.4);
  ctx.quadraticCurveTo(x, y - s * 0.18, x - s * 0.1, y - s * 0.4);
  ctx.stroke();
}

function drawIdeaBulbSmall(ctx, x, y, s) {
  // same marker, small circle variant, used for the extra idea inside the pocket
  ctx.fillStyle = "#F2D9A8";
  ctx.strokeStyle = "#8a6a3a";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(x, y, s, 0, Math.PI * 2);
  ctx.fill(); ctx.stroke();
  ctx.strokeStyle = "#B5551E";
  ctx.lineWidth = s * 0.09;
  ctx.beginPath();
  ctx.arc(x, y - s * 0.15, s * 0.35, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - s * 0.15, y + s * 0.12); ctx.lineTo(x + s * 0.15, y + s * 0.12);
  ctx.stroke();
}

function drawDustyPocket(ctx, x, y, s) {
  // jeans-pocket shaped container, curved bottom, partly open top,
  // translucent, dusty blue matching the book's own cover
  ctx.fillStyle = "rgba(63,87,102,0.35)";
  ctx.beginPath();
  ctx.moveTo(x - s, y - s * 0.2); ctx.quadraticCurveTo(x - s, y + s * 1.3, x, y + s * 1.4);
  ctx.quadraticCurveTo(x + s, y + s * 1.3, x + s, y - s * 0.2); ctx.lineTo(x + s, y - s * 0.45);
  ctx.quadraticCurveTo(x, y - s * 0.2, x - s, y - s * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = "rgba(90,125,140,0.45)";
  ctx.beginPath();
  ctx.moveTo(x - s * 0.94, y - s * 0.25); ctx.lineTo(x - s * 0.94, y + s * 1.06);
  ctx.quadraticCurveTo(x - s * 0.94, y + s * 1.3, x, y + s * 1.38);
  ctx.quadraticCurveTo(x + s * 0.94, y + s * 1.3, x + s * 0.94, y + s * 1.06);
  ctx.lineTo(x + s * 0.94, y - s * 0.25);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#4a6470";
  ctx.lineWidth = 1.2;
  ctx.stroke();
  ctx.fillStyle = "rgba(38,52,60,0.5)";
  ctx.beginPath();
  ctx.moveTo(x - s * 0.94, y - s * 0.25); ctx.quadraticCurveTo(x, y + s * 0.06, x + s * 0.94, y - s * 0.25);
  ctx.lineTo(x + s, y - s * 0.45); ctx.quadraticCurveTo(x, y - s * 0.2, x - s, y - s * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(74,100,112,0.6)";
  ctx.lineWidth = 0.6;
  ctx.setLineDash([2, 2]);
  ctx.beginPath();
  ctx.moveTo(x - s * 0.75, y - s * 0.05); ctx.quadraticCurveTo(x - s * 0.75, y + s * 1.06, x, y + s * 1.12);
  ctx.quadraticCurveTo(x + s * 0.75, y + s * 1.06, x + s * 0.75, y - s * 0.05);
  ctx.stroke();
  ctx.setLineDash([]);
}

const metaphorsBookPages = [
  {
    num: 1,
    lines: ["Ideas (or meanings) are objects.", "", "We speak of ideas as things we grasp, hold onto, turn over,", "or drop. Something we can hand to another person, whole,", "as if meaning had a shape.", "", "\u201cLet me give you an idea.\u201d \u201cI can't quite grasp that.\u201d"],
    draw: (frX, frY) => { drawIdeaBulb(ctx, frX, frY, 34); }
  },
  {
    num: 2,
    lines: ["Linguistic expressions are containers.", "", "Words and sentences are the vessels we put those ideas", "into. A sentence can be \u201cfull of meaning,\u201d or feel \u201cempty,\u201d", "as though meaning were something poured in and sealed.", "", "\u201cHer words carry so much meaning.\u201d"],
    draw: (frX, frY) => {
      drawDustyPocket(ctx, frX, frY - 4, 30);
      drawIdeaBulbSmall(ctx, frX - 10, frY + 14, 8);
      drawIdeaBulbSmall(ctx, frX + 11, frY + 18, 7);
    }
  },
  {
    num: 3,
    lines: ["Communication is sending.", "", "To communicate, then, is to send that filled container", "across the distance between two people \u2014 speaker to", "listener \u2014 trusting the meaning arrives intact inside it.", "", "\u201cShe carried her point across clearly.\u201d"],
    draw: (frX, frY) => {
      ctx.strokeStyle = "#8a8880"; ctx.fillStyle = "#8a8880"; ctx.lineWidth = 1.5;
      // left figure -- head plus a simple trapezoid body, clearer silhouette
      ctx.beginPath(); ctx.arc(frX - 42, frY - 4, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(frX - 48, frY + 30); ctx.lineTo(frX - 44, frY + 8);
      ctx.lineTo(frX - 40, frY + 8); ctx.lineTo(frX - 36, frY + 30);
      ctx.closePath(); ctx.stroke();
      // right figure, same shape
      ctx.beginPath(); ctx.arc(frX + 42, frY - 4, 8, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(frX + 36, frY + 30); ctx.lineTo(frX + 40, frY + 8);
      ctx.lineTo(frX + 44, frY + 8); ctx.lineTo(frX + 48, frY + 30);
      ctx.closePath(); ctx.stroke();
      // sending path, now with an actual arrowhead pointing toward the listener
      ctx.strokeStyle = "rgba(15,110,86,0.5)"; ctx.lineWidth = 1; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(frX - 30, frY + 2); ctx.quadraticCurveTo(frX, frY - 26, frX + 26, frY + 4); ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(15,110,86,0.6)";
      ctx.beginPath();
      ctx.moveTo(frX + 26, frY + 4); ctx.lineTo(frX + 16.9, frY + 0.5); ctx.lineTo(frX + 22.5, frY - 5.1);
      ctx.closePath(); ctx.fill();
      drawDustyPocket(ctx, frX, frY - 20, 14);
      drawIdeaBulbSmall(ctx, frX, frY - 12, 5);
    }
  },
  { num: null, isEndPage: true, lines: [] }
];

function getActivePages() {
  if (bookReader.book === "manual") return manualBookPages;
  if (bookReader.book === "metaphors") return metaphorsBookPages;
  return appleBookPages;
}

function drawBookVine(cx, y, textWidth) {
  const vineWidth = textWidth + 16;
  ctx.strokeStyle = "#5a7a3a";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(cx - vineWidth / 2, y);
  ctx.quadraticCurveTo(cx - vineWidth / 4, y - 5, cx, y);
  ctx.quadraticCurveTo(cx + vineWidth / 4, y + 5, cx + vineWidth / 2, y);
  ctx.stroke();
  ctx.fillStyle = "#4a7a2a";
  [-vineWidth * 0.32, -vineWidth * 0.08, vineWidth * 0.14, vineWidth * 0.34].forEach((dx, i) => {
    ctx.save();
    ctx.translate(cx + dx, y + (i % 2 === 0 ? -4 : 4));
    ctx.rotate(i % 2 === 0 ? -0.5 : 0.5);
    ctx.beginPath();
    ctx.ellipse(0, 0, 4, 2.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

function drawBookStar(cx, cy, r) {
  ctx.beginPath();
  for (let i = 0; i < 4; i++) {
    const a = (Math.PI / 2) * i;
    const ox = cx + Math.cos(a) * r, oy = cy + Math.sin(a) * r;
    const ia = a + Math.PI / 4;
    const ix = cx + Math.cos(ia) * r * 0.35, iy = cy + Math.sin(ia) * r * 0.35;
    if (i === 0) ctx.moveTo(ox, oy); else ctx.lineTo(ox, oy);
    ctx.lineTo(ix, iy);
  }
  ctx.closePath();
  ctx.fill();
}

const BOOK_SPARK_COLORS = ["255,250,230", "255,225,150", "255,255,255"];
function buildBookSparkles(count) {
  return Array.from({ length: count }, () => {
    const angle = Math.random() * Math.PI * 2;
    const dist = 20 + Math.random() * 150;
    return {
      dx: Math.cos(angle) * dist, dy: Math.sin(angle) * dist,
      spinDir: Math.random() < 0.5 ? 1 : -1,
      spinAmount: 1.2 + Math.random() * 1.6,
      seed: Math.random(),
      radius: 0.9 + Math.random() * 1.6,
      isStar: Math.random() < 0.3,
      color: BOOK_SPARK_COLORS[Math.floor(Math.random() * BOOK_SPARK_COLORS.length)],
      twinkleSpeed: 0.006 + Math.random() * 0.01,
      twinklePhase: Math.random() * Math.PI * 2,
      wobbleSpeed: 1.5 + Math.random() * 2,
      wobbleAmt: 3 + Math.random() * 6
    };
  });
}

function drawBookSparkles(centerX, centerY, alpha, progress, now) {
  const ease = 1 - Math.pow(1 - progress, 2);
  bookReader.sparkles.forEach((pt, idx) => {
    const radius = Math.hypot(pt.dx, pt.dy) * ease;
    const baseAngle = Math.atan2(pt.dy, pt.dx);
    const spin = ease * Math.PI * pt.spinAmount * pt.spinDir;
    const angle = baseAngle + spin;
    const wobble = Math.sin(now * 0.001 * pt.wobbleSpeed + pt.seed * 10) * pt.wobbleAmt * ease;
    const px = centerX + Math.cos(angle) * radius + Math.cos(angle + Math.PI / 2) * wobble;
    const py = centerY + Math.sin(angle) * radius + Math.sin(angle + Math.PI / 2) * wobble;
    const twinkle = 0.4 + Math.sin(now * pt.twinkleSpeed + pt.twinklePhase) * 0.6;
    const sizeTwinkle = pt.radius * (0.7 + twinkle * 0.5);
    ctx.fillStyle = `rgba(${pt.color},${Math.max(0, alpha * twinkle)})`;
    if (pt.isStar) drawBookStar(px, py, sizeTwinkle * 2.2);
    else { ctx.beginPath(); ctx.arc(px, py, sizeTwinkle, 0, Math.PI * 2); ctx.fill(); }
  });
}

function drawBookPageBackground(x, pw, ph) {
  ctx.fillStyle = "#e8d9b8";
  ctx.fillRect(x, 0, pw, ph);
}

function drawBookPageContent(pages, pageIdx, x, pw, ph, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const page = pages[pageIdx];
  const frX = x + pw / 2;

  if (page.isEndPage) {
    ctx.fillStyle = "#3a2c18";
    ctx.font = "italic 44px Georgia, serif";
    ctx.textAlign = "center";
    ctx.save();
    ctx.letterSpacing = "4px";
    ctx.fillText("the end", frX, ph / 2 + 10);
    ctx.restore();

    const drawFlourish = (side) => {
      ctx.strokeStyle = "#8a6a3a";
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      const startX = frX + side * 95, endX = frX + side * 20;
      const y = ph / 2 - 45;
      ctx.moveTo(startX, y);
      ctx.bezierCurveTo(startX - side * 25, y - 10, startX - side * 45, y + 8, endX, y);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(startX, y, 2, 0, Math.PI * 2);
      ctx.fillStyle = "#8a6a3a";
      ctx.fill();
      const y2 = ph / 2 + 55;
      ctx.beginPath();
      ctx.moveTo(startX, y2);
      ctx.bezierCurveTo(startX - side * 25, y2 + 10, startX - side * 45, y2 - 8, endX, y2);
      ctx.stroke();
      ctx.beginPath();
      ctx.arc(startX, y2, 2, 0, Math.PI * 2);
      ctx.fill();
    };
    drawFlourish(-1);
    drawFlourish(1);

    ctx.fillStyle = "#a8862f";
    ctx.font = "16px Georgia, serif";
    ctx.fillText("\u2766", frX, ph / 2 - 20);
    ctx.restore();
    return;
  }

  if (page.isToothPage) {
    const frX2 = frX, frY = ph / 2 - 10;
    const s = 20; // scale factor for the big page version — huge, per request
    ctx.fillStyle = "#f5f0e0";
    ctx.beginPath();
    ctx.moveTo(frX2 - 2.5 * s, frY - 1.5 * s);
    ctx.quadraticCurveTo(frX2 - 3 * s, frY - 4 * s, frX2, frY - 4 * s);
    ctx.quadraticCurveTo(frX2 + 3 * s, frY - 4 * s, frX2 + 2.5 * s, frY - 1.5 * s);
    ctx.quadraticCurveTo(frX2 + 2.7 * s, frY + 0.5 * s, frX2 + 1.2 * s, frY + 3 * s);
    ctx.quadraticCurveTo(frX2 + 0.6 * s, frY + 4 * s, frX2, frY + 2.5 * s);
    ctx.quadraticCurveTo(frX2 - 0.6 * s, frY + 4 * s, frX2 - 1.2 * s, frY + 3 * s);
    ctx.quadraticCurveTo(frX2 - 2.7 * s, frY + 0.5 * s, frX2 - 2.5 * s, frY - 1.5 * s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#c9c0a8";
    ctx.lineWidth = 1;
    ctx.stroke();
    // shine highlight -- a bright ellipse plus a couple sparkle glints
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.ellipse(frX2 - 0.9 * s, frY - 2.2 * s, 0.6 * s, 1.1 * s, -0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    [[1.6 * s, -3.2 * s], [2.3 * s, -1 * s]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.moveTo(frX2 + dx - 4, frY + dy);
      ctx.lineTo(frX2 + dx + 4, frY + dy);
      ctx.moveTo(frX2 + dx, frY + dy - 4);
      ctx.lineTo(frX2 + dx, frY + dy + 4);
      ctx.stroke();
    });
    ctx.restore();
    return;
  }

  if (page.isCaninePage) {
    const frX2 = frX, frY = ph / 2 - 10;
    const s = 20; // huge, matching the molar page
    ctx.fillStyle = "#f5f0e0";
    ctx.beginPath();
    // a single clean, curved fang -- wide at the gumline, smoothly
    // tapering to one sharp point. Simplified from the earlier version,
    // which had a complex crown-to-root transition that read as unclear.
    ctx.moveTo(frX2 - 1.6 * s, frY - 3.6 * s);
    ctx.quadraticCurveTo(frX2 - 1.9 * s, frY - 1 * s, frX2 - 0.6 * s, frY + 2.2 * s);
    ctx.quadraticCurveTo(frX2 - 0.3 * s, frY + 3.6 * s, frX2, frY + 4.6 * s);
    ctx.quadraticCurveTo(frX2 + 0.3 * s, frY + 3.6 * s, frX2 + 0.6 * s, frY + 2.2 * s);
    ctx.quadraticCurveTo(frX2 + 1.9 * s, frY - 1 * s, frX2 + 1.6 * s, frY - 3.6 * s);
    ctx.quadraticCurveTo(frX2 + 1 * s, frY - 4.4 * s, frX2, frY - 4.2 * s);
    ctx.quadraticCurveTo(frX2 - 1 * s, frY - 4.4 * s, frX2 - 1.6 * s, frY - 3.6 * s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#c9c0a8";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.ellipse(frX2 - 0.5 * s, frY - 2 * s, 0.35 * s, 1.3 * s, -0.15, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    [[1 * s, -3 * s], [0.4 * s, 1.8 * s]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.moveTo(frX2 + dx - 4, frY + dy);
      ctx.lineTo(frX2 + dx + 4, frY + dy);
      ctx.moveTo(frX2 + dx, frY + dy - 4);
      ctx.lineTo(frX2 + dx, frY + dy + 4);
      ctx.stroke();
    });
    ctx.restore();
    return;
  }

  if (page.isFrontToothPage) {
    const frX2 = frX, frY = ph / 2 - 10;
    const s = 20; // huge, matching the other tooth pages
    ctx.fillStyle = "#f5f0e0";
    ctx.beginPath();
    // crown -- flat, chisel-shaped, wide rectangular edge (not pointed)
    ctx.moveTo(frX2 - 2 * s, frY - 3.5 * s);
    ctx.quadraticCurveTo(frX2 - 2.1 * s, frY - 4.3 * s, frX2 - 1.3 * s, frY - 4.4 * s);
    ctx.lineTo(frX2 + 1.3 * s, frY - 4.4 * s);
    ctx.quadraticCurveTo(frX2 + 2.1 * s, frY - 4.3 * s, frX2 + 2 * s, frY - 3.5 * s);
    ctx.quadraticCurveTo(frX2 + 2.1 * s, frY - 0.8 * s, frX2 + 1.7 * s, frY + 0.3 * s);
    ctx.lineTo(frX2 - 1.7 * s, frY + 0.3 * s);
    ctx.quadraticCurveTo(frX2 - 2.1 * s, frY - 0.8 * s, frX2 - 2 * s, frY - 3.5 * s);
    ctx.closePath();
    ctx.fill();
    // single tapering root beneath the flat crown edge
    ctx.beginPath();
    ctx.moveTo(frX2 - 1.5 * s, frY + 0.2 * s);
    ctx.quadraticCurveTo(frX2 - 0.9 * s, frY + 2.6 * s, frX2, frY + 4.4 * s);
    ctx.quadraticCurveTo(frX2 + 0.9 * s, frY + 2.6 * s, frX2 + 1.5 * s, frY + 0.2 * s);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#c9c0a8";
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.ellipse(frX2 - 0.9 * s, frY - 2.5 * s, 0.7 * s, 1.1 * s, -0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.9)";
    ctx.lineWidth = 2;
    [[1.3 * s, -3 * s], [1.6 * s, -1 * s]].forEach(([dx, dy]) => {
      ctx.beginPath();
      ctx.moveTo(frX2 + dx - 4, frY + dy);
      ctx.lineTo(frX2 + dx + 4, frY + dy);
      ctx.moveTo(frX2 + dx, frY + dy - 4);
      ctx.lineTo(frX2 + dx, frY + dy + 4);
      ctx.stroke();
    });
    ctx.restore();
    return;
  }

  const frY = 92, frR = 55;
  ctx.strokeStyle = "#8a6a3a";
  ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(frX, frY, frR, 0, Math.PI * 2); ctx.stroke();
  ctx.save();
  ctx.beginPath(); ctx.arc(frX, frY, frR - 4, 0, Math.PI * 2); ctx.clip();
  ctx.fillStyle = "#f0e6cc"; ctx.fillRect(frX - frR, frY - frR, frR * 2, frR * 2);
  page.draw(frX, frY);
  ctx.restore();

  ctx.fillStyle = "#3a2c18";
  ctx.font = "italic 11px Georgia, serif";
  ctx.textAlign = "center";
  let ty = 168;
  page.lines.forEach(line => { ctx.fillText(line, frX, ty); ty += 17; });

  ctx.font = "14px Georgia, serif";
  const numStr = String(page.num);
  const numWidth = ctx.measureText(numStr).width;
  drawBookVine(frX, ph - 62, numWidth);
  ctx.fillStyle = "#4a3018";
  ctx.fillText(numStr, frX, ph - 44);
  ctx.restore();
}

function drawBookCover(centerX, centerY, alpha) {
  ctx.save();
  ctx.globalAlpha = alpha;
  const bookType = bookReader.book;
  const coverW = bookType === "manual" ? 90 : bookType === "metaphors" ? 100 : 110, coverH = 130;
  const cx0 = centerX - coverW / 2, cy0 = centerY - coverH / 2;
  if (bookType === "metaphors") {
    // simplified cover -- black bottom two-thirds, dusty blue top third
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(cx0, cy0, coverW, coverH);
    ctx.fillStyle = "#3f5766";
    ctx.fillRect(cx0, cy0, coverW, coverH / 3);
    ctx.strokeStyle = "#22303a";
    ctx.lineWidth = 2;
    ctx.strokeRect(cx0, cy0, coverW, coverH);
  } else {
    const isManual = bookType === "manual";
    ctx.fillStyle = isManual ? "#2f5a6a" : "#7a2f2f";
    ctx.fillRect(cx0, cy0, coverW, coverH);
    ctx.strokeStyle = isManual ? "#1a3540" : "#5a2020";
    ctx.lineWidth = 2;
    ctx.strokeRect(cx0, cy0, coverW, coverH);
  }
  if (bookType === "metaphors") {
    ctx.fillStyle = "#e8ddc8";
    ctx.font = "bold 12px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("METAPHORS", centerX, centerY - 5);
    ctx.font = "11px Georgia, serif";
    ctx.fillText("WE LIVE BY", centerX, centerY + 11);
  } else {
    ctx.fillStyle = bookType === "manual" ? "#e8ddc8" : "#d4a520";
    ctx.font = "italic 13px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText(bookType === "manual" ? "MANUAL" : "apple", centerX, centerY);
  }
  ctx.restore();
}

function easeInOutBook(p) { return p < 0.5 ? 2 * p * p : 1 - Math.pow(-2 * p + 2, 2) / 2; }
function easeOutBook(p) { return 1 - Math.pow(1 - p, 3); }

function updateBookReader(deltaTime) {
  const dtMs = deltaTime * 1000;
  const w = canvas.width, h = canvas.height;
  const spineX = 90, pageRight = w - 40, pageW = pageRight - spineX;
  const centerX = spineX + pageW / 2, centerY = h / 2;

  if (bookReader.opening) {
    bookReader.openT += dtMs;
    if (bookReader.openT >= BOOK_OPEN_CLOSE_MS) {
      bookReader.opening = false;
      bookReader.active = true;
      bookReader.currentPage = 0;
      bookReader.pageTime = 0;
    }
    return;
  }

  if (bookReader.closing) {
    bookReader.closeT += dtMs;
    if (bookReader.closeT >= BOOK_OPEN_CLOSE_MS) {
      bookReader.closing = false;
      bookReader.book = null;
    }
    return;
  }

  if (!bookReader.active) return;

  const pages = getActivePages();

  if (bookReader.transitioning) {
    bookReader.transitionT += dtMs;
    if (bookReader.transitionT >= BOOK_READER_TRANSITION_TOTAL) {
      bookReader.transitioning = false;
      bookReader.currentPage = bookReader.pendingPage;
      bookReader.pageTime = 0;
    }
    return;
  }

  bookReader.pageTime += dtMs;

  // brief grace period on the end page specifically -- ensures "the
  // end" is actually seen for a moment before input can close the book
  const onEndPage = pages[bookReader.currentPage] && pages[bookReader.currentPage].isEndPage;
  const pastGracePeriod = !onEndPage || bookReader.pageTime >= BOOK_END_PAGE_GRACE_MS;

  if (keys.spaceJustPressed && pastGracePeriod) {
    bookReader.active = false;
    bookReader.closing = true;
    bookReader.closeT = 0;
    return;
  }

  if (keys.rightJustPressed && pastGracePeriod) {
    if (bookReader.currentPage >= pages.length - 1) {
      bookReader.active = false;
      bookReader.closing = true;
      bookReader.closeT = 0;
      return;
    }
    bookReader.pendingPage = bookReader.currentPage + 1;
    bookReader.sparkles = buildBookSparkles(pages.length <= 1 ? 40 : 90);
    bookReader.transitioning = true;
    bookReader.transitionT = 0;
  } else if (keys.leftJustPressed && bookReader.currentPage > 0) {
    bookReader.pendingPage = bookReader.currentPage - 1;
    bookReader.sparkles = buildBookSparkles(90);
    bookReader.transitioning = true;
    bookReader.transitionT = 0;
  }
}

// draws text following a curved arc -- used for the carving UI's
// title, arcing above the pumpkin like an old carnival sign
function drawArcText(text, cx, cy, radius, centerAngle, totalArc, font, color) {
  ctx.save();
  ctx.font = font;
  ctx.fillStyle = color;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const widths = text.split("").map(ch => ctx.measureText(ch).width);
  const totalWidth = widths.reduce((a, b) => a + b, 0);
  let angleAccum = -totalArc / 2;
  for (let i = 0; i < text.length; i++) {
    const charWidth = widths[i];
    const charAngle = (charWidth / totalWidth) * totalArc;
    const angle = centerAngle + angleAccum + charAngle / 2;
    const px = cx + Math.sin(angle) * radius;
    const py = cy - Math.cos(angle) * radius;
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(angle);
    ctx.fillText(text[i], 0, 0);
    ctx.restore();
    angleAccum += charAngle;
  }
  ctx.restore();
}

function drawCarvingUI() {
  const w = canvas.width, h = canvas.height;
  const cx = w / 2, cy = h / 2 - 10;

  // cream, old-paper background -- same tone as the top-down map, so
  // this UI reads as visually related to the game's other paper-like
  // surfaces rather than a one-off color choice
  ctx.fillStyle = "#ddd0a8";
  ctx.fillRect(0, 0, w, h);

  let alpha = 1;
  if (carvingUI.opening) alpha = Math.min(1, carvingUI.openT / CARVING_OPEN_CLOSE_MS);
  else if (carvingUI.closing) alpha = Math.max(0, 1 - carvingUI.closeT / CARVING_OPEN_CLOSE_MS);

  ctx.save();
  ctx.globalAlpha = alpha;

  // fanfare -- curved title arcing above the pumpkin like an old
  // carnival sign, plus a few small decorative flourishes so opening
  // this feels like an occasion, not another menu to get through
  drawArcText("Carve your own Pumpkin!", cx, cy + 40, 175, 0, 1.1, "bold 20px Georgia, serif", "#5a3a1a");
  [[cx - 230, 60, 0.3], [cx + 230, 60, -0.3], [cx - 210, h - 90, -0.4], [cx + 210, h - 90, 0.4]].forEach(([lx, ly, lrot]) => {
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(lrot);
    ctx.fillStyle = "#b5651d";
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.quadraticCurveTo(8, -4, 8, 4);
    ctx.quadraticCurveTo(4, 10, 0, 10);
    ctx.quadraticCurveTo(-4, 10, -8, 4);
    ctx.quadraticCurveTo(-8, -4, 0, -10);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(90,50,10,0.4)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(0, 9);
    ctx.stroke();
    ctx.restore();
  });

  // live preview -- whichever feature is currently being browsed
  // updates in real time, everything already confirmed stays fixed
  let previewEyeLeft = carvingUI.eyeLeft, previewEyeRight = carvingUI.eyeRight, previewMouth = carvingUI.mouth;
  if (carvingUI.step === "eyes") {
    previewEyeLeft = carvingUI.cursorIndex;
    previewEyeRight = carvingUI.cursorIndex;
  } else if (carvingUI.step === "eyeRight") {
    previewEyeRight = carvingUI.cursorIndex;
  } else if (carvingUI.step === "mouth") {
    previewMouth = carvingUI.cursorIndex;
  }
  const transitionWindow = 180;
  const tProgress = Math.min(1, carvingUI.transitionT / transitionWindow);
  const easedT = 1 - Math.pow(1 - tProgress, 3); // ease-out cubic
  const popScale = 0.9 + easedT * 0.1; // settles from 90pct to full scale, not an instant snap
  ctx.save();
  ctx.translate(cx, cy);
  ctx.scale(popScale, popScale);
  ctx.translate(-cx, -cy);
  drawPumpkinFace(cx, cy, 100, previewEyeLeft, previewEyeRight, previewMouth);
  ctx.restore();

  // step-specific prompt text
  ctx.fillStyle = "#3a2818";
  ctx.font = "16px Georgia, serif";
  ctx.textAlign = "center";
  let promptLine1 = "", promptLine2 = "";
  if (carvingUI.step === "eyes") {
    promptLine1 = "Choose a pair of eyes";
    promptLine2 = "← → to browse   •   space to confirm";
  } else if (carvingUI.step === "eyeRight") {
    promptLine1 = "Want the right eye different? Browse to change it";
    promptLine2 = "← → to browse   •   space to confirm   •   ↑ to go back";
  } else if (carvingUI.step === "mouth") {
    promptLine1 = "Choose a mouth";
    promptLine2 = "← → to browse   •   space to confirm   •   ↑ to go back";
  } else if (carvingUI.step === "finalize") {
    promptLine1 = "All set?";
    promptLine2 = "space to finish carving   •   ↑ to go back and revise";
  }
  ctx.fillText(promptLine1, cx, h - 70);
  ctx.font = "13px Georgia, serif";
  ctx.fillStyle = "#6a5a48";
  ctx.fillText(promptLine2, cx, h - 48);

  // option counter, shown while actively browsing (not on finalize)
  if (carvingUI.step !== "finalize") {
    const count = carvingUI.step === "mouth" ? CARVING_MOUTH_COUNT : CARVING_EYE_COUNT;
    ctx.font = "12px Georgia, serif";
    ctx.fillStyle = "#8a7a68";
    ctx.fillText((carvingUI.cursorIndex + 1) + " / " + count, cx, h - 26);
  }

  ctx.restore();
}

function drawBookReader() {
  const w = canvas.width, h = canvas.height;
  const spineX = 90, pageRight = w - 40, pageW = pageRight - spineX;
  const centerX = spineX + pageW / 2, centerY = h / 2;
  const now = performance.now();
  const pages = getActivePages();

  ctx.fillStyle = "#dccba0";
  ctx.fillRect(0, 0, w, h);

  if (bookReader.opening) {
    const t = bookReader.openT;
    const PHASE_FLYIN = 1000, PHASE_HOLD = 400, PHASE_BURST = 500, PHASE_OPEN = 900;
    if (t < PHASE_FLYIN) {
      const fp = easeOutBook(t / PHASE_FLYIN);
      const scale = 0.3 + fp * 0.7;
      ctx.save();
      ctx.globalAlpha = fp;
      ctx.translate(centerX, centerY);
      ctx.scale(scale, scale);
      ctx.translate(-centerX, -centerY);
      drawBookCover(centerX, centerY, 1);
      ctx.restore();
    } else if (t < PHASE_FLYIN + PHASE_HOLD) {
      drawBookCover(centerX, centerY, 1);
    } else if (t < PHASE_FLYIN + PHASE_HOLD + PHASE_BURST) {
      const bp = (t - PHASE_FLYIN - PHASE_HOLD) / PHASE_BURST;
      if (bp < 0.05 && bookReader.sparkles.length === 0) bookReader.sparkles = buildBookSparkles(60);
      drawBookCover(centerX, centerY, 1);
      drawBookSparkles(centerX, centerY, 1 - bp, bp, now);
    } else {
      const op = easeInOutBook((t - PHASE_FLYIN - PHASE_HOLD - PHASE_BURST) / PHASE_OPEN);
      const leftEdge = spineX + (pageW / 2) * (1 - op);
      const rightEdge = pageRight - (pageW / 2) * (1 - op);
      ctx.fillStyle = "#d8c8a0"; ctx.fillRect(spineX - 20, 0, 20, h);
      ctx.fillStyle = "#4a3018"; ctx.fillRect(spineX - 3, 0, 3, h);
      ctx.save();
      ctx.beginPath();
      ctx.rect(spineX, 0, Math.max(0, leftEdge - spineX), h);
      ctx.clip();
      drawBookPageBackground(spineX, pageW, h);
      drawBookPageContent(pages, 0, spineX, pageW, h, op);
      ctx.restore();
      if (rightEdge < pageRight) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(rightEdge, 0, pageRight - rightEdge, h);
        ctx.clip();
        drawBookPageBackground(spineX, pageW, h);
        ctx.restore();
      }
      if (bookReader.sparkles.length) bookReader.sparkles = [];
    }
    return;
  }

  if (bookReader.closing) {
    const t = bookReader.closeT;
    const PHASE_CLOSE = 900, PHASE_BURST = 500, PHASE_HOLD = 400, PHASE_FLYAWAY = 1000;
    if (t < PHASE_CLOSE) {
      const p = easeInOutBook(t / PHASE_CLOSE);
      const leftEdge = spineX + (pageW / 2) * p;
      const rightEdge = pageRight - (pageW / 2) * p;
      ctx.save();
      ctx.beginPath();
      ctx.rect(spineX, 0, Math.max(0, leftEdge - spineX), h);
      ctx.clip();
      drawBookPageBackground(spineX, pageW, h);
      drawBookPageContent(pages, pages.length - 1, spineX, pageW, h, 1 - p * 0.6);
      ctx.restore();
      ctx.save();
      ctx.beginPath();
      ctx.rect(rightEdge, 0, Math.max(0, pageRight - rightEdge), h);
      ctx.clip();
      ctx.fillStyle = "#e0d0a8"; ctx.fillRect(spineX, 0, pageW, h);
      ctx.restore();
      ctx.fillStyle = "#4a3018"; ctx.fillRect(leftEdge - 1.5, 0, 3, h);
      ctx.fillStyle = "#d8c8a0"; ctx.fillRect(spineX - 20, 0, 20, h);
      ctx.fillStyle = "#4a3018"; ctx.fillRect(spineX - 3, 0, 3, h);
    } else if (t < PHASE_CLOSE + PHASE_BURST) {
      const bp = (t - PHASE_CLOSE) / PHASE_BURST;
      if (bp < 0.05 && bookReader.sparkles.length === 0) bookReader.sparkles = buildBookSparkles(60);
      drawBookCover(centerX, centerY, 1);
      drawBookSparkles(centerX, centerY, 1, bp, now);
    } else if (t < PHASE_CLOSE + PHASE_BURST + PHASE_HOLD) {
      drawBookCover(centerX, centerY, 1);
    } else {
      const fp = easeOutBook((t - PHASE_CLOSE - PHASE_BURST - PHASE_HOLD) / PHASE_FLYAWAY);
      const scale = 1 - fp * 0.7;
      const driftY = -fp * 140, driftX = fp * 60;
      ctx.save();
      ctx.globalAlpha = 1 - fp;
      ctx.translate(centerX + driftX, centerY + driftY);
      ctx.scale(scale, scale);
      ctx.translate(-centerX, -centerY);
      drawBookCover(centerX, centerY, 1);
      ctx.restore();
      if (bookReader.sparkles.length) bookReader.sparkles = [];
    }
    return;
  }

  ctx.fillStyle = "#d8c8a0"; ctx.fillRect(spineX - 20, 0, 20, h);
  ctx.fillStyle = "#4a3018"; ctx.fillRect(spineX - 3, 0, 3, h);
  drawBookPageBackground(spineX, pageW, h);

  if (!bookReader.transitioning) {
    drawBookPageContent(pages, bookReader.currentPage, spineX, pageW, h, 1);
    return;
  }

  const t = bookReader.transitionT;
  if (t < BOOK_READER_OUT_MS) {
    const p = t / BOOK_READER_OUT_MS;
    drawBookPageContent(pages, bookReader.currentPage, spineX, pageW, h, 1 - p);
    drawBookSparkles(centerX, centerY, 1, p, now);
  } else if (t < BOOK_READER_OUT_MS + BOOK_READER_PAUSE_MS) {
    // quiet pause on the blank page
  } else {
    const p = (t - BOOK_READER_OUT_MS - BOOK_READER_PAUSE_MS) / BOOK_READER_IN_MS;
    drawBookPageContent(pages, bookReader.pendingPage, spineX, pageW, h, p);
    drawBookSparkles(centerX, centerY, 1, 1 - p, now);
  }
}

/* ======================================================
   RAT ROOM — beneath the oak room's trap door. Currently a
   placeholder: old wooden stairs coming down from above,
   with a shaft of light spilling in from the oak room where
   the stairs begin. Rat NPC and the rest of the room's
   content come in a later pass.
   ====================================================== */
const ratRoomStairsTop = { x: 400, y: 20 };

// cheese painting -- a single framed piece on the rat room's wall,
// away from the stairs/light-shaft area
const ratRoomCheeseArt = new Image();
ratRoomCheeseArt.src = "data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAkGBwgHBgkIBwgKCgkLDRYPDQwMDRsUFRAWIB0iIiAdHx8kKDQsJCYxJx8fLT0tMTU3Ojo6Iys/RD84QzQ5Ojf/2wBDAQoKCg0MDRoPDxo3JR8lNzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzf/wAARCABSAG4DASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwDy4HmpFqNamQVxs9FsmjFWUqCPpUy/WhQJuTocVOhqspqZDTsIsq1PVscVXz6U8NSsO5YB/Kn7h26VXDcdacrc0rAWAwqRG5qsDUqNzRYC7G1XImwKz42q3E3FFijztRzUy9OabThzW6iZslU1IhqIU4GnYLk6mpVNQIfepFOBScR3J808GoQacCanlC5MG+lPDVApp69aXKMnU1KpqAVIlKwXLcZq3E2BxVGM1ajbiiwrnDg5FPFRrUgrqUTFzHjpTxTVp60OIuYetSCmIKlUE1LQ+YctPoSMkgAZJ6AVbubG4s5hDdQvFJtDbHGDg9KmwucrDrUiitPTNHF9aXMy3caTRY2QbGZpfpj8qmTw5qLWxnKRjDYMZkG/3OPQfWolKMd2UpXKmnWFxqM5htUDOELkscAAe9RIOQAOfSums9JsLAyT3F9MECkFkyu5Txjj19K3bG20cWu7T4omUgAyDrn61jLERWyK1OCUEHBGD6GrEZ4rVnbSIo74XMUkt4ZCsYBIC8cH0+tZCHFbrVJiucYKeoNCip7aCW4k8uCN5XwTtRSxwOvArtaMLjVFSKvSlVc10Oj+FNV1JFligEUJP35Tt49h1rGpKMFeTsC1KK6RdjSf7UaNVtPM8tWZgCzew70tpp11dAtDA7KOS+MAfjXeaf4dsbKB4ZpknO4GMyPkA9yB0GcfpV6K1cxkNEBGT8uGyCPwrhnil9lGih3OW0fw3K8gmlmePy/nBjTJyOeCe/FbcdpY6hCuqTwTXEs7FN1yMkkf7I4xWvI0NgloJFlXz5SIwq7xk+p7ZpxZCxLwvI24jLHgnPYdK5pVpy6jsiraJdMEEMSxW6nAVFwD+A4qzdW087cBVGOAw71atiS8SwvGYAu4BMY+lYXhu41iTWbuK/ecqFKnd9xWzxj8PSskm7vsPmsM1DTIvszR3rvsQGT9wMlmwcCm+EYbi3sn+0QMsRbcCwxz0roTFLLKBK5b3C/Lxz/k0xkaH5YyCsgAdSvU5yTu+nGKv2jcOUXW5xM+mpPZ3WpfbYFkWVswE4Y84/M9azFq5Np0721zqOFWBJimWOCST2qs8MkYQyRugddy7gRuHqPavVS0RCkcavpXT6V4sutOfzILSzEm0KCsW3jGOcfQVzC1MgrulBNWZip32Okj8QxwX0d7aaXarcKDlmBwc9flHAPv1q1f+MdUv7R7Z/JjRxhjGCDj6k1y61KprGVCEnzNalKTSsdNpfiNLKzgthYhvLBywkI3EnOf/rVf/wCExlK4WyiwD8u5skVxytUgf0rF4Sm3ewc7Ow/4TfUWAEkFq6joCpGPxBqFvFk7SLJ9jtty9Cxdv61y2/3pd5HQ1DwtPsPmZ2H/AAmkwyVsLZW/vKzVGfGFyDuS0tg3djkmuU30oap+q0+wczOug8a38SIot7UhT1KnJHp1ou/GN9cN8kcUYHOBk1yganqaPq1O+w1Jl2a5knZzIxw7lyoPygnvirV9qFxqMkclyVJjjEa7VwABWahqxH0ra1gOOTrVhaKK7mc0NyUdKlX7pooqDUcnenCiigB69PwpD1ooqGCHDrSr1ooqSh/pUi9aKKljRMnarUfSiioYz//Z";
const ratRoomArtSpot = { x: 600, y: 75, w: 90, h: 67 };
// wall spot where the feather gets hung once the rat asks for it --
// near his own area, a specific place he can point to
const featherHangSpot = { x: 550, heightAboveGround: 55 };
function drawFeatherHangSpot(camX) {
  if (!lampLit && !featherHangAnim.active) return;
  const hx = featherHangSpot.x - camX, hy = gy - featherHangSpot.heightAboveGround;
  const playerScreenX = player.x + player.width / 2 - camX;
  const dist = Math.hypot(hx - playerScreenX, hy - (gy - player.y));
  if (dist > LAMP_LIGHT_RADIUS && !featherHangAnim.active) return;

  // a temporary glow while the placement animation plays, independent
  // of whether the lamp happens to be actively held right then -- so
  // the moment is guaranteed visible rather than possibly happening
  // in the dark
  if (featherHangAnim.active) {
    const glow = ctx.createRadialGradient(hx, hy, 0, hx, hy, 55);
    glow.addColorStop(0, "rgba(220,190,120,0.35)");
    glow.addColorStop(1, "rgba(220,190,120,0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(hx, hy, 55, 0, Math.PI * 2);
    ctx.fill();
  }

  // small shelf the pot sits on, same wooden-plank style as the other
  // shelves in this room, sharing the pot's exact visibility gating
  ctx.fillStyle = "#4a3018";
  ctx.fillRect(hx - 14, hy + 10, 28, 4);
  ctx.strokeStyle = "#2e1c0e";
  ctx.lineWidth = 1;
  ctx.strokeRect(hx - 14, hy + 10, 28, 4);
  ctx.strokeStyle = "#3a2410";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(hx - 11, hy + 14);
  ctx.lineTo(hx - 15, hy + 24);
  ctx.stroke();

  // a small terracotta pot -- narrow base, bulging out near the top,
  // narrowing again at the mouth. Visible whether or not the feather
  // is in it yet, so it reads as a real display spot from the start.
  ctx.save();
  ctx.translate(hx, hy);
  ctx.fillStyle = "#b8603a";
  ctx.beginPath();
  ctx.moveTo(-3, 10);
  ctx.quadraticCurveTo(-9, 7, -8, 2);
  ctx.quadraticCurveTo(-7, -3, -4, -5);
  ctx.lineTo(-5, -7);
  ctx.lineTo(5, -7);
  ctx.lineTo(4, -5);
  ctx.quadraticCurveTo(7, -3, 8, 2);
  ctx.quadraticCurveTo(9, 7, 3, 10);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "#7a3a20";
  ctx.lineWidth = 0.8;
  ctx.stroke();
  // rim highlight and a couple faint horizontal throw-lines for a
  // rustic, hand-thrown clay look
  ctx.strokeStyle = "rgba(140,70,40,0.5)";
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(-7, 1.5); ctx.lineTo(7, 1.5);
  ctx.moveTo(-8.5, 5); ctx.lineTo(8.5, 5);
  ctx.stroke();
  ctx.fillStyle = "#8a4426";
  ctx.beginPath();
  ctx.ellipse(0, -7, 5, 1.4, 0, 0, Math.PI * 2);
  ctx.fill();

  if (featherHung || featherHangAnim.active) {
    ctx.save();
    const settleP = featherHangAnim.active ? Math.min(1, featherHangAnim.t / FEATHER_HANG_MS) : 1;
    const startY = -40, endY = -9; // ends right at the pot's own rim (rim ellipse is at y=-7), not floating well above it
    ctx.translate(0, startY + (endY - startY) * settleP);
    ctx.globalAlpha = featherHangAnim.active ? 0.5 + settleP * 0.5 : 1;
    drawFeatherShape(ctx, 0, 0, 11, (1 - settleP) * 0.6);
    ctx.restore();
    // re-draw the jar's full body on top, since the feather's actual
    // base extends well below the rim line itself -- a thin ring
    // there alone doesn't cover nearly enough of it to read as
    // genuinely sitting inside rather than floating in front
    ctx.fillStyle = "#b8603a";
    ctx.beginPath();
    ctx.moveTo(-3, 10);
    ctx.quadraticCurveTo(-9, 7, -8, 2);
    ctx.quadraticCurveTo(-7, -3, -4, -5);
    ctx.lineTo(-5, -7);
    ctx.lineTo(5, -7);
    ctx.lineTo(4, -5);
    ctx.quadraticCurveTo(7, -3, 8, 2);
    ctx.quadraticCurveTo(9, 7, 3, 10);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "#7a3a20";
    ctx.lineWidth = 0.8;
    ctx.stroke();
    ctx.fillStyle = "#8a4426";
    ctx.beginPath();
    ctx.ellipse(0, -7, 5, 1.4, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
const featherHangAnim = { active: false, t: 0 };
const FEATHER_HANG_MS = 800;
function updateFeatherHangSpot() {
  if (featherHung || !carriedFeather || featherHangAnim.active) return;
  if (keys.spaceJustPressed && isPlayerNear(featherHangSpot.x, featherHangSpot.heightAboveGround, 25, 20, 60)) {
    featherHangAnim.active = true;
    featherHangAnim.t = 0;
    carriedFeather = false; // no longer visibly carried once the placement has started
  }
}
function updateFeatherHangAnim(deltaTime) {
  if (!featherHangAnim.active) return;
  featherHangAnim.t += deltaTime * 1000;
  if (featherHangAnim.t >= FEATHER_HANG_MS) {
    featherHangAnim.active = false;
    featherHung = true;
    delete inventory.feather;
    ratFeatherThankQueued = true; // queues the thank-you line for the next time the rat is approached
    updateInventoryUI();
  }
}

// carved initials -- a small found-detail, only visible while the lamp
// is lit and nearby, matching the same discovery pattern as the
// feather rather than something you'd stumble on with the room lit
// normally. WS on the left, SW on the right, genuinely mirror-symmetric
// letters carved into the wood, drawn as real hand-carved strokes
// rather than typeset text.
const carvedInitialsSpot = { x: 900, y: 240 };
function drawHandwrittenW(ctx, x, y, s, jitter) {
  ctx.beginPath();
  ctx.moveTo(x - s, y - s * 0.5 + jitter[0]);
  ctx.lineTo(x - s * 0.5, y + s * 0.6 + jitter[1]);
  ctx.lineTo(x, y - s * 0.15 + jitter[2]);
  ctx.lineTo(x + s * 0.5, y + s * 0.6 + jitter[3]);
  ctx.lineTo(x + s, y - s * 0.5 + jitter[4]);
  ctx.stroke();
}
function drawHandwrittenS(ctx, x, y, s, jitter) {
  ctx.beginPath();
  ctx.moveTo(x + s * 0.55, y - s * 0.65 + jitter[0]);
  ctx.quadraticCurveTo(x - s * 0.6, y - s * 0.55 + jitter[1], x - s * 0.15, y + jitter[2]);
  ctx.quadraticCurveTo(x + s * 0.65, y + s * 0.45 + jitter[3], x - s * 0.5, y + s * 0.65 + jitter[4]);
  ctx.stroke();
}
// found map -- an abstract, hand-drawn parchment showing only the
// places you'd have actually walked through to get here (autumn, oak,
// the ratroom itself), deliberately not spring or clouds. Two more
// paths trail off toward the torn edges with smudged, mostly-illegible
// labels -- left open on purpose, no payoff written in yet.
const foundMapSpot = { x: 250, y: 100 };
function drawFoundMap(camX) {
  if (!lampLit) return;
  const playerScreenX = player.x + player.width / 2 - camX;
  const mx = foundMapSpot.x - camX, my = foundMapSpot.y;
  const dist = Math.hypot(mx - playerScreenX, my - (gy - player.y));
  if (dist > LAMP_LIGHT_RADIUS) return;

  ctx.save();
  ctx.translate(mx, my);

  // parchment background, slightly irregular edges
  ctx.fillStyle = "rgba(200,178,130,0.5)";
  ctx.beginPath();
  ctx.moveTo(-32, -22);
  ctx.lineTo(20, -25);
  ctx.lineTo(30, -8);
  ctx.lineTo(28, 24);
  ctx.lineTo(-10, 26);
  ctx.lineTo(-30, 14);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(120,90,50,0.6)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // burnt, charred edges -- darker, choppy jagged shapes eating into
  // the parchment's own border, plus a genuine tear across one corner
  ctx.fillStyle = "rgba(40,26,12,0.55)";
  ctx.beginPath();
  ctx.moveTo(-32, -22);
  ctx.lineTo(-24, -20);
  ctx.lineTo(-28, -16);
  ctx.lineTo(-20, -13);
  ctx.lineTo(-30, -6);
  ctx.lineTo(-32, -12);
  ctx.closePath();
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(-10, 26);
  ctx.lineTo(-4, 22);
  ctx.lineTo(2, 25);
  ctx.lineTo(6, 20);
  ctx.lineTo(12, 24);
  ctx.lineTo(28, 24);
  ctx.lineTo(26, 18);
  ctx.lineTo(14, 20);
  ctx.closePath();
  ctx.fill();
  // a real tear -- a jagged split with two slightly offset ragged edges
  ctx.strokeStyle = "rgba(20,13,6,0.7)";
  ctx.lineWidth = 1.6;
  ctx.beginPath();
  ctx.moveTo(-4, -18);
  ctx.lineTo(-1, -10);
  ctx.lineTo(-5, -4);
  ctx.lineTo(-2, 4);
  ctx.stroke();
  ctx.strokeStyle = "rgba(160,140,95,0.4)";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(-2, -18);
  ctx.lineTo(1, -10);
  ctx.lineTo(-3, -4);
  ctx.lineTo(0, 4);
  ctx.stroke();

  // torn top-right corner, hanging down and slightly rotated away
  // from the rest of the parchment
  ctx.save();
  ctx.translate(22, -16);
  ctx.rotate(0.35);
  ctx.fillStyle = "rgba(190,168,122,0.5)";
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(9, -2);
  ctx.lineTo(7, 8);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(120,90,50,0.5)";
  ctx.stroke();
  ctx.restore();

  // paths -- wobbly, hand-drawn lines connecting the three known spots
  ctx.strokeStyle = "rgba(90,64,32,0.6)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(-22, 8);
  ctx.quadraticCurveTo(-14, -2, -4, -6);
  ctx.quadraticCurveTo(6, -10, 10, 6);
  ctx.stroke();

  // three known locations -- small hand-drawn icons, not literal thumbnails
  ctx.fillStyle = "rgba(90,64,32,0.7)";
  // autumn -- simple tree
  ctx.beginPath();
  ctx.moveTo(-23, 9); ctx.lineTo(-21, 3); ctx.lineTo(-19, 9);
  ctx.closePath();
  ctx.fill();
  // oak -- small leaf/acorn shape
  ctx.beginPath();
  ctx.ellipse(-4, -7, 2.2, 3, 0.4, 0, Math.PI * 2);
  ctx.fill();
  // ratroom -- current location, marked with a small X
  ctx.strokeStyle = "rgba(150,40,30,0.7)";
  ctx.lineWidth = 1.2;
  ctx.beginPath();
  ctx.moveTo(8, 3); ctx.lineTo(12, 9);
  ctx.moveTo(12, 3); ctx.lineTo(8, 9);
  ctx.stroke();

  // two more paths trailing off toward the torn/worn edges, each with
  // a couple legible letters fading into a smudge -- no resolved
  // destination, deliberately
  ctx.strokeStyle = "rgba(90,64,32,0.45)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(10, 6);
  ctx.quadraticCurveTo(20, 14, 26, 20);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(-22, 8);
  ctx.quadraticCurveTo(-28, 16, -29, 22);
  ctx.stroke();

  ctx.font = "italic 5px Georgia, serif";
  ctx.fillStyle = "rgba(90,64,32,0.55)";
  ctx.fillText("Gr", 21, 22);
  ctx.fillStyle = "rgba(90,64,32,0.2)";
  ctx.fillText("\u2500\u2500\u2500", 27, 22);

  ctx.fillStyle = "rgba(90,64,32,0.55)";
  ctx.fillText("M\u2013", -33, 23);
  ctx.fillStyle = "rgba(90,64,32,0.2)";
  ctx.fillText("\u2500\u2500", -29, 26);

  // small compass rose, tucked in a corner -- a quiet old-map touch,
  // kept tiny so it doesn't compete with the deliberately basic feel
  ctx.save();
  ctx.translate(-24, -17);
  ctx.strokeStyle = "rgba(90,64,32,0.5)";
  ctx.lineWidth = 0.6;
  [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2].forEach((a, i) => {
    const len = i % 2 === 0 ? 4 : 2.5;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(Math.cos(a) * len, Math.sin(a) * len);
    ctx.stroke();
  });
  ctx.font = "italic 3.5px Georgia, serif";
  ctx.fillStyle = "rgba(90,64,32,0.5)";
  ctx.textAlign = "center";
  ctx.fillText("N", 0, -6);
  ctx.restore();

  ctx.restore();
}

// the recurring symbol -- an actual placed instance, lamp-gated like
// everything else here. The shape function itself was built earlier;
// this is where it's actually used for the first time.
const foundSymbolSpot = { x: 1000, y: 45 };
function drawFoundSymbol(camX) {
  if (!lampLit) return;
  const playerScreenX = player.x + player.width / 2 - camX;
  const sx = foundSymbolSpot.x - camX, sy = foundSymbolSpot.y;
  const dist = Math.hypot(sx - playerScreenX, sy - (gy - player.y));
  if (dist > LAMP_LIGHT_RADIUS) return;
  drawTeemingSymbol(ctx, sx, sy, 14, "rgba(220,190,150,0.6)");
}

function drawCarvedInitials(camX) {
  if (!lampLit) return;
  const playerScreenX = player.x + player.width / 2 - camX;
  const cx = carvedInitialsSpot.x - camX, cy = carvedInitialsSpot.y;
  const dist = Math.hypot(cx - playerScreenX, cy - (gy - player.y));
  if (dist > LAMP_LIGHT_RADIUS) return;

  ctx.save();
  ctx.translate(cx, cy);
  ctx.strokeStyle = "rgba(220,190,150,0.6)";
  ctx.lineWidth = 1.4;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  const s = 7;
  drawHandwrittenW(ctx, -18, 0, s, [-0.4, 0.6, -0.3, 0.5, -0.5]);
  drawHandwrittenS(ctx, -6, 0, s, [0.3, -0.4, 0.5, -0.3, 0.4]);
  drawHandwrittenS(ctx, 6, 0, s, [-0.3, 0.4, -0.5, 0.3, -0.4]);
  drawHandwrittenW(ctx, 18, 0, s, [0.4, -0.6, 0.3, -0.5, 0.5]);

  ctx.beginPath();
  ctx.moveTo(0, -5);
  ctx.lineTo(0, 5);
  ctx.stroke();
  ctx.restore();
}

function drawRatRoomArt(camX) {
  const px = ratRoomArtSpot.x - camX, py = ratRoomArtSpot.y;
  const w = ratRoomArtSpot.w, h = ratRoomArtSpot.h;
  const pad = 6;
  ctx.fillStyle = "#3a2818";
  ctx.fillRect(px - pad, py - pad, w + pad * 2, h + pad * 2);
  ctx.strokeStyle = "#5a4028";
  ctx.lineWidth = 1.5;
  ctx.strokeRect(px - pad + 3, py - pad + 3, w + pad * 2 - 6, h + pad * 2 - 6);
  if (ratRoomCheeseArt.complete && ratRoomCheeseArt.naturalWidth) {
    ctx.drawImage(ratRoomCheeseArt, px, py, w, h);
  }
}

// a small pressed leaf, pinned flat to the wall in the right-side
// cluster, same discovery pattern (lamp-lit, nearby) as everything else
// two daffodil varietals, repositioned below the snake so reaching
// them still requires a real jump, and clear of the symbol which they
// were previously crowding right next to
const pressedLeafSpots = [
  { x: 1155, y: 183, variant: "yellow" },
  { x: 1165, y: 195, variant: "white" }
];
function drawPressedLeaf(camX) {
  if (!lampLit) return;
  const playerScreenX = player.x + player.width / 2 - camX;
  pressedLeafSpots.forEach(spot => {
    const lx = spot.x - camX, ly = spot.y;
    const dist = Math.hypot(lx - playerScreenX, ly - (gy - player.y));
    if (dist > LAMP_LIGHT_RADIUS) return;
    ctx.save();
    ctx.translate(lx, ly);
    ctx.rotate(-0.1);
    // a pressed daffodil -- six outer tepals in a star arrangement,
    // plus the trumpet-shaped corona that actually defines a
    // daffodil, with a ruffled edge. Petal and corona colors vary by
    // variant for two genuinely distinct varietals.
    const petalColors = spot.variant === "white"
      ? ["rgba(235,230,215,0.42)", "rgba(240,238,228,0.4)"]
      : ["rgba(220,195,120,0.4)", "rgba(235,225,200,0.38)"];
    for (let i = 0; i < 6; i++) {
      const angle = (i / 6) * Math.PI * 2 - Math.PI / 2;
      ctx.save();
      ctx.rotate(angle);
      ctx.fillStyle = petalColors[i % 2];
      ctx.strokeStyle = "rgba(180,140,80,0.45)";
      ctx.lineWidth = 0.6;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(-3, -6, 0, -11);
      ctx.quadraticCurveTo(3, -6, 0, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, -1);
      ctx.lineTo(0, -10);
      ctx.stroke();
      ctx.restore();
    }
    ctx.fillStyle = spot.variant === "white" ? "rgba(220,175,70,0.5)" : "rgba(230,150,60,0.55)";
    ctx.beginPath();
    const coronaPoints = 10;
    for (let i = 0; i <= coronaPoints; i++) {
      const a = (i / coronaPoints) * Math.PI * 2;
      const r = 2.6 + Math.sin(a * 5) * 0.4;
      const px2 = Math.cos(a) * r, py2 = Math.sin(a) * r;
      if (i === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
    }
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(190,80,50,0.55)";
    ctx.lineWidth = 0.7;
    ctx.stroke();
    ctx.fillStyle = "rgba(150,140,130,0.5)";
    ctx.beginPath();
    ctx.arc(0, -11, 1, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  });
}

// little shelf for the high-up rat to perch on, matching its eye-pair
// position exactly so it visibly has something to sit on
// tiered reveal -- only tier 0 is visible from the ground (styled with
// enough contrast to actually register against the dark room, unlike
// the rest which blend into it almost entirely). Standing on a tier
// with the lamp lit reveals the next tier up, cascading as you climb,
// rather than everything being visible (or invisible) all at once.
const ratRoomHighShelves = [
  // left cluster -- leads up to the spider. Every shelf, including
  // this first one, is lamp-gated -- none are visible in the dark at
  // all. Heights recomputed again -- max jump height works out to
  // exactly 90 units (v0=12, gravity=0.8: v0^2/2g), and the previous
  // ~45-unit spacing meant a single full jump from ground could
  // overshoot tier 0 and land directly on tier 1. ~70-unit gaps now,
  // comfortably reachable from the tier below but not skippable from
  // ground, and still within the lamp's own 90-unit radius.
  { x: 170, y: 255, w: 32, tier: 0, cluster: "left" },
  { x: 195, y: 185, w: 30, tier: 1, cluster: "left", unlocked: false }, // spider's own shelf, offset from tier0 rather than stacked directly above it
  // right cluster -- ground shelf, then two middle shelves revealed
  // from it at slightly different heights for visual variety, then
  // the snake's own shelf pushed up a further, larger jump for real
  // height, then the marble beyond that. Snake's shelf widened so
  // part of it can stay bare -- somewhere for an uncoiled tail to rest.
  { x: 1000, y: 255, w: 32, tier: 0, cluster: "right", id: "right0" },
  { x: 1030, y: 185, w: 30, tier: 1, cluster: "right", unlocked: false, id: "right1a" },
  { x: 1080, y: 175, w: 28, tier: 1, cluster: "right", unlocked: false, id: "right1b" },
  { x: 1140, y: 85, w: 55, tier: 2, cluster: "right", unlocked: false, id: "snakeShelf" }, // snake's shelf, wider, and a full extra jump higher
  // safe branch -- reachable from tier1, but positioned to require an
  // actual double jump (245 height-above-ground: above the 215 a
  // single jump can reach from tier1's 125, within the ~265 a double
  // jump timed at the first jump's peak can reach). The marble now
  // depends specifically on this shelf, not any tier2 shelf, since
  // landing on the snake's shelf is meant to be a dead end that knocks
  // you back rather than a valid path forward.
  { x: 1195, y: 55, w: 26, tier: 2, cluster: "right", unlocked: false, id: "safeShelf", unlockFromId: "right1b" },
  { x: 1295, y: 100, w: 30, tier: 3, cluster: "right", unlocked: false, id: "marbleShelf", unlockFromId: "safeShelf" } // marble, one tier further up -- lowered from y:15, which put the player's head off the top of the canvas while standing on it. Moved lower and further right from the safe shelf, which was too crowded before -- verified still reachable via a real jump simulation.
];
function updateShelfTierUnlocks() {
  ratRoomHighShelves.forEach(shelf => {
    if (shelf.tier === 0 || shelf.unlocked) return;
    const prevTierShelves = shelf.unlockFromId
      ? ratRoomHighShelves.filter(s => s.id === shelf.unlockFromId)
      : ratRoomHighShelves.filter(s => s.cluster === shelf.cluster && s.tier === shelf.tier - 1);
    const onPrevTier = prevTierShelves.some(s => {
      const sTop = gy - s.y;
      return Math.abs(player.y - sTop) < 3 && player.x + player.width > s.x - s.w / 2 - 6 && player.x < s.x + s.w / 2 + 6;
    });
    if (onPrevTier && lampLit) shelf.unlocked = true;
  });
}
function drawRatRoomHighShelf(camX) {
  const playerScreenX = player.x + player.width / 2 - camX;
  ratRoomHighShelves.forEach(shelf => {
    const sx = shelf.x - camX, sy = shelf.y;
    const w = shelf.w;
    if (shelf.tier > 0 && !shelf.unlocked) return;
    if (!lampLit) return;
    const dist = Math.hypot(sx - playerScreenX, sy - (gy - player.y));
    if (dist > LAMP_LIGHT_RADIUS) return;
    if (shelf.id === "right0") {
      drawRaggedBookPile(camX);
      return;
    }
    ctx.fillStyle = "#4a3018";
    ctx.fillRect(sx - w / 2, sy, w, 5);
    // wood-grain streaks, varying shade, for a genuinely wood-like
    // surface instead of a flat rectangle
    ctx.strokeStyle = "rgba(90,60,30,0.4)";
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 3; i++) {
      const gy2 = sy + 1 + i * 1.4;
      ctx.beginPath();
      ctx.moveTo(sx - w / 2 + 2, gy2);
      ctx.quadraticCurveTo(sx, gy2 + 0.5, sx + w / 2 - 2, gy2 - 0.3);
      ctx.stroke();
    }
    // lighter top-edge highlight for a beveled look
    ctx.strokeStyle = "rgba(160,120,70,0.35)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(sx - w / 2, sy + 0.5);
    ctx.lineTo(sx + w / 2, sy + 0.5);
    ctx.stroke();
    ctx.strokeStyle = "#2e1c0e";
    ctx.lineWidth = 1;
    ctx.strokeRect(sx - w / 2, sy, w, 5);
  });
}

// spider -- hangs from a web near the left shelf, only actually
// revealed once the player has climbed up and is standing near it
// with the lamp lit, same discovery pattern as everything else here.
// The shelf itself is always visible from ground, so it invites the
// jump on its own; the spider is the payoff for actually taking it.
const spiderSpot = { x: 140, y: 175 };
const spiderState = { legDanceT: 0, legDanceNextAt: 1200 + Math.random() * 2000, legDancing: 0 };
function drawSpider(camX) {
  if (!lampLit) return;
  const playerScreenX = player.x + player.width / 2 - camX;
  const sx = spiderSpot.x - camX, sy = spiderSpot.y;
  const dist = Math.hypot(sx - playerScreenX, sy - (gy - player.y));
  if (dist > LAMP_LIGHT_RADIUS) return;

  // proper web near the ceiling -- radial spokes plus concentric
  // rings forming an actual web pattern, positioned above where the
  // spider hangs rather than spokes running directly to it (which
  // read as a tangle of loose threads rather than a web)
  const webCenterY = 110;
  const webR = 34;
  ctx.strokeStyle = "rgba(210,200,180,0.35)";
  ctx.lineWidth = 0.6;
  const spokeCount = 7;
  const spokeOffset = 0.227; // 13 degrees -- the offset that maximizes every spoke's distance from exactly horizontal, computed directly rather than guessed
  for (let i = 0; i < spokeCount; i++) {
    const angle = (i / spokeCount) * Math.PI * 2 + spokeOffset;
    ctx.beginPath();
    ctx.moveTo(sx, webCenterY);
    ctx.lineTo(sx + Math.cos(angle) * webR, webCenterY + Math.sin(angle) * webR);
    ctx.stroke();
  }
  for (let ring = 1; ring <= 3; ring++) {
    const r = (webR / 3) * ring;
    ctx.beginPath();
    for (let i = 0; i <= spokeCount; i++) {
      const angle = (i / spokeCount) * Math.PI * 2 + spokeOffset;
      const px2 = sx + Math.cos(angle) * r, py2 = webCenterY + Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
    }
    ctx.stroke();
  }
  // single thread down from the web's own center to the spider
  ctx.beginPath();
  ctx.moveTo(sx, webCenterY);
  ctx.lineTo(sx, sy);
  ctx.stroke();

  const danceP = spiderState.legDancing > 0 ? Math.sin(Math.min(1, spiderState.legDancing) * Math.PI * 3) : 0;
  ctx.save();
  ctx.translate(sx, sy);
  ctx.scale(1.7, 1.7); // larger than normal size, dangling and visibly bigger than the room's other creatures

  // legs, four per side, each with its own slight timing offset so
  // the dance reads as multiple legs moving rather than one uniform wiggle
  ctx.strokeStyle = "#2a221c";
  ctx.lineWidth = 1;
  for (let side = -1; side <= 1; side += 2) {
    for (let i = 0; i < 4; i++) {
      const baseAngle = side * (0.5 + i * 0.35);
      const legPhase = Math.sin(Math.min(1, spiderState.legDancing) * Math.PI * 3 - i * 0.5);
      const wiggle = spiderState.legDancing > 0 ? legPhase * 0.28 * (i % 2 === 0 ? 1 : -1) : 0;
      const angle = baseAngle + wiggle;
      const legLen = 7;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.quadraticCurveTo(Math.sin(angle) * legLen * 0.6, Math.cos(angle) * legLen * 0.5 + 2, Math.sin(angle) * legLen, Math.cos(angle) * legLen + 3);
      ctx.stroke();
    }
  }

  // body -- small round abdomen, no head distinction needed at this size
  ctx.fillStyle = "#3a3028";
  ctx.beginPath();
  ctx.ellipse(0, 0, 4.5, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // glowing eyes, matching the room's established motif
  ctx.fillStyle = "rgba(220,190,120,0.9)";
  ctx.beginPath();
  ctx.arc(-1.4, -1, 0.9, 0, Math.PI * 2);
  ctx.arc(1.4, -1, 0.9, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}
function updateSpider(deltaTime) {
  const dtMs = deltaTime * 1000;
  spiderState.legDanceT += dtMs;
  if (spiderState.legDanceT >= spiderState.legDanceNextAt) {
    spiderState.legDancing = 0.001;
    spiderState.legDanceT = 0;
    spiderState.legDanceNextAt = 1200 + Math.random() * 2000;
  }
  if (spiderState.legDancing > 0) {
    spiderState.legDancing += dtMs / 700;
    if (spiderState.legDancing >= 1) spiderState.legDancing = 0;
  }
}

// snake -- coiled on the middle shelf of the right hop-sequence, so
// its in the actual path rather than something seen from below. Tail
// wave reacts to the player being nearby rather than firing on a
// blind timer regardless of whether anyone's there. Greeting and the
// reveal of what it's hoarding are one slow combined beat, not two
// separate triggers.
const snakeSpot = { x: 1125, y: 78 };
const snakeState = { tailWaveT: 0, hissing: 0, hissT: 0 };
const snakeDialogue = { active: false, index: 0, t: 0, everShownThisVisit: false };
const snakeLines = [
  ["Sssomeone'sss curioussss down here."],
  ["Thisss one'sss mine. Found it firssst."]
];
function drawSnake(camX) {
  if (!lampLit) return;
  const playerScreenX = player.x + player.width / 2 - camX;
  const nx = snakeSpot.x - camX, ny = snakeSpot.y;
  const dist = Math.hypot(nx - playerScreenX, ny - (gy - player.y));
  if (dist > LAMP_LIGHT_RADIUS) return;

  // single continuous frequency, amplitude smoothly interpolated by
  // actual distance rather than hard-switching between two entirely
  // different sine formulas -- the old version jumped 11-14 units
  // every time the proximity threshold was crossed, which happened
  // rapidly during a double jump near the snake and read as erratic
  const proximityP = Math.max(0, Math.min(1, (90 - dist) / 90));
  const tailAmplitude = 3 + (14 - 3) * proximityP;
  const tailWave = Math.sin(snakeState.tailWaveT * 0.004) * tailAmplitude;

  ctx.save();
  ctx.translate(nx, ny);
  ctx.scale(1.9, 1.9);

  // single continuous body -- a spiral coil that smoothly becomes the
  // tail, one connected tapered path rather than separate arcs and a
  // disjointed line. Built as points, walked with overlapping tapered
  // segments so width actually varies along the body's real length.
  const points = [];
  const coilTurns = 1.6, coilSteps = 44;
  for (let i = 0; i <= coilSteps; i++) {
    const t = i / coilSteps;
    const angle = 0.3 + t * Math.PI * 2 * coilTurns;
    const r = 4 + t * 4.7;
    const mound = (1 - t) * 3.2; // tallest at the center, flattens toward the outer edge -- the pearl peeks out from the top of this
    points.push({ x: Math.cos(angle) * r, y: 3 - mound + Math.sin(angle) * r * 0.32 });
  }
  // tail continues directly from the coil's own last point, same
  // curve family, so there's no seam between coil and tail
  const tailStart = points[points.length - 1];
  const tailSteps = 28;
  for (let i = 1; i <= tailSteps; i++) {
    const t = i / tailSteps;
    const wave = Math.sin(t * Math.PI * 1.4) * (tailWave * 0.15 + 3) * t;
    points.push({
      x: tailStart.x + t * (34 + tailWave * 1.2),
      y: tailStart.y + wave - t * 2
    });
  }

  const bodyColor = "#2e5c2a";
  const stripeColor = "#d8cf8a";
  const bellyColor = "#5c7842";
  ctx.lineCap = "round";

  // width tapers -- thin at the tail tip, thickest through the
  // mid-body, narrowing again toward the neck
  const widthAt = (t) => {
    if (t < 0.15) return 2.2 + t / 0.15 * 1.8;
    if (t < 0.75) return 4.0;
    return 4.0 - (t - 0.75) / 0.25 * 2.6;
  };

  for (let i = 0; i < points.length - 1; i++) {
    const t = i / (points.length - 1);
    const p0 = points[i], p1 = points[i + 1];
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = widthAt(t);
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y);
    ctx.lineTo(p1.x, p1.y);
    ctx.stroke();
  }
  // a soft lighter belly stripe down the center for real dimension,
  // not just a flat tube
  for (let i = 0; i < points.length - 1; i++) {
    const t = i / (points.length - 1);
    if (widthAt(t) < 2.5) continue;
    const p0 = points[i], p1 = points[i + 1];
    ctx.strokeStyle = bellyColor;
    ctx.lineWidth = widthAt(t) * 0.35;
    ctx.beginPath();
    ctx.moveTo(p0.x, p0.y + widthAt(t) * 0.2);
    ctx.lineTo(p1.x, p1.y + widthAt(t) * 0.2);
    ctx.stroke();
  }
  // garter stripes, offset perpendicular to the path's actual local
  // direction at each point so they genuinely follow the coil and
  // tail's curve instead of a flat, direction-blind y-offset
  ctx.strokeStyle = stripeColor;
  ctx.lineWidth = 0.2;
  [-1, 1].forEach(side => {
    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const t = i / (points.length - 1);
      const w = widthAt(t) * 0.55;
      const p0 = points[Math.max(0, i - 1)], p1 = points[Math.min(points.length - 1, i + 1)];
      const dx = p1.x - p0.x, dy = p1.y - p0.y;
      const len = Math.hypot(dx, dy) || 1;
      const perpX = -dy / len * w * side, perpY = dx / len * w * side;
      const px2 = points[i].x + perpX, py2 = points[i].y + perpY;
      if (i === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
    }
    ctx.stroke();
  });

  // scale texture -- small diagonal tick marks along both edges of
  // the body, for real surface detail rather than a flat smooth tube
  ctx.strokeStyle = "rgba(20,40,15,0.35)";
  ctx.lineWidth = 0.4;
  for (let i = 2; i < points.length - 1; i += 2) {
    const t = i / (points.length - 1);
    const w = widthAt(t) * 0.5;
    if (w < 1) continue;
    const p0 = points[Math.max(0, i - 1)], p1 = points[Math.min(points.length - 1, i + 1)];
    const dx = p1.x - p0.x, dy = p1.y - p0.y;
    const len = Math.hypot(dx, dy) || 1;
    const perpX = -dy / len, perpY = dx / len;
    [-1, 1].forEach(side => {
      const baseX = points[i].x + perpX * w * side, baseY = points[i].y + perpY * w * side;
      ctx.beginPath();
      ctx.moveTo(baseX, baseY);
      ctx.lineTo(baseX + dx / len * 1.4, baseY + dy / len * 1.4 - side * 0.3);
      ctx.stroke();
    });
  }

  // the small hoarded object, drawn after the coil so it's never
  // covered by the spiral lines passing near the center -- genuinely
  // sitting within the coil now rather than hidden behind it
  ctx.fillStyle = "#8ac8d8";
  ctx.beginPath();
  ctx.arc(0, -1, 3.4, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.beginPath();
  ctx.arc(-0.9, -1.9, 0.9, 0, Math.PI * 2);
  ctx.fill();
  // a little more of the coil now passes over the pearl's own bottom
  // edge, so the body genuinely wraps over it rather than the pearl
  // floating entirely in front of every coil line
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.arc(0, -1, 3.4, Math.PI * 0.15, Math.PI * 0.85);
  ctx.closePath();
  ctx.fill();

  // head, extended out from the coil's own innermost point rather than
  // sitting almost on top of it -- a visible neck connects the two, so
  // the head reads as a distinct shape sticking out and up, not
  // blended into the body mass
  const neckBase = points[0];
  const headPt = { x: neckBase.x - 5, y: neckBase.y - 3 };
  ctx.strokeStyle = bodyColor;
  ctx.lineWidth = widthAt(0) * 0.9;
  ctx.lineCap = "round";
  ctx.beginPath();
  ctx.moveTo(neckBase.x, neckBase.y);
  ctx.lineTo(headPt.x, headPt.y);
  ctx.stroke();
  ctx.fillStyle = bodyColor;
  ctx.beginPath();
  ctx.ellipse(headPt.x - 1.5, headPt.y - 1, 3.5, 2.6, -0.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(220,190,120,0.9)";
  ctx.beginPath();
  ctx.arc(headPt.x - 2.5, headPt.y - 1.5, 0.8, 0, Math.PI * 2);
  ctx.arc(headPt.x - 0.5, headPt.y - 2, 0.8, 0, Math.PI * 2);
  ctx.fill();
  // hiss reaction -- an open-mouth wedge and a couple sharp motion
  // lines, only during the brief window right after something lands
  // on its shelf, so the dead-end reads as a real, sudden reaction
  if (snakeState.hissing > 0) {
    ctx.fillStyle = "#8a2818";
    ctx.beginPath();
    ctx.moveTo(headPt.x - 4, headPt.y - 1);
    ctx.lineTo(headPt.x - 9, headPt.y - 3);
    ctx.lineTo(headPt.x - 9, headPt.y + 1);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = "rgba(220,190,120,0.7)";
    ctx.lineWidth = 0.6;
    for (let i = 0; i < 3; i++) {
      const a = -0.5 + i * 0.4;
      ctx.beginPath();
      ctx.moveTo(headPt.x - 9 + Math.cos(a) * 1, headPt.y - 1 + Math.sin(a) * 1);
      ctx.lineTo(headPt.x - 9 + Math.cos(a) * 4, headPt.y - 1 + Math.sin(a) * 4);
      ctx.stroke();
    }
  }
  // forked tongue flick -- enlarged and much more intensely colored,
  // and only visible for a brief window periodically, so it reads as
  // an actual flick rather than a static feature always sitting there
  const tongueCycle = snakeState.tailWaveT % 2500;
  if (tongueCycle < 400) {
    const flickP = Math.sin((tongueCycle / 400) * Math.PI); // eases in and out rather than a hard on/off
    ctx.strokeStyle = "#ff2418";
    ctx.lineWidth = 0.7;
    ctx.beginPath();
    ctx.moveTo(headPt.x - 5, headPt.y - 0.5);
    ctx.lineTo(headPt.x - 5 - 4.5 * flickP, headPt.y - 0.5 + 0.4 * flickP);
    ctx.moveTo(headPt.x - 5 - 4.5 * flickP, headPt.y - 0.5 + 0.4 * flickP);
    ctx.lineTo(headPt.x - 5 - 6.5 * flickP, headPt.y - 0.5 + 0.4 * flickP - 1.2 * flickP);
    ctx.moveTo(headPt.x - 5 - 4.5 * flickP, headPt.y - 0.5 + 0.4 * flickP);
    ctx.lineTo(headPt.x - 5 - 6.5 * flickP, headPt.y - 0.5 + 0.4 * flickP + 1.2 * flickP);
    ctx.stroke();
  }

  ctx.restore();

  if (snakeDialogue.active) {
    const beat = snakeLines[snakeDialogue.index];
    drawFittedSpeechBubble(ctx, nx, ny - 30, beat);
  }
}
const SNAKE_LINE_MS = 2600; // slow enough to actually read each line, auto-advancing rather than requiring a press that conflicts with holding space for the lamp
function updateSnake(deltaTime) {
  snakeState.tailWaveT += deltaTime * 1000;

  if (snakeDialogue.active) {
    snakeDialogue.t += deltaTime * 1000;
    if (snakeDialogue.t >= SNAKE_LINE_MS) {
      snakeDialogue.t = 0;
      snakeDialogue.index++;
      if (snakeDialogue.index >= snakeLines.length) snakeDialogue.active = false;
    }
    return;
  }
  // auto-triggers on proximity with the lamp lit -- no space press
  // needed, since requiring one would conflict with holding space
  // continuously just to keep the lamp lit while approaching
  if (!snakeDialogue.everShownThisVisit && isPlayerNear(snakeSpot.x, gy - snakeSpot.y, 70, 60, 30) && lampLit) {
    snakeDialogue.active = true;
    snakeDialogue.index = 0;
    snakeDialogue.t = 0;
    snakeDialogue.everShownThisVisit = true;
  }
}

// paper airplane -- the payoff waiting at the top of the giant capstone
// book pile, after the whole long jump run
const paperAirplaneSpot = { x: 5436, y: 240, collected: false };
function drawPaperAirplane(camX) {
  if (paperAirplaneSpot.collected) return;
  const ax0 = paperAirplaneSpot.x - camX, ay0 = gy - paperAirplaneSpot.y;
  const bob = Math.sin(performance.now() * 0.0018) * 3;
  const drift = Math.sin(performance.now() * 0.001) * 4;
  const ax = ax0 + drift, ay = ay0 - bob;
  ctx.save();
  ctx.translate(ax, ay);
  ctx.rotate(Math.sin(performance.now() * 0.0009) * 0.15);
  ctx.fillStyle = "#f0e8d8";
  ctx.beginPath();
  ctx.moveTo(9, 0);
  ctx.lineTo(-7, -5);
  ctx.lineTo(-3, 0);
  ctx.lineTo(-7, 5);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(0,0,0,0.15)";
  ctx.lineWidth = 0.6;
  ctx.stroke();
  ctx.strokeStyle = "rgba(0,0,0,0.2)";
  ctx.beginPath();
  ctx.moveTo(9, 0);
  ctx.lineTo(-3, 0);
  ctx.stroke();
  ctx.restore();
}
// giant pile collapse -- a one-time scripted sequence triggered by
// picking up the paper airplane. Beat, then wobble, then the whole
// pile drops out from under the player and they fall together with
// it, landing on a permanently squat, collapsed version. Exempt from
// the general fall-punishment system since this is a reward moment,
// not a failure.
const giantPileCollapse = { phase: "idle", t: 0 }; // idle -> beat -> wobble -> falling -> settled
const GIANT_PILE_X = 5436;
const COLLAPSE_BEAT_MS = 500;
const COLLAPSE_WOBBLE_MS = 3200;
const COLLAPSED_HEIGHT = 25;
const scatteredBooksField = []; // permanent -- populated once when the giant pile settles, never re-piled
function generateScatteredBooksField(centerX) {
  const bookCount = 36;
  const seed = 228; // matches the giant pile's own seed, so starting stack heights line up with how it actually looked
  for (let i = 0; i < bookCount; i++) {
    const spread = 170; // wide spread across the ground, not a tidy small pile
    const ox = (Math.sin(i * 12.9898) * 43758.5453 % 1) * spread;
    const oySeed = (Math.sin(i * 78.233 + 1) * 12345.6789 % 1);
    const oy = Math.abs(oySeed) * 6; // slight vertical variation, mostly flat on the ground
    const rotHash = Math.sin(i * 39.346 + 2) * 6543.21 % 1;
    const rotBase = rotHash > 0 ? 0 : Math.PI; // lying flat, either right-side-up or upside-down -- not standing on its spine
    const rot = rotBase + rotHash * 0.35; // small deviation for natural messiness, never far from horizontal
    const isLong = i % 4 === 0;
    const w = isLong ? 30 + (i % 10) : 16 + (i % 8);
    const h = 5 + (i % 3);
    // this book's original position in the stack, before the collapse --
    // spread evenly across the piles full real height range (0 to its
    // actual peak), not just the topmost portion, so books genuinely
    // fall from where they actually sat rather than all clustering near
    // the top the instant the fall animation begins
    const startY = (i / (bookCount - 1)) * 235;
    const startRot = (((seed + i * 7) % 36) - 18) / 32;
    const startDx = (((seed + i * 4) % 6) - 3) * 1.8;
    scatteredBooksField.push({
      x: centerX + ox,
      y: oy,
      rot,
      w,
      h,
      color: pileColors[i % pileColors.length],
      startX: centerX + startDx,
      startY,
      startRot,
      fallDelay: (i * 17) % 200 // staggers when each book starts falling, for a real cascade rather than everything dropping in lockstep -- kept modest so books don't sit visibly frozen for too long at the start
    });
  }
}
function drawScatteredBooksField(camX) {
  scatteredBooksField.forEach(book => {
    ctx.save();
    ctx.translate(book.x - camX, gy - book.y);
    ctx.rotate(book.rot);
    ctx.fillStyle = book.color;
    ctx.fillRect(-book.w / 2, -book.h / 2, book.w, book.h);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(-book.w / 2, -book.h / 2, book.w, book.h);
    ctx.restore();
  });
}

const COLLAPSE_FALL_ESTIMATE_MS = 950; // matches the actual measured fall duration (~1024ms) with a small safety margin, so books finish their own animation just before the player lands, not mid-fall
function drawFallingBooks(camX) {
  scatteredBooksField.forEach(book => {
    const localT = giantPileCollapse.t - book.fallDelay;
    const rawP = Math.max(0, Math.min(1, localT / (COLLAPSE_FALL_ESTIMATE_MS - book.fallDelay)));
    const eased = rawP * rawP; // accelerating, like something actually falling under gravity
    const x = book.startX + (book.x - book.startX) * eased;
    const y = book.startY + (book.y - book.startY) * eased;
    const tumble = (1 - eased) * 4; // extra spin while still falling, settles out as it lands
    const rot = book.startRot + (book.rot - book.startRot) * eased + tumble;
    ctx.save();
    ctx.translate(x - camX, gy - y);
    ctx.rotate(rot);
    ctx.fillStyle = book.color;
    ctx.fillRect(-book.w / 2, -book.h / 2, book.w, book.h);
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 1;
    ctx.strokeRect(-book.w / 2, -book.h / 2, book.w, book.h);
    ctx.restore();
  });
}

function startGiantPileCollapse() {
  giantPileCollapse.phase = "beat";
  giantPileCollapse.t = 0;
  player.lastPileX = null; // scripted fall -- exempt from the fall-punishment system
}

function updateGiantPileCollapse(deltaTime) {
  if (giantPileCollapse.phase === "idle") return;
  const dtMs = deltaTime * 1000;
  giantPileCollapse.t += dtMs;

  if (giantPileCollapse.phase === "beat" && giantPileCollapse.t >= COLLAPSE_BEAT_MS) {
    giantPileCollapse.phase = "wobble";
    giantPileCollapse.t = 0;
  } else if (giantPileCollapse.phase === "wobble" && giantPileCollapse.t >= COLLAPSE_WOBBLE_MS) {
    giantPileCollapse.phase = "falling";
    giantPileCollapse.t = 0;
    const giantPileIdx = bookPiles.findIndex(p => p.x === GIANT_PILE_X);
    if (giantPileIdx !== -1) {
      generateScatteredBooksField(GIANT_PILE_X);
      bookPiles.splice(giantPileIdx, 1); // no longer a climbable pile -- books are permanently scattered on the ground instead, animated falling there during this phase
    }
    player.lastPileX = null; // re-clear in case it got set again during the wobble
  } else if (giantPileCollapse.phase === "falling" && player.y <= 0 && player.vy === 0) {
    giantPileCollapse.phase = "settled";
  }
}

function updatePaperAirplane() {
  if (paperAirplaneSpot.collected) return;
  if (keys.spaceJustPressed && isPlayerNear(paperAirplaneSpot.x, paperAirplaneSpot.y, 20, 18, 15)) {
    paperAirplaneSpot.collected = true;
    inventory.paperAirplane = (inventory.paperAirplane || 0) + 1;
    touchInventoryOrder("paperAirplane");
    updateInventoryUI();
    startCollectAnimation({ x: paperAirplaneSpot.x, y: paperAirplaneSpot.y, size: 7, rotation: 0 }, "paperAirplane");
    startGiantPileCollapse();
  }
}

// shiny marble -- the payoff for hopping all the way across the right
// shelf sequence, past the snake, to the far shelf
const marbleSpot = { x: 1295, y: 93, collected: false };
function drawMarble(camX) {
  if (marbleSpot.collected || !lampLit) return;
  const playerScreenX = player.x + player.width / 2 - camX;
  const mx0 = marbleSpot.x - camX, my0 = marbleSpot.y;
  const dist = Math.hypot(mx0 - playerScreenX, my0 - (gy - player.y));
  if (dist > LAMP_LIGHT_RADIUS) return;
  const twinkle = 0.7 + 0.3 * Math.sin(performance.now() * 0.003);
  const bob = Math.sin(performance.now() * 0.0016) * 2.5; // gentle float -- motion catches the eye more than alpha alone
  const mx = mx0, my = my0 - bob;
  ctx.save();
  // soft glow halo behind it
  const glowGrad = ctx.createRadialGradient(mx, my, 0, mx, my, 9);
  glowGrad.addColorStop(0, `rgba(200,120,160,${0.35 * twinkle})`);
  glowGrad.addColorStop(1, "rgba(200,120,160,0)");
  ctx.fillStyle = glowGrad;
  ctx.beginPath();
  ctx.arc(mx, my, 9, 0, Math.PI * 2);
  ctx.fill();
  ctx.globalAlpha = twinkle;
  ctx.fillStyle = "#c85a8a";
  ctx.beginPath();
  ctx.arc(mx, my, 4.2, 0, Math.PI * 2);
  ctx.fill();
  // rotating sparkle highlight rather than one static dot -- catches
  // the eye as something alive, not just glinting in place
  const sparkleAngle = performance.now() * 0.0012;
  ctx.fillStyle = "rgba(255,255,255,0.7)";
  ctx.beginPath();
  ctx.arc(mx + Math.cos(sparkleAngle) * 1.6, my + Math.sin(sparkleAngle) * 1.6, 1.3, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,0.4)";
  ctx.beginPath();
  ctx.arc(mx + Math.cos(sparkleAngle + Math.PI) * 1.6, my + Math.sin(sparkleAngle + Math.PI) * 1.6, 0.7, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}
function updateMarble() {
  if (marbleSpot.collected || !lampLit) return;
  if (keys.spaceJustPressed && isPlayerNear(marbleSpot.x, gy - marbleSpot.y, 18, 15, 12)) {
    marbleSpot.collected = true;
    inventory.marble = (inventory.marble || 0) + 1;
    touchInventoryOrder("marble");
    updateInventoryUI();
    startCollectAnimation({ x: marbleSpot.x, y: gy - marbleSpot.y, size: 5, rotation: 0 }, "marble");
  }
}


// lamp lighting -- select the lamp like any other held item, then hold
// space while in the rat room to light it. Turns off the instant space
// is released, rather than staying lit -- more interactive that way.
// Small radius on purpose, so actually seeing the room means moving
// around with it rather than lighting it once and standing still.
let lampLit = false;
let lampEverUsedInRatroom = false; // once the lamp has actually been lit here, it stops leaving the room at all -- no longer just deselected on exit, never carried up in the first place
const LAMP_LIGHT_RADIUS = 90;
function updateLampLighting() {
  lampLit = currentScene === "ratroom" && heldItem === "lamp" && keys.space;
  if (lampLit) lampEverUsedInRatroom = true;
}
// individual hoppable steps -- computed once from the same top/bottom
// points the visual stringer uses, so drawing and collision never drift
const ratRoomStairs = (() => {
  const topX = 400, topY = 20;
  const bottomX = 400 - 90, bottomY = gy - 10;
  const stepCount = 8;
  const steps = [];
  for (let i = 0; i <= stepCount; i++) {
    const p = i / stepCount;
    const sx = topX + (bottomX - topX) * p;
    const sy = topY + (bottomY - topY) * p;
    steps.push({ x: sx, heightAboveGround: gy - sy });
  }
  return steps;
})();


function drawRatRoomScene(camX) {
  ctx.fillStyle = "#100a06";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  drawRatRoomHighShelf(camX);
  drawSpider(camX);
  drawSnake(camX);
  drawJoshuaTree(camX);
  drawFireflies(camX);
  drawDustMotes(camX);
  drawMoth(camX);
  drawMarble(camX);
  drawRatRoomEyes(camX);
  drawRatRoomArt(camX);
  drawPressedLeaf(camX);
  drawCarvedInitials(camX);
  drawFoundSymbol(camX);
  drawFoundMap(camX);
  drawFeatherHangSpot(camX);

  const stairTopX = ratRoomStairsTop.x - camX, stairTopY = ratRoomStairsTop.y;

  // light shaft spilling down from the opening above, widest at the top
  const shaft = ctx.createLinearGradient(0, stairTopY - 10, 0, stairTopY + 140);
  shaft.addColorStop(0, "rgba(220,190,140,0.55)");
  shaft.addColorStop(1, "rgba(220,190,140,0)");
  ctx.fillStyle = shaft;
  ctx.beginPath();
  ctx.moveTo(stairTopX - 30, stairTopY - 10);
  ctx.lineTo(stairTopX + 30, stairTopY - 10);
  ctx.lineTo(stairTopX + 70, stairTopY + 140);
  ctx.lineTo(stairTopX - 70, stairTopY + 140);
  ctx.closePath();
  ctx.fill();

  // the opening itself -- a small bright patch at the very top
  ctx.fillStyle = "#e8d9b8";
  ctx.beginPath();
  ctx.ellipse(stairTopX, stairTopY - 6, 26, 8, 0, 0, Math.PI * 2);
  ctx.fill();

  // old wooden stairs -- a real diagonal stringer, with individual
  // hoppable step-blocks (not just tick marks on a line)
  ctx.strokeStyle = "#2e1c10";
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.moveTo(stairTopX, stairTopY + 6);
  ctx.lineTo(ratRoomStairs[ratRoomStairs.length - 1].x - camX, gy - 10);
  ctx.stroke();

  ratRoomStairs.forEach((step, i) => {
    const sx = step.x - camX, sy = gy - step.heightAboveGround;
    const stepW = 26, stepH = 7;
    // shadow/depth beneath the step
    ctx.fillStyle = "#241608";
    ctx.fillRect(sx - stepW / 2, sy + 1, stepW, stepH);
    // the step surface itself
    ctx.fillStyle = "#6a4a28";
    ctx.fillRect(sx - stepW / 2, sy - stepH, stepW, stepH);
    ctx.fillStyle = "#5a3a1c";
    ctx.fillRect(sx - stepW / 2, sy - 2, stepW, 2);
    ctx.strokeStyle = "#3a2410";
    ctx.lineWidth = 1;
    ctx.strokeRect(sx - stepW / 2, sy - stepH, stepW, stepH);
  });

  // floor
  ctx.fillStyle = "#1a1208";
  ctx.fillRect(0, gy, canvas.width, canvas.height - gy);

  drawHayGroundCover(camX);
  drawHayStrays(camX);
  drawHayPiles(camX);
  drawNestMaterials(camX);
  drawHayOverHayScraps(camX);
  drawRatRoomFeather(camX);
  drawRatFeedBowl(camX);
  if (acornFeedAnim.active) {
    const pos = getAcornFeedAnimPos();
    drawAcornShape(ctx, pos.x - camX, gy - pos.heightAboveGround, 6, pos.x * 0.05);
  }
  drawRatNPC(camX);

  if (ratDialogue.active) {
    const beat = ratDialogue.lines[ratDialogue.index];
    const isLast = ratDialogue.index === ratDialogue.lines.length - 1;
    const displayLines = isLast ? beat : [...beat.slice(0, -1), beat[beat.length - 1] + "..."];
    drawFittedSpeechBubble(ctx, ratNPC.x - camX - 10, gy - 120, displayLines);
  }

  if (lampLit) {
    const px = player.x + player.width / 2 - camX;
    const py = gy - player.y - 20;
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    const glow = ctx.createRadialGradient(px, py, 0, px, py, LAMP_LIGHT_RADIUS);
    glow.addColorStop(0, "rgba(255, 210, 140, 0.55)");
    glow.addColorStop(0.6, "rgba(220, 170, 100, 0.25)");
    glow.addColorStop(1, "rgba(220, 170, 100, 0)");
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(px, py, LAMP_LIGHT_RADIUS, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

// messy hay piles, splattered across the floor -- individual straw
// pieces much larger than autumn's subtle background hay, clustered
// unevenly rather than neat bundles
const hayPiles = [
  { x: 150, seed: 41, count: 8 },
  { x: 260, seed: 3, count: 9 },
  { x: 410, seed: 53, count: 6 },
  { x: 500, seed: 17, count: 10 },
  { x: 640, seed: 29, count: 7 },
  { x: 720, seed: 61, count: 8 }
];

const ratNPC = { x: 460, tailSwayT: 0, talkedTo: false, facingRight: false, fed: false };

// dialogue system -- space near the rat starts it, space again advances
// through each beat, closes automatically after the last line. Every
// line that isn't the final one in its sequence gets '...' appended
// automatically at render time, not typed into the text itself.
const ratGreetingLines = [
  ["Well, hello there, feller!", "Not much to look at, I know.", "Don't mind the eyes -- they're just curious, same as you."],
  ["You wouldn't happen to have anything... nutty on you?", "Small, hard little things -- I'm not picky."]
];
const ratReturnGreetingLines = [
  ["Good to see you again, feller!"]
];
const ratFeatherThankLines = [
  ["Oh, thank you for the decoration!", "Feel free to look around a bit more, if you like."]
];
const ratDialogue = {
  active: false,
  index: 0,
  lines: ratGreetingLines
};

let featherHung = false;
// suppresses the generic "good to see you again" greeting for the
// rest of the current visit once something more specific has already
// happened (like just hanging the feather) -- resets when the player
// actually leaves ratroom and comes back, so a genuine return visit
// still gets the normal greeting
let ratDialogueRestSuppressed = false;
let ratFeatherThankQueued = false; // set true the moment the feather is hung, shows once then clears
const ratFeatherLines = [
  ["Oh! Oh my.", "Is that... a real feather?"],
  ["Wow, a beautiful feather! I've been hoping to find one like that.", "Put it in that jar right there."]
];

function startRatDialogue() {
  if (ratFeatherThankQueued) {
    ratDialogue.active = true;
    ratDialogue.index = 0;
    ratDialogue.lines = ratFeatherThankLines.slice();
    ratFeatherThankQueued = false;
    ratDialogueRestSuppressed = true; // shown for this visit -- no need to repeat if approached again
    ratNPC.talkedTo = true;
    return;
  }
  if (!(carriedFeather && !featherHung) && ratDialogueRestSuppressed) {
    return; // nothing new to say this visit -- already had a meaningful moment, skip the redundant greeting
  }
  ratDialogue.active = true;
  ratDialogue.index = 0;
  if (carriedFeather && !featherHung) {
    ratDialogue.lines = ratFeatherLines.slice();
  } else {
    ratDialogue.lines = (ratNPC.fed ? ratReturnGreetingLines : ratGreetingLines).slice();
    ratDialogueRestSuppressed = true; // greeted for this visit -- no need to repeat if approached again
  }
  ratNPC.talkedTo = true;
}

// acorn feed animation -- three bounces (decreasing height) from the
// player's position to the bowl, then a brief settle pause before the
// grateful dialogue is allowed to advance
const acornFeedAnim = {
  active: false,
  t: 0,
  startX: 0,
  startY: 0,
  bowlX: 0,
  bowlY: 0,
  segments: [] // {dur, fromX, toX, peakH} in order, last one settles into the bowl
};
const ACORN_FEED_SETTLE_PAUSE_MS = 550;

function startAcornFeedAnim() {
  const px = player.x + player.width / 2;
  const py = 0; // ground level, world-relative height-above-ground
  const bowlX = ratNPC.x + 65;
  const bowlY = 0;
  acornFeedAnim.startX = px;
  acornFeedAnim.startY = py;
  acornFeedAnim.bowlX = bowlX;
  acornFeedAnim.bowlY = bowlY;
  const dx = bowlX - px;
  acornFeedAnim.segments = [
    { dur: 340, fromX: px, toX: px + dx * 0.42, peakH: 22 },
    { dur: 270, fromX: px + dx * 0.42, toX: px + dx * 0.72, peakH: 13 },
    { dur: 210, fromX: px + dx * 0.72, toX: bowlX, peakH: 6 }
  ];
  acornFeedAnim.active = true;
  acornFeedAnim.t = 0;
}

function getAcornFeedAnimPos() {
  let elapsed = acornFeedAnim.t;
  for (const seg of acornFeedAnim.segments) {
    if (elapsed <= seg.dur) {
      const p = elapsed / seg.dur;
      const x = seg.fromX + (seg.toX - seg.fromX) * p;
      const heightAboveGround = Math.sin(p * Math.PI) * seg.peakH;
      return { x, heightAboveGround };
    }
    elapsed -= seg.dur;
  }
  return { x: acornFeedAnim.bowlX, heightAboveGround: 0 };
}

function totalAcornFeedAnimDuration() {
  return acornFeedAnim.segments.reduce((sum, seg) => sum + seg.dur, 0);
}

function updateAcornFeedAnim(deltaTime) {
  if (!acornFeedAnim.active) return;
  acornFeedAnim.t += deltaTime * 1000;
  const totalDur = totalAcornFeedAnimDuration();
  if (acornFeedAnim.t >= totalDur + ACORN_FEED_SETTLE_PAUSE_MS) {
    acornFeedAnim.active = false;
    ratNPC.fed = true; // bowl now shows the acorn, and this unblocks the dialogue advance below
    ratDialogue.index++;
    if (ratDialogue.index >= ratDialogue.lines.length) {
      ratDialogue.active = false;
    }
  }
}

const ratGratefulLines = [
  ["Oh, wonderful! Just wonderful.", "Can't remember the last time I had a proper snack."],
  ["Say... since you're clearly the helpful sort,", "there's a little something I've been missing down here."],
  ["A small lamp -- used to sit up top somewhere.", "Wouldn't have noticed it before now, I'd wager.", "Mind bringing it down?"]
];
const ratNoSnackLines = [["Ah, no matter. Next time, perhaps?"]];

function advanceRatDialogue() {
  if (ratDialogue.index === 1 && !ratNPC.fed) {
    if (inventory.acorn > 0) {
      inventory.acorn -= 1;
      if (inventory.acorn <= 0) delete inventory.acorn;
      if (heldItem === "acorn") heldItem = null;
      updateInventoryUI();
      ratDialogue.lines = ratDialogue.lines.concat(ratGratefulLines);
      startAcornFeedAnim(); // this owns advancing the dialogue once it completes
      return;
    } else {
      ratDialogue.lines = ratDialogue.lines.concat(ratNoSnackLines);
    }
  }
  ratDialogue.index++;
  if (ratDialogue.index >= ratDialogue.lines.length) {
    ratDialogue.active = false;
  }
}

function updateRatNPC(deltaTime) {
  ratNPC.tailSwayT += deltaTime;
}
// nest materials -- ratty fabric scraps and tangled string, clustered
// near the rat (this is genuinely his nest, not just room decor) with
// a handful of stray pieces scattered further out among the hay
const nestFabricScraps = [
  { dx: -18, dy: -2, w: 16, color: "#5a5450", rot: 0.4 },
  { dx: -6, dy: -1, w: 13, color: "#4a5058", rot: -0.3 },
  { dx: 30, dy: 2, w: 15, color: "#6a5848", rot: 0.6 },
  { dx: 55, dy: -1, w: 14, color: "#6a2812", rot: 0.15 }, // deep rusty red, sampled from the actual cheese art image's most saturated red tone
  // strays, scattered further into the hay
  { dx: -160, dy: 0, w: 14, color: "#5a5450", rot: -0.5 },
  { dx: 220, dy: 3, w: 15, color: "#4a5058", rot: 0.2 },
  { dx: -260, dy: -2, w: 12, color: "#6a5848", rot: 0.7 }
];
// a few hay strands drawn on top of each fabric scrap's position, so
// they read as woven into the hay rather than sitting entirely above
// it -- all the hay layers draw before nest materials, so this is the
// simplest way to get some hay crossing back over the scraps
function drawHayOverHayScraps(camX) {
  const baseX = ratNPC.x - camX, baseY = gy - 2;
  const hayColors = ["#c9a03a", "#e8c258", "#a8822a", "#d4ac48"];
  nestFabricScraps.forEach((f, fIdx) => {
    const cx = baseX + f.dx, cy = baseY + f.dy;
    for (let i = 0; i < 3; i++) {
      const seed = fIdx * 23 + i * 11;
      const angle = ((seed * 7) % 140 - 70) / 70;
      const len = 8 + (seed % 8);
      const ox = ((seed * 13) % 12) - 6, oy = ((seed * 5) % 6) - 3;
      ctx.save();
      ctx.translate(cx + ox, cy + oy);
      ctx.rotate(angle);
      ctx.strokeStyle = hayColors[seed % hayColors.length];
      ctx.globalAlpha = 0.7;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.lineTo(len / 2, (seed % 4) - 2);
      ctx.stroke();
      ctx.restore();
    }
  });
  ctx.globalAlpha = 1;
}
const nestStrings = [
  { dx: 12, dy: 0, r: 5, color: "rgba(210,205,190,0.6)" },
  { dx: -280, dy: 2, r: 4, color: "rgba(210,205,190,0.5)" },
  { dx: 180, dy: -1, r: 4.5, color: "rgba(210,205,190,0.55)" }
];
// feather -- a find-item hidden right of the rat, among the hay and
// scrap clutter (not isolated), only visible and collectible while
// the lamp is lit and within range. Positioned to the right specifically
// since most of the eyes are to the left, where a player would default
// to looking first.
const ratRoomFeather = { x: 600, y: 30, collected: false };
// unravel animation -- pressing space starts a slow unwind rather than
// an instant pickup, so the string-wrapped feather reads as a
// deliberate discovery rather than something grabbed by accident
const featherUnravelAnim = { active: false, t: 0 };
const FEATHER_UNRAVEL_MS = 900; // slow enough to actually be experienced, not just flash by
function drawRatRoomFeather(camX) {
  if (ratRoomFeather.collected || !lampLit) return;
  const playerScreenX = player.x + player.width / 2 - camX;
  const fx = ratRoomFeather.x - camX, fy = gy - ratRoomFeather.y;
  const dist = Math.hypot(fx - playerScreenX, fy - (gy - player.y));
  if (dist > LAMP_LIGHT_RADIUS) return;
  // small dirt ledge, jutting out from the wall -- gives the feather
  // an actual physical perch at this height rather than floating with
  // nothing visibly holding it up, which is what made it read as
  // pinned to the wall rather than resting in the room
  ctx.fillStyle = "#4a3a26";
  ctx.beginPath();
  ctx.moveTo(fx - 14, fy + 6);
  ctx.quadraticCurveTo(fx - 6, fy + 10, fx + 2, fy + 7);
  ctx.quadraticCurveTo(fx + 10, fy + 5, fx + 15, fy + 9);
  ctx.lineTo(fx + 15, fy + 16);
  ctx.lineTo(fx - 14, fy + 16);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = "rgba(30,22,12,0.5)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(fx - 14, fy + 6);
  ctx.quadraticCurveTo(fx - 6, fy + 10, fx + 2, fy + 7);
  ctx.quadraticCurveTo(fx + 10, fy + 5, fx + 15, fy + 9);
  ctx.stroke();
  // a couple loose pebbles on the ledge for texture
  ctx.fillStyle = "#6a5a44";
  [[-8, 9, 1.4], [6, 10, 1.1]].forEach(([dx, dy, r]) => {
    ctx.beginPath();
    ctx.arc(fx + dx, fy + dy, r, 0, Math.PI * 2);
    ctx.fill();
  });

  // tucked at an angle among the clutter, leaning slightly right --
  // reduced from a steep angle that read as too deliberately posed
  drawFeatherShape(ctx, fx, fy, 9, 0.2);

  // string -- thin, loose, mostly-horizontal strands rather than
  // neat wound loops, since real string just tossed on wouldn't form
  // tidy shapes at all
  const unravelP = featherUnravelAnim.active ? Math.min(1, featherUnravelAnim.t / FEATHER_UNRAVEL_MS) : 0;
  const loopCount = 4;
  ctx.strokeStyle = "rgba(225,215,185,0.95)";
  ctx.lineWidth = 0.75;
  for (let i = 0; i < loopCount; i++) {
    const loopUnravelStart = i / loopCount;
    if (unravelP >= loopUnravelStart + 1 / loopCount) continue; // this strand has fully fallen away
    const loopP = Math.max(0, (unravelP - loopUnravelStart) * loopCount); // 0 to 1 for this specific strand's own unwind
    const seed = i * 17 + 5;
    const loopY = fy - 6 + i * 4 + ((seed * 3) % 5) - 2; // irregular vertical spacing, not evenly stepped
    const loopAngle = ((seed * 7) % 30 - 15) / 100; // small tilt range -- stays mostly horizontal rather than varied angles
    const loopRx = 6 + ((seed * 11) % 5); // varied horizontal spread per strand
    const loopRy = 0.4 + ((seed * 5) % 3) * 0.12; // quite flat
    const droop = loopP * 11 + Math.sin(loopP * 9 + seed) * loopP * 2.5; // irregular jitter on the way down, not a smooth linear drift
    const sideJitter = Math.sin(loopP * 7 + seed * 1.7) * loopP * 4;
    ctx.save();
    ctx.globalAlpha = 1 - loopP * 0.7;
    ctx.translate(fx + ((seed * 13) % 5) - 2 + loopP * 3 + sideJitter, loopY + droop);
    ctx.rotate(loopAngle + loopP * 0.5 + Math.sin(loopP * 11 + seed) * loopP * 0.4);
    // open, loose squiggly strand -- not a closed loop, so it reads as
    // haphazardly tossed rather than deliberately wound
    ctx.beginPath();
    const segs = 6;
    for (let s = 0; s <= segs; s++) {
      const t = s / segs;
      const wobble = Math.sin(t * Math.PI * 2.6 + seed) * loopRy;
      const px2 = (t - 0.5) * loopRx * 2 * (1 - loopP * 0.3);
      const py2 = wobble;
      if (s === 0) ctx.moveTo(px2, py2); else ctx.lineTo(px2, py2);
    }
    ctx.stroke();
    ctx.restore();
  }
}
function updateFeatherUnravelAnim(deltaTime) {
  if (!featherUnravelAnim.active) return;
  featherUnravelAnim.t += deltaTime * 1000;
  if (featherUnravelAnim.t >= FEATHER_UNRAVEL_MS) {
    featherUnravelAnim.active = false;
    completeFeatherPickup();
  }
}
function completeFeatherPickup() {
  ratRoomFeather.collected = true;
  carriedFeather = true;
  inventory.feather = 1;
  touchInventoryOrder("feather");
  updateInventoryUI();
  startCollectAnimation({ x: ratRoomFeather.x, y: ratRoomFeather.y, size: 7, rotation: 0 }, "feather");
  // the rat notices immediately -- turns to face the player and
  // starts his reaction on his own, rather than waiting for the
  // player to walk over and initiate
  ratNPC.facingRight = ratRoomFeather.x > ratNPC.x;
  startRatDialogue();
}
function updateRatRoomFeather() {
  if (ratRoomFeather.collected || !lampLit || featherUnravelAnim.active) return;
  if (keys.spaceJustPressed && isPlayerNear(ratRoomFeather.x, ratRoomFeather.y, 20, 15, 35)) {
    featherUnravelAnim.active = true;
    featherUnravelAnim.t = 0;
  }
}

function drawNestMaterials(camX) {
  const baseX = ratNPC.x - camX, baseY = gy - 2;

  nestFabricScraps.forEach((f, fIdx) => {
    ctx.save();
    ctx.translate(baseX + f.dx, baseY + f.dy);
    ctx.rotate(f.rot);
    ctx.fillStyle = f.color;
    // seeded jitter per vertex so every scrap has its own ragged
    // silhouette, not the same proportional shape just rescaled, with
    // real width variation along the length -- some parts wide, some
    // pinched thin, like an actual torn scrap rather than a uniform strip
    const seed = fIdx * 37 + 11;
    const jitter = (n) => (((seed * (n + 3) * 17) % 13) / 13 - 0.5) * f.w * 0.18;
    const widthMult = (n) => 0.5 + (((seed * (n + 5) * 23) % 17) / 17) * 1.3; // 0.5 to 1.8, seeded per segment
    const baseVerts = [
      [-1, -0.22], [-0.5, -0.35], [0.1, -0.15], [0.75, -0.25], [1, 0.08],
      [0.6, 0.22], [0.05, 0.12], [-0.55, 0.28], [-0.9, 0.1]
    ];
    ctx.beginPath();
    baseVerts.forEach(([vx, vy], i) => {
      const x = vx * f.w + jitter(i * 2), y = vy * f.w * widthMult(i) + jitter(i * 2 + 1);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fill();
    // frayed threads at both ends, count and length varying per piece
    ctx.strokeStyle = f.color;
    ctx.lineWidth = 0.6;
    [-f.w, f.w].forEach(endX => {
      const dir = endX > 0 ? 1 : -1;
      const threadCount = 2 + (seed % 3);
      for (let t = 0; t < threadCount; t++) {
        const ty = (t - (threadCount - 1) / 2) * f.w * 0.12 + jitter(t + 5);
        const len = 1.5 + ((seed * (t + 1)) % 4);
        ctx.beginPath();
        ctx.moveTo(endX, ty);
        ctx.lineTo(endX + dir * len, ty + dir * (0.3 + jitter(t + 8) * 0.1));
        ctx.stroke();
      }
    });
    ctx.restore();
  });

  nestStrings.forEach(s => {
    const sx = baseX + s.dx, sy = baseY + s.dy;
    ctx.strokeStyle = s.color;
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    // a loose, tangled coil rather than a clean circle
    ctx.moveTo(sx - s.r, sy);
    ctx.bezierCurveTo(sx - s.r, sy - s.r, sx + s.r * 0.6, sy - s.r * 1.2, sx + s.r, sy - s.r * 0.2);
    ctx.bezierCurveTo(sx + s.r * 1.3, sy + s.r * 0.6, sx - s.r * 0.3, sy + s.r, sx - s.r * 0.6, sy + s.r * 0.2);
    ctx.stroke();
  });
}

function drawRatFeedBowl(camX) {
  const bx = ratNPC.x + 65 - camX, by = gy - 4;
  ctx.save();
  ctx.translate(bx, by);
  ctx.rotate(0.12); // sits at a slight angle, like it just landed there

  // simple wooden bowl -- an arc for the rim
  ctx.fillStyle = "#8a3a28";
  ctx.beginPath();
  ctx.ellipse(0, 0, 16, 7, 0, 0, Math.PI, false);
  ctx.fill();
  ctx.fillStyle = "#5a2418";
  ctx.beginPath();
  ctx.ellipse(0, -1, 12.5, 4.6, 0, 0, Math.PI, false);
  ctx.fill();
  ctx.strokeStyle = "#3a1810";
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.ellipse(0, 0, 16, 7, 0, 0, Math.PI, false);
  ctx.stroke();

  if (ratNPC.fed) {
    drawAcornShape(ctx, -1.5, -2, 6, 0.3);
  }
  ctx.restore();
}

function drawRatNPC(camX) {
  ctx.globalAlpha = 1; // guard against any upstream alpha leak affecting the tail/body
  const nx = ratNPC.x - camX;
  ctx.save();
  if (ratNPC.facingRight) {
    // mirror everything around nx -- every shape below is drawn in
    // nx-relative coordinates already, so this flips the whole
    // character without needing to rewrite any of the individual
    // drawing calls
    ctx.translate(2 * nx, 0);
    ctx.scale(-1, 1);
  }
  const groundY = gy - 2;
  const sway = Math.sin(ratNPC.tailSwayT * 1.8) * 12;
  const s = 1.7; // overall scale -- bigger, standing character

  // tail -- extends out behind (to the right, since he now faces left),
  // base fixed near the body while the tip sways on the ground
  const tailBaseX = nx + 8 * s, tailBaseY = groundY - 2;
  ctx.strokeStyle = "#7a7268";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.moveTo(tailBaseX, tailBaseY);
  ctx.quadraticCurveTo(tailBaseX + 16 * s * 0.6 + sway * 0.4, tailBaseY - 2, tailBaseX + 30 * s * 0.6 + sway, tailBaseY - 4);
  ctx.stroke();
  ctx.strokeStyle = "rgba(50,45,40,0.4)";
  ctx.lineWidth = 1;
  for (let i = 1; i < 5; i++) {
    const p = i / 5;
    const tx = tailBaseX + (tailBaseX + 30 * s * 0.6 + sway - tailBaseX) * p;
    const ty = tailBaseY - 3 * p;
    ctx.beginPath();
    ctx.arc(tx, ty, 1.6, 0, Math.PI * 2);
    ctx.stroke();
  }

  // legs/feet -- standing, small and planted
  ctx.fillStyle = "#7a7268";
  ctx.beginPath();
  ctx.ellipse(nx - 5 * s * 0.35, groundY - 2, 3.2, 2.2, 0, 0, Math.PI * 2);
  ctx.ellipse(nx + 5 * s * 0.35, groundY - 2, 3.2, 2.2, 0, 0, Math.PI * 2);
  ctx.fill();

  // body -- upright oval, taller than wide, standing on the legs
  const bodyH = 26 * s * 0.6, bodyW = 15 * s * 0.6;
  const bodyCenterY = groundY - bodyH / 2 - 3;
  ctx.fillStyle = "#8a8880";
  ctx.beginPath();
  ctx.ellipse(nx, bodyCenterY, bodyW / 2, bodyH / 2, 0, 0, Math.PI * 2);
  ctx.fill();

  // arms -- small, at the sides
  ctx.strokeStyle = "#7a7268";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(nx - bodyW / 2 + 1, bodyCenterY);
  ctx.lineTo(nx - bodyW / 2 - 3, bodyCenterY + 6);
  ctx.moveTo(nx + bodyW / 2 - 1, bodyCenterY);
  ctx.lineTo(nx + bodyW / 2 + 3, bodyCenterY + 6);
  ctx.stroke();

  // vest -- clipped to the body's own ellipse so it always follows the
  // real body contour exactly, with a narrow open gap down the center
  // showing the chest fur beneath (genuinely open, not a closed jacket)
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(nx, bodyCenterY, bodyW / 2, bodyH / 2, 0, 0, Math.PI * 2);
  ctx.clip();
  ctx.fillStyle = "#2f6a5a";
  ctx.fillRect(nx - bodyW, bodyCenterY - bodyH / 2 + 3, bodyW * 2, bodyH);
  ctx.fillStyle = "#9a988e";
  ctx.fillRect(nx - 2, bodyCenterY - bodyH / 2 + 3, 4, bodyH);
  ctx.restore();
  ctx.strokeStyle = "#1a4a3c";
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(nx - 2, bodyCenterY - bodyH / 2 + 3);
  ctx.lineTo(nx - 2, bodyCenterY + bodyH / 2 - 2);
  ctx.moveTo(nx + 2, bodyCenterY - bodyH / 2 + 3);
  ctx.lineTo(nx + 2, bodyCenterY + bodyH / 2 - 2);
  ctx.stroke();

  // head -- on top of the body, facing left
  const hx = nx - 2 * s * 0.5, hy = bodyCenterY - bodyH / 2 - 6;
  ctx.fillStyle = "#8a8880";
  ctx.beginPath();
  ctx.ellipse(hx, hy, 8, 6.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // ears
  ctx.fillStyle = "#7a7268";
  ctx.beginPath();
  ctx.arc(hx - 2, hy - 6, 3.2, 0, Math.PI * 2);
  ctx.arc(hx + 5, hy - 6, 3.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#c98a8a";
  ctx.beginPath();
  ctx.arc(hx - 2, hy - 6, 1.6, 0, Math.PI * 2);
  ctx.arc(hx + 5, hy - 6, 1.6, 0, Math.PI * 2);
  ctx.fill();

  // eye -- facing left, so positioned toward the left side of the head
  ctx.fillStyle = "#1a1a1a";
  ctx.beginPath();
  ctx.arc(hx - 4, hy - 1, 1.3, 0, Math.PI * 2);
  ctx.fill();

  // nose -- at the front (left side, since he faces left)
  ctx.fillStyle = "#d89a9a";
  ctx.beginPath();
  ctx.arc(hx - 8, hy + 1, 1.6, 0, Math.PI * 2);
  ctx.fill();

  // whiskers, extending left from the snout
  ctx.strokeStyle = "rgba(230,230,230,0.6)";
  ctx.lineWidth = 0.5;
  [-1.5, 0, 1.5].forEach(dy => {
    ctx.beginPath();
    ctx.moveTo(hx - 7, hy + 1 + dy * 0.5);
    ctx.lineTo(hx - 15, hy + dy);
    ctx.stroke();
  });
  ctx.restore();
}

// widespread thin ground-covering hay, scattered across most of the
// floor -- distinct from the discrete piles below, which stay as
// denser clusters standing out against this thinner background layer
const hayGroundCover = Array.from({ length: 503 }, (_, i) => {
  const seed = i * 11 + 7;
  return {
    x: (seed * 37) % 1400,
    dy: ((seed * 13) % 8) - 2,
    len: 6 + (seed % 9),
    angle: (((seed * 5) % 100) - 50) / 90,
    colorIdx: seed % 4
  };
});
function drawHayGroundCover(camX) {
  const hayColors = ["#c9a03a", "#e8c258", "#a8822a", "#d4ac48"];
  const baseY = gy - 2;
  hayGroundCover.forEach(h => {
    ctx.save();
    ctx.translate(h.x - camX, baseY + h.dy);
    ctx.rotate(h.angle);
    ctx.strokeStyle = hayColors[h.colorIdx];
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-h.len / 2, 0);
    ctx.lineTo(h.len / 2, 0);
    ctx.stroke();
    ctx.restore();
  });
  ctx.globalAlpha = 1;
}

// stray pieces -- isolated single strands scattered well outside the
// pile clusters, at odd angles, for genuine messiness rather than
// everything being tidily accounted for in either the piles or the
// even ground cover
const hayStrays = Array.from({ length: 45 }, (_, i) => {
  const seed = i * 19 + 5;
  return {
    x: (seed * 53) % 780,
    dy: ((seed * 17) % 10) - 3,
    len: 10 + (seed % 14),
    angle: (((seed * 31) % 140) - 70) / 70,
    colorIdx: seed % 4
  };
});
function drawHayStrays(camX) {
  const hayColors = ["#c9a03a", "#e8c258", "#a8822a", "#d4ac48"];
  const baseY = gy - 2;
  hayStrays.forEach(h => {
    ctx.save();
    ctx.translate(h.x - camX, baseY + h.dy);
    ctx.rotate(h.angle);
    ctx.strokeStyle = hayColors[h.colorIdx];
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-h.len / 2, 0);
    ctx.lineTo(h.len / 2, (h.len % 4) - 2);
    ctx.stroke();
    ctx.restore();
  });
}

// watching eyes in the shadows -- mostly clustered in the bottom-left
// third of the room, a couple on the right, and one pair perched high
// up left of the stairs as if watching from above. Each blinks on its
// own staggered timing, not synchronized, for a more alive, curious
// feel rather than a single ominous effect.
const ratRoomEyes = [
  { x: 55, y: 268, phase: 0.2, blinkSpeed: 0.9 },
  { x: 125, y: 290, phase: 1.8, blinkSpeed: 1.1 },
  { x: 78, y: 210, phase: 3.1, blinkSpeed: 0.8 },
  { x: 245, y: 255, phase: 0.6, blinkSpeed: 1.3 },
  { x: 285, y: 235, phase: 2.4, blinkSpeed: 1.0 },
  { x: 32, y: 278, phase: 4.0, blinkSpeed: 0.95 },
  { x: 105, y: 225, phase: 1.2, blinkSpeed: 1.05 },
  { x: 690, y: 270, phase: 2.9, blinkSpeed: 0.85 },
  { x: 730, y: 250, phase: 0.4, blinkSpeed: 1.15 },
  { x: 280, y: 55, phase: 3.5, blinkSpeed: 0.75 }, // high up, left of the stairs, perched on top of something
  // more spread further right -- a genuine huddled cluster of three,
  // not evenly spaced like before, plus one further out on its own
  { x: 825, y: 268, phase: 5.2, blinkSpeed: 0.92 },
  { x: 865, y: 235, phase: 0.9, blinkSpeed: 1.08 },
  { x: 822, y: 292, phase: 2.1, blinkSpeed: 0.88 },
  { x: 1040, y: 255, phase: 4.4, blinkSpeed: 1.2 },
  { x: 1120, y: 275, phase: 1.6, blinkSpeed: 0.98 },
  { x: 1200, y: 245, phase: 3.8, blinkSpeed: 1.05 },
  { x: 1360, y: 268, phase: 0.7, blinkSpeed: 0.9 },
  { x: 950, y: 60, phase: 5.6, blinkSpeed: 0.8 } // a second high-up perch, further right
];
let ratRoomEyeT = 0;
function updateRatRoomEyes(deltaTime) {
  ratRoomEyeT += deltaTime;
}
function drawRatRoomEyes(camX) {
  ratRoomEyes.forEach((eye, idx) => {
    const ex = eye.x - camX, ey = eye.y;
    const cycle = (ratRoomEyeT * eye.blinkSpeed + eye.phase) % 6;
    const blinking = cycle > 5.5; // brief closed moment within each cycle

    // within lamp light -- resolve into a small visible baby rat shape,
    // the actual reveal the light is for
    if (lampLit) {
      const playerScreenX = player.x + player.width / 2 - camX;
      const dist = Math.hypot(ex - playerScreenX, ey - (gy - player.y));
      if (dist < LAMP_LIGHT_RADIUS) {
        const babySway = Math.sin(ratRoomEyeT * 2.2 + eye.phase * 3) * 3;

        // genuine variety per baby -- different fur tones, sizes, and
        // facing direction, deterministic from position so each one
        // stays consistent
        const variantSeed = idx * 13 + 7;
        const furColors = ["#8a8880", "#a8a090", "#8a7050", "#6a6862", "#9a8a78", "#7a6858", "#b09878"];
        const earColors = ["#7a7268", "#8a8070", "#7a6040", "#5a5852", "#8a7868", "#6a5848", "#9a8060"];
        const furColor = furColors[variantSeed % furColors.length];
        const earColor = earColors[variantSeed % earColors.length];
        const scale = 0.75 + (((variantSeed * 7 + 3) % 11) / 11) * 0.5; // decorrelated from color index so they don't cycle together
        const facingDir = (variantSeed % 3 === 0) ? -1 : 1; // some face the other way -- real pose variety, not just a color tint on an identical shape

        // small tail, swaying side to side, flipped with facing direction
        ctx.strokeStyle = earColor;
        ctx.lineWidth = 1.3 * scale;
        ctx.beginPath();
        ctx.moveTo(ex + 5 * scale * facingDir, ey + 5 * scale);
        ctx.quadraticCurveTo(ex + 8 * scale * facingDir + babySway * 0.5, ey + 6 * scale, ex + 10 * scale * facingDir + babySway, ey + 4 * scale);
        ctx.stroke();

        // little round body
        ctx.fillStyle = furColor;
        ctx.beginPath();
        ctx.ellipse(ex + 1 * scale * facingDir, ey + 5 * scale, 5 * scale, 4 * scale, 0, 0, Math.PI * 2);
        ctx.fill();

        // head, slightly forward and up from the body
        ctx.fillStyle = furColor;
        ctx.beginPath();
        ctx.ellipse(ex, ey, 6 * scale, 4.5 * scale, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = earColor;
        ctx.beginPath();
        ctx.arc(ex - 2.5 * scale, ey - 4 * scale, 1.8 * scale, 0, Math.PI * 2);
        ctx.arc(ex + 2.5 * scale, ey - 4 * scale, 1.8 * scale, 0, Math.PI * 2);
        ctx.fill();
        if (!blinking) {
          ctx.fillStyle = "#1a1a1a";
          ctx.beginPath();
          ctx.arc(ex - 1.5 * scale, ey - 2 * scale, 0.8 * scale, 0, Math.PI * 2);
          ctx.arc(ex + 1.5 * scale, ey - 2 * scale, 0.8 * scale, 0, Math.PI * 2);
          ctx.fill();
        }
        return;
      }
    }

    if (blinking) return;
    const openness = cycle > 5.2 ? (5.5 - cycle) / 0.3 : 1;
    ctx.fillStyle = "rgba(220,190,120,0.85)";
    ctx.beginPath();
    ctx.ellipse(ex - 2.2, ey, 1.3, 1.3 * openness, 0, 0, Math.PI * 2);
    ctx.ellipse(ex + 2.2, ey, 1.3, 1.3 * openness, 0, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawHayPiles(camX) {
  const hayColors = ["#c9a03a", "#e8c258", "#a8822a", "#d4ac48"];
  hayPiles.forEach(pile => {
    const baseX = pile.x - camX, baseY = gy - 2;
    for (let i = 0; i < pile.count; i++) {
      const seed = pile.seed + i * 7;
      const dx = ((seed * 13) % 70) - 35;
      const dy = ((seed * 7) % 6) - 2;
      const len = 14 + (seed % 14);
      const angle = (((seed * 5) % 100) - 50) / 60;
      ctx.save();
      ctx.translate(baseX + dx, baseY + dy);
      ctx.rotate(angle);
      ctx.strokeStyle = hayColors[seed % hayColors.length];
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(-len / 2, 0);
      ctx.lineTo(len / 2, (seed % 5) - 2);
      ctx.stroke();
      ctx.restore();
    }
  });
}

let ratLampAcknowledged = false;
const ratLampFoundLines = [["Oh! You found it -- the little lamp!", "Wonderful, just wonderful."]];

function updateRatRoomScene(deltaTime) {
  // ceiling clamp -- the double jump's peak reach (up to ~276 when
  // timed well) exceeds the height where the player's own head still
  // fits on screen (246, gy minus their 54-unit height), even though
  // the new safe shelf (245) sits just under that limit. Scoped to
  // just the right-cluster area rather than the whole room -- an
  // earlier global version blocked the stairs entirely, which
  // legitimately need to reach height 280 to trigger the transition
  // back to oak.
  if (player.x > 950 && player.x < 1370 && player.y > 246) {
    player.y = 246;
    if (player.vy > 0) player.vy = 0;
  }
  updateRatNPC(deltaTime);
  updateRatRoomEyes(deltaTime);
  updateSpider(deltaTime);
  updateMoth(deltaTime);
  updateFireflies(deltaTime);
  updateShelfTierUnlocks();
  updateSnake(deltaTime);
  updateMarble();
  updateAcornFeedAnim(deltaTime);
  updateRatRoomFeather();
  updateFeatherUnravelAnim(deltaTime);
  updateFeatherHangSpot();
  updateFeatherHangAnim(deltaTime);

  if (!ratLampAcknowledged && inventory.lamp > 0 && !ratDialogue.active) {
    ratLampAcknowledged = true;
    ratNPC.facingRight = player.x > ratNPC.x;
    ratDialogue.active = true;
    ratDialogue.index = 0;
    ratDialogue.lines = ratLampFoundLines.slice();
    ratNPC.talkedTo = true;
  }

  if (ratDialogue.active) {
    if (keys.spaceJustPressed && !acornFeedAnim.active) advanceRatDialogue();
    return; // mid-conversation -- don't also process the stairs trigger this frame
  }

  if (isPlayerNear(ratNPC.x, 0, 55, 25, 20) && keys.spaceJustPressed) {
    startRatDialogue();
    return;
  }

  const topStep = ratRoomStairs[0];
  if (isPlayerNear(topStep.x, topStep.heightAboveGround, 20, 20, 15) && keys.spaceJustPressed) {
    startSeasonTransition("oak");
  }

  // high-shelf collision -- these had none before despite being called
  // hoppable; shelf.y is a screen-y coordinate, converted to an
  // equivalent height-above-ground for the landing check
  ratRoomHighShelves.forEach(shelf => {
    if (shelf.tier > 0 && !shelf.unlocked) return;
    const shelfTop = gy - shelf.y;
    const playerBottom = player.y;
    if (
      player.x + player.width > shelf.x - shelf.w / 2 - 4 &&
      player.x < shelf.x + shelf.w / 2 + 4 &&
      playerBottom <= shelfTop &&
      playerBottom >= shelfTop - 14 &&
      player.vy <= 0
    ) {
      if (shelf.id === "snakeShelf" && !snakeState.hissing) {
        // lands normally at first, but the snake immediately reacts --
        // a brief hiss, then a knockback rather than a stable landing,
        // so this reads as a real dead end rather than a valid path
        player.y = shelfTop;
        player.vy = 0;
        player.jumping = false;
        player.usedDoubleJump = false;
        snakeState.hissing = 0.001;
        snakeState.hissT = 0;
      } else if (shelf.id !== "snakeShelf") {
        player.y = shelfTop;
        player.vy = 0;
        player.jumping = false;
        player.usedDoubleJump = false;
      }
    }
  });
  if (snakeState.hissing > 0) {
    snakeState.hissT += deltaTime * 1000;
    if (snakeState.hissT > 350 && snakeState.hissT < 366) {
      // the actual knockback, once the hiss has had a moment to register
      player.vy = 6;
      player.jumping = true;
    }
    if (snakeState.hissT >= 2000) {
      snakeState.hissing = 0;
      snakeState.hissT = 0;
    }
  }

  // stair collision — same landing pattern as the oak room's platforms,
  // making each step a genuine hoppable surface
  ratRoomStairs.forEach(step => {
    const stepTop = step.heightAboveGround;
    const playerBottom = player.y;
    if (
      player.x + player.width > step.x - 13 &&
      player.x < step.x + 13 &&
      playerBottom <= stepTop &&
      playerBottom >= stepTop - 14 &&
      player.vy <= 0
    ) {
      player.y = stepTop;
      player.vy = 0;
      player.jumping = false;
      player.usedDoubleJump = false;
    }
  });
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
  drawPlane(camX);

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
  if (elephantSpot.piecesPlaced >= 8) {
    drawHole(elephantHole.x, elephantHole.width, camX);
  }

  hopClouds.forEach(c => drawHopCloud(c, camX));
  drawCrystalOnCloud(camX);
  drawWaterDrips(camX);
  drawRabbitShuttleCloud(camX);
  drawSimpleCloudPieces(camX);
  drawPeanut(camX);
  vaultClouds.forEach(v => drawVaultCloud(v, camX));
  drawElephantSpot(camX);
  drawBalloonNPC(camX);
}

function updateCloudsScene(deltaTime) {
  if (fallState.active) return; // handled globally by updateFallState

  updateWaterDrips(deltaTime);
  updateRabbitShuttle(deltaTime);
  updatePlane(cameraX);
  updateFallingCloudPieces(deltaTime);
  updatePeanutFall(deltaTime);
  updatePeanutPickup();
  updateSimpleCloudPiecePickups();
  vaultClouds.forEach((v, i) => updateVaultCloud(v, i, deltaTime));
  updateElephantSpot(deltaTime);
  updateBalloonNPC(deltaTime);

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
    const overOriginalHole = playerCenterX > cloudHole.x && playerCenterX < cloudHole.x + cloudHole.width;
    const overElephantHole = elephantSpot.piecesPlaced >= 8 &&
      playerCenterX > elephantHole.x && playerCenterX < elephantHole.x + elephantHole.width;

    if (overOriginalHole || overElephantHole) {
      const hole = overOriginalHole ? cloudHole : elephantHole;
      player.x = hole.x + hole.width / 2 - player.width / 2; // center on the hole, not wherever the trigger fired
      fallState.active = true;
      fallState.t = 0;
      fallState.mode = "cloudHole";
    }
  }
}

function draw(){
ctx.clearRect(0,0,canvas.width,canvas.height);

if (bookReader.active || bookReader.opening || bookReader.closing) {
  drawBookReader();
} else if (carvingUI.active || carvingUI.opening || carvingUI.closing) {
  drawCarvingUI();
} else if (camera.topDown) {
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
} else if (currentScene === "forest") {
  drawForestScene(camX);
} else if (currentScene === "clouds") {
  drawCloudsScene(camX);
} else if (currentScene === "oak") {
  drawOakScene(camX);
} else if (currentScene === "ratroom") {
  drawRatRoomScene(camX);
}

// worn/in-progress crown — shared across scenes, drawn here so it shows
// (and C keeps working) no matter which zone you're actually standing in

// flying (collecting/placing) items — shared across scenes, drawn here so
// a pickup animation started in ANY scene actually renders, not just autumn's
flyingItems.forEach(f => {
  if (f.itemType === "leaf" && f.extra) {
    drawLeafShape(ctx, f.x - camX, f.y, f.size * f.scale, f.rotation, f.extra.shape, f.extra.color);
  } else {
    drawCollectible(ctx, f.x - camX, f.y, f.size * f.scale, f.rotation, f.itemType);
  }
});

drawBoomerangThrow(camX); // the boomerang itself, while it's in the air

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

  // woozy sway -- a gentle wobble on the body itself while stunned
  // from a hard fall, nested inside the clip so the clip region
  // itself stays axis-aligned and only the sprite tilts
  ctx.save();
  const swayAngle = playerWoozyT > 0 ? Math.sin(performance.now() * 0.009) * 0.28 * (playerWoozyT / WOOZY_MS) : 0;
  const swayCx = px + player.width / 2, swayCy = drawPy + player.height / 2;
  ctx.translate(swayCx, swayCy);
  ctx.rotate(swayAngle);
  ctx.translate(-swayCx, -swayCy);

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

  ctx.restore(); // closes the sway rotation
  ctx.restore(); // closes the clip
}

if (currentScene === "forest") {
  drawForestBrambleFront(camX);
}


drawCrown(camX);
drawBoomerangPrompt(camX);

// held item — floats above the head while selected, so it's clear it's "in play"
if (heldItem && !fallState.active) {
  const heldPos = getHeldItemWorldPos();
  if (heldItem === "honey") {
    drawHoneyPotShape(ctx, heldPos.x - camX, heldPos.y, 10, honeyScoops / 8);
  } else {
    drawCollectible(ctx, heldPos.x - camX, heldPos.y, 10, 0, heldItem);
  }
}

// carried book — same floating-above-head treatment as a held item,
// small closed-book icon matching each book's established color coding
if (carriedBook && !fallState.active) {
  const bookPos = getHeldItemWorldPos();
  const bx = bookPos.x - camX, by = bookPos.y;
  const isManual = carriedBook === "manual";
  const isMetaphors = carriedBook === "metaphors";
  if (isMetaphors) {
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(bx - 6, by - 8, 12, 16);
    ctx.fillStyle = "#3f5766";
    ctx.fillRect(bx - 6, by - 8, 12, 5);
    ctx.strokeStyle = "#22303a";
    ctx.lineWidth = 1;
    ctx.strokeRect(bx - 6, by - 8, 12, 16);
  } else {
    ctx.fillStyle = isManual ? "#2f5a6a" : "#7a2f2f";
    ctx.fillRect(bx - 6, by - 8, 12, 16);
    ctx.strokeStyle = isManual ? "#1a3540" : "#5a2020";
    ctx.lineWidth = 1;
    ctx.strokeRect(bx - 6, by - 8, 12, 16);
  }
  if (isManual) {
    // small tooth icon, so the manual stands out at a glance even at
    // this tiny carried-icon size, not just a plain label stripe
    const tx = bx, ty = by - 4;
    ctx.fillStyle = "#f5f0e0";
    ctx.beginPath();
    ctx.moveTo(tx - 1.6, ty - 1);
    ctx.quadraticCurveTo(tx - 2, ty - 2.6, tx, ty - 2.6);
    ctx.quadraticCurveTo(tx + 2, ty - 2.6, tx + 1.6, ty - 1);
    ctx.quadraticCurveTo(tx + 1.8, ty, tx + 0.8, ty + 2);
    ctx.quadraticCurveTo(tx, ty + 2.6, tx - 0.8, ty + 2);
    ctx.quadraticCurveTo(tx - 1.8, ty, tx - 1.6, ty - 1);
    ctx.closePath();
    ctx.fill();
  } else if (!isMetaphors) {
    ctx.fillStyle = "#d4a520";
    ctx.fillRect(bx - 4, by - 5, 8, 1.5);
  }
}

drawSeasonTransition(ctx);
}
}
/* ======================================================
   MAIN LOOP
   ====================================================== */
function updateAutumnScene(deltaTime) {
updateLeafTrees(deltaTime);
updateSeesaw(deltaTime);
updateWoodpecker(deltaTime);
updateSeesawProjectile();
updateVines(deltaTime);
updateAcorns();
updateVinePumpkin();
updateWormRock();

// honey falling from the hive, once knocked
if (honey.falling) {
  honey.heightAboveGround -= HONEY_FALL_SPEED * deltaTime;
  if (honey.heightAboveGround <= 15) {
    honey.heightAboveGround = 15;
    honey.falling = false; // settled — now pickupable
  }
}

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

  // boomerang: elevated, requires catching it on the way down from a jump —
  // same "must be descending" logic platform-landing already uses, generous
  // vertical tolerance so most of the descent counts, not a single frame
  if (!boomerang.collected && !boomerang.collecting && !pickupHandledThisFrame) {
    if (player.vy <= 0 && pressedDownNear(boomerang.x, boomerang.heightAboveGround, 26, 20, 20)) {
      boomerang.collecting = true;
      startCollectAnimation(
        { x: boomerang.x, y: gy - boomerang.heightAboveGround, size: 10, rotation: 0 },
        "boomerang"
      );
      pickupHandledThisFrame = true;
    }
  }

  // honey: only pickable once the hive's actually been knocked down AND it's settled
  if (honey.available && !honey.collected && !honey.collecting && !honey.falling && !pickupHandledThisFrame) {
    if (pressedDownNear(honey.x, honey.heightAboveGround, 26, 20, 20)) {
      honey.collecting = true;
      startCollectAnimation(
        { x: honey.x, y: gy - honey.heightAboveGround, size: 10, rotation: 0 },
        "honey"
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

  // --- CROW INTERACTION -- only once the hay bales have toppled,
  // since the crow's own area isn't reachable before then ---
  if (hayBales.toppled) {
    updateNPCIdle(crow);
    const crowCenterX = crow.x + crow.width / 2;
    if (pressedDownNear(crowCenterX, crow.y, 130, 45, 999) && !crow.active && !pickupHandledThisFrame) {
      crow.active = true;
      crow.tip = 30;
    } else if (crow.active && keys.spaceJustPressed && isPlayerNear(crowCenterX, crow.y, 130, 45, 999) &&
               heldItem === "pumpkin" && inventory.pumpkin > 0 && !crow.offeredPumpkin) {
      // pumpkin isn't deducted here -- the player still carries it and
      // needs to walk it over and place it themselves at the station
      crow.offeredPumpkin = true;
      crow.facing = 1; // flips to face right, toward the station
    }
  }

  // --- CARVING STATION PLACEMENT -- space near the station's own
  // platform, with the pumpkin specifically in hand, places it down
  // on the cloth ---
  if (!carvingStation.pumpkinPlaced && !carvingStation.active && heldItem === "pumpkin" && inventory.pumpkin > 0 &&
      keys.spaceJustPressed && isPlayerNear(carvingStation.x, carvingStation.platformHeight, 40, 20, 999)) {
    inventory.pumpkin -= 1;
    if (inventory.pumpkin <= 0) { delete inventory.pumpkin; heldItem = null; }
    updateInventoryUI();
    carvingStation.pumpkinPlaced = true;
    carvingStation.placingT = 0;
  }

  // the finished pumpkin now stays permanently at the station once
  // grown -- no pickup, no inventory item. It's a fixture, not
  // something carried away.

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

}

// PLACEMENT SLOTS and the autumn-side doorway check -- extracted out
// of updateAutumnScene since these are scene-independent concepts
// (holding an item, walking up to any slot or door, wherever the
// player currently is). Previously nested inside updateAutumnScene,
// which meant any placement slot meant to be used from a different
// scene (like the new forest door's slot, used from spring) would
// never actually be checked.
function updateGenericPlacementAndDoors() {
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
      hasReturnedFromClouds = true; // the willow's real unlock condition

      // close to, visually under the goal cloud — the immunity window
      // below (not distance) is what actually prevents an instant retrigger
      player.x = goalCloud.x + 5;
      player.y = 200;
      player.vy = 0;
      player.vx = 0;
      player.jumping = true;
      player.launched = true;       // reuses the same floaty-descent physics as a failed swing launch
      player.launchPeakHeight = player.y;
      player.cloudLandingImmunity = 1500; // ms grace period before the goal-cloud hit check can fire again
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
  updateRabbitWander(deltaTime);

  // mounting the swing now happens via jump, in handleInput — just run its physics here
  updateSwing(deltaTime);

  updateWiggleBush(deltaTime);
  updateWillow(deltaTime);
  updateDigPlantVine(deltaTime);
  updateSquirrelWander(deltaTime);
  updateTreeSticks(deltaTime);
  updateSnailWander(deltaTime);
  updateGraftTrees(deltaTime);
  updateKnockableFruits(deltaTime);
  updateNPCIdle(squirrel);

  // HOLES — only trip the fall if grounded (player.y<=0) and NOT mid-jump
  // over it; jumping keeps player.y > 0 while crossing the hole's x-range
  if (player.y <= 0) {
    const playerCenterX = player.x + player.width / 2;
    const matchedHole = springHoles.find(h => playerCenterX > h.x && playerCenterX < h.x + h.width);

    if (matchedHole) {
      player.x = matchedHole.x + matchedHole.width / 2 - player.width / 2;
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

  // forward through the new door into forest
  if (
    connections[1].filled &&
    seasonTransition.phase === "idle" &&
    pressedDownNear(
      connections[1].doors.spring.x + connections[1].doors.spring.width / 2,
      0, 30, 6, 6
    )
  ) {
    startSeasonTransition("forest");
  }
}

function update(){

  // console.log("UPDATE START y =", apple.y);

const now = performance.now();
const deltaTime = Math.min((now - lastTime) / 1000, 0.05);
lastTime = now;

  if (bookReader.active || bookReader.opening || bookReader.closing) {
    updateBookReader(deltaTime);
    keys.upJustPressed = false;
    keys.leftJustPressed = false;
    keys.rightJustPressed = false;
    keys.spaceJustPressed = false;
    requestAnimationFrame(update);
    draw();
    return;
  }

  if (carvingUI.active || carvingUI.opening || carvingUI.closing) {
    updateCarvingUI(deltaTime);
    keys.upJustPressed = false;
    keys.leftJustPressed = false;
    keys.rightJustPressed = false;
    keys.spaceJustPressed = false;
    requestAnimationFrame(update);
    draw();
    return;
  }

  handleInput();
  applyPhysics();

  if (currentScene === "autumn") {
    updateHayBales(deltaTime);
    updateTreeCrow(deltaTime);
    updateSmallCrows(deltaTime);
    if (hayBales.toppled) updateBat(deltaTime);
    updateCarvingStation(deltaTime);
    if (!hayBales.toppled) {
      // standing wall -- blocks passage entirely until toppled
      if (player.x + player.width > hayBales.x - 20 && player.x < hayBales.x + 20) {
        if (player.x < hayBales.x) player.x = hayBales.x - 20 - player.width;
        else player.x = hayBales.x + 20;
      }
    } else {
      // toppled -- each bale is now individually jumpable, matching
      // its own actual scattered position and height rather than one
      // flat zone across the whole pile. Finds the single best
      // (highest) matching bale first, since overlapping bales could
      // otherwise have a later one in the array incorrectly override
      // a more correct landing
      const toppledPositions = getHayBaleToppledPositions();
      const BALE_HALF_WIDTH = 15, BALE_HALF_HEIGHT = 13;
      let bestBaleTop = null;
      toppledPositions.forEach(p => {
        const baleX = hayBales.x + p.dx;
        const baleTop = -p.dy + BALE_HALF_HEIGHT;
        if (
          player.x + player.width > baleX - BALE_HALF_WIDTH &&
          player.x < baleX + BALE_HALF_WIDTH &&
          player.y <= baleTop &&
          player.y >= baleTop - 30 &&
          player.vy <= 0
        ) {
          if (bestBaleTop === null || baleTop > bestBaleTop) bestBaleTop = baleTop;
        }
      });
      if (bestBaleTop !== null) {
        player.y = bestBaleTop;
        player.vy = 0;
        player.jumping = false;
        player.usedDoubleJump = false;
      }

      // the carving station's own small platform -- separate from the
      // main pile, only reachable once that pile itself has toppled
      const stationTop = carvingStation.platformHeight;
      if (
        player.x + player.width > carvingStation.x - 30 &&
        player.x < carvingStation.x + 30 &&
        player.y <= stationTop &&
        player.y >= stationTop - 30 &&
        player.vy <= 0
      ) {
        player.y = stationTop;
        player.vy = 0;
        player.jumping = false;
        player.usedDoubleJump = false;
      }

      // decorative hay piles -- all genuinely jumpable now, same
      // landing pattern as every other platform in this area
      decorativeHayPiles.forEach(pile => {
        if (
          player.x + player.width > pile.x - 24 &&
          player.x < pile.x + 24 &&
          player.y <= pile.topHeight &&
          player.y >= pile.topHeight - 30 &&
          player.vy <= 0
        ) {
          player.y = pile.topHeight;
          player.vy = 0;
          player.jumping = false;
          player.usedDoubleJump = false;
        }
      });
    }
  }



updateFallState(deltaTime); // shared — runs before scene dispatch, regardless of which scene started the fall
updateCloudLanding(deltaTime);
updateCrown(deltaTime); // scene-independent — C should work anywhere, not just autumn
if (inventory.boomerang > 0 && !boomerangPromptState.promptEverShown && boomerangPromptState.promptAnimT < CROWN_PROMPT_MATERIALIZE_DURATION) {
  boomerangPromptState.promptAnimT += deltaTime * 1000;
}
updateLampLighting(); // scene-independent check inside, so it correctly turns off if the scene changes mid-hold
updateGenericPlacementAndDoors(); // placement slots and the autumn-side doorway -- runs regardless of current scene

if (currentScene === "autumn") {
  updateAutumnScene(deltaTime);
} else if (currentScene === "spring") {
  updateSpringScene(deltaTime);
} else if (currentScene === "forest") {
  updateForestScene(deltaTime);
} else if (currentScene === "clouds") {
  updateCloudsScene(deltaTime);
} else if (currentScene === "oak") {
  updateOakScene(deltaTime);
} else if (currentScene === "ratroom") {
  updateRatRoomScene(deltaTime);
}

  // throw the boomerang — spacebar while it's held, works in any scene.
  // !boomerangThrow guards against re-triggering while holding the key down.
  if (keys.space && heldItem === "boomerang" && !boomerangThrow) {
    throwBoomerang();
  }
  updateBoomerangThrow(deltaTime);

  if (player.cloudLandingImmunity > 0) player.cloudLandingImmunity -= deltaTime * 1000;

  updateFlyingItems(deltaTime, cameraX); // shared system, runs in any scene

updateSeasonTransition(deltaTime);

  draw();

  const targetCam = player.x - canvas.width*0.4;
  if (hayBales.waiting) {
    // tight during the pause -- just a sliver of space to the right,
    // the tower dominates the frame before anything happens
    cameraX = hayBales.x - (canvas.width - 40);
  } else if (hayBales.toppling) {
    // eases open as the fall actually progresses, revealing more
    // space to the right the further along the topple gets
    const p = Math.min(1, hayBales.toppleT / HAY_BALE_TOPPLE_MS);
    const margin = 40 + p * 260;
    cameraX = hayBales.x - (canvas.width - margin);
  } else {
    cameraX += (targetCam - cameraX)*0.08;
    if (Math.abs(targetCam - cameraX) < 0.1) cameraX = targetCam; // snaps once negligibly close -- the easing formula alone never mathematically settles, causing a perpetual sub-pixel drift in everything drawn relative to the camera
  }
  if (cameraX<0) cameraX=0;
  // ratroom's own right-side camera clamp, mirroring the left-side
  // pattern -- caps the camera a bit past where the hay ground cover
  // actually ends, so the camera stops there even if the player keeps
  // walking on toward their own boundary further out
  if (currentScene === "ratroom" && cameraX > 625) cameraX = 625;

  keys.leftJustPressed = false;
  keys.rightJustPressed = false;
  keys.upJustPressed = false;
  keys.spaceJustPressed = false;
  keys.cJustPressed = false;

  // console.log("UPDATE END y =", apple.y);
  
  requestAnimationFrame(update);
}


updateInventoryUI(); // syncs the display with the initial seeded inventory -- without this, seeded debug items (acorn/lamp/pumpkin) exist in data but never actually render in the UI until something else triggers a refresh
update();


});