/**
 * Formats a timestamp as a coarse relative age ("now", "5m", "3h", "2d") for
 * the sidebar tree's chat rows.
 *
 * @module @dsh-stack/providers/client/sidebar-tree/format-time-ago
 */

/**
 * @param timestamp - a `Date.now()`-style epoch millisecond timestamp, or a
 * falsy value for "no timestamp yet".
 * @returns the relative age, or `""` when there is no timestamp.
 */
function __dshFormatTimeAgo(timestamp) {
  if (!timestamp) return "";
  var seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "now";
  var minutes = Math.floor(seconds / 60);
  if (minutes < 60) return minutes + "m";
  var hours = Math.floor(minutes / 60);
  if (hours < 24) return hours + "h";
  var days = Math.floor(hours / 24);
  return days + "d";
}
