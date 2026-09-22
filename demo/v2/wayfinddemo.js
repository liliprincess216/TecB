// WAYFINDING V2
// Two views of the same 10 × 10 map:
// V1 exposes breadth-first search; V2 presents up to three shortest routes.

const GRID_SIZE = 10;
const CELL = 54;
const GRID_PIXELS = GRID_SIZE * CELL;
const CANVAS_WIDTH = 1680;
const CANVAS_HEIGHT = 610;
const GRID_TOP = 52;
const LEFT_X = 175;
const RIGHT_X = 965;
const CHECK_INTERVAL = 1000 / 6; // Six checked cells per second.
const DIRECTIONS = [[1, 0], [0, 1], [-1, 0], [0, -1]];

let mapGrid;
let startPoint = null;
let endPoint = null;
let canvas;

let v1Result = null;
let v1VisibleSteps = 0;
let v1Timer = null;
let v1Running = false;

let v2Paths = [];
let v2StartedAt = 0;
let v2Running = false;

let queueTrack;
let queueResult;
let queuePanel;
let routeOptions;
let startV1Button;
let startV2Button;

function emptyGrid() {
  return Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(0));
}

function pointKey(point) {
  return `${point.x},${point.y}`;
}

function samePoint(a, b) {
  return Boolean(a && b && a.x === b.x && a.y === b.y);
}

function inside(point) {
  return point.x >= 0 && point.x < GRID_SIZE && point.y >= 0 && point.y < GRID_SIZE;
}

function isRoad(map, point) {
  return inside(point) && map[point.y][point.x] === 0;
}

function pointLabel(point) {
  return `(${point.x + 1}, ${point.y + 1})`;
}

// 0 = road, 1 = water, 2 = building. V1 treats both 1 and 2 as walls.
function randomGrid(rng = Math.random) {
  const map = emptyGrid();
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      if (rng() < 0.27) map[y][x] = rng() < 0.42 ? 1 : 2;
    }
  }
  map[0][0] = 0;
  map[GRID_SIZE - 1][GRID_SIZE - 1] = 0;
  return map;
}

// V1: ordinary breadth-first search with a queue snapshot after every check.
function breadthFirstSearch(map, from, to) {
  if (!isRoad(map, from) || !isRoad(map, to)) {
    return { path: null, visited: [], trace: [], reason: "A or B is not on a road." };
  }

  const queue = [[{ ...from }]];
  const seen = new Set([pointKey(from)]);
  const visited = [];
  const trace = [];

  while (queue.length > 0) {
    const path = queue.shift();
    const current = path[path.length - 1];
    const step = { point: current, moves: path.length - 1, added: [], queueAfter: [] };
    visited.push(current);

    if (samePoint(current, to)) {
      step.found = true;
      trace.push(step);
      return { path, visited, trace, reason: "" };
    }

    for (const [dx, dy] of DIRECTIONS) {
      const next = { x: current.x + dx, y: current.y + dy };
      if (!isRoad(map, next) || seen.has(pointKey(next))) continue;
      seen.add(pointKey(next));
      const nextPath = [...path, next];
      queue.push(nextPath);
      step.added.push({ point: next, moves: nextPath.length - 1 });
    }

    step.queueAfter = queue.map(candidate => ({
      point: candidate[candidate.length - 1],
      moves: candidate.length - 1
    }));
    trace.push(step);
  }

  return { path: null, visited, trace, reason: "The queue is empty. B cannot be reached." };
}

