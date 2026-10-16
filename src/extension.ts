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

	// Keep the symbol index up to date as files change
	const fileWatcher = vscode.workspace.createFileSystemWatcher('**/*.php');
	fileWatcher.onDidChange(uri => { void scanFileIntoIndex(uri); });
	fileWatcher.onDidCreate(uri => { void scanFileIntoIndex(uri); });
	fileWatcher.onDidDelete(uri => { removeFileFromIndex(uri.fsPath); });

	// Pre-build the symbol index in the background so the first import is instant
	void ensureSymbolIndex().catch(() => { /* failure surfaced via notification */ });

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
		fileWatcher,
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

type SymbolType = 'class' | 'function';

interface SymbolMatch {
	filePath: string;
	namespace: string;
	fullName: string;
	type: SymbolType;
}

interface SymbolIndexEntry extends SymbolMatch {
	name: string;
}

// --- Workspace symbol index (built lazily on first import, then kept up to date) ---

const NAMESPACE_REGEX = /namespace\s+([\w\\]+)\s*;/;

const fileSymbols = new Map<string, SymbolIndexEntry[]>();
const nameIndex = new Map<string, SymbolIndexEntry[]>(); // key: lowercase symbol name
let indexPromise: Promise<void> | null = null;

function ensureSymbolIndex(): Promise<void> {
	if (!indexPromise) {
		indexPromise = buildSymbolIndex();
		indexPromise.catch(error => {
			// Allow retrying on the next import if the initial build failed
			indexPromise = null;
			console.error('Symbol index build failed:', error);
			showMessage(t('symbolIndexFailed'), 'error');
		});
	}
	return indexPromise;
}

async function buildSymbolIndex(): Promise<void> {
	const excludePatterns = getExcludePatterns();
	const excludeGlob = '{' + excludePatterns.join(',') + '}';
	const files = await vscode.workspace.findFiles('**/*.php', excludeGlob);
	await Promise.all(files.map(file => scanFileIntoIndex(file)));
}

