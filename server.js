'use strict';

const path = require('path');
const fs = require('fs');
const userHome = require('os').homedir();
const co = require('co');
const {
  createConnection,
  TextDocuments,
  DiagnosticSeverity,
  Files,
  ErrorMessageTracker,
  ResponseError
} = require('vscode-languageserver');

const connection = createConnection(process.stdin, process.stdout);
const documents = new TextDocuments();

let linter;
let workspaceDir;
let editorSettings;
let linterOptions;

/**
 * Format error message
 *
 * @param {Object} err
 * @param {Object} document
 * @returns {String}
 */
function getMessage(err, document) {
  let result = null;
  if (typeof err.message === 'string') {
    result = err.message.replace(/\r?\n/g, ' ');
  } else {
    result = `An unknown error occured while validating file: ${Files.uriToFilePath(document.uri)}`;
  }

  return result;
}

/**
 * Load configuration file
 *
 * @param {String} dir
 * @param {String} name
 * @returns {Promise}
 */
function loadConfigFile(dir, name) {
  return new Promise((resolve, reject) => {
    fs.readFile(path.join(dir, name), (err, data) => {
      if (err) {
        reject(err);
      }

      try {
        resolve(JSON.parse(data.toString()));
      } catch (err) {
        reject('Provided JSON file contains syntax errors. Used standard configuration!');
      }
    });
  });
}

/**
 * Search config in workspace or $HOME directory
 *
 * @param {String} dir
 * @param {Promise}
 */
function searchConfig(dir) {
  return new Promise((resolve) => {
    fs.stat(path.join(dir, '.pug-lint.json'), (err) => {
      if (err) {
        fs.stat(path.join(dir, '.pug-lintrc'), (err) => {
          if (!err) {
            resolve('.pug-lintrc');
          }

          resolve(false);
        });
      } else {
        resolve('.pug-lint.json');
      }
    });
  });
}

/**
 * Setting config based on priorities
 */
function setConfig() {
  return new Promise((resolve) => {
    co(function* () {
      const workspaceConfig = yield searchConfig(workspaceDir);
      if (workspaceConfig) {
        return loadConfigFile(workspaceDir, workspaceConfig);
      }

      const packageConfig = yield loadConfigFile(workspaceDir, 'package.json');
      if (packageConfig && packageConfig.pugLintConfig) {
        return packageConfig.pugLintConfig;
      }

      const globalConfig = yield searchConfig(userHome);
      if (globalConfig) {
        return loadConfigFile(userHome, globalConfig);
      }

      if (!editorSettings || Object.keys(editorSettings).length === 0) {
        return {};
      }

      return editorSettings;
    }).then((config) => {
      linterOptions = config;
      resolve(true);
    }).catch((err) => {
      if (err.code !== 'ENOENT') {
        connection.window.showWarningMessage('puglint: ' + err.toString());
      }

      linterOptions = {};
    });
  });
}

/**
 * Make diagnostic object for problem
 *
 * @param {Object} problem
 * @returns {Object} diagnostic object
 */
function makeDiagnostic(problem) {
  const code = problem.code.replace(/(PUG:|LINT_)/g, '');
  const message = (Array.isArray(problem.msg) ? problem.msg.join(' ') : problem.msg).replace('\n', '');

  return {
    // All pug-lint errors are Errors in our world
    severity: DiagnosticSeverity.Error,
    range: {
      start: {
        line: problem.line - 1,
        character: problem.column
      },
      end: {
        line: problem.line - 1,
        character: problem.column
      }
    },
    source: 'puglint',
    message: `${message} [${code}]`
  };
}

/**
 * Validation
 *
 * @param {Object} document
 */
function validate(document) {
  const content = document.getText();
  const uri = document.uri;

  // ---> Maybe there's another way?
  const extendPath = linterOptions.hasOwnProperty('extends');
  if (extendPath && path.basename(extendPath) === extendPath) {
    linterOptions.extends = `./node_modules/pug-lint-config-${linterOptions.extends}/index.js`;
  }
  // <---

  linter.configure(linterOptions);

  const diagnostics = [];
  const report = linter.checkString(content, Files.uriToFilePath(uri));
  if (report.length > 0) {
    report.forEach((problem) => {
      diagnostics.push(makeDiagnostic(problem));
    });
  }

  connection.sendDiagnostics({ uri, diagnostics });
}

/**
 * Validation of one document
 *
 * @param {Object} document
 */
function validateSingle(document) {
  try {
    validate(document);
  } catch (err) {
    connection.window.showErrorMessage(getMessage(err, document));
  }
}

/**
 * Validation of all documents
 *
 * @param {Array} documents
 */
function validateMany(documents) {
  const tracker = new ErrorMessageTracker();
  documents.forEach((document) => {
    try {
      validate(document);
    } catch (err) {
      tracker.add(getMessage(err, document));
    }
  });

  tracker.sendErrors(connection);
}

// The documents manager listen for text document create, change
// and close on the connection
documents.listen(connection);

// A text document has changed. Validate the document.
documents.onDidChangeContent((event) => {
  if (linterOptions) {
    validateSingle(event.document);
  }
});

connection.onInitialize((params) => {
  workspaceDir = params.rootPath;
  return Files.resolveModule(workspaceDir, 'pug-lint')
    .then((Linter) => {
      linter = new Linter();

      return {
        capabilities: {
          textDocumentSync: documents.syncKind
        }
      };
    })
    .catch(() => {
      const res = {
        code: 99,
        message: 'Failed to load pug-lint library. Please install pug-lint in your workspace folder using \'npm install pug-lint\' or globally using \'npm install -g pug-lint\' and then press Retry.',
        options: {
          retry: true
        }
      };

      return Promise.reject(new ResponseError(res.code, res.message, res.options));
    });
});

connection.onDidChangeConfiguration((params) => {
  editorSettings = params.settings.puglint.config;
  setConfig().then(() => {
    validateMany(documents.all());
  });
});

connection.onDidChangeWatchedFiles(() => {
  setConfig().then(() => {
    validateMany(documents.all());
  });
});

connection.listen();
