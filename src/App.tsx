import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Hls from 'hls.js';
import {
  ChevronLeft,
  Folder,
  FolderOpen,
  Heart,
  History,
  List,
  Power,
  Settings,
  Trash2,
  Tv,
  Undo2,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { KeyboardNavAction, WasslaKeyboard } from './components/WasslaKeyboard';
import { WasslaRemote } from './components/WasslaRemote';
import { SettingsNavAction, WasslaSettings } from './components/WasslaSettings';
import { DEF_SOURCES } from './data/defaultSources';
import { AppMode, ChannelItem, RecentChannelEntry, SourceItem, WasslaPrefs } from './types/wassla';
import {
  getFallbackStillForChannel,
  parsePlaylistText,
  readPlaylistFileText,
  rebuildAllSources,
  setOfUrls,
} from './utils/wasslaParser';

const STORAGE_SRCS_KEY = 'wassla_srcs_v1';
const STORAGE_PREFS_KEY = 'wassla_prefs_v1';
const STORAGE_LAST_URL_KEY = 'wassla_lasturl_v1';
const STORAGE_RECENT_KEY = 'wassla_recent_v1';
const STORAGE_FAVS_KEY = 'wassla_favs_v1';
const MAX_RECENT_CHANNELS = 15;

const DEFAULT_PREFS: WasslaPrefs = {
  safe: 3,
  engine: 'auto',
  ar: 'contain',
  infoMs: 5000,
  clock: true,
  logo: true,
  maxRt: 2,
  resume: true,
  autoNext: false,
  listStyle: 'tree',
  remoteUi: 'hidden',
};

type ListDisplayRow =
  | {
      kind: 'file';
      source: SourceItem;
      visibleCount: number;
      groupCount: number;
    }
  | {
      kind: 'group';
      source: SourceItem;
      groupName: string | null;
      count: number;
    }
  | {
      kind: 'channel';
      channel: ChannelItem;
      channelIdx: number;
      sourceId: number | string;
      isHidden: boolean;
    };

function loadInitialSources(): SourceItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_SRCS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as SourceItem[];
      if (Array.isArray(parsed)) return parsed;
    }
  } catch {
    // ignore storage errors
  }
  return DEF_SOURCES.map((d) => ({ ...d, enabled: true }));
}

function loadInitialPrefs(): WasslaPrefs {
  try {
    const raw = localStorage.getItem(STORAGE_PREFS_KEY);
    if (raw) {
      return { ...DEFAULT_PREFS, ...(JSON.parse(raw) as Partial<WasslaPrefs>) };
    }
  } catch {
    // ignore storage errors
  }
  return DEFAULT_PREFS;
}

function loadInitialRecent(): RecentChannelEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_RECENT_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as RecentChannelEntry[];
      if (Array.isArray(parsed)) {
        return parsed
          .filter((x) => x && typeof x.url === 'string' && typeof x.watchedAt === 'number')
          .slice(0, MAX_RECENT_CHANNELS);
      }
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

function loadInitialFavorites(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_FAVS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.filter((u): u is string => typeof u === 'string');
      }
    }
  } catch {
    // ignore storage errors
  }
  return [];
}

