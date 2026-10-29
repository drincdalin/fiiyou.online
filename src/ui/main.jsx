import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { DialogHost, installDialogs } from './dialog.jsx';
import { bootRouter } from './router.jsx';
import { Boundary, OfflineBanner } from './errors.jsx';
import { captureInvite } from '../lib/invite.js';
import './styles.css';
import './design.css';
import './ui-theme.css';

bootRouter();       // old /#/... links become real paths
captureInvite({ base: import.meta.env.BASE_URL.replace(/\/$/, '') });   // /invite/<username>: remember who invited you, then show the normal page
installDialogs();   // any leftover window.alert() shows the in-app card too
createRoot(document.getElementById('root')).render(<Boundary><App /><DialogHost /><OfflineBanner /></Boundary>);
