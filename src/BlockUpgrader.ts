// Updates a block from older MCBE versions, using schemas from pmmp/BedrockBlockUpgradeSchema. This code was made with reference to https://github.com/pmmp/PocketMine-MP/blob/5.21.0/src/data/bedrock/block/upgrade/BlockStateUpgrader.php and https://github.com/RaphiMC/ViaBedrock/blob/main/src/main/java/net/raphimc/viabedrock/api/chunk/blockstate/JsonBlockStateUpgradeSchema.java.

import type { Block } from "./common.types.ts";
import type { NBTBlock } from "./minecraft.types.ts";
import type {
	BlockUpdateSchema,
	BlockUpdateSchemaFlattenRule,
	BlockUpdateSchemaSkeleton,
	TypedBlockStateProperty
} from "./upgradeSchema.ts";

declare const fetchers: {
	bedrockBlockUpgradeSchema(path: string): Promise<Response>;
};

/** Updates older blocks to the latest MCBE version. */
export default class BlockUpgrader {
	declare static LATEST_VERSION: number;
	readonly #schemaIndex: Record<string, BlockUpdateSchemaSkeleton[]> = {};
	readonly #schemas: Map<string, BlockUpdateSchema> = new Map();

	/**
	 * Checks if a block needs updating to the latest Minecraft version.
	 */
	blockNeedsUpdating(block: NBTBlock): boolean {
		return block.version < BlockUpgrader.LATEST_VERSION;
	}
	/**
	 * Upgrades a block from older Minecraft versions to the latest Minecraft version.
	 * @mutating
	 * @returns Whether or not the block was updated. (The version number will always be updated.)
	 */
	async update(block: NBTBlock): Promise<boolean> {
		const oldBlockStringified = BlockUpgrader.stringifyBlock(block);
		if(Object.keys(this.#schemaIndex).length == 0) {
			const schemaList: BlockUpdateSchemaSkeleton[] = await fetchers.bedrockBlockUpgradeSchema("schema_list.json").then(res => res.json());
			schemaList.forEach(schemaSkeleton => {
				const schemaVersion = this.#getSchemaVersion(schemaSkeleton);
				this.#schemaIndex[schemaVersion] ??= [];
				this.#schemaIndex[schemaVersion].push(schemaSkeleton);
			});
		}
		const schemasToApply: string[] = [];
		Object.entries(this.#schemaIndex).forEach(([version, schemaSkeletons]) => {
			if(block.version > +version || schemaSkeletons.length == 1 && block.version == +version) {
				return;
			}
			schemasToApply.push(...schemaSkeletons.map(schemaSkeleton => schemaSkeleton.filename));
		});
		await Promise.all(schemasToApply.map(async schemaFilename => {
			if(!this.#schemas.has(schemaFilename)) {
				this.#schemas.set(schemaFilename, await fetchers.bedrockBlockUpgradeSchema(`nbt_upgrade_schema/${schemaFilename}`).then(res => res.json()));
			}
		}));
		let updated = false;
		schemasToApply.forEach(schemaFileName => {
			const schema = this.#schemas.get(schemaFileName)!;
			if(this.#applyUpdateSchema(schema, block)) {
				updated = true;
			}
		});
		block.version = BlockUpgrader.LATEST_VERSION;
		if(updated) {
			console.debug(`Updated ${oldBlockStringified} to ${BlockUpgrader.stringifyBlock(block)}`);
		}
		return updated;
	}
	/**
	 * Applies a schema to a block.
	 * @mutating
	 * @returns Whether or not the block changed between versions. (The version number will always be updated, unless it encountered an error.)
	 */
	#applyUpdateSchema(schema: BlockUpdateSchema, block: NBTBlock): boolean {
		const schemaVersion = this.#getSchemaVersion(schema);
		if(block.version > schemaVersion) {
			console.error(`Trying to upgrade block from ${block.version} to ${schemaVersion}!`);
			return false;
		}
		if(block.name in (schema.flattenedProperties ?? {}) && block.name in (schema.renamedIds ?? {})) {
			console.error(`Cannot flatten and rename block ${block.name} at the same time: ${JSON.stringify(schema)}`);
			return false;
		}

