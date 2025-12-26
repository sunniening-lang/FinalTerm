// ========== 基本常數 ==========
const EMPTY = 0, BLACK = 1, WHITE = 2;
const KOMI = 6.5;

const canvas = document.getElementById("board");
const ctx = canvas.getContext("2d");

const sizeSelect = document.getElementById("sizeSelect");
const handicapSelect = document.getElementById("handicapSelect");
const newBtn = document.getElementById("newBtn");
const passBtn = document.getElementById("passBtn");
const resignBtn = document.getElementById("resignBtn");
const scoreBtn = document.getElementById("scoreBtn");
const aiToggleBtn = document.getElementById("aiToggleBtn");

const statusEl = document.getElementById("status");
const capBEl = document.getElementById("capB");
const capWEl = document.getElementById("capW");

const terrBEl = document.getElementById("terrB");
const terrWEl = document.getElementById("terrW");
const scoreBEl = document.getElementById("scoreB");
const scoreWEl = document.getElementById("scoreW");

// ========== 遊戲狀態 ==========
let N = 19;
let board = [];
let turn = BLACK;
let passCount = 0;
let gameOver = false;

let capB = 0; // 黑提白
let capW = 0; // 白提黑

let aiEnabled = true;

// ko：簡單劫（禁止回到兩手前）
let history = []; // 存 boardToString
let lastMove = null;

// 終局/決算模式：可點群標死棋
let scoringMode = false;
let dead = []; // dead[y][x] = true 表示該子被標死（整群一起切）

// 禁著點顯示（當前輪到誰的非法點）
let forbiddenSet = new Set();

// hover 預覽
let hover = { x: -1, y: -1 };

// ========== 工具函數 ==========
function inBounds(x, y){ return x>=0 && y>=0 && x<N && y<N; }
function opp(c){ return c===BLACK ? WHITE : BLACK; }

function init2D(val){
  const a = new Array(N);
  for(let y=0;y<N;y++){
    a[y] = new Array(N).fill(val);
  }
  return a;
}

function cloneBoard(b){
  return b.map(row => row.slice());
}

function boardToString(b){
  // 簡單序列化
  return b.map(r => r.join("")).join("|");
}

function neighbors(x,y){
  const res = [];
  if(inBounds(x-1,y)) res.push([x-1,y]);
  if(inBounds(x+1,y)) res.push([x+1,y]);
  if(inBounds(x,y-1)) res.push([x,y-1]);
  if(inBounds(x,y+1)) res.push([x,y+1]);
  return res;
}

// 取得一個群（連通同色）與其氣
function getGroup(b, sx, sy){
  const color = b[sy][sx];
  const stack = [[sx,sy]];
  const seen = new Set([`${sx},${sy}`]);
  const stones = [];
  const libs = new Set(); // liberties: "x,y"

  while(stack.length){
    const [x,y] = stack.pop();
    stones.push([x,y]);

    for(const [nx,ny] of neighbors(x,y)){
      if(b[ny][nx] === EMPTY){
        libs.add(`${nx},${ny}`);
      }else if(b[ny][nx] === color){
        const k = `${nx},${ny}`;
        if(!seen.has(k)){
          seen.add(k);
          stack.push([nx,ny]);
        }
      }
    }
  }
  return { color, stones, libs };
}

function removeStones(b, stones){
  for(const [x,y] of stones) b[y][x] = EMPTY;
}

function setStatus(msg){
  statusEl.textContent = msg;
}

function updateUI(){
  capBEl.textContent = capB;
  capWEl.textContent = capW;
}

// ========== 棋盤繪製（格線交叉點） ==========
function boardGeom(){
  const w = canvas.width, h = canvas.height;
  const margin = Math.round(Math.min(w,h) * 0.08);
  const grid = (Math.min(w,h) - margin*2) / (N-1);
  return { w, h, margin, grid };
}

function xyToPx(x,y){
  const { margin, grid } = boardGeom();
  return [margin + x*grid, margin + y*grid];
}

