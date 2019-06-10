const fs = require('fs');
const http = require('http');
const path = require('path');
const isURL = require('is-url');
const isValidPath = require('is-valid-path');
const connect = require('connect');
const serveStatic = require('serve-static');
const fork = require('child_process').fork;
const { dialog } = require('electron').remote;

const utils = require('./utils.js');

const CLASSES = {
  WRAPPER: 'url-popup',
  SHOW: 'show'
};

const KEYS = {
  URL: 'url',
  PERSIST: 'persist',
  port: 'port',
  PERSISTED: 'persisted',
  PERSISTEDPORT: 'persistedport',
};

// This is a fake communicator to mirror
// the ideas of the ipc communication
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
      // Where to mount the popup when created
      mount: document.body,

      // The communicator, usually overriden to be the ipc communication
      parentComms: pretendParent
    };

    this.options = Object.assign({}, this.defaults, options);

    // The webview to project the projects into
    this.browser = browser;

    // Bind the functions for the popup
    this.onSubmit = this.onSubmit.bind(this);
    this.onFileChoose = this.onFileChoose.bind(this);

    // The various parameters involved with 
    // mounting a particular project
    this.base = {
      url: false,
      static: true,
      path: false,
      runtime: 'static'
    };

    // A small helper to track whether popup 
    // is mounted or not
    this.isMounted = false;

    // A variable needed to track override iterations
    // when trying to remount the popup
    this.override = 0;

    // Brute force object, to trigger garbage 
    // collection of projects when switching
    // targets
    this.burn = {};

    // Handling which ports to use when serving
    // local content
    this.standardPort = 3000;
    this.port = localStorage.getItem(KEYS.PERSISTEDPORT) || this.standardPort;
  }

  init() {
    this.addGlobalListeners();

    // Determines whether there is already a
    // mounted target
    const target = this.getLocalTarget();

    if (!target) {
      this.mountPopup();
    } else {
      this.runTarget(target);
    }
  }

  addGlobalListeners() {
    document.addEventListener('keyup', (e) => {
      // 192 is the backtick - `
      if (e.keyCode === 192 && e.shiftKey && !this.isMounted) {
        this.iterateOverride(() => {
          this.mountPopup();
        });
      }

      // 84 is 't'
      if (e.keyCode === 84 && e.shiftKey) {
        this.iterateOverride(() => {
          this.kill();
          this.options.parentComms.send('kill', 'true');
        });
      }
    }, false);

    // Try kill any processes if exiting
    window.addEventListener('unload', () => {
      this.cleanup();
    }, false);

    this.options.parentComms.on('kill', () => {
      this.kill();
    });
  }

  /**
   * Helper method to not trigger popup
   * until certain amount of presses have
   * occured.
   * 
   * Supplied callback is run when the override
   * has been beaten
   * 
   * @param {Function} cb 
   */
  iterateOverride(cb) {
    clearTimeout(this.overrideTimer);
    this.overrideTimer = setTimeout(() => {
      this.resetOverrideTimer()
    }, 500);

    this.override++;

    if (this.override > 5) {
      cb();
    }
  }

  /**
   * Reverses the effects of the override
   * timer, back to default
   */
  resetOverrideTimer() {
    clearTimeout(this.overrideTimer);
    this.override = 0;
  }

  /**
   * Tries to get the stored target from local
   * storage API
   */
  getLocalTarget() {
    let local = localStorage.getItem(KEYS.PERSISTED);

    if (!local) {
      return false;
    }

    return JSON.parse(local);
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
      document.createElement('DIV'),
      document.createElement('LABEL'),
      document.createElement('LABEL'),
      document.createElement('LABEL'),
    ];

    labels[0].classList.add('fake-label');

    const input = document.createElement('INPUT');
    utils.setAttributes(input, {
      name: KEYS.URL,
      type: 'text',
      placeholder: 'Enter URL or drag file/folder',
      required: true,
      id: 'file-choice'
    });
    labels[0].appendChild(input);

    const fileChoose = document.createElement('BUTTON');
    fileChoose.innerText = "Choose file"
    fileChoose.id = 'fileChoose';
    labels[0].appendChild(fileChoose);

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

  /**
   * Mounts the popup, respecting of if
   * it has been already mounted in the past
   */
  mountPopup() {
    this.cleanup();

    this.isMounted = true;

    // Lazily creates the pop up form
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
    if (this.isMounted) {
      this.isMounted = false;

      this.removeEventListeners();

      this.options.mount.classList.toggle(CLASSES.SHOW, false);

      setTimeout(() => {
        const el = this.options.mount.querySelector(`.${CLASSES.WRAPPER}`);
        el.parentElement.removeChild(el);
      }, 500);
    }
  }

  /**
   * Trigger garbage collection for the 
   * current target running.
   * 
   * Also a place to do any more special 
   * 'killing' of processes
   */
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
    this.formEl.querySelector('#fileChoose').addEventListener('click', this.onFileChoose, false);
  }

  removeEventListeners() {
    this.formEl.removeEventListener('submit', this.onSubmit);
    this.formEl.querySelector('#fileChoose').removeEventListener('click', this.onFileChoose);
  }

  onSubmit(e) {
    e.preventDefault();
    
    const formData = new FormData(this.formEl);
    this.processForm(formData);
  }

  onFileChoose() {
    dialog.showOpenDialog({
      filters: [
        { name: 'Files', extensions: ['html','js','json']}
      ],
      properties: ['openFile']
    }, (filePaths) => {
      if (filePaths && filePaths.length > 0) {
        this.formEl.querySelector('#file-choice').value = filePaths[0];
      }
    });
  }

  /**
   * Processes the pop up form data and
   * creates the necessary keys using defaults
   * where necessary
   * 
   * Also persists this information
   * 
   * @param {FormData} formData 
   */
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
      if (this.persist) {
        localStorage.setItem(KEYS.PERSISTED, JSON.stringify(urlInfo));
        localStorage.setItem(KEYS.PERSISTEDPORT, this.port);
      } else {
        localStorage.setItem(KEYS.PERSISTED, false);
        localStorage.setItem(KEYS.PERSISTEDPORT, this.standardPort);
      }

      this.runTarget(urlInfo);
    }
  }

  /**
   * Tries to make sense of the given URL
   * 
   * @param {String} url 
   */
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

  /**
   * Further drills down into what the supplied
   * file path actually is
   * 
   * @param {String} filepath 
   */
  _parsePath(filepath) {
    // Utility to expand terminal like path extensions
    let _filepath = utils.expandTilde(filepath);

    if (fs.existsSync(_filepath)) {
      const stats = fs.lstatSync(_filepath);

      if (stats.isDirectory(_filepath)) {
        return this._parseDirectory(_filepath);
      } else if (stats.isFile(_filepath)) {
        return this._parseFile(_filepath);
      }
    } else {
      return this.createError('Given path doesnt exist');
    }
  }

  /**
   * If its a directory it tries to look
   * for an entry point to use.
   * 
   * This isn't very efficient, but it can be
   * handy
   * 
   * @param {String} filepath 
   */
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

  /**
   * Infers the runtime from the extension
   * 
   * Add extra runtimes at this section
   * 
   * @param {String} file 
   */
  _parseFile(file) {
    const ext = path.extname(file);

    switch (ext) {
      case '.html':
        return Object.assign({}, this.base, {
          path: file,
          directory: path.dirname(file),
          runtime: 'static'
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

  /**
   * Generalised way to create errors
   * 
   * @param {String} text 
   */
  createError(text) {
    return {
      error: true,
      text
    };
  }

  displayError(error) {
    console.error(error.text);
  }

  /**
   * Runs the actual target, setting up
   * any external processes to do so
   * 
   * @param {Object} target 
   */
  runTarget(target) {
    this.unmountPopup();

    switch (target.runtime) {
      // Easy, just throws the path into the webview
      case 'webview':
        this.browser.src = target.path;
        return;

      // Starts a server which just serves static content
      case 'static':
        this.burn.app = connect();
        this.burn.app.use(serveStatic(target.directory))
        this.burn.server = http.createServer(this.burn.app).listen(this.port, 'localhost', () => {
          this.browser.src = `http://localhost:${this.port}`;
        });

      // Starts a node instance
      case 'js':
        this.burn.loaded = false;
        this.burn.child = fork(target.path, [], {
          cwd: target.directory,
          silent: true
        });

        this.burn.child.stdout.on('data', data => {
          // Assumes that it is loaded when it first receives data
          // Maybe not ideal
          if (!this.burn.loaded) {
            this.burn.loaded = true;
            this.browser.src = `http://localhost:${this.port}`;
          }

          // Passes any messages up to the parent
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
