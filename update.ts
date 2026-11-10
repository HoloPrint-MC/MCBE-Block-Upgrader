import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const SCHEMA_REPO_URL = "https://github.com/opencollab-incubator/BedrockBlockUpgradeSchema";
const SCHEMA_REPO_REF = "5.4.1+bedrock-1.26.60";
const SCHEMA_REPO_SCHEMAS_SOURCE_DIR = "nbt_upgrade_schema";
const SCHEMA_REPO_TEMP_DIR = "external";
const SCHEMAS_DEST = "src/schemas.ts";

function git(args: string[], cwd: string = process.cwd()) {
	execFileSync("git", args, {
		cwd,
		stdio: "inherit"
	});
}

if(!fs.existsSync(SCHEMA_REPO_TEMP_DIR)) {
	git(["clone", "--branch", SCHEMA_REPO_REF, SCHEMA_REPO_URL, SCHEMA_REPO_TEMP_DIR]);
} else {
	git(["fetch", "origin", SCHEMA_REPO_REF], SCHEMA_REPO_TEMP_DIR);
	git(["checkout", "-f", "FETCH_HEAD"], SCHEMA_REPO_TEMP_DIR);
}

const schemaFileNames = fs.readdirSync(path.join(SCHEMA_REPO_TEMP_DIR, SCHEMA_REPO_SCHEMAS_SOURCE_DIR));
const schemas: string[] = [];
schemaFileNames.forEach(schemaFileName => {
	const schema = JSON.parse(fs.readFileSync(path.join(SCHEMA_REPO_TEMP_DIR, SCHEMA_REPO_SCHEMAS_SOURCE_DIR, schemaFileName), "utf-8"));
	schema.version = schema.maxVersionMajor << 24 | schema.maxVersionMinor << 16 | schema.maxVersionPatch << 8 | schema.maxVersionRevision;
	delete schema.maxVersionMajor;
	delete schema.maxVersionMinor;
	delete schema.maxVersionPatch;
	delete schema.maxVersionRevision;
	schemas.push(schema);
});

const outputCode = `export default ${JSON.stringify(schemas)};`;
fs.writeFileSync(SCHEMAS_DEST, outputCode);
