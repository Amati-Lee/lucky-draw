// Lucky Draw 回歸測試 — node test/verify.js
//
// 量的是「畫面上實際停在哪一格」，不是重算 planSpin 的公式（那是循環論證）：
// 轉盤 → 取指針正下方那個像素的色號反推格號；快閃 → 直接讀畫面上定格的名字。
//
// 需要 Playwright：`npm i -D playwright-core`，
// 或把別處裝好的路徑放進環境變數 PLAYWRIGHT_PATH 再跑。
const path = require('path');

let chromium;
for (const m of ['playwright-core', 'playwright', process.env.PLAYWRIGHT_PATH]) {
  if (!m) continue;
  try { ({ chromium } = require(m)); break; } catch {}
}
if (!chromium) {
  console.error('找不到 Playwright。請 npm i -D playwright-core，或設定 PLAYWRIGHT_PATH 後再跑。');
  process.exit(1);
}

const ROOT = 'file:///' + path.resolve(__dirname, '..').replace(/\\/g, '/');
const INDEX = ROOT + '/index.html';
const PICK = ROOT + '/pick.html';

// 互不相同的顏色：產品的 6 色表在 n=12 時第 i 格與第 i+6 格的鄰色組相同，會造成誤判
const PAL = ['#ff0000','#00ff00','#0000ff','#ffff00','#ff00ff','#00ffff','#800000','#008000',
             '#000080','#808000','#800080','#008080','#ff8000','#8000ff','#00ff80','#ff0080'];

const NAMES = ('陳小明 林佳穎 王怡君 張志豪 李承恩 黃雅婷 吳建宏 劉思妤 蔡宜蓁 鄭家豪 許文彥 謝家寧 '
  + '郭柏翰 洪詩涵 曾品瑜 廖俊傑 賴冠廷 周雨潔 徐若涵 葉振豪 潘語晴 蕭宇軒 游宗翰 盧佩珊 范哲瑋 '
  + '杜筱雯 孫立群 邱仲凱 童嘉文 馮美玲').split(/\s+/);

let pass = 0, fail = 0;
const ok = (cond, label, extra) => {
  if (cond) { pass++; console.log(`  ✓ ${label}`); }
  else { fail++; console.log(`  ✗ ${label}` + (extra ? '  ' + JSON.stringify(extra) : '')); }
};

