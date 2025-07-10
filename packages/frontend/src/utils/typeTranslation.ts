/**
 * Type Translation Utility
 * 
 * This utility provides translation between internal type values and display names.
 * Internal values ('movie', 'series') are preserved for backend/API communication,
 * while display names are translated for the UI layer only.
 */

const TYPE_DISPLAY_MAP = {
  movie: 'Detaylı Filtre (Film) 🔎',
  series: 'Detaylı Filtre (Dizi) 🔎',
} as const;

// Reverse mapping for lookups
const DISPLAY_TYPE_MAP = Object.fromEntries(
  Object.entries(TYPE_DISPLAY_MAP).map(([key, value]) => [value, key])
) as Record<string, keyof typeof TYPE_DISPLAY_MAP>;

/**
 * Translates internal type value to display name
 * @param internalType - The internal type value ('movie', 'series', etc.)
 * @returns The display name or the original value if no translation exists
 */
export function translateTypeToDisplay(internalType: string): string {
  return TYPE_DISPLAY_MAP[internalType as keyof typeof TYPE_DISPLAY_MAP] || internalType;
}

/**
 * Translates display name back to internal type value
 * @param displayName - The display name
 * @returns The internal type value or the original value if no mapping exists
 */
export function translateDisplayToType(displayName: string): string {
  return DISPLAY_TYPE_MAP[displayName] || displayName;
}

/**
 * Maps an array of internal types to their display names
 * @param types - Array of internal type values
 * @returns Array of objects with label (display) and value (internal) properties
 */
export function mapTypesToOptions(types: readonly string[]) {
  return types.map((type) => ({
    label: translateTypeToDisplay(type),
    value: type,
    textValue: translateTypeToDisplay(type),
  }));
}

/**
 * Gets all available type translations
 * @returns Object with internal values as keys and display names as values
 */
export function getTypeTranslations() {
  return { ...TYPE_DISPLAY_MAP };
}