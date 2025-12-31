import * as vscode from 'vscode';
import { phpBuiltinClasses } from './phpBuiltinClasses';

export interface UseStatement {
	line: number;
	start: number;
	end: number;
	className: string;
	alias?: string;
}

export class PHPParser {

	public static parseUseStatements(document: vscode.TextDocument): UseStatement[] {
		const text = document.getText();
		const useStatements: UseStatement[] = [];

		const useRegex = /\buse\s+([\w\\]+)(?:\s+as\s+([\w]+))?\s*;/g;
		const groupUseRegex = /\buse\s+([\w\\]+)\s*\{\s*([\w\\,\s]+)\s*\}\s*;/g;

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

		while ((match = groupUseRegex.exec(text)) !== null) {
			const namespace = match[1];
			const classListStr = match[2];
			const line = text.substring(0, match.index).split('\n').length - 1;

			const classList = classListStr.split(',').map(c => c.trim()).filter(c => c !== '');
			classList.forEach(className => {
				const fullClassName = namespace + '\\' + className;
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

		const importedClasses = new Map<string, UseStatement>();
		const aliases = new Map<string, string>();

		useStatements.forEach(useStmt => {
			importedClasses.set(useStmt.className, useStmt);

			if (useStmt.alias) {
				aliases.set(useStmt.alias, useStmt.className);
			} else {
				const parts = useStmt.className.split('\\');
				const simpleName = parts[parts.length - 1];
				if (simpleName !== useStmt.className) {
					aliases.set(simpleName, useStmt.className);
				}
			}
		});

		const classUsageRegex = /\b(new|extends|implements|catch|instanceof)\s+([\w\\]+)\b/g;
		const staticCallRegex = /\b(?<!\$)([\w\\]+)::/g;

		const usedClasses = new Set<string>();

		let match;
		while ((match = classUsageRegex.exec(text)) !== null) {
			let className = match[2];

			if (aliases.has(className)) {
				className = aliases.get(className)!;
			}

			usedClasses.add(className);
		}

		while ((match = staticCallRegex.exec(text)) !== null) {
			let className = match[1];

			if (aliases.has(className)) {
				className = aliases.get(className)!;
			}

			usedClasses.add(className);
		}

		const unusedUseStatements: UseStatement[] = [];
		useStatements.forEach(useStmt => {
			if (!usedClasses.has(useStmt.className)) {
				if (!PHPParser.isBuiltinClass(useStmt.className)) {
					unusedUseStatements.push(useStmt);
				}
			}
		});

		return unusedUseStatements;
	}

	private static isBuiltinClass(className: string): boolean {
		const specialKeywords = ['self', 'parent', 'static'];
		if (specialKeywords.includes(className)) {
			return true;
		}
		return phpBuiltinClasses.includes(className);
	}

	public static getCurrentClassAtPosition(document: vscode.TextDocument, position: vscode.Position): string | null {
		const text = document.getText();
		const offset = document.offsetAt(position);

		const wordRegex = /([a-zA-Z0-9_]+)/g;
		let match;

		while ((match = wordRegex.exec(text)) !== null) {
			if (match.index <= offset && match.index + match[0].length >= offset) {
				return match[0];
			}
		}

		return null;
	}
}