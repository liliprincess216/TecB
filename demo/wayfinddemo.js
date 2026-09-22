// Two ways of finding the same destination: Youngblood tries directions,
// while Oldwise follows a shortest route slowly and rests along the way.
const SIZE = 10;
const CELL = 64;
const BOARD = SIZE * CELL;
const DIRECTIONS = [
  { x: 1, y: 0 }, { x: 0, y: 1 },
  { x: -1, y: 0 }, { x: 0, y: -1 }
];
const OLD_THINK_MS = 2100;
const OLD_STEP_MS = 780;
const YOUNG_STEP_MS = OLD_STEP_MS / 2;
const YOUNG_PREFERRED_CHANCE = 0.2;
const YOUNG_WALL_CHANCE = 0.25;
const YOUNG_STUCK_AFTER = 6;
const OLD_REST_MS = 1550;
const WINNER_FLASH_MS = 720;

let world;
let boardCanvas;
let worldButton;
let startButton;

const key = point => point.x + "," + point.y;
const same = (a, b) => a.x === b.x && a.y === b.y;
const inside = point => point.x >= 0 && point.x < SIZE && point.y >= 0 && point.y < SIZE;
const road = (grid, point) => inside(point) && grid[point.y][point.x] === 0;
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
const visitGrid = () => Array.from({ length: SIZE }, () => Array(SIZE).fill(0));

function shortestPath(grid, start, goal) {
  if (!road(grid, start) || !road(grid, goal)) return null;
  const queue = [start];
  const previous = new Map([[key(start), null]]);
  for (let i = 0; i < queue.length; i++) {
    const current = queue[i];
    if (same(current, goal)) {
      const path = [];
      for (let point = current; point; point = previous.get(key(point))) path.push(point);
      return path.reverse();
    }
    for (const direction of DIRECTIONS) {
      const next = { x: current.x + direction.x, y: current.y + direction.y };
      if (!road(grid, next) || previous.has(key(next))) continue;
      previous.set(key(next), current);
      queue.push(next);
    }
  }
  return null;
}

// Keep the largest connected road area. Any two selectable road cells can meet.
function makeWorld(rng = Math.random) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const grid = Array.from({ length: SIZE }, () =>
      Array.from({ length: SIZE }, () => rng() < 0.24 ? 1 : 0)
    );
    const seen = new Set();
    let largest = [];
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      const start = { x, y };
      if (!road(grid, start) || seen.has(key(start))) continue;
      const group = [start];
      seen.add(key(start));
      for (let i = 0; i < group.length; i++) {
        const current = group[i];
        for (const direction of DIRECTIONS) {
          const next = { x: current.x + direction.x, y: current.y + direction.y };
          if (!road(grid, next) || seen.has(key(next))) continue;
          seen.add(key(next));
          group.push(next);
        }
      }
      if (group.length > largest.length) largest = group;
    }
    if (largest.length < 55) continue;
    const connected = new Set(largest.map(key));
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      if (!connected.has(key({ x, y }))) grid[y][x] = 1;
    }
    return grid;
  }
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function weightedChoice(options, weight, rng) {
  let choice = rng() * options.reduce((sum, option) => sum + weight(option), 0);
  for (const option of options) {
    choice -= weight(option);
    if (choice <= 0) return option;
  }
  return options[options.length - 1];
}

function chooseYoungDirection(agent, grid, goal, rng = Math.random) {
  if (agent.correctionSteps > 0) {
    const route = shortestPath(grid, agent.current, goal);
    agent.correctionSteps--;
    if (route && route.length > 1) return { next: route[1], blocked: false, guided: true };
  }

  const hereDistance = distance(agent.current, goal);
  const options = DIRECTIONS.map(direction => {
    const next = { x: agent.current.x + direction.x, y: agent.current.y + direction.y };
    return { next, blocked: !road(grid, next) };
  });
  const roads = options.filter(option => !option.blocked);
  const closer = roads.filter(option => distance(option.next, goal) < hereDistance);
  const freshCloser = closer.filter(option => agent.visits[option.next.y][option.next.x] === 0);
  if (closer.length && rng() < YOUNG_PREFERRED_CHANCE) {
    return weightedChoice(freshCloser.length ? freshCloser : closer,
      option => 1 / (1 + 2 * agent.visits[option.next.y][option.next.x]), rng);
  }

  const unknownWalls = options.filter(option => option.blocked && !agent.knownWalls.has(key(option.next)));
  if (unknownWalls.length && rng() < YOUNG_WALL_CHANCE) {
    return unknownWalls[Math.floor(rng() * unknownWalls.length)];
  }
  return weightedChoice(roads, option =>
    (distance(option.next, goal) < hereDistance ? 1.3 : 1) /
    (1 + 2 * agent.visits[option.next.y][option.next.x]), rng);
}

