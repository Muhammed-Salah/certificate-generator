/**
 * Utility functions for handling dynamic placeholders in the format {field_name}.
 */

/**
 * Extracts all unique placeholders from an HTML string.
 * Example: "Hello {name}, welcome to {course}!" -> ["{name}", "{course}"]
 */
export function extractPlaceholders(html: string): string[] {
  if (!html) return [];
  const regex = /\{[a-zA-Z0-9_-]+\}/g;
  const matches = html.match(regex) || [];
  // Return unique matches
  return Array.from(new Set(matches));
}

/**
 * Replaces all placeholders in an HTML string with their corresponding values.
 * @param html The HTML content with placeholders.
 * @param data An object where keys are placeholders (e.g., "{course}") and values are the replacements.
 */
export function replacePlaceholders(html: string, data: Record<string, string>): string {
  if (!html) return '';
  let result = html;
  
  // Get unique placeholders from the template
  const placeholders = extractPlaceholders(html);
  
  placeholders.forEach(placeholder => {
    // If we have a value in our data object, replace it. Otherwise, leave it or mask it?
    // User requirement: "Missing values → leave placeholder or fallback text"
    const value = data[placeholder] !== undefined ? data[placeholder] : data[placeholder.toLowerCase()] !== undefined ? data[placeholder.toLowerCase()] : placeholder;
    
    // Use a global regex to replace all instances of this placeholder
    // We escape the curly braces for the regex
    const escapedPlaceholder = placeholder.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escapedPlaceholder, 'g'), value);
  });
  
  return result;
}

/**
 * Wraps placeholders in a styled span for visual highlighting in editors.
 */
export function highlightPlaceholders(html: string): string {
  if (!html) return '';
  // Match ONLY complete tokens {field}
  const regex = /\{[a-zA-Z0-9_-]+\}/g;
  return html.replace(regex, (match) => {
    // Only force color, allow font-weight/italic to be inherited from user formatting tags
    return `<span class="placeholder-token" style="color: #3b82f6;">${match}</span>`;
  });
}

/**
 * Removes the styling spans added by highlightPlaceholders.
 * Use this before saving HTML to the database.
 */
export function stripPlaceholderHighlight(html: string): string {
  if (!html) return '';
  // Match any span with class="placeholder-token" and keep only its inner content
  // This allows us to revert color even when a bracket is deleted midway.
  return html.replace(/<span class="placeholder-token"[^>]*>(.*?)<\/span>/g, '$1');
}

/**
 * Normalizes an object's keys to ensure they are wrapped in curly braces.
 * Example: { name: "John" } -> { "{name}": "John" }
 */
export function normalizePlaceholderData(data: Record<string, any>): Record<string, string> {
  const normalized: Record<string, string> = {};
  Object.entries(data).forEach(([key, value]) => {
    const freshKey = key.startsWith('{') && key.endsWith('}') ? key : `{${key}}`;
    normalized[freshKey] = String(value || '');
  });
  return normalized;
}