function pxToXY(px,py){
  const { margin, grid } = boardGeom();
  const x = Math.round((px - margin)/grid);
  const y = Math.round((py - margin)/grid);
  if(!inBounds(x,y)) return null;

  // 限制點擊必須靠近交叉點（避免點到空白也觸發）
  const [cx,cy] = xyToPx(x,y);
  const dist = Math.hypot(px-cx, py-cy);
  if(dist > grid*0.45) return null;

  return { x, y };
}

function draw(){
  // 清空（背景已在 CSS）
  ctx.clearRect(0,0,canvas.width,canvas.height);

  drawGrid();
  drawTerritoryOverlayIfScoring();
  drawStarPoints();
  drawForbiddenMarks();
  drawStones();
  drawHoverPreview();
}

function drawGrid(){
  const { margin, grid } = boardGeom();
  ctx.save();
  ctx.lineWidth = Math.max(1, grid*0.06);
  ctx.strokeStyle = "rgba(0,0,0,.55)";

  // 橫線
  for(let y=0;y<N;y++){
    const [x0,yy] = xyToPx(0,y);
    const [x1,_] = xyToPx(N-1,y);
    ctx.beginPath();
    ctx.moveTo(x0,yy);
    ctx.lineTo(x1,yy);
    ctx.stroke();
  }
  // 直線
  for(let x=0;x<N;x++){
    const [xx,y0] = xyToPx(x,0);
    const [_,y1] = xyToPx(x,N-1);
    ctx.beginPath();
    ctx.moveTo(xx,y0);
    ctx.lineTo(xx,y1);
    ctx.stroke();
  }

  // 外框
  ctx.lineWidth = Math.max(2, grid*0.08);
  ctx.strokeStyle = "rgba(0,0,0,.35)";
  ctx.strokeRect(margin - grid*0.4, margin - grid*0.4, grid*(N-1)+grid*0.8, grid*(N-1)+grid*0.8);

  ctx.restore();
}

function starPointsForN(n){
  // 常見天元/星位（9/13/19）
  if(n === 9)  return [[2,2],[6,2],[2,6],[6,6],[4,4]];
  if(n === 13) return [[3,3],[9,3],[3,9],[9,9],[6,6]];
  if(n === 19) return [[3,3],[9,3],[15,3],[3,9],[9,9],[15,9],[3,15],[9,15],[15,15]];
  // 其他尺寸就只畫天元
  return [[Math.floor((n-1)/2), Math.floor((n-1)/2)]];
}

function drawStarPoints(){
  const { grid } = boardGeom();
  const pts = starPointsForN(N);
  ctx.save();
  ctx.fillStyle = "rgba(0,0,0,.55)";
  for(const [x,y] of pts){
    const [px,py] = xyToPx(x,y);
    ctx.beginPath();
    ctx.arc(px,py, Math.max(2, grid*0.09), 0, Math.PI*2);
    ctx.fill();
  }
  ctx.restore();
}

function drawStoneAt(x,y,color,opts={}){
  const { grid } = boardGeom();
  const [px,py] = xyToPx(x,y);
  const r = grid*0.42;

  ctx.save();

  // 陰影
  ctx.shadowColor = "rgba(0,0,0,.35)";
  ctx.shadowBlur = r*0.35;
  ctx.shadowOffsetY = r*0.18;

  // 石頭
  const g = ctx.createRadialGradient(px-r*0.2, py-r*0.2, r*0.2, px, py, r*1.2);
  if(color===BLACK){
    g.addColorStop(0, "rgba(80,80,80,1)");
    g.addColorStop(1, "rgba(10,10,10,1)");
  }else{
    g.addColorStop(0, "rgba(255,255,255,1)");
    g.addColorStop(1, "rgba(200,200,200,1)");
  }

  ctx.globalAlpha = opts.alpha ?? 1;
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(px,py,r,0,Math.PI*2);
  ctx.fill();

  // 外框
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
  ctx.lineWidth = Math.max(1, grid*0.05);
  ctx.strokeStyle = color===BLACK ? "rgba(0,0,0,.55)" : "rgba(0,0,0,.25)";
  ctx.stroke();

  // 最後一手標記
  if(opts.last){
    ctx.lineWidth = Math.max(2, grid*0.09);
    ctx.strokeStyle = color===BLACK ? "rgba(255,255,255,.7)" : "rgba(0,0,0,.5)";
    ctx.beginPath();
    ctx.arc(px,py,r*0.45,0,Math.PI*2);
    ctx.stroke();
  }

  // 死棋標記（終局）
  if(opts.dead){
    ctx.globalAlpha = 0.95;
    ctx.lineWidth = Math.max(2, grid*0.10);
    ctx.strokeStyle = "rgba(220,60,60,.85)";
    ctx.beginPath();
    ctx.moveTo(px-r*0.6, py-r*0.6);
    ctx.lineTo(px+r*0.6, py+r*0.6);
    ctx.moveTo(px+r*0.6, py-r*0.6);
    ctx.lineTo(px-r*0.6, py+r*0.6);
    ctx.stroke();
  }

  ctx.restore();
}

