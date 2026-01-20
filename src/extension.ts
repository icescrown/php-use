import * as vscode from 'vscode';
import { PHPParser, UseStatement } from './phpParser';
import { t } from './i18n';

let diagnosticCollection: vscode.DiagnosticCollection;

function getConfiguration() {
	return vscode.workspace.getConfiguration('php-use');
}

function isAutoDetectEnabled() {
	return getConfiguration().get<boolean>('detectUnusedImports', true);
}

function isShowUnusedImportsDiagnosticsEnabled() {
	return getConfiguration().get<boolean>('showUnusedImportsDiagnostics', false);
}

function isNotificationsEnabled() {
	return getConfiguration().get<boolean>('showNotifications', true);
}

function showMessage(message: string, type: 'info' | 'error' = 'info') {
	if (!isNotificationsEnabled()) {
		return;
	}

	if (type === 'error') {
		vscode.window.showErrorMessage(message);
	} else {
		vscode.window.showInformationMessage(message);
	}
}

function getExcludePatterns() {
	return getConfiguration().get<string[]>('exclude', ['**/node_modules/**', '**/vendor/**']);
}

function getDiagnosticSeverity() {
	const severity = getConfiguration().get<string>('diagnosticSeverity', 'Information');
	return vscode.DiagnosticSeverity[severity as keyof typeof vscode.DiagnosticSeverity] || vscode.DiagnosticSeverity.Information;
}

function isAutoSortAfterImportsEnabled() {
	return getConfiguration().get<boolean>('autoSortAfterImports', false);
}

function isNaturalSortEnabled() {
	return getConfiguration().get<boolean>('naturalSort', false);
}

function sortUseStatements(editor: vscode.TextEditor) {
	const document = editor.document;
	const useStatements = PHPParser.parseUseStatements(document);
	
	if (useStatements.length < 2) {
		return;
	}
	
	const text = document.getText();
	const lines = text.split('\n');
	
	const useStmtLines = useStatements.map(stmt => ({
		line: stmt.line,
		className: stmt.className,
		alias: stmt.alias,
		originalText: lines[stmt.line]
	}));
	
	const useNaturalSort = isNaturalSortEnabled();
	const sortedLines = [...useStmtLines].sort((a, b) => {
		if (useNaturalSort) {
			return a.className.localeCompare(b.className, undefined, { numeric: true });
		} else {
			return a.className.localeCompare(b.className);
		}
	});
	
	const lineNumbers = useStmtLines.map(stmt => stmt.line);
	const minLine = Math.min(...lineNumbers);
	const maxLine = Math.max(...lineNumbers);
	
	const startRange = new vscode.Range(minLine, 0, maxLine, lines[maxLine].length);
	
	editor.edit(editBuilder => {
		const sortedText = sortedLines.map(stmt => stmt.originalText).join('\n');
		editBuilder.replace(startRange, sortedText);
	});
}

