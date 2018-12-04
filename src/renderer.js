var electron = require('electron');

// var currentWindow = electron.remote.getCurrentWindow();
var browser = document.getElementById('browser');
// var url = currentWindow.urlTarget;

// if (!url) {
//     document.body.innerHTML = "<div class='error'>No URL in ~/Desktop/display.txt or there is no ~/Desktop/display.txt</div>";
// } else {
//     browser.src = url.toString();
// }

function onKeyUp(e) {
    if (e.keyCode === 13) {
        const inp = document.getElementById('urlbox');
        browser.src = inp.value;

        deleteUrlPopup();
    }
}

function createUrlPopup() {
    const input = document.createElement('INPUT');
    input.setAttribute('id', 'urlbox');
    input.setAttribute('type', 'text');
    input.setAttribute('placeholder', 'Type in URL you want to display');

    const div = document.createElement('DIV');
    div.classList.add('urlPopup');
    div.appendChild(input);

    input.addEventListener('keyup', onKeyUp);

    document.body.appendChild(div);
}

function deleteUrlPopup() {
    const urlPopup = document.querySelector('.urlPopup');
    urlPopup.parentElement.removeChild(urlPopup);
}

createUrlPopup();