// V2: get distance to every road cell, then follow distance values backward.
// Following only distance - 1 guarantees that every returned route is shortest.
function findShortestPaths(map, from, to, limit = 3) {
  if (!isRoad(map, from) || !isRoad(map, to)) return [];

  const distance = Array.from({ length: GRID_SIZE }, () => Array(GRID_SIZE).fill(Infinity));
  const queue = [{ ...from }];
  distance[from.y][from.x] = 0;

  for (let index = 0; index < queue.length; index++) {
    const current = queue[index];
    for (const [dx, dy] of DIRECTIONS) {
      const next = { x: current.x + dx, y: current.y + dy };
      if (!isRoad(map, next) || distance[next.y][next.x] !== Infinity) continue;
      distance[next.y][next.x] = distance[current.y][current.x] + 1;
      queue.push(next);
    }
  }

  if (distance[to.y][to.x] === Infinity) return [];

  const routes = [];
  const reversedPath = [{ ...to }];

  function walkBackward(current) {
    if (routes.length >= limit) return;
    if (samePoint(current, from)) {
      routes.push([...reversedPath].reverse());
      return;
    }

    for (const [dx, dy] of [[-1, 0], [0, -1], [1, 0], [0, 1]]) {
      const previous = { x: current.x + dx, y: current.y + dy };
      if (!inside(previous)) continue;
      if (distance[previous.y][previous.x] !== distance[current.y][current.x] - 1) continue;
      reversedPath.push(previous);
      walkBackward(previous);
      reversedPath.pop();
      if (routes.length >= limit) return;
    }
  }

  walkBackward(to);
  return routes;
}

function setup() {
  document.documentElement.lang = "en";
  document.title = "Wayfinding — Process / Result";
  addStyles();
  mapGrid = randomGrid();

  const app = createDiv().id("wayfinding-app");
  const resetButton = createButton("Reset Map").id("reset-map").parent(app);
  resetButton.attribute("type", "button");
  resetButton.mousePressed(resetMap);

  canvas = createCanvas(CANVAS_WIDTH, CANVAS_HEIGHT);
  canvas.parent(app);
  canvas.elt.setAttribute("tabindex", "0");
  canvas.elt.setAttribute("aria-label", "Two synchronized 10 by 10 pathfinding grids. Click a road cell to choose A, then click another road cell to choose B.");
  canvas.elt.addEventListener("pointerdown", handleCanvasPointer);

  const actions = createDiv().class("action-row").parent(app);
  startV1Button = createButton("Start V1").parent(actions);
  startV2Button = createButton("Start V2").parent(actions);
  startV1Button.attribute("type", "button");
  startV2Button.attribute("type", "button");
  startV1Button.mousePressed(startV1);
  startV2Button.mousePressed(startV2);

  const lower = createDiv().class("lower-row").parent(app);
  queuePanel = createDiv().class("queue-panel is-hidden").parent(lower);
  queueTrack = createDiv().class("queue-track").parent(queuePanel);
  queueResult = createP("").class("queue-result").parent(queuePanel);

  const resultPanel = createDiv().class("result-panel").parent(lower);
  routeOptions = createDiv().class("route-options").parent(resultPanel);

  textFont("Georgia");
  textAlign(CENTER, CENTER);
  strokeCap(ROUND);
  updateButtons();
}

function handleCanvasPointer(event) {
  if (event.button !== 0 || v1Running || v2Running) return;
  const bounds = canvas.elt.getBoundingClientRect();
  const px = (event.clientX - bounds.left) * CANVAS_WIDTH / bounds.width;
  const py = (event.clientY - bounds.top) * CANVAS_HEIGHT / bounds.height;
  let originX = null;
  if (px >= LEFT_X && px < LEFT_X + GRID_PIXELS) originX = LEFT_X;
  if (px >= RIGHT_X && px < RIGHT_X + GRID_PIXELS) originX = RIGHT_X;
  if (originX === null) return;
  const point = { x: Math.floor((px - originX) / CELL), y: Math.floor((py - GRID_TOP) / CELL) };
  if (!isRoad(mapGrid, point)) {
    return;
  }

  if (!startPoint || endPoint) {
    clearAnimations();
    startPoint = point;
    endPoint = null;
  } else {
    endPoint = point;
  }
  updateButtons();
  event.preventDefault();
}

