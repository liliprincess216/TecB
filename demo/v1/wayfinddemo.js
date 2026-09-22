// BFS 寻路小实验 · 将本文件全部粘贴到 p5.js 编辑器的 sketch.js。
// 阅读顺序：1. 数据 → 2. BFS 算法 → 3. 地图和点击 → 4. 界面。
// 0 = 道路；1 = 障碍。坐标在代码里从 0 开始，界面里从 1 开始。

// ── 1. 系统需要记住什么？ ──────────────────────────────
const SIZE = 10;
const CELL = 46;
const MARGIN = 30;
const BOARD = SIZE * CELL + MARGIN * 2;
let grid, start = null, goal = null, result = null;
let keyboardCell = { x: 0, y: 0 };
let processStatus, processBody, canvas;

function emptyGrid() {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0));
}

function samePoint(a, b) {
  return a && b && a.x === b.x && a.y === b.y;
}

// ── 2. BFS：像排队一样，先加入的先检查 ─────────────────
// 先找 1 步能到的格子，再找 2 步、3 步……不需要打分或估计距离。
// 为了让这个小模型更好读，队列直接保存整条路线。
function breadthFirstSearch(map, from, to) {
  const rows = map.length, cols = map[0].length;
  const inside = p => p.x >= 0 && p.x < cols && p.y >= 0 && p.y < rows;
  const key = p => `${p.x},${p.y}`;
  if (!inside(from) || !inside(to)) {
    return { path: null, visited: [], trace: [], reason: "A or B is outside the map." };
  }
  if (map[from.y][from.x] === 1 || map[to.y][to.x] === 1) {
    return { path: null, visited: [], trace: [], reason: "A or B is on an obstacle. Search cannot start." };
  }

  const queue = [[{ ...from }]]; // 排队等待检查的路线；一开始只有起点。
  const seen = new Set([key(from)]); // 加入队列就做记号，避免重复加入。
  const visited = [];
  const trace = []; // 仅记录过程，供界面显示，不参与寻路决定。

  while (queue.length > 0) {
    const path = queue.shift(); // 从队伍最前面拿一条路线。
    const current = path[path.length - 1]; // 检查路线末端的格子。
    visited.push(current);
    const step = { point: current, moves: path.length - 1, added: [], remaining: queue.length };
    trace.push(step);

    // 每步成本都是 1，所以第一次检查到终点，这条路就是最短的。
    if (samePoint(current, to)) {
      return { path, visited, trace, reason: "" };
    }

    // 只准向右、向下、向左、向上走；不准斜走。
    for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]]) {
      const next = { x: current.x + dx, y: current.y + dy };
      // 超出边界、撞墙、已经找到过的格子，都跳过。
      if (!inside(next) || map[next.y][next.x] === 1 || seen.has(key(next))) continue;

      seen.add(key(next));
      queue.push([...path, next]); // 在当前路线后加一格，放到队伍最后。
      step.added.push(next);
    }
    step.remaining = queue.length;
  }
  // 队伍空了，还没有找到终点：没有可走的路。
  return { path: null, visited, trace, reason: "The queue is empty. No route connects A to B." };
}

// ── 3. 地图、输入与状态变化 ────────────────────────────
function randomGrid(rng = Math.random) {
  const map = emptyGrid();
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) map[y][x] = rng() < 0.28 ? 1 : 0;
  }
  // 至少留下两个可选道路；不保证它们之间有路。
  map[0][0] = 0;
  map[SIZE - 1][SIZE - 1] = 0;
  return map;
}

function changeMap() {
  let next = randomGrid();
  // 如果碰巧随机出相同布局，翻转一个非保留格子。
  if (JSON.stringify(next) === JSON.stringify(grid)) next[0][1] = 1 - next[0][1];
  grid = next;
  resetPoints();
}

function resetPoints() {
  start = null;
  goal = null;
  result = null;
  updateInterface();
  redraw();
}

function chooseCell(x, y) {
  if (x < 0 || x >= SIZE || y < 0 || y >= SIZE) return;
  keyboardCell = { x, y };
  if (start === null || goal !== null) {
    start = { x, y }; // 第一次点，或一轮结束后重新开始。
    goal = null;
    result = null;
  } else {
    goal = { x, y };  // 第二次点，马上计算。
    result = breadthFirstSearch(grid, start, goal);
  }
  updateInterface();
  redraw();
}

