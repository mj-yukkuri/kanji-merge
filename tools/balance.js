// 8×8版のバランス検証シミュレーター
//   node tools/balance.js            … 現在の data.js の出現率で計測
//   node tools/balance.js --tune     … 出現率を自動調整して結果を表示
//   --boost=10 --absent=0.1 --seed=7  … 倍率や乱数を変えて試す（既定値は data.js の SPAWN_RULE）
// ゲーム本体（index.html）と同じルールで、貪欲なAIに何度も遊ばせて
// 「出たのに合体できず残り続ける部品」がどれくらいあるかを測る。
const fs = require("fs");
const path = require("path");
eval(fs.readFileSync(path.join(__dirname, "..", "data.js"), "utf8").replace(/^const /gm, "global."));

const N = 8, START_TILES = 8, START_ERASERS = 0, MAX_ERASERS = 0;   // 消しゴムは廃止（0 = なし）
const arg = (name, d) => +(process.argv.find(a => a.startsWith(`--${name}=`))?.split("=")[1] ?? d);
let NEAR_BOOST = arg("boost", SPAWN_RULE.near);     // 隣に合体相手がいる部品の倍率
let ABSENT = arg("absent", SPAWN_RULE.absent);        // 盤面のどこにも合体相手がいない部品の倍率
const STALE = 40;            // これ以上の手数、合体されずに残っていたら「放置」とみなす
const pairKey = (a,b) => a < b ? a+b : b+a;
// 組み合わせ → 候補 [{res, key}]（同じ組み合わせで複数の字ができる場合は選ぶ）
const OPTS = new Map();
RECIPES.forEach((r, i) => { const k = pairKey(r[0], r[1]); if (!OPTS.has(k)) OPTS.set(k, []); OPTS.get(k).push({res: r[2], key: RECIPE_KEYS[i]}); });
const R = new Map([...OPTS].map(([k, l]) => [k, l[0].res]));
const INPUTS = new Set(RECIPES.flatMap(r => [r[0], r[1]]));
const isWild = k => k === WILD_TILE || k === BUSHU_TILE;
const isFinal = k => !INPUTS.has(k) && !isWild(k);
// 特殊タイル（一画・部首）とふつうの字の合体候補
const specialOpts = (a, b) => {
  const sp = isWild(a) && !isWild(b) ? a : isWild(b) && !isWild(a) ? b : null;
  if (!sp) return null;
  const l = (sp === WILD_TILE ? WILD : BUSHU_OPTS)[sp === a ? b : a];
  return l?.length ? l : null;
};
const canFuse = (a, b) => R.has(pairKey(a,b)) || !!specialOpts(a, b);
let WILD_RATE = arg("wild", SPAWN_RULE.wild);
let BUSHU_RATE = arg("bushu", SPAWN_RULE.bushu);
let CHAIN = arg("chain", 0);
let RARE_NEAR_ONLY = arg("rareNear", SPAWN_RULE.rareNearOnly ? 1 : 0);          // 1 = 連鎖あり
const DEPTH = {};
SPAWN.forEach(([k]) => DEPTH[k] = 0);
for (let ch = true; ch;){ ch = false; for (const [a,b,c] of RECIPES){ if (DEPTH[a]==null||DEPTH[b]==null||DEPTH[c]!=null) continue; DEPTH[c] = Math.max(DEPTH[a],DEPTH[b])+1; ch = true; } }
for (const [base, list] of Object.entries(WILD_EXTRA)) for (const res of list) DEPTH[res] ??= DEPTH[base] + 1;
DEPTH[WILD_TILE] = DEPTH[BUSHU_TILE] = 0;

// 乱数（再現性のためシード付き）
let seed = 1;
const rand = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };

