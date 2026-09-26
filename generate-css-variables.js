/**
 * Design Tokens to CSS Variables Converter
 *
 * This script reads a design tokens JSON file (e.g., from Figma Tokens / Style Dictionary)
 * and converts the token information into a structured CSS file with CSS variables.
 *
 * It specifically handles the color system hierarchy:
 * 1. Primitive Colors: Foundational colors that should NOT be used directly in the UI.
 *    They act as the raw palette for the design system.
 * 2. Color Roles: Semantic colors that are intended to be applied directly to UI components.
 *    These reference the primitive colors.
 * 3. Color Roles Dark: the dark appearance. Each entry must match a key in Color Roles and
 *    is emitted under the SAME --color-roles-* name inside dark-scheme selectors, so
 *    components keep using roles and never reference a dark token directly.
 * 4. Other Tokens: such as spacing, typography, and effects (shadows).
 *
 * Outputs:
 *   design-tokens.css        CSS variables (light in :root, dark in scheme selectors)
 *   design-tokens.theme.json Resolved literal colours for places that cannot read CSS
 *                            variables, such as <meta name="theme-color">
 *
 * Usage:
 *   node generate-css-variables.js
 */

const fs = require('fs');
const path = require('path');

// File paths
const TOKENS_FILE = path.join(__dirname, 'design-tokens.tokens.json');
const OUTPUT_FILE = path.join(__dirname, 'design-tokens.css');
const THEME_OUTPUT_FILE = path.join(__dirname, 'design-tokens.theme.json');

const LIGHT_ROLES_CATEGORY = 'color roles';
const DARK_ROLES_CATEGORY = 'color roles dark';

/**
 * Sanitizes a string to be used as a CSS variable name.
 * Converts spaces and dots to hyphens, and removes invalid characters.
 * @param {string} str - The string to sanitize.
 * @returns {string} The sanitized CSS variable name (without the -- prefix).
 */
function sanitizeName(str) {
  return str
    .toLowerCase()
    .replace(/[\.\s_]+/g, '-') // Replace dots, spaces, and underscores with hyphens
    .replace(/[^\w-]/g, ''); // Remove any remaining invalid CSS characters
}

/**
 * Parses a token value and handles specific formatting based on the token type.
 * Also resolves references (aliases) to other tokens.
 *
 * @param {any} token - The token object containing a 'value' and 'type'.
 * @returns {string} The parsed CSS value.
 */
function parseTokenValue(token) {
  let value = token.value;

  // Handle alias references like "{primitive colors.key colors group.primary key color}"
  // We convert these into standard CSS var() references.
  if (typeof value === 'string' && value.includes('{')) {
    value = value.replace(/\{([^}]+)\}/g, (match, pathInsideBraces) => {
      // The path inside braces might be something like "primitive colors.key colors group.primary"
      // We sanitize it exactly like we sanitize the generated keys.
      const sanitizedRef = sanitizeName(pathInsideBraces);
      return `var(--${sanitizedRef})`;
    });
  }

  // Handle specific token types that need formatting
  if (token.type === 'dimension' && typeof value === 'number') {
    return `${value}px`;
  }

  if (token.type === 'custom-shadow' && typeof value === 'object') {
    // Figma tokens custom-shadow format
    const { offsetX, offsetY, radius, spread, color, shadowType } = value;
    const inset = shadowType === 'innerShadow' ? 'inset ' : '';
    return `${inset}${offsetX}px ${offsetY}px ${radius}px ${spread}px ${color}`;
  }

  return value;
}

/**
 * Recursively flattens the nested tokens object into a single-level object
 * of CSS variable key-value pairs.
 *
 * @param {object} obj - The current level of the tokens JSON.
 * @param {string[]} pathArr - The array tracking the path keys to form the variable name.
 * @param {object} result - The accumulator for the flattened tokens.
 * @returns {object} The flattened tokens mapping.
 */
function flattenTokens(obj, pathArr = [], result = {}) {
  for (const key in obj) {
    if (obj.hasOwnProperty(key)) {
      const current = obj[key];
      const newPath = [...pathArr, key];

      // If the object has a 'value' property, it's a token
      if (current !== null && typeof current === 'object' && 'value' in current) {
        const cssVarName = sanitizeName(newPath.join('-'));
        result[cssVarName] = {
          value: parseTokenValue(current),
          rawValue: current.value,
          originalPath: newPath,
          description: current.description || '',
        };
      }
      // If it's a nested object (but not a token itself), recurse deeper
      else if (current !== null && typeof current === 'object') {
        flattenTokens(current, newPath, result);
      }
    }
  }
  return result;
}