function setup() {
  document.title = "V3 Final Play";
  document.documentElement.lang = "en";
  addStyles();
  const app = createDiv().id("wayfinder");
  boardCanvas = createCanvas(BOARD, BOARD);
  boardCanvas.parent(app);
  boardCanvas.elt.setAttribute("role", "img");
  boardCanvas.elt.addEventListener("pointerdown", selectPoint);
  worldButton = createButton("New World").id("new-world").parent(app);
  worldButton.attribute("type", "button");
  worldButton.mousePressed(handleWorldButton);
  startButton = createButton("Start").id("start").parent(app);
  startButton.attribute("type", "button");
  startButton.mousePressed(startRace);
  textFont("Georgia");
  textAlign(CENTER, CENTER);
  newWorld();
}

function newWorld() {
  world = {
    grid: makeWorld(),
    start: null,
    goal: null,
    young: null,
    old: null,
    phase: "selecting",
    winner: null,
    winnerRevealEndsAt: 0
  };
  resetWorldButton();
  updateControls();
  updateAccessibility();
}

function resetSelection() {
  world.start = null;
  world.goal = null;
  world.young = null;
  world.old = null;
  world.phase = "selecting";
  world.winner = null;
  world.winnerRevealEndsAt = 0;
  resetWorldButton();
  updateControls();
  updateAccessibility();
}

function resetWorldButton() {
  worldButton.html("New World");
  worldButton.elt.className = "";
}

function handleWorldButton() {
  if (world.phase === "finished") {
    if (performance.now() >= world.winnerRevealEndsAt) resetSelection();
  }
  else newWorld();
}

function selectPoint(event) {
  if (event.button !== 0 || world.phase !== "selecting") return;
  const bounds = boardCanvas.elt.getBoundingClientRect();
  const point = {
    x: Math.floor((event.clientX - bounds.left) * BOARD / bounds.width / CELL),
    y: Math.floor((event.clientY - bounds.top) * BOARD / bounds.height / CELL)
  };
  if (!road(world.grid, point)) return;
  if (!world.start || world.goal) {
    world.start = point;
    world.goal = null;
  } else if (!same(point, world.start)) {
    world.goal = point;
  }
  updateControls();
  updateAccessibility();
  event.preventDefault();
}

function updateControls() {
  if (!startButton) return;
  startButton.elt.disabled = world.phase !== "selecting" || !world.start || !world.goal;
}

function newAgent(start, phase, nextStepAt) {
  const visits = visitGrid();
  visits[start.y][start.x] = 1;
  return {
    current: { ...start },
    visits,
    phase,
    nextStepAt,
    animation: null,
    steps: 0,
    arrivalAt: null
  };
}

function startRace() {
  if (world.phase !== "selecting" || !world.start || !world.goal) return;
  const now = performance.now();
  world.young = {
    ...newAgent(world.start, "walking", now + 250),
    knownWalls: new Set(),
    bestDistance: distance(world.start, world.goal),
    unproductive: 0,
    correctionSteps: 0,
    corrections: 0,
    bumps: 0,
    wallFlash: null
  };
  world.old = {
    ...newAgent(world.start, "thinking", now + OLD_THINK_MS),
    route: shortestPath(world.grid, world.start, world.goal).slice(1),
    stepsToRest: 2 + Math.floor(Math.random() * 2),
    restUntil: 0
  };
  world.phase = "racing";
  updateControls();
  updateAccessibility();
}