function resetMap() {
  let next = randomGrid();
  if (JSON.stringify(next) === JSON.stringify(mapGrid)) next[0][1] = next[0][1] ? 0 : 2;
  mapGrid = next;
  startPoint = null;
  endPoint = null;
  clearAnimations();
  updateButtons();
}

function clearAnimations() {
  if (v1Timer) clearInterval(v1Timer);
  v1Timer = null;
  v1Running = false;
  v1Result = null;
  v1VisibleSteps = 0;
  v2Paths = [];
  v2Running = false;
  resetQueue();
  if (queuePanel) queuePanel.addClass("is-hidden");
  renderRouteOptions([]);
}

function validSelection() {
  return Boolean(startPoint && endPoint && isRoad(mapGrid, startPoint) && isRoad(mapGrid, endPoint));
}

function updateButtons() {
  const disabled = !validSelection();
  startV1Button.elt.disabled = disabled || v1Running;
  startV2Button.elt.disabled = disabled || v2Running;
}

function startV1() {
  if (!validSelection() || v1Running) return;
  if (v1Timer) clearInterval(v1Timer);
  v1Result = breadthFirstSearch(mapGrid, startPoint, endPoint);
  v1VisibleSteps = 0;
  v1Running = true;
  queuePanel.removeClass("is-hidden");
  resetQueue();
  appendQueueItems([{ point: startPoint, moves: 0 }]);
  updateButtons();

  v1Timer = setInterval(() => {
    const step = v1Result.trace[v1VisibleSteps];
    if (!step) {
      finishV1();
      return;
    }
    v1VisibleSteps += 1;
    appendQueueItems(step.added);
    if (step.found || v1VisibleSteps >= v1Result.trace.length) finishV1();
  }, CHECK_INTERVAL);
}

function finishV1() {
  if (v1Timer) clearInterval(v1Timer);
  v1Timer = null;
  v1Running = false;
  if (v1Result.path) {
    queueResult.html("");
  } else {
    queueResult.html("Unreachable");
  }
  updateButtons();
}

function resetQueue() {
  if (!queueTrack) return;
  queueTrack.html("");
  if (queueResult) queueResult.html("");
}

function appendQueueItems(items) {
  if (!queueTrack || items.length === 0) return;
  const html = items.map(item => queueChip(item.point, item.moves)).join("");
  queueTrack.elt.insertAdjacentHTML("beforeend", html);
}

function queueChip(point, moves) {
  return `<span class="queue-chip" title="${pointLabel(point)} · ${moves} moves">${point.x + 1},${point.y + 1}</span>`;
}

function startV2() {
  if (!validSelection() || v2Running) return;
  v2Paths = findShortestPaths(mapGrid, startPoint, endPoint, 3);
  v2StartedAt = millis();
  v2Running = v2Paths.length > 0;
  renderRouteOptions(v2Paths, true);
  updateButtons();
}

function renderRouteOptions(paths, complete = false) {
  if (!routeOptions) return;
  if (!complete) {
    routeOptions.html("");
    return;
  }
  if (paths.length === 0) {
    routeOptions.html('<p class="unreachable">Unreachable</p>');
    return;
  }
  const colors = ["#0066ff", "#ff8a00", "#00a85a"];
  routeOptions.html(paths.map((path, index) => (
    `<p class="route-option"><span style="background:${colors[index]}"></span>Option ${index + 1}</p>`
  )).join(""));
}

function draw() {
  background("#ffffff");
  drawColumnLabel("V1 / Search Process", LEFT_X);
  drawColumnLabel("V2 / Final Result", RIGHT_X);
  drawGrid(LEFT_X, "process");
  drawGrid(RIGHT_X, "map");
  drawV1Overlay();
  drawV2Overlay();
  drawMarkers(LEFT_X);
  drawMarkers(RIGHT_X);
}

function drawColumnLabel(label, x) {
  push();
  noStroke();
  fill("#273449");
  textAlign(LEFT, CENTER);
  textSize(15);
  textStyle(NORMAL);
  text(label, x, 25);
  pop();
}

