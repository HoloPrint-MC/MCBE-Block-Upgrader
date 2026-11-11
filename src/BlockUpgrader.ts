// Updates a block from older MCBE versions, using schemas from pmmp/BedrockBlockUpgradeSchema. This code was made with reference to https://github.com/pmmp/PocketMine-MP/blob/5.21.0/src/data/bedrock/block/upgrade/BlockStateUpgrader.php and https://github.com/RaphiMC/ViaBedrock/blob/main/src/main/java/net/raphimc/viabedrock/api/chunk/blockstate/JsonBlockStateUpgradeSchema.java.

import {
	latestVersion,
	schemas
} from "./schemas.js";
import type {
	TypedBlockStateProperty,
	UpgradeSchema,
	UpgradeSchemaFlattenRule
} from "./upgradeSchema.ts";

export type Block = {
	/** The block's ID */
	name: string;
	/** Block states */
	states: Record<string, number | string>;
	version: number;
};

/** Checks if a block needs updating to the latest Minecraft version. */
export function blockNeedsUpdating(block: Block): boolean {
	return block.version <= latestVersion;
}
/**
 * Upgrades a block from older Minecraft versions to the latest Minecraft version.
 * @returns Whether or not the block was updated. (The version number will always be updated.)
 */
export function update(block: Block): boolean {
	if(!blockNeedsUpdating(block)) {
		return false;
	}
	let updated = false;
	const schemaToStartFrom = schemas.findIndex(schema => block.version <= schema.version);
	for(let i = schemaToStartFrom; i < schemas.length; i++) {
		if(applyUpdateSchema(schemas[i], block)) {
			updated = true;
		}
	}
	block.version = latestVersion;
	return updated;
}
/** Expands the block version number found in structure NBT into an array. */
export function parseBlockVersion(blockVersion: number): number[] {
	return blockVersion.toString(16).padStart(8, "0").match(/.{2}/g)!.map(x => parseInt(x, 16));
}

/**
 * Applies a schema to a block.
 * @returns Whether or not the block changed between versions. (The version number will always be updated, unless it encountered an error.)
 */
function applyUpdateSchema(schema: UpgradeSchema, block: Block): boolean {
	if(block.version > schema.version) {
		return false;
	}
	if(block.name in (schema.flattenedProperties ?? {}) && block.name in (schema.renamedIds ?? {})) {
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
				const blockStateValue = readBlockStateProperty(blockStateValueProperty);
				if(blockStateValue != block.states[blockStateName]) {
					return;
				}
			}
		}
		if("newName" in remappedState) {
			block.name = remappedState.newName!;
		} else {
			applyFlattenedProperty(remappedState.newFlattenedName!, block);
		}
		const newStates = Object.fromEntries(Object.entries(remappedState.newState ?? {}).map(([blockStateName, blockStateValueProperty]) => [blockStateName, readBlockStateProperty(blockStateValueProperty)]));
		remappedState.copiedState?.forEach(blockStateName => {
			if(blockStateName in block.states) {
				newStates[blockStateName] = block.states[blockStateName];
			}
		});
		block.states = newStates;
		return true; // if states are remapped, there's no need to look at the rest of the schema
	})) {
		block.version = schema.version;
		return true;
	}

	let hasBeenUpdated = false;
	// added properties: add block states and values
	Object.entries(schema.addedProperties?.[block.name] ?? {}).forEach(([blockStateName, blockStateProperty]) => {
		const blockStateValue = readBlockStateProperty(blockStateProperty);
		if(blockStateName in block.states) {
			return;
		}
		block.states[blockStateName] = blockStateValue;
		hasBeenUpdated = true;
	});
	// removed properties: remove block states
	schema.removedProperties?.[block.name]?.forEach(blockStateName => {
		if(!(blockStateName in block.states)) {
			return;
		}
		delete block.states[blockStateName];
		hasBeenUpdated = true;
	});
	// remapped property values: change block state values
	Object.entries(schema.remappedPropertyValues?.[block.name] ?? {}).forEach(([blockStateName, remappingName]) => {
		if(!(blockStateName in block.states)) {
			return;
		}
		const currentBlockStateValue = block.states[blockStateName];
		if(!(remappingName in schema.remappedPropertyValuesIndex!)) {
			return;
		}
		const remappings = schema.remappedPropertyValuesIndex![remappingName];
		const remapping = remappings.find(remapping => currentBlockStateValue == readBlockStateProperty(remapping.old));
		if(remapping == undefined) {
			return;
		}
		block.states[blockStateName] = readBlockStateProperty(remapping.new);
		hasBeenUpdated = true;
	});
	// renamed properties: rename block states
	Object.entries(schema.renamedProperties?.[block.name] ?? {}).forEach(([oldStateName, newStateName]) => {
		if(!(oldStateName in block.states)) {
			return;
		}
		block.states[newStateName] = block.states[oldStateName];
		delete block.states[oldStateName];
		hasBeenUpdated = true;
	});
	// flattened properties: property value determines new block name
	if(block.name in (schema.flattenedProperties ?? {})) {
		if(applyFlattenedProperty(schema.flattenedProperties![block.name], block)) { // this actually does stuff but it returns false if there was an error
			hasBeenUpdated = true;
		}
	}
	// renamed ids: block name changes
	if(block.name in (schema.renamedIds ?? {})) {
		block.name = schema.renamedIds![block.name];
		hasBeenUpdated = true;
	}
	block.version = schema.version;
	return hasBeenUpdated;
}
/**
 * Flattens a block state to find the new block name for a block.
 * @returns If the block state was successfully flattened
 */
function applyFlattenedProperty(flattenRule: UpgradeSchemaFlattenRule, block: Block): boolean {
	const blockStateName = flattenRule.flattenedProperty;
	if(!(blockStateName in block.states)) {
		return false;
	}
	const blockStateValue = block.states[blockStateName];
	const embedValue = flattenRule.flattenedValueRemaps?.[blockStateValue] ?? blockStateValue;
	block.name = flattenRule.prefix + embedValue + flattenRule.suffix;
	delete block.states[blockStateName];
	return true;
}
function readBlockStateProperty(blockStateProperty: TypedBlockStateProperty): number | string {
	return Object.values(blockStateProperty)[0]; // blockStateValue is an object that's either { "string": "value" }, { "int": 0 }, or { "byte": 0 } but it's all the same in JS
}
