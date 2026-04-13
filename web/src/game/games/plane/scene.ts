import { Container, Graphics } from 'pixi.js';
import type { Valley } from './terrain';
import { samplePoint } from './terrain';

export interface PlaneScene {
  root: Container;
  plane: Graphics;
  terrainGfx: Graphics;
  trail: Graphics;
  updateTerrain(scrollX: number, worldWidth: number, worldHeight: number): void;
  updatePlane(y: number): void;
  updateTrail(oo: number): void;
  destroy(): void;
}

export function buildPlaneScene(valley: Valley, bg: string, accent: string): PlaneScene {
  const root = new Container();

  const bgGfx = new Graphics();
  root.addChild(bgGfx);

  const terrainGfx = new Graphics();
  root.addChild(terrainGfx);

  const trail = new Graphics();
  root.addChild(trail);

  const plane = new Graphics();
  plane.roundRect(-18, -8, 36, 16, 4).fill(accent);
  plane.poly([18, 0, 30, -6, 30, 6]).fill(accent);
  root.addChild(plane);

  function updateTerrain(scrollX: number, worldWidth: number, worldHeight: number) {
    bgGfx.clear();
    bgGfx.rect(0, 0, worldWidth, worldHeight).fill(bg);

    terrainGfx.clear();
    terrainGfx.moveTo(0, worldHeight);
    const step = 20;
    for (let x = 0; x <= worldWidth; x += step) {
      const wx = scrollX + x;
      const h = samplePoint(valley, wx);
      terrainGfx.lineTo(x, worldHeight - h * worldHeight * 0.5);
    }
    terrainGfx.lineTo(worldWidth, worldHeight);
    terrainGfx.closePath();
    terrainGfx.fill('#4c3a28');
  }

  function updatePlane(y: number) {
    plane.y = y;
  }

  function updateTrail(oo: number) {
    trail.clear();
    const alpha = 0.25 + 0.6 * (oo / 100);
    trail.rect(plane.x - 40, plane.y - 2, 40, 4).fill({ color: accent, alpha });
  }

  function destroy() {
    root.removeFromParent();
    root.destroy({ children: true });
  }

  return { root, plane, terrainGfx, trail, updateTerrain, updatePlane, updateTrail, destroy };
}
