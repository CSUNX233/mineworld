import { Game } from './core/Game';
import './style.css';

const game = new Game(document.getElementById('ui-root') as HTMLElement);
game.start();

(window as unknown as { game: Game }).game = game;
