import * as vscode from 'vscode';
import { PHPParser, UseStatement } from './phpParser';

let diagnosticCollection: vscode.DiagnosticCollection;

function getConfiguration() {
	return vscode.workspace.getConfiguration('php-use');
}

function isAutoDetectEnabled() {
	return getConfiguration().get<boolean>('enableAutoDetect', true);
}

function isDiagnosticsEnabled() {
	return getConfiguration().get<boolean>('showDiagnostics', true);
}

function isNotificationsEnabled() {
	return getConfiguration().get<boolean>('showNotifications', true);
}

function getDiagnosticSeverity() {
	const severity = getConfiguration().get<string>('diagnosticSeverity', 'Information');
	return vscode.DiagnosticSeverity[severity as keyof typeof vscode.DiagnosticSeverity] || vscode.DiagnosticSeverity.Information;
}

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "php-use" is now active!');

	// 创建诊断集合
	diagnosticCollection = vscode.languages.createDiagnosticCollection('php-use');
	
	// 注册删除未使用引用的命令
	const disposable = vscode.commands.registerCommand('php-use.removeUnusedImports', () => {
		// 获取当前活动编辑器
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('No active editor found!');
			return;
		}

		// 只处理PHP文件
		if (editor.document.languageId !== 'php') {
			vscode.window.showErrorMessage('This command only works with PHP files!');
			return;
		}

		// 执行删除未使用引用的操作
		removeUnusedImports(editor);
	});

	// 注册导入当前类的命令
	const importCommand = vscode.commands.registerCommand('php-use.importCurrentClass', (args?: any) => {
		// 获取当前活动编辑器
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			vscode.window.showErrorMessage('No active editor found!');
			return;
		}

		// 检查是否有传递类名参数
		const className = args?.className;
		// 执行导入当前类的操作
		importCurrentClass(editor, className);
	});

	// 注册Code Action提供者
	const codeActionProvider = vscode.languages.registerCodeActionsProvider('php', {
		provideCodeActions(document: vscode.TextDocument, range: vscode.Range | vscode.Selection, context: vscode.CodeActionContext) {
			// 检查是否启用了自动检测
			if (!isAutoDetectEnabled()) {
				return [];
			}

			// 创建Code Action数组
			const actions: vscode.CodeAction[] = [];

			// 检查是否有未使用的use语句诊断
			const hasUnusedImportDiagnostics = context.diagnostics.some(d => 
				d.source === 'php-use' && d.message.includes('Unused import')
			);

			if (hasUnusedImportDiagnostics) {
				// 1. 快速修复（单个问题）
				const quickFixAction = new vscode.CodeAction('Remove unused imports', vscode.CodeActionKind.QuickFix);
				quickFixAction.command = {
					command: 'php-use.removeUnusedImports',
					title: 'Remove unused imports'
				};
				actions.push(quickFixAction);

				// 2. 修复所有（全局问题）
				const fixAllAction = new vscode.CodeAction('Remove all unused imports', vscode.CodeActionKind.SourceFixAll);
				fixAllAction.command = {
					command: 'php-use.removeUnusedImports',
					title: 'Remove all unused imports'
				};
				actions.push(fixAllAction);

				// 3. 源操作（Source Action）
				const sourceAction = new vscode.CodeAction('Remove unused imports', vscode.CodeActionKind.SourceOrganizeImports);
				sourceAction.command = {
					command: 'php-use.removeUnusedImports',
					title: 'Remove all unused imports'
				};
				actions.push(sourceAction);
			}

			// 检查是否有未导入类的诊断
			const notImportedDiagnostics = context.diagnostics.filter(d => 
				d.source === 'php-use' && d.message.includes('is not imported')
			);

			if (notImportedDiagnostics.length > 0) {
				for (const diagnostic of notImportedDiagnostics) {
					// 提取类名
					const match = diagnostic.message.match(/Class\s+([\w]+)\s+is not imported/);
					if (match) {
						const className = match[1];
						// 创建导入类的快速修复
						const importAction = new vscode.CodeAction(`Import class ${className}`, vscode.CodeActionKind.QuickFix);
						importAction.command = {
							command: 'php-use.importCurrentClass',
							title: `Import class ${className}`,
							arguments: [{ className: className }]
						};
						// 关联诊断
						importAction.diagnostics = [diagnostic];
						// 标记为可修复
						importAction.isPreferred = true;
						actions.push(importAction);
					}
				}
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

	// 监听文件打开和保存事件，更新诊断
	const didOpenSubscription = vscode.workspace.onDidOpenTextDocument(updateDiagnostics);
	const didSaveSubscription = vscode.workspace.onDidSaveTextDocument(updateDiagnostics);
	const didChangeSubscription = vscode.workspace.onDidChangeTextDocument(e => updateDiagnostics(e.document));

	// 监听配置变化
	const configChangeSubscription = vscode.workspace.onDidChangeConfiguration(e => {
		if (e.affectsConfiguration('php-use')) {
			// 更新所有已打开的PHP文件的诊断
			vscode.workspace.textDocuments.forEach(doc => {
				if (doc.languageId === 'php') {
					updateDiagnostics(doc);
				}
			});
		}
	});

	// 更新当前已打开的PHP文件的诊断
	vscode.workspace.textDocuments.forEach(doc => {
		if (doc.languageId === 'php') {
			updateDiagnostics(doc);
		}
	});

	// 订阅所有可释放资源
	context.subscriptions.push(
		disposable,
		importCommand,
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
		if (isNotificationsEnabled()) {
			vscode.window.showInformationMessage('No unused imports found!');
		}
		return;
	}

	// 收集所有未使用的类名
	const unusedClasses = new Set<string>();
	unusedUseStatements.forEach(stmt => {
		unusedClasses.add(stmt.className);
	});

	// 执行编辑操作
	editor.edit(editBuilder => {
		// 收集所有要处理的行，按行号倒序处理
		const linesToProcess = new Set<number>();
		unusedUseStatements.forEach(stmt => {
			linesToProcess.add(stmt.line);
		});

		// 按行号倒序排序
		const sortedLines = Array.from(linesToProcess).sort((a, b) => b - a);

		// 处理每一行
		sortedLines.forEach(lineNum => {
			const line = document.lineAt(lineNum);
			const lineText = line.text;

			// 检查是否是分组use语句
			if (lineText.includes('{') && lineText.includes('}')) {
				// 处理分组use语句
				const match = lineText.match(/^\s*use\s+([\w\\]+)\s*\{\s*([\w\\,\s]+)\s*\}\s*;/);
				if (match) {
					const namespace = match[1];
					const classListStr = match[2];
					const classList = classListStr.split(',').map(c => c.trim()).filter(c => c !== '');

					// 筛选出已使用的类
					const usedClasses = classList.filter(className => {
						const fullClassName = namespace + '\\' + className;
						return !unusedClasses.has(fullClassName);
					});

					if (usedClasses.length === 0) {
						// 删除整行
						editBuilder.delete(line.rangeIncludingLineBreak);
					} else {
						// 生成新的use语句，使用普通use语句格式
						const newUseStmts = usedClasses.map(className => {
							// 直接使用完整的命名空间和类名，避免重复添加反斜杠
							return 'use ' + namespace + className + ';';
						}).join('\n');
						editBuilder.replace(line.range, newUseStmts);
					}
				}
			} else {
				// 处理普通use语句
				const match = lineText.match(/^\s*use\s+([\w\\]+)(?:\s+as\s+([\w]+))?\s*;/);
				if (match) {
					const className = match[1];
					if (unusedClasses.has(className)) {
						// 删除整行
						editBuilder.delete(line.rangeIncludingLineBreak);
					}
				}
			}
		});
	}).then(success => {
		if (success) {
			if (isNotificationsEnabled()) {
				vscode.window.showInformationMessage(`Removed ${unusedUseStatements.length} unused import(s)!`);
			}
			updateDiagnostics(editor.document);
		} else {
			if (isNotificationsEnabled()) {
				vscode.window.showErrorMessage('Failed to remove unused imports!');
			}
		}
	});
}

function updateDiagnostics(document: vscode.TextDocument) {
	// 只处理PHP文件
	if (document.languageId !== 'php') {
		return;
	}

	// 检查是否启用了自动检测
	if (!isAutoDetectEnabled()) {
		// 清除诊断信息
		diagnosticCollection.set(document.uri, []);
		return;
	}

	// 检查是否启用了诊断
	if (!isDiagnosticsEnabled()) {
		// 清除诊断信息
		diagnosticCollection.set(document.uri, []);
		return;
	}

	// 创建诊断数组
	const diagnostics: vscode.Diagnostic[] = [];

	// 添加未使用use语句的诊断
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
		// 设置诊断源，确保与package.json中的配置匹配
		diagnostic.source = 'php-use';
		diagnostics.push(diagnostic);
	});

	// 添加未导入但使用的类的诊断
	const unusedButReferencedClasses = PHPParser.getUnusedButReferencedClasses(document);
	unusedButReferencedClasses.forEach(item => {
		const startPos = document.positionAt(item.start);
		const endPos = document.positionAt(item.end);
		const range = new vscode.Range(startPos, endPos);

		const diagnostic = new vscode.Diagnostic(
			range,
			`Class ${item.className} is not imported`,
			getDiagnosticSeverity()
		);
		diagnostic.source = 'php-use';
		diagnostics.push(diagnostic);
	});

	// 设置诊断信息
	diagnosticCollection.set(document.uri, diagnostics);
}

// This method is called when your extension is deactivated
export function deactivate() {
	// 清理诊断集合
	if (diagnosticCollection) {
		diagnosticCollection.clear();
		diagnosticCollection.dispose();
	}
}

async function importCurrentClass(editor: vscode.TextEditor, className?: string | null) {
	const document = editor.document;
	const position = editor.selection.active;
	
	// 如果没有提供类名，则从光标位置获取
	if (!className) {
		className = PHPParser.getCurrentClassAtPosition(document, position);
		if (!className) {
			vscode.window.showErrorMessage('No class name found at cursor position!');
			return;
		}
	}
	
	// 检查是否已经导入了该类
	const allUseStatements = PHPParser.parseUseStatements(document);
	for (const stmt of allUseStatements) {
		if (stmt.alias === className || stmt.className === className) {
			if (isNotificationsEnabled()) {
				vscode.window.showInformationMessage(`Class ${className} is already imported!`);
			}
			return;
		}
	}
	
	// 搜索项目中的PHP文件
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders) {
		vscode.window.showErrorMessage('No workspace folder found!');
		return;
	}
	
	// 查找包含该类的文件
	// 改为数组，收集所有匹配的类
	const foundClasses: Array<{ filePath: string; namespace: string; fullClassName: string }> = [];
	
	// 优化：使用正则表达式对象而不是动态创建
	// 确保正则表达式使用正确的转义字符
	const simpleClassRegex = new RegExp('class\\s+' + className, 'i');
	// 使用正则表达式字面量来正确匹配包含反斜杠的命名空间
	const namespaceRegex = /namespace\s+([\w\\]+)\s*;/;
	
	// 首先尝试使用精确文件名搜索，这样更高效
	try {
		// 搜索与类名同名的PHP文件 (如 ClassName.php)
		const exactFilePattern = '**/' + className + '.php';
		console.log('Searching for exact file: ' + exactFilePattern);
		
		// 搜索所有匹配的文件
		const exactFiles = await vscode.workspace.findFiles(exactFilePattern);
		console.log('Found ' + exactFiles.length + ' exact files: ' + exactFiles.map(f => f.fsPath).join(', '));
		
		// 并行处理精确匹配的文件，提高性能
		const exactFileResults = await Promise.all(
			exactFiles.map(async (file) => {
				try {
					const fileContent = await vscode.workspace.fs.readFile(file);
					const content = Buffer.from(fileContent).toString('utf8');
					
					if (simpleClassRegex.test(content)) {
						// 解析命名空间
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
					// 忽略无法读取的文件
					console.error('Failed to read exact file: ' + file.fsPath, error);
					return null;
				}
			})
		);
		
		// 过滤掉null结果并添加到foundClasses
		foundClasses.push(...exactFileResults.filter((result): result is { filePath: string; namespace: string; fullClassName: string } => result !== null));
		console.log('Found ' + foundClasses.length + ' classes in exact files');
		
		// 如果没有找到精确匹配的文件，则搜索所有PHP文件
		if (foundClasses.length === 0) {
			// 使用更广泛的搜索，查找所有PHP文件
			const allFilesPattern = '**/*.php';
			console.log('Searching all PHP files: ' + allFilesPattern);
			
			const allFiles = await vscode.workspace.findFiles(allFilesPattern);
			console.log('Found ' + allFiles.length + ' PHP files');
			
			// 并行处理所有文件，提高性能
			const fileResults = await Promise.all(
				allFiles.map(async (file) => {
					try {
						const fileContent = await vscode.workspace.fs.readFile(file);
						const content = Buffer.from(fileContent).toString('utf8');
						
						if (simpleClassRegex.test(content)) {
							// 解析命名空间
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
						// 忽略无法读取的文件
						console.error('Failed to read file: ' + file.fsPath, error);
						return null;
					}
				})
			);
			
			// 过滤掉null结果并添加到foundClasses
			foundClasses.push(...fileResults.filter((result): result is { filePath: string; namespace: string; fullClassName: string } => result !== null));
			console.log('Found ' + foundClasses.length + ' classes in all files');
		}
	} catch (error) {
		// 如果精确文件搜索失败，尝试全文件搜索
		console.error('Exact file search failed:', error);
		
		try {
			// 使用更广泛的搜索，查找所有PHP文件
			const allFilesPattern = '**/*.php';
			console.log('Searching all PHP files: ' + allFilesPattern);
			
			const allFiles = await vscode.workspace.findFiles(allFilesPattern);
			console.log('Found ' + allFiles.length + ' PHP files');
			
			// 并行处理所有文件，提高性能
			const fileResults = await Promise.all(
				allFiles.map(async (file) => {
					try {
						const fileContent = await vscode.workspace.fs.readFile(file);
						const content = Buffer.from(fileContent).toString('utf8');
						
						if (simpleClassRegex.test(content)) {
							// 解析命名空间
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
						// 忽略无法读取的文件
						console.error('Failed to read file: ' + file.fsPath, error);
						return null;
					}
				})
			);
			
			// 过滤掉null结果并添加到foundClasses
			foundClasses.push(...fileResults.filter((result): result is { filePath: string; namespace: string; fullClassName: string } => result !== null));
			console.log('Found ' + foundClasses.length + ' classes in all files');
		} catch (error) {
			// 如果全文件搜索也失败，记录错误
			console.error('Full file search failed:', error);
		}
	}
	
	if (foundClasses.length === 0) {
		vscode.window.showErrorMessage('Class ' + className + ' not found in workspace!');
		return;
	}
	
	// 构建完整的类名
	// 如果只有一个匹配的类，直接使用它
	let selectedClass: { filePath: string; namespace: string; fullClassName: string };
	
	if (foundClasses.length === 1) {
		selectedClass = foundClasses[0];
	} else {
		// 显示选择对话框，让用户选择要导入的类
		const items: vscode.QuickPickItem[] = foundClasses.map(cls => ({
			label: cls.fullClassName,
			description: cls.filePath  // 显示完整文件路径作为说明
		}));

		const selectedItem = await vscode.window.showQuickPick(items, {
			title: 'Select which ' + className + ' class to import',
			placeHolder: 'Choose a class from the list...'
		});

		if (!selectedItem) {
			// 用户取消了选择
			return;
		}

		// 找到对应的类
		selectedClass = foundClasses[items.indexOf(selectedItem)];
	}
	
	// 查找use语句的插入位置
	const text = document.getText();
	const useStatements = PHPParser.parseUseStatements(document);
	let insertPosition: vscode.Position;
	
	if (useStatements.length > 0) {
		// 在最后一个use语句之后插入
		const lastUseStmt = useStatements[useStatements.length - 1];
		const lastUseLine = document.lineAt(lastUseStmt.line);
		insertPosition = new vscode.Position(lastUseStmt.line + 1, 0);
	} else {
		// 查找<?php标签的位置
		const phpTagRegex = /<\?php/i;
		const phpTagMatch = text.match(phpTagRegex);
		if (phpTagMatch) {
			// 在<?php标签之后插入
			const phpTagLine = text.substring(0, phpTagMatch.index).split('\n').length - 1;
			const phpTagLineObj = document.lineAt(phpTagLine);
			insertPosition = new vscode.Position(phpTagLine + 1, 0);
		} else {
			// 在文件开头插入
			insertPosition = new vscode.Position(0, 0);
		}
	}
	
	// 插入use语句
	await editor.edit(editBuilder => {
		editBuilder.insert(insertPosition, 'use ' + selectedClass.fullClassName + ';\n');
	});
	
	if (isNotificationsEnabled()) {
		vscode.window.showInformationMessage('Imported class ' + className + ' from ' + selectedClass.namespace + '!');
	}
}