'use client';
import React, { useEffect, useRef, useState } from 'react';

// =====================
// 1ファイル ECS風スペースシューター（TypeScript / React）
// 元機能を保持：移動、射撃、敵出現、衝突、スコア、HP、星背景、マウス/タッチ/キーボード
// =====================

// ====== 定数 ======
const GAME_WIDTH = 320;
const GAME_HEIGHT = 568;
const PLAYER_SIZE = 20;
const PLAYER_SPEED = 4.5;
const BULLET_SIZE = 4;
const BULLET_SPEED = 7;
const ENEMY_SIZE = 16;
const ENEMY_SPEED = 1.5;
const STAR_COUNT = 50;
const ENEMY_SPAWN_RATE = 0.015;
const BULLET_FIRE_RATE = 120; // ms

// ====== 型定義 / ECS基礎 ======
type Component = any;

class Entity {
  id: number;
  components: Map<string, Component>;
  constructor(id: number) {
    this.id = id;
    this.components = new Map();
  }
  add(name: string, comp: Component) {
    this.components.set(name, comp);
    return this;
  }
  remove(name: string) {
    this.components.delete(name);
    return this;
  }
  get<T = any>(name: string): T | undefined {
    return this.components.get(name) as T | undefined;
  }
  has(name: string) {
    return this.components.has(name);
  }
}

// Component 名を列挙しておく（文字列で扱う）
const C_POSITION = 'position';
const C_VELOCITY = 'velocity';
const C_RENDER = 'render';
const C_PLAYER = 'player';
const C_BULLET = 'bullet';
const C_ENEMY = 'enemy';
const C_STAR = 'star';
const C_INPUT = 'input';
const C_LIFETIME = 'lifetime';

// コンポーネント型ヘルパー
type Vec2 = { x: number; y: number; };

// ====== ユーティリティ ======
const createVector2 = (x = 0, y = 0): Vec2 => ({ x, y });
const distance = (a: Vec2, b: Vec2) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const nowMs = () => Date.now();

// ====== Game クラス（Entity 管理 & Systems 呼び出し） ======
class Game {
  // entity 管理
  private nextId = 1;
  entities: Map<number, Entity> = new Map();

  // UI 状態
  score = 0;
  hp = 3;
  gameState: 'playing' | 'gameOver' = 'playing';

  // 入力 & fire 管理
  lastFireTime = 0;

  // canvas サイズ
  width = GAME_WIDTH;
  height = GAME_HEIGHT;

  // 初期化
  constructor() {
    this.reset(true);
  }

  // Entity 作成
  createEntity() {
    const id = this.nextId++;
    const e = new Entity(id);
    this.entities.set(id, e);
    return e;
  }
  destroyEntity(e: Entity) {
    this.entities.delete(e.id);
  }

  // find helpers
  findAllWith(...components: string[]) {
    const out: Entity[] = [];
    for (const e of this.entities.values()) {
      let ok = true;
      for (const c of components) if (!e.has(c)) { ok = false; break; }
      if (ok) out.push(e);
    }
    return out;
  }

  // リセット（初期プレイヤーや星を作る）
  reset(skipScore = false) {
    this.entities.clear();
    this.nextId = 1;
    if (!skipScore) {
      this.score = 0;
      this.hp = 3;
      this.gameState = 'playing';
    } else {
      // 初起動時のscoreは0
      this.score = 0;
      this.hp = 3;
    }
    // Player entity
    const player = this.createEntity();
    player.add(C_POSITION, createVector2(this.width / 2, this.height - 60));
    player.add(C_VELOCITY, createVector2(0, 0));
    player.add(C_RENDER, { color: '#00ff88', size: PLAYER_SIZE });
    player.add(C_PLAYER, { health: 3 });

    // Input "entity" to store pointer / keyboard states (singleton)
    const input = this.createEntity();
    input.add(C_INPUT, {
      left: false,
      right: false,
      up: false,
      down: false,
      shoot: false,
      touching: false,
      mousePos: createVector2(this.width / 2, this.height - 60),
    });

    // Stars
    for (let i = 0; i < STAR_COUNT; i++) {
      const s = this.createEntity();
      s.add(C_STAR, { brightness: Math.random() * 0.8 + 0.2 });
      s.add(C_POSITION, createVector2(Math.random() * this.width, Math.random() * this.height));
      s.add(C_VELOCITY, createVector2(0, Math.random() * 1.5 + 0.3));
      s.add(C_RENDER, { color: '#fff', size: Math.random() * 2 + 0.5 });
    }

    // reset fire timer
    this.lastFireTime = nowMs();
  }

