// A wandering wayfinder: random trial, a small memory of visited cells, and a
// time guard that ensures a reachable destination is found within 20 seconds.
const SIZE = 10;
const CELL = 64;
const BOARD = SIZE * CELL;
const STEP_MS = 145;
const GUIDE_AFTER_MS = 11000;
const FINISH_BY_MS = 19000;
const DIRECTIONS = [
  { x: 1, y: 0 }, { x: 0, y: 1 },
  { x: -1, y: 0 }, { x: 0, y: -1 }
];

let world;
let boardCanvas;

const key = point => point.x + "," + point.y;
const same = (a, b) => a.x === b.x && a.y === b.y;
const inside = point => point.x >= 0 && point.x < SIZE && point.y >= 0 && point.y < SIZE;
const road = (grid, point) => inside(point) && grid[point.y][point.x] === 0;
const distance = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);

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

function makeWorld(rng = Math.random) {
  for (let attempt = 0; attempt < 100; attempt++) {
    const grid = Array.from({ length: SIZE }, () =>
      Array.from({ length: SIZE }, () => rng() < 0.24 ? 1 : 0)
    );
    const open = [];
    for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
      if (grid[y][x] === 0) open.push({ x, y });
    }
    if (open.length < 55) continue;
    const start = open[Math.floor(rng() * open.length)];
    const startHasWall = DIRECTIONS.some(d =>
      !road(grid, { x: start.x + d.x, y: start.y + d.y }));
    if (!startHasWall) continue;
    const possible = open.filter(point =>
      distance(start, point) >= 11 && shortestPath(grid, start, point));
    if (possible.length) {
      const goal = possible[Math.floor(rng() * possible.length)];
      return { grid, start, goal };
    }
  }
  const grid = Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
  return { grid, start: { x: 0, y: 0 }, goal: { x: 9, y: 9 } };
}

function weightedDirection(state, rng = Math.random) {
  const options = DIRECTIONS.map(direction => {
    const next = { x: state.current.x + direction.x, y: state.current.y + direction.y };
    const blocked = !road(state.grid, next);
    const visits = blocked ? 0 : state.visits[next.y][next.x];
    let weight = blocked ? 0.56 : 1 / (1 + visits * 0.75);
    if (distance(next, state.goal) < distance(state.current, state.goal)) weight *= 1.4;
    if (state.previous && same(next, state.previous)) weight *= 0.65;
    return { next, blocked, weight };
  });
  let choice = rng() * options.reduce((sum, option) => sum + option.weight, 0);
  for (const option of options) {
    choice -= option.weight;
    if (choice <= 0) return option;
  }
  return options[options.length - 1];
}

function setup() {
  document.title = "A Wandering Wayfinder";
  document.documentElement.lang = "en";
  addStyles();
  const app = createDiv().id("wayfinder");
  boardCanvas = createCanvas(BOARD, BOARD);
  boardCanvas.parent(app);
  boardCanvas.elt.setAttribute("role", "img");
  const button = createButton("New World").id("new-world").parent(app);
  button.attribute("type", "button");
  button.mousePressed(newWorld);
  textFont("Georgia");
  textAlign(CENTER, CENTER);
  newWorld();
}

function newWorld() {
  const next = makeWorld();
  const now = performance.now();
  world = {
    ...next,
    current: { ...next.start },
    previous: null,
    visits: Array.from({ length: SIZE }, () => Array(SIZE).fill(0)),
    phase: "walking",
    startedAt: now,
    nextStepAt: now + 450,
    animation: null,
    guide: null,
    wallFlash: null,
    steps: 0,
    bumps: 0
  };
  world.visits[next.start.y][next.start.x] = 1;
  updateAccessibility();
}

function updateAccessibility() {
  if (!world || !boardCanvas) return;
  const { start, goal, current, phase, steps, bumps } = world;
  boardCanvas.elt.setAttribute("aria-label",
    "10 by 10 map. Start " + (start.x + 1) + ", " + (start.y + 1) +
    ". Destination " + (goal.x + 1) + ", " + (goal.y + 1) +
    ". Walker at " + (current.x + 1) + ", " + (current.y + 1) +
    ". " + steps + " moves, " + bumps + " wall bumps. " + phase + "."
  );
  boardCanvas.elt.dataset.phase = phase;
  boardCanvas.elt.dataset.steps = String(steps);
  boardCanvas.elt.dataset.bumps = String(bumps);
  boardCanvas.elt.dataset.elapsedMs = String(Math.round(performance.now() - world.startedAt));
}

