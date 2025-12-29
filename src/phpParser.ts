import * as vscode from 'vscode';
// 导入外部的PHP内置类列表
import { phpBuiltinClasses } from './phpBuiltinClasses';

export interface UseStatement {
	line: number;
	start: number;
	end: number;
	className: string;
	alias?: string;
}

export interface UnusedButReferencedClass {
	className: string;
	start: number;
	end: number;
	line: number;
}

export class PHPParser {

	public static parseUseStatements(document: vscode.TextDocument): UseStatement[] {
		const text = document.getText();
		const useStatements: UseStatement[] = [];

		// 正则表达式匹配use语句
		// 处理普通use语句和分组use语句
		const useRegex = /\buse\s+([\w\\]+)(?:\s+as\s+([\w]+))?\s*;/g;
		const groupUseRegex = /\buse\s+([\w\\]+)\s*\{\s*([\w\\,\s]+)\s*\}\s*;/g;

		// 匹配普通use语句
		let match: RegExpExecArray | null;
		while ((match = useRegex.exec(text)) !== null) {
			const className = match[1];
			const alias = match[2];
			const line = text.substring(0, match.index).split('\n').length - 1;

			useStatements.push({
				line: line,
				start: match.index,
				end: match.index + match[0].length,
				className: className,
				alias: alias
			});
		}

		// 匹配分组use语句
		while ((match = groupUseRegex.exec(text)) !== null) {
			const namespace = match[1];
			const classListStr = match[2];
			const line = text.substring(0, match.index).split('\n').length - 1;

			// 解析类列表
			const classList = classListStr.split(',').map(c => c.trim()).filter(c => c !== '');
			classList.forEach(className => {
				// 构建完整的类名
				const fullClassName = namespace + '\\' + className;
				// 计算该类在字符串中的位置
				const classStart = match!.index + match![0].indexOf(className);

				useStatements.push({
					line: line,
					start: classStart,
					end: classStart + className.length,
					className: fullClassName
				});
			});
		}

		return useStatements;
	}

	public static getUnusedUseStatements(document: vscode.TextDocument): UseStatement[] {
		const text = document.getText();
		const useStatements = PHPParser.parseUseStatements(document);

		// 收集所有已导入的类和别名
		const importedClasses = new Map<string, UseStatement>();
		const aliases = new Map<string, string>(); // alias -> fullClassName

		useStatements.forEach(useStmt => {
			importedClasses.set(useStmt.className, useStmt);

			// 处理别名
			if (useStmt.alias) {
				aliases.set(useStmt.alias, useStmt.className);
			} else {
				// 如果没有别名，使用类名的最后一部分作为别名
				const parts = useStmt.className.split('\\');
				const simpleName = parts[parts.length - 1];
				if (simpleName !== useStmt.className) { // 避免为根命名空间的类设置别名
					aliases.set(simpleName, useStmt.className);
				}
			}
		});

		// 正则表达式匹配类的使用
		// 匹配new ClassName(), ClassName::method(), extends ClassName, implements ClassName等
		const classUsageRegex = /\b(new|extends|implements|catch|instanceof)\s+([\w\\]+)\b/g;
		// 修改静态调用正则表达式，排除以$开头的变量名
		const staticCallRegex = /\b(?<!\$)([\w\\]+)::/g;

		// 记录所有使用过的类
		const usedClasses = new Set<string>();

		// 匹配类的使用
		let match;
		while ((match = classUsageRegex.exec(text)) !== null) {
			let className = match[2];

			// 检查是否是别名
			if (aliases.has(className)) {
				className = aliases.get(className)!;
			}

			usedClasses.add(className);
		}

		// 匹配静态方法调用
		while ((match = staticCallRegex.exec(text)) !== null) {
			let className = match[1];

			// 检查是否是别名
			if (aliases.has(className)) {
				className = aliases.get(className)!;
			}

			usedClasses.add(className);
		}

		// 筛选出未使用的use语句
		const unusedUseStatements: UseStatement[] = [];
		useStatements.forEach(useStmt => {
			if (!usedClasses.has(useStmt.className)) {
				// 检查是否是PHP内置类或全局命名空间的类
				if (!PHPParser.isBuiltinClass(useStmt.className)) {
					unusedUseStatements.push(useStmt);
				}
			}
		});

		return unusedUseStatements;
	}

