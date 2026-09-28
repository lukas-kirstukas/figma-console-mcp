import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import {
	applyToolAllowlist,
	assembleBuild,
	kitsDir,
	readAssets,
	registerAstraTools,
	writeExports,
} from "../src/astra";

const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
const OPTS = { resolveMs: 20000, totalMs: 27000, look: null };
const PNG_B64 = Buffer.from([0x89, 0x50, 0x4e, 0x47, 1, 2, 3]).toString("base64");

function tempDir(): string {
	return mkdtempSync(join(tmpdir(), "astra-"));
}

let previousKitsDir: string | undefined;

beforeEach(() => {
	previousKitsDir = process.env.FIGMA_KITS_DIR;
});

afterEach(() => {
	if (previousKitsDir === undefined) delete process.env.FIGMA_KITS_DIR;
	else process.env.FIGMA_KITS_DIR = previousKitsDir;
});

describe("kitsDir", () => {
	it("returns FIGMA_KITS_DIR when set", () => {
		process.env.FIGMA_KITS_DIR = "/tmp/astra-kits";
		expect(kitsDir()).toBe("/tmp/astra-kits");
	});

	it("defaults to Documents/figma-console-mcp/kits", () => {
		delete process.env.FIGMA_KITS_DIR;
		expect(kitsDir().endsWith(join("Documents", "figma-console-mcp", "kits"))).toBe(true);
	});
});

describe("assembleBuild", () => {
	it("holds the design-system JSON", () => {
		expect(assembleBuild({ components: { Button: "k-1" } }, "", {}, OPTS)).toContain('{"components":{"Button":"k-1"}}');
	});

	it("passes null for no kit", () => {
		expect(assembleBuild(null, "", {}, OPTS)).toContain("(figma,null,{},");
	});

	it("places the code between the wrapper lines", () => {
		expect(assembleBuild(null, "page('A','v',[])", {}, OPTS)).toContain("\nawait (async()=>{\npage('A','v',[])\n})();\n");
	});

	it("ends with the run", () => {
		expect(assembleBuild(null, "", {}, OPTS).endsWith("return await __A.run();")).toBe(true);
	});

	it("writes a U+2028 inside a DS string as its escape", () => {
		expect(assembleBuild({ name: "a b" }, "", {}, OPTS)).toContain('"a\\u2028b"');
	});

	it("compiles as an async function body", () => {
		const s = assembleBuild(
			{ name: "a b c" },
			"page('A','v',[text('Hi','Inter 16 Bold')])",
			{ "a.svg": { svg: "<svg/>" } },
			OPTS,
		);
		expect(() => new AsyncFunction("figma", s)).not.toThrow();
	});
});

describe("applyToolAllowlist", () => {
	function serverWithTools(): McpServer {
		const server = new McpServer({ name: "t", version: "0" });
		for (const name of ["a", "b", "c"]) {
			server.tool(name, name, {}, async () => ({ content: [] }));
		}
		return server;
	}

	function enabled(server: McpServer): Record<string, boolean> {
		const tools = (server as any)._registeredTools;
		return Object.fromEntries(Object.keys(tools).map((name) => [name, tools[name].enabled]));
	}

	it("disables every tool outside the list", () => {
		const server = serverWithTools();
		applyToolAllowlist(server, "a, c,zzz");
		expect(enabled(server)).toEqual({ a: true, b: false, c: true });
	});

	it("returns the names no tool carries", () => {
		expect(applyToolAllowlist(serverWithTools(), "a, c,zzz")).toEqual(["zzz"]);
	});

	it.each([undefined, ""])("leaves every tool enabled for %p", (list) => {
		const server = serverWithTools();
		applyToolAllowlist(server, list);
		expect(enabled(server)).toEqual({ a: true, b: true, c: true });
	});

	it.each([undefined, ""])("returns no unknown name for %p", (list) => {
		expect(applyToolAllowlist(serverWithTools(), list)).toEqual([]);
	});
});

describe("readAssets", () => {
	const dir = tempDir();
	writeFileSync(join(dir, "logo.svg"), "<svg>x</svg>");
	writeFileSync(join(dir, "photo.png"), Buffer.from(PNG_B64, "base64"));
	const absolute = join(tempDir(), "far.png");
	writeFileSync(absolute, Buffer.from(PNG_B64, "base64"));

	it("reads an svg as text", () => {
		expect(readAssets(["logo.svg"], dir).assets["logo.svg"]).toEqual({ svg: "<svg>x</svg>" });
	});

	it("reads a png as base64", () => {
		expect(readAssets(["photo.png"], dir).assets["photo.png"]).toEqual({ b64: PNG_B64 });
	});

	it("reads an absolute path as given", () => {
		expect(readAssets([absolute], dir).assets[absolute]).toEqual({ b64: PNG_B64 });
	});

	it("warns on a missing file", () => {
		expect(readAssets(["x"], dir).warn).toEqual([`asset 'x' not found at ${join(dir, "x")}`]);
	});
});

