// Helpers for the Riptide UI: type badges, category derivation, sparkline paths.

export interface Badge {
  badge: string;
  color: string;
  bg: string;
}

export function badgeFor(name: string): Badge {
  const n = name.toLowerCase();
  if (
    /\.(mkv|mp4|avi|mov|webm|m4v|ts|wmv|flv)\b/.test(n) ||
    /\b(1080p|720p|2160p|4k|uhd|x264|x265|hevc|hdr|bluray|web-?dl|webrip|hdtv)\b/.test(n)
  )
    return { badge: "VID", color: "#5aa2f5", bg: "rgba(90,162,245,.14)" };
  if (
    /\.(flac|mp3|wav|aac|ogg|m4a|opus|alac)\b/.test(n) ||
    /\b(flac|discography|album|ost|soundtrack|24bit|lossless)\b/.test(n)
  )
    return { badge: "AUD", color: "#b48ef5", bg: "rgba(180,142,245,.14)" };
  if (/\.(iso|img)\b/.test(n) || /\b(ubuntu|debian|fedora|arch|linux|mint|iso)\b/.test(n))
    return { badge: "ISO", color: "#4fd18a", bg: "rgba(79,209,138,.14)" };
  if (
    /\.(exe|msi|dmg|deb|rpm|appimage|apk|pkg)\b/.test(n) ||
    /\b(setup|installer|repack|fitgirl|dodi|crack|portable|x64|win64)\b/.test(n)
  )
    return { badge: "APP", color: "#4fd18a", bg: "rgba(79,209,138,.14)" };
  if (/\.(zip|rar|7z|tar|gz|bz2|xz|tgz)\b/.test(n))
    return { badge: "ZIP", color: "#f5b74f", bg: "rgba(245,183,79,.14)" };
  return { badge: "FILE", color: "#8b919a", bg: "rgba(139,145,154,.14)" };
}

export function categoryFor(badge: string): string {
  switch (badge) {
    case "VID":
      return "Video";
    case "AUD":
      return "Audio";
    case "ISO":
    case "APP":
      return "Software";
    case "ZIP":
      return "Archives";
    default:
      return "Other";
  }
}

export const categoryColor: Record<string, string> = {
  Video: "#5aa2f5",
  Audio: "#b48ef5",
  Software: "#4fd18a",
  Archives: "#f5b74f",
  Other: "#8b919a",
};

/** Build an SVG line + filled-area path from a series of values. */
export function spark(
  vals: number[],
  w: number,
  h: number,
  max?: number,
): { line: string; area: string } {
  const n = vals.length;
  if (n < 2) return { line: "", area: "" };
  const m = max && max > 0 ? max : Math.max(...vals, 1);
  const pts = vals.map(
    (v, i) => [(i / (n - 1)) * w, h - (Math.max(0, v) / m) * (h - 5) - 3] as const,
  );
  const line = "M " + pts.map((p) => `${p[0].toFixed(1)},${p[1].toFixed(1)}`).join(" L ");
  return { line, area: `${line} L ${w},${h} L 0,${h} Z` };
}

/** Push a value onto a fixed-length rolling history. */
export function pushHist(hist: number[], v: number, len = 48): number[] {
  const next = hist.length >= len ? hist.slice(hist.length - len + 1) : hist.slice();
  next.push(v);
  return next;
}
