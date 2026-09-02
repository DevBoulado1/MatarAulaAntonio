
(() => {
  'use strict';

  // Display canvas
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');
  ctx.imageSmoothingEnabled = false;

  // Offscreen low-res canvas for real pixel art look
  const W = 320, H = 200;
  const scene = document.createElement('canvas');
  scene.width = W; scene.height = H;
  const sctx = scene.getContext('2d');
  sctx.imageSmoothingEnabled = false;

  const wrap = document.getElementById('canvasWrap');
  const crosshair = document.getElementById('crosshair');

  const ui = {
    score: document.getElementById('scoreEl'),
    combo: document.getElementById('comboEl'),
    health: document.getElementById('healthEl'),
    healthBar: document.getElementById('healthBar'),
    ammo: document.getElementById('ammoEl'),
    wave: document.getElementById('waveEl'),
    kills: document.getElementById('killsEl'),
    accuracy: document.getElementById('accuracyEl'),
    record: document.getElementById('recordEl'),
    playerTag: document.getElementById('playerTag'),
    classTag: document.getElementById('classTag'),
    modeTag: document.getElementById('modeTag'),
    menu: document.getElementById('menuOverlay'),
    setup: document.getElementById('setupOverlay'),
    pause: document.getElementById('pauseOverlay'),
    over: document.getElementById('gameOverOverlay'),
    announce: document.getElementById('announce'),
    announceTitle: document.getElementById('announceTitle'),
    announceText: document.getElementById('announceText'),
    finalStats: document.getElementById('finalStats'),
    gameOverTitle: document.getElementById('gameOverTitle'),
    weapon: document.getElementById('weapon'),
    weaponBuff: document.getElementById('weaponBuffEl'),
    flash: document.getElementById('weaponFlash'),
    nameInput: document.getElementById('nameInput'),
    classInput: document.getElementById('classInput')
  };

  const STORAGE_KEY = 'tonhao_remake_scores_v1';

  const sprites = [
    loadImg('assets/tonhao_preto.png'),
    loadImg('assets/tonhao_verde.png'),
    loadImg('assets/tonhao_vinho.png')
  ];

  // Cenário principal do jogo
  const schoolBackground = loadImg('assets/cenario-escola.png');

  function loadImg(src){
    const img = new Image();
    img.src = src;
    return img;
  }

  let state = 'menu';
  let testMode = false;
  let player = {name:'', turma:''};
  let score=0, combo=1, health=100, ammo=6, kills=0, shots=0, hits=0, wave=0, weaponBuff=0;
  let spawnTimer=0, waveTimer=0, comboTimer=0, reloadUntil=0, difficulty=1, gameStart=0;
  let enemies=[], particles=[], tracers=[];
  let mouse = {x:canvas.width/2, y:canvas.height/2};
  let shake = 0, screenFlash = 0;
  let last = performance.now();
  let audioCtx = null;

  function rand(a,b){ return a + Math.random()*(b-a); }
  function clamp(v,a,b){ return Math.max(a, Math.min(b,v)); }
  function lerp(a,b,t){ return a+(b-a)*t; }
  function accuracy(){ return shots ? Math.round(hits/shots*100) : 0; }

  function loadScores(){
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]'); }
    catch { return []; }
  }
  function saveScores(v){ localStorage.setItem(STORAGE_KEY, JSON.stringify(v)); }

  function renderScores(){
    const list = loadScores();
    const body = document.getElementById('scoreBody');
    body.innerHTML = '';
    if(!list.length){
      body.innerHTML = '<tr><td colspan="4" style="text-align:center;color:#748396;padding:28px">Ainda não há pontuações.</td></tr>';
    }else{
      list.slice(0,12).forEach((item, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `<td>${i+1}</td><td>${escapeHtml(item.name)}</td><td>${escapeHtml(item.turma)}</td><td>${item.score}</td>`;
        body.appendChild(tr);
      });
    }
    setPodium('1', list[0]);
    setPodium('2', list[1]);
    setPodium('3', list[2]);
    ui.record.textContent = list[0]?.score || 0;
  }
  function setPodium(n, item){
    document.getElementById(`p${n}Name`).textContent = item?.name || '—';
    document.getElementById(`p${n}Score`).textContent = item?.score || '0';
  }
  function escapeHtml(s){
    return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;', "'":'&#039;'}[c]));
  }
  function addScore(){
    if(testMode || !player.name) return;
    const list = loadScores();
    list.push({name:player.name, turma:player.turma, score, kills, accuracy:accuracy(), time:Date.now()});
    list.sort((a,b)=>b.score-a.score);
    saveScores(list.slice(0,50));
  }

  function showOnly(target){
    ui.menu.classList.toggle('hidden', target !== 'menu');
    ui.setup.classList.toggle('hidden', target !== 'setup');
    ui.pause.classList.toggle('hidden', target !== 'pause');
    ui.over.classList.toggle('hidden', target !== 'over');
  }

  function startGame(isTest=false){
    testMode = isTest;
    player.name = isTest ? 'TESTE' : (ui.nameInput.value.trim() || 'JOGADOR');
    player.turma = isTest ? 'DEMO' : (ui.classInput.value.trim() || '—');

    score=0; combo=1; health=100; ammo=6; kills=0; shots=0; hits=0; wave=0; weaponBuff=0;
    spawnTimer=.7; waveTimer=0; comboTimer=0; reloadUntil=0; difficulty=1; gameStart=performance.now();
    enemies=[]; particles=[]; tracers=[]; shake=0; screenFlash=0;
    state = 'playing';
    showOnly('none');
    ui.playerTag.textContent = `JOGADOR: ${player.name.toUpperCase()}`;
    ui.classTag.textContent = `TURMA: ${player.turma.toUpperCase()}`;
    ui.modeTag.textContent = isTest ? 'MODO: TESTE' : 'MODO: VALENDO';
    showMsg('PREPARA...', 'A aula vai começar.', 1000);
    updateHUD();
    beep(180,.06,'square',.02);
  }

  function backToMenu(){
    state = 'menu';
    showOnly('menu');
    ui.modeTag.textContent = 'MODO: AGUARDANDO';
    renderScores();
  }

  function endGame(){
    state = 'over';
    addScore();
    renderScores();
    ui.finalStats.innerHTML = `<b>${score}</b> pontos • ${kills} abates • ${accuracy()}% de precisão`;
    const top = loadScores()[0]?.score || 0;
    ui.gameOverTitle.textContent = (!testMode && score >= top) ? 'NOVO RECORDE!' : 'A AULA TE PEGOU.';
    showOnly('over');
    ui.modeTag.textContent = 'MODO: ENCERRADO';
    beep(90,.25,'sawtooth',.02);
  }

  function pauseToggle(){
    if(state === 'playing'){
      state = 'paused';
      showOnly('pause');
      ui.modeTag.textContent = 'MODO: PAUSADO';
    }else if(state === 'paused'){
      state = 'playing';
      showOnly('none');
      ui.modeTag.textContent = testMode ? 'MODO: TESTE' : 'MODO: VALENDO';
      last = performance.now();
    }
  }

  function showMsg(title, text, ms=900, bossWarning=false){
    ui.announceTitle.textContent = title;
    ui.announceText.textContent = text;
    ui.announce.classList.toggle('boss-warning', bossWarning);
    ui.announce.classList.remove('hidden');
    clearTimeout(showMsg.t);
    showMsg.t = setTimeout(()=>{
      ui.announce.classList.add('hidden');
      ui.announce.classList.remove('boss-warning');
    }, ms);
  }

  function updateHUD(){
    ui.score.textContent = String(score).padStart(6,'0');
    ui.combo.textContent = `x${combo}`;
    ui.weaponBuff.textContent = `NV. ${weaponBuff}`;
    ui.health.textContent = Math.round(health);
    ui.healthBar.style.width = `${clamp(health,0,100)}%`;
    ui.healthBar.style.background = health>55 ? '#61da8b' : health>25 ? '#ffb84d' : '#ff5a6a';
    ui.ammo.textContent = performance.now() < reloadUntil ? 'RECARREGANDO...' : `${ammo} / ∞`;
    ui.wave.textContent = wave;
    ui.kills.textContent = kills;
    ui.accuracy.textContent = `${accuracy()}%`;
  }

  function beep(freq=240, dur=.05, type='square', gain=.02){
    try{
      audioCtx ||= new (window.AudioContext || window.webkitAudioContext)();
      const osc = audioCtx.createOscillator();
      const g = audioCtx.createGain();
      osc.type = type; osc.frequency.value = freq; g.gain.value = gain;
      osc.connect(g); g.connect(audioCtx.destination);
      const now = audioCtx.currentTime;
      osc.start(now);
      g.gain.exponentialRampToValueAtTime(.0001, now + dur);
      osc.stop(now + dur);
    }catch{}
  }

  function spawnEnemy(){
    const lanes = [-0.50, -0.28, 0, 0.28, 0.50];
    const roll = Math.random();
    let type = 'normal';
    if(roll > .87) type='tank';
    else if(roll > .65) type='fast';
    const cfg = {
      normal:{hp:1,speed:.060,worth:100,scale:1},
      fast:{hp:1,speed:.092,worth:145,scale:.88},
      tank:{hp:3,speed:.042,worth:240,scale:1.18}
    }[type];
    enemies.push({
      lane: lanes[Math.floor(Math.random()*lanes.length)] + rand(-.01,.01),
      z: 1.08,
      hp: cfg.hp,
      maxHp: cfg.hp,
      speed: cfg.speed*(1+difficulty*.07),
      worth: cfg.worth,
      scale: cfg.scale,
      type,
      sprite: sprites[Math.floor(Math.random()*sprites.length)],
      hitFlash: 0
    });
  }

  function spawnBoss(){
    const bossHp = 28 + Math.floor(difficulty * 4);
    // A rodada de boss fica exclusiva: os spawns normais só voltam após ele cair.
    enemies.push({
      lane: 0,
      z: 1.12,
      hp: bossHp,
      maxHp: bossHp,
      speed: .027 * (1 + difficulty * .035),
      worth: 2200,
      scale: 1.42,
      type: 'boss',
      sprite: sprites[0],
      hitFlash: 0
    });
    showMsg('NÃO FALE MAL DO GRÊMIO', 'você falou mal do Grêmio', 2800, true);
    beep(72, .32, 'sawtooth', .035);
  }

  function enemyScreen(e){
    const perspective = 1/(e.z+.08);
    const t = clamp(1 - e.z, 0, 1);

    // Mantém os inimigos "no chão" do cenário.
    // Antes eles surgiam muito altos, parecendo vir do teto.
    const x = W/2 + e.lane * 84 * perspective * 2.75;

    // Linha do chão do fundo até a frente do cenário.
    const floorY = lerp(H*.54, H*.92, Math.pow(t, 0.9));

    const h = clamp(52*perspective*e.scale, 18, 140);
    const w = h * 0.66;

    // y representa o ponto de contato dos pés com o chão.
    return {x, y: floorY, w, h};
  }

  function shoot(){
    if(state !== 'playing') return;
    const now = performance.now();
    if(now < reloadUntil) return;
    if(ammo <= 0){ reload(); return; }

    ammo--; shots++;
    shake = Math.max(shake, 4);
    screenFlash = .08;
    ui.weapon.classList.add('recoil');
    ui.flash.classList.add('show');
    setTimeout(()=>ui.weapon.classList.remove('recoil'), 70);
    setTimeout(()=>ui.flash.classList.remove('show'), 45);

    tracers.push({x1:W/2, y1:H*.92, x2:mouse.x/3, y2:mouse.y/3, life:.07});
    beep(150,.03,'square',.03);

    let target = null, best = Infinity;
    for(const e of enemies){
      const s = enemyScreen(e);
      const left = s.x - s.w/2, top = s.y - s.h;
      if((mouse.x/3) >= left && (mouse.x/3) <= left+s.w && (mouse.y/3) >= top && (mouse.y/3) <= top+s.h){
        if(e.z < best){ target = e; best = e.z; }
      }
    }
    if(target){
      hits++;
      target.hp -= 1 + weaponBuff;
      target.hitFlash = .1;
      spawnHitParticles(mouse.x/3, mouse.y/3);
      beep(400,.02,'square',.016);
      if(target.hp <= 0) killEnemy(target);
    }else{
      combo = 1;
      comboTimer = 0;
    }

    if(ammo === 0) setTimeout(reload, 160);
    updateHUD();
  }

  function reload(){
    if(state !== 'playing' || ammo === 6 || performance.now() < reloadUntil) return;
    reloadUntil = performance.now() + 900;
    showMsg('RECARREGANDO', 'Rápido!', 700);
    beep(240,.04,'square',.015);
    setTimeout(()=>{
      if(state === 'playing'){
        ammo = 6;
        beep(320,.05,'square',.018);
        updateHUD();
      }
    }, 900);
    updateHUD();
  }

  function damagePlayer(amount){
    health -= amount;
    shake = 10;
    screenFlash = .18;
    combo = 1;
    comboTimer = 0;
    beep(82,.14,'sawtooth',.02);
    if(health <= 0){
      health = 0;
      updateHUD();
      endGame();
    }
  }

  function killEnemy(enemy){
    const s = enemyScreen(enemy);
    enemies = enemies.filter(e => e !== enemy);
    combo = clamp(combo+1, 1, 9);
    comboTimer = 2.2;
    kills++;
    score += (enemy.worth + Math.round(enemy.z*80))*combo;
    spawnDeathParticles(s.x, s.y-s.h*.6, s.h);
    if(enemy.type === 'boss'){
      showMsg('BOSS DERROTADO!', 'O corredor está livre de novo.', 1200);
      beep(520, .12, 'square', .03);
    }
    if(kills % 10 === 0){
      health = clamp(health+10, 0, 100);
      showMsg('10 ABATES!', '+10 VIDA', 850);
    }
    updateHUD();
  }

  function spawnHitParticles(x,y){
    for(let i=0;i<7;i++) particles.push({x,y,vx:rand(-28,28),vy:rand(-28,28),life:rand(.12,.28),max:.28,size:rand(1,2),kind:'spark'});
  }
  function spawnDeathParticles(x,y,size){
    for(let i=0;i<18;i++) particles.push({x,y,vx:rand(-40,40),vy:rand(-52,24),life:rand(.35,.8),max:.8,size:rand(1,Math.max(2,size*.05)),kind:i%2?'paper':'spark'});
  }

  function update(dt){
    if(state !== 'playing') return;

    difficulty = 1 + (performance.now()-gameStart)/45000;
    comboTimer -= dt;
    if(comboTimer <= 0 && combo > 1){ combo = 1; comboTimer = 0; }

    spawnTimer -= dt;
    waveTimer += dt;
    const interval = clamp(1.08 - difficulty*.08, .34, 1.08);
    const bossAlive = enemies.some(e => e.type === 'boss');
    if(spawnTimer <= 0 && !bossAlive && wave % 5 !== 0){
      spawnEnemy();
      if(Math.random() < Math.min(.28, (difficulty-1)*.06)) spawnEnemy();
      spawnTimer = interval * rand(.72,1.14);
    }

    const newWave = Math.floor(waveTimer/15)+1;
    if(newWave !== wave){
      wave = newWave;
      if(wave % 5 === 0){
        enemies = [];
        spawnBoss();
      }else if(wave > 1){
        showMsg(`ONDA ${wave}`, 'Eles estão vindo mais rápido.', 900);
        if((wave - 1) % 10 === 0){
          weaponBuff++;
          showMsg('BUFF DE ARMA!', `10 rodadas vencidas: dano +${weaponBuff}`, 1500);
          beep(620, .12, 'square', .025);
        }
      }
    }

    for(const e of enemies){
      e.z -= e.speed*dt;
      e.hitFlash = Math.max(0, e.hitFlash-dt);
      if(e.z <= .08){
        e.dead = true;
        damagePlayer(e.type === 'boss' ? 45 : e.type === 'tank' ? 28 : e.type === 'fast' ? 16 : 20);
      }
    }
    enemies = enemies.filter(e => !e.dead);

    for(const p of particles){
      p.life -= dt;
      p.x += p.vx*dt*60;
      p.y += p.vy*dt*60;
      p.vy += 18*dt*60;
    }
    particles = particles.filter(p => p.life > 0);

    for(const t of tracers) t.life -= dt;
    tracers = tracers.filter(t => t.life > 0);

    shake = Math.max(0, shake - 28*dt);
    screenFlash = Math.max(0, screenFlash - dt);
    updateHUD();
  }

  function drawScene(){
    const g = sctx;
    g.clearRect(0,0,W,H);
    g.fillStyle = '#050608';
    g.fillRect(0,0,W,H);

    if(schoolBackground.complete && schoolBackground.naturalWidth){
      // "cover": preenche o canvas inteiro sem distorcer a imagem.
      const iw = schoolBackground.naturalWidth;
      const ih = schoolBackground.naturalHeight;
      const targetRatio = W / H;
      const imageRatio = iw / ih;

      let sx = 0, sy = 0, sw = iw, sh = ih;
      if(imageRatio > targetRatio){
        sw = ih * targetRatio;
        sx = (iw - sw) / 2;
      }else{
        sh = iw / targetRatio;
        sy = (ih - sh) / 2;
      }

      g.drawImage(schoolBackground, sx, sy, sw, sh, 0, 0, W, H);

      // Escurecimento leve para os inimigos e HUD continuarem destacados.
      g.fillStyle = 'rgba(0,0,0,.10)';
      g.fillRect(0,0,W,H);
    }
  }

  function drawEnemies(){
    const ordered = [...enemies].sort((a,b)=>b.z-a.z);
    ordered.forEach(e=>{
      const p = enemyScreen(e);
      if(e.sprite.complete){
        sctx.save();
        if(e.hitFlash > 0){
          sctx.globalAlpha = .5;
          sctx.fillStyle = '#ff6e78';
          sctx.fillRect(p.x-p.w/2-2, p.y-p.h-2, p.w+4, p.h+4);
          sctx.globalAlpha = 1;
        }
        // shadow
        sctx.fillStyle = 'rgba(0,0,0,.34)';
        sctx.beginPath();
        sctx.ellipse(p.x, p.y+4, p.w*.34, p.h*.08, 0, 0, Math.PI*2);
        sctx.fill();

        drawWalkingAntonio(e.sprite, p, e.lane);
        if(e.type === 'boss') drawGremioShirt(p);

        if(e.maxHp > 1){
          sctx.fillStyle = '#2a3038';
          sctx.fillRect(p.x-p.w/2, p.y-p.h-6, p.w, 3);
          sctx.fillStyle = '#ff5a6a';
          sctx.fillRect(p.x-p.w/2, p.y-p.h-6, p.w*(e.hp/e.maxHp), 3);
        }
        sctx.restore();
      }
    });
  }

  function drawWalkingAntonio(sprite, p, lane){
    // Gera os três keyframes no Canvas, sem arquivos binários extras:
    // tronco, perna esquerda e perna direita são desenhados separadamente.
    const frame = Math.floor(performance.now() / 125 + lane * 7) % 3;
    const step = frame === 0 ? -p.w*.045 : frame === 2 ? p.w*.045 : 0;
    const bob = frame === 1 ? 0 : 1;
    const sw = sprite.naturalWidth;
    const sh = sprite.naturalHeight;
    const dx = Math.round(p.x-p.w/2);
    const dy = Math.round(p.y-p.h+bob);
    const bodyEnd = Math.floor(sh*.59);
    const legStart = Math.floor(sh*.54);
    const leftEnd = Math.floor(sw*.59);
    const rightStart = Math.floor(sw*.41);

    sctx.drawImage(sprite, 0, 0, sw, bodyEnd, dx, dy, p.w, p.h*(bodyEnd/sh));
    sctx.drawImage(sprite, 0, legStart, leftEnd, sh-legStart,
      Math.round(dx-step), Math.round(dy+p.h*(legStart/sh)), p.w*(leftEnd/sw), p.h*((sh-legStart)/sh));
    sctx.drawImage(sprite, rightStart, legStart, sw-rightStart, sh-legStart,
      Math.round(dx-step*-1), Math.round(dy+p.h*(legStart/sh)), p.w*((sw-rightStart)/sw), p.h*((sh-legStart)/sh));
  }

  function drawGremioShirt(p){
    // Uniforme do boss é desenhado por código sobre o sprite base, sem asset novo.
    const x = Math.round(p.x - p.w*.27);
    const y = Math.round(p.y - p.h*.62);
    const w = Math.round(p.w*.54);
    const h = Math.round(p.h*.31);
    sctx.save();
    sctx.fillStyle = '#07121d';
    sctx.fillRect(x-1, y-1, w+2, h+2);
    const stripe = w / 5;
    ['#1687d4', '#f2f5f3', '#111921', '#1687d4', '#f2f5f3'].forEach((color, i) => {
      sctx.fillStyle = color;
      sctx.fillRect(Math.round(x + stripe*i), y, Math.ceil(stripe), h);
    });
    sctx.fillStyle = '#dceef8';
    sctx.fillRect(Math.round(x+w*.37), Math.round(y+h*.43), Math.max(5, Math.round(w*.25)), Math.max(5, Math.round(h*.27)));
    sctx.fillStyle = '#10263d';
    sctx.font = `${Math.max(3, Math.round(p.h*.045))}px monospace`;
    sctx.fillText('G', Math.round(x+w*.45), Math.round(y+h*.65));
    sctx.restore();
  }

  function drawParticles(){
    particles.forEach(p=>{
      sctx.globalAlpha = clamp(p.life/p.max,0,1);
      sctx.fillStyle = p.kind==='spark' ? '#ffb84d' : '#76d7ff';
      sctx.fillRect(Math.round(p.x), Math.round(p.y), Math.round(p.size), Math.round(p.size));
    });
    sctx.globalAlpha = 1;
    tracers.forEach(t=>{
      sctx.globalAlpha = t.life/.07;
      sctx.strokeStyle = '#ffd38e';
      sctx.lineWidth = 1;
      sctx.beginPath();
      sctx.moveTo(t.x1,t.y1);
      sctx.lineTo(t.x2,t.y2);
      sctx.stroke();
    });
    sctx.globalAlpha = 1;
  }

  function drawEffects(){
    // Vignette
    const grad = ctx.createRadialGradient(canvas.width/2, canvas.height/2, canvas.height*.14, canvas.width/2, canvas.height/2, canvas.width*.7);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,.55)');
    ctx.fillStyle = grad;
    ctx.fillRect(0,0,canvas.width,canvas.height);

    if(screenFlash > 0){
      ctx.fillStyle = `rgba(255,80,96,${screenFlash})`;
      ctx.fillRect(0,0,canvas.width,canvas.height);
    }

    // scanlines
    ctx.fillStyle = 'rgba(255,255,255,.03)';
    for(let y=0;y<canvas.height;y+=4) ctx.fillRect(0,y,canvas.width,1);
  }

  function render(){
    sctx.clearRect(0,0,W,H);
    drawScene();
    drawEnemies();
    drawParticles();

    // upscale low-res scene to main canvas
    ctx.save();
    if(shake > 0) ctx.translate(rand(-shake,shake), rand(-shake,shake));
    ctx.clearRect(0,0,canvas.width,canvas.height);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(scene, 0, 0, canvas.width, canvas.height);
    drawEffects();
    ctx.restore();
  }

  function loop(now){
    const dt = Math.min(.033, (now-last)/1000 || 0);
    last = now;
    update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function movePointer(e){
    const r = canvas.getBoundingClientRect();
    mouse.x = (e.clientX-r.left) * canvas.width/r.width;
    mouse.y = (e.clientY-r.top) * canvas.height/r.height;
    crosshair.style.left = `${e.clientX-r.left}px`;
    crosshair.style.top = `${e.clientY-r.top}px`;
  }

  wrap.addEventListener('mousemove', movePointer);
  wrap.addEventListener('mousedown', e => { if(e.button===0) shoot(); });
  document.addEventListener('keydown', e => {
    if(e.key.toLowerCase()==='r') reload();
    if(e.key==='Escape' && (state==='playing' || state==='paused')) pauseToggle();
  });

  document.getElementById('playBtn').onclick = () => { state='setup'; showOnly('setup'); };
  document.getElementById('backBtn').onclick = backToMenu;
  document.getElementById('startBtn').onclick = () => {
    if(!ui.nameInput.value.trim()){ ui.nameInput.focus(); ui.nameInput.style.borderColor = '#ff5a6a'; return; }
    if(!ui.classInput.value.trim()){ ui.classInput.focus(); ui.classInput.style.borderColor = '#ff5a6a'; return; }
    startGame(false);
  };
  document.getElementById('testBtn').onclick = () => startGame(true);
  document.getElementById('resumeBtn').onclick = pauseToggle;
  document.getElementById('quitBtn').onclick = backToMenu;
  document.getElementById('restartBtn').onclick = () => startGame(testMode);
  document.getElementById('homeBtn').onclick = backToMenu;
  document.getElementById('fullscreenBtn').onclick = () => {
    if(!document.fullscreenElement) document.documentElement.requestFullscreen?.();
    else document.exitFullscreen?.();
  };

  const helpDialog = document.getElementById('helpDialog');
  document.getElementById('helpBtn').onclick = () => helpDialog.showModal();
  document.getElementById('closeHelpBtn').onclick = () => helpDialog.close();

  document.getElementById('clearBtn').onclick = () => {
    const v = prompt('Digite LIMPAR para apagar o ranking local:');
    if(v === 'LIMPAR'){
      localStorage.removeItem(STORAGE_KEY);
      renderScores();
    }
  };

  renderScores();
  updateHUD();
  showOnly('menu');
  requestAnimationFrame(loop);
})();