function drawGrid(originX, mode) {
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      const type = mapGrid[y][x];
      if (mode === "process") {
        fill(type === 0 ? "#ffffff" : "#273449");
        stroke("#d8dde4");
      } else {
        fill(type === 0 ? "#ffffff" : type === 1 ? "#c8e8f4" : "#d8d9d5");
        stroke("#e3e7ed");
      }
      strokeWeight(mode === "map" ? 2 : 1);
      rect(originX + x * CELL, GRID_TOP + y * CELL, CELL, CELL, 3);
    }
  }

  push();
  noStroke();
  fill("#273449");
  textFont("Georgia");
  textSize(12);
  for (let i = 0; i < GRID_SIZE; i++) {
    text(i + 1, originX + (i + 0.5) * CELL, GRID_TOP - 13);
    text(i + 1, originX - 16, GRID_TOP + (i + 0.5) * CELL);
  }
  pop();
}

function drawV1Overlay() {
  if (!v1Result) return;
  const visible = v1Result.trace.slice(0, v1VisibleSteps);

  for (const step of visible) {
    const cx = LEFT_X + (step.point.x + 0.5) * CELL;
    const cy = GRID_TOP + (step.point.y + 0.5) * CELL;
    push();
    noFill();
    stroke("#e24b4b");
    strokeWeight(3);
    circle(cx, cy, 19);
    noStroke();
    fill("#273449");
    textAlign(LEFT, TOP);
    textFont("Georgia");
    textSize(11);
    text(step.moves, LEFT_X + step.point.x * CELL + 5, GRID_TOP + step.point.y * CELL + 4);
    pop();
  }

  if (!v1Running && v1Result.path) {
    drawPath(v1Result.path, LEFT_X, "#3157d5", v1Result.path.length - 1);
  }
}

function drawV2Overlay() {
  if (v2Paths.length === 0) return;
  const elapsed = millis() - v2StartedAt;
  const longestSegments = v2Paths[0].length - 1;
  const visibleSegments = Math.min(longestSegments, elapsed / 115);
  const colors = ["#0066ff", "#ff8a00", "#00a85a"];

  for (let i = 0; i < v2Paths.length; i++) {
    drawPath(v2Paths[i], RIGHT_X, colors[i], visibleSegments, (i - 1) * 4);
  }

  if (v2Running && visibleSegments >= longestSegments) {
    v2Running = false;
    updateButtons();
  }
}

function drawPath(path, originX, color, visibleSegments, offset = 0) {
  const complete = Math.floor(visibleSegments);
  const fraction = visibleSegments - complete;
  push();
  noFill();
  stroke(color);
  strokeWeight(5);
  strokeCap(ROUND);
  strokeJoin(ROUND);
  beginShape();
  const lastFullPoint = Math.min(complete, path.length - 1);
  for (let i = 0; i <= lastFullPoint; i++) {
    vertex(originX + (path[i].x + 0.5) * CELL + offset, GRID_TOP + (path[i].y + 0.5) * CELL + offset);
  }
  if (complete < path.length - 1 && fraction > 0) {
    const a = path[complete];
    const b = path[complete + 1];
    vertex(
      originX + (a.x + 0.5 + (b.x - a.x) * fraction) * CELL + offset,
      GRID_TOP + (a.y + 0.5 + (b.y - a.y) * fraction) * CELL + offset
    );
  }
  endShape();
  pop();
}

function drawMarkers(originX) {
  if (startPoint) drawMarker(originX, startPoint, samePoint(startPoint, endPoint) ? "A/B" : "A", "rgb(0, 0, 255)", "#ffffff");
  if (endPoint && !samePoint(startPoint, endPoint)) drawMarker(originX, endPoint, "B", "rgb(255, 0, 0)", "#ffffff");
}

