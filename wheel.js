// wheel.js — 轉盤的繪製與落點計算，index.html（抽獎）與 pick.html（抽學生）共用。
// ⛔ 落點數學只有這一份：改這裡之前先看 README 的「為什麼圈數必須是整數」。

const TAU = Math.PI * 2;

// 第 i 格的中心畫在 angle + (i+0.5)*arc - PI/2；指針固定在正上方 (-PI/2)。
function renderWheel(ctx, cfg) {
  const items = cfg.items;
  const n = items.length;
  if (n === 0) return;

  const size = cfg.size || 600;
  const r = cfg.radius || size * 0.4667;
  const cx = size / 2, cy = size / 2;
  const arc = TAU / n;
  const colors = cfg.colors;
  const angle = cfg.angle;
  const textColor = cfg.textColor || '#eaeaea';
  const wrapAt = cfg.wrapAt || 6;

  ctx.clearRect(0, 0, size, size);

  // 只剩一格時沒有扇形可分：畫整片圓（不要那條多餘的半徑線），名字用正的寫在下方。
  // 否則 n=1 的中心角正好朝正下方，沿半徑寫的字會變成倒的。
  if (n === 1) {
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.fillStyle = colors[0];
    ctx.fill();
    ctx.textAlign = 'center';
    if (items[0].emoji) {
      ctx.fillStyle = cfg.emojiColor || textColor;
      ctx.font = cfg.emojiFont || '24px sans-serif';
      ctx.fillText(items[0].emoji, cx, cy + r * 0.3);
    }
    ctx.fillStyle = textColor;
    ctx.font = `${(cfg.fontSize || 14) * 1.6}px "Microsoft JhengHei", sans-serif`;
    ctx.fillText(items[0].text, cx, cy + r * 0.55);
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, TAU);
    ctx.strokeStyle = cfg.ring || 'rgba(255,255,255,0.3)';
    ctx.lineWidth = 4;
    ctx.stroke();
    return;
  }

  for (let i = 0; i < n; i++) {
    const startAngle = angle + i * arc - Math.PI / 2;
    const midAngle = startAngle + arc / 2;

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.arc(cx, cy, r, startAngle, startAngle + arc);
    ctx.closePath();
    ctx.fillStyle = colors[i % colors.length];
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(midAngle);
    // 左半邊的格子，文字會上下顛倒 → 多轉 180° 並把 x 取負，位置不變但字是正的
    const flipped = Math.cos(midAngle) < 0;
    const dir = flipped ? -1 : 1;
    if (flipped) ctx.rotate(Math.PI);
    ctx.textAlign = 'center';

    if (items[i].emoji) {
      ctx.fillStyle = cfg.emojiColor || textColor;
      ctx.font = (cfg.emojiFont || '24px sans-serif');
      ctx.fillText(items[i].emoji, dir * r * 0.55, 6);
    }

    ctx.fillStyle = textColor;
    const txt = items[i].text;
    const fontFamily = '"Microsoft JhengHei", sans-serif';
    const rText = items[i].emoji ? r * 0.75 : r * 0.62;
    if (txt.length > wrapAt) {
      ctx.font = `${cfg.smallFontSize || 12}px ${fontFamily}`;
      ctx.fillText(txt.slice(0, wrapAt), dir * rText, 4);
      ctx.fillText(txt.slice(wrapAt), dir * rText, 18);
    } else {
      ctx.font = `${cfg.fontSize || 14}px ${fontFamily}`;
      ctx.fillText(txt, dir * rText, 6);
    }
    ctx.restore();
  }

  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, TAU);
  ctx.strokeStyle = cfg.ring || 'rgba(255,255,255,0.3)';
  ctx.lineWidth = 4;
  ctx.stroke();
}

// 算出「要讓第 winIdx 格停在指針下」該轉多少。
// ⛔⛔ 多轉的圈數必須是整數圈：小數圈會把落點推掉一個隨機量，
//     顯示框就會跟底圖不一致（2026-11-01 修掉的那個 bug）。
function planSpin(currentAngle, n, winIdx, minTurns, maxExtraTurns) {
  const arc = TAU / n;
  const target = -(winIdx + 0.5) * arc;              // 中獎格對準指針時的角度
  const current = ((currentAngle % TAU) + TAU) % TAU;
  const delta = (((target - current) % TAU) + TAU) % TAU;   // 往前轉到目標還差多少 (0~2π)
  const turns = (minTurns || 5) + Math.floor(Math.random() * (maxExtraTurns || 4));
  return { target: ((target % TAU) + TAU) % TAU, totalSpin: turns * TAU + delta };
}

function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
