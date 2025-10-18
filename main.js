// Registro del Service Worker
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js'));
}

// Instalación PWA
const installBtn = document.getElementById('installBtn');
let deferredPrompt = null;
window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  installBtn.hidden = false;
});
installBtn?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  installBtn.hidden = true;
});

// -------- Juego: Pong --------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d', { alpha: false });

// Parámetros CRT
const CRT = { scanlines: true, vignette: true, lineGap: 4, alpha: 0.06, vignetteAlpha: 0.18 };

const hud = document.getElementById('hud');
const pauseBtn = document.getElementById('pauseBtn');
const resetBtn = document.getElementById('resetBtn');
const btnUp = document.getElementById('btnUp');
const btnDown = document.getElementById('btnDown');

const W = canvas.width;
const H = canvas.height;
const mid = H / 2;

const state = {
  player: { x: 30, y: mid - 50, w: 14, h: 120, score: 0, speed: 9 },
  cpu:    { x: W - 44, y: mid - 50, w: 14, h: 120, score: 0, speed: 7.5 },
  ball:   { x: W/2, y: mid, r: 9,  vx: 6 * (Math.random() < 0.5 ? -1 : 1), vy: 3 },
  paused: false,
  over: false,
  targetScore: 10,
};

function playBeep(freq=600, duration=0.05, type='square', vol=0.1) {
  try {
    const ac = new (window.AudioContext || window.webkitAudioContext)();
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(ac.destination);
    o.start(); o.stop(ac.currentTime + duration);
  } catch {}
}

function drawTable() {
  ctx.fillStyle = '#0d1226';
  ctx.fillRect(0,0,W,H);

  // Borde
  ctx.strokeStyle = '#223058';
  ctx.lineWidth = 2;
  ctx.strokeRect(1,1,W-2,H-2);

  // Centro: banda sutil dorada (guiño bandera)
  ctx.fillStyle = 'rgba(255,205,0,0.06)';
  ctx.fillRect(W/2 - 6, 0, 12, H);

  // Línea punteada central
  ctx.setLineDash([12, 18]); ctx.strokeStyle = '#2a3c74'; ctx.beginPath();
  ctx.moveTo(W/2, 0); ctx.lineTo(W/2, H); ctx.stroke();
  ctx.setLineDash([]);

  // Marcas de esquina
  ctx.strokeStyle = '#1a2750'; ctx.lineWidth = 3;
  const m=14;
  ctx.beginPath();
  ctx.moveTo(m,m*2); ctx.lineTo(m*3,m*2);
  ctx.moveTo(W-m,m*2); ctx.lineTo(W-m*3,m*2);
  ctx.moveTo(m,H-m*2); ctx.lineTo(m*3,H-m*2);
  ctx.moveTo(W-m,H-m*2); ctx.lineTo(W-m*3,H-m*2);
  ctx.stroke();
}

function drawPaddle(p) {
  ctx.fillStyle = '#b5e3ff' /* celeste */;
  ctx.fillRect(p.x, p.y, p.w, p.h);
}

function drawCpu(p) {
  ctx.fillStyle = '#ffd27a' /* dorado */;
  ctx.fillRect(p.x, p.y, p.w, p.h);
}

function drawBall(b) {
  ctx.fillStyle = '#fff';
  ctx.beginPath();
  ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
  ctx.fill();
}

function drawCRTEffects() {
  if (CRT.scanlines) {
    ctx.globalAlpha = CRT.alpha;
    for (let y = 0; y < H; y += CRT.lineGap) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, y, W, 1);
    }
    ctx.globalAlpha = 1;
  }
  if (CRT.vignette) {
    const grad = ctx.createRadialGradient(W/2, H/2, Math.min(W,H)*0.25, W/2, H/2, Math.max(W,H)*0.7);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, `rgba(0,0,0,${CRT.vignetteAlpha})`);
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,W,H);
  }
}


function resetBall(dir = (Math.random() < 0.5 ? -1 : 1)) {
  state.ball.x = W / 2;
  state.ball.y = H / 2;
  state.ball.vx = 6 * dir;
  state.ball.vy = (Math.random()*4 - 2);
}

function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }

function update(dt) {
  if (state.paused || state.over) return;

  // Player movement
  if (keys['ArrowUp'] || keys['KeyW'] || touchDir < 0) state.player.y -= state.player.speed;
  if (keys['ArrowDown'] || keys['KeyS'] || touchDir > 0) state.player.y += state.player.speed;
  state.player.y = clamp(state.player.y, 0, H - state.player.h);

  // CPU AI: sigue la pelota con suavizado
  const target = state.ball.y - state.cpu.h/2;
  const dy = target - state.cpu.y;
  state.cpu.y += clamp(dy * 0.09, -state.cpu.speed, state.cpu.speed);
  state.cpu.y = clamp(state.cpu.y, 0, H - state.cpu.h);

  // Ball movement
  state.ball.x += state.ball.vx;
  state.ball.y += state.ball.vy;

  // Bounce top/bottom
  if (state.ball.y < state.ball.r || state.ball.y > H - state.ball.r) {
    state.ball.vy *= -1;
    state.ball.y = clamp(state.ball.y, state.ball.r, H - state.ball.r);
    playBeep(220, 0.04, 'sine');
  }

  // Collisions with paddles
  function hit(p) {
    return state.ball.x - state.ball.r < p.x + p.w &&
           state.ball.x + state.ball.r > p.x &&
           state.ball.y + state.ball.r > p.y &&
           state.ball.y - state.ball.r < p.y + p.h;
  }
  if (hit(state.player)) {
    state.ball.vx = Math.abs(state.ball.vx) * 1.04;
    const offset = (state.ball.y - (state.player.y + state.player.h/2)) / (state.player.h/2);
    state.ball.vy = offset * 6;
    state.ball.x = state.player.x + state.player.w + state.ball.r + 1;
    playBeep(880, 0.05, 'square');
  } else if (hit(state.cpu)) {
    state.ball.vx = -Math.abs(state.ball.vx) * 1.04;
    const offset = (state.ball.y - (state.cpu.y + state.cpu.h/2)) / (state.cpu.h/2);
    state.ball.vy = offset * 6;
    state.ball.x = state.cpu.x - state.ball.r - 1;
    playBeep(660, 0.05, 'square');
  }

  // Scoring
  if (state.ball.x < -10) {
    state.cpu.score++;
    playBeep(120, 0.2, 'sawtooth');
    resetBall(1);
  }
  if (state.ball.x > W + 10) {
    state.player.score++;
    playBeep(520, 0.2, 'triangle');
    resetBall(-1);
  }

  // Fin de partido
  const winBy2 = Math.abs(state.player.score - state.cpu.score) >= 2;
  if ((state.player.score >= state.targetScore || state.cpu.score >= state.targetScore) && winBy2) {
    state.over = true;
    playBeep(state.player.score > state.cpu.score ? 1000 : 100, 0.5, 'square', 0.15);
  }
}

function render() {
  drawTable();
  drawPaddle(state.player);
  drawCpu(state.cpu);
  drawBall(state.ball);

  ctx.fillStyle = '#e8e8f0';
  ctx.font = 'bold 48px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.shadowColor = 'rgba(0,0,0,.6)';
  ctx.shadowBlur = 8;
  ctx.fillText(`${state.player.score}   ${state.cpu.score}`, W/2, 70);
  ctx.shadowBlur = 0;

  drawCRTEffects();

  if (state.paused) {
    ctx.fillStyle = 'rgba(0,0,0,.45)';
    ctx.fillRect(0,0,W,H);
    ctx.fillStyle = '#e8e8f0';
    ctx.font = 'bold 36px system-ui, sans-serif';
    ctx.fillText('Pausa', W/2, H/2);
  }

  if (state.over) {
    ctx.fillStyle = 'rgba(0,0,0,.5)';
    ctx.fillRect(0,0,W,H);
    ctx.fillStyle = '#e8e8f0';
    ctx.font = 'bold 40px system-ui, sans-serif';
    const msg = state.player.score > state.cpu.score ? '¡Ganaste!' : '¡Fuiste!';
    ctx.fillText(msg, W/2, H/2 - 10);
    ctx.font = 'bold 22px system-ui, sans-serif';
    ctx.fillText('Pulsa Reiniciar para jugar otra vez', W/2, H/2 + 28);
  }
}

let last = 0;
function loop(ts) {
  const dt = (ts - last) / 16.6667;
  last = ts;
  update(dt);
  render();
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

function updateHud() {
  hud.textContent = `Puntaje — Tú ${state.player.score} : ${state.cpu.score} CPU`;
}
setInterval(updateHud, 250);

// Controles
const keys = {};
let touchDir = 0;
document.addEventListener('keydown', (e) => {
  keys[e.code] = true;
  if (e.code === 'Space') togglePause();
});
document.addEventListener('keyup', (e) => keys[e.code] = false);

btnUp.addEventListener('touchstart', () => touchDir = -1);
btnDown.addEventListener('touchstart', () => touchDir = 1);
['touchend','touchcancel'].forEach(ev=>{
  btnUp.addEventListener(ev, () => touchDir = 0);
  btnDown.addEventListener(ev, () => touchDir = 0);
});

function togglePause(){
  state.paused = !state.paused;
  pauseBtn.textContent = state.paused ? '▶️ Reanudar' : '⏸️ Pausa';
}
pauseBtn.addEventListener('click', togglePause);
resetBtn.addEventListener('click', () => {
  Object.assign(state.player, {score:0, y: H/2 - state.player.h/2});
  Object.assign(state.cpu, {score:0, y: H/2 - state.cpu.h/2});
  state.over = false; state.paused = false;
  resetBall();
});

// Resize para mantener nitidez en móviles (mantener canvas interno grande)
const ro = new ResizeObserver(() => {
  // Nada: el canvas usa CSS para escalar manteniendo resolución interna alta.
});
ro.observe(canvas);