async function scanFileIntoIndex(file: vscode.Uri): Promise<void> {
	try {
		const fileContent = await vscode.workspace.fs.readFile(file);
		const content = Buffer.from(fileContent).toString('utf8');

		const namespaceMatch = content.match(NAMESPACE_REGEX);
		const namespace = namespaceMatch ? namespaceMatch[1] : '';
		const entries: SymbolIndexEntry[] = [];

		// Local instances: global regexes have lastIndex state and are scanned concurrently
		// Only match top-level function declarations (start of a line), so class methods are excluded
		const classRegex = /\bclass\s+([A-Za-z_]\w*)/g;
		const functionRegex = /(^|\n)\s*function\s+([A-Za-z_]\w*)\s*\(/g;

		let match: RegExpExecArray | null;
		while ((match = classRegex.exec(content)) !== null) {
			entries.push(makeIndexEntry(match[1], namespace, file.fsPath, 'class'));
		}
		while ((match = functionRegex.exec(content)) !== null) {
			entries.push(makeIndexEntry(match[2], namespace, file.fsPath, 'function'));
		}

		removeFileFromIndex(file.fsPath);
		fileSymbols.set(file.fsPath, entries);
		entries.forEach(addToNameIndex);
	} catch (error) {
		console.error('Failed to index file: ' + file.fsPath, error);
	}
}

function makeIndexEntry(name: string, namespace: string, filePath: string, type: SymbolType): SymbolIndexEntry {
	return {
		name,
		namespace,
		fullName: namespace ? namespace + '\\' + name : name,
		filePath,
		type
	};
}

function addToNameIndex(entry: SymbolIndexEntry): void {
	const key = entry.name.toLowerCase();
	const list = nameIndex.get(key);
	if (list) {
		list.push(entry);
	} else {
		nameIndex.set(key, [entry]);
	}
}

function removeFileFromIndex(filePath: string): void {
	const oldEntries = fileSymbols.get(filePath);
	if (!oldEntries) {
		return;
	}

	oldEntries.forEach(entry => {
		const key = entry.name.toLowerCase();
		const list = nameIndex.get(key);
		if (list) {
			const idx = list.indexOf(entry);
			if (idx >= 0) {
				list.splice(idx, 1);
			}
			if (list.length === 0) {
				nameIndex.delete(key);
			}
		}
	});
	fileSymbols.delete(filePath);
}

async function findSymbolInWorkspace(symbolName: string, quickPickTitle: string, typeFilter?: SymbolType): Promise<SymbolMatch | null> {
	if (!vscode.workspace.workspaceFolders) {
		showMessage(t('noWorkspaceFolder'), 'error');
		return null;
	}

	// Fast path: a file named exactly like the symbol usually defines it (PSR-style)
	const exactResults = await searchExactFileForSymbol(symbolName, typeFilter);
	if (exactResults.length > 0) {
		return pickSymbolFromMatches(exactResults, quickPickTitle);
	}

	// Full path: build (or reuse) the workspace symbol index, then look up in memory.
	// Only show the progress popup while actually building; awaiting a ready index is silent.
	try {
		if (indexPromise) {
			await indexPromise;
		} else {
			await vscode.window.withProgress(
				{ location: vscode.ProgressLocation.Notification, title: t('buildingSymbolIndex') },
				() => ensureSymbolIndex()
			);
		}
	} catch (error) {
		// Failure already surfaced via notification inside ensureSymbolIndex
		return null;
	}

	const allEntries = nameIndex.get(symbolName.toLowerCase()) ?? [];
	const matches = typeFilter ? allEntries.filter(entry => entry.type === typeFilter) : allEntries;

	if (matches.length === 0) {
		showMessage(t('symbolNotFound', { className: symbolName }), 'error');
		return null;
	}

	return pickSymbolFromMatches(matches, quickPickTitle);
}

function pickSymbolFromMatches(matches: SymbolMatch[], quickPickTitle: string): Promise<SymbolMatch | null> {
	if (matches.length === 1) {
		return Promise.resolve(matches[0]);
	}

	const items: vscode.QuickPickItem[] = matches.map(symbol => ({
		label: symbol.fullName,
		description: (symbol.type === 'function' ? '[function] ' : '') + symbol.filePath
	}));

	return Promise.resolve(vscode.window.showQuickPick(items, {
		title: quickPickTitle,
		placeHolder: 'Choose a symbol from the list...'
	}).then(selectedItem => selectedItem ? matches[items.indexOf(selectedItem)] : null));
}

async function searchExactFileForSymbol(symbolName: string, typeFilter?: SymbolType): Promise<SymbolMatch[]> {
	const definitionRegexes: Array<{ regex: RegExp; type: SymbolType }> = [];
	if (!typeFilter || typeFilter === 'class') {
		definitionRegexes.push({ regex: new RegExp('\\bclass\\s+' + symbolName + '\\b', 'i'), type: 'class' });
	}
	if (!typeFilter || typeFilter === 'function') {
		definitionRegexes.push({ regex: new RegExp('(^|\\n)\\s*function\\s+' + symbolName + '\\s*\\(', 'i'), type: 'function' });
	}

	try {
		const excludePatterns = getExcludePatterns();
		const excludeGlob = '{' + excludePatterns.join(',') + '}';
		const files = await vscode.workspace.findFiles('**/' + symbolName + '.php', excludeGlob);

		const results = await Promise.all(
			files.map(file => processFileForSymbol(file, symbolName, definitionRegexes))
		);
		return results.filter((result): result is SymbolMatch => result !== null);
	} catch (error) {
		console.error('Exact file search failed:', error);
		return [];
	}
}

async function processFileForSymbol(file: vscode.Uri, symbolName: string, definitionRegexes: Array<{ regex: RegExp; type: SymbolType }>): Promise<SymbolMatch | null> {
	try {
		const fileContent = await vscode.workspace.fs.readFile(file);
		const content = Buffer.from(fileContent).toString('utf8');

		for (const definition of definitionRegexes) {
			if (definition.regex.test(content)) {
				const namespaceMatch = content.match(NAMESPACE_REGEX);
				const namespace = namespaceMatch ? namespaceMatch[1] : '';
				const fullName = namespace ? namespace + '\\' + symbolName : symbolName;

				return {
					filePath: file.fsPath,
					namespace: namespace,
					fullName: fullName,
					type: definition.type
				};
			}
		}
		return null;
	} catch (error) {
		console.error('Failed to read file: ' + file.fsPath, error);
		return null;
	}
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

	const selectedSymbol = await findSymbolInWorkspace(className, 'Select which ' + className + ' to import');

	if (!selectedSymbol) {
		return;
	}

	const isFunction = selectedSymbol.type === 'function';
	const fullClassName = selectedSymbol.fullName;
	
	const text = document.getText();
	const useStatements = PHPParser.parseUseStatements(document);
	
	const getLineFromIndex = (index: number): number => text.substring(0, index).split('\n').length - 1;
	const getSimpleName = (fullClassName: string): string => fullClassName.split('\\').pop() || fullClassName;
	const getInsertPositionAfterLine = (line: number): { position: vscode.Position; needNewLine: boolean } => {
		const lines = text.split('\n');
		const nextLineContent = lines[line + 1]?.trim() || '';

		if (nextLineContent === '') {
			return { position: new vscode.Position(line + 2, 0), needNewLine: false };
		}
		// Next line is not empty, so the new use statement needs a blank line after it
		return { position: new vscode.Position(line + 1, 0), needNewLine: true };
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
			const resolved = getInsertPositionAfterLine(namespaceLine);
			insertPosition = resolved.position;
			needNewLine = resolved.needNewLine;
		}
	} else if (useStatements.length > 0) {
		const lastUseStmt = useStatements[useStatements.length - 1];
		insertPosition = new vscode.Position(lastUseStmt.line + 1, 0);
	} else {
		const phpTagRegex = /<\?php/i;
		const phpTagMatch = text.match(phpTagRegex);

		if (phpTagMatch) {
			const phpTagLine = getLineFromIndex(phpTagMatch.index!);
			const resolved = getInsertPositionAfterLine(phpTagLine);
			insertPosition = resolved.position;
			needNewLine = resolved.needNewLine;
		} else {
			insertPosition = new vscode.Position(0, 0);
		}
	}
	
	const simpleClassName = getSimpleName(fullClassName);

	const exactMatch = useStatements.find(stmt => stmt.className === fullClassName && (stmt.type === 'function') === isFunction);
	if (exactMatch) {
		showMessage(t('symbolAlreadyImported', { className: fullClassName }));
		return;
	}

	const existingUseWithSameName = useStatements.find(stmt => (stmt.type === 'function') === isFunction && getSimpleName(stmt.className) === simpleClassName);

	let useStatement = '';
	if (existingUseWithSameName) {
		const namespaceParts = fullClassName.split('\\');
		const namespacePart = namespaceParts.length > 1 ? namespaceParts[namespaceParts.length - 2] : '';
		const namespacePartCapitalized = namespacePart.charAt(0).toUpperCase() + namespacePart.slice(1);
		let alias = namespacePartCapitalized + simpleClassName;

		let counter = 1;
		while (true) {
			const aliasExists = useStatements.find(stmt => stmt.alias === alias && stmt.className !== fullClassName);

			if (!aliasExists) {
				break;
			}

			alias = namespacePartCapitalized + simpleClassName + counter;
			counter++;
		}

		useStatement = (isFunction ? 'use function ' : 'use ') + fullClassName + ' as ' + alias + ';\n';
	} else {
		useStatement = (isFunction ? 'use function ' : 'use ') + fullClassName + ';\n';
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
	
	if (isFunction) {
		showMessage(t('importedFunction', { className, namespace: selectedSymbol.namespace }));
	} else {
		showMessage(t('importedClass', { className, namespace: selectedSymbol.namespace }));
	}
}

async function expandNamespace(editor: vscode.TextEditor) {
	const document = editor.document;
	const position = editor.selection.active;
	
	const className = PHPParser.getCurrentClassAtPosition(document, position);
	if (!className) {
		showMessage(t('noClassNameAtCursor'), 'error');
		return;
	}
	
	const selectedClass = await findSymbolInWorkspace(className, 'Select which ' + className + ' class to expand', 'class');

	if (!selectedClass) {
		return;
	}

	const text = document.getText();
	const fullClassName = selectedClass.fullName;
	
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