function playGame(spawnList, found, stats){
  const pool = () => spawnList.filter(s => found.size >= s[1] && s[2] > 0);
  let grid = Array.from({length:N}, () => Array(N).fill(null));
  let turn = 0, erasers = START_ERASERS, score = 0, nid = 1;

  const spawn = () => {
    const empty = [];
    for (let r=0;r<N;r++) for (let c=0;c<N;c++) if (!grid[r][c]) empty.push([r,c]);
    if (!empty.length) return;
    const [r,c] = empty[Math.floor(rand()*empty.length)];
    const near = [[r-1,c],[r+1,c],[r,c-1],[r,c+1]].filter(([y,x]) => y>=0&&y<N&&x>=0&&x<N&&grid[y][x]).map(([y,x]) => grid[y][x].k);
    const onBoard = new Set(); for (const row of grid) for (const t of row) if (t) onBoard.add(t.k);
    const opts = pool().map(([k,,w,tag]) => {
      if (near.some(n => canFuse(n,k))) return [k, w*NEAR_BOOST];
      if (tag === "rare" && RARE_NEAR_ONLY) return [k, 0];   // 珍しい部品は合体相手の隣にしか出ない
      for (const b of onBoard) if (canFuse(b,k)) return [k, w];
      return [k, w*ABSENT];
    });
    let x = rand() * opts.reduce((a,o) => a+o[1], 0), k = opts[0][0];
    for (const [kk,w] of opts){ if ((x -= w) < 0){ k = kk; break; } }
    if (found.size >= SPAWN_RULE.wildUnlock && rand() < WILD_RATE) k = WILD_TILE;
    if (found.size >= SPAWN_RULE.bushuUnlock && rand() < BUSHU_RATE) k = BUSHU_TILE;
    grid[r][c] = {id: nid++, k, born: turn, base: true};
    const s = stats.part[k] ||= {spawned:0, merged:0, ageSum:0, stale:0, leftover:0, erased:0};
    s.spawned++;
    if (stats.late){ stats.lateTotal++; if (stats.lateSet.has(k)) stats.lateSpawn++; }
  };

  const pickOpt = list => list.length === 1 ? list[0] : list.slice().sort((x, y) =>
    (found.has(x.key) - found.has(y.key)) || (isFinal(x.res) - isFinal(y.res)) || (DEPTH[y.res] - DEPTH[x.res]))[0];

  // 盤面を動かした結果を返す（元の盤面は変えない）
  const slide = (g, dir) => {
    const [dr,dc] = dir;
    const ng = g.map(row => row.slice());
    const rows = [...Array(N).keys()], cols = [...Array(N).keys()];
    if (dr === 1) rows.reverse();
    if (dc === 1) cols.reverse();
    const fused = new Set(), merges = [];
    let moved = false;
    for (const r of rows) for (const c of cols){
      const t = ng[r][c]; if (!t) continue;
      let nr = r, nc = c, into = null;
      while (true){
        const tr = nr+dr, tc = nc+dc;
        if (tr<0||tr>=N||tc<0||tc>=N) break;
        const o = ng[tr][tc];
        if (!o){ nr = tr; nc = tc; continue; }
        if (!fused.has(o.id) && canFuse(o.k,t.k)) into = o;
        break;
      }
      if (into){
        // 候補が複数あるとき（一画タイル・選べる合体）は「未発見 → 先に続く字 → 段数が高い字」の順で選ぶ
        const opt = pickOpt(OPTS.get(pairKey(into.k, t.k)) || specialOpts(into.k, t.k));
        const res = opt.res, key = opt.key;
        const nt = {id: -(merges.length+1), k: res, born: 0, base: false};
        ng[r][c] = null;
        // into の位置を探して置換
        outer: for (let y=0;y<N;y++) for (let x=0;x<N;x++) if (ng[y][x] === into){ ng[y][x] = nt; break outer; }
        fused.add(nt.id);
        merges.push({a: into, b: t, res, key, nt});
        moved = true;
      } else if (nr !== r || nc !== c){
        ng[r][c] = null; ng[nr][nc] = t; moved = true;
      }
    }
    // 連鎖：合体してできた字の隣に合体相手がいれば、続けて合体する
    if (CHAIN){
      const queue = merges.filter(m => !isWild(m.a.k) && !isWild(m.b.k)).map(m => m.nt);
      for (let nt of queue){
        for (let level = 2; ; level++){
          let pos = null;
          for (let y=0;y<N && !pos;y++) for (let x=0;x<N;x++) if (ng[y][x] === nt){ pos = [y,x]; break; }
          if (!pos) break;   // 別の連鎖にすでに取り込まれた
          let best = null;
          for (const [y,x] of [[pos[0]-1,pos[1]],[pos[0]+1,pos[1]],[pos[0],pos[1]-1],[pos[0],pos[1]+1]]){
            const n = (y>=0&&y<N&&x>=0&&x<N) ? ng[y][x] : null;
            if (!n || isWild(n.k)) continue;
            const opts = OPTS.get(pairKey(nt.k, n.k));
            if (!opts) continue;
            const o = pickOpt(opts);
            if (!best || DEPTH[o.res] > DEPTH[best.res]) best = {n, y, x, res: o.res, key: o.key};
          }
          if (!best) break;
          const nt2 = {id: -(merges.length+1), k: best.res, born: 0, base: false};
          ng[best.y][best.x] = null; ng[pos[0]][pos[1]] = nt2;
          merges.push({a: nt, b: best.n, res: best.res, key: best.key, nt: nt2, chain: level});
          nt = nt2;
        }
      }
    }
    return {grid: ng, merges, moved};
  };

  const pairsAvailable = g => {
    let n = 0;
    for (let r=0;r<N;r++) for (let c=0;c<N;c++){
      const t = g[r][c]; if (!t) continue;
      if (c+1<N && g[r][c+1] && canFuse(t.k,g[r][c+1].k)) n++;
      if (r+1<N && g[r+1][c] && canFuse(t.k,g[r+1][c].k)) n++;
    }
    return n;
  };
  const canMove = g => { for (const row of g) for (const t of row) if (!t) return true; return pairsAvailable(g) > 0; };

  const DIRS = [[0,-1],[0,1],[-1,0],[1,0]];
  for (let i = 0; i < START_TILES; i++) spawn();

  while (true){
    if (!canMove(grid)){
      if (erasers <= 0) break;
      // 消しゴム：一番長く居座っている合体可能な部品（完成形以外を優先）を消す
      let worst = null, wr = 0, wc = 0;
      for (let r=0;r<N;r++) for (let c=0;c<N;c++){
        const t = grid[r][c];
        const scoreT = t ? (isFinal(t.k) ? 1000 : 0) + (turn - t.born) : -1;
        if (t && (!worst || scoreT > worst.s)){ worst = {t, s: scoreT}; wr = r; wc = c; }
      }
      if (worst.t.base){ const s = stats.part[worst.t.k]; s.erased++; }
      grid[wr][wc] = null; erasers--;
      continue;
    }
    // 貪欲AI：合体点＋次に合体できるペア数＋空きマスで評価
    let best = null;
    for (const d of DIRS){
      const res = slide(grid, d);
      if (!res.moved) continue;
      let v = 0;
      for (const m of res.merges) v += 10 * 2 ** (DEPTH[m.res]-1) * (isFinal(m.res) ? 0.5 : 1);
      v += 6 * pairsAvailable(res.grid);
      v += res.grid.flat().filter(x => !x).length;
      v += rand() * 0.5;
      if (!best || v > best.v) best = {v, res};
    }
    if (!best) break;
    turn++;
    grid = best.res.grid;
    for (const m of best.res.merges){
      for (const t of [m.a, m.b]) if (t.base){
        const s = stats.part[t.k]; s.merged++; const age = turn - t.born; s.ageSum += age; if (age > STALE) s.stale++;
      }
      score += 10 * 2 ** (DEPTH[m.res]-1) * (isFinal(m.res) ? 3 : 1) * (m.chain || 1);
      if (m.chain){ stats.chains = (stats.chains||0) + 1; stats.maxChain = Math.max(stats.maxChain||0, m.chain); }
      const key = m.key;
      if (!found.has(key)){ found.add(key); if (isFinal(m.res)) erasers = Math.min(erasers+1, MAX_ERASERS); }
    }
    // 新タイルの id を正規化
    for (const row of grid) for (const t of row) if (t && t.id < 0){ t.id = nid++; t.born = turn; }
    spawn();
    if (turn > 5000) break;
  }
  // 終了時の盤面
  let finals = 0, bases = 0, mids = 0;
  for (const row of grid) for (const t of row){
    if (!t) continue;
    if (t.base){ bases++; stats.part[t.k].leftover++; }
    else if (isFinal(t.k)) finals++; else mids++;
  }
  stats.games.push({turn, score, found: found.size, finals, bases, mids});
}