export function activate(context: vscode.ExtensionContext) {

	diagnosticCollection = vscode.languages.createDiagnosticCollection('php-use');
	
	const disposable = vscode.commands.registerCommand('php-use.removeUnusedImports', () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			showMessage(t('noActiveEditor'), 'error');
			return;
		}

		if (editor.document.languageId !== 'php') {
			showMessage(t('onlyPHPFiles'), 'error');
			return;
		}

		removeUnusedImports(editor);
	});

	const importCommand = vscode.commands.registerCommand('php-use.importCurrentClass', (args?: any) => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			showMessage(t('noActiveEditor'), 'error');
			return;
		}

		const className = args?.className;
		importCurrentClass(editor, className);
	});

	const expandNamespaceCommand = vscode.commands.registerCommand('php-use.expandNamespace', () => {
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			showMessage(t('noActiveEditor'), 'error');
			return;
		}

		if (editor.document.languageId !== 'php') {
			showMessage(t('onlyPHPFiles'), 'error');
			return;
		}

		expandNamespace(editor);
	});

	const codeActionProvider = vscode.languages.registerCodeActionsProvider('php', {
		provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext) {
			if (!isAutoDetectEnabled()) {
				return [];
			}

			const actions: vscode.CodeAction[] = [];

			const hasUnusedImportDiagnostics = context.diagnostics.some(d => 
				d.source === 'php-use' && d.message.includes('Unused import')
			);

			if (hasUnusedImportDiagnostics) {
				const quickFixAction = new vscode.CodeAction('Remove unused imports', vscode.CodeActionKind.QuickFix);
				quickFixAction.command = {
					command: 'php-use.removeUnusedImports',
					title: 'Remove unused imports'
				};
				actions.push(quickFixAction);

				const fixAllAction = new vscode.CodeAction('Remove all unused imports', vscode.CodeActionKind.SourceFixAll);
				fixAllAction.command = {
					command: 'php-use.removeUnusedImports',
					title: 'Remove all unused imports'
				};
				actions.push(fixAllAction);

				const sourceAction = new vscode.CodeAction('Remove unused imports', vscode.CodeActionKind.SourceOrganizeImports);
				sourceAction.command = {
					command: 'php-use.removeUnusedImports',
					title: 'Remove all unused imports'
				};
				actions.push(sourceAction);
			}

			return actions;
		}
	}, { 
		providedCodeActionKinds: [
			vscode.CodeActionKind.QuickFix,
			vscode.CodeActionKind.SourceFixAll,
			vscode.CodeActionKind.SourceOrganizeImports
		] 
	});

	const didOpenSubscription = vscode.workspace.onDidOpenTextDocument(updateDiagnostics);
	const didSaveSubscription = vscode.workspace.onDidSaveTextDocument(updateDiagnostics);
	const didChangeSubscription = vscode.workspace.onDidChangeTextDocument(e => updateDiagnostics(e.document));

	const configChangeSubscription = vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('php-use')) {
			vscode.workspace.textDocuments.forEach(doc => {
				if (doc.languageId === 'php') {
					updateDiagnostics(doc);
				}
			});
		}
	});

	vscode.workspace.textDocuments.forEach(doc => {
		if (doc.languageId === 'php') {
			updateDiagnostics(doc);
		}
	});

	context.subscriptions.push(
		disposable,
		importCommand,
		expandNamespaceCommand,
		diagnosticCollection,
		codeActionProvider,
		didOpenSubscription,
		didSaveSubscription,
		didChangeSubscription,
		configChangeSubscription
	);
}

function removeUnusedImports(editor: vscode.TextEditor) {
	const document = editor.document;
	const unusedUseStatements = PHPParser.getUnusedUseStatements(document);
	
	if (unusedUseStatements.length === 0) {
		showMessage(t('noUnusedImports'));
		return;
	}

	const unusedClasses = new Set<string>();
	unusedUseStatements.forEach(stmt => {
		unusedClasses.add(stmt.className);
	});

	editor.edit(editBuilder => {
		const linesToProcess = new Set<number>();
		unusedUseStatements.forEach(stmt => {
			linesToProcess.add(stmt.line);
		});

		const sortedLines = Array.from(linesToProcess).sort((a, b) => b - a);

		sortedLines.forEach(lineNum => {
			const line = document.lineAt(lineNum);
			const lineText = line.text;

			if (lineText.includes('{') && lineText.includes('}')) {
				const match = lineText.match(/^\s*use\s+(?:function\s+|const\s+)?([\w\\]+)\s*\{\s*([\w\\,\s]+)\s*\}\s*;/);
				if (match) {
					const namespace = match[1];
					const classListStr = match[2];
					const classList = classListStr.split(',').map(c => c.trim()).filter(c => c !== '');

					const usedClasses = classList.filter(className => {
						const fullClassName = namespace + '\\' + className;
						return !unusedClasses.has(fullClassName);
					});

					if (usedClasses.length === 0) {
						editBuilder.delete(line.rangeIncludingLineBreak);
					} else {
						const newUseStmts = usedClasses.map(className => {
							return 'use ' + namespace + className + ';';
						}).join('\n');
						editBuilder.replace(line.range, newUseStmts);
					}
				}
			} else {
				const match = lineText.match(/^\s*use\s+(?:function\s+|const\s+)?([\w\\]+)(?:\s+as\s+([\w]+))?\s*;/);
				if (match) {
					const className = match[1];
					if (unusedClasses.has(className)) {
						editBuilder.delete(line.rangeIncludingLineBreak);
					}
				}
			}
		});
	}).then(success => {
		if (success) {
			showMessage(t('removedUnusedImports', { count: unusedUseStatements.length }));
			updateDiagnostics(editor.document);
		} else {
			showMessage(t('failedToRemoveImports'), 'error');
		}
	});
}

