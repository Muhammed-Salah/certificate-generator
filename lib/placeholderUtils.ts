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
export function replacePlaceholders(html: string, data: Record<string, string>, recipientName?: string): string {
  if (!html) return '';
  let result = html;
  
  // Get unique placeholders from the template
  const placeholders = extractPlaceholders(html);
  
  placeholders.forEach(placeholder => {
    // 1. Check explicit data
    let value = data[placeholder] !== undefined ? data[placeholder] : data[placeholder.toLowerCase()] !== undefined ? data[placeholder.toLowerCase()] : undefined;
    
    // 2. Automated fallback for {Name}
    if (value === undefined && (placeholder.toLowerCase() === '{name}' || placeholder.toLowerCase() === 'name') && recipientName) {
      value = recipientName;
    }

    // 3. Final fallback to placeholder text itself
    if (value === undefined) value = placeholder;
    
    // Use a global regex to replace all instances of this placeholder
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
    // contenteditable="false" makes the token atomic
    return `<span class="placeholder-token" contenteditable="false" style="color: #3b82f6; user-select: all;">${match}</span>`;
  });
}

/**
 * Removes the styling spans added by highlightPlaceholders.
 * Use this before saving HTML to the database.
 */
export function stripPlaceholderHighlight(html: string): string {
  if (!html) return '';
  // Match any span with class="placeholder-token" and keep only its inner content
  return html.replace(/<span class="placeholder-token"[^>]*>(.*?)<\/span>/g, '$1');
}

/**
 * Normalizes an object's keys based on branding rules:
 * 1. Skips "Name" or "{Name}" to avoid duplication with 'recipient_name'.
 * 2. Description-based tokens get {brackets}.
 * 3. Additional fixed-placement fields (provided in cleanLabels) stay bracket-free.
 */
export function normalizePlaceholderData(data: Record<string, any>, cleanLabels: string[] = []): Record<string, string> {
  const normalized: Record<string, string> = {};
  const lowerClean = cleanLabels.map(l => l.toLowerCase());

  Object.entries(data).forEach(([key, value]) => {
    const lowerKey = key.toLowerCase();
    
    // 1. Skip recipient name duplicates
    if (lowerKey === 'name' || lowerKey === '{name}') return;

    // 2. Check if it's one of the 'clean' labels (Additional Fields)
    const cleanMatchIndex = lowerClean.indexOf(lowerKey.replace(/[{}]/g, ''));
    
    if (cleanMatchIndex !== -1) {
       // Keep it bracket-free
       normalized[cleanLabels[cleanMatchIndex]] = String(value || '');
    } else {
       // It's a description token placeholder -> ensure brackets
       const freshKey = key.startsWith('{') && key.endsWith('}') ? key : `{${key}}`;
       normalized[freshKey] = String(value || '');
    }
  });
  return normalized;
}