function updateYoung(now) {
  const agent = world.young;
  if (agent.phase === "arrived" || now < agent.nextStepAt) return;
  const option = chooseYoungDirection(agent, world.grid, world.goal);
  const from = { ...agent.current };
  agent.animation = { from, to: option.next, blocked: option.blocked,
    began: now, duration: YOUNG_STEP_MS };
  if (option.blocked) {
    agent.bumps++;
    agent.knownWalls.add(key(option.next));
    if (inside(option.next)) agent.wallFlash = { ...option.next, until: now + 220 };
  } else {
    agent.current = option.next;
    agent.visits[option.next.y][option.next.x]++;
    agent.steps++;
    if (same(agent.current, world.goal)) {
      agent.phase = "arrived";
      agent.arrivalAt = now + YOUNG_STEP_MS;
    }
  }
  if (distance(agent.current, world.goal) < agent.bestDistance) {
    agent.bestDistance = distance(agent.current, world.goal);
    agent.unproductive = 0;
  } else if (!option.guided) {
    agent.unproductive++;
  }
  if (agent.unproductive >= YOUNG_STUCK_AFTER) {
    // Each time it gets lost, its brief correction becomes a little more decisive.
    agent.correctionSteps = Math.min(1 + Math.floor(agent.corrections / 2), 5);
    agent.corrections++;
    agent.unproductive = 0;
  }
  agent.nextStepAt = now + YOUNG_STEP_MS;
  updateAccessibility();
}

function updateOld(now) {
  const agent = world.old;
  if (agent.phase === "arrived" || now < agent.nextStepAt) return;
  agent.phase = "walking";
  const next = agent.route.shift();
  const from = { ...agent.current };
  agent.animation = { from, to: next, blocked: false, began: now, duration: OLD_STEP_MS };
  agent.current = next;
  agent.visits[next.y][next.x]++;
  agent.steps++;
  if (same(next, world.goal)) {
    agent.phase = "arrived";
    agent.arrivalAt = now + OLD_STEP_MS;
  } else if (--agent.stepsToRest === 0) {
    agent.phase = "resting";
    agent.restUntil = now + OLD_STEP_MS + OLD_REST_MS;
    agent.nextStepAt = agent.restUntil;
    agent.stepsToRest = 2 + Math.floor(Math.random() * 2);
  } else {
    agent.nextStepAt = now + OLD_STEP_MS;
  }
  updateAccessibility();
}

function finishRace(now) {
  if (!world.young.arrivalAt || !world.old.arrivalAt ||
      now < Math.max(world.young.arrivalAt, world.old.arrivalAt)) return;
  world.phase = "finished";
  world.winner = winnerFor(world.young.arrivalAt, world.old.arrivalAt);
  world.winnerRevealEndsAt = now + WINNER_FLASH_MS;
  worldButton.html(world.winner === "youngblood" ? "World Youngblood" : "World Oldwise");
  worldButton.elt.className = "winner " + world.winner;
  updateAccessibility();
}

function winnerFor(youngArrival, oldArrival) {
  return youngArrival < oldArrival ? "youngblood" : "oldwise";
}

function updateAccessibility() {
  if (!boardCanvas || !world) return;
  const position = point => point ? (point.x + 1) + ", " + (point.y + 1) : "not selected";
  const young = world.young;
  const old = world.old;
  boardCanvas.elt.setAttribute("aria-label",
    "10 by 10 map. A " + position(world.start) + ". B " + position(world.goal) +
    ". " + (young ? "Youngblood " + position(young.current) + ", " + young.phase +
      ", " + young.steps + " moves, " + young.bumps + " wall bumps. " : "") +
    (old ? "Oldwise " + position(old.current) + ", " + old.phase +
      ", " + old.steps + " moves. " : "") +
    (world.winner ? "Winner: " + world.winner + "." : "")
  );
  boardCanvas.elt.dataset.phase = world.phase;
  boardCanvas.elt.dataset.winner = world.winner || "";
  boardCanvas.elt.dataset.youngSteps = young ? String(young.steps) : "0";
  boardCanvas.elt.dataset.oldSteps = old ? String(old.steps) : "0";
}

function draw() {
  background(255);
  if (!world) return;
  const now = performance.now();
  if (world.phase === "racing") {
    updateYoung(now);
    updateOld(now);
    finishRace(now);
  }
  drawGrid(now);
  if (world.start) drawMarker(world.start, "A");
  if (world.goal) drawMarker(world.goal, "B");
  if (world.young && world.old) drawAgents(now);
}