function drawStones(){
  for(let y=0;y<N;y++){
    for(let x=0;x<N;x++){
      const c = board[y][x];
      if(c===EMPTY) continue;
      const isDead = scoringMode && dead[y][x];
      const isLast = lastMove && lastMove.x===x && lastMove.y===y;
      drawStoneAt(x,y,c,{ dead:isDead, last:isLast, alpha:isDead?0.45:1 });
    }
  }
}

function drawHoverPreview(){
  if(gameOver) return;
  if(scoringMode) return;
  if(hover.x<0) return;

  const x=hover.x, y=hover.y;
  if(!inBounds(x,y)) return;

  // 已有子就不畫
  if(board[y][x] !== EMPTY) return;

  // 畫半透明預覽；若禁著則畫紅框
  const illegal = forbiddenSet.has(`${x},${y}`);
  const { grid } = boardGeom();
  const [px,py] = xyToPx(x,y);
  const r = grid*0.42;

  ctx.save();
  ctx.globalAlpha = illegal ? 0.35 : 0.5;

  // 預覽石（輪到誰）
  drawStoneAt(x,y,turn,{ alpha: ctx.globalAlpha });

  // 禁著紅圈
  if(illegal){
    ctx.globalAlpha = 1;
    ctx.lineWidth = Math.max(2, grid*0.12);
    ctx.strokeStyle = "rgba(240,70,70,.9)";
    ctx.beginPath();
    ctx.arc(px,py,r*0.55,0,Math.PI*2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawForbiddenMarks(){
  if(gameOver) return;
  if(scoringMode) return;

  // 只顯示「當前玩家」的禁著點
  const { grid } = boardGeom();
  ctx.save();
  ctx.strokeStyle = "rgba(240,70,70,.75)";
  ctx.lineWidth = Math.max(2, grid*0.08);

  for(const key of forbiddenSet){
    const [xStr,yStr] = key.split(",");
    const x = +xStr, y = +yStr;
    if(board[y][x] !== EMPTY) continue;

    const [px,py] = xyToPx(x,y);
    const s = grid*0.18;
    ctx.beginPath();
    ctx.moveTo(px-s, py-s);
    ctx.lineTo(px+s, py+s);
    ctx.moveTo(px+s, py-s);
    ctx.lineTo(px-s, py+s);
    ctx.stroke();
  }
  ctx.restore();
}

// 終局領地著色（活棋範圍顯示）
function drawTerritoryOverlayIfScoring(){
  if(!scoringMode) return;
  const terr = computeTerritoryAndScore().territoryMap; // "B"/"W"/"." for empty region ownership

  const { grid } = boardGeom();
  ctx.save();
  ctx.globalAlpha = 0.22;

  for(let y=0;y<N;y++){
    for(let x=0;x<N;x++){
      if(board[y][x] !== EMPTY) continue;
      const owner = terr[y][x];
      if(owner !== "B" && owner !== "W") continue;

      const [px,py] = xyToPx(x,y);
      ctx.fillStyle = owner==="B" ? "rgba(0,0,0,1)" : "rgba(255,255,255,1)";
      ctx.beginPath();
      ctx.arc(px,py, grid*0.18, 0, Math.PI*2);
      ctx.fill();
    }
  }
  ctx.restore();
}

// ========== 落子/規則（提子、自殺、ko） ==========
function isLegalMove(color, x, y, b=board){
  if(!inBounds(x,y)) return false;
  if(b[y][x] !== EMPTY) return false;

  const sim = cloneBoard(b);
  sim[y][x] = color;

  let captured = 0;

  // 提掉對方無氣群
  for(const [nx,ny] of neighbors(x,y)){
    if(sim[ny][nx] === opp(color)){
      const g = getGroup(sim, nx, ny);
      if(g.libs.size === 0){
        captured += g.stones.length;
        removeStones(sim, g.stones);
      }
    }
  }

  // 自殺檢查：自己群是否還有氣（若無氣且未提子則不合法）
  const my = getGroup(sim, x, y);
  if(my.libs.size === 0 && captured === 0) return false;

  // ko：禁止回到兩手前
  const s = boardToString(sim);
  if(history.length >= 2){
    const twoAgo = history[history.length - 2];
    if(s === twoAgo) return false;
  }
  return true;
}

function rebuildForbiddenSet(){
  forbiddenSet.clear();
  for(let y=0;y<N;y++){
    for(let x=0;x<N;x++){
      if(board[y][x] !== EMPTY) continue;
      if(!isLegalMove(turn,x,y,board)){
        forbiddenSet.add(`${x},${y}`);
      }
    }
  }
}

function placeStone(color, x, y){
  if(gameOver) return { ok:false, reason:"已結束" };
  if(scoringMode) return { ok:false, reason:"終局決算中不可落子" };

  if(!isLegalMove(color, x, y, board)){
    return { ok:false, reason:"禁著（自殺或 ko）" };
  }

  const sim = cloneBoard(board);
  sim[y][x] = color;

  // 提子
  let capturedStones = 0;
  for(const [nx,ny] of neighbors(x,y)){
    if(sim[ny][nx] === opp(color)){
      const g = getGroup(sim, nx, ny);
      if(g.libs.size === 0){
        capturedStones += g.stones.length;
        removeStones(sim, g.stones);
      }
    }
  }

  // commit
  board = sim;
  lastMove = { x, y, color };

  // 更新提子數
  if(color === BLACK) capB += capturedStones;
  else capW += capturedStones;

  // history（供 ko）
  history.push(boardToString(board));

  // 換手
  turn = opp(turn);
  passCount = 0;

  updateUI();

  // 叫吃警告（atari）
  const msg = buildAtariMessageAfterMove(opp(turn)); // 這裡 opp(turn) 是剛剛下子的人
  setStatus(msg);

  rebuildForbiddenSet();
  draw();

  return { ok:true };
}

function buildAtariMessageAfterMove(lastPlayer){
  // lastPlayer: 剛下子那方
  // 檢查對方是否有群被叫吃（只剩 1 口氣）
  const target = opp(lastPlayer);

  let atariCount = 0;
  let myAtari = 0;

  const seen = new Set();
  for(let y=0;y<N;y++){
    for(let x=0;x<N;x++){
      const c = board[y][x];
      if(c === EMPTY) continue;
      const k = `${x},${y}`;
      if(seen.has(k)) continue;

      const g = getGroup(board, x, y);
      for(const [sx,sy] of g.stones) seen.add(`${sx},${sy}`);

      if(g.libs.size === 1){
        if(g.color === target) atariCount++;
        if(g.color === lastPlayer) myAtari++;
      }
    }
  }

  const turnStr = (turn===BLACK) ? "輪到黑（User）" : (aiEnabled ? "輪到白（Computer）" : "輪到白");
  let extra = "";
  if(atariCount>0) extra += `\n⚠️ 叫吃：對方有 ${atariCount} 群剩 1 氣！`;
  if(myAtari>0) extra += `\n（提醒）你方也有 ${myAtari} 群剩 1 氣，注意防守。`;

  return `已落子：${lastPlayer===BLACK?"黑":"白"} @ (${lastMove.x+1},${lastMove.y+1})\n${turnStr}${extra}`;
}

// ========== PASS / 終局 ==========
function doPass(){
  if(gameOver) return;
  if(scoringMode){
    setStatus("終局決算中：PASS 無作用（可直接重算或新局）");
    return;
  }

  passCount++;
  const who = (turn===BLACK) ? "黑（User）" : (aiEnabled ? "白（Computer）" : "白");
  setStatus(`${who} PASS（連續 PASS：${passCount}/2）`);

  // 也要進 history（ko 兩手前比較才合理）
  history.push(boardToString(board));

  turn = opp(turn);
  rebuildForbiddenSet();
  draw();

  if(passCount >= 2){
    scoringMode = true;
    setStatus("雙方連續 PASS → 進入終局決算：可點棋子切換整群死/活");
    computeAndRenderScore();
    draw();
  }else{
    // 如果輪到白且 AI 開啟，AI 也可能選擇 PASS
    if(aiEnabled && turn===WHITE){
      setTimeout(aiMove, 220);
    }
  }
}

function resign(){
  if(gameOver) return;
  gameOver = true;
  scoringMode = false;
  setStatus(`🏳️ 投降：${turn===BLACK?"黑（User）":"白"} 投降，遊戲結束。`);
  draw();
}

// ========== 終局：標死棋（整群切換） ==========
function toggleDeadGroup(x,y){
  if(!scoringMode) return;
  const c = board[y][x];
  if(c === EMPTY) return;

  const g = getGroup(board, x, y);
  // 判斷這群目前是否死：看第一顆
  const currentlyDead = dead[g.stones[0][1]][g.stones[0][0]];

  for(const [sx,sy] of g.stones){
    dead[sy][sx] = !currentlyDead;
  }

  computeAndRenderScore();
  draw();
}

// ========== 領地/分數計算（互動式：靠你標死棋） ==========
function computeTerritoryAndScore(){
  // 先把「活棋」視為：沒被標死的棋
  const aliveBoard = cloneBoard(board);
  let deadBlack = 0, deadWhite = 0;

  for(let y=0;y<N;y++){
    for(let x=0;x<N;x++){
      if(aliveBoard[y][x] === EMPTY) continue;
      if(dead[y][x]){
        if(aliveBoard[y][x] === BLACK) deadBlack++;
        else deadWhite++;
        aliveBoard[y][x] = EMPTY; // 死棋在領地判定時視為空（由對方領）
      }
    }
  }

  // 空區域 flood fill，決定領地歸屬
  const vis = init2D(false);
  const territoryMap = init2D("."); // "B" "W" "."
  let terrB = 0, terrW = 0;

  for(let y=0;y<N;y++){
    for(let x=0;x<N;x++){
      if(aliveBoard[y][x] !== EMPTY) continue;
      if(vis[y][x]) continue;

      // BFS 區域
      const q = [[x,y]];
      vis[y][x] = true;
      const region = [];
      const borderColors = new Set();

      while(q.length){
        const [cx,cy] = q.pop();
        region.push([cx,cy]);

        for(const [nx,ny] of neighbors(cx,cy)){
          const v = aliveBoard[ny][nx];
          if(v === EMPTY){
            if(!vis[ny][nx]){
              vis[ny][nx] = true;
              q.push([nx,ny]);
            }
          }else{
            borderColors.add(v);
          }
        }
      }

      let owner = ".";
      if(borderColors.size === 1){
        owner = (borderColors.has(BLACK)) ? "B" : "W";
      }

      for(const [rx,ry] of region){
        territoryMap[ry][rx] = owner;
      }

      if(owner === "B") terrB += region.length;
      if(owner === "W") terrW += region.length;
    }
  }

  // 分數：領地 + 提子 + 標死棋（死棋當作被提）
  const scoreB = terrB + capB + deadWhite;
  const scoreW = terrW + capW + deadBlack + KOMI;

  return { terrB, terrW, scoreB, scoreW, deadBlack, deadWhite, territoryMap };
}

function computeAndRenderScore(){
  if(!scoringMode){
    setStatus("尚未進入終局：需雙方連續 PASS 或點『進入/重算終局決算』");
    return;
  }
  const r = computeTerritoryAndScore();

  terrBEl.textContent = r.terrB;
  terrWEl.textContent = r.terrW;
  scoreBEl.textContent = r.scoreB.toFixed(1);
  scoreWEl.textContent = r.scoreW.toFixed(1);

  // 結果文字
  const winner = (r.scoreB > r.scoreW) ? "黑（User）" : "白（Computer/白）";
  const diff = Math.abs(r.scoreB - r.scoreW).toFixed(1);

  setStatus(
    `終局決算中（可點棋子切換死/活）\n` +
    `黑：領地 ${r.terrB} + 提子 ${capB} + 死棋(白) ${r.deadWhite} = ${r.scoreB.toFixed(1)}\n` +
    `白：領地 ${r.terrW} + 提子 ${capW} + 死棋(黑) ${r.deadBlack} + komi ${KOMI} = ${r.scoreW.toFixed(1)}\n` +
    `勝者：${winner}（差 ${diff}）`
  );
}

function computeAndRenderScoreIfNeeded(){
  if(scoringMode) computeAndRenderScore();
}

// ========== AI（簡易版：優先提子/避免自殺/隨機） ==========
function aiMove(){
  if(gameOver) return;
  if(!aiEnabled) return;
  if(scoringMode) return;
  if(turn !== WHITE) return;

  // 收集合法點 + 評分
  const moves = [];
  for(let y=0;y<N;y++){
    for(let x=0;x<N;x++){
      if(board[y][x] !== EMPTY) continue;
      if(!isLegalMove(WHITE,x,y,board)) continue;

      // 評分：先看能不能提子
      const sim = cloneBoard(board);
      sim[y][x] = WHITE;

      let captured = 0;
      for(const [nx,ny] of neighbors(x,y)){
        if(sim[ny][nx] === BLACK){
          const g = getGroup(sim, nx, ny);
          if(g.libs.size === 0){
            captured += g.stones.length;
            removeStones(sim, g.stones);
          }
        }
      }

      // 避免自己剛下就變叫吃（只剩 1 氣）
      const my = getGroup(sim, x, y);
      const risky = (my.libs.size === 1) ? 1 : 0;

      const score = captured*100 - risky*8 + Math.random(); // 捕獲最優先
      moves.push({ x,y, score, captured });
    }
  }

  if(moves.length === 0){
    // 沒得下就 PASS
    doPass();
    return;
  }

  moves.sort((a,b)=>b.score-a.score);
  const pick = moves[0];

  placeStone(WHITE, pick.x, pick.y);
}

// ========== 讓子（簡化：開局直接放黑子） ==========
function handicapPoints(n, k){
  // 只支援 9/13/19 常用讓子點，k: 2~9
  const pts = [];
  const add = (x,y)=>pts.push([x,y]);

  if(k <= 0) return pts;

  if(n === 9){
    const star = [[2,2],[6,6],[2,6],[6,2],[4,4],[2,4],[6,4],[4,2],[4,6]];
    for(let i=0;i<Math.min(k,star.length);i++) add(star[i][0], star[i][1]);
    return pts;
  }
  if(n === 13){
    const star = [[3,3],[9,9],[3,9],[9,3],[6,6],[3,6],[9,6],[6,3],[6,9]];
    for(let i=0;i<Math.min(k,star.length);i++) add(star[i][0], star[i][1]);
    return pts;
  }
  // 19
  const star = [[3,3],[15,15],[3,15],[15,3],[9,9],[3,9],[15,9],[9,3],[9,15]];
  for(let i=0;i<Math.min(k,star.length);i++) add(star[i][0], star[i][1]);
  return pts;
}

function applyHandicap(){
  const k = parseInt(handicapSelect.value, 10);
  if(k <= 0) return;

  const pts = handicapPoints(N, k);
  for(const [x,y] of pts){
    if(board[y][x] === EMPTY){
      board[y][x] = BLACK;
    }
  }

  // 讓子後通常白先（這裡照一般規則）
  turn = WHITE;
  history.push(boardToString(board));
}

// ========== 初始化 / 新局 ==========
function newGame(){
  N = parseInt(sizeSelect.value, 10);
  board = init2D(EMPTY);
  dead = init2D(false);

  turn = BLACK;
  passCount = 0;
  gameOver = false;
  scoringMode = false;

  capB = 0;
  capW = 0;

  history = [];
  lastMove = null;

  // 首局盤面入 history（ko 參考）
  history.push(boardToString(board));

  applyHandicap();
  updateUI();
  rebuildForbiddenSet();

  terrBEl.textContent = "-";
  terrWEl.textContent = "-";
  scoreBEl.textContent = "-";
  scoreWEl.textContent = "-";

  setStatus(`新局開始。${turn===BLACK?"輪到黑（User）":"輪到白"}${aiEnabled && turn===WHITE ? "（AI）" : ""}`);
  draw();

  // 若讓子後白先且 AI 開，AI 立即下
  if(aiEnabled && turn === WHITE){
    setTimeout(aiMove, 220);
  }
}

// ========== 事件處理 ==========
canvas.addEventListener("mousemove", (e)=>{
  const rect = canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) * (canvas.width / rect.width);
  const py = (e.clientY - rect.top) * (canvas.height / rect.height);
  const p = pxToXY(px,py);
  if(!p){
    hover.x = -1; hover.y = -1;
  }else{
    hover.x = p.x; hover.y = p.y;
  }
  draw();
});

canvas.addEventListener("mouseleave", ()=>{
  hover.x = -1; hover.y = -1;
  draw();
});

canvas.addEventListener("click", (e)=>{
  const rect = canvas.getBoundingClientRect();
  const px = (e.clientX - rect.left) * (canvas.width / rect.width);
  const py = (e.clientY - rect.top) * (canvas.height / rect.height);
  const p = pxToXY(px,py);
  if(!p) return;

  const {x,y} = p;

  if(gameOver) return;

  if(scoringMode){
    toggleDeadGroup(x,y);
    return;
  }

  // 輪到誰就下誰；AI 開啟時白由 AI 下
  if(turn === WHITE && aiEnabled){
    setStatus("目前 AI 開啟：白（Computer）由電腦下，請等一下或關閉 AI。");
    return;
  }

  const r = placeStone(turn, x, y);
  if(!r.ok){
    setStatus(`❌ 不能下：${r.reason}\n（提示：紅色 X 為禁著點）`);
    return;
  }

  // 黑下完輪到白 → AI
  if(aiEnabled && turn === WHITE && !scoringMode && !gameOver){
    setTimeout(aiMove, 220);
  }
});

newBtn.addEventListener("click", newGame);

passBtn.addEventListener("click", ()=>{
  doPass();
});

resignBtn.addEventListener("click", resign);

scoreBtn.addEventListener("click", ()=>{
  // 允許強制進入/重算終局（老師常見要求）
  scoringMode = true;
  setStatus("進入終局決算：可點棋子切換整群死/活（再點一次取消）");
  computeAndRenderScore();
  draw();
});

aiToggleBtn.addEventListener("click", ()=>{
  aiEnabled = !aiEnabled;
  aiToggleBtn.textContent = `AI 開關：${aiEnabled ? "開" : "關"}`;
   aiToggleBtn.classList.toggle("off", !aiEnabled);

  // 若現在剛好輪到白且 AI 開啟 → 立刻 AI
  if(aiEnabled && turn === WHITE && !scoringMode && !gameOver){
    setTimeout(aiMove, 180);
  }else{
    setStatus(`AI 已${aiEnabled ? "開啟" : "關閉"}。`);
  }
});

// 尺寸/讓子改變 → 直接新局（比較符合期末 demo）
sizeSelect.addEventListener("change", newGame);
handicapSelect.addEventListener("change", newGame);

// ========== 啟動 ==========
newGame();