function run(spawnList, careers = 40, gamesPer = 12, s0 = arg("seed", 7)){
  seed = s0;
  const stats = {part: {}, games: [], byGame: [], lateTotal: 0, lateSpawn: 0,
    lateSet: new Set(spawnList.filter(s => s[1] >= 15).map(s => s[0]))};
  for (let c = 0; c < careers; c++){
    const found = new Set();
    for (let g = 0; g < gamesPer; g++){
      const before = stats.games.length;
      stats.late = g >= 6;   // 7回目以降（部品がほぼ解放された後）の出現の内訳を見る
      playGame(spawnList, found, stats);
      (stats.byGame[g] ||= []).push(stats.games[before]);
    }
  }
  return stats;
}

const avg = (xs, f) => xs.reduce((a,x) => a + f(x), 0) / xs.length;
function report(title, spawnList, stats){
  const G = stats.games;
  console.log(`\n=== ${title} ===`);
  console.log(`1ゲーム平均: ${avg(G,g=>g.turn).toFixed(0)}手 / スコア ${avg(G,g=>g.score).toFixed(0)} / 終了時の盤面: 部品 ${avg(G,g=>g.bases).toFixed(1)}・中間 ${avg(G,g=>g.mids).toFixed(1)}・完成形 ${avg(G,g=>g.finals).toFixed(1)}`);
  console.log("ゲーム回数ごとの図鑑数:", stats.byGame.map((gs,i) => `${i+1}回目 ${avg(gs,g=>g.found).toFixed(0)}`).join(" / "));
  let totSp = 0, totStuck = 0;
  const rows = spawnList.map(([k,need,w]) => {
    const s = stats.part[k] || {spawned:0, merged:0, ageSum:0, stale:0, leftover:0, erased:0};
    const stuck = s.leftover + s.erased;
    totSp += s.spawned; totStuck += stuck + s.stale;
    return {k, need, w, sp: s.spawned, mergeRate: s.spawned ? s.merged/s.spawned : 0,
      age: s.merged ? s.ageSum/s.merged : 0, stuckRate: s.spawned ? (stuck + s.stale)/s.spawned : 0};
  });
  console.log("部品 解放 重み  出現数  合体率  合体までの平均手数  放置・残り率");
  for (const r of rows) console.log(`${r.k}  ${String(r.need).padStart(3)} ${String(r.w).padStart(4)} ${String(r.sp).padStart(7)}  ${(r.mergeRate*100).toFixed(0).padStart(4)}%  ${r.age.toFixed(1).padStart(8)}          ${(r.stuckRate*100).toFixed(0).padStart(4)}%`);
  const rareSp = spawnList.filter(x => x[3] === "rare").reduce((a, [k]) => a + (stats.part[k]?.spawned || 0), 0);
  if (rareSp) console.log(`珍しい部品: 1ゲームあたり ${(rareSp/G.length).toFixed(1)}枚`);
  const w = stats.part[WILD_TILE];
  if (stats.chains) console.log(`連鎖: 1ゲームあたり ${(stats.chains/G.length).toFixed(1)}回 / 最大 ${stats.maxChain}連鎖`);
  const bu = stats.part[BUSHU_TILE];
  if (bu) console.log(`部首タイル: 1ゲームあたり ${(bu.spawned/G.length).toFixed(2)}枚 / 合体率 ${(bu.merged/bu.spawned*100).toFixed(0)}%`);
  if (w) console.log(`一画タイル: 1ゲームあたり ${(w.spawned/G.length).toFixed(1)}枚 / 合体率 ${(w.merged/w.spawned*100).toFixed(0)}% / 合体までの平均 ${(w.ageSum/Math.max(1,w.merged)).toFixed(1)}手`);
  console.log(`全体の放置・残り率: ${(totStuck/totSp*100).toFixed(1)}% / 7回目以降の出現のうち後半解放部品（八以降）の割合: ${(stats.lateSpawn/stats.lateTotal*100).toFixed(0)}%`);
  return rows;
}

