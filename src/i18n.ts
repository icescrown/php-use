import * as vscode from 'vscode';

interface Translations {
	[key: string]: {
		en: string;
		zh: string;
	};
}

const translations: Translations = {
	'noActiveEditor': {
		en: 'No active editor found!',
		zh: '未找到活动编辑器！'
	},
	'onlyPHPFiles': {
		en: 'This command only works with PHP files!',
		zh: '此命令仅适用于PHP文件！'
	},
	'noUnusedImports': {
		en: 'No unused imports found!',
		zh: '未发现未使用的 use 语句！'
	},
	'removedUnusedImports': {
		en: 'Removed {count} unused import(s)!',
		zh: '已移除 {count} 个未使用的 use 语句！'
	},
	'failedToRemoveImports': {
		en: 'Failed to remove unused imports!',
		zh: '移除未使用的 use 语句失败！'
	},
	'noWorkspaceFolder': {
		en: 'No workspace folder found!',
		zh: '未找到工作区文件夹！'
	},
	'noClassNameAtCursor': {
		en: 'No class or function name found at cursor position!',
		zh: '光标位置未找到类名或函数名！'
	},
	'importedClass': {
		en: 'Imported class {className} from {namespace}!',
		zh: '已从 {namespace} 导入 {className}！'
	},
	'importedFunction': {
		en: 'Imported function {className} from {namespace}!',
		zh: '已从 {namespace} 导入函数 {className}！'
	},
	'symbolAlreadyImported': {
		en: '{className} is already imported!',
		zh: '{className} 已经导入！'
	},
	'symbolNotFound': {
		en: 'Symbol {className} not found in workspace!',
		zh: '在工作区中未找到 {className}！'
	},
	'buildingSymbolIndex': {
		en: 'Indexing PHP symbols (first import only)...',
		zh: '正在索引 PHP 符号（仅首次导入需要）...'
	},
	'symbolIndexFailed': {
		en: 'Failed to build PHP symbol index! Check the console for details.',
		zh: 'PHP 符号索引构建失败！详情请查看控制台。'
	},
	'noOccurrencesFound': {
		en: 'No occurrences found to replace for class: {className}',
		zh: '未找到需要替换的 {className}！'
	},
	'expandedNamespace': {
		en: 'Expanded {className} to {fullClassName}, {count} occurrence(s) replaced',
		zh: '已将 {className} 展开为 {fullClassName}，共 {count} 处替换'
	},
	'failedToExpandNamespace': {
		en: 'Failed to expand namespace!',
		zh: '展开命名空间失败！'
	}
};

export function t(key: string, params?: { [key: string]: string | number }): string {
	const locale = vscode.env.language;
	const isChinese = locale.startsWith('zh');
	const lang = isChinese ? 'zh' : 'en';
	
	let message = translations[key]?.[lang] || translations[key]?.['en'] || key;
	
	if (params) {
		Object.keys(params).forEach(paramKey => {
			message = message.replace(`{${paramKey}}`, String(params[paramKey]));
		});
	}
	
	return message;
}