		// remap block states: when the values change and, in some cases, the block name
		if(schema.remappedStates?.[block.name]?.some(remappedState => {
			const statesToMatch = remappedState.oldState;
			if(statesToMatch != null) { // if there are states to match, all states in "oldState" must be the same in the current block states
				if(Object.keys(statesToMatch).length > Object.keys(block.states).length) {
					return;
				}
				for(const [blockStateName, blockStateValueProperty] of Object.entries(statesToMatch)) {
					if(!(blockStateName in block.states)) {
						return;
					}
					const blockStateValue = this.#readBlockStateProperty(blockStateValueProperty);
					if(blockStateValue != block.states[blockStateName]) {
						return;
					}
				}
			}
			if("newName" in remappedState) {
				block.name = remappedState.newName;
			} else {
				this.#applyFlattenedProperty(remappedState.newFlattenedName!, block);
			}
			const newStates = Object.fromEntries(Object.entries(remappedState.newState ?? {}).map(([blockStateName, blockStateValueProperty]) => [blockStateName, this.#readBlockStateProperty(blockStateValueProperty)]));
			remappedState.copiedState?.forEach(blockStateName => {
				if(blockStateName in block.states) {
					newStates[blockStateName] = block.states[blockStateName];
				}
			});
			block.states = newStates;
			return true; // if states are remapped, there's no need to look at the rest of the schema
		})) {
			block.version = schemaVersion;
			return true;
		}

		let hasBeenUpdated = false;
		// added properties: add block states and values
		Object.entries(schema.addedProperties?.[block.name] ?? {}).forEach(([blockStateName, blockStateProperty]) => {
			const blockStateValue = this.#readBlockStateProperty(blockStateProperty);
			if(blockStateName in block.states) {
				console.debug(`Cannot add block state ${blockStateName} = ${blockStateValue} because it already exists on block ${BlockUpgrader.stringifyBlock(block)}`);
				return;
			}
			block.states[blockStateName] = blockStateValue;
			hasBeenUpdated = true;
		});
		// removed properties: remove block states
		schema.removedProperties?.[block.name]?.forEach(blockStateName => {
			if(!(blockStateName in block.states)) {
				console.debug(`Cannot delete block state ${blockStateName} because it doesn't exist on block ${BlockUpgrader.stringifyBlock(block)}`);
				return;
			}
			delete block.states[blockStateName];
			hasBeenUpdated = true;
		});
		// remapped property values: change block state values
		Object.entries(schema.remappedPropertyValues?.[block.name] ?? {}).forEach(([blockStateName, remappingName]) => {
			if(!(blockStateName in block.states)) {
				console.debug(`Cannot remap value for block state ${blockStateName} because the state doesn't exist: ${BlockUpgrader.stringifyBlock(block)}`);
				return;
			}
			const currentBlockStateValue = block.states[blockStateName];
			if(!(remappingName in schema.remappedPropertyValuesIndex!)) {
				console.debug(`Block state value remapping ${remappingName} not found in schema!`);
				return;
			}
			const remappings = schema.remappedPropertyValuesIndex![remappingName];
			const remapping = remappings.find(remapping => currentBlockStateValue == this.#readBlockStateProperty(remapping.old));
			if(remapping == undefined) {
				console.debug(`Cannot find block state value ${currentBlockStateValue} in remappings for block state ${blockStateName}: ${JSON.stringify(remappings)}`);
				return;
			}
			block.states[blockStateName] = this.#readBlockStateProperty(remapping.new);
			hasBeenUpdated = true;
		});
		// renamed properties: rename block states
		Object.entries(schema.renamedProperties?.[block.name] ?? {}).forEach(([oldStateName, newStateName]) => {
			if(!(oldStateName in block.states)) {
				console.debug(`Cannot rename block state ${oldStateName} -> ${newStateName} because it doesn't exist on block ${BlockUpgrader.stringifyBlock(block)}`);
				return;
			}
			block.states[newStateName] = block.states[oldStateName];
			delete block.states[oldStateName];
			hasBeenUpdated = true;
		});
		// flattened properties: property value determines new block name
		if(block.name in (schema.flattenedProperties ?? {})) {
			if(this.#applyFlattenedProperty(schema.flattenedProperties![block.name], block)) { // this actually does stuff but it returns false if there was an error
				hasBeenUpdated = true;
			}
		}
		// renamed ids: block name changes
		if(block.name in (schema.renamedIds ?? {})) {
			block.name = schema.renamedIds![block.name];
			hasBeenUpdated = true;
		}
		block.version = schemaVersion;
		return hasBeenUpdated;
	}
	/**
	 * Flattens a block state to find the new block name for a block.
	 * @mutating
	 * @returns If the block state was successfully flattened
	 */
	#applyFlattenedProperty(flattenRule: BlockUpdateSchemaFlattenRule, block: NBTBlock): boolean {
		const blockStateName = flattenRule.flattenedProperty;
		if(!(blockStateName in block.states)) {
			console.debug(`Cannot flatten block state ${blockStateName} because it doesn't exist on block ${BlockUpgrader.stringifyBlock(block)}, ${JSON.stringify(flattenRule)}`);
			return false;
		}
		const blockStateValue = block.states[blockStateName];
		const embedValue = flattenRule.flattenedValueRemaps?.[blockStateValue] ?? blockStateValue;
		block.name = flattenRule.prefix + embedValue + flattenRule.suffix;
		delete block.states[blockStateName];
		return true;
	}
	#readBlockStateProperty(blockStateProperty: TypedBlockStateProperty): number | string {
		return Object.values(blockStateProperty)[0]; // blockStateValue is an object that's either { "string": "value" }, { "int": 0 }, or { "byte": 0 } but it's all the same in JS
	}
	#getSchemaVersion(schema: BlockUpdateSchema | BlockUpdateSchemaSkeleton): number {
		return (schema.maxVersionMajor << 24) | (schema.maxVersionMinor << 16) | (schema.maxVersionPatch << 8) | schema.maxVersionRevision;
	}
	/**
	 * "Stringifies" a block with its name and states.
	 */
	static stringifyBlock(block: NBTBlock | Block, includeVersion: boolean = true): string {
		const blockStates = Object.entries(block.states).map(([name, value]) => `${name}=${value}`).join(",");
		let res = block.name.replace(/^minecraft:/, "");
		if(blockStates.length) {
			res += `[${blockStates}]`;
		}
		if(includeVersion && "version" in block) {
			res += `@${BlockUpgrader.parseBlockVersion(block.version).join(".")}`;
		}
		return res;
	}
	/**
	 * Expands the block version number found in structure NBT into an array.
	 */
	static parseBlockVersion(blockVersion: number): number[] {
		return blockVersion.toString(16).padStart(8, "0").match(/.{2}/g)!.map(x => parseInt(x, 16));
	}
}