function formatWatchedAgo(ts: number): string {
  const diffSec = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (diffSec < 60) return 'الآن';
  const mins = Math.floor(diffSec / 60);
  if (mins < 60) return `منذ ${mins} د`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `منذ ${hrs} س`;
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export default function App() {
  const [rawSources, setRawSources] = useState<SourceItem[]>(loadInitialSources);
  const [prefs, setPrefs] = useState<WasslaPrefs>(loadInitialPrefs);

  const rebuilt = useMemo(() => rebuildAllSources(rawSources), [rawSources]);
  const sources = rebuilt.sources;
  const channels = rebuilt.channels;

  const [cur, setCur] = useState<number>(() => {
    try {
      const savedPrefs = loadInitialPrefs();
      if (savedPrefs.resume) {
        const lastUrl = localStorage.getItem(STORAGE_LAST_URL_KEY);
        if (lastUrl) {
          const initialCh = rebuildAllSources(loadInitialSources()).channels;
          const idx = initialCh.findIndex((c) => c.url === lastUrl);
          if (idx >= 0) return idx;
        }
      }
    } catch {
      // ignore
    }
    return 0;
  });

  const [mode, setMode] = useState<AppMode>('play');
  const [isPoweredOn, setIsPoweredOn] = useState(true);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);

  const [infoVisible, setInfoVisible] = useState(true);
  const [volumeOsdVisible, setVolumeOsdVisible] = useState(false);
  const [zapBuffer, setZapBuffer] = useState('');
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [isDraggingFile, setIsDraggingFile] = useState(false);

  // Video & Fallback states
  const [videoState, setVideoState] = useState<'loading' | 'playing' | 'fallback'>('loading');
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const hlsRef = useRef<Hls | null>(null);
  const retryCountRef = useRef(0);
  const autoSkipCountRef = useRef(0);

  // List, Tree, Quick Editor, Favorites, Recent & Jump selection indices
  const [recentEntries, setRecentEntries] = useState<RecentChannelEntry[]>(loadInitialRecent);
  const [favoriteUrls, setFavoriteUrls] = useState<string[]>(loadInitialFavorites);
  const [listTab, setListTab] = useState<'tree' | 'all' | 'fav'>(() =>
    loadInitialPrefs().listStyle === 'flat' ? 'all' : 'tree'
  );
  const [treeLevel, setTreeLevel] = useState<'files' | 'groups' | 'channels'>('files');
  const [treeSourceId, setTreeSourceId] = useState<number | string | null>(null);
  const [treeGroup, setTreeGroup] = useState<string | null>(null);
  const [listZone, setListZone] = useState<'tabs' | 'rows'>('rows');
  const [listTabIdx, setListTabIdx] = useState(0);
  const [listSel, setListSel] = useState(0);
  const [recentZone, setRecentZone] = useState<'tabs' | 'rows'>('rows');
  const [recentTabIdx, setRecentTabIdx] = useState(0);
  const [recentSel, setRecentSel] = useState(0);
  const [playQuickIdx, setPlayQuickIdx] = useState<number | null>(null);
  const rowsRef = useRef<HTMLDivElement | null>(null);
  const recentRowsRef = useRef<HTMLDivElement | null>(null);
  const [listVisCount, setListVisCount] = useState(9);
  const [recentVisCount, setRecentVisCount] = useState(8);
  const longOkTimerRef = useRef<number | null>(null);
  const longOkTriggeredRef = useRef(false);
  const rowHoldTimerRef = useRef<number | null>(null);
  const rowHoldTriggeredRef = useRef(false);

  // Settings navigation & virtual keyboard bridge
  const [settingsNavAction, setSettingsNavAction] = useState<SettingsNavAction | null>(null);
  const settingsNavSeqRef = useRef(0);
  const [kbNavAction, setKbNavAction] = useState<KeyboardNavAction | null>(null);
  const kbNavSeqRef = useRef(0);
  const [kbState, setKbState] = useState<{
    isOpen: boolean;
    title: string;
    initialValue: string;
    returnMode: AppMode;
    onDone: ((val: string) => void) | null;
  }>({
    isOpen: false,
    title: '',
    initialValue: '',
    returnMode: 'set',
    onDone: null,
  });

  // Clock
  const [clockText, setClockText] = useState(() => {
    const d = new Date();
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  });

  // Timers
  const timersRef = useRef<Record<string, number>>({});

  const clearTimer = (key: string) => {
    if (timersRef.current[key]) {
      window.clearTimeout(timersRef.current[key]);
      delete timersRef.current[key];
    }
  };

  const setTimer = (key: string, fn: () => void, ms: number) => {
    clearTimer(key);
    timersRef.current[key] = window.setTimeout(fn, ms);
  };

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg);
    setTimer('toast', () => setToastMsg(null), 2500);
  }, []);

  // Safe screen margin CSS var
  useEffect(() => {
    document.documentElement.style.setProperty('--sf', `${prefs.safe}%`);
  }, [prefs.safe]);

  // Persist sources & prefs
  useEffect(() => {
    try {
      const compact = rawSources.map((s) => ({
        id: s.id,
        name: s.name,
        enabled: s.enabled,
        text: s.text,
        hid: s.hid || [],
        del: s.del || [],
        ord: s.ord || [],
        ren: s.ren || {},
        gren: s.gren || {},
        chGroup: s.chGroup || {},
      }));
      localStorage.setItem(STORAGE_SRCS_KEY, JSON.stringify(compact));
    } catch {
      // ignore
    }
  }, [rawSources]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // ignore
    }
  }, [prefs]);

  // Clock updater
  useEffect(() => {
    const id = window.setInterval(() => {
      const d = new Date();
      setClockText(
        `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
      );
    }, 1000);
    return () => window.clearInterval(id);
  }, []);

  // Keep cur in bounds when channels update
  useEffect(() => {
    if (channels.length === 0) {
      setCur(0);
      if (mode !== 'set' && mode !== 'text') {
        setMode('set');
        showToast('أضف مصدراً أو فعّل مصدراً');
      }
    } else if (cur >= channels.length) {
      setCur(0);
    }
  }, [channels.length]);

  const currentChannel = channels[cur];

  const favoriteSet = useMemo(() => new Set(favoriteUrls), [favoriteUrls]);

  const channelsWithIdx = useMemo(
    () => channels.map((channel, channelIdx) => ({ channel, channelIdx })),
    [channels]
  );

  const resolvedFavorites = useMemo(() => {
    const urlToIdx = new Map<string, number>();
    channels.forEach((c, idx) => {
      if (!urlToIdx.has(c.url)) urlToIdx.set(c.url, idx);
    });
    return favoriteUrls
      .map((url) => {
        const channelIdx = urlToIdx.get(url);
        if (channelIdx === undefined) return null;
        return {
          channel: channels[channelIdx],
          channelIdx,
        };
      })
      .filter(
        (item): item is { channel: (typeof channels)[number]; channelIdx: number } => item !== null
      );
  }, [channels, favoriteUrls]);

  const channelGlobalIndexMap = useMemo(() => {
    const map = new Map<string, number>();
    channels.forEach((c, idx) => {
      if (!map.has(c.url)) map.set(c.url, idx);
    });
    return map;
  }, [channels]);

  const channelSourceIdMap = useMemo(() => {
    const map = new Map<string, number | string>();
    sources.forEach((s) => {
      (s.all || []).forEach((c) => {
        if (!map.has(c.url)) map.set(c.url, s.id);
      });
    });
    return map;
  }, [sources]);

  const selectedTreeSource = useMemo(
    () => sources.find((s) => s.enabled && String(s.id) === String(treeSourceId)) || null,
    [sources, treeSourceId]
  );

  const selectedTreeGroups = useMemo(() => {
    if (!selectedTreeSource) return [];
    const hidMap = setOfUrls(selectedTreeSource.hid);
    const counts = new Map<string, number>();
    (selectedTreeSource.all || []).forEach((c) => {
      if (hidMap[c.url]) return;
      const g = c.group || 'عامة';
      counts.set(g, (counts.get(g) || 0) + 1);
    });
    return Array.from(counts.entries()).map(([groupName, count]) => ({ groupName, count }));
  }, [selectedTreeSource]);

  const activeListRows = useMemo<ListDisplayRow[]>(() => {
    if (listTab === 'fav') {
      return resolvedFavorites.map((item) => ({
        kind: 'channel',
        channel: item.channel,
        channelIdx: item.channelIdx,
        sourceId: channelSourceIdMap.get(item.channel.url) ?? '',
        isHidden: false,
      }));
    }

    if (listTab === 'all') {
      return channelsWithIdx.map((item) => ({
        kind: 'channel',
        channel: item.channel,
        channelIdx: item.channelIdx,
        sourceId: channelSourceIdMap.get(item.channel.url) ?? '',
        isHidden: false,
      }));
    }

    // listTab === 'tree'
    const enabledSrcs = sources.filter((s) => s.enabled);
    if (treeLevel === 'files' || !selectedTreeSource) {
      return enabledSrcs.map((src) => {
        const hidMap = setOfUrls(src.hid);
        const visibleList = (src.all || []).filter((c) => !hidMap[c.url]);
        const grpSet = new Set(visibleList.map((c) => c.group || 'عامة'));
        return {
          kind: 'file',
          source: src,
          visibleCount: visibleList.length,
          groupCount: grpSet.size,
        };
      });
    }

    if (treeLevel === 'groups') {
      const hidMap = setOfUrls(selectedTreeSource.hid);
      const totalInFile = (selectedTreeSource.all || []).filter((c) => !hidMap[c.url]).length;
      return [
        {
          kind: 'group',
          source: selectedTreeSource,
          groupName: null,
          count: totalInFile,
        },
        ...selectedTreeGroups.map((g) => ({
          kind: 'group' as const,
          source: selectedTreeSource,
          groupName: g.groupName,
          count: g.count,
        })),
      ];
    }

    // treeLevel === 'channels'
    const hidMap = setOfUrls(selectedTreeSource.hid);
    return (selectedTreeSource.all || [])
      .filter((c) => {
        if (hidMap[c.url]) return false;
        if (treeGroup !== null && (c.group || 'عامة') !== treeGroup) return false;
        return true;
      })
      .map((c) => ({
        kind: 'channel',
        channel: c,
        channelIdx: channelGlobalIndexMap.get(c.url) ?? -1,
        sourceId: selectedTreeSource.id,
        isHidden: false,
      }));
  }, [
    listTab,
    resolvedFavorites,
    channelsWithIdx,
    sources,
    treeLevel,
    selectedTreeSource,
    selectedTreeGroups,
    treeGroup,
    channelGlobalIndexMap,
    channelSourceIdMap,
  ]);

  const resolvedRecent = useMemo(() => {
    const urlToIdx = new Map<string, number>();
    channels.forEach((c, idx) => {
      if (!urlToIdx.has(c.url)) urlToIdx.set(c.url, idx);
    });
    return recentEntries
      .map((entry) => {
        const channelIdx = urlToIdx.get(entry.url);
        if (channelIdx === undefined) return null;
        return {
          channel: channels[channelIdx],
          channelIdx,
          watchedAt: entry.watchedAt,
        };
      })
      .filter(
        (item): item is { channel: (typeof channels)[number]; channelIdx: number; watchedAt: number } =>
          item !== null
      );
  }, [channels, recentEntries]);

  // Persist recent channels history & favorites
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_RECENT_KEY, JSON.stringify(recentEntries));
    } catch {
      // ignore
    }
  }, [recentEntries]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_FAVS_KEY, JSON.stringify(favoriteUrls));
    } catch {
      // ignore
    }
  }, [favoriteUrls]);

  const toggleFavorite = useCallback(
    (channel: (typeof channels)[number] | undefined) => {
      if (!channel) return;
      const alreadyFav = favoriteSet.has(channel.url);
      setFavoriteUrls((prev) =>
        alreadyFav ? prev.filter((u) => u !== channel.url) : [channel.url, ...prev]
      );
      showToast(
        alreadyFav
          ? `تمت إزالة «${channel.name}» من المفضلة`
          : `♥ تمت إضافة «${channel.name}» إلى المفضلة`
      );
    },
    [favoriteSet, showToast]
  );

  // Automatically record active channel into Recent Channels history
  useEffect(() => {
    if (!isPoweredOn || !currentChannel) return;
    setRecentEntries((prev) => {
      if (prev[0]?.url === currentChannel.url) return prev;
      const filtered = prev.filter((item) => item.url !== currentChannel.url);
      return [{ url: currentChannel.url, watchedAt: Date.now() }, ...filtered].slice(
        0,
        MAX_RECENT_CHANNELS
      );
    });
  }, [isPoweredOn, cur, currentChannel?.url]);

  const showInfoBar = useCallback(
    (customMs?: number) => {
      if (mode === 'set' || mode === 'text' || !isPoweredOn || !currentChannel) return;
      setInfoVisible(true);
      clearTimer('info');
      const delay = customMs !== undefined ? customMs : prefs.infoMs;
      if (delay > 0) {
        setTimer(
          'info',
          () => {
            setInfoVisible(false);
            setPlayQuickIdx(null);
          },
          delay
        );
      }
    },
    [mode, isPoweredOn, currentChannel, prefs.infoMs]
  );

  const stopPlayback = useCallback(() => {
    clearTimer('stall');
    clearTimer('retry');
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    const v = videoRef.current;
    if (v) {
      try {
        v.pause();
        v.removeAttribute('src');
        v.load();
      } catch {
        // ignore
      }
    }
  }, []);

  const playChannelIndex = useCallback(
    (index: number) => {
      if (!channels.length) return;
      const nextIdx = ((index % channels.length) + channels.length) % channels.length;
      retryCountRef.current = 0;
      setCur(nextIdx);
      try {
        localStorage.setItem(STORAGE_LAST_URL_KEY, channels[nextIdx].url);
      } catch {
        // ignore
      }
      setInfoVisible(true);
      clearTimer('info');
      if (prefs.infoMs > 0) {
        setTimer(
          'info',
          () => {
            setInfoVisible(false);
            setPlayQuickIdx(null);
          },
          prefs.infoMs
        );
      }
    },
    [channels, prefs.infoMs]
  );

  // Playback lifecycle
  useEffect(() => {
    const v = videoRef.current;
    if (!isPoweredOn || mode === 'set' || mode === 'text' || !currentChannel || !v) {
      stopPlayback();
      return;
    }

    if (prefs.engine === 'sim') {
      stopPlayback();
      setVideoState('fallback');
      return;
    }

    let cancelled = false;

    const attemptStart = () => {
      if (cancelled) return;
      clearTimer('stall');
      if (hlsRef.current) {
        hlsRef.current.destroy();
        hlsRef.current = null;
      }

      setVideoState('loading');
      const url = currentChannel.url;

      const handleFailure = () => {
        if (cancelled) return;
        clearTimer('stall');
        if (retryCountRef.current < prefs.maxRt) {
          retryCountRef.current += 1;
          setTimer('retry', attemptStart, 1000);
          return;
        }
        if (prefs.autoNext && autoSkipCountRef.current < 5 && channels.length > 1) {
          autoSkipCountRef.current += 1;
          showToast('القناة لا تعمل — الانتقال للتالية');
          setTimer('retry', () => playChannelIndex(cur + 1), 900);
          return;
        }
        setVideoState('fallback');
        showToast('وضع البث التفاعلي — ▲ للقناة التالية');
      };

      if (Hls.isSupported() && /\.m3u8|hls/i.test(url)) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: true,
          manifestLoadingTimeOut: 5500,
          fragLoadingTimeOut: 5500,
        });
        hlsRef.current = hls;
        hls.loadSource(url);
        hls.attachMedia(v);
        hls.on(Hls.Events.ERROR, (_ev, data) => {
          if (data.fatal) handleFailure();
        });
      } else {
        v.src = url;
      }

      v.play().catch(() => {
        // Retry muted if browser blocks unmuted autoplay
        v.muted = true;
        v.play().catch(() => {});
      });

      setTimer('stall', handleFailure, 7000);
    };

    const onPlaying = () => {
      if (cancelled) return;
      clearTimer('stall');
      retryCountRef.current = 0;
      autoSkipCountRef.current = 0;
      setVideoState('playing');
    };

    const onError = () => {
      if (cancelled) return;
      clearTimer('stall');
      if (retryCountRef.current < prefs.maxRt) {
        retryCountRef.current += 1;
        setTimer('retry', attemptStart, 1000);
      } else {
        setVideoState('fallback');
      }
    };

    v.addEventListener('playing', onPlaying);
    v.addEventListener('error', onError);
    attemptStart();

    return () => {
      cancelled = true;
      v.removeEventListener('playing', onPlaying);
      v.removeEventListener('error', onError);
      stopPlayback();
    };
  }, [
    cur,
    currentChannel?.url,
    isPoweredOn,
    mode === 'set' || mode === 'text',
    prefs.engine,
    prefs.maxRt,
    prefs.autoNext,
  ]);

  // Sync audio volume & mute
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    v.volume = Math.max(0, Math.min(1, volume / 100));
    v.muted = isMuted;
  }, [volume, isMuted, videoState]);

  // Measure channel list & recent list visible row counts
  useEffect(() => {
    if (mode !== 'list' && mode !== 'recent') return;
    const calc = () => {
      if (mode === 'list' && rowsRef.current) {
        setListVisCount(Math.max(3, Math.floor((rowsRef.current.clientHeight - 12) / 52)));
      }
      if (mode === 'recent' && recentRowsRef.current) {
        setRecentVisCount(Math.max(3, Math.floor((recentRowsRef.current.clientHeight - 12) / 58)));
      }
    };
    calc();
    window.addEventListener('resize', calc);
    return () => window.removeEventListener('resize', calc);
  }, [mode]);

  const openList = useCallback(
    (startAtIndex?: number, forcedTab?: 'tree' | 'all' | 'fav') => {
      if (!isPoweredOn) return;
      const targetTab: 'tree' | 'all' | 'fav' =
        forcedTab || (prefs.listStyle === 'flat' ? 'all' : 'tree');
      const hasEnabledSource = sources.some((s) => s.enabled);
      if ((targetTab === 'all' && !channels.length) || (targetTab === 'tree' && !hasEnabledSource)) {
        setInfoVisible(false);
        setMode('set');
        showToast('أضف مصدراً أو فعّل مصدراً');
        return;
      }
      clearTimer('recent');
      setPlayQuickIdx(null);
      setListTab(targetTab);
      if (targetTab === 'tree') {
        setListTabIdx(0);
        setTreeLevel('files');
        setTreeSourceId(null);
        setTreeGroup(null);
        setListZone(hasEnabledSource ? 'rows' : 'tabs');
        setListSel(0);
      } else if (targetTab === 'fav') {
        setListTabIdx(2);
        setListZone(resolvedFavorites.length > 0 ? 'rows' : 'tabs');
        setListSel(startAtIndex !== undefined ? startAtIndex : 0);
      } else {
        setListTabIdx(1);
        setListZone('rows');
        setListSel(startAtIndex !== undefined ? startAtIndex : cur);
      }
      setMode('list');
      setTimer('list', () => setMode('play'), 12000);
    },
    [isPoweredOn, prefs.listStyle, channels.length, sources, resolvedFavorites.length, cur, showToast]
  );

  const openFavorites = useCallback(() => {
    openList(0, 'fav');
  }, [openList]);

  const openRecent = useCallback(() => {
    if (!isPoweredOn) return;
    clearTimer('list');
    clearTimer('recent');
    setPlayQuickIdx(null);
    setRecentSel(0);
    setRecentTabIdx(0);
    setRecentZone(resolvedRecent.length > 0 ? 'rows' : 'tabs');
    setMode('recent');
    setTimer('recent', () => setMode('play'), 15000);
  }, [isPoweredOn, resolvedRecent.length]);

  const removeRecentChannel = useCallback((url: string) => {
    setRecentEntries((prev) => prev.filter((item) => item.url !== url));
  }, []);

  const clearRecentChannels = useCallback(() => {
    setRecentEntries([]);
    setRecentSel(0);
    setRecentZone('tabs');
    setRecentTabIdx(0);
    showToast('تم مسح سجل القنوات الأخيرة');
  }, [showToast]);

  const openSettings = useCallback(() => {
    if (!isPoweredOn) return;
    clearTimer('list');
    clearTimer('recent');
    setPlayQuickIdx(null);
    setInfoVisible(false);
    setMode('set');
  }, [isPoweredOn]);

  const closeAllOverlays = useCallback(() => {
    clearTimer('list');
    clearTimer('recent');
    setPlayQuickIdx(null);
    setMode('play');
    showInfoBar();
  }, [showInfoBar]);

  const adjustVolume = useCallback((delta: number) => {
    if (!isPoweredOn) return;
    setIsMuted(false);
    setVolume((v) => Math.max(0, Math.min(100, v + delta)));
    setVolumeOsdVisible(true);
    setTimer('vol', () => setVolumeOsdVisible(false), 2000);
  }, [isPoweredOn]);

  const toggleMute = useCallback(() => {
    if (!isPoweredOn) return;
    setIsMuted((m) => !m);
    setVolumeOsdVisible(true);
    setTimer('vol', () => setVolumeOsdVisible(false), 2000);
  }, [isPoweredOn]);

  const commitZap = useCallback(
    (buf: string) => {
      const n = parseInt(buf, 10);
      if (!Number.isNaN(n) && n >= 1 && n <= channels.length) {
        playChannelIndex(n - 1);
      } else if (!Number.isNaN(n)) {
        showToast(`القناة ${n} غير موجودة`);
      }
      setZapBuffer('');
    },
    [channels.length, playChannelIndex, showToast]
  );

  const pressDigit = useCallback(
    (digit: string) => {
      if (!isPoweredOn || mode !== 'play') return;
      clearTimer('zap');
      setZapBuffer((prev) => {
        const next = (prev + digit).slice(0, 4);
        setTimer('zap', () => commitZap(next), 1100);
        return next;
      });
    },
    [isPoweredOn, mode, commitZap]
  );

  const dispatchSettingsAction = useCallback(
    (type: SettingsNavAction['type'], catIndex?: number) => {
      if (!isPoweredOn) return;
      settingsNavSeqRef.current += 1;
      setSettingsNavAction({ type, catIndex, seq: settingsNavSeqRef.current });
    },
    [isPoweredOn]
  );

  const dispatchKeyboardAction = useCallback(
    (type: KeyboardNavAction['type']) => {
      kbNavSeqRef.current += 1;
      setKbNavAction({ type, seq: kbNavSeqRef.current });
    },
    []
  );

  // Unified D-Pad Command Dispatcher (TV Box Remote + Keyboard + Virtual Remote)
  const dispatchNav = useCallback(
    (action: 'up' | 'down' | 'left' | 'right' | 'ok' | 'back') => {
      if (!isPoweredOn) {
        if (action === 'ok') {
          setIsPoweredOn(true);
          setMode('play');
          setInfoVisible(true);
        }
        return;
      }

      if (mode === 'text' && kbState.isOpen) {
        dispatchKeyboardAction(action);
        return;
      }

      if (mode === 'set') {
        dispatchSettingsAction(action);
        return;
      }

      if (mode === 'recent') {
        setTimer('recent', () => setMode('play'), 15000);
        if (action === 'back') {
          closeAllOverlays();
          return;
        }
        const recentTabCount = resolvedRecent.length > 0 ? 3 : 2;
        if (recentZone === 'tabs' || !resolvedRecent.length) {
          if (action === 'left') {
            setRecentTabIdx((idx) => (idx + 1 >= recentTabCount ? 0 : idx + 1));
          } else if (action === 'right') {
            setRecentTabIdx((idx) => (idx - 1 < 0 ? recentTabCount - 1 : idx - 1));
          } else if (action === 'down') {
            if (resolvedRecent.length > 0) setRecentZone('rows');
          } else if (action === 'ok') {
            if (recentTabIdx === 0) {
              openList();
            } else if (resolvedRecent.length > 0 && recentTabIdx === 1) {
              clearRecentChannels();
            } else {
              closeAllOverlays();
            }
          }
          return;
        }
        if (action === 'down') {
          setRecentSel((s) => (s + 1 >= resolvedRecent.length ? 0 : s + 1));
        } else if (action === 'up') {
          if (recentSel === 0) {
            setRecentZone('tabs');
            setRecentTabIdx(0);
          } else {
            setRecentSel((s) => Math.max(0, s - 1));
          }
        } else if (action === 'left') {
          setRecentSel((s) =>
            Math.min(Math.max(0, resolvedRecent.length - 1), s + recentVisCount)
          );
        } else if (action === 'right') {
          setRecentSel((s) => Math.max(0, s - recentVisCount));
        } else if (action === 'ok') {
          const picked = resolvedRecent[Math.min(recentSel, resolvedRecent.length - 1)];
          if (picked) {
            playChannelIndex(picked.channelIdx);
          }
          clearTimer('recent');
          setMode('play');
        }
        return;
      }

      if (mode === 'list') {
        setTimer('list', () => setMode('play'), 12000);

        const stepBackInList = () => {
          if (listTab === 'tree') {
            if (treeLevel === 'channels') {
              if (selectedTreeGroups.length > 1) {
                setTreeLevel('groups');
                setTreeGroup(null);
                setListSel(0);
                setListZone('rows');
                return;
              }
              const srcIdx = sources
                .filter((s) => s.enabled)
                .findIndex((s) => String(s.id) === String(treeSourceId));
              setTreeLevel('files');
              setTreeSourceId(null);
              setTreeGroup(null);
              setListSel(Math.max(0, srcIdx));
              setListZone('rows');
              return;
            }
            if (treeLevel === 'groups') {
              const srcIdx = sources
                .filter((s) => s.enabled)
                .findIndex((s) => String(s.id) === String(treeSourceId));
              setTreeLevel('files');
              setTreeSourceId(null);
              setTreeGroup(null);
              setListSel(Math.max(0, srcIdx));
              setListZone('rows');
              return;
            }
          }
          closeAllOverlays();
        };

        if (action === 'back') {
          stepBackInList();
          return;
        }

        const LIST_TABS_COUNT = 5; // 0: tree, 1: all, 2: fav, 3: recent, 4: set
        if (listZone === 'tabs' || !activeListRows.length) {
          if (action === 'left') {
            setListTabIdx((idx) => (idx + 1 >= LIST_TABS_COUNT ? 0 : idx + 1));
          } else if (action === 'right') {
            setListTabIdx((idx) => (idx - 1 < 0 ? LIST_TABS_COUNT - 1 : idx - 1));
          } else if (action === 'down') {
            if (activeListRows.length > 0) setListZone('rows');
          } else if (action === 'ok') {
            if (listTabIdx === 0) {
              setListTab('tree');
              setTreeLevel('files');
              setTreeSourceId(null);
              setTreeGroup(null);
              setListSel(0);
              setListZone(sources.some((s) => s.enabled) ? 'rows' : 'tabs');
            } else if (listTabIdx === 1) {
              setListTab('all');
              setListSel(cur);
              setListZone(channelsWithIdx.length > 0 ? 'rows' : 'tabs');
            } else if (listTabIdx === 2) {
              setListTab('fav');
              setListSel(0);
              setListZone(resolvedFavorites.length > 0 ? 'rows' : 'tabs');
            } else if (listTabIdx === 3) {
              openRecent();
            } else if (listTabIdx === 4) {
              openSettings();
            }
          }
          return;
        }

        const safeIdx = Math.max(0, Math.min(listSel, activeListRows.length - 1));
        if (action === 'down') {
          setListSel(safeIdx + 1 >= activeListRows.length ? 0 : safeIdx + 1);
        } else if (action === 'up') {
          if (safeIdx === 0) {
            setListZone('tabs');
            setListTabIdx(listTab === 'tree' ? 0 : listTab === 'all' ? 1 : 2);
          } else {
            setListSel(safeIdx - 1);
          }
        } else if (action === 'left') {
          setListSel(Math.min(Math.max(0, activeListRows.length - 1), safeIdx + listVisCount));
        } else if (action === 'right') {
          setListSel(Math.max(0, safeIdx - listVisCount));
        } else if (action === 'ok') {
          const picked = activeListRows[safeIdx];
          if (!picked) return;
          if (picked.kind === 'file') {
            setTreeSourceId(picked.source.id);
            const hidMap = setOfUrls(picked.source.hid);
            const visGroups = new Set(
              (picked.source.all || [])
                .filter((c) => !hidMap[c.url])
                .map((c) => c.group || 'عامة')
            );
            setTreeLevel(visGroups.size > 1 ? 'groups' : 'channels');
            setTreeGroup(null);
            setListSel(0);
            setListZone('rows');
          } else if (picked.kind === 'group') {
            setTreeGroup(picked.groupName);
            setTreeLevel('channels');
            setListSel(0);
            setListZone('rows');
          } else if (picked.channelIdx >= 0) {
            playChannelIndex(picked.channelIdx);
            clearTimer('list');
            setMode('play');
          }
        }
        return;
      }

      // Play mode: pure satellite receiver navigation (▲▼◄► + OK + BACK)
      if (action === 'left' || action === 'right') {
        const QUICK_COUNT = 4; // 0: القنوات, 1: المفضلة, 2: الأخيرة, 3: الإعدادات
        setPlayQuickIdx((prev) => {
          if (prev === null) return action === 'left' ? 0 : QUICK_COUNT - 1;
          return action === 'left'
            ? (prev + 1) % QUICK_COUNT
            : (prev - 1 + QUICK_COUNT) % QUICK_COUNT;
        });
        showInfoBar(8000);
        return;
      }

      if (action === 'up' || action === 'down') {
        setPlayQuickIdx(null);
        playChannelIndex(action === 'up' ? cur + 1 : cur - 1);
        return;
      }

      if (action === 'ok') {
        if (zapBuffer) {
          clearTimer('zap');
          commitZap(zapBuffer);
          return;
        }
        if (playQuickIdx !== null) {
          const idx = playQuickIdx;
          setPlayQuickIdx(null);
          if (idx === 0) openList();
          else if (idx === 1) openFavorites();
          else if (idx === 2) openRecent();
          else if (idx === 3) openSettings();
          return;
        }
        if (channels.length) {
          openList();
        } else {
          openSettings();
        }
        return;
      }

      if (action === 'back') {
        if (playQuickIdx !== null) {
          setPlayQuickIdx(null);
          setInfoVisible(false);
        } else if (infoVisible) {
          setInfoVisible(false);
        } else {
          showInfoBar();
        }
      }
    },
    [
      isPoweredOn,
      mode,
      kbState.isOpen,
      sources,
      channels.length,
      channelsWithIdx,
      resolvedFavorites,
      activeListRows,
      listTab,
      treeLevel,
      treeSourceId,
      selectedTreeGroups.length,
      listZone,
      listTabIdx,
      listVisCount,
      listSel,
      resolvedRecent,
      recentZone,
      recentTabIdx,
      recentVisCount,
      recentSel,
      cur,
      zapBuffer,
      playQuickIdx,
      infoVisible,
      dispatchKeyboardAction,
      dispatchSettingsAction,
      playChannelIndex,
      openList,
      openFavorites,
      openRecent,
      clearRecentChannels,
      openSettings,
      showInfoBar,
      closeAllOverlays,
      commitZap,
    ]
  );

  const handleLongOkFavorite = useCallback(() => {
    if (!isPoweredOn) return;
    if (mode === 'play') {
      toggleFavorite(currentChannel);
    } else if (mode === 'list' && listZone === 'rows') {
      const picked = activeListRows[Math.max(0, Math.min(listSel, activeListRows.length - 1))];
      if (picked && picked.kind === 'channel') {
        toggleFavorite(picked.channel);
      }
    } else if (mode === 'recent') {
      const picked = resolvedRecent[Math.max(0, Math.min(recentSel, resolvedRecent.length - 1))];
      toggleFavorite(picked?.channel);
    }
  }, [
    isPoweredOn,
    mode,
    currentChannel,
    listZone,
    activeListRows,
    listSel,
    resolvedRecent,
    recentSel,
    toggleFavorite,
  ]);

  // Physical TV Box Remote & Keyboard Listener (with Long-Press OK support for Favorites)
  useEffect(() => {
    const isOkKey = (k: string) =>
      k === 'Enter' || k === 'NumpadEnter' || k === 'Select' || k === 'DPAD_CENTER' || k === ' ';

    const clearLongOk = () => {
      if (longOkTimerRef.current !== null) {
        window.clearTimeout(longOkTimerRef.current);
        longOkTimerRef.current = null;
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (kbState.isOpen) return;

      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT')
      ) {
        return;
      }

      if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        setPrefs((prev) => ({
          ...prev,
          remoteUi: prev.remoteUi === 'open' ? 'hidden' : 'open',
        }));
        return;
      }

      if ((e.key === 'h' || e.key === 'H') && mode !== 'set' && mode !== 'text') {
        e.preventDefault();
        if (mode === 'recent') closeAllOverlays();
        else openRecent();
        return;
      }

      if ((e.key === 'f' || e.key === 'F') && mode !== 'set' && mode !== 'text') {
        e.preventDefault();
        if (mode === 'list' && listTab === 'fav') closeAllOverlays();
        else openFavorites();
        return;
      }

      if (e.key === 'm' || e.key === 'M' || e.key === 'AudioVolumeMute' || e.key === 'VolumeMute') {
        e.preventDefault();
        toggleMute();
        return;
      }

      if (e.key === 'AudioVolumeUp' || e.key === 'VolumeUp') {
        e.preventDefault();
        adjustVolume(10);
        return;
      }

      if (e.key === 'AudioVolumeDown' || e.key === 'VolumeDown') {
        e.preventDefault();
        adjustVolume(-10);
        return;
      }

      if (e.key === 'ContextMenu' || e.key === 'Menu') {
        e.preventDefault();
        if (mode === 'play') openList();
        else if (mode !== 'set') openSettings();
        return;
      }

      if (e.key === 'i' || e.key === 'I') {
        e.preventDefault();
        if (infoVisible) setInfoVisible(false);
        else showInfoBar();
        return;
      }

      if (mode === 'set') {
        if (e.key === 'Tab') {
          e.preventDefault();
          dispatchSettingsAction('toggleFocus');
          return;
        }
        if (e.key === 'PageUp') {
          e.preventDefault();
          dispatchSettingsAction('prevCat');
          return;
        }
        if (e.key === 'PageDown') {
          e.preventDefault();
          dispatchSettingsAction('nextCat');
          return;
        }
        if (e.key >= '1' && e.key <= '6') {
          e.preventDefault();
          dispatchSettingsAction('selectCat', Number(e.key) - 1);
          return;
        }
      }

      if (e.key >= '0' && e.key <= '9') {
        e.preventDefault();
        pressDigit(e.key);
        return;
      }

      if (isOkKey(e.key)) {
        e.preventDefault();
        const canLongFav =
          (mode === 'play' && playQuickIdx === null) ||
          (mode === 'list' && listZone === 'rows') ||
          (mode === 'recent' && recentZone === 'rows');
        if (canLongFav) {
          if (!e.repeat && longOkTimerRef.current === null) {
            longOkTriggeredRef.current = false;
            longOkTimerRef.current = window.setTimeout(() => {
              longOkTimerRef.current = null;
              longOkTriggeredRef.current = true;
              handleLongOkFavorite();
            }, 550);
          }
        } else if (!e.repeat) {
          dispatchNav('ok');
        }
        return;
      }

      switch (e.key) {
        case 'ArrowUp':
        case 'ChannelUp':
          e.preventDefault();
          dispatchNav('up');
          break;
        case 'ArrowDown':
        case 'ChannelDown':
          e.preventDefault();
          dispatchNav('down');
          break;
        case 'ArrowLeft':
          e.preventDefault();
          dispatchNav('left');
          break;
        case 'ArrowRight':
          e.preventDefault();
          dispatchNav('right');
          break;
        case 'Escape':
        case 'Backspace':
        case 'GoBack':
        case 'BrowserBack':
          e.preventDefault();
          dispatchNav('back');
          break;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (!isOkKey(e.key)) return;
      const canLongFav =
        (mode === 'play' && playQuickIdx === null) ||
        (mode === 'list' && listZone === 'rows') ||
        (mode === 'recent' && recentZone === 'rows');
      if (canLongFav) {
        clearLongOk();
        if (longOkTriggeredRef.current) {
          longOkTriggeredRef.current = false;
          return;
        }
        if (!kbState.isOpen) {
          dispatchNav('ok');
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', clearLongOk);
    return () => {
      clearLongOk();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', clearLongOk);
    };
  }, [
    kbState.isOpen,
    mode,
    listTab,
    listZone,
    recentZone,
    playQuickIdx,
    dispatchNav,
    dispatchSettingsAction,
    handleLongOkFavorite,
    openList,
    openRecent,
    openFavorites,
    openSettings,
    closeAllOverlays,
    adjustVolume,
    toggleMute,
    showInfoBar,
    infoVisible,
    pressDigit,
  ]);

  const safeListSel = Math.max(0, Math.min(listSel, Math.max(0, activeListRows.length - 1)));
  const listStart = Math.max(
    0,
    Math.min(safeListSel - Math.floor(listVisCount / 2), activeListRows.length - listVisCount)
  );
  const visibleListRows = activeListRows.slice(listStart, listStart + listVisCount);

  const safeRecentSel = Math.max(0, Math.min(recentSel, Math.max(0, resolvedRecent.length - 1)));
  const recentStart = Math.max(
    0,
    Math.min(safeRecentSel - Math.floor(recentVisCount / 2), resolvedRecent.length - recentVisCount)
  );
  const visibleRecentRows = resolvedRecent.slice(recentStart, recentStart + recentVisCount);

  const handleImportFileDirect = useCallback(
    async (file: File) => {
      try {
        const text = await readPlaylistFileText(file);
        const parsed = parsePlaylistText(text);
        if (!parsed.length) {
          showToast('الملف لا يحتوي على قنوات صالحة');
          return;
        }
        const newSrc: SourceItem = {
          id: Date.now(),
          name: file.name.replace(/\.[^.]+$/, ''),
          enabled: true,
          text,
        };
        const nextSources = [...rawSources, newSrc];
        const nextRebuilt = rebuildAllSources(nextSources);
        setRawSources(nextSources);
        const addedSource = nextRebuilt.sources[nextRebuilt.sources.length - 1];
        if (addedSource && typeof addedSource.start === 'number' && nextRebuilt.channels.length > 0) {
          setCur(addedSource.start);
          setMode('play');
          setInfoVisible(true);
        }
        showToast(`تمت إضافة ${parsed.length} قناة من ${file.name}`);
      } catch {
        showToast('تعذر قراءة الملف');
      }
    },
    [rawSources, showToast]
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        if (!isDraggingFile) setIsDraggingFile(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget === e.target) setIsDraggingFile(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        setIsDraggingFile(false);
        const file = e.dataTransfer.files?.[0];
        if (file) {
          void handleImportFileDirect(file);
        }
      }}
      className="relative w-screen h-screen bg-black text-white overflow-hidden select-none"
    >
      {/* Main Video Surface */}
      <video
        ref={videoRef}
        playsInline
        onClick={() => {
          if (mode === 'play') {
            if (infoVisible) setInfoVisible(false);
            else showInfoBar();
          }
        }}
        style={{ objectFit: prefs.ar }}
        className={`fixed inset-0 w-full h-full bg-black transition-opacity duration-300 ${
          isPoweredOn && videoState === 'playing' ? 'opacity-100' : 'opacity-0'
        }`}
      />

      {/* Broadcast Fallback Screen (when stream is simulated or unreachable via CORS) */}
      {isPoweredOn && videoState === 'fallback' && currentChannel && mode !== 'set' && (
        <div
          onClick={() => {
            if (mode === 'play') {
              if (infoVisible) setInfoVisible(false);
              else showInfoBar();
            }
          }}
          className="fixed inset-0 z-[4] bg-black flex items-center justify-center cursor-pointer"
        >
          <img
            src={getFallbackStillForChannel(currentChannel)}
            alt={currentChannel.name}
            referrerPolicy="no-referrer"
            style={{ objectFit: prefs.ar }}
            className="w-full h-full brightness-[0.82] contrast-[1.05]"
          />
          <div className="fixed inset-0 bg-gradient-to-t from-black/80 via-black/15 to-black/45 pointer-events-none" />
          <div
            style={{ top: 'calc(var(--sf) + 16px)', right: 'calc(var(--sf) + 16px)' }}
            className="fixed flex items-center gap-2.5 bg-black/65 border border-[#4f7fc9]/60 px-3.5 py-1.5 rounded-lg backdrop-blur-sm pointer-events-none"
          >
            <span className="text-xs sm:text-sm font-bold text-[#ffc400]">
              {String(cur + 1).padStart(2, '0')}
            </span>
            <span className="text-xs sm:text-sm font-bold text-white">
              {currentChannel.name}
            </span>
            <span className="text-[11px] text-[#9fb4d6]">· {currentChannel.group}</span>
          </div>
        </div>
      )}

      {/* Splash / Loading Screen (#blk) */}
      {isPoweredOn && videoState === 'loading' && mode !== 'set' && (
        <div
          onClick={() => {
            if (mode === 'play') {
              if (infoVisible) setInfoVisible(false);
              else showInfoBar();
            }
          }}
          className="fixed inset-0 z-[5] wassla-settings-bg flex flex-col items-center justify-center gap-4 px-6 cursor-pointer"
        >
          <img
            src="/assets/aistudio/banner_cobalt_de32e445.png"
            alt="وصلة TV — DAHMAN-SAT"
            className="w-72 sm:w-96 max-w-[85vw] h-auto rounded-2xl border border-white/15 shadow-2xl object-contain"
          />
          <div
            dir="ltr"
            className="font-mono-tech text-sm sm:text-base font-bold tracking-[0.26em] text-[#ffc400]"
          >
            DAHMAN-SAT
          </div>
          <p className="text-xs sm:text-sm text-[#94a8c9]">جاري تحميل البث...</p>
        </div>
      )}

      {/* Standby Mode Screen */}
      {!isPoweredOn && (
        <div className="fixed inset-0 z-30 wassla-settings-bg flex flex-col items-center justify-center gap-4 text-center px-6">
          <img
            src="/assets/aistudio/banner_cobalt_de32e445.png"
            alt="وصلة TV — DAHMAN-SAT"
            className="w-64 sm:w-80 max-w-[82vw] h-auto rounded-2xl border border-white/15 shadow-2xl object-contain"
          />
          <div
            dir="ltr"
            className="font-mono-tech text-xs sm:text-sm font-bold tracking-[0.24em] text-[#ffc400]"
          >
            DAHMAN-SAT
          </div>
          <p className="text-xl font-bold text-white">الجهاز في وضع الاستعداد</p>
          <p className="text-sm text-[#94a8c9] font-mono-tech">{clockText}</p>
          <button
            type="button"
            onClick={() => {
              setIsPoweredOn(true);
              showInfoBar();
            }}
            className="mt-2 px-6 py-2.5 rounded-xl bg-[#ffc400] hover:bg-amber-300 text-[#050a18] font-bold text-sm inline-flex items-center gap-2 cursor-pointer transition-colors"
          >
            <Power className="w-4 h-4" />
            <span>تشغيل التلفاز</span>
          </button>
        </div>
      )}

      {/* Numeric Zap OSD */}
      {isPoweredOn && zapBuffer && (
        <div
          style={{ top: 'calc(var(--sf) + 16px)', right: 'calc(var(--sf) + 16px)' }}
          className="fixed z-20 wassla-panel px-5 py-2.5 rounded-2xl"
        >
          <div className="text-[11px] text-[#94a8c9]">رقم القناة</div>
          <div className="font-mono-tech text-3xl font-bold text-[#ffc400]">{zapBuffer}</div>
        </div>
      )}

      {/* Volume OSD */}
      {isPoweredOn && volumeOsdVisible && (
        <div
          style={{ top: 'calc(var(--sf) + 20px)' }}
          className="fixed left-1/2 -translate-x-1/2 z-25 wassla-panel px-4 py-2.5 rounded-2xl flex items-center gap-3 min-w-[230px]"
        >
          {isMuted || volume === 0 ? (
            <VolumeX className="w-5 h-5 text-rose-400 shrink-0" />
          ) : (
            <Volume2 className="w-5 h-5 text-[#ffc400] shrink-0" />
          )}
          <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
            <div
              className="h-full bg-[#ffc400] transition-all duration-150"
              style={{ width: `${isMuted ? 0 : volume}%` }}
            />
          </div>
          <span className="font-mono-tech text-sm font-bold text-white w-9 text-left">
            {isMuted ? 'كتم' : volume}
          </span>
        </div>
      )}

      {/* Bottom Channel Info Banner (#info) with D-Pad Quick Dock */}
      {isPoweredOn && mode === 'play' && infoVisible && currentChannel && (
        <div
          style={{
            left: 'calc(var(--sf) + 0.5%)',
            right: 'calc(var(--sf) + 0.5%)',
            bottom: 'calc(var(--sf) + 2%)',
          }}
          className="fixed z-10 wassla-info-bar rounded-2xl px-4 sm:px-6 py-4 flex flex-col gap-3"
        >
          <div className="flex items-center gap-4 sm:gap-5">
            <div className="font-mono-tech text-3xl sm:text-5xl font-bold text-[#ffc400] min-w-[68px] sm:min-w-[96px] text-center">
              {String(cur + 1).padStart(2, '0')}
            </div>

            {prefs.logo && currentChannel.logo && (
              <img
                src={currentChannel.logo}
                alt={currentChannel.name}
                referrerPolicy="no-referrer"
                onError={(e) => {
                  (e.currentTarget as HTMLImageElement).style.display = 'none';
                }}
                className="w-12 h-12 sm:w-16 sm:h-16 object-contain bg-black/40 border border-white/10 rounded-xl shrink-0"
              />
            )}

            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2.5">
                <h2 className="text-xl sm:text-3xl font-bold text-white truncate">
                  {currentChannel.name}
                </h2>
                <button
                  type="button"
                  onClick={() => toggleFavorite(currentChannel)}
                  title={
                    favoriteSet.has(currentChannel.url)
                      ? 'إزالة من المفضلة (أو OK مطوّل)'
                      : 'إضافة للمفضلة (أو OK مطوّل)'
                  }
                  aria-label="تفضيل القناة"
                  className={`p-1.5 rounded-xl border transition-colors shrink-0 cursor-pointer ${
                    favoriteSet.has(currentChannel.url)
                      ? 'bg-rose-500/20 border-rose-400/60 text-rose-400'
                      : 'bg-white/[0.05] hover:bg-white/10 border-white/10 text-[#94a8c9] hover:text-rose-300'
                  }`}
                >
                  <Heart
                    className={`w-4 h-4 sm:w-5 sm:h-5 ${
                      favoriteSet.has(currentChannel.url) ? 'fill-rose-400 text-rose-400' : ''
                    }`}
                  />
                </button>
              </div>
              <div className="text-sm sm:text-base text-[#94a8c9] mt-0.5 truncate">
                {currentChannel.group}
                {sources.find((s) => String(s.id) === String(channelSourceIdMap.get(currentChannel.url)))
                  ?.name
                  ? ` · ${
                      sources.find(
                        (s) => String(s.id) === String(channelSourceIdMap.get(currentChannel.url))
                      )?.name
                    }`
                  : ''}
              </div>
            </div>

            <div className="text-left shrink-0">
              {prefs.clock && (
                <div className="font-mono-tech text-lg sm:text-2xl font-bold text-white">
                  {clockText}
                </div>
              )}
              <div className="hidden sm:block text-[11px] text-[#7c92b8] mt-1">
                ▲▼ قناة · OK القائمة · ◄► اختصارات
              </div>
            </div>
          </div>

          {/* TV Box Receiver Quick Bar */}
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2.5 border-t border-white/10 text-xs">
            <div className="flex flex-wrap items-center gap-1.5">
              {[
                { label: 'القنوات', onClick: () => openList(), icon: <List className="w-3.5 h-3.5" /> },
                {
                  label: `المفضلة (${resolvedFavorites.length})`,
                  onClick: openFavorites,
                  icon: <Heart className="w-3.5 h-3.5 text-rose-400" />,
                },
                {
                  label: 'الأخيرة',
                  onClick: openRecent,
                  icon: <History className="w-3.5 h-3.5 text-[#ffc400]" />,
                },
                {
                  label: 'الإعدادات',
                  onClick: openSettings,
                  icon: <Settings className="w-3.5 h-3.5 text-[#ffc400]" />,
                },
              ].map((btn, idx) => {
                const isFocused = playQuickIdx === idx;
                return (
                  <button
                    key={btn.label}
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={btn.onClick}
                    className={`px-3 py-1.5 rounded-xl border inline-flex items-center gap-1.5 cursor-pointer transition-colors duration-150 whitespace-nowrap shrink-0 ${
                      isFocused
                        ? 'wassla-tv-focus'
                        : 'bg-white/[0.04] hover:bg-white/[0.09] text-slate-200 border-white/10'
                    }`}
                  >
                    {btn.icon}
                    <span>{btn.label}</span>
                  </button>
                );
              })}
            </div>
            <span className="text-[11px] text-[#7c92b8]">
              {playQuickIdx !== null ? '◄► تنقّل · OK فتح · ▲▼ تبديل قناة' : 'OK مطوّل لتفضيل القناة'}
            </span>
          </div>
        </div>
      )}

      {/* Side Channel List Panel (#list) — Clean Satellite Receiver Style */}
      {isPoweredOn && mode === 'list' && (
        <div
          style={{
            top: 'calc(var(--sf) + 2%)',
            bottom: 'calc(var(--sf) + 2%)',
            right: 'calc(var(--sf) + 0.5%)',
          }}
          className="fixed z-20 w-[94%] sm:w-[74%] lg:w-[58%] max-w-4xl wassla-panel rounded-2xl flex flex-col overflow-hidden"
        >
          {/* Top Tabs Bar */}
          <div className="wassla-ph px-4 py-3 flex flex-wrap items-center justify-between gap-2 text-sm font-bold">
            <div className="flex flex-wrap items-center gap-1.5 min-w-0">
              <button
                type="button"
                onClick={() => {
                  setListTab('tree');
                  setTreeLevel('files');
                  setTreeSourceId(null);
                  setTreeGroup(null);
                  setListSel(0);
                  setListTabIdx(0);
                  setListZone(sources.some((s) => s.enabled) ? 'rows' : 'tabs');
                  setTimer('list', () => setMode('play'), 12000);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm border inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  listZone === 'tabs' && listTabIdx === 0
                    ? 'wassla-tv-focus'
                    : listTab === 'tree'
                      ? 'bg-[#12316b] text-[#ffc400] border-[#4f7fc9]/70 font-bold'
                      : 'bg-white/[0.04] hover:bg-white/10 text-slate-200 border-white/10'
                }`}
              >
                <Folder className="w-3.5 h-3.5" />
                <span>الملفات ({sources.filter((s) => s.enabled).length})</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setListTab('all');
                  setListSel(cur);
                  setListTabIdx(1);
                  setListZone('rows');
                  setTimer('list', () => setMode('play'), 12000);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm border transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  listZone === 'tabs' && listTabIdx === 1
                    ? 'wassla-tv-focus'
                    : listTab === 'all'
                      ? 'bg-[#12316b] text-[#ffc400] border-[#4f7fc9]/70 font-bold'
                      : 'bg-white/[0.04] hover:bg-white/10 text-slate-200 border-white/10'
                }`}
              >
                كل القنوات ({channels.length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setListTab('fav');
                  setListSel(0);
                  setListTabIdx(2);
                  setListZone(resolvedFavorites.length > 0 ? 'rows' : 'tabs');
                  setTimer('list', () => setMode('play'), 12000);
                }}
                className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm border inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  listZone === 'tabs' && listTabIdx === 2
                    ? 'wassla-tv-focus'
                    : listTab === 'fav'
                      ? 'bg-[#12316b] text-[#ffc400] border-[#4f7fc9]/70 font-bold'
                      : 'bg-white/[0.04] hover:bg-white/10 text-slate-200 border-white/10'
                }`}
              >
                <Heart
                  className={`w-3.5 h-3.5 ${
                    listZone === 'tabs' && listTabIdx === 2
                      ? 'fill-rose-600 text-rose-600'
                      : listTab === 'fav'
                        ? 'fill-rose-400 text-rose-400'
                        : 'text-rose-400'
                  }`}
                />
                <span>المفضلة ({resolvedFavorites.length})</span>
              </button>
              <button
                type="button"
                onClick={openRecent}
                className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm border inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                  listZone === 'tabs' && listTabIdx === 3
                    ? 'wassla-tv-focus'
                    : 'bg-white/[0.04] hover:bg-white/10 border-white/10 text-slate-200'
                }`}
              >
                <History className="w-3.5 h-3.5 text-[#ffc400]" />
                <span>الأخيرة</span>
              </button>
              <button
                type="button"
                onClick={openSettings}
                className={`px-3 py-1.5 rounded-xl text-xs sm:text-sm border inline-flex items-center gap-1.5 cursor-pointer transition-colors whitespace-nowrap shrink-0 ${
                  listZone === 'tabs' && listTabIdx === 4
                    ? 'wassla-tv-focus'
                    : 'bg-white/[0.04] hover:bg-white/10 border-white/10 text-slate-200'
                }`}
              >
                <Settings className="w-3.5 h-3.5" />
                <span>الإعدادات</span>
              </button>
            </div>
            <button
              type="button"
              onClick={closeAllOverlays}
              aria-label="إغلاق"
              className="w-8 h-8 rounded-xl bg-white/5 hover:bg-white/15 border border-white/10 text-[#94a8c9] hover:text-white flex items-center justify-center cursor-pointer shrink-0 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Tree Breadcrumb Sub-Bar */}
          {listTab === 'tree' && treeLevel !== 'files' && selectedTreeSource && (
            <div className="px-4 py-2 bg-white/[0.03] border-b border-white/10 flex items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-1.5 min-w-0 truncate text-[#c5d4ee]">
                <FolderOpen className="w-3.5 h-3.5 text-[#ffc400] shrink-0" />
                <span className="font-bold text-white truncate">{selectedTreeSource.name}</span>
                {treeLevel === 'channels' && (
                  <>
                    <ChevronLeft className="w-3.5 h-3.5 text-[#7c92b8] shrink-0" />
                    <span className="text-[#ffc400] truncate">
                      {treeGroup || 'كل القنوات'}
                    </span>
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => dispatchNav('back')}
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-white inline-flex items-center gap-1 cursor-pointer shrink-0"
              >
                <Undo2 className="w-3 h-3" />
                <span>رجوع</span>
              </button>
            </div>
          )}

          <div
            ref={rowsRef}
            onWheel={(e) => {
              if (!activeListRows.length) return;
              setTimer('list', () => setMode('play'), 12000);
              if (e.deltaY > 0) {
                setListSel((s) => Math.min(activeListRows.length - 1, s + 1));
              } else if (e.deltaY < 0) {
                setListSel((s) => Math.max(0, s - 1));
              }
            }}
            className="flex-1 min-h-0 overflow-hidden p-2 flex flex-col gap-0.5"
          >
            {activeListRows.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-3 text-[#94a8c9]">
                {listTab === 'fav' ? (
                  <Heart className="w-10 h-10 text-rose-400/75" />
                ) : (
                  <FolderOpen className="w-10 h-10 text-[#ffc400]/75" />
                )}
                <p className="text-base font-bold text-white">
                  {listTab === 'fav'
                    ? 'لا توجد قنوات مفضلة بعد'
                    : listTab === 'tree'
                      ? 'لا توجد قنوات معروضة في هذا القسم'
                      : 'لا توجد قنوات حالياً'}
                </p>
                {listTab === 'fav' && (
                  <p className="text-xs max-w-xs leading-relaxed">
                    اضغط مطولاً على زر <strong className="text-[#ffc400]">OK</strong> أثناء المشاهدة
                    أو داخل القائمة، أو انقر على أيقونة القلب لإضافة قناة إلى المفضلة.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => {
                    if (listTab === 'tree' && treeLevel !== 'files') {
                      dispatchNav('back');
                    } else {
                      setListTab('tree');
                      setTreeLevel('files');
                      setTreeSourceId(null);
                      setTreeGroup(null);
                      setListSel(0);
                      setListZone('rows');
                    }
                  }}
                  className="mt-1 px-4 py-2 rounded-xl bg-[#12316b] hover:bg-[#1a4391] border border-[#4f7fc9]/50 text-xs font-bold text-white cursor-pointer"
                >
                  {listTab === 'tree' && treeLevel !== 'files'
                    ? 'رجوع للمستوى السابق'
                    : 'عرض الملفات الأصلية'}
                </button>
              </div>
            ) : (
              visibleListRows.map((row, idx) => {
                const absIdx = listStart + idx;
                const isSel = listZone === 'rows' && absIdx === safeListSel;

                if (row.kind === 'file') {
                  return (
                    <button
                      key={`file-${String(row.source.id)}`}
                      type="button"
                      onClick={() => {
                        setTreeSourceId(row.source.id);
                        const hidMap = setOfUrls(row.source.hid);
                        const visGroups = new Set(
                          (row.source.all || [])
                            .filter((c) => !hidMap[c.url])
                            .map((c) => c.group || 'عامة')
                        );
                        setTreeLevel(visGroups.size > 1 ? 'groups' : 'channels');
                        setTreeGroup(null);
                        setListSel(0);
                        setListZone('rows');
                      }}
                      className={`w-full h-[52px] flex items-center gap-3 px-3.5 rounded-xl border text-base sm:text-lg whitespace-nowrap cursor-pointer transition-colors duration-150 ${
                        isSel
                          ? 'wassla-tv-focus'
                          : 'bg-white/[0.025] hover:bg-white/[0.07] text-white border-transparent'
                      }`}
                    >
                      <Folder
                        className={`w-5 h-5 shrink-0 ${isSel ? 'text-[#050a18]' : 'text-[#ffc400]'}`}
                      />
                      <span className="flex-1 text-right truncate">{row.source.name}</span>
                      <span
                        className={`text-xs shrink-0 font-mono-tech ${
                          isSel ? 'text-[#050a18]/80' : 'text-[#94a8c9]'
                        }`}
                      >
                        {row.visibleCount} قناة · {row.groupCount}{' '}
                        {row.groupCount === 1 ? 'مجموعة' : 'مجموعات'}
                      </span>
                      <ChevronLeft
                        className={`w-4 h-4 shrink-0 ${isSel ? 'text-[#050a18]' : 'text-[#94a8c9]'}`}
                      />
                    </button>
                  );
                }

                if (row.kind === 'group') {
                  return (
                    <button
                      key={`grp-${String(row.source.id)}-${row.groupName || '__all__'}`}
                      type="button"
                      onClick={() => {
                        setTreeGroup(row.groupName);
                        setTreeLevel('channels');
                        setListSel(0);
                        setListZone('rows');
                      }}
                      className={`w-full h-[52px] flex items-center gap-3 px-3.5 rounded-xl border text-base sm:text-lg whitespace-nowrap cursor-pointer transition-colors duration-150 ${
                        isSel
                          ? 'wassla-tv-focus'
                          : 'bg-white/[0.025] hover:bg-white/[0.07] text-white border-transparent'
                      }`}
                    >
                      {row.groupName === null ? (
                        <Tv
                          className={`w-5 h-5 shrink-0 ${isSel ? 'text-[#050a18]' : 'text-[#ffc400]'}`}
                        />
                      ) : (
                        <FolderOpen
                          className={`w-5 h-5 shrink-0 ${isSel ? 'text-[#050a18]' : 'text-sky-300'}`}
                        />
                      )}
                      <span className="flex-1 text-right truncate">
                        {row.groupName === null ? 'عرض كل قنوات الملف' : row.groupName}
                      </span>
                      <span
                        className={`text-xs shrink-0 font-mono-tech ${
                          isSel ? 'text-[#050a18]/80' : 'text-[#94a8c9]'
                        }`}
                      >
                        {row.count} قناة
                      </span>
                      <ChevronLeft
                        className={`w-4 h-4 shrink-0 ${isSel ? 'text-[#050a18]' : 'text-[#94a8c9]'}`}
                      />
                    </button>
                  );
                }

                const isFav = favoriteSet.has(row.channel.url);
                return (
                  <div
                    key={`${listTab}-${String(row.sourceId)}-${row.channel.url}`}
                    className={`w-full h-[52px] flex items-center gap-2 px-3 rounded-xl border text-base sm:text-lg whitespace-nowrap transition-colors duration-150 ${
                      isSel
                        ? 'wassla-tv-focus'
                        : 'bg-white/[0.02] hover:bg-white/[0.07] text-white border-transparent'
                    }`}
                  >
                    <button
                      type="button"
                      onPointerDown={() => {
                        if (rowHoldTimerRef.current !== null) {
                          window.clearTimeout(rowHoldTimerRef.current);
                        }
                        rowHoldTriggeredRef.current = false;
                        rowHoldTimerRef.current = window.setTimeout(() => {
                          rowHoldTimerRef.current = null;
                          rowHoldTriggeredRef.current = true;
                          toggleFavorite(row.channel);
                        }, 520);
                      }}
                      onPointerUp={() => {
                        if (rowHoldTimerRef.current !== null) {
                          window.clearTimeout(rowHoldTimerRef.current);
                          rowHoldTimerRef.current = null;
                        }
                      }}
                      onPointerLeave={() => {
                        if (rowHoldTimerRef.current !== null) {
                          window.clearTimeout(rowHoldTimerRef.current);
                          rowHoldTimerRef.current = null;
                        }
                      }}
                      onClick={() => {
                        if (rowHoldTriggeredRef.current) {
                          rowHoldTriggeredRef.current = false;
                          return;
                        }
                        if (row.channelIdx >= 0) {
                          playChannelIndex(row.channelIdx);
                          clearTimer('list');
                          setMode('play');
                        }
                      }}
                      className="flex-1 min-w-0 flex items-center gap-2.5 text-right cursor-pointer"
                    >
                      <span
                        className={`font-mono-tech min-w-[38px] text-center font-bold text-sm ${
                          isSel ? 'text-[#050a18]' : 'text-[#ffc400]'
                        }`}
                      >
                        {row.channelIdx >= 0 ? row.channelIdx + 1 : '•'}
                      </span>
                      {row.channel.logo ? (
                        <img
                          src={row.channel.logo}
                          alt=""
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                          }}
                          className="w-7 h-7 object-contain shrink-0"
                        />
                      ) : null}
                      <span className="flex-1 text-right truncate">{row.channel.name}</span>
                      <span
                        className={`text-xs shrink-0 hidden sm:inline ${
                          isSel ? 'text-[#050a18]/75' : 'text-[#94a8c9]'
                        }`}
                      >
                        {row.channel.group}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTimer('list', () => setMode('play'), 12000);
                        toggleFavorite(row.channel);
                      }}
                      title={isFav ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
                      aria-label={isFav ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'}
                      className={`p-1.5 rounded-lg shrink-0 cursor-pointer transition-colors ${
                        isSel
                          ? 'hover:bg-black/15 text-current'
                          : isFav
                            ? 'text-rose-400 hover:bg-white/10'
                            : 'text-[#7c92b8] hover:text-rose-300 hover:bg-white/10'
                      }`}
                    >
                      <Heart
                        className={`w-4 h-4 ${
                          isFav
                            ? isSel
                              ? 'fill-rose-600 text-rose-600'
                              : 'fill-rose-400 text-rose-400'
                            : ''
                        }`}
                      />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-white/10 bg-black/35 flex flex-wrap items-center justify-between gap-2 text-xs text-[#94a8c9]">
            <span>
              {listZone === 'tabs'
                ? '◄► اختيار تبويب · OK فتح · ▼ القائمة'
                : listTab === 'tree' && treeLevel !== 'channels'
                  ? '▲ للتبويبات · OK فتح · BACK رجوع'
                  : '▲ للتبويبات · OK تشغيل · OK مطوّل مفضلة'}
            </span>
            <span>{listZone === 'tabs' ? 'BACK إغلاق' : '◄ ► صفحة'}</span>
          </div>
        </div>
      )}

      {/* Recent Channels History Panel */}
      {isPoweredOn && mode === 'recent' && (
        <div
          style={{
            top: 'calc(var(--sf) + 2%)',
            bottom: 'calc(var(--sf) + 2%)',
            right: 'calc(var(--sf) + 0.5%)',
          }}
          className="fixed z-20 w-[92%] sm:w-[66%] lg:w-[48%] max-w-2xl wassla-panel rounded-2xl flex flex-col overflow-hidden"
        >
          <div className="wassla-ph px-4 py-3 flex items-center justify-between gap-2 text-base sm:text-lg font-bold">
            <div className="flex items-center gap-2 truncate">
              <History className="w-5 h-5 text-[#ffc400] shrink-0" />
              <span className="truncate">سِجل القنوات الأخيرة ({resolvedRecent.length})</span>
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => openList()}
                className={`text-xs border px-3 py-1.5 rounded-xl cursor-pointer transition-colors whitespace-nowrap ${
                  recentZone === 'tabs' && recentTabIdx === 0
                    ? 'wassla-tv-focus'
                    : 'bg-white/[0.05] hover:bg-white/10 border-white/15 text-white'
                }`}
              >
                القنوات
              </button>
              {resolvedRecent.length > 0 && (
                <button
                  type="button"
                  onClick={clearRecentChannels}
                  title="مسح سجل المشاهدة"
                  className={`text-xs border px-2.5 py-1.5 rounded-xl inline-flex items-center gap-1 cursor-pointer transition-colors whitespace-nowrap ${
                    recentZone === 'tabs' && recentTabIdx === 1
                      ? 'wassla-tv-focus'
                      : 'bg-rose-500/15 hover:bg-rose-500/30 border-rose-400/35 text-rose-200'
                  }`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">مسح</span>
                </button>
              )}
              <button
                type="button"
                onClick={closeAllOverlays}
                className={`text-xs border px-2.5 py-1.5 rounded-xl cursor-pointer transition-colors whitespace-nowrap ${
                  recentZone === 'tabs' &&
                  ((resolvedRecent.length > 0 && recentTabIdx === 2) ||
                    (resolvedRecent.length === 0 && recentTabIdx === 1))
                    ? 'wassla-tv-focus'
                    : 'bg-white/5 hover:bg-white/10 border-white/10 text-[#94a8c9]'
                }`}
              >
                إغلاق
              </button>
            </div>
          </div>

          <div
            ref={recentRowsRef}
            onWheel={(e) => {
              if (!resolvedRecent.length) return;
              setTimer('recent', () => setMode('play'), 15000);
              if (e.deltaY > 0) {
                setRecentSel((s) => Math.min(resolvedRecent.length - 1, s + 1));
              } else if (e.deltaY < 0) {
                setRecentSel((s) => Math.max(0, s - 1));
              }
            }}
            className="flex-1 min-h-0 overflow-hidden p-2 flex flex-col gap-1"
          >
            {resolvedRecent.length === 0 ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center px-6 gap-2 text-[#94a8c9]">
                <History className="w-10 h-10 text-[#4f7fc9]/70" />
                <p className="text-base font-bold text-white">لا توجد قنوات في السجل بعد</p>
                <p className="text-xs">
                  ستظهر هنا القنوات التي تشاهدها تلقائياً لسرعة الرجوع إليها.
                </p>
              </div>
            ) : (
              visibleRecentRows.map((item, idx) => {
                const absIdx = recentStart + idx;
                const isSel = recentZone === 'rows' && absIdx === safeRecentSel;
                const isNowPlaying = item.channelIdx === cur;
                return (
                  <div
                    key={item.channel.url}
                    className={`w-full h-[54px] flex items-center gap-2.5 px-3 rounded-xl border transition-colors ${
                      isSel
                        ? 'wassla-tv-focus'
                        : 'bg-white/[0.02] hover:bg-white/[0.07] text-white border-transparent'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        playChannelIndex(item.channelIdx);
                        clearTimer('recent');
                        setMode('play');
                      }}
                      className="flex-1 min-w-0 flex items-center gap-3 text-right cursor-pointer"
                    >
                      <span
                        className={`font-mono-tech min-w-[38px] text-center font-bold text-sm ${
                          isSel ? 'text-[#050a18]' : 'text-[#ffc400]'
                        }`}
                      >
                        {item.channelIdx + 1}
                      </span>
                      {item.channel.logo ? (
                        <img
                          src={item.channel.logo}
                          alt=""
                          onError={(e) => {
                            (e.currentTarget as HTMLImageElement).style.visibility = 'hidden';
                          }}
                          className="w-8 h-8 object-contain shrink-0"
                        />
                      ) : null}
                      <div className="flex-1 min-w-0">
                        <div className="truncate text-base">{item.channel.name}</div>
                        <div
                          className={`text-[11px] truncate ${
                            isSel ? 'text-[#050a18]/75' : 'text-[#94a8c9]'
                          }`}
                        >
                          {item.channel.group}
                          {isNowPlaying ? ' · تعمل الآن' : ''}
                        </div>
                      </div>
                      <span
                        className={`text-[11px] shrink-0 font-mono-tech ${
                          isSel ? 'text-[#050a18]/75' : 'text-[#94a8c9]'
                        }`}
                      >
                        {formatWatchedAgo(item.watchedAt)}
                      </span>
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setTimer('recent', () => setMode('play'), 15000);
                        toggleFavorite(item.channel);
                      }}
                      title={
                        favoriteSet.has(item.channel.url) ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'
                      }
                      aria-label={
                        favoriteSet.has(item.channel.url) ? 'إزالة من المفضلة' : 'إضافة إلى المفضلة'
                      }
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 cursor-pointer ${
                        isSel
                          ? 'hover:bg-black/15 text-[#050a18]'
                          : favoriteSet.has(item.channel.url)
                            ? 'text-rose-400 hover:bg-white/10'
                            : 'text-[#7c92b8] hover:text-rose-300 hover:bg-white/10'
                      }`}
                    >
                      <Heart
                        className={`w-3.5 h-3.5 ${
                          favoriteSet.has(item.channel.url)
                            ? isSel
                              ? 'fill-rose-600 text-rose-600'
                              : 'fill-rose-400 text-rose-400'
                            : ''
                        }`}
                      />
                    </button>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        removeRecentChannel(item.channel.url);
                      }}
                      title="إزالة من السجل"
                      aria-label="إزالة من السجل"
                      className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs shrink-0 cursor-pointer ${
                        isSel
                          ? 'hover:bg-black/15 text-[#050a18]'
                          : 'bg-white/5 hover:bg-rose-600/80 text-[#94a8c9] hover:text-white'
                      }`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          <div className="px-4 py-2.5 border-t border-white/10 bg-black/35 flex flex-wrap items-center justify-between gap-2 text-xs text-[#94a8c9]">
            <span>
              {recentZone === 'tabs'
                ? '◄► اختيار · OK تنفيذ · ▼ السجل'
                : '▲ للأزرار · OK تشغيل · OK مطوّل مفضلة'}
            </span>
            <span>BACK إغلاق</span>
          </div>
        </div>
      )}

      {/* Drag & Drop File Overlay */}
      {isDraggingFile && (
        <div className="fixed inset-0 z-50 bg-[#050b1a]/85 border-4 border-dashed border-[#ffc400] flex flex-col items-center justify-center gap-2 pointer-events-none">
          <div className="text-2xl font-bold text-[#ffc400]">أفلت ملف TXT أو M3U هنا</div>
          <div className="text-sm text-[#9fb4d6]">سيتم تحليل القنوات وإضافتها تلقائياً</div>
        </div>
      )}

      {/* Fullscreen Settings Screen (#set) */}
      <WasslaSettings
        isOpen={isPoweredOn && (mode === 'set' || (mode === 'text' && kbState.returnMode === 'set'))}
        sources={sources}
        activeChannelsCount={channels.length}
        favoritesCount={resolvedFavorites.length}
        prefs={prefs}
        navAction={settingsNavAction}
        onUpdateSources={(next) => setRawSources(next)}
        onUpdatePrefs={(partial) => setPrefs((p) => ({ ...p, ...partial }))}
        onOpenKeyboard={(title, initialValue, onDone) => {
          setMode('text');
          setKbState({
            isOpen: true,
            title,
            initialValue,
            returnMode: 'set',
            onDone,
          });
        }}
        onOpenFavorites={openFavorites}
        onToast={showToast}
        onClose={closeAllOverlays}
      />

      {/* Built-In On-Screen Virtual Keyboard (#kb) */}
      <WasslaKeyboard
        isOpen={kbState.isOpen}
        title={kbState.title}
        initialValue={kbState.initialValue}
        navAction={kbNavAction}
        onConfirm={(val) => {
          const cb = kbState.onDone;
          const nextMode = kbState.returnMode || 'set';
          setKbState({
            isOpen: false,
            title: '',
            initialValue: '',
            returnMode: 'set',
            onDone: null,
          });
          setMode(nextMode);
          if (cb) cb(val);
        }}
        onCancel={() => {
          const nextMode = kbState.returnMode || 'set';
          setKbState({
            isOpen: false,
            title: '',
            initialValue: '',
            returnMode: 'set',
            onDone: null,
          });
          setMode(nextMode);
        }}
      />

      {/* Toggleable Floating Virtual Remote Control (hidden by default for TV / TV Box) */}
      {(prefs.remoteUi ?? 'hidden') !== 'hidden' && (
        <WasslaRemote
          isOpen={prefs.remoteUi === 'open'}
          isPoweredOn={isPoweredOn}
          isMuted={isMuted}
          onToggleOpen={() =>
            setPrefs((prev) => ({
              ...prev,
              remoteUi: prev.remoteUi === 'open' ? 'mini' : 'open',
            }))
          }
          onPower={() => {
            setIsPoweredOn((on) => {
              const next = !on;
              if (next) {
                setMode('play');
                setInfoVisible(true);
              } else {
                stopPlayback();
              }
              return next;
            });
          }}
          onMute={toggleMute}
          onDigit={pressDigit}
          onUp={() => dispatchNav('up')}
          onDown={() => dispatchNav('down')}
          onLeft={() => dispatchNav('left')}
          onRight={() => dispatchNav('right')}
          onOk={() => dispatchNav('ok')}
          onOkLongPress={handleLongOkFavorite}
          onBack={() => dispatchNav('back')}
          onInfo={() => {
            if (infoVisible) setInfoVisible(false);
            else showInfoBar();
          }}
          onList={() => openList()}
          onFavorites={openFavorites}
          onRecent={openRecent}
          onSources={() => openList(0, 'tree')}
          onSettings={openSettings}
          onVolumeUp={() => adjustVolume(10)}
          onVolumeDown={() => adjustVolume(-10)}
        />
      )}

      {/* Toast Notification (#toast) */}
      {toastMsg && (
        <div className="fixed top-[45%] left-1/2 -translate-x-1/2 z-50 bg-black/85 border-2 border-[#ffc400] px-7 py-3.5 rounded-xl text-lg sm:text-xl text-center shadow-2xl">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
