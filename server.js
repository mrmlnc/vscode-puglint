'use strict';

const path = require('path');
const {
  createConnection,
  TextDocuments,
  DiagnosticSeverity,
  Files,
  ErrorMessageTracker,
  ResponseError
} = require('vscode-languageserver');
const resolve = require('./lib/resolve');

const connection = createConnection(process.stdin, process.stdout);
const documents = new TextDocuments();

let configFile;
let editorConfig;
let linter;
let linterOptions;

function getMessage(err, document) {
  let result = null;
  if (typeof err.message === 'string') {
    result = err.message.replace(/\r?\n/g, ' ');
  } else {
    result = `An unknown error occured while validating file: ${Files.uriToFilePath(document.uri)}`;
  }

  return result;
}

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

function validate(document) {
  const content = document.getText();
  const uri = document.uri;
  const url = Files.uriToFilePath(uri);

  if (editorConfig) {
    linterOptions = editorConfig;
  } else {
    linterOptions = configFile.load(null, path.dirname(url));
  }

  if (!linterOptions) {
    linterOptions = {};
  }

  // ---> Maybe there's another way?
  const extendPath = linterOptions.extends;
  if (extendPath && path.basename(extendPath) === extendPath) {
    linterOptions.extends = `./node_modules/pug-lint-config-${linterOptions.extends}/index.js`;
  }
  // <---

  linter.configure(linterOptions);

  const diagnostics = [];
  const report = linter.checkString(content, url);
  if (report.length > 0) {
    report.forEach((problem) => {
      diagnostics.push(makeDiagnostic(problem));
    });
  }

  connection.sendDiagnostics({ uri, diagnostics });
}

function validateSingle(document) {
  try {
    validate(document);
  } catch (err) {
    connection.window.showErrorMessage(getMessage(err, document));
  }
}

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
  if (configFile) {
    validateSingle(event.document);
  }
});

connection.onInitialize((params) => {
  return resolve('pug-lint', params.rootPath, connection)
    .then((filepath) => {
      const configPath = path.join(path.dirname(filepath), 'config-file.js');
      const Linter = require(filepath);

      configFile = require(configPath);
      linter = new Linter();

      return {
        capabilities: {
          textDocumentSync: documents.syncKind
        }
      };
    })
    .catch((err) => {
      if (err.code === 'ENOENT') {
        const res = {
          code: 99,
          message: 'Failed to load pug-lint library. Please install pug-lint in your workspace folder using **npm install pug-lint** or globally using **npm install -g pug-lint** and then press Retry.',
          options: {
            retry: true
          }
        };

        return Promise.reject(new ResponseError(res.code, res.message, res.options));
      }

      connection.console.error(err);
    });
});

connection.onDidChangeConfiguration((params) => {
  editorConfig = params.settings.puglint.config;
  validateMany(documents.all());
});

connection.onDidChangeWatchedFiles(() => {
  validateMany(documents.all());
});

connection.listen();
