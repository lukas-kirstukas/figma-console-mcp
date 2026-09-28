import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import type { McpServer, RegisteredTool } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";
import { ASTRA_RUNTIME, KIT_SYNC_CODE } from "./astra-runtime.js";
import type { IFigmaConnector } from "./core/figma-connector.js";
import { createChildLogger } from "./core/logger.js";

const logger = createChildLogger({ component: "astra" });

type Asset = { b64?: string; svg?: string };
type Export = { name: string; fmt?: string; ext: string; scale?: number; outline?: boolean; b64: string };

const BUILD_DESCRIPTION = `Build or change Figma frames from a short script of helper verbs. Keys, fonts and imports resolve for you: write no await and no return.
page(name,props,kids) top-level frame, rebuilt in place; frame(props,kids); inst(name,overrides,props) kit component, overrides by property or variant name; text(str,style,props) style = kit text style or 'Family 16 Bold'; img(asset,props); svg(asset,props); clone(src,name,swaps) copies a page and swaps content; edit(name,swaps); add(target,kids) appends kids to an existing frame; del(name) deletes a node once the build succeeds; exp(name,'png@4.17'|'jpg'|'pdf'|'svg'|'svg outline') writes a file.
props: 'v|h wrap g8 p16 px py pt pr pb pl m mx my w390 h844 fill fillv hug start|center|end|between mid|cend|base r12 o50 x y abs clip bg:<var|style|#hex> c:<color> stroke:<color> sw1 fx:<effect> sh1-sh5[:#hex] noise[:0.1] lh24 dpi300 #Name'; sizes take mm, pt or in.
swaps: {nodeName: 'text' | {prop: value} | 'props' | img(asset)}; '.' is the root.
Returns {ids, warn, files}; an unknown name comes back in warn with the nearest match. A failure keeps nothing.`;

const KIT_SYNC_DESCRIPTION =
	"Write the component, style and variable keys of the open Figma file to <FIGMA_KITS_DIR>/<kit>/ds-keys.json. Run once with the design-system file open, and again after it changes.";

export function kitsDir(env: NodeJS.ProcessEnv = process.env): string {
	return env.FIGMA_KITS_DIR || join(homedir(), "Documents", "figma-console-mcp", "kits");
}

function toScriptJson(value: unknown): string {
	return JSON.stringify(value).replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");
}

export function assembleBuild(
	ds: object | null,
	code: string,
	assets: Record<string, Asset>,
	opts: { resolveMs: number; totalMs: number; look: boolean | string | null },
): string {
	return [
		`const __A=(${ASTRA_RUNTIME})(figma,${toScriptJson(ds)},${toScriptJson(assets)},${toScriptJson(opts)});`,
		"const {page,frame,inst,text,img,svg,clone,edit,add,del,exp}=__A.verbs;",
		"await (async()=>{",
		code,
		"})();",
		"return await __A.run();",
	].join("\n");
}

export function readAssets(names: string[], baseDir: string): { assets: Record<string, Asset>; warn: string[] } {
	const assets: Record<string, Asset> = {};
	const warn: string[] = [];
	for (const name of names) {
		const path = isAbsolute(name) ? name : join(baseDir, name);
		if (!existsSync(path)) {
			warn.push(`asset '${name}' not found at ${path}`);
			continue;
		}
		assets[name] = name.toLowerCase().endsWith(".svg")
			? { svg: readFileSync(path, "utf8") }
			: { b64: readFileSync(path).toString("base64") };
	}
	return { assets, warn };
}

export function writeExports(exports: Export[], dir: string): string[] {
	mkdirSync(dir, { recursive: true });
	return exports.map((e) => {
		const scale = e.scale && e.scale !== 1 ? `@${e.scale}x` : "";
		const outline = e.outline ? ".outline" : "";
		const path = resolve(dir, `${e.name.replace(/[^A-Za-z0-9._-]/g, "-")}${scale}${outline}.${e.ext}`);
		writeFileSync(path, Buffer.from(e.b64, "base64"));
		return path;
	});
}

export function applyToolAllowlist(server: McpServer, list: string | undefined): string[] {
	if (!list || !list.trim()) return [];
	const names = list.split(/[\s,]+/).filter(Boolean);
	const tools = (server as unknown as { _registeredTools: Record<string, RegisteredTool> })._registeredTools;
	for (const [name, tool] of Object.entries(tools)) {
		if (!names.includes(name)) tool.disable();
	}
	const unknown = names.filter((name) => !(name in tools));
	if (unknown.length) logger.warn({ unknown }, "FIGMA_TOOLS names no registered tool");
	return unknown;
}

