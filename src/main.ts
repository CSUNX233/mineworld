import { Game } from './core/Game';
import { MobileGestureGuard } from './core/MobileGestureGuard';
import { installMobileShell } from './utils/mobile';
import './style.css';

installMobileShell();
MobileGestureGuard.install();

const game = new Game(document.getElementById('ui-root') as HTMLElement);
game.start();

(window as unknown as { game: Game }).game = game;