describe("writeExports", () => {
	const dir = join(tempDir(), "exports");
	const files = writeExports(
		[
			{ name: "Hoodie front", ext: "png", scale: 4.17, b64: PNG_B64 },
			{ name: "Ad", ext: "pdf", scale: 1, b64: Buffer.from("%PDF").toString("base64") },
			{ name: "Logo", ext: "svg", outline: true, b64: Buffer.from("<svg/>").toString("base64") },
		],
		dir,
	);

	it("names a scaled png", () => {
		expect(basename(files[0])).toBe("Hoodie-front@4.17x.png");
	});

	it("names a pdf at scale 1 without a suffix", () => {
		expect(basename(files[1])).toBe("Ad.pdf");
	});

	it("names an outlined svg", () => {
		expect(basename(files[2])).toBe("Logo.outline.svg");
	});

	it("writes the decoded bytes", () => {
		expect(readFileSync(files[0]).toString("base64")).toBe(PNG_B64);
	});
});

describe("registerAstraTools", () => {
	let kits: string;

	beforeEach(() => {
		kits = tempDir();
		process.env.FIGMA_KITS_DIR = kits;
	});

	function call(name: string, args: Record<string, unknown>, getConnector: () => Promise<any>): Promise<any> {
		const server = new McpServer({ name: "t", version: "0" });
		registerAstraTools(server, getConnector);
		return (server as any)._registeredTools[name].handler(args, {});
	}

	function body(result: any): any {
		return JSON.parse(result.content[0].text);
	}

	function writeKit(kit: string): void {
		mkdirSync(join(kits, kit), { recursive: true });
		writeFileSync(join(kits, kit, "ds-keys.json"), JSON.stringify({ components: { Button: "k-1" } }));
	}

	function connectorResolving(value: unknown) {
		return { executeCodeViaUI: jest.fn().mockResolvedValue(value) };
	}

	describe("figma_build", () => {
		it("is an error when the bridge is not connected", async () => {
			const result = await call("figma_build", { code: "" }, () => Promise.reject(new Error("no socket")));
			expect(result.isError).toBe(true);
		});

		it("names the disconnected bridge", async () => {
			const result = await call("figma_build", { code: "" }, () => Promise.reject(new Error("no socket")));
			expect(body(result).error).toContain("Figma bridge not connected");
		});

		it("names figma_kit_sync for a kit with no ds-keys.json", async () => {
			const result = await call("figma_build", { kit: "k1", code: "" }, async () => connectorResolving({}));
			expect(body(result).error).toContain("figma_kit_sync");
		});

		it("refuses a path as the kit name", async () => {
			const result = await call("figma_build", { kit: "../x", code: "" }, async () => connectorResolving({}));
			expect(body(result).error).toContain("invalid kit name");
		});

		it("returns a bridge timeout as figma_build failed", async () => {
			writeKit("k1");
			const connector = {
				executeCodeViaUI: jest.fn().mockRejectedValue(new Error("WebSocket command EXECUTE_CODE timed out after 32000ms")),
			};
			const result = await call("figma_build", { kit: "k1", code: "" }, async () => connector);
			expect(body(result).error).toBe("figma_build failed: WebSocket command EXECUTE_CODE timed out after 32000ms");
		});

		it("is an error when the plugin reports a failure", async () => {
			writeKit("k1");
			const connector = connectorResolving({ success: false, error: "Error: build failed, nothing kept: boom" });
			const result = await call("figma_build", { kit: "k1", code: "" }, async () => connector);
			expect(result.isError).toBe(true);
		});

		it("returns the plugin failure text", async () => {
			writeKit("k1");
			const connector = connectorResolving({ success: false, error: "Error: build failed, nothing kept: boom" });
			const result = await call("figma_build", { kit: "k1", code: "" }, async () => connector);
			expect(body(result).error).toBe("Error: build failed, nothing kept: boom");
		});

		describe("a successful build", () => {
			const script = "page('P','v',[])";
			let connector: ReturnType<typeof connectorResolving>;
			let result: any;

			beforeEach(async () => {
				writeKit("k1");
				connector = connectorResolving({
					success: true,
					result: {
						ids: { P: "1:2" },
						warn: [],
						exports: [{ name: "P", fmt: "png", ext: "png", scale: 2, b64: Buffer.from("abc").toString("base64") }],
						look: "aGk=",
					},
				});
				result = await call("figma_build", { kit: "k1", code: script, look: true }, async () => connector);
			});

			it("returns the ids", () => {
				expect(body(result).ids).toEqual({ P: "1:2" });
			});

			it("returns a file that exists", () => {
				expect(existsSync(body(result).files[0])).toBe(true);
			});

			it("omits an empty warn", () => {
				expect("warn" in body(result)).toBe(false);
			});

			it("adds the look as a png image", () => {
				expect(result.content[1]).toMatchObject({ type: "image", mimeType: "image/png" });
			});

			it("sends the script", () => {
				expect(connector.executeCodeViaUI.mock.calls[0][0]).toContain(script);
			});

			it("sends a 30000 ms timeout", () => {
				expect(connector.executeCodeViaUI.mock.calls[0][1]).toBe(30000);
			});
		});
	});

	describe("figma_kit_sync", () => {
		let result: any;

		beforeEach(async () => {
			const connector = connectorResolving({
				success: true,
				result: { file: "DS", components: { A: {} }, styles: {}, variables: { v: {} }, dupes: [] },
			});
			result = await call("figma_kit_sync", { kit: "k1" }, async () => connector);
		});

		it("writes ds-keys.json into the kit folder", () => {
			expect(existsSync(join(kits, "k1", "ds-keys.json"))).toBe(true);
		});

		it("returns the counts", () => {
			expect(body(result)).toMatchObject({ components: 1, styles: 0, variables: 1 });
		});

		it("omits an empty dupes", () => {
			expect("dupes" in body(result)).toBe(false);
		});
	});
});
