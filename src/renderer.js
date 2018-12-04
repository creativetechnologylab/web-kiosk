var electron = require('electron');

var currentWindow = electron.remote.getCurrentWindow();
var browser = document.getElementById('browser');
var url = currentWindow.urlTarget;

if (!url) {
    document.body.innerHTML = "<div class='error'>No URL in ~/Desktop/display.txt or there is no ~/Desktop/display.txt</div>";
} else {
    browser.src = url.toString();
}