	public static getUnusedButReferencedClasses(document: vscode.TextDocument): UnusedButReferencedClass[] {
		const text = document.getText();
		const useStatements = PHPParser.parseUseStatements(document);

		// 收集所有已导入的类和别名
		const importedClasses = new Map<string, UseStatement>();
		const aliases = new Map<string, string>(); // alias -> fullClassName

		useStatements.forEach(useStmt => {
			importedClasses.set(useStmt.className, useStmt);

			// 处理别名
			if (useStmt.alias) {
				aliases.set(useStmt.alias, useStmt.className);
			} else {
				// 如果没有别名，使用类名的最后一部分作为别名
				const parts = useStmt.className.split('\\');
				const simpleName = parts[parts.length - 1];
				if (simpleName !== useStmt.className) { // 避免为根命名空间的类设置别名
					aliases.set(simpleName, useStmt.className);
				}
			}
		});

		// 正则表达式匹配类的使用
		// 匹配new ClassName(), ClassName::method(), extends ClassName, implements ClassName等
		const classRegex = /\b(new|extends|implements|catch|instanceof)\s+([\w]+)\b/g;
		// 修改静态调用正则表达式，使用负向后瞻断言排除以$开头的变量名
		const staticCallRegex = /\b(?<!\$)([\w]+)::/g;

		// 记录所有使用过的类
		const usedClasses: UnusedButReferencedClass[] = [];

		// 匹配类的使用
		let match: RegExpExecArray | null;
		while ((match = classRegex.exec(text)) !== null) {
			const className = match[2];
			const line = text.substring(0, match.index).split('\n').length - 1;
			const classStart = match.index + match[0].indexOf(className);
			const classEnd = classStart + className.length;

			// 检查是否是已导入的类或别名
			if (!aliases.has(className)) {
				// 检查是否是PHP内置类
				if (!PHPParser.isBuiltinClass(className)) {
					// 检查是否已经记录过这个位置的类
					const isDuplicate = usedClasses.some(item => 
						item.start === classStart && item.end === classEnd
					);

					if (!isDuplicate) {
						usedClasses.push({
							className: className,
							start: classStart,
							end: classEnd,
							line: line
						});
					}
				}
			}
		}

		// 匹配静态方法调用
		while ((match = staticCallRegex.exec(text)) !== null) {
			const className = match[1];
			const line = text.substring(0, match.index).split('\n').length - 1;

			// 检查是否是已导入的类或别名
			if (!aliases.has(className)) {
				// 检查是否是PHP内置类
				if (!PHPParser.isBuiltinClass(className)) {
					// 检查是否已经记录过这个位置的类
					const isDuplicate = usedClasses.some(item => 
						item.start === match!.index && item.end === match!.index + className.length
					);

					if (!isDuplicate) {
						usedClasses.push({
							className: className,
							start: match!.index,
							end: match!.index + className.length,
							line: line
						});
					}
				}
			}
		}

		return usedClasses;
	}

	private static isBuiltinClass(className: string): boolean {
		// PHP特殊关键字，不需要导入
		const specialKeywords = ['self', 'parent', 'static'];
		if (specialKeywords.includes(className)) {
			return true;
		}
		// 使用外部导入的PHP内置类列表
		return phpBuiltinClasses.includes(className);
	}

	public static getCurrentClassAtPosition(document: vscode.TextDocument, position: vscode.Position): string | null {
		const text = document.getText();
		const offset = document.offsetAt(position);

		// 正则表达式匹配类名（由字母、数字、下划线组成）
		const wordRegex = /([a-zA-Z0-9_]+)/g;
		let match;

		while ((match = wordRegex.exec(text)) !== null) {
			if (match.index <= offset && match.index + match[0].length >= offset) {
				return match[0];
			}
		}

		return null;
	}

	public static parseNamespace(document: vscode.TextDocument): string | null {
		const text = document.getText();
		const namespaceRegex = /\bnamespace\s+([\w\\]+)\s*;/;
		const match = text.match(namespaceRegex);

		if (match) {
			return match[1];
		}

		return null;
	}
}