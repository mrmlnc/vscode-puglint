'use strict';

const path = require('path');
const which = require('which');
const resModule = require('resolve');

function resolveModule(name, workspace) {
  return new Promise((resolve, reject) => {
    which(name, (err, filepath) => {
      resModule(name, { basedir: path.dirname(filepath) || workspace }, (err, res) => {
        if (err) {
          reject(err);
        }

        resolve(res);
      });
    });
  });
}

module.exports = resolveModule;
