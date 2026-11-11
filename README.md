# MCBE-Block-Upgrader
Library to upgrade Minecraft Bedrock blocks to the latest version.

Powered by the data from [opencollab-incubator/BedrockBlockUpgradeSchema](https://github.com/opencollab-incubator/BedrockBlockUpgradeSchema), formerly under the [pmmp organisation](https://github.com/pmmp).

This implementation is copied and TypeScript-ified from the [original implementation in HoloPrint](https://github.com/SuperLlama88888/holoprint/blob/v1.3.5/src/BlockUpdater.js), except that this implementation bundles all the schemas together rather than fetching them dynamically at runtime. HoloPrint's implementation was largely translated from [PMMP's original implementation](https://github.com/pmmp/PocketMine-MP/blob/5.21.0/src/data/bedrock/block/upgrade/BlockStateUpgrader.php).

[`update.ts`](./update.ts) reads [`schemaConfig.json`](./schemaConfig.json) and emits [`src/schemas.ts`](./src/schemas.ts). [`sync.ts`](./sync.ts) looks at the latest tag from the upstream repo and updates the config file if a newer version is found. Syncing happens once per week automatically.
