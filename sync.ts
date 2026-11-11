import * as fs from "node:fs";
import { Octokit } from "@octokit/rest";

import data from "./schemaConfig.json" with { type: "json" };
const { SCHEMA_REPO_OWNER, SCHEMA_REPO, SCHEMA_REPO_REF } = data;

const octokit = new Octokit();

const tags = (await octokit.rest.repos.listTags({
	owner: SCHEMA_REPO_OWNER,
	repo: SCHEMA_REPO
})).data.map(tag => tag.name);
const latestTag = tags.sort().reverse()[0];

if(latestTag > SCHEMA_REPO_REF) {
	data.SCHEMA_REPO_REF = latestTag;
	const updatedDataFile = JSON.stringify(data, null, "\t");
	fs.writeFileSync("schemaConfig.json", updatedDataFile);
	
	// this will trigger the updating workflow
	// very hacky
	import("./emitSchemas.ts");
}
