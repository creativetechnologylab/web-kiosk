const electron = require( 'electron' )
const app = electron.app

const BrowserWindow = electron.BrowserWindow

const path = require( 'path' )
const url = require( 'url' )

let mainWindow

function createWindow () {
    mainWindow = new BrowserWindow( {
        width: 640,
        height: 480,
        backgroundColor: '#fff071',
        kiosk: true
    } )

    mainWindow.loadURL( url.format( {
        pathname: path.join( __dirname, 'index.html' ),
        protocol: 'file:',
        slashes: true
    } ) );

    // mainWindow.webContents.openDevTools()

    mainWindow.on( 'closed', function () {
        mainWindow = null
    } )
}

app.on( 'ready', createWindow )

app.on( 'window-all-closed', function () {
    app.quit()
} )

app.on( 'activate', function () {
    if ( mainWindow === null ) {
        createWindow()
    }
} )

app.on( 'browser-window-blur', function() {
    app.focus();
} )
