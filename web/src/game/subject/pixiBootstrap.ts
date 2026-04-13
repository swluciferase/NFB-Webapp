import { Application, Container } from 'pixi.js';

export interface PixiHost {
  app: Application;
  stage: Container;
  dispose: () => Promise<void>;
}

export async function createPixiHost(container: HTMLDivElement): Promise<PixiHost> {
  const app = new Application();
  await app.init({
    resizeTo: container,
    background: '#000000',
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  container.appendChild(app.canvas);

  const stage = new Container();
  app.stage.addChild(stage);

  return {
    app,
    stage,
    async dispose() {
      try {
        stage.removeFromParent();
        stage.destroy({ children: true });
      } catch {}
      try {
        app.destroy(true, { children: true, texture: true, textureSource: true });
      } catch {}
    },
  };
}
