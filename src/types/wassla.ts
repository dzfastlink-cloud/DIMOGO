export interface ChannelItem {
  name: string;
  logo: string;
  group: string;
  og?: string;
  url: string;
  tvgId?: string;
  tvgName?: string;
}

export interface EpgChannel {
  id: string;
  displayNames: string[];
  icon?: string;
}

export interface EpgProgram {
  channelId: string;
  start: number;
  stop: number;
  title: string;
  desc?: string;
  category?: string;
}

export interface EpgData {
  sourceLabel: string;
  url?: string;
  updatedAt: number;
  channels: EpgChannel[];
  programmes: EpgProgram[];
}

export interface ChannelEpgNowNext {
  epgChannelId: string;
  epgChannelName: string;
  isManualLink: boolean;
  current: EpgProgram | null;
  next: EpgProgram | null;
  progressPct: number;
}

export interface SourceItem {
  id: number | string;
  name: string;
  enabled: boolean;
  text: string;
  hid?: string[];
  del?: string[];
  ord?: string[];
  ren?: Record<string, string>;
  gren?: Record<string, string>;
  chGroup?: Record<string, string>;
  // Computed runtime fields
  all?: ChannelItem[];
  n?: number;
  start?: number;
  cnt?: number;
}

export interface WasslaPrefs {
  safe: 0 | 3 | 5 | 8;
  engine: 'auto' | 'hls' | 'sim';
  ar: 'contain' | 'fill' | 'cover';
  infoMs: 3000 | 5000 | 8000 | 0;
  clock: boolean;
  logo: boolean;
  maxRt: 0 | 2 | 4;
  resume: boolean;
  autoNext: boolean;
  listStyle?: 'tree' | 'flat';
  remoteUi?: 'hidden' | 'mini' | 'open';
}

export interface RecentChannelEntry {
  url: string;
  watchedAt: number;
}

export type AppMode = 'play' | 'list' | 'recent' | 'set' | 'text';

export type SettingsSubMode =
  | 'top'
  | 'main'
  | 'hid'
  | 'src'
  | 'picksrc'
  | 'ch'
  | 'move'
  | 'reorder'
  | 'msact'
  | 'chact'
  | 'chgrp'
  | 'grp'
  | 'grpact';
