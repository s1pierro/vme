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
class Vme {
  constructor () {
    
  }
}
*/
class States {
  #states;
  #owner;
  constructor(owner) {
    this.#states = []
    this.#owner = owner;
    
  }
  add(state) { this.#states.push(state); this.#owner.onStatesChange() }
  drop(state) {
      const i = this.#states.indexOf(state);
      if (i > -1) this.#states.splice(i, 1);
      this.#owner.onStatesChange();
  }
  has(state) { return this.#states.includes(state); }
  all() { return this.#states.slice(); }
  // Vide tous les states de ce composant uniquement
  clean() {
    this.#states = [];
    this.#owner.onStatesChange();

  }
  
  // Supprime un state sur ce composant ET tous ses descendants
  recursiveDrop(state) {
    this.drop(state);
    for (const child of this.#owner.components) {
      child.states.recursiveDrop(state);
    }
    this.#owner.onStatesChange();
    
  }
  
  // Garde uniquement ce state, supprime tout le reste
  // sur ce composant ET tous ses descendants
  recursiveKeep(state) {
    this.#states = this.#states.includes(state) ? [state] : [];
    for (const child of this.#owner.components) {
      child.states.recursiveKeep(state);
    }
    this.#owner.onStatesChange();
  }
}
class UxComponent {
  #parentComponent = null;
  constructor(parent = null) {
    this.uid = vmeUID();
    this.states = new States(this);
    this.stateBar = mkdiv(' '+this.states.all().join(' | '), 'surface-state-bar');
    this.components = [];
    this.domElement = mkdiv('', '', this.uid);
    this.#parentComponent = parent;
  
    if (parent) parent.addComponent(this); // 🔥 auto-link
  }
  get typeName() {
    return this.constructor.name;
  }
  get parentComponent() {
    return this.#parentComponent;
  }
  set parentComponent(p) {
    this.#parentComponent = p;
  }
  addComponent (cpnt) {
    this.components.push(cpnt);
    this.domElement.append(cpnt.domElement);
  
    cpnt.parentComponent = this; // 🔥 FIX
  
    return this;
  }
  box() {
    const r = this.domElement.getBoundingClientRect();
    r.ratio = r.width / r.height;
    return r;
  }
  get ratio() {
    const { width, height } = this.domElement.getBoundingClientRect();
    return width / height;
  }
  updateStateBar () {}
  onStatesChange () {this.updateStateBar ()}
}
class ToolBar extends UxComponent {
  
  constructor (parentComponent) {
    
    super (parentComponent);
    this.domElement.classList.add('tool-bar')
  }
  onStatesChange () {
    
    if (this.states.has('focused')) this.domElement.classList.add ('active');
    else this.domElement.classList.remove ('active');
    
  }

}
class Button extends UxComponent {
  
  constructor (parentComponent) {
    
    super (parentComponent);
    this.domElement.classList.add('button');
    this.domElement.innerText = '⬛';
    
  }
  onStatesChange () {
    
    if (this.states.has('focused')) this.domElement.classList.add ('active');
    else this.domElement.classList.remove ('active');
    
  }
}
class Surface extends UxComponent {
  
  constructor (parentComponent, params) {
    
    super (parentComponent);
    this.domElement.classList.add('surface');
    this.showStates = true;
    
    const parentType = parentComponent?.typeName ?? 'none';
    console.log('Surface parent:', parentType); // ex: "Ux"

    // Comportement conditionnel selon le parent
    if (parentType === 'Ux') {
        this.states.add('rootChild');
    }
    if (params) {
      if (params.states) {
    
      
        params.states.forEach( state => {
          this.states.add(state);
          if (state == 'free-flow')
            this.domElement.classList.add('free-flow');
        });
        
      }
    }
    
    this.domElement.append(this.stateBar);
  }
  
  onStatesChange () {
    this.stateBar.innerText = this.states.all().join(' | ');
    if (this.states.has('focused')) this.stateBar.style.background = '#fffa';
    else this.stateBar.style.background = '#fff3';
    this.updateStateBar ();
  }
}

class LogicTheme {
  #ux;
  constructor (ux) {
    this.#ux = ux;
  }
  get ux() {
    return this.#ux;
  }
  set ux(x) {
    this.#ux = x;
  }

  
}
class Lutin extends LogicTheme {
  constructor (ux) {
    ibl('Lutin');
    super (ux);
    this.bringBasicComponents ();
    
  }
  bringBasicComponents () {
    l('bringBasicComponents');
    this.corePanel = new ToolBar(this.ux); // auto addcl to parent
    this.startBtn = new Button(this.corePanel);
    this.tmpBtn = new Button(this.corePanel);
    this.workspace = new Surface(this.ux, {states:['free-flow']});
  }
  tntEventHandler(e, data) {
    window[e + 'Log'](data);
  
    const findDeepestHit = (components) => {
      for (const component of components) {
        const box = component.box();
        const { x, y } = data;
  
        if (x > box.x && x < (box.x + box.width) &&
            y > box.y && y < (box.y + box.height)) {
  
          // Hit trouvé — descendre si des enfants existent
          if (component.components && component.components.length > 0) {
            const deeperHit = findDeepestHit(component.components);
            if (deeperHit) return deeperHit;
          }
  
          return component; // Pas d'enfant, ou aucun enfant touché
        }
      }
      return null;
    };
  
    const target = findDeepestHit(this.ux.components);
    if (target) {
      
      switch (e) {
        case 'tap' :
          
          this.ux.states.recursiveDrop('focused');
          target.states.add('focused');
          l('focus on');
    
          break;
          
        case 'press' :
          
          
          break;
          
        case 'longPress' :
          
          
          break;
          
        default:
          break;
      }
      cl('hit:', target);
    } else {
      l('??? nothing');
    }
  }
}
class Ux extends UxComponent {
  constructor (domDest) {
    super();
    this.domElement = domDest;
    this.logicTheme = null
    ibl('Ux');
 //   this.components = [];
    this.init();
  }
  init () {
    this.logicTheme = new Lutin (this);
    this.states.add('fullFlow');
    this.states.add('topToBottomFlow');
  }
  tntEventRouter(e, data) {
    this.logicTheme.tntEventHandler(e, data);
  }
}