import { Game } from './core/Game';
import { MobileGestureGuard } from './core/MobileGestureGuard';
import { installMobileShell } from './utils/mobile';
import './style.css';
import './ui/sunlit.css';
import './ui/sunlit-inventory.css';
import './ui/sunlit-menus.css';
import './ui/mobile-layout.css';
import './ui/interface-kit.css';
import './ui/scroll-kit.css';
import { installScrollGuidance } from './ui/ScrollGuidance';
import { installInterfaceKit } from './ui/InterfaceKit';

installMobileShell();
installInterfaceKit(document.getElementById('ui-root') as HTMLElement);
installScrollGuidance(document.getElementById('ui-root') as HTMLElement);
MobileGestureGuard.install();

const game = new Game(document.getElementById('ui-root') as HTMLElement);
game.start();
requestAnimationFrame(() => document.getElementById('boot-loading')?.remove());

(window as unknown as { game: Game }).game = game;
