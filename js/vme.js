//import { TouchOverlay } from './tnt.js';
if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("service-worker.js?v=r7")
        .then(reg => console.log("SW registered"))
        .catch(err => console.error("SW registration failed:", err));
}
/*
class Vme {
  constructor () {
    
  }
}
class CompositeLog {
  constructor (o) {
    this.stack = [];
  }
}
*/
function elementFromPointIn(container, x, y) {
  const stack = document.elementsFromPoint(x, y);
  return stack.find(el => container.contains(el));
}
class Logger {
  #bip;
  
  constructor () {
    this.#bip = [];
    this.timeStyle = 'border-radius:.5em 0 0 .5em;;color:#444;background:#ddd;font-weight:bold;padding:2px 6px;margin-right:0px;';
    this.nameStyle = 'color:#fff;background:#000;padding:2px 6px;border-radius:0 .5em .5em 0;font-weight:bold;font-family:monospace;';
    this.dataStyle = 'color:#000;background:#fff;padding:2px 6px;border-radius:4px;font-weight:bold;font-family:monospace;';
    this.iblStyle = 'color:#000;background:#faa000;padding:2px 6px;font-weight:bold;font-family:monospace;';
  }
  #ishandling (o) {
    this.#bip.indexOf()
  }
  buildlog (o, data) {
    
  //  if (this.#ishandling(o)) 
  //  if (this.#ishandling(o)) 
  //  if (this.#ishandling(o)) 
    
  }
  ibl (o) {
    var ts = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
      
      var timeStyle = 'border-radius:.5em 0 0 .5em;;color:#444;background:#ddd;font-weight:bold;padding:2px 6px;margin-right:0px;';
    var nameStyle = 'color:#fff;background:#000;padding:2px 6px;border-radius:0 .5em .5em 0;font-weight:bold;font-family:monospace;';
    var dataStyle = 'color:#000;background:#fff;padding:2px 6px;border-radius:4px;font-weight:bold;font-family:monospace;';
    var iblStyle = 'color:#000;background:#faa000;padding:2px 6px;font-weight:bold;font-family:monospace;';
  
    let s = o;
      
      console.log('%c' + ts + '%c+%c' + s , timeStyle, iblStyle, nameStyle);
    
    
  }
  sbl (o) {}
  fbl (o) {}
}
var logger = new Logger();
function newClassLog (s) {
    var ts = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
      
      var timeStyle = 'border-radius:.5em 0 0 .5em;;color:#444;background:#ccc;font-weight:bold;padding:2px 6px;margin-right:0px;margin:0px;box-shadox:2px 2px 0 #222';
    var nameStyle = 'color:#fff;background:#000;padding:2px 6px;border-radius:0 .5em .5em 0;font-weight:bold;font-family:monospace;';
    var dataStyle = 'color:#000;background:#fff;padding:2px 6px;border-radius:4px;font-weight:bold;font-family:monospace;';
    var iblStyle = 'color:#a80;background:#fff;border-left: 3px solid #a80;padding:2px 6px;font-weight:bold;font-family:monospace;';
    var aStyle = 'padding:2px 0px;color:#000;background:#fa0;border-left: 4px solid #000;font-weight:thin;font-family:sans;';
    var bStyle = 'padding:2px 0px;color:#00c;background:#fa0;border-left: 5px solid #000;font-weight:thin;font-family:sans;';
    var cStyle = 'padding:2px 0px;color:#00c;background:#fa0;border-left: 6px solid #000;font-weight:thin;font-family:sans;';
  
      console.log('%c' + ts + ' %c %c %c new %c' + s , timeStyle, aStyle, bStyle,cStyle, iblStyle);
    
    
  }
function tapLog (e, result) {
    var ts = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
      
      var timeStyle = 'border-radius:.5em 0 0 .5em;;color:#444;background:#ccc;font-weight:bold;padding:2px 6px;margin-right:0px;';
    var nameStyle = 'color:#fff;background:#000;padding:2px 6px;border-radius:0 .5em .5em 0;font-weight:bold;font-family:monospace;';
    var dataStyle = 'color:#000;background:#fff;padding:2px 6px;border-radius:4px;font-weight:bold;font-family:monospace;';
    var iblStyle = 'color:#00c;background:#fff;border-left: 3px solid #36c;padding:2px 6px;font-weight:bold;font-family:monospace;';
  
    let s = 'x '+e.x.toFixed(2)+'\ny '+e.y.toFixed(2);
      let ib = (e.intensity.toFixed(1)*10).toFixed(0);
      let sb = '■'; for (let i = 1; i < ib ; i++ ) sb += '■';
      console.log('%c' + ts + '\n %c tap '+(e.intensity.toFixed(2)*100).toFixed(0) +'% \n'+sb+'%c' + s , timeStyle, iblStyle, nameStyle);
    
    
  }