function drawGrid(now) {
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const px = x * CELL;
    const py = y * CELL;
    const wall = world.grid[y][x] === 1;
    noStroke();
    fill(wall ? "#273449" : "#ffffff");
    rect(px, py, CELL, CELL);
    if (!wall && world.young && world.young.visits[y][x]) {
      fill(255, 0, 0, Math.min(world.young.visits[y][x] * 0.2, 0.9) * 255);
      rect(px + 1, py + 1, CELL - 2, CELL - 2);
    }
    if (!wall && world.old && world.old.visits[y][x]) {
      fill(0, 0, 255, Math.min(world.old.visits[y][x] * 0.2, 0.9) * 255);
      rect(px + 1, py + 1, CELL - 2, CELL - 2);
    }
    const flash = world.young && world.young.wallFlash;
    if (flash && now < flash.until && flash.x === x && flash.y === y) {
      fill(255, 0, 0, 95);
      rect(px, py, CELL, CELL);
    }
    noFill();
    stroke("#d9dfe8");
    strokeWeight(1);
    rect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);
  }
}

function drawMarker(point, label) {
  const cx = (point.x + 0.5) * CELL;
  const cy = (point.y + 0.5) * CELL;
  noStroke();
  fill("#273449");
  circle(cx, cy, 36);
  fill("#ffffff");
  textSize(19);
  text(label, cx, cy);
}

function agentPosition(agent, now) {
  let x = (agent.current.x + 0.5) * CELL;
  let y = (agent.current.y + 0.5) * CELL;
  const animation = agent.animation;
  if (animation) {
    const progress = Math.min(1, (now - animation.began) / animation.duration);
    if (animation.blocked) {
      const nudge = Math.sin(progress * Math.PI) * 10;
      x = (animation.from.x + 0.5) * CELL +
        (animation.to.x - animation.from.x) * nudge;
      y = (animation.from.y + 0.5) * CELL +
        (animation.to.y - animation.from.y) * nudge;
    } else {
      const ease = progress * progress * (3 - 2 * progress);
      x = (animation.from.x + 0.5 +
        (animation.to.x - animation.from.x) * ease) * CELL;
      y = (animation.from.y + 0.5 +
        (animation.to.y - animation.from.y) * ease) * CELL;
    }
  }
  return { x, y };
}

function drawAgents(now) {
  const red = agentPosition(world.young, now);
  const blue = agentPosition(world.old, now);
  if (Math.hypot(red.x - blue.x, red.y - blue.y) < 29) {
    red.x -= 13;
    blue.x += 13;
  }
  noStroke();
  fill(255, 0, 0);
  circle(red.x, red.y, 30);
  fill(0, 0, 255);
  circle(blue.x, blue.y, 29 + Math.sin(now / 200) * 5);
}

function addStyles() {
  const style = document.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; }
    html, body { min-height: 100%; }
    body { margin: 0; background: #fff; color: #273449; font-family: Georgia, "Times New Roman", serif; }
    #wayfinder { width: min(640px, calc(100vw - 40px), calc(100vh - 190px)); margin: 20px auto; }
    #wayfinder canvas { display: block; width: 100% !important; height: auto !important; cursor: crosshair; touch-action: manipulation; }
    #wayfinder button { display: block; width: 100%; height: 58px; border: 1px solid #273449; background: #fff; color: #273449; font: 22px Georgia, "Times New Roman", serif; cursor: pointer; }
    #new-world { margin-top: 18px; }
    #start { margin-top: 10px; }
    #wayfinder button:hover:not(:disabled):not(.winner) { background: #273449; color: #fff; }
    #wayfinder button:disabled { color: #9ba5b4; border-color: #c8ced8; cursor: not-allowed; }
    #wayfinder button:focus-visible { outline: 3px solid #273449; outline-offset: 3px; }
    #wayfinder button.winner { color: #fff; animation: winner-flash .24s linear 3; }
    #wayfinder button.winner.youngblood { background: #ff0000; border-color: #ff0000; }
    #wayfinder button.winner.oldwise { background: #0000ff; border-color: #0000ff; }
    @keyframes winner-flash { 0%, 100% { opacity: 1; } 50% { opacity: .16; } }
    @media (prefers-reduced-motion: reduce) { #wayfinder button.winner { animation-duration: .01s; } }
  `;
  document.head.appendChild(style);
}

if (typeof module !== "undefined") {
  module.exports = { shortestPath, makeWorld, chooseYoungDirection, winnerFor };
}
