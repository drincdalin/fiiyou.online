import { Component } from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';
import { DialogHost, installDialogs } from './dialog.jsx';
import { bootRouter } from './router.jsx';
import './styles.css';
import './design.css';
import './ui-theme.css';

class Boundary extends Component {
  state = { e: null };
  static getDerivedStateFromError(e) { return { e }; }
  render() { return this.state.e ? (<div className="boot"><h3>Something broke.</h3><pre className="errpre">{String(this.state.e.message || this.state.e)}</pre>
    <button className="primary" onClick={() => location.reload()}>Reload</button></div>) : this.props.children; }
}

bootRouter();       // old /#/... links become real paths
installDialogs();   // any leftover window.alert() shows the in-app card too
createRoot(document.getElementById('root')).render(<Boundary><App /><DialogHost /></Boundary>);