// --strokeScale=0.7 … 1画の部品（一 丨 丿 丶 亅 乚）の出やすさだけを何倍かにして試す
const STROKE_SCALE = arg("strokeScale", 1);
const RARE_W = arg("rareW", 0);   // >0 なら珍しい部品の重みをこの値で試す
const current = SPAWN.map(([k,need,w,tag]) => [k, need, tag === "rare" && RARE_W ? RARE_W : STROKES.includes(k) ? Math.round(w * STROKE_SCALE * 10) / 10 : w, tag]);
const base = run(current);
const rows0 = report("現在の設定", current, base);

if (process.argv.includes("--tune")){
  // 放置されやすい部品の重みを下げ、すぐ使われる部品の重みを上げる、を繰り返す
  let list = current.map(s => s.slice());
  let bestList = list, bestScore = Infinity;
  for (let it = 0; it < 12; it++){
    const st = run(list, 30, 12, 100 + it);
    const G = st.games;
    const rows = list.map(([k]) => {
      const s = st.part[k] || {spawned:1, merged:0, stale:0, leftover:0, erased:0};
      return (s.leftover + s.erased + s.stale) / Math.max(1, s.spawned);
    });
    const tot = rows.reduce((a,x,i) => a + x * (st.part[list[i][0]]?.spawned||0), 0) / list.reduce((a,s) => a + (st.part[s[0]]?.spawned||0), 0);
    const objective = tot - 0.0005 * avg(G, g => g.found);
    console.log(`調整 ${it+1}: 放置・残り率 ${(tot*100).toFixed(1)}% / 平均図鑑 ${avg(G,g=>g.found).toFixed(0)} / 平均手数 ${avg(G,g=>g.turn).toFixed(0)}`);
    if (objective < bestScore){ bestScore = objective; bestList = list.map(s => s.slice()); }
    list = list.map(([k,need,w,tag], i) => {
      // 1回の変化は ±30% まで、重みは 4〜16 に収める（難しい部品も一定数は出るように）
      const f = Math.min(1.3, Math.max(0.7, Math.pow((1 - rows[i]) / (1 - tot), 2.5)));
      return [k, need, tag === "rare" ? w : Math.max(4, Math.min(16, Math.round(w * f))), tag];
    });
  }
  const tuned = run(bestList);
  report("調整後", bestList, tuned);
  console.log("\nSPAWN = " + JSON.stringify(bestList));
}
