import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

import schemaConfig from "./schemaConfig.json" with { type: "json" };
const { SCHEMA_REPO, SCHEMA_REPO_OWNER, SCHEMA_REPO_REF, SCHEMA_REPO_SCHEMAS_SOURCE_DIR, SCHEMA_REPO_TEMP_DIR, SCHEMAS_DEST } = schemaConfig;

export function git(args: string[], cwd: string = process.cwd()) {
	execFileSync("git", args, {
		cwd,
		stdio: "inherit"
	});
}

if(!fs.existsSync(SCHEMA_REPO_TEMP_DIR)) {
	git(["clone", "--branch", SCHEMA_REPO_REF, `https://github.com/${SCHEMA_REPO_OWNER}/${SCHEMA_REPO}`, SCHEMA_REPO_TEMP_DIR]);
} else {
	git(["fetch", "origin", SCHEMA_REPO_REF], SCHEMA_REPO_TEMP_DIR);
	git(["checkout", "-f", "FETCH_HEAD"], SCHEMA_REPO_TEMP_DIR);
}

const schemaFileNames = fs.readdirSync(path.join(SCHEMA_REPO_TEMP_DIR, SCHEMA_REPO_SCHEMAS_SOURCE_DIR));
const schemas: string[] = [];
let latestVersion = -Infinity;
schemaFileNames.forEach(schemaFileName => {
	const schema = JSON.parse(fs.readFileSync(path.join(SCHEMA_REPO_TEMP_DIR, SCHEMA_REPO_SCHEMAS_SOURCE_DIR, schemaFileName), "utf-8"));
	schema.version = schema.maxVersionMajor << 24 | schema.maxVersionMinor << 16 | schema.maxVersionPatch << 8 | schema.maxVersionRevision;
	delete schema.maxVersionMajor;
	delete schema.maxVersionMinor;
	delete schema.maxVersionPatch;
	delete schema.maxVersionRevision;
	schemas.push(schema);
	latestVersion = Math.max(latestVersion, schema.version);
});

const outputCode = `import type { UpgradeSchema } from "./upgradeSchema.ts"; export const schemas: UpgradeSchema[] = ${JSON.stringify(schemas)}; export const latestVersion = ${latestVersion};`;
fs.writeFileSync(SCHEMAS_DEST, outputCode);