// ── 瀏覽器端：取指針正下方的色號 → 第幾格 ──
const SLICE_UNDER_POINTER = `(PAL) => {
  const ctx = document.getElementById('wheelCanvas').getContext('2d');
  const d = ctx.getImageData(300, 40, 1, 1).data;
  const hx = '#' + [d[0],d[1],d[2]].map(v => v.toString(16).padStart(2,'0')).join('');
  return PAL.indexOf(hx);
}`;

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));

  // ───────── index.html：抽獎轉盤 ─────────
  console.log('\n【index.html 抽獎轉盤】落點一致性');
  for (const n of [2, 3, 6, 7, 10, 12, 16]) {
    await page.goto(INDEX);
    const r = await page.evaluate(async ({ n, PAL, TRIALS, SUP }) => {
      let f = 0;                                          // 快轉動畫
      performance.now = () => f;
      window.requestAnimationFrame = cb => { f += 1e5; setTimeout(() => cb(f), 0); return 0; };
      rewards = Array.from({ length: n }, (_, i) => ({ text: 'N' + i }));
      currentMode = 'reward';
      drawWheel = function () {                            // 只換調色盤，幾何不動
        renderWheel(document.getElementById('wheelCanvas').getContext('2d'),
          { items: getItems(), angle: wheelAngle, size: 600, radius: 280, colors: PAL });
      };
      drawWheel();
      const under = eval(SUP);
      let hit = 0; const bad = [];
      for (let k = 0; k < TRIALS; k++) {
        spin();
        await new Promise(res => setTimeout(res, 25));
        const pos = under(PAL);
        const 畫面上 = pos >= 0 ? getItems()[pos].text : '(色號對不到)';
        const 宣告 = document.getElementById('resultText').textContent;
        if (畫面上 === 宣告) hit++; else bad.push({ 宣告, 畫面上 });
        closeResult();
      }
      return { hit, TRIALS, bad: bad.slice(0, 2) };
    }, { n, PAL, TRIALS: 25, SUP: SLICE_UNDER_POINTER });
    ok(r.hit === r.TRIALS, `${String(n).padStart(2)} 格：畫面 vs 顯示框 ${r.hit}/${r.TRIALS}`, r.bad);
  }

  // 轉動中干擾
  console.log('\n【index.html】轉動中點模式鈕／設定鈕');
  await page.goto(INDEX);
  for (const [label, act] of [
    ['不干擾（對照）', async () => {}],
    ['中途點「處罰」', async () => { await page.click('.mode-btn.punish', { force: true }).catch(() => {}); }],
    ['中途點「設定」', async () => { await page.click('#settingsBtn', { force: true }).catch(() => {}); }],
  ]) {
    await page.evaluate(() => { closeResult(); resetData(); currentMode = 'reward'; setMode('reward'); spin(); });
    await page.waitForTimeout(900);
    await act();
    await page.waitForTimeout(5200);
    const r = await page.evaluate(() => {
      const ctx = document.getElementById('wheelCanvas').getContext('2d');
      const RC = ['#0f3460','#16213e','#1a3a5c','#132a46','#1e4070','#112244'];
      const PC = ['#2d1b2e','#3a1c2e','#4a1c3e','#2a1a2a','#3c2040','#331a2e'];
      const d = ctx.getImageData(300, 40, 1, 1).data;
      const hx = '#' + [d[0],d[1],d[2]].map(v => v.toString(16).padStart(2,'0')).join('');
      const i = (currentMode === 'reward' ? RC : PC).indexOf(hx);
      const items = getItems();
      const shown = document.getElementById('resultText').textContent;
      return { shown, under: i >= 0 && items[i] ? items[i].text : '?', ok: !!(items[i] && items[i].text === shown) };
    });
    ok(r.ok, `${label} → 顯示框「${r.shown}」/ 底圖「${r.under}」`);
  }

  // ───────── pick.html：抽學生 ─────────
  console.log('\n【pick.html】名單解析（從 Excel 貼上的各種形狀）');
  await page.goto(PICK);
  const cases = [
    ['Excel 一欄', '陳小明\n林佳穎\n王怡君', '陳小明|林佳穎|王怡君'],
    ['Excel 座號+姓名', '1\t陳小明\n2\t林佳穎', '陳小明|林佳穎'],
    ['CSV 座號,姓名', '1,陳小明\n2,林佳穎', '陳小明|林佳穎'],
    ['編號 1. 姓名', '1. 陳小明\n2. 林佳穎', '陳小明|林佳穎'],
    ['編號 1、姓名', '1、陳小明\n2、林佳穎', '陳小明|林佳穎'],
    ['空行與多餘空白', ' 陳小明 \n\n  \n林佳穎\n', '陳小明|林佳穎'],
    ['姓名,備註', '陳小明,第一部\n林佳穎,第二部', '陳小明|林佳穎'],
    ['同名兩人要保留', '陳小明\n陳小明', '陳小明|陳小明'],
  ];
  for (const [label, input, expect] of cases) {
    const got = await page.evaluate(s => parseRoster(s).join('|'), input);
    ok(got === expect, `${label} → ${got}`, got === expect ? null : { expect });
  }

  console.log('\n【pick.html】抽一輪：畫面定格的名字 vs 結果框宣告的名字');
  for (const n of [8, 12, 13, 30]) {
    await page.goto(PICK);
    const r = await page.evaluate(async ({ names, n, PAL, SUP }) => {
      data = { classes: [{ name: 'T', students: names.slice(0, n), drawn: [] }], current: 0 };
      wheelAngle = 0; renderAll();
      drawWheelNow = function (rem) {                       // 只換調色盤
        const c = document.getElementById('wheelCanvas'); if (!c) return;
        renderWheel(c.getContext('2d'), {
          items: rem.map(i => ({ text: cls().students[i] })), angle: wheelAngle,
          size: 600, radius: 280, colors: PAL, ring: 'rgba(245,197,24,0.35)',
          fontSize: 18, smallFontSize: 14, wrapAt: 5,
        });
      };
      renderStage();
      const under = eval(SUP);
      let hit = 0, total = 0; const bad = []; const modes = new Set();
      while (remaining().length) {
        const rem = remaining().slice();
        const mode = useWheel() ? 'wheel' : 'flash';   // 判準是全班人數，不是剩餘人數
        modes.add(mode);
        draw();
        await new Promise(res => { const t = setInterval(() => { if (!drawing) { clearInterval(t); res(); } }, 40); });
        const 宣告 = document.getElementById('resultName').textContent;
        let 畫面上;
        if (mode === 'wheel') { const p = under(PAL); 畫面上 = p >= 0 && rem[p] !== undefined ? cls().students[rem[p]] : '(色號對不到)'; }
        else 畫面上 = document.getElementById('flashName').textContent;
        total++; if (畫面上 === 宣告) hit++; else bad.push({ 宣告, 畫面上, mode });
        closeResult();
      }
      const drawn = data.classes[0].drawn;
      return { hit, total, bad: bad.slice(0, 2), modes: [...modes].join('+'),
               重複: drawn.length !== new Set(drawn).size, 抽到人數: drawn.length,
               鈕: document.getElementById('drawBtn').textContent.trim() };
    }, { names: NAMES, n, PAL, SUP: SLICE_UNDER_POINTER });
    ok(r.hit === r.total, `${String(n).padStart(2)} 人（${r.modes}）一致 ${r.hit}/${r.total}`, r.bad);
    ok(!r.重複 && r.抽到人數 === n, `${String(n).padStart(2)} 人：抽滿一輪 ${r.抽到人數} 人、無重複`);
    ok(/再來一輪/.test(r.鈕), `${String(n).padStart(2)} 人：抽完後按鈕變「再來一輪」`);
  }

  // ⛔ 呈現方式由「全班總人數」決定，整輪都不變 —— 大班抽到剩幾個人也不該突然冒出轉盤
  console.log('\n【pick.html】呈現方式整輪不變（判準＝全班人數）');
  await page.goto(PICK);
  for (const [total, expectWheel] of [[8, true], [12, true], [13, false], [30, false]]) {
    const r = await page.evaluate(({ names, total }) => {
      data = { classes: [{ name: 'T', students: names.slice(0, total), drawn: [] }], current: 0 };
      const out = [];
      // 從全員到只剩 1 人，每一步都看一次用的是哪種呈現
      for (let drawnCount = 0; drawnCount < total; drawnCount++) {
        data.classes[0].drawn = Array.from({ length: drawnCount }, (_, i) => i);
        renderAll();
        out.push({ 剩: remaining().length, 轉盤: !!document.getElementById('wheelCanvas'), 快閃: !!document.getElementById('flashName') });
      }
      return out;
    }, { names: NAMES, total });
    const allWheel = r.every(s => s.轉盤 && !s.快閃);
    const allFlash = r.every(s => s.快閃 && !s.轉盤);
    const got = allWheel ? '全程轉盤' : allFlash ? '全程快閃' : '中途變了';
    ok(expectWheel ? allWheel : allFlash,
      `全班 ${String(total).padStart(2)} 人：剩 ${r[0].剩}→${r[r.length-1].剩} 人 ${got}（應${expectWheel ? '全程轉盤' : '全程快閃'}）`,
      (expectWheel ? allWheel : allFlash) ? null : r.filter(s => (expectWheel ? !s.轉盤 : !s.快閃)).slice(0, 3));
  }

  // ───────── 突變測試：確認上面那把量尺不是「永遠通過」 ─────────
  console.log('\n【突變測試】故意把落點算錯，量尺必須報錯');
  for (const [label, mut, shouldCatch] of [
    ['原樣（對照）', 'void 0', false],
    ['target 加回 +π/2', 'planSpin=(a,n,w)=>{const A=2*Math.PI,arc=A/n,t=-(w+.5)*arc+Math.PI/2,c=((a%A)+A)%A,d=(((t-c)%A)+A)%A;return{target:((t%A)+A)%A,totalSpin:5*A+d}}', true],
    ['target 差一格', 'planSpin=(a,n,w)=>{const A=2*Math.PI,arc=A/n,t=-(w+1.5)*arc,c=((a%A)+A)%A,d=(((t-c)%A)+A)%A;return{target:((t%A)+A)%A,totalSpin:5*A+d}}', true],
    ['target 完全隨機', 'planSpin=(a,n,w)=>{const A=2*Math.PI;const t=Math.random()*A;return{target:t,totalSpin:5*A+t}}', true],
  ]) {
    await page.goto(INDEX);
    const hit = await page.evaluate(async ({ PAL, mut, SUP }) => {
      let f = 0; performance.now = () => f;
      window.requestAnimationFrame = cb => { f += 1e5; setTimeout(() => cb(f), 0); return 0; };
      eval(mut);
      rewards = Array.from({ length: 10 }, (_, i) => ({ text: 'N' + i })); currentMode = 'reward';
      drawWheel = function () { renderWheel(document.getElementById('wheelCanvas').getContext('2d'),
        { items: getItems(), angle: wheelAngle, size: 600, radius: 280, colors: PAL }); };
      drawWheel();
      const under = eval(SUP);
      let h = 0;
      for (let k = 0; k < 25; k++) {
        spin(); await new Promise(r => setTimeout(r, 25));
        const p = under(PAL);
        if (p >= 0 && getItems()[p].text === document.getElementById('resultText').textContent) h++;
        closeResult();
      }
      return h;
    }, { PAL, mut, SUP: SLICE_UNDER_POINTER });
    const caught = hit < 25;
    ok(caught === shouldCatch, `${label} → 一致 ${hit}/25` + (shouldCatch ? '（量尺應報錯）' : '（量尺應通過）'));
  }

  ok(errors.length === 0, `整輪沒有 JS 錯誤`, errors.slice(0, 3));

  await browser.close();
  console.log(`\n${fail === 0 ? '✅ 全部通過' : '❌ 有失敗項'}：通過 ${pass}、失敗 ${fail}\n`);
  process.exit(fail === 0 ? 0 : 1);
})();
