import * as vscode from 'vscode';
import { phpBuiltinClasses } from './phpBuiltinClasses';

export interface UseStatement {
	line: number;
	start: number;
	end: number;
	className: string;
	alias?: string;
	type?: 'class' | 'function';
}

type AliasInfo = { className: string; type: 'class' | 'function' };

export class PHPParser {

	private static readonly USE_REGEX = /\buse\s+(?:function\s+)?([\w\\]+)(?:\s+as\s+([\w]+))?\s*;/g;
	private static readonly GROUP_USE_REGEX = /\buse\s+(?:function\s+)?([\w\\]+)\s*\{\s*([\w\\,\s]+)\s*\}\s*;/g;
	private static readonly CLASS_REGEXES = [
		/\b(new|extends|implements|catch|instanceof)\s+([\w\\]+)\b/g,
		/\b(?<!\$)([\w\\]+)::/g,
		/\b(?:\(|,\s*)([\w\\]+)(?:\s*[|&]\s*[\w\\]+)*\s*\$/g,
		/:\s*([\w\\]+)(?:\s*[|&]\s*[\w\\]+)*\s*[;{]/g,
		/\b(?:public|private|protected|var|readonly)\s+([\w\\]+)(?:\s*[|&]\s*[\w\\]+)*\s*\$/g
	];
	private static readonly SPECIAL_KEYWORDS = ['self', 'parent', 'static'];

	private static detectUseType(match: string): 'class' | 'function' {
		return match.includes('use function') ? 'function' : 'class';
	}

	private static resolveAlias(name: string, aliases: Map<string, AliasInfo>): string {
		return aliases.get(name)?.className ?? name;
	}

	private static getLineNumber(text: string, index: number): number {
		return text.substring(0, index).split('\n').length - 1;
	}

	private static getSimpleName(className: string): string {
		return className.split('\\').pop() ?? className;
	}

	public static parseUseStatements(document: vscode.TextDocument): UseStatement[] {
		const text = document.getText();
		const useStatements: UseStatement[] = [];

		this.parseSingleUseStatements(text, useStatements);
		this.parseGroupUseStatements(text, useStatements);

		return useStatements;
	}

	private static parseSingleUseStatements(text: string, useStatements: UseStatement[]): void {
		let match: RegExpExecArray | null;
		while ((match = this.USE_REGEX.exec(text)) !== null) {
			const className = match[1];
			const alias = match[2];
			const line = this.getLineNumber(text, match.index);
			const type = this.detectUseType(match[0]);

			useStatements.push({
				line,
				start: match.index,
				end: match.index + match[0].length,
				className,
				alias,
				type
			});
		}
	}

	private static parseGroupUseStatements(text: string, useStatements: UseStatement[]): void {
		let match: RegExpExecArray | null;
		while ((match = this.GROUP_USE_REGEX.exec(text)) !== null) {
			const namespace = match[1];
			const classListStr = match[2];
			const line = this.getLineNumber(text, match.index);
			const type = this.detectUseType(match[0]);

			classListStr.split(',')
				.map(c => c.trim())
				.filter(c => c !== '')
				.forEach(className => {
					const fullClassName = `${namespace}\\${className}`;
					const classStart = match!.index + match![0].indexOf(className);

					useStatements.push({
						line,
						start: classStart,
						end: classStart + className.length,
						className: fullClassName,
						type
					});
				});
		}
	}

	public static getUnusedUseStatements(document: vscode.TextDocument): UseStatement[] {
		const text = document.getText();
		const useStatements = this.parseUseStatements(document);

		const { importedClasses, importedFunctions, aliases } = this.buildImportMaps(useStatements);
		const usedClasses = this.findUsedClasses(text, aliases);
		const usedFunctions = this.findUsedFunctions(text, importedFunctions, aliases);

		return this.filterUnusedUseStatements(useStatements, usedClasses, usedFunctions);
	}

	private static buildImportMaps(useStatements: UseStatement[]): {
		importedClasses: Map<string, UseStatement>;
		importedFunctions: Map<string, UseStatement>;
		aliases: Map<string, AliasInfo>;
	} {
		const importedClasses = new Map<string, UseStatement>();
		const importedFunctions = new Map<string, UseStatement>();
		const aliases = new Map<string, AliasInfo>();

		useStatements.forEach(useStmt => {
			const isFunction = useStmt.type === 'function';
			const targetMap = isFunction ? importedFunctions : importedClasses;
			targetMap.set(useStmt.className, useStmt);

			const simpleName = this.getSimpleName(useStmt.className);
			const aliasOrSimpleName = useStmt.alias ?? simpleName;
			aliases.set(aliasOrSimpleName, {
				className: useStmt.className,
				type: isFunction ? 'function' : 'class'
			});
		});

		return { importedClasses, importedFunctions, aliases };
	}

	private static findUsedClasses(text: string, aliases: Map<string, AliasInfo>): Set<string> {
		const usedClasses = new Set<string>();

		this.CLASS_REGEXES.forEach(regex => {
			let match;
			while ((match = regex.exec(text)) !== null) {
				const className = match[2] ?? match[1];
				const resolvedName = this.resolveAlias(className, aliases);
				usedClasses.add(resolvedName);
			}
		});

		return usedClasses;
	}

	private static findUsedFunctions(
		text: string,
		importedFunctions: Map<string, UseStatement>,
		aliases: Map<string, AliasInfo>
	): Set<string> {
		const usedFunctions = new Set<string>();

		if (importedFunctions.size === 0) {
			return usedFunctions;
		}

		const functionNames = Array.from(importedFunctions.keys()).map(name => this.getSimpleName(name));
		const functionPattern = `\\b(?<!new\\s+|[\\w\\\\]+::)(${functionNames.join('|')})\\s*\\(`;
		const functionRegex = new RegExp(functionPattern, 'g');

		let match;
		while ((match = functionRegex.exec(text)) !== null) {
			const functionName = match[1];
			const aliasInfo = aliases.get(functionName);
			if (aliasInfo?.type === 'function') {
				usedFunctions.add(aliasInfo.className);
			}
		}

		return usedFunctions;
	}

	private static filterUnusedUseStatements(
		useStatements: UseStatement[],
		usedClasses: Set<string>,
		usedFunctions: Set<string>
	): UseStatement[] {
		return useStatements.filter(useStmt => {
			if (useStmt.type === 'function') {
				return !usedFunctions.has(useStmt.className);
			}
			return !usedClasses.has(useStmt.className) && !this.isBuiltinClass(useStmt.className);
		});
	}

	private static isBuiltinClass(className: string): boolean {
		return this.SPECIAL_KEYWORDS.includes(className) || phpBuiltinClasses.includes(className);
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