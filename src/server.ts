'use strict';

import * as path from 'path';
import * as fs from 'fs';

import {
	IConnection,
	TextDocuments,
	createConnection,
	IPCMessageReader,
	IPCMessageWriter,
	DiagnosticSeverity,
	Files,
	ErrorMessageTracker,
	InitializeError,
	ResponseError
} from 'vscode-languageserver';

import * as resolver from 'npm-module-path';

const connection: IConnection = createConnection(new IPCMessageReader(process), new IPCMessageWriter(process));
const allDocuments: TextDocuments = new TextDocuments();

// "Global" variables
let configWatcherStatus = true;
let editorSettings;
let configResolver;
let linter;
let linterSettings;

const puglintNotFound = [
	'Failed to load pug-lint library. ',
	'Please install pug-lint in your workspace folder using **npm i pug-lint** ',
	'or globally using **npm i -g pug-lint** and then press Retry.'
].join('');

function readdir(filepath: string): Promise<string[]> {
	return new Promise((resolve, reject) => {
		fs.readdir(filepath, (err, files) => {
			if (err) {
				reject(err);
			}

			resolve(files);
		});
	});
}

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

	if (Object.keys(editorSettings.config).length === 0) {
		// Update settings from a configuration file only if their updates
		if (configWatcherStatus) {
			linterSettings = configResolver.load(null, path.dirname(url));
			configWatcherStatus = false;
		}
	} else {
		linterSettings = editorSettings.config;
	}

	if (!linterSettings) {
		linterSettings = {};
	}

	// ---> Maybe there's another way?
	const extendPath = linterSettings.extends;
	if (extendPath && path.basename(extendPath) === extendPath) {
		linterSettings.extends = `./node_modules/pug-lint-config-${linterSettings.extends}/index.js`;
	}
	// <---

	linter.configure(linterSettings);

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
allDocuments.listen(connection);

// A text document has changed. Validate the document.
allDocuments.onDidChangeContent((event) => {
	if (configResolver && editorSettings.run === 'onType') {
		validateSingle(event.document);
	}
});

allDocuments.onDidSave((event) => {
	if (configResolver && editorSettings.run === 'onSave') {
		validateSingle(event.document);
	}
});

connection.onInitialize((params) => {
	return resolver.resolveOne('pug-lint', params.rootPath).then((moduleDir) => {
		if (moduleDir === undefined) {
			throw {
				message: 'Module not found.',
				code: 'ENOENT'
			};
		}

		const linterPath = path.join(moduleDir, 'lib', 'linter.js');
		const configPath = path.join(moduleDir, 'lib', 'config-file.js');

		const Linter = require(linterPath);

		linter = new Linter();
		configResolver = require(configPath);

		return {
			capabilities: {
				textDocumentSync: allDocuments.syncKind
			}
		};
	}).catch((err) => {
		// If the error is not caused by a lack of module
		if (err.code !== 'ENOENT') {
			connection.console.error(err.toString());
			return;
		}

		// We only want to show the pug-lint load failed error, when the workspace is configured for pug-lint.
		return readdir(params.rootPath).then((files) => {
			const configFiles: string[] = files.filter((file) => /\.(jade|pug)-lint(rc|rc\.js|rc\.json|\.json)$/.test(file));

			let packageFile;
			try {
				packageFile = require(`${params.rootPath}/package.json`);
			} catch (err) {
				// Skip error
			}

			if (configFiles.length !== 0 || (packageFile && packageFile.hasOwnProperty('pugLintConfig'))) {
				return Promise.reject(new ResponseError<InitializeError>(99, puglintNotFound, { retry: true }));
			}
		});
	});
});

connection.onDidChangeConfiguration((params) => {
	editorSettings = params.settings.puglint;
	if (!configResolver) {
		return;
	}

	validateMany(allDocuments.all());
});

connection.onDidChangeWatchedFiles(() => {
	configWatcherStatus = true;
	if (!configResolver) {
		return;
	}

	validateMany(allDocuments.all());
});

allDocuments.onDidClose((event) => {
	connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

connection.listen();
