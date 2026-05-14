/** Recognizes Spotify track/artist URLs and spotify: URIs. */
export function parseSpotifyTrackOrArtist(
  raw: string,
): { kind: "track" | "artist"; id: string } | null {
  const s = raw.trim();
  if (!s) return null;

  const uriTrack = /^spotify:track:([a-zA-Z0-9]+)$/i.exec(s);
  if (uriTrack) return { kind: "track", id: uriTrack[1] };

  const uriArtist = /^spotify:artist:([a-zA-Z0-9]+)$/i.exec(s);
  if (uriArtist) return { kind: "artist", id: uriArtist[1] };

  let urlStr = s;
  if (!/^https?:\/\//i.test(urlStr)) urlStr = `https://${urlStr}`;

  try {
    const u = new URL(urlStr);
    const host = u.hostname.replace(/^www\./, "").toLowerCase();
    if (host !== "open.spotify.com") return null;

    const parts = u.pathname.split("/").filter(Boolean);
    const ti = parts.lastIndexOf("track");
    if (ti >= 0 && parts[ti + 1]) {
      return { kind: "track", id: parts[ti + 1].split("?")[0] };
    }
    const ai = parts.lastIndexOf("artist");
    if (ai >= 0 && parts[ai + 1]) {
      return { kind: "artist", id: parts[ai + 1].split("?")[0] };
    }
  } catch {
    return null;
  }

  return null;
}