/**
 * Follows alias references down to a literal colour, e.g.
 * "{primitive colors.neutral color palette.neutral99}" -> "#f9f9fa".
 * An opaque 8-digit hex (alpha ff) is shortened to 6 digits.
 */
function resolveColor(rawValue, flattenedTokens, depth = 0) {
  if (depth > 10) {
    throw new Error(`Alias chain too deep while resolving ${rawValue}`);
  }
  const alias = typeof rawValue === 'string' ? rawValue.match(/^\{([^}]+)\}$/) : null;
  if (!alias) {
    if (typeof rawValue === 'string' && /^#[0-9a-f]{8}$/i.test(rawValue) && /ff$/i.test(rawValue)) {
      return rawValue.slice(0, 7).toLowerCase();
    }
    return rawValue;
  }
  const target = flattenedTokens[sanitizeName(alias[1])];
  if (!target) {
    throw new Error(`Unresolvable alias ${rawValue}`);
  }
  return resolveColor(target.rawValue, flattenedTokens, depth + 1);
}

/**
 * Main function to generate the CSS file.
 */
function generateCSS() {
  console.log(`Reading tokens from ${TOKENS_FILE}...`);

  let rawData;
  try {
    rawData = fs.readFileSync(TOKENS_FILE, 'utf8');
  } catch (err) {
    console.error(`Error reading ${TOKENS_FILE}:`, err.message);
    process.exit(1);
  }

  const tokensJson = JSON.parse(rawData);
  const flattenedTokens = flattenTokens(tokensJson);

  // Group tokens for better documentation in the output CSS
  const primitiveColors = [];
  const colorRoles = [];
  const darkColorRoles = [];
  const typography = [];
  const spacing = [];
  const effects = [];
  const otherTokens = [];

  // Categorize tokens based on their original path
  for (const [cssVar, data] of Object.entries(flattenedTokens)) {
    const rootCategory = data.originalPath[0].toLowerCase();

    if (rootCategory === 'primitive colors') {
      primitiveColors.push({ cssVar, ...data });
    } else if (rootCategory === LIGHT_ROLES_CATEGORY) {
      colorRoles.push({ cssVar, ...data });
    } else if (rootCategory === DARK_ROLES_CATEGORY) {
      // Emitted under the light role's name: "color roles dark / primary" -> --color-roles-primary
      const roleVar = sanitizeName([LIGHT_ROLES_CATEGORY, ...data.originalPath.slice(1)].join('-'));
      darkColorRoles.push({ ...data, cssVar: roleVar });
    } else if (rootCategory === 'typography') {
      typography.push({ cssVar, ...data });
    } else if (rootCategory === 'spacing collection') {
      spacing.push({ cssVar, ...data });
    } else if (rootCategory === 'effect') {
      effects.push({ cssVar, ...data });
    } else {
      otherTokens.push({ cssVar, ...data });
    }
  }

  // A dark appearance must cover exactly the colour roles: a role with no dark
  // value would stay light-coloured on a dark page, and a dark value with no
  // role is a typo that silently does nothing. Fail loud instead of emitting it.
  const hasDark = darkColorRoles.length > 0;
  if (hasDark) {
    const lightNames = new Set(colorRoles.map((token) => token.cssVar));
    const darkNames = new Set(darkColorRoles.map((token) => token.cssVar));
    const missingDark = [...lightNames].filter((name) => !darkNames.has(name));
    const orphanDark = [...darkNames].filter((name) => !lightNames.has(name));
    if (missingDark.length > 0 || orphanDark.length > 0) {
      console.error('The dark appearance does not match the colour roles:');
      if (missingDark.length > 0) console.error(`  roles with no dark value: ${missingDark.join(', ')}`);
      if (orphanDark.length > 0) console.error(`  dark values with no matching role: ${orphanDark.join(', ')}`);
      process.exit(1);
    }
  }

  let cssOutput = `/**\n * DESIGN SYSTEM VARIABLES\n * Auto-generated from design-tokens.tokens.json\n */\n\n:root {\n`;
  if (hasDark) {
    cssOutput += `  color-scheme: light;\n\n`;
  }

  // --- Helper to append a section to the CSS output ---
  const appendSection = (title, description, tokensArray) => {
    if (tokensArray.length === 0) return;

    cssOutput += `  /* ==========================================\n`;
    cssOutput += `     ${title}\n`;
    if (description) {
      cssOutput += `     ------------------------------------------\n`;
      // Handle multi-line descriptions
      description.split('\n').forEach((line) => {
        cssOutput += `     ${line}\n`;
      });
    }
    cssOutput += `     ========================================== */\n`;

    tokensArray.forEach((token) => {
      if (token.description) {
        cssOutput += `  /* ${token.description} */\n`;
      }
      cssOutput += `  --${token.cssVar}: ${token.value};\n`;
    });

    cssOutput += `\n`;
  };

  // 1. Primitive Colors (Foundational)
  appendSection(
    'PRIMITIVE COLORS',
    'FOUNDATION ONLY - DO NOT USE DIRECTLY IN UI.\nThese represent the raw color palette. UI components should use Color Roles instead.',
    primitiveColors,
  );

  // 2. Color Roles (Semantic)
  appendSection(
    'COLOR ROLES',
    'SEMANTIC COLORS - USE THESE IN UI.\nThese map to primitive colors and provide semantic meaning (e.g., primary, error, surface).',
    colorRoles,
  );

  // 3. Spacing
  appendSection('SPACING', 'Layout and spacing tokens.', spacing);

  // 4. Typography
  appendSection('TYPOGRAPHY', 'Font sizes, weights, and line heights.', typography);

  // 5. Effects
  appendSection('EFFECTS', 'Shadows, blurs, and other visual effects.', effects);

  // 6. Other Tokens
  appendSection('OTHER TOKENS', '', otherTokens);

  cssOutput += `}\n`;

  // 7. Dark appearance: same role names, dark values, in two selectors.
  if (hasDark) {
    const darkDeclarations = (indent) =>
      darkColorRoles
        .map(
          (token) =>
            `${token.description ? `${indent}/* ${token.description} */\n` : ''}${indent}--${token.cssVar}: ${token.value};\n`,
        )
        .join('');

    cssOutput += `\n/* ==========================================\n`;
    cssOutput += `   DARK APPEARANCE\n`;
    cssOutput += `   ------------------------------------------\n`;
    cssOutput += `   Same --color-roles-* names with dark values. Components never reference\n`;
    cssOutput += `   a dark token; these blocks change what the roles resolve to.\n`;
    cssOutput += `   1. Follows the device (prefers-color-scheme) unless Light is pinned.\n`;
    cssOutput += `   2. data-theme="dark" on <html> pins Dark whatever the device says.\n`;
    cssOutput += `   ========================================== */\n`;
    cssOutput += `@media (prefers-color-scheme: dark) {\n`;
    cssOutput += `  :root:not([data-theme='light']) {\n`;
    cssOutput += `    color-scheme: dark;\n\n`;
    cssOutput += darkDeclarations('    ');
    cssOutput += `  }\n}\n\n`;
    cssOutput += `:root[data-theme='dark'] {\n`;
    cssOutput += `  color-scheme: dark;\n\n`;
    cssOutput += darkDeclarations('  ');
    cssOutput += `}\n`;
  }

  // Write to the output file
  try {
    fs.writeFileSync(OUTPUT_FILE, cssOutput);
    console.log(`✅ Successfully generated CSS variables to ${OUTPUT_FILE}`);
  } catch (err) {
    console.error(`Error writing ${OUTPUT_FILE}:`, err.message);
    process.exitCode = 1;
  }

  // Literal page-ground colours per appearance, for <meta name="theme-color">,
  // which cannot resolve var(). Only produced once a `background` role exists.
  const lightBackground = colorRoles.find((token) => token.cssVar === 'color-roles-background');
  if (lightBackground) {
    const darkBackground = darkColorRoles.find((token) => token.cssVar === 'color-roles-background');
    try {
      const themeColors = {
        light: { background: resolveColor(lightBackground.rawValue, flattenedTokens) },
        dark: { background: resolveColor((darkBackground || lightBackground).rawValue, flattenedTokens) },
      };
      fs.writeFileSync(THEME_OUTPUT_FILE, `${JSON.stringify(themeColors, null, 2)}\n`);
      console.log(`✅ Successfully generated theme colours to ${THEME_OUTPUT_FILE}`);
    } catch (err) {
      console.error(`Error generating ${THEME_OUTPUT_FILE}:`, err.message);
      process.exitCode = 1;
    }
  }
}

generateCSS();
