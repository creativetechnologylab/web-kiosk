const fs = require('fs');
const http = require('http');
const path = require('path');
const isURL = require('is-url');
const isValidPath = require('is-valid-path');
const connect = require('connect');
const serveStatic = require('serve-static');
const fork = require('child_process').fork;


const utils = require('./utils.js');

const CLASSES = {
  WRAPPER: 'url-popup',
  SHOW: 'show'
};

const KEYS = {
  URL: 'url',
  PERSIST: 'persist',
  port: 'port'
};

class pretendParent {
  send(key, message) {
    console.log(key, message);
  }

  on(key, func) {
    console.log('no events');
  }
}

class URLManager {
  constructor(browser, options = {}) {
    this.defaults = {
      mount: document.body,
      parentComms: pretendParent
    };

    this.options = Object.assign({}, this.defaults, options);

    this.browser = browser;

    this.onSubmit = this.onSubmit.bind(this);

    this.base = {
      url: false,
      static: true,
      path: false,
      runtime: 'static'
    };
    this.isMounted = false;

    this.override = 0;

    this.burn = {};
    this.standardPort = 3000;
  }

  init() {
    this.addGlobalListeners();

    if (!this.hasLocalTarget()) {
      this.mountPopup();
    }
  }

  addGlobalListeners() {
    document.addEventListener('keyup', (e) => {
      if (e.keyCode === 192 && e.shiftKey && !this.isMounted) {
        this.iterateOverride();
      }
    }, false);


    window.addEventListener('unload', () => {
      this.cleanup();
    }, false);

    this.options.parentComms.on('kill', () => {
      this.kill();
    });
  }

  iterateOverride() {
    clearTimeout(this.overrideTimer);
    this.overrideTimer = setTimeout(() => {
      this.resetOverrideTimer()
    }, 500);

    this.override++;

    if (this.override > 5) {
      this.mountPopup();
    }
  }

  resetOverrideTimer() {
    clearTimeout(this.overrideTimer);
    this.override = 0;
  }

  hasLocalTarget() {
    return false;
  }

  /**
   * Creates the actual dom that gets appended
   * for the pop up window
   * 
   * @returns Object
   */
  createPopupEl() {
    const wrapper = document.createElement('DIV');
    wrapper.classList.add(CLASSES.WRAPPER);

    const form = document.createElement('FORM');
    const labels = [
      document.createElement('LABEL'),
      document.createElement('LABEL'),
      document.createElement('LABEL'),
      document.createElement('LABEL'),
    ];

    const input = document.createElement('INPUT');
    utils.setAttributes(input, {
      name: KEYS.URL,
      type: 'text',
      placeholder: 'Enter URL or drag file/folder',
      required: true
    });
    labels[0].appendChild(input);

    const portInput = document.createElement('INPUT');
    utils.setAttributes(portInput, {
      name: KEYS.PORT,
      type: 'text',
      placeholder: 'Port (if applicable)'
    });
    labels[1].appendChild(portInput);

    const checkbox = document.createElement('INPUT');
    utils.setAttributes(checkbox, {
      type: 'checkbox',
      checked: true,
      name: KEYS.PERSIST,
      value: 1
    });

    const checkboxSpan = document.createElement('SPAN');
    checkboxSpan.innerText = 'Persist?';

    labels[2].appendChild(checkboxSpan);
    labels[2].appendChild(checkbox);

    const submitBtn = document.createElement('BUTTON');
    utils.setAttributes(submitBtn, {
      type: 'submit'
    });
    submitBtn.innerText = 'Advance';
    labels[3].appendChild(submitBtn);

    labels.forEach(l => form.appendChild(l));
    wrapper.appendChild(form);

    return {
      popupEl: wrapper,
      formEl: form
    };
  }

  mountPopup() {
    this.cleanup();

    this.isMounted = true;

    if (!this.popupEl) {
      const { popupEl, formEl } = this.createPopupEl();
      this.popupEl = popupEl;
      this.formEl = formEl;
    }

    this.options.mount.insertBefore(
      this.popupEl,
      this.options.mount.firstChild
    );


    setTimeout(() => {
      this.options.mount.classList.toggle(CLASSES.SHOW, true);
    }, 50);

    this.addEventListeners();
  }

