const electron = require( 'electron' )
const app = electron.app

const BrowserWindow = electron.BrowserWindow

const path = require( 'path' );
const url = require( 'url' );
const fs = require( 'fs' );
const homedir = require('os').homedir();

let mainWindow;
let displayTxtFile = path.join(homedir, 'Desktop', 'display.txt');
let urlTarget;

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');

if (fs.existsSync(displayTxtFile)) {
    urlTarget = fs.readFileSync(displayTxtFile);
}

function isDevelopment() {
  return process.env.NODE_ENV === 'development';
}

function createWindow () {
  const isDev = isDevelopment();

  const options = {
    width: 1080,
    height: 720,
    backgroundColor: '#fff',
    kiosk: !isDev
  }

  mainWindow = new BrowserWindow(options);

  mainWindow.loadURL( url.format( {
    pathname: path.join( __dirname, `index.html` ),
    protocol: 'file:',
    slashes: true
  }));

  if (isDev) {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.urlTarget = urlTarget;

  mainWindow.on( 'closed', function () {
    mainWindow = null
  })
}

app.on( 'ready', createWindow)

app.on( 'window-all-closed', function () {
    app.quit()
} )

app.on( 'activate', function () {
    if ( mainWindow === null ) {
        createWindow()
    }
} )

// app.on( 'browser-window-blur', function() {
//     app.focus();
// } )

electron.ipcMain.on('message', (event, arg) => {
  console.log('Child message:', arg);
});

electron.ipcMain.on('kill', (event, arg) => {
  app.quit();
});
