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
		zh: '未发现未使用的导入！'
	},
	'removedUnusedImports': {
		en: 'Removed {count} unused import(s)!',
		zh: '已移除 {count} 个未使用的导入！'
	},
	'failedToRemoveImports': {
		en: 'Failed to remove unused imports!',
		zh: '移除未使用的导入失败！'
	},
	'noWorkspaceFolder': {
		en: 'No workspace folder found!',
		zh: '未找到工作区文件夹！'
	},
	'classNotFound': {
		en: 'Class {className} not found in workspace!',
		zh: '在工作区中未找到类 {className}！'
	},
	'noClassNameAtCursor': {
		en: 'No class name found at cursor position!',
		zh: '光标位置未找到类名！'
	},
	'classAlreadyImported': {
		en: 'Class {className} is already imported!',
		zh: '类 {className} 已经导入！'
	},
	'importedClass': {
		en: 'Imported class {className} from {namespace}!',
		zh: '已从 {namespace} 导入类 {className}！'
	},
	'noOccurrencesFound': {
		en: 'No occurrences found to replace for class: {className}',
		zh: '未找到需要替换的类: {className}'
	},
	'expandedNamespace': {
		en: 'Expanded {className} to {fullClassName}, {count} occurrence(s) replaced',
		zh: '已将 {className} 展开为 {fullClassName}，共 {count} 处'
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
