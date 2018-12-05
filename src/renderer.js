'use strict';

const electron = require('electron');
const URLManager = require('./modules/URLManager.js');

const browser = document.getElementById('browser');

const manager = new URLManager(browser, {
  parentComms: electron.ipcRenderer
});
manager.init();