function pressLog (e, result) {
    var ts = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
      
      var timeStyle = 'border-radius:.5em 0 0 .5em;;color:#444;background:#ccc;font-weight:bold;padding:2px 6px;margin-right:0px;';
    var nameStyle = 'color:#fff;background:#000;padding:2px 6px;border-radius:0 .5em .5em 0;font-weight:bold;font-family:monospace;';
    var dataStyle = 'color:#000;background:#fff;padding:2px 6px;border-radius:4px;font-weight:bold;font-family:monospace;';
 var iblStyle = 'color:#b80;background:#fff;border-left: 3px solid #fa0;padding:2px 6px;font-weight:bold;font-family:monospace;';
 
   
    let s = 'x '+e.x.toFixed(2)+'\ny '+e.y.toFixed(2);
      let ib = (e.intensity.toFixed(1)*10).toFixed(0);
      let sb = '■'; for (let i = 1; i < ib ; i++ ) sb += '■';
      console.log('%c' + ts + '\n %cpress '+(e.intensity.toFixed(2)*100).toFixed(0) +'%\n'+sb+'%c' + s , timeStyle, iblStyle, nameStyle);
    
    
  }
function longPressLog (e, result) {
    var ts = new Date().toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 });
      
      var timeStyle = 'border-radius:.5em 0 0 .5em;;color:#444;background:#ccc;font-weight:bold;padding:2px 6px;margin-right:0px;';
    var nameStyle = 'color:#fff;background:#000;padding:2px 6px;border-radius:0 .5em .5em 0;font-weight:bold;font-family:monospace;';
    var dataStyle = 'color:#000;background:#fff;padding:2px 6px;border-radius:4px;font-weight:bold;font-family:monospace;';
    
   var iblStyle = 'color:#b0c;background:#fff;border-left: 3px solid #b0c;padding:2px 6px;font-weight:bold;font-family:monospace;';

  
    let s = 'x '+e.x.toFixed(2)+'\ny '+e.y.toFixed(2);
      
      console.log('%c' + ts + '\n %clongPress\n + '+e.msAfterMin.toFixed(0)+'ms %c' + s , timeStyle, iblStyle, nameStyle);
    
    
  }
window.ibl = newClassLog;
window.sbl = logger.sbl;
window.fbl = logger.fbl;
class Vme {
  #touchOverlay;
  #ux;
  
  constructor () {
    ibl('Vme');
    this.buildGround ();
    this.#ux = new Ux(this.uxLayer);
    this.#touchOverlay = new TouchOverlay(this.tntLayer, {
      dist: 0,
      tappingToPressingFrontier: 600,
      pressingToLongPressingFrontier: 1950,
      contactSize: 24,
      cursorSize: 14,
      rodEnabled: true,
      pulseEnabled: false
    });
  l('touchOverlay\n: ready');
//    this.init ();
  }
  init () {
    l('init');
    this.disableNativeContextMenu();
//  this.#touchOverlay.engine.on('tap', e => {l('tap: '+e.x.toFixed(2)+', '+e.y.toFixed(2))});
    this.#touchOverlay.engine.on('tap', function (e) {
      this.tntEventRouter('tap', e);
      
    }.bind(this));
    this.#touchOverlay.engine.on('press', function (e) {
      this.tntEventRouter('press', e);
      
    }.bind(this));
    this.#touchOverlay.engine.on('longPress', function (e) {
      console.log(e);
      this.tntEventRouter('longPress', e);
      
    }.bind(this));
    this.#touchOverlay.engine.on('pinchStart', function (e) {
      console.log(e);
      this.tntEventRouter('pinchStart', e);
      
    }.bind(this));

    this.#touchOverlay.engine.on('tntBang', e => {
      l('bang');
      window.location.reload(true);
    });
    
    
  }
  get ratio() {
    const { width, height } = this.domGround.getBoundingClientRect();
    return width / height;
  }
  buildGround () {
    l('buildGround');
    this.domGround = mkdiv('', '', 'app-ground');
    document.body.append(this.domGround);
    
    this.fixedFlowLayer = mkdiv('', 'flow-layer', 'fixed-flow-layer');
    
    let flowdirectiion = 'down-flow';
    if (this.ratio > 1)
      flowdirectiion = 'right-flow';
      
    this.uxLayer = mkdiv('', 'ux-layer full-flow '+flowdirectiion, 'vme-ux-layer');
    
      
    
    this.sfxLayer = mkdiv('', 'sfx-layer', 'vme-sfx-layer');
    this.tntLayer = mkdiv('', 'touch-input-layer', 'tnt-layer');
    
    this.domGround.append(this.fixedFlowLayer, this.uxLayer, this.sfxLayer, this.tntLayer);
    
    
    
    
  }
  
  tntEventRouter (e, data) {
    this.#ux.tntEventRouter (e,data);
  }
  disableNativeContextMenu() {
        /* Désactiver le menu contextuel et la sélection de texte dans toute l'app */
        document.addEventListener("contextmenu", (e) => e.preventDefault());
    }
}
window.addEventListener('DOMContentLoaded', () => {
        const vme = new Vme();
        vme.init();
    }, { once: true });
    
    
 //   ■ □ ▪ ▫ ◼ ◻ ◾ ◽⬛ ⬜ ⬚ ⬛
    
    