  unmountPopup() {
    this.isMounted = false;

    this.removeEventListeners();

    this.options.mount.classList.toggle(CLASSES.SHOW, false);

    setTimeout(() => {
      const el = this.options.mount.querySelector(`.${CLASSES.WRAPPER}`);
      el.parentElement.removeChild(el);
    }, 500);
  }

  cleanup() {
    if (this.burn.server) {
      this.burn.server.close();
    }

    if (this.burn.child) {
      this.burn.child.kill();
    }

    this.burn = {};
  }

  addEventListeners() {
    this.formEl.addEventListener('submit', this.onSubmit, false);
  }

  removeEventListeners() {
    this.formEl.removeEventListener('submit', this.onSubmit);
  }

  onSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(this.formEl);
    this.processForm(formData);
  }

  processForm(formData) {
    this.url = formData.get(KEYS.URL);
    this.persist = formData.get(KEYS.PERSIST);
    this.port = formData.get(KEYS.PORT) || this.standardPort;

    if (!this.url) {
      this.displayError(this.createError('No URL given'));
      return false;
    }

    const urlInfo = this.getUrlInfo(this.url.trim());

    if (urlInfo.error) {
      this.displayError(urlInfo);
    } else {
      this.runTarget(urlInfo);
    }
  }

  getUrlInfo(url) {
    if (isURL(url)) {
      return Object.assign({}, this.base, {
        runtime: 'webview',
        path: url
      });
    } else if (isValidPath(url)) {
      return this._parsePath(url);
    } else {
      return this.createError('I dont know what this is');
    }
  }

  _parsePath(filepath) {
    let _filepath = utils.expandTilde(filepath);

    if (fs.existsSync(_filepath)) {
      const stats = fs.lstatSync(_filepath);

      if (stats.isDirectory(_filepath)) {
        return this._parseDirectory(_filepath);
      } else if (stats.isFile(_filepath)) {
        return this._parseFile(_filepath);
      }
    } else {
      console.log('doesnt exist');
    }
  }

  _parseDirectory(filepath) {
    const files = fs.readdirSync(filepath);

    // Add more file finders to auto detect a runner
    const finders = ['index.html', 'index.js'];
    let target = false;

    finders.forEach(f => {
      target = files.find(file => f);
    });

    if (!target) {
      return this.createError('There is no valid file to run');
    }

    return this._parseFile(path.join(filepath, target));
  }

  _parseFile(file) {
    const ext = path.extname(file);

    switch (ext) {
      case '.html':
        return Object.assign({}, this.base, {
          path: file,
          directory: path.dirname(file)
        });
      case '.js':
        return Object.assign({}, this.base, {
          path: file,
          static: false,
          runtime: 'js',
          directory: path.dirname(file)
        });
      default:
        return this.createError('Unsupported file, sorry');
    }
  }

  createError(text) {
    return {
      error: true,
      text
    };
  }

  displayError(error) {
    console.error(error.text);
  }

  runTarget(target) {
    this.unmountPopup();

    switch (target.runtime) {
      case 'webview':
        this.browser.src = target.path;
        return;
      case 'static':
        this.burn.app = connect();
        this.burn.app.use(serveStatic(target.directory))
        this.burn.server = http.createServer(this.burn.app).listen(this.port, 'localhost', () => {
          this.browser.src = `http://localhost:${this.port}`;
        });
      case 'js':
        this.burn.loaded = false;
        this.burn.child = fork(target.path, [], {
          cwd: target.directory,
          silent: true
        });

        this.burn.child.stdout.on('data', data => {
          if (!this.burn.loaded) {
            this.burn.loaded = true;
            this.browser.src = `http://localhost:${this.port}`;
          }

          this.options.parentComms.send('message', data.toString());
        });

        this.burn.child.on('error', err => {
          this.displayError(this.createError('Script error'));
          this.mountPopup();
        });
    }
  }

  kill() {
    this.cleanup();
  }
}

module.exports = URLManager;