// ── 4. 界面：不参与决定哪条路最短 ──────────────────────
function setup() {
  document.documentElement.lang = "en";
  document.title = "Shortest Path — BFS";
  addStyles();
  grid = randomGrid();
  const app = createDiv().id("path-app");
  const layout = createDiv().class("layout").parent(app);
  const boardPanel = createDiv().class("board-panel").parent(layout);
  canvas = createCanvas(BOARD, BOARD);
  canvas.parent(boardPanel);
  canvas.elt.setAttribute("tabindex", "0");
  canvas.elt.setAttribute("aria-label", "10 by 10 pathfinding grid. Click to choose start A and end B, or use arrow keys and Enter.");
  // 原生指针事件可同时接收鼠标、触控笔和触屏；坐标按画布缩放换算。
  canvas.elt.addEventListener("pointerdown", event => {
    if (event.button !== 0) return;
    const box = canvas.elt.getBoundingClientRect();
    const x = Math.floor(((event.clientX - box.left) * BOARD / box.width - MARGIN) / CELL);
    const y = Math.floor(((event.clientY - box.top) * BOARD / box.height - MARGIN) / CELL);
    canvas.elt.focus({ preventScroll: true });
    chooseCell(x, y);
    event.preventDefault();
  });
  canvas.elt.addEventListener("keydown", event => {
    const directions = { ArrowRight: [1, 0], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowUp: [0, -1] };
    if (directions[event.key]) {
      const [dx, dy] = directions[event.key];
      keyboardCell.x = Math.max(0, Math.min(SIZE - 1, keyboardCell.x + dx));
      keyboardCell.y = Math.max(0, Math.min(SIZE - 1, keyboardCell.y + dy));
      redraw();
      event.preventDefault();
    } else if (event.key === "Enter" || event.key === " ") {
      chooseCell(keyboardCell.x, keyboardCell.y);
      event.preventDefault();
    }
  });
  canvas.elt.addEventListener("blur", () => redraw());
  canvas.elt.addEventListener("focus", () => redraw());
  const side = createDiv().class("controls").parent(layout);
  button("Random Map", changeMap, side);
  button("Reset Points", resetPoints, side);
  const process = createDiv().class("process").parent(app);
  createElement("h2", "Search principle").parent(process);
  createDiv(`<ol class="principles">
    <li>Start with A in the queue. Record 0 moves.</li>
    <li>Take the first point from the queue. If it is B, output its shortest route and stop.</li>
    <li>Check its four neighbors: right, down, left, and up. Skip walls, points outside the map, and points already found.</li>
    <li>Add each new road point to the end of the queue. Record one more move and keep its route.</li>
    <li>Repeat from step 2. If the queue is empty, output “Unreachable”.</li>
  </ol>`).parent(process);
  createElement("h2", "Search Process").class("trace-title").parent(process);
  processStatus = createP().class("process-status").parent(process);
  processStatus.attribute("role", "status");
  processStatus.attribute("aria-live", "polite");
  processBody = createDiv().class("process-body").parent(process);
  textFont("Georgia");
  textAlign(CENTER, CENTER);
  noLoop();
  updateInterface();
}

function button(label, action, parent) {
  const element = createButton(label).parent(parent);
  element.attribute("type", "button");
  element.elt.addEventListener("click", action);
  return element;
}

function updateInterface() {
  processBody.html("");
  if (!start) {
    processStatus.html("Choose start A, then end B.");
  } else if (!goal) {
    processStatus.html(`Start A: ${pointLabel(start)}${grid[start.y][start.x] === 1 ? " (obstacle)" : ""}. Now choose end B.`);
  } else {
    processStatus.html(result.path ? "" : `Unreachable. ${result.reason}`);
    processBody.html(renderProcess(result, start, goal));
  }
}

function pointLabel(point) {
  return `(${point.x + 1}, ${point.y + 1})`;
}

// 读取算法当时保存的数值，而不是事后根据最终路线编造步骤。
function moveCount(number) {
  return `${number} ${number === 1 ? "move" : "moves"}`;
}

function renderProcess(search, from, to) {
  if (search.trace.length === 0) return "<p>Invalid start or end. No cells were checked.</p>";
  let html = `<p>Start the queue with A ${pointLabel(from)}. Find B ${pointLabel(to)}.</p><ol>`;
  for (const step of search.trace) {
    html += `<li><div>Check ${pointLabel(step.point)} — ${moveCount(step.moves)} from A.</div>`;
    if (samePoint(step.point, to)) {
      html += "<p>Reached B. Stop: this route has the fewest moves.</p>";
    } else {
      html += step.added.length
        ? `<p>Add ${step.added.map(pointLabel).join(", ")} to the back of the queue (${moveCount(step.moves + 1)} from A).</p>`
        : "<p>No new open neighbors to add.</p>";
    }
    html += "</li>";
  }
  html += "</ol>";
  if (search.path) {
    html += `<p>Shortest route:<br>${search.path.map(pointLabel).join(" → ")}</p>`;
    html += `<p>${search.path.length} ${search.path.length === 1 ? "cell" : "cells"} on the route − 1 = ${moveCount(search.path.length - 1)}. Checked ${search.visited.length} ${search.visited.length === 1 ? "cell" : "cells"} in total.</p>`;
  } else {
    html += `<p>The queue is empty after checking ${search.visited.length} ${search.visited.length === 1 ? "cell" : "cells"}. B was never reached: unreachable.</p>`;
  }
  return html;
}

