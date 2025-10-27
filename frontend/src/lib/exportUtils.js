// Utility functions to export series data into various formats.
//
// The dashboard already provides CSV exports via the `toCsv` and
// `download` helpers in stats.js.  This module complements those
// helpers by providing JSON export and report generation hooks.

/**
 * Convert an array of timeseries points to a JSON string.  Each
 * point should have a `ts` property (timestamp in milliseconds)
 * and a `value` property.  Additional properties are preserved.
 * The resulting JSON is formatted with two spaces for readability.
 *
 * @param {Array<Object>} points
 * @returns {string} 
 */
export function toJson(points) {
  return JSON.stringify(points, null, 2)
}

/**
 * Trigger a download of a text blob (typically JSON or CSV).
 * Uses the browser's Blob and anchor API to create an
 * object URL and click a temporary link.  The caller should
 * revoke the URL if needed.
 *
 * @param {string} filename Name of the file including extension
 * @param {string} text Content of the file
 */
export function downloadText(filename, text) {
  const blob = new Blob([text], { type: 'application/octet-stream;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  // Let the browser manage revocation to avoid race conditions
  // URL.revokeObjectURL(url)
}