  // === Systems ===

  // InputSystem: updates player velocity and shooting based on input component
  system_InputToPlayer(dt: number) {
    const inputEntity = this.findAllWith(C_INPUT)[0];
    if (!inputEntity) return;
    const inp = inputEntity.get(C_INPUT);

    const players = this.findAllWith(C_PLAYER, C_POSITION, C_VELOCITY);
    players.forEach(p => {
      const pos = p.get<Vec2>(C_POSITION)!;
      const vel = p.get<Vec2>(C_VELOCITY)!;

      // keyboard movement base
      let targetVelX = 0;
      let targetVelY = 0;
      if (inp.left) targetVelX -= PLAYER_SPEED;
      if (inp.right) targetVelX += PLAYER_SPEED;
      if (inp.up) targetVelY -= PLAYER_SPEED;
      if (inp.down) targetVelY += PLAYER_SPEED;

      // pointer/touch chasing
      if (inp.touching) {
        const dx = inp.mousePos.x - pos.x;
        const dy = inp.mousePos.y - pos.y;
        const dist = Math.hypot(dx, dy);
        if (dist > 8) {
          const factor = Math.min(1, dist / 60);
          targetVelX = dx * 0.15 * factor;
          targetVelY = dy * 0.15 * factor;
          const speed = Math.hypot(targetVelX, targetVelY);
          if (speed > PLAYER_SPEED) {
            targetVelX = (targetVelX / speed) * PLAYER_SPEED;
            targetVelY = (targetVelY / speed) * PLAYER_SPEED;
          }
        }
      }

      vel.x = lerp(vel.x, targetVelX, 0.15);
      vel.y = lerp(vel.y, targetVelY, 0.15);

      // clamp player position later in MovementSystem
    });
  }

  // MovementSystem: moves entities by velocity; handles star wrapping; lifetime countdown
  system_Movement(dt: number) {
    for (const e of Array.from(this.entities.values())) {
      const pos = e.get<Vec2>(C_POSITION);
      const vel = e.get<Vec2>(C_VELOCITY);
      if (pos && vel) {
        pos.x += vel.x;
        pos.y += vel.y;
      }
      // star wrap
      if (e.has(C_STAR) && pos && vel) {
        if (pos.y > this.height + 5) {
          pos.y = -5;
          pos.x = Math.random() * this.width;
          vel.y = Math.random() * 1.5 + 0.3;
        }
      }
      // lifetime
      if (e.has(C_LIFETIME)) {
        const lt = e.get<{ t: number }>(C_LIFETIME)!;
        lt.t -= dt;
        if (lt.t <= 0) this.destroyEntity(e);
      }
    }

    // clamp player within screen
    const players = this.findAllWith(C_PLAYER, C_POSITION, C_RENDER);
    players.forEach(p => {
      const pos = p.get<Vec2>(C_POSITION)!;
      const r = p.get<{ size: number }>(C_RENDER)!;
      const half = (r.size ?? PLAYER_SIZE) / 2;
      pos.x = clamp(pos.x, half, this.width - half);
      pos.y = clamp(pos.y, half, this.height - half);
    });
  }

  // ShootingSystem: player shooting => spawn bullets (respects BULLET_FIRE_RATE)
  system_Shooting() {
    const inputEntity = this.findAllWith(C_INPUT)[0];
    if (!inputEntity) return;
    const inp = inputEntity.get(C_INPUT);
    const players = this.findAllWith(C_PLAYER, C_POSITION);
    if (!players.length) return;

    const now = nowMs();
    const player = players[0];
    if (inp.shoot && now - this.lastFireTime > BULLET_FIRE_RATE) {
      const ppos = player.get<Vec2>(C_POSITION)!;
      const b = this.createEntity();
      b.add(C_POSITION, createVector2(ppos.x, ppos.y));
      b.add(C_VELOCITY, createVector2(0, -BULLET_SPEED));
      b.add(C_RENDER, { color: '#ffff00', size: BULLET_SIZE });
      b.add(C_BULLET, { owner: 'player', damage: 1 });
      // small lifetime to cleanup if off-screen
      b.add(C_LIFETIME, { t: 3000 }); // 3s safety (also cleaned by bounds)
      this.lastFireTime = now;
    }
  }