function updateDiagnostics(document: vscode.TextDocument) {
	if (document.languageId !== 'php') {
		return;
	}

	if (!isAutoDetectEnabled()) {
		diagnosticCollection.set(document.uri, []);
		return;
	}

	const diagnostics: vscode.Diagnostic[] = [];

	if (isShowUnusedImportsDiagnosticsEnabled()) {
		const unusedUseStatements = PHPParser.getUnusedUseStatements(document);
		unusedUseStatements.forEach(useStmt => {
			const startPos = document.positionAt(useStmt.start);
			const endPos = document.positionAt(useStmt.end);
			const range = new vscode.Range(startPos, endPos);

			const diagnostic = new vscode.Diagnostic(
				range,
				`Unused import: ${useStmt.className}`,
				getDiagnosticSeverity()
			);
			diagnostic.source = 'php-use';
			diagnostics.push(diagnostic);
		});
	}

	diagnosticCollection.set(document.uri, diagnostics);
}

export function deactivate() {
	if (diagnosticCollection) {
		diagnosticCollection.clear();
		diagnosticCollection.dispose();
	}
}

async function findClassInWorkspace(className: string, quickPickTitle: string): Promise<{ filePath: string; namespace: string; fullClassName: string } | null> {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders) {
		showMessage(t('noWorkspaceFolder'), 'error');
		return null;
	}
	
	const foundClasses: Array<{ filePath: string; namespace: string; fullClassName: string }> = [];
	
	const simpleClassRegex = new RegExp('\\bclass\\s+' + className + '\\b', 'i');
	const namespaceRegex = /namespace\s+([\w\\]+)\s*;/;
	
	const exactFilePattern = '**/' + className + '.php';
	const exactResults = await searchFilesForClass(exactFilePattern, className, simpleClassRegex, namespaceRegex);
	
	foundClasses.push(...exactResults);
	
	if (foundClasses.length === 0) {
		const allFilesPattern = '**/*.php';
		const allResults = await searchFilesForClass(allFilesPattern, className, simpleClassRegex, namespaceRegex);
		foundClasses.push(...allResults);
	}
	
	if (foundClasses.length === 0) {
		showMessage(t('classNotFound', { className }), 'error');
		return null;
	}
	
	if (foundClasses.length === 1) {
		return foundClasses[0];
	}
	
	const items: vscode.QuickPickItem[] = foundClasses.map(cls => ({
		label: cls.fullClassName,
		description: cls.filePath
	}));

	const selectedItem = await vscode.window.showQuickPick(items, {
		title: quickPickTitle,
		placeHolder: 'Choose a class from the list...'
	});

	if (!selectedItem) {
		return null;
	}

	return foundClasses[items.indexOf(selectedItem)];
}

async function processFileForClass(file: vscode.Uri, className: string, simpleClassRegex: RegExp, namespaceRegex: RegExp): Promise<{ filePath: string; namespace: string; fullClassName: string } | null> {
	try {
		const fileContent = await vscode.workspace.fs.readFile(file);
		const content = Buffer.from(fileContent).toString('utf8');

		if (simpleClassRegex.test(content)) {
			const namespaceMatch = content.match(namespaceRegex);
			const namespace = namespaceMatch ? namespaceMatch[1] : '';
			const fullClassName = namespace ? namespace + '\\' + className : className;

			return {
				filePath: file.fsPath,
				namespace: namespace,
				fullClassName: fullClassName
			};
		}
		return null;
	} catch (error) {
		console.error('Failed to read file: ' + file.fsPath, error);
		return null;
	}
}

