const homedir = require('os').homedir;

function setAttributes(el, attrs) {
  for (var key in attrs) {
    el.setAttribute(key, attrs[key]);
  }
}

function expandTilde(path) {
  return path[0] === '~' ? `${homedir}${path.substring(1, path.length)}` : path;
}

module.exports = {
  setAttributes,
  expandTilde
};