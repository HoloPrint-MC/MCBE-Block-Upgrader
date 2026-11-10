import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const SCHEMA_REPO_URL = "https://github.com/opencollab-incubator/BedrockBlockUpgradeSchema";
const SCHEMA_REPO_REF = "5.4.1+bedrock-1.26.60";
const SCHEMA_REPO_SCHEMAS_SOURCE_DIR = "nbt_upgrade_schema";
const SCHEMA_REPO_TEMP_DIR = "external";
const SCHEMA_REPO_DEST_DIR = "src/schemas.ts";

function git(args: string[], cwd: string = process.cwd()) {
	execFileSync("git", args, {
		cwd,
		stdio: "inherit"
	});
}

if(!existsSync(SCHEMA_REPO_TEMP_DIR)) {
	git(["clone", "--branch", SCHEMA_REPO_REF, SCHEMA_REPO_URL, SCHEMA_REPO_TEMP_DIR]);
} else {
	git(["fetch", "origin", SCHEMA_REPO_REF], SCHEMA_REPO_TEMP_DIR);
	git(["checkout", "-f", "FETCH_HEAD"], SCHEMA_REPO_TEMP_DIR);
}