async function searchFilesForClass(filePattern: string, className: string, simpleClassRegex: RegExp, namespaceRegex: RegExp): Promise<Array<{ filePath: string; namespace: string; fullClassName: string }>> {
	const foundClasses: Array<{ filePath: string; namespace: string; fullClassName: string }> = [];
	
	try {
		const excludePatterns = getExcludePatterns();
		const excludeGlob = '{' + excludePatterns.join(',') + '}';
		
		const files = await vscode.workspace.findFiles(filePattern, excludeGlob);
		
		const results = await Promise.all(
			files.map(async (file) => processFileForClass(file, className, simpleClassRegex, namespaceRegex))
		);
		
		foundClasses.push(...results.filter((result): result is { filePath: string; namespace: string; fullClassName: string } => result !== null));
	} catch (error) {
		console.error('File search failed:', error);
	}
	
	return foundClasses;
}

async function importCurrentClass(editor: vscode.TextEditor, className?: string | null) {
	const document = editor.document;
	const position = editor.selection.active;
	
	if (!className) {
		className = PHPParser.getCurrentClassAtPosition(document, position);
		if (!className) {
			showMessage(t('noClassNameAtCursor'), 'error');
			return;
		}
	}

	const selectedClass = await findClassInWorkspace(className, 'Select which ' + className + ' class to import');
	
	if (!selectedClass) {
		return;
	}
	
	const text = document.getText();
	const useStatements = PHPParser.parseUseStatements(document);
	
	const getLineFromIndex = (index: number): number => text.substring(0, index).split('\n').length - 1;
	const getSimpleName = (fullClassName: string): string => fullClassName.split('\\').pop() || fullClassName;
	const getInsertPositionAfterLine = (line: number): vscode.Position => {
		const lines = text.split('\n');
		const nextLineContent = lines[line + 1]?.trim() || '';
		
		if (nextLineContent === '') {
			return new vscode.Position(line + 2, 0);
		} else {
			needNewLine = true;
			return new vscode.Position(line + 1, 0);
		}
	};
	
	let insertPosition: vscode.Position;
	let needNewLine = false;

	const currentNamespaceRegex = /\bnamespace\s+([\w\\]+)\s*;/;
	const namespaceMatch = text.match(currentNamespaceRegex);

	if (namespaceMatch) {
		const namespaceLine = getLineFromIndex(namespaceMatch.index!);
		const useStmtAfterNamespace = useStatements.filter(stmt => stmt.line > namespaceLine);
		
		if (useStmtAfterNamespace.length > 0) {
			const lastUseStmt = useStmtAfterNamespace[useStmtAfterNamespace.length - 1];
			insertPosition = new vscode.Position(lastUseStmt.line + 1, 0);
		} else {
			insertPosition = getInsertPositionAfterLine(namespaceLine);
		}
	} else if (useStatements.length > 0) {
		const lastUseStmt = useStatements[useStatements.length - 1];
		insertPosition = new vscode.Position(lastUseStmt.line + 1, 0);
	} else {
		const phpTagRegex = /<\?php/i;
		const phpTagMatch = text.match(phpTagRegex);
		
		if (phpTagMatch) {
			const phpTagLine = getLineFromIndex(phpTagMatch.index!);
			insertPosition = getInsertPositionAfterLine(phpTagLine);
		} else {
			insertPosition = new vscode.Position(0, 0);
		}
	}
	
	const simpleClassName = getSimpleName(selectedClass.fullClassName);
	
	const exactMatch = useStatements.find(stmt => stmt.className === selectedClass.fullClassName);
	if (exactMatch) {
		showMessage(t('classAlreadyImported', { className: selectedClass.fullClassName }));
		return;
	}
	
	const existingUseWithSameName = useStatements.find(stmt => getSimpleName(stmt.className) === simpleClassName);
	
	let useStatement = '';
	if (existingUseWithSameName) {
		const namespaceParts = selectedClass.fullClassName.split('\\');
		const namespacePart = namespaceParts.length > 1 ? namespaceParts[namespaceParts.length - 2] : '';
		const namespacePartCapitalized = namespacePart.charAt(0).toUpperCase() + namespacePart.slice(1);
		let alias = namespacePartCapitalized + simpleClassName;
		
		let counter = 1;
		while (true) {
			const aliasExists = useStatements.find(stmt => {
				if (stmt.alias === alias) {
					return stmt.className !== selectedClass.fullClassName;
				}
				return false;
			});
			
			if (!aliasExists) {
				break;
			}
			
			alias = namespacePartCapitalized + simpleClassName + counter;
			counter++;
		}
		
		useStatement = 'use ' + selectedClass.fullClassName + ' as ' + alias + ';\n';
	} else {
		useStatement = 'use ' + selectedClass.fullClassName + ';\n';
	}
	
	if (needNewLine) {
		useStatement = '\n' + useStatement;
	}
	
	await editor.edit(editBuilder => {
        editBuilder.insert(insertPosition, useStatement);
	});
	
	if (isAutoSortAfterImportsEnabled()) {
		sortUseStatements(editor);
	}
	
	showMessage(t('importedClass', { className, namespace: selectedClass.namespace }));
}