  // EnemySpawnSystem: random spawn enemies
  system_EnemySpawn() {
    if (Math.random() < ENEMY_SPAWN_RATE) {
      const e = this.createEntity();
      e.add(C_POSITION, createVector2(Math.random() * (this.width - ENEMY_SIZE) + ENEMY_SIZE / 2, -ENEMY_SIZE));
      e.add(C_VELOCITY, createVector2(0, ENEMY_SPEED));
      e.add(C_RENDER, { color: '#ff4444', size: ENEMY_SIZE });
      e.add(C_ENEMY, { type: 'basic' });
      // optional lifetime or HP could be added later
    }
  }

  // CleanupSystem: remove bullets/enemies out of bounds
  system_Cleanup() {
    for (const e of Array.from(this.entities.values())) {
      if (e.has(C_BULLET) || e.has(C_ENEMY)) {
        const pos = e.get<Vec2>(C_POSITION);
        const r = e.get<{ size: number }>(C_RENDER);
        if (!pos) continue;
        const margin = (r?.size ?? 16) + 20;
        if (pos.y < -margin || pos.y > this.height + margin || pos.x < -margin || pos.x > this.width + margin) {
          this.destroyEntity(e);
        }
      }
    }
  }

  // CollisionSystem: bullet vs enemy, enemy vs player -> update score/hp and spawn particles stub (not full particle engine but structure)
  system_Collision() {
    const bullets = this.findAllWith(C_BULLET, C_POSITION, C_RENDER);
    const enemies = this.findAllWith(C_ENEMY, C_POSITION, C_RENDER);
    const players = this.findAllWith(C_PLAYER, C_POSITION, C_RENDER);

    // Player collisions with enemies
    for (const enemy of enemies) {
      const epos = enemy.get<Vec2>(C_POSITION)!;
      const ers = enemy.get<{ size: number }>(C_RENDER)!;
      for (const player of players) {
        const ppos = player.get<Vec2>(C_POSITION)!;
        const prs = player.get<{ size: number }>(C_RENDER)!;
        if (distance(epos, ppos) < (ers.size + prs.size) / 2) {
          // collision
          this.destroyEntity(enemy);
          this.hp -= 1;
          if (this.hp <= 0) {
            this.gameState = 'gameOver';
            this.hp = 0;
          }
        }
      }
    }

    // Bullet vs Enemy
    for (const bullet of bullets) {
      const bpos = bullet.get<Vec2>(C_POSITION)!;
      const brs = bullet.get<{ size: number }>(C_RENDER)!;
      for (const enemy of enemies) {
        const epos = enemy.get<Vec2>(C_POSITION)!;
        const ers = enemy.get<{ size: number }>(C_RENDER)!;
        if (distance(bpos, epos) < (brs.size + ers.size) / 2) {
          // hit
          this.score += 100;
          // destroy both
          this.destroyEntity(enemy);
          this.destroyEntity(bullet);
          break;
        }
      }
    }
  }

