'use client';

import React, { useRef, useEffect, useState } from 'react';

// ====== 型定義 ======
interface Vector2 { x: number; y: number; }
interface GameObject { position: Vector2; velocity: Vector2; size: number; color: string; active: boolean; }
interface Player extends GameObject { health: number; }
interface Enemy extends GameObject { type: 'basic'; }
interface Bullet extends GameObject { owner: 'player' | 'enemy'; }
interface Star extends GameObject { brightness: number; }

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
const BULLET_FIRE_RATE = 120;

// ====== ユーティリティ ======
const createVector2 = (x: number, y: number): Vector2 => ({ x, y });
const distance = (a: Vector2, b: Vector2) => Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
const isColliding = (a: GameObject, b: GameObject) => distance(a.position, b.position) < (a.size + b.size) / 2;
const lerp = (start: number, end: number, factor: number) => start + (end - start) * factor;

// ====== ゲームクラス ======
// ゲームの全ロジックと状態をカプセル化
class Game {
  // ゲームの状態
  public score: number = 0;
  public hp: number = 3;
  public gameState: 'playing' | 'gameOver' = 'playing';

  // ゲームオブジェクト
  private player: Player;
  private bullets: Bullet[] = [];
  private enemies: Enemy[] = [];
  private stars: Star[] = [];
  
  // 入力状態
  public input = {
    left: false, right: false, up: false, down: false, shoot: false,
    mousePos: createVector2(GAME_WIDTH / 2, GAME_HEIGHT / 2),
    touching: false,
    targetPos: createVector2(GAME_WIDTH / 2, GAME_HEIGHT - 60)
  };

  private lastFireTime: number = 0;

  constructor() {
    this.player = {
      position: createVector2(GAME_WIDTH / 2, GAME_HEIGHT - 60),
      velocity: createVector2(0, 0),
      size: PLAYER_SIZE,
      color: '#00ff88',
      active: true,
      health: 3
    };
    this.initStars();
  }

  // === 初期化 ===
  private initStars() {
    this.stars = Array.from({ length: STAR_COUNT }, () => ({
      position: createVector2(Math.random() * GAME_WIDTH, Math.random() * GAME_HEIGHT),
      velocity: createVector2(0, Math.random() * 1.5 + 0.3),
      size: Math.random() * 2 + 0.5,
      color: '#fff',
      active: true,
      brightness: Math.random() * 0.8 + 0.2
    }));
  }

  // === ゲーム更新 ===
  public update() {
    if (this.gameState === 'gameOver') return;
    
    const now = Date.now();

    // プレイヤー移動
    let targetVelX = 0;
    let targetVelY = 0;
    if (this.input.left) targetVelX -= PLAYER_SPEED;
    if (this.input.right) targetVelX += PLAYER_SPEED;
    if (this.input.up) targetVelY -= PLAYER_SPEED;
    if (this.input.down) targetVelY += PLAYER_SPEED;

    if (this.input.touching) {
      const dx = this.input.mousePos.x - this.player.position.x;
      const dy = this.input.mousePos.y - this.player.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 8) {
        const factor = Math.min(1, dist / 60);
        targetVelX = dx * 0.15 * factor;
        targetVelY = dy * 0.15 * factor;
        const speed = Math.sqrt(targetVelX * targetVelX + targetVelY * targetVelY);
        if (speed > PLAYER_SPEED) {
          targetVelX = (targetVelX / speed) * PLAYER_SPEED;
          targetVelY = (targetVelY / speed) * PLAYER_SPEED;
        }
      }
    }
    this.player.velocity.x = lerp(this.player.velocity.x, targetVelX, 0.15);
    this.player.velocity.y = lerp(this.player.velocity.y, targetVelY, 0.15);
    this.player.position.x += this.player.velocity.x;
    this.player.position.y += this.player.velocity.y;
    this.player.position.x = clamp(this.player.position.x, this.player.size / 2, GAME_WIDTH - this.player.size / 2);
    this.player.position.y = clamp(this.player.position.y, this.player.size / 2, GAME_HEIGHT - this.player.size / 2);

    // 弾発射
    if (this.input.shoot && now - this.lastFireTime > BULLET_FIRE_RATE) {
      this.bullets.push({
        position: { ...this.player.position },
        velocity: createVector2(0, -BULLET_SPEED),
        size: BULLET_SIZE,
        color: '#ffff00',
        active: true,
        owner: 'player'
      });
      this.lastFireTime = now;
    }

    // オブジェクトの更新・削除
    // ====== 星の再配置ロジックを修正 ======
    this.stars.forEach(star => {
      star.position.y += star.velocity.y;
      if(star.position.y > GAME_HEIGHT + 5){
        star.position.y = -5;
        star.position.x = Math.random() * GAME_WIDTH;
        star.velocity.y = Math.random() * 1.5 + 0.3;
      }
    });
    // ===================================
    