async function expandNamespace(editor: vscode.TextEditor) {
	const document = editor.document;
	const position = editor.selection.active;
	
	const className = PHPParser.getCurrentClassAtPosition(document, position);
	if (!className) {
		showMessage(t('noClassNameAtCursor'), 'error');
		return;
	}
	
	const selectedClass = await findClassInWorkspace(className, 'Select which ' + className + ' class to expand');
	
	if (!selectedClass) {
		return;
	}
	
	const text = document.getText();
	const fullClassName = selectedClass.fullClassName;
	
	const classRegex = new RegExp('\\b' + className + '\\b', 'g');
	let match;
	let replacements: Array<{ range: vscode.Range; replacement: string }> = [];
	
	while ((match = classRegex.exec(text)) !== null) {
		const startPos = document.positionAt(match.index);
		const endPos = document.positionAt(match.index + match[0].length);
		const range = new vscode.Range(startPos, endPos);
		
		const lineText = document.lineAt(startPos.line).text;
		
		const useStatementRegex = /\buse\s+[\w\\]+(?:\s+as\s+[\w]+)?\s*;/;
		const namespaceRegex = /\bnamespace\s+[\w\\]+\s*;/;
		const classDefinitionRegex = /\bclass\s+/;
		
		if (useStatementRegex.test(lineText) || namespaceRegex.test(lineText) || classDefinitionRegex.test(lineText)) {
			continue;
		}
		
		const beforeChar = match.index > 0 ? text[match.index - 1] : '';
		const afterChar = match.index + match[0].length < text.length ? text[match.index + match[0].length] : '';
		
		if (beforeChar === '\\' || afterChar === '\\') {
			continue;
		}
		
		const wordRegex = /\b[a-zA-Z0-9_]+\b/;
		if (wordRegex.test(beforeChar) || wordRegex.test(afterChar)) {
			continue;
		}
		
		replacements.push({
			range: range,
			replacement: '\\' + fullClassName
		});
	}
	
	if (replacements.length === 0) {
		showMessage(t('noOccurrencesFound', { className }));
		return;
	}
	
	editor.edit(editBuilder => {
		replacements.reverse().forEach(item => {
			editBuilder.replace(item.range, item.replacement);
		});
	}).then(success => {
		if (success) {
			showMessage(t('expandedNamespace', { className, fullClassName, count: replacements.length }));
		} else {
			showMessage(t('failedToExpandNamespace'), 'error');
		}
	});
}