function draw() {
  background("#f4f6f8");
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      stroke("#d7dce3");
      strokeWeight(1);
      fill(grid[y][x] === 1 ? "#263344" : "#ffffff");
      rect(MARGIN + x * CELL, MARGIN + y * CELL, CELL, CELL, 3);
    }
  }
  noStroke();
  fill("#596577");
  textSize(12);
  for (let i = 0; i < SIZE; i++) {
    text(i + 1, MARGIN + (i + 0.5) * CELL, 14);
    text(i + 1, 14, MARGIN + (i + 0.5) * CELL);
  }
  if (result && result.path) {
    noFill();
    stroke("#285bea");
    strokeWeight(6);
    beginShape();
    for (const p of result.path) vertex(MARGIN + (p.x + 0.5) * CELL, MARGIN + (p.y + 0.5) * CELL);
    endShape();
  }
  if (start) drawMarker(start, samePoint(start, goal) ? "A/B" : "A", "#d7f65b", "#17210c");
  if (goal && !samePoint(start, goal)) drawMarker(goal, "B", "#285bea", "#ffffff");
  // 只标注真正取出并检查过的格子；数字来自 BFS 的实际记录。
  if (result) {
    push();
    textAlign(LEFT, TOP);
    textSize(10);
    textStyle(NORMAL);
    noStroke();
    for (const step of result.trace) {
      const x = MARGIN + step.point.x * CELL;
      const y = MARGIN + step.point.y * CELL;
      const label = String(step.moves);
      fill("#ffffff");
      rect(x + 2, y + 2, textWidth(label) + 5, 13, 2);
      fill("#596577");
      text(label, x + 4, y + 2);
    }
    pop();
  }
  if (canvas && document.activeElement === canvas.elt && canvas.elt.matches(":focus-visible")) {
    noFill();
    stroke("#e07513");
    strokeWeight(2);
    rect(MARGIN + keyboardCell.x * CELL + 3, MARGIN + keyboardCell.y * CELL + 3, CELL - 6, CELL - 6, 3);
  }
}

function drawMarker(point, label, backgroundColor, textColor) {
  const x = MARGIN + (point.x + 0.5) * CELL, y = MARGIN + (point.y + 0.5) * CELL;
  stroke("#ffffff");
  strokeWeight(2);
  fill(backgroundColor);
  circle(x, y, 32);
  noStroke();
  fill(textColor);
  textSize(label === "A/B" ? 12 : 16);
  textStyle(NORMAL);
  text(label, x, y);
  textStyle(NORMAL);
}

// 样式也放在本文件里，因此只需复制一个 sketch.js。
function addStyles() {
  const style = document.createElement("style");
  style.textContent = `
    * { box-sizing: border-box; }
    body { margin: 0; background: #f4f6f8; color: #263344; font: 16px/1.7 system-ui, -apple-system, "PingFang SC", sans-serif; }
    #path-app { max-width: 560px; margin: auto; padding: 24px 20px 40px; }
    .layout { display: flex; flex-direction: column; gap: 12px; }
    .board-panel { min-width: 0; width: 100%; }
    canvas { display: block; width: 100%!important; height: auto!important; touch-action: manipulation; cursor: crosshair; }
    canvas:focus-visible { outline: 2px solid #285bea; outline-offset: 3px; }
    .controls { display: flex; gap: 12px; padding: 0 30px; }
    .controls button { flex: 1; }
    button { font: inherit; font-size: 15px; background: white; color: #263344; border: 1px solid #bac3cf; border-radius: 4px; padding: 9px 12px; cursor: pointer; }
    button:hover { background: #e8edf3; }
    button:focus-visible { outline: 2px solid #285bea; outline-offset: 3px; }
    .process { margin-top: 24px; overflow-wrap: anywhere; }
    .process h2 { font-size: 18px; font-weight: 600; margin: 0 0 8px; }
    .process h2.trace-title { margin-top: 24px; }
    .process p { margin: 8px 0 16px; }
    .process-body, .process-status { font-family: Georgia, "Times New Roman", serif; font-weight: 400; }
    .process-status:empty { display: none; }
    .process ol { padding-left: 26px; }
    .process li { padding-left: 4px; margin: 0 0 20px; }
    .process li p { color: #566273; font-size: 14px; margin: 5px 0 0; }
    .process .principles li { margin-bottom: 8px; }
    @media (max-width: 640px) {
      #path-app { padding: 16px 12px 30px; }
    }
  `;
  document.head.appendChild(style);
}

// 只用于本地自动检验；p5.js 编辑器不会执行这一段。
if (typeof module !== "undefined") module.exports = { breadthFirstSearch, emptyGrid, randomGrid, renderProcess };