    this.bullets.forEach(b => b.position.y += b.velocity.y);
    this.bullets = this.bullets.filter(b => b.position.y > -20 && b.position.y < GAME_HEIGHT + 20);
    this.enemies.forEach(e => e.position.y += e.velocity.y);
    this.enemies = this.enemies.filter(e => e.position.y < GAME_HEIGHT + e.size + 10);
    
    // 敵生成
    if (Math.random() < ENEMY_SPAWN_RATE) {
      this.enemies.push({
        position: createVector2(Math.random() * (GAME_WIDTH - ENEMY_SIZE), -ENEMY_SIZE),
        velocity: createVector2(0, ENEMY_SPEED),
        size: ENEMY_SIZE,
        color: '#ff4444',
        active: true,
        type: 'basic'
      });
    }

    // 衝突検出
    this.bullets = this.bullets.filter(b => {
      if (b.owner === 'player') {
        let hit = false;
        this.enemies = this.enemies.filter(e => {
          if (isColliding(b, e)) {
            hit = true;
            this.score += 100;
            return false;
          }
          return true;
        });
        return !hit;
      }
      return true;
    });

    this.enemies = this.enemies.filter(e => {
      if (isColliding(this.player, e)) {
        this.hp--;
        if (this.hp <= 0) {
          this.gameState = 'gameOver';
        }
        return false;
      }
      return true;
    });
  }

  // === 描画 ===
  public render(ctx: CanvasRenderingContext2D) {
    ctx.fillStyle = '#000011';
    ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);

    // 星
    this.stars.forEach(star => {
      ctx.fillStyle = `rgba(255,255,255,${star.brightness})`;
      ctx.beginPath();
      ctx.arc(star.position.x, star.position.y, star.size / 2, 0, Math.PI * 2);
      ctx.fill();
    });

    // プレイヤー
    const p = this.player;
    if (p.active) {
      ctx.fillStyle = p.color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(p.position.x, p.position.y - p.size / 2);
      ctx.lineTo(p.position.x - p.size / 3, p.position.y + p.size / 2);
      ctx.lineTo(p.position.x, p.position.y + p.size / 4);
      ctx.lineTo(p.position.x + p.size / 3, p.position.y + p.size / 2);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      if (Math.abs(p.velocity.x) > 0.5 || Math.abs(p.velocity.y) > 0.5) {
        ctx.fillStyle = '#ff6600';
        ctx.beginPath();
        ctx.moveTo(p.position.x - 3, p.position.y + p.size / 2);
        ctx.lineTo(p.position.x, p.position.y + p.size / 2 + 8);
        ctx.lineTo(p.position.x + 3, p.position.y + p.size / 2);
        ctx.fill();
      }
    }

    // 弾
    this.bullets.forEach(b => {
      ctx.fillStyle = b.color;
      ctx.shadowColor = b.color;
      ctx.shadowBlur = 4;
      ctx.beginPath();
      ctx.arc(b.position.x, b.position.y, b.size / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    });

    // 敵
    this.enemies.forEach(e => {
      ctx.fillStyle = e.color;
      ctx.strokeStyle = '#aa0000';
      ctx.lineWidth = 1;
      ctx.fillRect(e.position.x - e.size / 2, e.position.y - e.size / 2, e.size, e.size);
      ctx.strokeRect(e.position.x - e.size / 2, e.position.y - e.size / 2, e.size, e.size);
    });

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

    if (this.gameState === 'gameOver') {
      const gradient = ctx.createRadialGradient(GAME_WIDTH / 2, GAME_HEIGHT / 2, 0, GAME_WIDTH / 2, GAME_HEIGHT / 2, Math.max(GAME_WIDTH, GAME_HEIGHT));
      gradient.addColorStop(0, 'rgba(255,0,0,0.1)');
      gradient.addColorStop(1, 'rgba(0,0,0,0.8)');
      ctx.fillStyle = gradient;
      ctx.fillRect(0, 0, GAME_WIDTH, GAME_HEIGHT);
      ctx.fillStyle = 'white';
      ctx.font = 'bold 28px Arial';
      ctx.textAlign = 'center';
      ctx.strokeStyle = 'black';
      ctx.lineWidth = 2;
      ctx.strokeText('GAME OVER', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20);
      ctx.fillText('GAME OVER', GAME_WIDTH / 2, GAME_HEIGHT / 2 - 20);
      ctx.font = 'bold 18px Arial';
      ctx.fillStyle = '#ffff00';
      ctx.strokeText(`SCORE: ${this.score}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 10);
      ctx.fillText(`SCORE: ${this.score}`, GAME_WIDTH / 2, GAME_HEIGHT / 2 + 10);
      ctx.font = '16px Arial';
      ctx.fillStyle = '#cccccc';
      ctx.fillText('タップでリスタート', GAME_WIDTH / 2, GAME_HEIGHT / 2 + 40);
      ctx.textAlign = 'left';
      ctx.strokeStyle = 'transparent';
      ctx.lineWidth = 1;
    }
  }

  // === ゲームリセット ===
  public reset() {
    this.player = {
      position: createVector2(GAME_WIDTH / 2, GAME_HEIGHT - 60),
      velocity: createVector2(0, 0),
      size: PLAYER_SIZE,
      color: '#00ff88',
      active: true,
      health: 3
    };
    this.bullets = [];
    this.enemies = [];
    this.score = 0;
    this.hp = 3;
    this.gameState = 'playing';
    this.initStars();
  }
}

// ====== メインコンポーネント ======
export default function SpaceShooterGame() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameLoopRef = useRef<number>();
  const gameRef = useRef<Game | null>(null);

  // UIに表示する状態のみを useState で管理
  const [score, setScore] = useState(0);
  const [hp, setHp] = useState(3);
  const [gameState, setGameState] = useState<'playing' | 'gameOver'>('playing');

  // ゲームループ
  const loop = () => {
    const canvas = canvasRef.current;
    if (!canvas) {
      gameLoopRef.current = requestAnimationFrame(loop);
      return;
    }

    const ctx = canvas.getContext('2d');
    if (!ctx || !gameRef.current) {
      gameLoopRef.current = requestAnimationFrame(loop);
      return;
    }

    // ゲームロジックを更新
    gameRef.current.update();

    // UIに表示する状態を同期
    if (score !== gameRef.current.score) setScore(gameRef.current.score);
    if (hp !== gameRef.current.hp) setHp(gameRef.current.hp);
    if (gameState !== gameRef.current.gameState) setGameState(gameRef.current.gameState);

    // 描画
    gameRef.current.render(ctx);

    gameLoopRef.current = requestAnimationFrame(loop);
  };

  // ゲームの初期化とループ開始
  useEffect(() => {
    gameRef.current = new Game();
    gameLoopRef.current = requestAnimationFrame(loop);

    return () => {
      if (gameLoopRef.current) {
        cancelAnimationFrame(gameLoopRef.current);
      }
    };
  }, []);

  // 入力処理 (Gameクラスのinputに直接アクセス)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!gameRef.current) return;
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': gameRef.current.input.left = true; break;
        case 'ArrowRight': case 'KeyD': gameRef.current.input.right = true; break;
        case 'ArrowUp': case 'KeyW': gameRef.current.input.up = true; break;
        case 'ArrowDown': case 'KeyS': gameRef.current.input.down = true; break;
        case 'Space': gameRef.current.input.shoot = true; e.preventDefault(); break;
      }
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (!gameRef.current) return;
      switch (e.code) {
        case 'ArrowLeft': case 'KeyA': gameRef.current.input.left = false; break;
        case 'ArrowRight': case 'KeyD': gameRef.current.input.right = false; break;
        case 'ArrowUp': case 'KeyW': gameRef.current.input.up = false; break;
        case 'ArrowDown': case 'KeyS': gameRef.current.input.down = false; break;
        case 'Space': gameRef.current.input.shoot = false; break;
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, []);

  // ====== マウス・タッチ処理 ======
  const getCanvasCoordinates = (e: React.MouseEvent | React.TouchEvent): Vector2 | null => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return null;

    let clientX, clientY;
    if ('touches' in e) {
      if (e.touches.length === 0) return null;
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }

    const x = ((clientX - rect.left) / rect.width) * GAME_WIDTH;
    const y = ((clientY - rect.top) / rect.height) * GAME_HEIGHT;
    return { x, y };
  };

  const handlePointerStart = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!gameRef.current) return;
    if (gameRef.current.gameState === 'gameOver') {
      resetGame();
      return;
    }
    const pos = getCanvasCoordinates(e);
    if (pos) {
      gameRef.current.input.touching = true;
      gameRef.current.input.mousePos = pos;
      gameRef.current.input.shoot = true;
    }
  };

  const handlePointerEnd = () => {
    if (!gameRef.current) return;
    gameRef.current.input.touching = false;
    gameRef.current.input.shoot = false;
  };

  const handlePointerMove = (e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if (!gameRef.current) return;
    const pos = getCanvasCoordinates(e);
    if (pos) {
      gameRef.current.input.mousePos = pos;
      gameRef.current.input.touching = true;
    }
  };

  const resetGame = () => {
    if (!gameRef.current) return;
    gameRef.current.reset();
    setScore(gameRef.current.score);
    setHp(gameRef.current.hp);
    setGameState(gameRef.current.gameState);
  };

  // ====== JSX ======
  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gray-900 p-4">
      <div className="mb-4 text-center">
        <h1 className="text-3xl font-bold text-white mb-2">🚀 スペースシューター</h1>
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
        style={{
          maxWidth: '100%',
          height: 'auto',
          aspectRatio: `${GAME_WIDTH}/${GAME_HEIGHT}`,
          imageRendering: 'pixelated'
        }}
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