function errorResult(error: string, warn: string[] = []) {
	return {
		content: [{ type: "text" as const, text: JSON.stringify(warn.length ? { error, warn } : { error }) }],
		isError: true,
	};
}

function messageOf(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

function kitNameError(kit: string): string | null {
	return /^[A-Za-z0-9._-]+$/.test(kit) && kit !== "." && kit !== ".." ? null : `invalid kit name '${kit}'`;
}

function countOf(value: unknown): number {
	if (Array.isArray(value)) return value.length;
	if (value && typeof value === "object") return Object.keys(value).length;
	return 0;
}

export function registerAstraTools(server: McpServer, getConnector: () => Promise<IFigmaConnector>): void {
	server.tool(
		"figma_build",
		BUILD_DESCRIPTION,
		{
			kit: z.string().optional().describe("Kit folder in FIGMA_KITS_DIR; omit for a file with no design system"),
			code: z.string().describe("The helper-verb script"),
			assets: z.array(z.string()).optional().describe("Files img() and svg() read, relative to the kit folder or absolute"),
			look: z.union([z.boolean(), z.string()]).optional().describe("true, or a node name: also return a PNG of it at scale 1"),
		},
		async ({ kit, code, assets, look }) => {
			let ds: object | null = null;
			if (kit !== undefined) {
				const invalid = kitNameError(kit);
				if (invalid) return errorResult(invalid);
				const keysPath = join(kitsDir(), kit, "ds-keys.json");
				if (!existsSync(keysPath)) {
					return errorResult(`kit '${kit}' has no ds-keys.json at ${keysPath}; run figma_kit_sync`);
				}
				try {
					ds = JSON.parse(readFileSync(keysPath, "utf8"));
				} catch (error) {
					return errorResult(messageOf(error));
				}
			}
			const baseDir = kit ? join(kitsDir(), kit) : kitsDir();
			const read = readAssets(assets ?? [], baseDir);

			let connector: IFigmaConnector;
			try {
				connector = await getConnector();
			} catch (error) {
				return errorResult(`Figma bridge not connected: ${messageOf(error)}`, read.warn);
			}

			let res: { success?: boolean; result?: any; error?: string } | undefined;
			try {
				res = await connector.executeCodeViaUI(
					assembleBuild(ds, code, read.assets, { resolveMs: 20000, totalMs: 27000, look: look ?? null }),
					30000,
				);
			} catch (error) {
				return errorResult(`figma_build failed: ${messageOf(error)}`, read.warn);
			}
			if (!res || !res.success) return errorResult(res?.error || "figma_build failed", read.warn);

			const out = res.result || {};
			const files = writeExports(out.exports || [], join(baseDir, "exports"));
			const warn = [...read.warn, ...(out.warn || [])];
			const content: Array<{ type: "text"; text: string } | { type: "image"; data: string; mimeType: string }> = [
				{
					type: "text",
					text: JSON.stringify({
						ids: out.ids || {},
						...(warn.length ? { warn } : {}),
						...(files.length ? { files } : {}),
					}),
				},
			];
			if (out.look) content.push({ type: "image", data: out.look, mimeType: "image/png" });
			logger.info({ kit, files: files.length, warn: warn.length }, "figma_build done");
			return { content };
		},
	);

	server.tool(
		"figma_kit_sync",
		KIT_SYNC_DESCRIPTION,
		{
			kit: z.string().describe("Kit folder name"),
		},
		async ({ kit }) => {
			const invalid = kitNameError(kit);
			if (invalid) return errorResult(invalid);

			let connector: IFigmaConnector;
			try {
				connector = await getConnector();
			} catch (error) {
				return errorResult(`Figma bridge not connected: ${messageOf(error)}`);
			}

			let res: { success?: boolean; result?: any; error?: string } | undefined;
			try {
				res = await connector.executeCodeViaUI(KIT_SYNC_CODE, 30000);
			} catch (error) {
				return errorResult(`figma_kit_sync failed: ${messageOf(error)}`);
			}
			if (!res || !res.success) return errorResult(res?.error || "figma_kit_sync failed");

			const result = res.result || {};
			const dir = join(kitsDir(), kit);
			mkdirSync(dir, { recursive: true });
			const path = join(dir, "ds-keys.json");
			writeFileSync(path, JSON.stringify(result, null, 1));
			logger.info({ kit, path }, "figma_kit_sync done");
			return {
				content: [
					{
						type: "text" as const,
						text: JSON.stringify({
							kit,
							file: result.file,
							path,
							components: countOf(result.components),
							styles: countOf(result.styles),
							variables: countOf(result.variables),
							...(countOf(result.dupes) ? { dupes: result.dupes } : {}),
						}),
					},
				],
			};
		},
	);
}
