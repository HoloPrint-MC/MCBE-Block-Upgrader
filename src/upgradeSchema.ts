export type TypedBlockStateProperty = {
	/** An integer property. */
	int?: number;
	/** A string property. */
	string?: string;
	/** A byte property. */
	byte?: number;
};
export type UpgradeSchemaFlattenRule = {
	/** The prefix for the flattened property. */
	prefix: string;
	/** The name of the flattened property. */
	flattenedProperty: string;
	/** The type of the flattened property. */
	flattenedPropertyType?: "int" | "string" | "byte";
	/** The suffix for the flattened property. */
	suffix: string;
	/** A mapping of flattened values. */
	flattenedValueRemaps?: Record<string, string>;
};
export type UpgradeSchemaRemappedState = {
	/** The property values before the remapping. */
	oldState: Record<string, TypedBlockStateProperty> | null;
	/** An optional new name for the block. */
	newName?: string;
	/** An optional flattened property rule providing a new name. */
	newFlattenedName?: UpgradeSchemaFlattenRule;
	/** The new property values after the remapping. */
	newState: Record<string, TypedBlockStateProperty> | null;
	/** Optional list of property names to copy from the old state. */
	copiedState?: string[];
};
export type UpgradeSchema = {
	/** Packed version number: major, minor, patch, revision */
	version: number;
	/** Mapping of renamed IDs. */
	renamedIds?: Record<string, string>;
	/** Mapping of added properties. */
	addedProperties?: Record<string, Record<string, TypedBlockStateProperty>>;
	/** Mapping of renamed properties. */
	renamedProperties?: Record<string, Record<string, string>>;
	/** Mapping of removed properties. */
	removedProperties?: Record<string, string[]>;
	/** Mapping of remapped property values. */
	remappedPropertyValues?: Record<string, Record<string, string>>;
	/** Index of remapped property values. */
	remappedPropertyValuesIndex?: Record<string, {
		old: TypedBlockStateProperty;
		new: TypedBlockStateProperty;
	}[]>;
	/** Mapping of flattened properties. */
	flattenedProperties?: Record<string, UpgradeSchemaFlattenRule>;
	/** Mapping of remapped states. */
	remappedStates?: Record<string, UpgradeSchemaRemappedState[]>;
};