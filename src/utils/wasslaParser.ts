import { ChannelItem, SourceItem } from '../types/wassla';
import { FALLBACK_STILLS } from '../data/defaultSources';

export async function readPlaylistFileText(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const utf8Text = new TextDecoder('utf-8', { fatal: false }).decode(buffer);
  // If UTF-8 produced replacement characters, fallback to Arabic Windows-1256 encoding
  if (utf8Text.includes('\uFFFD')) {
    try {
      return new TextDecoder('windows-1256').decode(buffer);
    } catch {
      return utf8Text;
    }
  }
  return utf8Text;
}

export function formatSourceAsTxt(source: SourceItem): string {
  const channels = source.all && source.all.length ? source.all : parsePlaylistText(source.text);
  const byGroup = new Map<string, ChannelItem[]>();
  channels.forEach((ch) => {
    const grp = ch.group || 'عامة';
    if (!byGroup.has(grp)) byGroup.set(grp, []);
    byGroup.get(grp)!.push(ch);
  });

  const lines: string[] = [];
  byGroup.forEach((items, grp) => {
    lines.push(`${grp},#genre#`);
    items.forEach((ch) => {
      lines.push(`${ch.name},${ch.url}`);
    });
    lines.push('');
  });
  return lines.join('\n').trim();
}

export function parsePlaylistText(rawText: string): ChannelItem[] {
  const out: ChannelItem[] = [];
  let meta: {
    name: string;
    logo: string;
    group: string;
    tvgId?: string;
    tvgName?: string;
  } | null = null;
  const urlRegex = /^[a-z][a-z0-9+.-]*:\/\//i;
  let currentGenre = '';
  let extGrp = '';

  String(rawText)
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .forEach((rawLine) => {
      const line = rawLine.trim();
      if (!line) return;

      // TVBox / DIYP / Wassla .txt group header: "Group Name,#genre#"
      const gm = /^(.+?)\s*,\s*#genre#\s*$/i.exec(line);
      if (gm) {
        currentGenre = gm[1].trim();
        return;
      }

      if (line.indexOf('#EXTGRP:') === 0) {
        extGrp = line.substring(8).trim();
        return;
      }

      if (line.indexOf('#EXTINF') === 0) {
        const lg = /tvg-logo="([^"]*)"/i.exec(line);
        const g = /group-title="([^"]*)"/i.exec(line);
        const tid = /(?:tvg-id|channel-id)="([^"]*)"/i.exec(line);
        const tname = /tvg-name="([^"]*)"/i.exec(line);
        meta = {
          name: line.substring(line.lastIndexOf(',') + 1).trim() || 'قناة',
          logo: lg ? lg[1] : '',
          group: g && g[1] ? g[1] : '',
          tvgId: tid && tid[1] ? tid[1].trim() : undefined,
          tvgName: tname && tname[1] ? tname[1].trim() : undefined,
        };
        return;
      }

      if (line[0] === '#') return;

      let u = line;
      let inlineName: string | null = null;

      if (!urlRegex.test(line)) {
        // Support common .txt separators: comma, pipe, semicolon, tab, or space before URL
        const sepMatch = /^(.+?)\s*[,|;\t]\s*([a-z][a-z0-9+.-]*:\/\/.+)$/i.exec(line);
        if (sepMatch) {
          inlineName = sepMatch[1].trim();
          u = sepMatch[2].trim();
        } else {
          const spaceMatch = /^(.+?)\s+([a-z][a-z0-9+.-]*:\/\/\S+)$/i.exec(line);
          if (spaceMatch) {
            inlineName = spaceMatch[1].trim();
            u = spaceMatch[2].trim();
          }
        }
      }

      // Handle multi-source .txt lines like "url1#url2"
      if (urlRegex.test(u) && u.includes('#') && !u.includes('#EXT')) {
        const firstUrl = u.split('#')[0].trim();
        if (urlRegex.test(firstUrl)) u = firstUrl;
      }

      if (urlRegex.test(u)) {
        out.push({
          name: meta ? meta.name : inlineName || `قناة ${out.length + 1}`,
          logo: meta ? meta.logo : '',
          group: (meta && meta.group) || extGrp || currentGenre || 'أخرى',
          url: u,
          ...(meta?.tvgId ? { tvgId: meta.tvgId } : {}),
          ...(meta?.tvgName ? { tvgName: meta.tvgName } : {}),
        });
      }
      meta = null;
      extGrp = '';
    });

  return out;
}

export function setOfUrls(arr?: string[]): Record<string, true> {
  const map: Record<string, true> = {};
  (arr || []).forEach((u) => {
    map[u] = true;
  });
  return map;
}

export function rebuildAllSources(sources: SourceItem[]): {
  sources: SourceItem[];
  channels: ChannelItem[];
} {
  const seen: Record<string, true> = {};
  const allChannels: ChannelItem[] = [];

  const updatedSources = sources.map((src) => {
    const delMap = setOfUrls(src.del);
    const hidMap = setOfUrls(src.hid);

    let parsed = parsePlaylistText(src.text).filter((c) => !delMap[c.url]);
    parsed = parsed.map((c) => {
      const og = c.group;
      const renamedGroup = src.gren && src.gren[og] ? src.gren[og] : og;
      const customGroup = src.chGroup && src.chGroup[c.url] ? src.chGroup[c.url] : renamedGroup;
      const renamedName = src.ren && src.ren[c.url] ? src.ren[c.url] : c.name;
      return {
        ...c,
        og,
        group: customGroup,
        name: renamedName,
      };
    });

    if (src.ord && src.ord.length) {
      const byUrl: Record<string, ChannelItem> = {};
      const inOrd: Record<string, true> = {};
      parsed.forEach((c) => {
        byUrl[c.url] = c;
      });
      src.ord.forEach((u) => {
        inOrd[u] = true;
      });
      const ordered = src.ord
        .filter((u) => Boolean(byUrl[u]))
        .map((u) => byUrl[u]);
      const rest = parsed.filter((c) => !inOrd[c.url]);
      parsed = [...ordered, ...rest];
    }

    const visible = parsed.filter((c) => !hidMap[c.url]);
    const start = allChannels.length;
    let cnt = 0;

    if (src.enabled) {
      visible.forEach((c) => {
        if (!seen[c.url]) {
          seen[c.url] = true;
          allChannels.push(c);
          cnt++;
        }
      });
    }

    return {
      ...src,
      all: parsed,
      n: visible.length,
      start,
      cnt,
    };
  });

  return { sources: updatedSources, channels: allChannels };
}

export interface GroupSummary {
  name: string;
  og: string;
  urls: string[];
}

export function getSourceGroups(source: SourceItem): GroupSummary[] {
  const groups: GroupSummary[] = [];
  const idxMap: Record<string, number> = {};
  (source.all || []).forEach((c) => {
    if (!(c.group in idxMap)) {
      idxMap[c.group] = groups.length;
      groups.push({ name: c.group, og: c.og || c.group, urls: [] });
    }
    groups[idxMap[c.group]].urls.push(c.url);
  });
  return groups;
}

export function getFallbackStillForChannel(channel: ChannelItem): string {
  const g = channel.group || '';
  if (g.includes('أخبار') || g.includes('اخبار')) return FALLBACK_STILLS['أخبار'];
  if (g.includes('رياض')) return FALLBACK_STILLS['رياضة'];
  if (g.includes('وثائق')) return FALLBACK_STILLS['وثائقي'];
  return FALLBACK_STILLS['عامة'];
}
