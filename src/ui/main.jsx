import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { DialogHost, installDialogs } from './dialog.jsx';
import { MusicPlayerProvider } from './musicPlayer.jsx';
import MusicDock from './MusicDock.jsx';
import { bootRouter } from './router.jsx';
import { Boundary, OfflineBanner } from './errors.jsx';
import { captureInvite } from '../lib/invite.js';
import { captureInstall } from './install.js';
import { watchKeyboard } from './viewport.js';
import './styles.css';
import './design.css';
import './ui-theme.css';
import './social-ui.css';   // hashtags, comment layout, chat message menu
import './polish.css';      // release polish
import './musicPlayer.css'; // global music player: mini dock, Now Playing sheet, queue (loads last: only .mp-* plus a few .player.mpcard lines)
import './nav.css';         // navigation redesign: floating island on phones, roomy top bar on desktop (every rule is .nav-scoped, so it wins without touching the old nav rules)
import './map.css';         // map screen layout: search row + one-line chips on phones, controls that never overlap (loads after nav.css)

bootRouter();       // old /#/... links become real paths
captureInvite({ base: import.meta.env.BASE_URL.replace(/\/$/, '') });   // /invite/<username>: remember who invited you, then show the normal page
watchKeyboard();     // phones: tab bar steps aside while the keyboard is open
captureInstall();   // keep the browser's "install app" offer for the Settings button (it only fires once, early)
installDialogs();   // any leftover window.alert() shows the in-app card too
createRoot(document.getElementById('root')).render(
  <Boundary>
    <MusicPlayerProvider>   {/* the sound lives up here, so a song keeps playing across every page */}
      <App />
      <MusicDock />
    </MusicPlayerProvider>
    <DialogHost /><OfflineBanner />
  </Boundary>,
);
