'use strict';

const path = require('path');
const fs = require('fs');
const userHome = require('os').homedir();
const Linter = require('pug-lint');

const co = require('co');
const langServer = require('vscode-languageserver');

const connection = langServer.createConnection(process.stdin, process.stdout);
const documents = new langServer.TextDocuments();

let workspaceDir;
let editorSettings;
let userConfig;

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
 *
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
        return { preset: 'clock' };
      }

      return editorSettings;
    }).then((config) => {
      userConfig = config;
      resolve(true);
    }).catch((err) => {
      connection.window.showWarningMessage('puglint: ' + err.toString());
      userConfig = { preset: 'clock' };
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
  const errorCode = problem.code.replace(/(PUG:|LINT_)/g, '');
  const errorMsg = (Array.isArray(problem.msg) ? problem.msg.join(' ') : problem.msg).replace('\n', '');

  return {
    severity: langServer.DiagnosticSeverity.Error,
    range: {
      start: { line: problem.line - 1, character: problem.column },
      end: { line: problem.line - 1, character: problem.column }
    },
    message: `puglint: ${errorMsg} [${errorCode}]`
  };
}

/**
 * Validation of one document
 *
 * @param {Object} document
 */
function validate(document) {
  const uri = document.uri;
  const diagnostics = [];
  const linter = new Linter();

  try {
    linter.configure(userConfig);

    const report = linter.checkString(document.getText(), langServer.Files.uriToFilePath(uri));
    report.forEach((problem) => diagnostics.push(makeDiagnostic(problem)));

    connection.sendDiagnostics({ uri, diagnostics });
  } catch (err) {
    connection.window.showErrorMessage('puglint: ' + err.toString());
  }
}

/**
 * Validation of all documents
 *
 */
function validateAll() {
  return Promise.all(documents.all().map((document) => validate(document)));
}

/**
 * Initialization
 *
 */
connection.onInitialize((params) => {
  if (params.rootPath) {
    workspaceDir = params.rootPath;
  }

  return {
    capabilities: {
      textDocumentSync: documents.syncKind
    }
  };
});

/**
 * An event handler for changes Editor settings
 *
 */
connection.onDidChangeConfiguration((params) => {
  editorSettings = params.settings.puglint.config;
  setConfig().then(() => {
    validateAll();
  });
});

/**
 * An event handler for the changing configuration files
 *
 */
connection.onDidChangeWatchedFiles(() => {
  setConfig().then(() => {
    validateAll();
  });
});

documents.onDidChangeContent((event) => validate(event.document));
documents.listen(connection);

connection.listen();