function advance(now) {
  if (!world || world.phase !== "walking" || now < world.nextStepAt) return;
  const elapsed = now - world.startedAt;
  if (!world.guide && elapsed >= GUIDE_AFTER_MS) {
    world.guide = shortestPath(world.grid, world.current, world.goal).slice(1);
  }
  const option = world.guide
    ? { next: world.guide.shift(), blocked: false }
    : weightedDirection(world);
  const from = { ...world.current };
  const remaining = world.guide ? world.guide.length + 1 : 0;
  const duration = world.guide
    ? Math.max(35, Math.min(STEP_MS, (FINISH_BY_MS - elapsed) / (remaining + 1)))
    : STEP_MS;
  world.animation = { from, to: option.next, blocked: option.blocked, began: now, duration };
  if (option.blocked) {
    world.bumps++;
    if (inside(option.next)) world.wallFlash = { ...option.next, until: now + 220 };
  } else {
    world.previous = from;
    world.current = option.next;
    world.visits[option.next.y][option.next.x]++;
    world.steps++;
    if (same(world.current, world.goal)) world.phase = "arrived";
  }
  world.nextStepAt = now + duration;
  updateAccessibility();
}

function draw() {
  background(255);
  if (!world) return;
  const now = performance.now();
  advance(now);
  drawGrid(now);
  drawGoal();
  drawWalker(now);
}

function drawGrid(now) {
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    const px = x * CELL;
    const py = y * CELL;
    const isWall = world.grid[y][x] === 1;
    noStroke();
    fill(isWall ? "#273449" : "#ffffff");
    rect(px, py, CELL, CELL);
    if (!isWall && world.visits[y][x]) {
      fill(255, 0, 0, Math.min(world.visits[y][x] * 0.2, 0.9) * 255);
      rect(px + 1, py + 1, CELL - 2, CELL - 2);
    }
    if (world.wallFlash && now < world.wallFlash.until &&
        world.wallFlash.x === x && world.wallFlash.y === y) {
      fill(255, 0, 0, 95);
      rect(px, py, CELL, CELL);
    }
    noFill();
    stroke("#d9dfe8");
    strokeWeight(1);
    rect(px + 0.5, py + 0.5, CELL - 1, CELL - 1);
  }
}

function drawGoal() {
  const cx = (world.goal.x + 0.5) * CELL;
  const cy = (world.goal.y + 0.5) * CELL;
  noFill();
  stroke("#003cff");
  strokeWeight(3);
  circle(cx, cy, 37);
  noStroke();
  fill("#273449");
  textSize(15);
  text("B", cx, cy);
}

function drawWalker(now) {
  let x = (world.current.x + 0.5) * CELL;
  let y = (world.current.y + 0.5) * CELL;
  const animation = world.animation;
  if (animation) {
    const progress = Math.min(1, (now - animation.began) / animation.duration);
    if (animation.blocked) {
      const nudge = Math.sin(progress * Math.PI) * 10;
      x = (animation.from.x + 0.5) * CELL + (animation.to.x - animation.from.x) * nudge;
      y = (animation.from.y + 0.5) * CELL + (animation.to.y - animation.from.y) * nudge;
    } else {
      const ease = progress * progress * (3 - 2 * progress);
      x = (animation.from.x + 0.5 + (animation.to.x - animation.from.x) * ease) * CELL;
      y = (animation.from.y + 0.5 + (animation.to.y - animation.from.y) * ease) * CELL;
    }
  }
  noStroke();
  fill(255, 0, 0);
  circle(x, y, 30);
  if (world.phase === "arrived") {
    noFill();
    stroke(255, 0, 0, 110);
    strokeWeight(2);
    circle(x, y, 39 + Math.sin(now / 230) * 3);
  }
}

function addStyles() {
  const style = document.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; }
    html, body { min-height: 100%; }
    body { margin: 0; background: #fff; color: #273449; font-family: Georgia, "Times New Roman", serif; }
    #wayfinder { width: min(640px, calc(100vw - 40px), calc(100vh - 120px)); margin: 34px auto; }
    #wayfinder canvas { display: block; width: 100% !important; height: auto !important; }
    #new-world { display: block; width: 100%; height: 58px; margin-top: 18px; border: 1px solid #273449; background: #fff; color: #273449; font: 22px Georgia, "Times New Roman", serif; cursor: pointer; }
    #new-world:hover { background: #273449; color: #fff; }
    #new-world:focus-visible { outline: 3px solid #ff0000; outline-offset: 3px; }
  `;
  document.head.appendChild(style);
}

if (typeof module !== "undefined") {
  module.exports = { shortestPath, makeWorld, weightedDirection };
}