function drawMarker(originX, point, label, fillColor, textColor) {
  const cx = originX + (point.x + 0.5) * CELL;
  const cy = GRID_TOP + (point.y + 0.5) * CELL;
  push();
  stroke("#ffffff");
  strokeWeight(3);
  fill(fillColor);
  circle(cx, cy, 34);
  noStroke();
  fill(textColor);
  textFont("Georgia");
  textStyle(NORMAL);
  textSize(label === "A/B" ? 11 : 17);
  text(label, cx, cy);
  pop();
}

function addStyles() {
  const style = document.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; }
    html, body { min-height: 100%; }
    body { margin: 0; background: #ffffff; color: #273449; font: 16px/1.45 Georgia, "Times New Roman", serif; }
    button { font: inherit; color: inherit; background: transparent; border: 1px solid #9da8b7; border-radius: 0; min-height: 48px; cursor: pointer; transition: color .15s, background .15s, border-color .15s; }
    button:hover:not(:disabled) { color: #273449; background: #f2f4f7; border-color: #273449; }
    button:focus-visible { outline: 3px solid #e24b4b; outline-offset: 3px; }
    button:disabled { cursor: not-allowed; opacity: .38; }
    #wayfinding-app { width: min(1760px, calc(100vw - 64px)); margin: 28px auto 42px; }
    #reset-map { display: block; width: 79.1667%; margin-left: 10.4167%; letter-spacing: .04em; }
    canvas { display: block; width: 100% !important; height: auto !important; margin-top: 18px; touch-action: manipulation; cursor: crosshair; }
    canvas:focus-visible { outline: 2px solid #3157d5; outline-offset: 4px; }
    .action-row, .lower-row { display: grid; grid-template-columns: 10.4167% 32.1429% 14.881% 32.1429% 10.4165%; }
    .action-row > :first-child, .lower-row > :first-child { grid-column: 2; }
    .action-row > :last-child, .lower-row > :last-child { grid-column: 4; }
    .action-row { margin-top: 14px; }
    .action-row button { width: 100%; }
    .lower-row { align-items: start; margin-top: 18px; }
    .queue-panel, .result-panel { min-width: 0; }
    .is-hidden { display: none; }
    h2 { margin: 0; font: 400 18px/1.2 Georgia, "Times New Roman", serif; }
    .queue-track { display: grid; grid-template-columns: repeat(20, minmax(0, 1fr)); gap: 4px 3px; width: 100%; margin-top: 8px; }
    .queue-chip { display: grid; place-items: center; justify-self: center; width: 24px; height: 24px; border: 1.5px solid rgb(255, 0, 0); border-radius: 50%; color: #273449; font: 7px/1 Georgia, "Times New Roman", serif; animation: queue-enter .22s ease-out both; }
    .queue-result, .unreachable { margin: 8px 0 0; color: #273449; font: 14px/1.3 Georgia, "Times New Roman", serif; }
    .route-options { display: grid; gap: 3px; }
    .route-option { display: flex; align-items: center; gap: 10px; margin: 0; color: #273449; font: 18px/1.25 Georgia, "Times New Roman", serif; }
    .route-option span { display: inline-block; width: 28px; height: 4px; }
    @keyframes queue-enter { from { opacity: 0; transform: translateY(-6px) scale(.75); } to { opacity: 1; transform: translateY(0) scale(1); } }
    @media (max-width: 900px) {
      #wayfinding-app { width: min(100% - 24px, 1760px); margin-top: 12px; }
      #reset-map { width: 94%; margin-left: 3%; }
      .action-row, .lower-row { grid-template-columns: 1fr 1fr; gap: 5%; margin: 0 3%; }
      .action-row > :first-child, .lower-row > :first-child,
      .action-row > :last-child, .lower-row > :last-child { grid-column: auto; }
      .lower-row { grid-template-columns: 1fr; }
      .result-panel { margin-top: 18px; }
      .queue-track { grid-template-columns: repeat(10, minmax(0, 1fr)); }
    }
  `;
  document.head.appendChild(style);
}

if (typeof module !== "undefined") {
  module.exports = { breadthFirstSearch, findShortestPaths, randomGrid, emptyGrid };
}