  // RenderSystem: draw everything to canvas context
  system_Render(ctx: CanvasRenderingContext2D) {
    // clear
    ctx.fillStyle = '#000011';
    ctx.fillRect(0, 0, this.width, this.height);

    // stars
    const stars = this.findAllWith(C_STAR, C_POSITION, C_RENDER);
    for (const s of stars) {
      const pos = s.get<Vec2>(C_POSITION)!;
      const r = s.get<{ size: number }>(C_RENDER)!;
      const star = s.get<{ brightness: number }>(C_STAR)!;
      ctx.fillStyle = `rgba(255,255,255,${star.brightness})`;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, (r.size ?? 1) / 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // player
    const players = this.findAllWith(C_PLAYER, C_POSITION, C_RENDER, C_VELOCITY);
    for (const p of players) {
      const pos = p.get<Vec2>(C_POSITION)!;
      const r = p.get<{ color: string; size: number }>(C_RENDER)!;
      const vel = p.get<Vec2>(C_VELOCITY)!;
      // ship shape
      ctx.fillStyle = r.color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y - r.size / 2);
      ctx.lineTo(pos.x - r.size / 3, pos.y + r.size / 2);
      ctx.lineTo(pos.x, pos.y + r.size / 4);
      ctx.lineTo(pos.x + r.size / 3, pos.y + r.size / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      if (Math.abs(vel.x) > 0.5 || Math.abs(vel.y) > 0.5) {
        ctx.fillStyle = '#ff6600';
        ctx.beginPath();
        ctx.moveTo(pos.x - 3, pos.y + r.size / 2);
        ctx.lineTo(pos.x, pos.y + r.size / 2 + 8);
        ctx.lineTo(pos.x + 3, pos.y + r.size / 2);
        ctx.fill();
      }
    }

    // bullets
    const bullets = this.findAllWith(C_BULLET, C_POSITION, C_RENDER);
    for (const b of bullets) {
      const pos = b.get<Vec2>(C_POSITION)!;
      const r = b.get<{ color: string; size: number }>(C_RENDER)!;
      ctx.fillStyle = r.color;
      ctx.shadowColor = r.color;
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, (r.size ?? 4) / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // enemies
    const enemies = this.findAllWith(C_ENEMY, C_POSITION, C_RENDER);
    for (const e of enemies) {
      const pos = e.get<Vec2>(C_POSITION)!;
      const r = e.get<{ color: string; size: number }>(C_RENDER)!;
      ctx.fillStyle = r.color;
      ctx.strokeStyle = '#aa0000';
      ctx.lineWidth = 1;
      ctx.fillRect(pos.x - r.size / 2, pos.y - r.size / 2, r.size, r.size);
      ctx.strokeRect(pos.x - r.size / 2, pos.y - r.size / 2, r.size, r.size);
    }

    // UI
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.font = 'bold 16px Arial';
    ctx.fillText(`スコア: ${this.score}`, 10, 25);
    ctx.fillStyle = '#ff0066';
    for (let i = 0; i < this.hp; i++) {
      ctx.fillText('♥', 10 + i * 20, 45);
    }
    ctx.fillStyle = 'rgba(255,255,255,0.3)';
    for (let i = this.hp; i < 3; i++) {
      ctx.fillText('♡', 10 + i * 20, 45);
    }

    // game over overlay
    if (this.gameState === 'gameOver') {
      const gradient = ctx.createRadialGradient(this.width / 2, this.height / 2, 0, this.width / 2, this.height / 2, Math.max(this.width, this.height));
      gradient.addColorStop(0, 'rgba(255,0,0,0.1)');
      gradient.addColorStop(1, 'rgba(0,0,0,0.8)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, this.width, this.height);
      ctx.fillStyle = 'white';
      ctx.font = 'bold 28px Arial';
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 2;
      ctx.strokeText('GAME OVER', this.width / 2, this.height / 2 - 20);
      ctx.fillText('GAME OVER', this.width / 2, this.height / 2 - 20);
      ctx.font = 'bold 18px Arial';
      ctx.fillStyle = '#ffff00';
      ctx.strokeText(`SCORE: ${this.score}`, this.width / 2, this.height / 2 + 10);
      ctx.fillText(`SCORE: ${this.score}`, this.width / 2, this.height / 2 + 10);
      ctx.font = '16px Arial';
      ctx.fillStyle = '#cccccc';
      ctx.fillText('タップでリスタート', this.width / 2, this.height / 2 + 40);
      ctx.textAlign = 'left';
      ctx.strokeStyle = 'transparent';
      ctx.lineWidth = 1;
    }
  }

  // === 毎フレーム update 呼び出し箇所 ===
  updateAndRender(ctx: CanvasRenderingContext2D, dtMs: number) {
    if (this.gameState === 'gameOver') {
      // still render overlay; but we don't spawn new enemies or allow hp changes until restart
      this.system_Movement(dtMs);
      this.system_Render(ctx);
      return;
    }

    // order matters: input -> shooting -> spawn -> movement -> collision -> cleanup -> render
    this.system_InputToPlayer(dtMs);
    this.system_Shooting();
    this.system_EnemySpawn();
    this.system_Movement(dtMs);
    this.system_Collision();
    this.system_Cleanup();
    this.system_Render(ctx);
  }

  // 操作ハンドラ呼び出し用
  setInput(updates: Partial<any>) {
    const inputEntity = this.findAllWith(C_INPUT)[0];
    if (!inputEntity) return;
    const inp = inputEntity.get(C_INPUT);
    Object.assign(inp, updates);
  }
}

// ====== React Component (Canvas & input handling) ======
export default function SpaceShooterECS() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const rafRef = useRef<number | null>(null);

  const [score, setScore] = useState(0);
  const [hp, setHp] = useState(3);
  const [gameState, setGameState] = useState<'playing' | 'gameOver'>('playing');

  // initialize game
  useEffect(() => {
    const g = new Game();
    gameRef.current = g;
    setScore(g.score);
    setHp(g.hp);
    setGameState(g.gameState);

    let last = nowMs();
    const loop = () => {
      const cur = nowMs();
      const dt = cur - last;
      last = cur;
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');
      if (ctx && g) {
        g.updateAndRender(ctx, dt);
        // sync UI states if changed
        if (score !== g.score) setScore(g.score);
        if (hp !== g.hp) setHp(g.hp);
        if (gameState !== g.gameState) setGameState(g.gameState);
      }
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // mount 一度きり

  // reset helper
  const resetGame = () => {
    if (!gameRef.current) return;
    gameRef.current.reset(false);
    setScore(gameRef.current.score);
    setHp(gameRef.current.hp);
    setGameState(gameRef.current.gameState);
  };

  // ===== Input handlers (keyboard) =====
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (!gameRef.current) return;
      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          gameRef.current.setInput({ left: true });
          break;
        case 'ArrowRight':
        case 'KeyD':
          gameRef.current.setInput({ right: true });
          break;
        case 'ArrowUp':
        case 'KeyW':
          gameRef.current.setInput({ up: true });
          break;
        case 'ArrowDown':
        case 'KeyS':
          gameRef.current.setInput({ down: true });
          break;
        case 'Space':
          gameRef.current.setInput({ shoot: true });
          e.preventDefault();
          break;
      }
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (!gameRef.current) return;
      switch (e.code) {
        case 'ArrowLeft':
        case 'KeyA':
          gameRef.current.setInput({ left: false });
          break;
        case 'ArrowRight':
        case 'KeyD':
          gameRef.current.setInput({ right: false });
          break;
        case 'ArrowUp':
        case 'KeyW':
          gameRef.current.setInput({ up: false });
          break;
        case 'ArrowDown':
        case 'KeyS':
          gameRef.current.setInput({ down: false });
          break;
        case 'Space':
          gameRef.current.setInput({ shoot: false });
          break;
      }
    };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  // ===== Pointer / Touch handling =====
  const getCanvasCoordinates = (clientX: number, clientY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;
    const x = ((clientX - rect.left) / rect.width) * GAME_WIDTH;
    const y = ((clientY - rect.top) / rect.height) * GAME_HEIGHT;
    return createVector2(x, y);
  };

  const handlePointerStart = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!gameRef.current) return;
    if (gameRef.current.gameState === 'gameOver') {
      // restart
      resetGame();
      return;
    }
    let pos = null;
    if ('touches' in e) {
      if (e.touches.length === 0) return;
      pos = getCanvasCoordinates(e.touches[0].clientX, e.touches[0].clientY);
    } else {
      pos = getCanvasCoordinates(e.clientX, e.clientY);
    }
    if (pos) {
      gameRef.current.setInput({ touching: true, mousePos: pos, shoot: true });
    }
  };
  const handlePointerMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!gameRef.current) return;
    let pos = null;
    if ('touches' in e) {
      if (e.touches.length === 0) return;
      pos = getCanvasCoordinates(e.touches[0].clientX, e.touches[0].clientY);
    } else {
      pos = getCanvasCoordinates(e.clientX, e.clientY);
    }
    if (pos) {
      gameRef.current.setInput({ mousePos: pos, touching: true });
    }
  };
  const handlePointerEnd = () => {
    if (!gameRef.current) return;
    gameRef.current.setInput({ touching: false, shoot: false });
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 p-4">
      <div className="mb-4 text-center">
        <h1 className="text-3xl font-bold text-white mb-2">🚀 スペースシューター (ECS雛形)</h1>
        <div className="text-sm text-gray-300">
          <p>WASD/矢印キー: 移動 | スペース/クリック: 射撃</p>
          <p>マウス: ポインター追跡 | タッチ: 移動・射撃</p>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        width={GAME_WIDTH}
        height={GAME_HEIGHT}
        onMouseDown={handlePointerStart}
        onMouseUp={handlePointerEnd}
        onMouseMove={handlePointerMove}
        onMouseLeave={handlePointerEnd}
        onTouchStart={handlePointerStart}
        onTouchMove={handlePointerMove}
        onTouchEnd={handlePointerEnd}
        tabIndex={0}
        className="border-2 border-cyan-400 rounded-lg shadow-2xl cursor-crosshair touch-none focus:border-yellow-400 focus:outline-none bg-black"
        style={{ maxWidth: '100%', height: 'auto', aspectRatio: `${GAME_WIDTH}/${GAME_HEIGHT}`, imageRendering: 'pixelated' }}
      />

      <div className="mt-4 text-center">
        <button
          onClick={resetGame}
          className="px-6 py-3 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-bold rounded-lg transition-all transform hover:scale-105 shadow-lg"
        >
          🔄 ゲームリセット
        </button>
      </div>
    </div>
  );
}