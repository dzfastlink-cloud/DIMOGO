import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CheckCircle2,
  CheckSquare,
  Download,
  Eye,
  EyeOff,
  FilePlus,
  Folder,
  Globe,
  GripVertical,
  HardDrive,
  Heart,
  Info,
  Link,
  ListChecks,
  Monitor,
  PauseCircle,
  Pencil,
  PlayCircle,
  Radio,
  RotateCcw,
  Square,
  Trash2,
  Tv,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import { DEF_SOURCES } from '../data/defaultSources';
import {
  ChannelItem,
  SettingsSubMode,
  SourceItem,
  WasslaPrefs,
} from '../types/wassla';
import {
  formatSourceAsTxt,
  getSourceGroups,
  parsePlaylistText,
  readPlaylistFileText,
  setOfUrls,
} from '../utils/wasslaParser';

export interface SettingsNavAction {
  type:
    | 'up'
    | 'down'
    | 'left'
    | 'right'
    | 'ok'
    | 'back'
    | 'prevCat'
    | 'nextCat'
    | 'toggleFocus'
    | 'selectCat';
  catIndex?: number;
  seq: number;
}

interface WasslaSettingsProps {
  isOpen: boolean;
  sources: SourceItem[];
  activeChannelsCount: number;
  favoritesCount?: number;
  prefs: WasslaPrefs;
  navAction: SettingsNavAction | null;
  onUpdateSources: (nextSources: SourceItem[]) => void;
  onUpdatePrefs: (partial: Partial<WasslaPrefs>) => void;
  onOpenKeyboard: (title: string, initialValue: string, onDone: (val: string) => void) => void;
  onOpenFavorites?: () => void;
  onToast: (msg: string) => void;
  onClose: () => void;
}

type RowIconKind =
  | 'active'
  | 'paused'
  | 'file'
  | 'link'
  | 'trash'
  | 'warn'
  | 'reset'
  | 'heart'
  | 'reorder'
  | 'eye'
  | 'eyeOff'
  | 'up'
  | 'down'
  | 'edit'
  | 'group'
  | 'export'
  | 'import'
  | 'check'
  | 'uncheck'
  | 'multiselect'
  | 'close'
  | 'back'
  | 'globe'
  | 'tv'
  | 'info';

interface SettingRow {
  label: string;
  meta?: string;
  value?: string;
  no?: string;
  icon?: RowIconKind;
  statusLabel?: string;
  statusOn?: boolean;
  isHidden?: boolean;
  isMarked?: boolean;
  isDanger?: boolean;
  isConfirm?: boolean;
  f: () => void;
  l?: () => void;
}

const CATS = [
  { name: 'المصادر', icon: Radio },
  { name: 'القنوات', icon: Tv },
  { name: 'العرض', icon: Monitor },
  { name: 'التشغيل', icon: PlayCircle },
  { name: 'نسخ احتياطي', icon: HardDrive },
  { name: 'حول', icon: Info },
];
const VER = '2.2';

export const WasslaSettings: React.FC<WasslaSettingsProps> = ({
  isOpen,
  sources,
  activeChannelsCount,
  favoritesCount = 0,
  prefs,
  navAction,
  onUpdateSources,
  onUpdatePrefs,
  onOpenKeyboard,
  onOpenFavorites,
  onToast,
  onClose,
}) => {
  const [cat, setCat] = useState(0);
  const [sm, setSm] = useState<SettingsSubMode>('top');
  const [si, setSi] = useState(0);
  const [cf, setCf] = useState(0);
  const [cc, setCc] = useState(0);
  const [gc, setGc] = useState(0);
  const [conf, setConf] = useState(false);
  const [wk, setWk] = useState<ChannelItem[] | null>(null);
  const [msel, setMsel] = useState(false);
  const [mset, setMset] = useState<Record<string, true>>({});
  const [dragFromIdx, setDragFromIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [reorderReturnMode, setReorderReturnMode] = useState<'main' | 'src'>('main');
  const [pickTarget, setPickTarget] = useState<'ch' | 'grp'>('ch');
  const [chGrpReturn, setChGrpReturn] = useState<'main' | 'picksrc' | 'src'>('src');
  const [reorderZone, setReorderZone] = useState<'bar' | 'list'>('list');
  const [reorderBarIdx, setReorderBarIdx] = useState(0);
  const [reorderCursor, setReorderCursor] = useState(0);
  const [reorderGrabbed, setReorderGrabbed] = useState(false);

  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasteName, setPasteName] = useState('');
  const [pasteText, setPasteText] = useState('');
  const [pasteUrl, setPasteUrl] = useState('');
  const [isFetchingUrl, setIsFetchingUrl] = useState(false);

  const fileM3uRef = useRef<HTMLInputElement | null>(null);
  const fileBackupRef = useRef<HTMLInputElement | null>(null);
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const reorderListRef = useRef<HTMLDivElement | null>(null);
  const [visCount, setVisCount] = useState(8);
  const [rowHeight, setRowHeight] = useState(52);

  const lastHandledSeqRef = useRef<number>(-1);

  const selectSection = (nextCat: number, nextMode: SettingsSubMode = 'main') => {
    const normalized = ((nextCat % CATS.length) + CATS.length) % CATS.length;
    setCat(normalized);
    setSm(nextMode);
    setSi(0);
    setConf(false);
    setPasteOpen(false);
    setWk(null);
    setMsel(false);
    setMset({});
    setDragFromIdx(null);
    setDragOverIdx(null);
    setReorderGrabbed(false);
    setReorderZone('list');
    setReorderCursor(0);
  };

  useEffect(() => {
    if (isOpen) {
      setSm('top');
      setSi(0);
      setConf(false);
      setDragFromIdx(null);
      setDragOverIdx(null);
      setReorderGrabbed(false);
      setReorderZone('list');
      setReorderCursor(0);
    }
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen || sm !== 'reorder' || reorderZone !== 'list') return;
    const container = reorderListRef.current;
    if (!container) return;
    const rowEl = container.children[reorderCursor] as HTMLElement | undefined;
    rowEl?.scrollIntoView({ block: 'nearest' });
  }, [isOpen, sm, reorderZone, reorderCursor, cf]);

  useEffect(() => {
    if (!isOpen) return;
    const measure = () => {
      const el = bodyRef.current;
      if (!el) return;
      const bh = el.clientHeight;
      const gap = 8;
      if (bh > 60) {
        const vis = Math.max(3, Math.min(10, Math.floor((bh + gap) / (48 + gap))));
        const rh = Math.min(56, Math.floor((bh + gap) / vis) - gap);
        setVisCount(vis);
        setRowHeight(rh);
      }
    };
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [isOpen, sm, cat, sources.length]);

  const hiddenList = (): Array<{ s: SourceItem; c: ChannelItem }> => {
    const out: Array<{ s: SourceItem; c: ChannelItem }> = [];
    sources.forEach((s) => {
      const h = setOfUrls(s.hid);
      (s.all || []).forEach((c) => {
        if (h[c.url]) out.push({ s, c });
      });
    });
    return out;
  };

  const commitSources = (
    nextSources: SourceItem[],
    nextMode: SettingsSubMode,
    nextIdx: number
  ) => {
    onUpdateSources(nextSources);
    setSm(nextMode);
    setSi(Math.max(0, nextIdx));
    setConf(false);
  };

  const handleBack = () => {
    if (pasteOpen) {
      setPasteOpen(false);
      return;
    }
    setConf(false);
    if (sm === 'move') {
      setWk(null);
      setSm('ch');
      setSi(cc);
    } else if (sm === 'reorder') {
      setDragFromIdx(null);
      setDragOverIdx(null);
      setReorderGrabbed(false);
      setReorderZone('list');
      if (reorderReturnMode === 'src') {
        setSm('src');
        setSi(0);
      } else {
        setSm('main');
        setSi(2);
      }
    } else if (sm === 'chgrp') {
      setSm('chact');
      setSi(2);
    } else if (sm === 'chact') {
      setSm('ch');
      setSi(cc);
    } else if (sm === 'msact') {
      setSm('ch');
      setSi(0);
    } else if (sm === 'ch' || sm === 'grp') {
      setMsel(false);
      setMset({});
      if (chGrpReturn === 'main') {
        setSm('main');
        setSi(sm === 'ch' ? 0 : 1);
      } else if (chGrpReturn === 'picksrc') {
        setSm('picksrc');
        setSi(safeCf);
      } else {
        setSm('src');
        setSi(0);
      }
    } else if (sm === 'picksrc') {
      setSm('main');
      setSi(pickTarget === 'ch' ? 0 : 1);
    } else if (sm === 'grpact') {
      setSm('grp');
      setSi(gc);
    } else if (sm === 'src') {
      setSm('main');
      setSi(cf);
    } else if (sm === 'hid') {
      setSm('main');
      setSi(3);
    } else if (sm === 'main') {
      setSm('top');
      setSi(0);
    } else {
      onClose();
    }
  };

  const reorderSourceChannel = (srcIndex: number, fromIdx: number, toIdx: number) => {
    const targetSrc = sources[srcIndex];
    if (!targetSrc) return;
    const arr = [...(targetSrc.all || [])];
    if (
      fromIdx < 0 ||
      toIdx < 0 ||
      fromIdx >= arr.length ||
      toIdx >= arr.length ||
      fromIdx === toIdx
    ) {
      return;
    }
    const [moved] = arr.splice(fromIdx, 1);
    arr.splice(toIdx, 0, moved);
    const ord = arr.map((c) => c.url);
    const next = sources.map((x, idx) => (idx === srcIndex ? { ...x, ord } : x));
    onUpdateSources(next);
  };

  const resetSourceOrder = (srcIndex: number) => {
    const targetSrc = sources[srcIndex];
    if (!targetSrc) return;
    const next = sources.map((x, idx) => (idx === srcIndex ? { ...x, ord: [] } : x));
    onUpdateSources(next);
    onToast('تمت استعادة الترتيب الأصلي للقنوات');
  };

  const exportConfig = () => {
    const defIds: Record<string, true> = {};
    DEF_SOURCES.forEach((d) => {
      defIds[String(d.id)] = true;
    });
    const payload = {
      app: 'wassla-tv',
      v: 1,
      prefs,
      srcs: sources.map((s) => {
        const rec: Record<string, unknown> = {
          id: s.id,
          name: s.name,
          enabled: s.enabled,
          hid: s.hid || [],
          del: s.del || [],
          ord: s.ord || [],
          ren: s.ren || {},
          gren: s.gren || {},
          chGroup: s.chGroup || {},
        };
        if (!defIds[String(s.id)]) rec.text = s.text;
        return rec;
      }),
    };
    const txt = JSON.stringify(payload, null, 2);
    const blob = new Blob([txt], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'wassla-tv-backup.json';
    a.click();
    URL.revokeObjectURL(url);
    onToast('تم تصدير ملف النسخ الاحتياطي');
  };

  const optRow = <K extends keyof WasslaPrefs>(
    label: string,
    key: K,
    vals: WasslaPrefs[K][],
    labs: string[]
  ): SettingRow => {
    const idx = Math.max(0, vals.indexOf(prefs[key]));
    return {
      label,
      value: labs[idx],
      f: () => {
        onUpdatePrefs({ [key]: vals[(idx + 1) % vals.length] } as Partial<WasslaPrefs>);
      },
      l: () => {
        onUpdatePrefs({
          [key]: vals[(idx + vals.length - 1) % vals.length],
        } as Partial<WasslaPrefs>);
      },
    };
  };

  const buildItems = (): { title: string; list: SettingRow[] } => {
    const list: SettingRow[] = [];
    const safeCf = Math.max(0, Math.min(cf, Math.max(0, sources.length - 1)));
    const s = sources[safeCf];

    if (sm === 'top' || sm === 'main') {
      if (cat === 0) {
        sources.forEach((x, i) => {
          list.push({
            no: String(i + 1),
            label: x.name,
            meta: `${x.n || 0} قناة`,
            statusLabel: x.enabled ? 'مفعّل' : 'متوقف',
            statusOn: x.enabled,
            f: () => {
              setCf(i);
              setSm('src');
              setSi(0);
              setConf(false);
            },
          });
        });
        list.push({
          icon: 'file',
          label: 'إضافة مصدر (ملف M3U / TXT)',
          f: () => fileM3uRef.current?.click(),
        });
        list.push({
          icon: 'link',
          label: 'لصق رابط أو نص M3U',
          f: () => {
            setPasteName('');
            setPasteUrl('');
            setPasteText('');
            setPasteOpen(true);
          },
        });
        if (sources.length) {
          list.push({
            icon: conf ? 'warn' : 'trash',
            label: conf ? 'اضغط OK مرة أخرى للتأكيد' : 'حذف كل المصادر',
            isDanger: true,
            isConfirm: conf,
            f: () => {
              if (!conf) {
                setConf(true);
                return;
              }
              commitSources([], 'main', 0);
            },
          });
        }
        const missingDefaults = DEF_SOURCES.some(
          (d) => !sources.some((x) => String(x.id) === String(d.id))
        );
        if (missingDefaults) {
          list.push({
            icon: 'reset',
            label: 'استرجاع المصادر الافتراضية',
            f: () => {
              const next = [...sources];
              DEF_SOURCES.forEach((d) => {
                if (!next.some((x) => String(x.id) === String(d.id))) {
                  next.push({ ...d, enabled: true });
                }
              });
              onUpdateSources(next);
              onToast('تمت استعادة المصادر الافتراضية');
            },
          });
        }
        return { title: 'المصادر', list };
      }

      if (cat === 1) {
        const H = hiddenList();
        const openChannelOrGroupEditor = (target: 'ch' | 'grp') => {
          const withChannels = sources
            .map((src, idx) => ({ src, idx }))
            .filter((item) => (item.src.all || []).length > 0);
          if (withChannels.length === 0) {
            onToast('لا توجد قنوات حالياً — أضف مصدراً أولاً');
            return;
          }
          setMsel(false);
          setMset({});
          setPickTarget(target);
          if (withChannels.length === 1) {
            setCf(withChannels[0].idx);
            setChGrpReturn('main');
            setSm(target);
            setSi(0);
            setCc(0);
            setGc(0);
          } else {
            setChGrpReturn('picksrc');
            setSm('picksrc');
            setSi(0);
          }
        };

        list.push({
          icon: 'edit',
          label: 'تعديل القنوات',
          meta: `${activeChannelsCount} قناة`,
          f: () => openChannelOrGroupEditor('ch'),
        });
        list.push({
          icon: 'group',
          label: 'إدارة المجموعات',
          f: () => openChannelOrGroupEditor('grp'),
        });
        list.push({
          icon: 'reorder',
          label: 'إعادة ترتيب القنوات (سحب وإفلات / أسهم)',
          f: () => {
            const firstWithChannels = Math.max(
              0,
              sources.findIndex((src) => (src.all || []).length > 0)
            );
            setCf(firstWithChannels);
            setReorderReturnMode('main');
            setDragFromIdx(null);
            setDragOverIdx(null);
            setReorderZone('list');
            setReorderBarIdx(firstWithChannels);
            setReorderCursor(0);
            setReorderGrabbed(false);
            setSm('reorder');
            setSi(0);
          },
        });
        list.push({
          icon: 'eye',
          label: 'القنوات المخفية',
          meta: `${H.length} قناة`,
          f: () => {
            setSm('hid');
            setSi(0);
          },
        });
        list.push({
          icon: 'heart',
          label: 'القنوات المفضلة',
          meta: `${favoritesCount} قناة`,
          f: () => {
            if (onOpenFavorites) onOpenFavorites();
          },
        });
        list.push({
          icon: conf ? 'warn' : 'reset',
          label: conf ? 'اضغط OK مرة أخرى للتأكيد' : 'إلغاء كل تعديلات القنوات',
          isDanger: conf,
          isConfirm: conf,
          f: () => {
            if (!conf) {
              setConf(true);
              return;
            }
            const next = sources.map((src) => ({
              ...src,
              hid: [],
              del: [],
              ord: [],
              chGroup: {},
            }));
            commitSources(next, 'main', 5);
            onToast('تم إلغاء جميع تعديلات القنوات');
          },
        });
        return { title: 'القنوات', list };
      }

      if (cat === 2) {
        list.push(optRow('هامش الشاشة الآمن', 'safe', [0, 3, 5, 8], ['بدون', 'صغير', 'متوسط', 'كبير']));
        list.push(optRow('نسبة الصورة', 'ar', ['contain', 'fill', 'cover'], ['أصلية', 'ملء الشاشة', 'قص']));
        list.push(
          optRow('مدة شريط المعلومات', 'infoMs', [3000, 5000, 8000, 0], [
            '3 ثوانٍ',
            '5 ثوانٍ',
            '8 ثوانٍ',
            'دائم',
          ])
        );
        list.push(optRow('إظهار الساعة', 'clock', [true, false], ['نعم', 'لا']));
        list.push(optRow('إظهار شعار القناة', 'logo', [true, false], ['نعم', 'لا']));
        list.push(
          optRow('نمط قائمة القنوات', 'listStyle', ['tree', 'flat'], [
            'ملفات متفرعة',
            'قائمة موحّدة',
          ])
        );
        list.push(
          optRow('الريموت الافتراضي على الشاشة', 'remoteUi', ['hidden', 'mini', 'open'], [
            'مخفي (TV Box)',
            'زر مصغّر',
            'ظاهر',
          ])
        );
        return { title: 'العرض', list };
      }

      if (cat === 3) {
        list.push(
          optRow('المشغّل', 'engine', ['auto', 'hls', 'sim'], [
            'تلقائي (HLS ثم محاكاة)',
            'HLS مباشر',
            'محاكاة البث فقط',
          ])
        );
        list.push(optRow('محاولات إعادة التشغيل', 'maxRt', [0, 2, 4], ['بدون', 'مرتان', '4 مرات']));
        list.push(optRow('البدء على آخر قناة', 'resume', [true, false], ['نعم', 'لا']));
        list.push(optRow('الانتقال التلقائي عند التعطل', 'autoNext', [false, true], ['لا', 'نعم']));
        return { title: 'التشغيل', list };
      }

      if (cat === 4) {
        list.push({ icon: 'export', label: 'تصدير الإعدادات إلى ملف', f: exportConfig });
        list.push({
          icon: 'import',
          label: 'استيراد الإعدادات من ملف',
          f: () => fileBackupRef.current?.click(),
        });
        return { title: 'نسخ احتياطي', list };
      }

      list.push({ icon: 'tv', label: 'وصلة TV · DAHMAN-SAT', f: () => {} });
      list.push({ icon: 'info', label: `الإصدار ${VER}`, f: () => {} });
      list.push({
        icon: 'globe',
        label: 'wasslatv.blogspot.com',
        f: () => onToast('wasslatv.blogspot.com'),
      });
      list.push({
        icon: 'globe',
        label: 'dzfastlink.blogspot.com',
        f: () => onToast('dzfastlink.blogspot.com'),
      });
      return { title: 'حول التطبيق', list };
    }

    if (sm === 'picksrc') {
      sources.forEach((srcItem, idx) => {
        list.push({
          no: String(idx + 1),
          icon: 'group',
          label: srcItem.name,
          meta: `${(srcItem.all || []).length} قناة`,
          statusLabel: srcItem.enabled ? 'مفعّل' : 'متوقف',
          statusOn: srcItem.enabled,
          f: () => {
            setCf(idx);
            setChGrpReturn('picksrc');
            setSm(pickTarget);
            setSi(0);
            setCc(0);
            setGc(0);
          },
        });
      });
      list.push({ icon: 'back', label: 'رجوع', f: handleBack });
      return {
        title: pickTarget === 'ch' ? 'اختر مصدراً لتعديل قنواته' : 'اختر مصدراً لإدارة مجموعاته',
        list,
      };
    }

    if (sm === 'hid') {
      const H = hiddenList();
      H.forEach((o) => {
        list.push({
          icon: 'eye',
          label: o.c.name,
          meta: o.s.name,
          f: () => {
            const next = sources.map((src) =>
              src.id === o.s.id
                ? { ...src, hid: (src.hid || []).filter((u) => u !== o.c.url) }
                : src
            );
            onUpdateSources(next);
            setSi((prev) => Math.min(prev, Math.max(0, H.length - 2)));
          },
        });
      });
      if (!H.length) list.push({ icon: 'back', label: 'لا توجد قنوات مخفية', f: handleBack });
      return { title: 'القنوات المخفية · OK لإظهار القناة', list };
    }

    if (!s) {
      return { title: 'المصادر', list: [{ icon: 'back', label: 'رجوع', f: handleBack }] };
    }

    if (sm === 'src') {
      list.push({
        icon: s.enabled ? 'paused' : 'active',
        label: s.enabled ? 'إيقاف المصدر' : 'تفعيل المصدر',
        f: () => {
          const next = sources.map((x, idx) => (idx === safeCf ? { ...x, enabled: !x.enabled } : x));
          commitSources(next, 'main', safeCf);
        },
      });
      if (safeCf > 0) {
        list.push({
          icon: 'up',
          label: 'تحريك المصدر للأعلى',
          f: () => {
            const next = [...sources];
            const [item] = next.splice(safeCf, 1);
            next.splice(safeCf - 1, 0, item);
            commitSources(next, 'main', safeCf - 1);
          },
        });
      }
      if (safeCf < sources.length - 1) {
        list.push({
          icon: 'down',
          label: 'تحريك المصدر للأسفل',
          f: () => {
            const next = [...sources];
            const [item] = next.splice(safeCf, 1);
            next.splice(safeCf + 1, 0, item);
            commitSources(next, 'main', safeCf + 1);
          },
        });
      }
      list.push({
        icon: 'edit',
        label: 'إعادة تسمية المصدر',
        f: () =>
          onOpenKeyboard('اسم المصدر', s.name, (val) => {
            const next = sources.map((x, idx) => (idx === safeCf ? { ...x, name: val } : x));
            commitSources(next, 'src', si);
          }),
      });
      list.push({
        icon: 'reorder',
        label: 'إعادة ترتيب القنوات (سحب وإفلات / أسهم)',
        f: () => {
          setReorderReturnMode('src');
          setDragFromIdx(null);
          setDragOverIdx(null);
          setReorderZone('list');
          setReorderBarIdx(safeCf);
          setReorderCursor(0);
          setReorderGrabbed(false);
          setSm('reorder');
          setSi(0);
        },
      });
      list.push({
        icon: 'edit',
        label: 'تعديل القنوات',
        meta: `${(s.all || []).length} قناة`,
        f: () => {
          setMsel(false);
          setMset({});
          setChGrpReturn('src');
          setSm('ch');
          setSi(0);
          setCc(0);
        },
      });
      list.push({
        icon: 'multiselect',
        label: 'تحديد متعدد للقنوات',
        f: () => {
          setMsel(true);
          setMset({});
          setChGrpReturn('src');
          setSm('ch');
          setSi(0);
          setCc(0);
        },
      });
      list.push({
        icon: 'group',
        label: 'المجموعات',
        f: () => {
          setChGrpReturn('src');
          setSm('grp');
          setSi(0);
          setGc(0);
        },
      });
      list.push({
        icon: 'export',
        label: 'تصدير المصدر كملف TXT',
        f: () => {
          const txtContent = formatSourceAsTxt(s);
          const blob = new Blob([txtContent], { type: 'text/plain;charset=utf-8' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${s.name.replace(/[^\w\u0600-\u06FF-]+/g, '_') || 'channels'}.txt`;
          a.click();
          URL.revokeObjectURL(url);
          onToast('تم تصدير ملف TXT بنجاح');
        },
      });
      if ((s.hid && s.hid.length) || (s.del && s.del.length) || (s.ord && s.ord.length)) {
        list.push({
          icon: 'reset',
          label: 'إلغاء تعديلات القنوات',
          f: () => {
            const next = sources.map((x, idx) =>
              idx === safeCf ? { ...x, hid: [], del: [], ord: [], chGroup: {} } : x
            );
            commitSources(next, 'src', 0);
          },
        });
      }
      list.push({
        icon: conf ? 'warn' : 'trash',
        label: conf ? 'اضغط OK مرة أخرى للتأكيد' : 'حذف المصدر',
        isDanger: true,
        isConfirm: conf,
        f: () => {
          if (!conf) {
            setConf(true);
            return;
          }
          const next = sources.filter((_, idx) => idx !== safeCf);
          commitSources(next, 'main', Math.min(safeCf, Math.max(0, next.length - 1)));
        },
      });
      list.push({ icon: 'back', label: 'رجوع', f: handleBack });
      return { title: s.name, list };
    }

    if (sm === 'reorder') {
      return {
        title: `${s.name} · ترتيب القنوات`,
        list: (s.all || []).map((c, i) => ({
          no: String(i + 1),
          label: c.name,
          f: () => {},
        })),
      };
    }

    if (sm === 'ch' || sm === 'move') {
      const arr = sm === 'move' && wk ? wk : s.all || [];
      const hs = setOfUrls(s.hid);
      const ms = sm === 'ch' && msel;
      const nm = Object.keys(mset).length;

      if (ms) {
        list.push({
          icon: 'multiselect',
          label: `إجراءات المحدد (${nm} محددة)`,
          f: () => {
            setSm('msact');
            setSi(0);
            setConf(false);
          },
        });
      }

      arr.forEach((c, i) => {
        const hidden = Boolean(hs[c.url]);
        const marked = Boolean(mset[c.url]);
        list.push({
          no: String(i + 1),
          icon:
            sm === 'move' && i === cc
              ? 'reorder'
              : ms
                ? marked
                  ? 'check'
                  : 'uncheck'
                : hidden
                  ? 'eyeOff'
                  : undefined,
          label: c.name,
          meta: c.group,
          isHidden: !ms && hidden,
          isMarked: ms && marked,
          f: () => {
            if (sm === 'move' && wk) {
              const ord = wk.map((item) => item.url);
              const next = sources.map((x, idx) => (idx === safeCf ? { ...x, ord } : x));
              setWk(null);
              commitSources(next, 'ch', cc);
            } else if (ms) {
              setMset((prev) => {
                const copy = { ...prev };
                if (copy[c.url]) delete copy[c.url];
                else copy[c.url] = true;
                return copy;
              });
            } else {
              setCc(i);
              setSm('chact');
              setSi(0);
              setConf(false);
            }
          },
        });
      });

      if (!arr.length) list.push({ icon: 'back', label: 'لا توجد قنوات', f: handleBack });
      return {
        title:
          s.name +
          (sm === 'move' ? ' · ▲▼ حرّك ثم OK' : ms ? ' · تحديد متعدد' : ' · القنوات'),
        list,
      };
    }

    if (sm === 'msact') {
      const ks = Object.keys(mset);
      const nk = ks.length;
      list.push({
        icon: 'eyeOff',
        label: `إخفاء المحدد (${nk})`,
        f: () => {
          if (!nk) {
            onToast('لا توجد قنوات محددة');
            return;
          }
          const hh = setOfUrls(s.hid);
          const nextHid = [...(s.hid || []), ...ks.filter((u) => !hh[u])];
          const next = sources.map((x, idx) => (idx === safeCf ? { ...x, hid: nextHid } : x));
          setMset({});
          commitSources(next, 'ch', 0);
        },
      });
      list.push({
        icon: conf ? 'warn' : 'trash',
        label: conf ? 'اضغط OK مرة أخرى للتأكيد' : `حذف المحدد نهائياً (${nk})`,
        isDanger: true,
        isConfirm: conf,
        f: () => {
          if (!nk) {
            onToast('لا توجد قنوات محددة');
            return;
          }
          if (!conf) {
            setConf(true);
            return;
          }
          const dd = setOfUrls(ks);
          const next = sources.map((x, idx) =>
            idx === safeCf
              ? {
                  ...x,
                  del: [...(x.del || []), ...ks],
                  hid: (x.hid || []).filter((u) => !dd[u]),
                  ord: (x.ord || []).filter((u) => !dd[u]),
                }
              : x
          );
          setMset({});
          commitSources(next, 'ch', 0);
        },
      });
      list.push({
        icon: 'check',
        label: `تحديد الكل (${(s.all || []).length})`,
        f: () => {
          const nextM: Record<string, true> = {};
          (s.all || []).forEach((c) => {
            nextM[c.url] = true;
          });
          setMset(nextM);
          setSm('ch');
          setSi(0);
        },
      });
      list.push({
        icon: 'uncheck',
        label: 'إلغاء كل التحديد',
        f: () => {
          setMset({});
          setSm('ch');
          setSi(0);
        },
      });
      list.push({
        icon: 'close',
        label: 'إنهاء التحديد المتعدد',
        f: () => {
          setMsel(false);
          setMset({});
          setSm('ch');
          setSi(0);
        },
      });
      list.push({ icon: 'back', label: 'رجوع', f: handleBack });
      return { title: `${s.name} · إجراءات المحدد`, list };
    }

    if (sm === 'chact') {
      const chItem = (s.all || [])[cc];
      if (!chItem) {
        return { title: s.name, list: [{ icon: 'back', label: 'رجوع', f: handleBack }] };
      }
      const isHidden = Boolean(setOfUrls(s.hid)[chItem.url]);
      const total = (s.all || []).length;

      list.push({
        icon: isHidden ? 'eye' : 'eyeOff',
        label: isHidden ? 'إظهار القناة' : 'إخفاء القناة',
        f: () => {
          const nextHid = isHidden
            ? (s.hid || []).filter((u) => u !== chItem.url)
            : [...(s.hid || []), chItem.url];
          const next = sources.map((x, idx) => (idx === safeCf ? { ...x, hid: nextHid } : x));
          commitSources(next, 'ch', cc);
        },
      });
      list.push({
        icon: 'edit',
        label: 'إعادة تسمية القناة',
        f: () =>
          onOpenKeyboard('اسم القناة', chItem.name, (val) => {
            const next = sources.map((x, idx) =>
              idx === safeCf ? { ...x, ren: { ...(x.ren || {}), [chItem.url]: val } } : x
            );
            commitSources(next, 'ch', cc);
          }),
      });
      list.push({
        icon: 'group',
        label: 'تغيير المجموعة',
        meta: chItem.group,
        f: () => {
          setSm('chgrp');
          setSi(0);
          setConf(false);
        },
      });
      list.push({
        icon: 'reorder',
        label: 'تحريك القناة',
        f: () => {
          setWk([...(s.all || [])]);
          setSm('move');
          setSi(cc);
        },
      });
      list.push({
        icon: conf ? 'warn' : 'trash',
        label: conf ? 'اضغط OK مرة أخرى للتأكيد' : 'حذف القناة نهائياً',
        isDanger: true,
        isConfirm: conf,
        f: () => {
          if (!conf) {
            setConf(true);
            return;
          }
          const next = sources.map((x, idx) =>
            idx === safeCf
              ? {
                  ...x,
                  del: [...(x.del || []), chItem.url],
                  hid: (x.hid || []).filter((u) => u !== chItem.url),
                  ord: (x.ord || []).filter((u) => u !== chItem.url),
                }
              : x
          );
          commitSources(next, 'ch', Math.min(cc, Math.max(0, total - 2)));
        },
      });
      list.push({ icon: 'back', label: 'رجوع', f: handleBack });
      return { title: chItem.name, list };
    }

    if (sm === 'chgrp') {
      const chItem = (s.all || [])[cc];
      if (!chItem) {
        return { title: s.name, list: [{ icon: 'back', label: 'رجوع', f: handleBack }] };
      }
      const grpList = Array.from(new Set((s.all || []).map((c) => c.group || 'عامة')));
      grpList.forEach((grpName) => {
        const isCurrent = grpName === (chItem.group || 'عامة');
        list.push({
          icon: isCurrent ? 'check' : 'group',
          label: grpName,
          isMarked: isCurrent,
          f: () => {
            const next = sources.map((x, idx) =>
              idx === safeCf ? { ...x, chGroup: { ...(x.chGroup || {}), [chItem.url]: grpName } } : x
            );
            onUpdateSources(next);
            onToast(`✓ نُقلت القناة إلى «${grpName}»`);
            setSm('chact');
            setSi(2);
          },
        });
      });
      list.push({
        icon: 'edit',
        label: 'مجموعة جديدة...',
        f: () =>
          onOpenKeyboard('اسم المجموعة الجديدة', chItem.group || '', (val) => {
            const trimmed = val.trim();
            if (!trimmed) return;
            const next = sources.map((x, idx) =>
              idx === safeCf ? { ...x, chGroup: { ...(x.chGroup || {}), [chItem.url]: trimmed } } : x
            );
            onUpdateSources(next);
            onToast(`✓ نُقلت القناة إلى «${trimmed}»`);
            setSm('chact');
            setSi(2);
          }),
      });
      list.push({ icon: 'back', label: 'رجوع', f: handleBack });
      return { title: `${chItem.name} · اختر المجموعة`, list };
    }

    if (sm === 'grp') {
      const G = getSourceGroups(s);
      const hs = setOfUrls(s.hid);
      G.forEach((g, i) => {
        const hiddenCnt = g.urls.filter((u) => hs[u]).length;
        const suffix =
          hiddenCnt && hiddenCnt < g.urls.length ? ` (مخفي ${hiddenCnt})` : '';
        list.push({
          no: String(i + 1),
          icon: hiddenCnt === g.urls.length ? 'eyeOff' : 'group',
          label: g.name,
          meta: `${g.urls.length} قناة${suffix}`,
          isHidden: hiddenCnt === g.urls.length,
          f: () => {
            setGc(i);
            setSm('grpact');
            setSi(0);
            setConf(false);
          },
        });
      });
      if (!G.length) list.push({ icon: 'back', label: 'لا توجد مجموعات', f: handleBack });
      return { title: `${s.name} · المجموعات`, list };
    }

    // grpact
    const G2 = getSourceGroups(s);
    const g = G2[gc];
    if (!g) return { title: s.name, list: [{ icon: 'back', label: 'رجوع', f: handleBack }] };
    const hs2 = setOfUrls(s.hid);
    const allHidden = g.urls.every((u) => hs2[u]);
    const gs = setOfUrls(g.urls);

    list.push({
      icon: allHidden ? 'eye' : 'eyeOff',
      label: allHidden ? 'إظهار المجموعة' : 'إخفاء المجموعة',
      f: () => {
        const nextHid = allHidden
          ? (s.hid || []).filter((u) => !gs[u])
          : [...(s.hid || []), ...g.urls.filter((u) => !hs2[u])];
        const next = sources.map((x, idx) => (idx === safeCf ? { ...x, hid: nextHid } : x));
        commitSources(next, 'grp', gc);
      },
    });
    list.push({
      icon: 'edit',
      label: 'إعادة تسمية المجموعة',
      f: () =>
        onOpenKeyboard('اسم المجموعة', g.name, (val) => {
          const next = sources.map((x, idx) =>
            idx === safeCf ? { ...x, gren: { ...(x.gren || {}), [g.og]: val } } : x
          );
          commitSources(next, 'grp', gc);
        }),
    });
    if (gc > 0) {
      list.push({
        icon: 'up',
        label: 'تحريك المجموعة للأعلى',
        f: () => {
          const reordered = [...G2];
          const [moved] = reordered.splice(gc, 1);
          reordered.splice(gc - 1, 0, moved);
          const ord = reordered.flatMap((x) => x.urls);
          const next = sources.map((x, idx) => (idx === safeCf ? { ...x, ord } : x));
          commitSources(next, 'grp', gc - 1);
        },
      });
    }
    if (gc < G2.length - 1) {
      list.push({
        icon: 'down',
        label: 'تحريك المجموعة للأسفل',
        f: () => {
          const reordered = [...G2];
          const [moved] = reordered.splice(gc, 1);
          reordered.splice(gc + 1, 0, moved);
          const ord = reordered.flatMap((x) => x.urls);
          const next = sources.map((x, idx) => (idx === safeCf ? { ...x, ord } : x));
          commitSources(next, 'grp', gc + 1);
        },
      });
    }
    list.push({
      icon: conf ? 'warn' : 'trash',
      label: conf ? 'اضغط OK مرة أخرى للتأكيد' : 'حذف المجموعة نهائياً',
      isDanger: true,
      isConfirm: conf,
      f: () => {
        if (!conf) {
          setConf(true);
          return;
        }
        const next = sources.map((x, idx) =>
          idx === safeCf
            ? {
                ...x,
                del: [...(x.del || []), ...g.urls],
                hid: (x.hid || []).filter((u) => !gs[u]),
                ord: (x.ord || []).filter((u) => !gs[u]),
              }
            : x
        );
        commitSources(next, 'grp', Math.min(gc, Math.max(0, G2.length - 2)));
      },
    });
    list.push({ icon: 'back', label: 'رجوع', f: handleBack });
    return { title: `${g.name} · ${g.urls.length} قناة`, list };
  };

  const safeCf = Math.max(0, Math.min(cf, Math.max(0, sources.length - 1)));
  const { title, list } = buildItems();
  const safeSi = Math.max(0, Math.min(si, Math.max(0, list.length - 1)));

  useEffect(() => {
    if (!isOpen || !navAction) return;
    if (navAction.seq === lastHandledSeqRef.current) return;
    lastHandledSeqRef.current = navAction.seq;

    if (pasteOpen) {
      if (navAction.type === 'back') setPasteOpen(false);
      return;
    }

    if (navAction.type === 'prevCat') {
      selectSection(cat - 1, sm === 'top' ? 'top' : 'main');
      return;
    }
    if (navAction.type === 'nextCat') {
      selectSection(cat + 1, sm === 'top' ? 'top' : 'main');
      return;
    }
    if (navAction.type === 'selectCat' && typeof navAction.catIndex === 'number') {
      selectSection(navAction.catIndex, 'main');
      return;
    }
    if (navAction.type === 'toggleFocus') {
      if (sm === 'top') {
        setSm('main');
        setSi(0);
        setConf(false);
      } else {
        setSm('top');
        setSi(0);
        setConf(false);
        setWk(null);
        setMsel(false);
        setMset({});
      }
      return;
    }

    if (sm === 'move' && wk && (navAction.type === 'up' || navAction.type === 'down')) {
      const to =
        navAction.type === 'up' ? Math.max(0, cc - 1) : Math.min(wk.length - 1, cc + 1);
      if (to !== cc) {
        const copy = [...wk];
        const [moved] = copy.splice(cc, 1);
        copy.splice(to, 0, moved);
        setWk(copy);
        setCc(to);
        setSi(to);
      }
      return;
    }

    if (sm === 'reorder') {
      const chArr = sources[safeCf]?.all || [];
      const hasCustomOrd = Boolean(sources[safeCf]?.ord && sources[safeCf].ord!.length > 0);
      const barTotal = sources.length + (hasCustomOrd ? 1 : 0);

      if (reorderZone === 'bar') {
        if (navAction.type === 'left') {
          setReorderBarIdx((idx) => (idx + 1 >= barTotal ? 0 : idx + 1));
        } else if (navAction.type === 'right') {
          setReorderBarIdx((idx) => (idx - 1 < 0 ? Math.max(0, barTotal - 1) : idx - 1));
        } else if (navAction.type === 'down') {
          if (chArr.length > 0) {
            setReorderZone('list');
            setReorderCursor(0);
          }
        } else if (navAction.type === 'ok') {
          if (reorderBarIdx < sources.length) {
            setCf(reorderBarIdx);
            setReorderCursor(0);
            setReorderGrabbed(false);
            if ((sources[reorderBarIdx]?.all || []).length > 0) {
              setReorderZone('list');
            }
          } else if (hasCustomOrd) {
            resetSourceOrder(safeCf);
            setReorderBarIdx(safeCf);
          }
        } else if (navAction.type === 'back') {
          handleBack();
        }
        return;
      }

      if (!chArr.length) {
        if (navAction.type === 'up') {
          setReorderZone('bar');
          setReorderBarIdx(safeCf);
        } else if (navAction.type === 'back') {
          handleBack();
        }
        return;
      }

      const safeCur = Math.max(0, Math.min(reorderCursor, chArr.length - 1));
      if (reorderGrabbed) {
        if (navAction.type === 'up') {
          const to = Math.max(0, safeCur - 1);
          if (to !== safeCur) {
            reorderSourceChannel(safeCf, safeCur, to);
            setReorderCursor(to);
          }
        } else if (navAction.type === 'down') {
          const to = Math.min(chArr.length - 1, safeCur + 1);
          if (to !== safeCur) {
            reorderSourceChannel(safeCf, safeCur, to);
            setReorderCursor(to);
          }
        } else if (navAction.type === 'ok') {
          setReorderGrabbed(false);
          onToast('✓ تم تثبيت ترتيب القناة محلياً');
        } else if (navAction.type === 'back') {
          setReorderGrabbed(false);
        }
        return;
      }

      if (navAction.type === 'up') {
        if (safeCur === 0) {
          setReorderZone('bar');
          setReorderBarIdx(safeCf);
        } else {
          setReorderCursor(safeCur - 1);
        }
      } else if (navAction.type === 'down') {
        setReorderCursor(safeCur + 1 >= chArr.length ? 0 : safeCur + 1);
      } else if (navAction.type === 'left') {
        setReorderCursor(Math.min(chArr.length - 1, safeCur + 6));
      } else if (navAction.type === 'right') {
        setReorderCursor(Math.max(0, safeCur - 6));
      } else if (navAction.type === 'ok') {
        setReorderCursor(safeCur);
        setReorderGrabbed(true);
      } else if (navAction.type === 'back') {
        handleBack();
      }
      return;
    }

    if (sm === 'top') {
      if (navAction.type === 'down') {
        selectSection(cat + 1, 'top');
        return;
      }
      if (navAction.type === 'up') {
        selectSection(cat - 1, 'top');
        return;
      }
      if (navAction.type === 'left' || navAction.type === 'ok') {
        setSm('main');
        setSi(0);
        setConf(false);
        return;
      }
      if (navAction.type === 'back') {
        onClose();
        return;
      }
      return;
    }

    if (sm === 'main' && (navAction.type === 'left' || navAction.type === 'right')) {
      const row = list[safeSi];
      if (row && row.l) {
        if (navAction.type === 'left') row.f();
        else row.l();
      } else if (navAction.type === 'right') {
        setSm('top');
        setConf(false);
      } else if (navAction.type === 'left' && row) {
        row.f();
      }
      return;
    }

    if (
      (sm === 'ch' || sm === 'grp' || sm === 'hid') &&
      (navAction.type === 'left' || navAction.type === 'right')
    ) {
      const delta = navAction.type === 'left' ? visCount : -visCount;
      setSi(Math.max(0, Math.min(list.length - 1, safeSi + delta)));
      return;
    }

    if (navAction.type === 'down') {
      setSi(safeSi + 1 >= list.length ? 0 : safeSi + 1);
      setConf(false);
    } else if (navAction.type === 'up') {
      setSi(safeSi - 1 < 0 ? Math.max(0, list.length - 1) : safeSi - 1);
      setConf(false);
    } else if (navAction.type === 'ok') {
      list[safeSi]?.f();
    } else if (navAction.type === 'back') {
      handleBack();
    }
  });

  const handleM3uFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      const text = await readPlaylistFileText(file);
      const parsed = parsePlaylistText(text);
      if (!parsed.length) {
        onToast('الملف لا يحتوي على قنوات صالحة');
        return;
      }
      const next: SourceItem[] = [
        ...sources,
        {
          id: Date.now(),
          name: file.name.replace(/\.[^.]+$/, ''),
          enabled: true,
          text,
        },
      ];
      onUpdateSources(next);
      setPasteOpen(false);
      setCat(0);
      setSm('main');
      setSi(next.length - 1);
      onToast(`تمت إضافة ${parsed.length} قناة من ${file.name}`);
    } catch {
      onToast('تعذر قراءة الملف');
    }
  };

  const handleBackupImport = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result || ''));
        if (!parsed || parsed.app !== 'wassla-tv' || !Array.isArray(parsed.srcs)) {
          throw new Error('Invalid');
        }
        const defMap: Record<string, SourceItem> = {};
        DEF_SOURCES.forEach((d) => {
          defMap[String(d.id)] = d;
        });
        const imported: SourceItem[] = [];
        parsed.srcs.forEach((x: SourceItem) => {
          const text = x.text != null ? x.text : defMap[String(x.id)]?.text;
          if (text != null) {
            imported.push({
              id: x.id,
              name: x.name,
              enabled: x.enabled !== false,
              text,
              hid: x.hid || [],
              del: x.del || [],
              ord: x.ord || [],
              ren: x.ren || {},
              gren: x.gren || {},
              chGroup: x.chGroup || {},
            });
          }
        });
        if (!imported.length) throw new Error('Empty');
        onUpdateSources(imported);
        if (parsed.prefs) onUpdatePrefs(parsed.prefs);
        setSm('main');
        setSi(0);
        onToast('تم استيراد الإعدادات بنجاح');
      } catch {
        onToast('ملف النسخ الاحتياطي غير صالح');
      }
    };
    reader.readAsText(file);
  };

  const handleSavePastedSource = () => {
    const parsed = parsePlaylistText(pasteText);
    if (!parsed.length) {
      onToast('النص لا يحتوي على روابط قنوات صالحة');
      return;
    }
    const next: SourceItem[] = [
      ...sources,
      {
        id: Date.now(),
        name: pasteName.trim() || `قائمة ${sources.length + 1}`,
        enabled: true,
        text: pasteText,
      },
    ];
    onUpdateSources(next);
    setPasteOpen(false);
    setCat(0);
    setSm('main');
    setSi(next.length - 1);
    onToast(`تمت إضافة ${parsed.length} قناة`);
  };

  const handleFetchPasteUrl = async () => {
    if (!pasteUrl.trim()) return;
    setIsFetchingUrl(true);
    try {
      const res = await fetch(pasteUrl.trim());
      if (!res.ok) throw new Error('HTTP error');
      const txt = await res.text();
      setPasteText(txt);
      onToast('تم جلب القائمة، اضغط حفظ المصدر');
    } catch {
      onToast('تعذر جلب الرابط بسبب قيود CORS — يمكنك لصق النص مباشرة');
    } finally {
      setIsFetchingUrl(false);
    }
  };

  if (!isOpen) return null;

  const st = Math.max(0, Math.min(safeSi - Math.floor(visCount / 2), list.length - visCount));
  const visibleRows = list.slice(st, st + visCount);
  const hasScroll = list.length > visCount;

  const renderRowIcon = (kind: RowIconKind | undefined, isSelected: boolean, isDanger?: boolean) => {
    if (!kind) return null;
    const baseCls = `w-4 h-4 shrink-0 ${
      isSelected
        ? 'text-[#050a18]'
        : isDanger
          ? 'text-rose-400'
          : kind === 'heart'
            ? 'text-rose-400'
            : kind === 'active'
              ? 'text-emerald-400'
              : kind === 'paused'
                ? 'text-amber-300'
                : 'text-[#ffc400]'
    }`;

    switch (kind) {
      case 'active':
        return <CheckCircle2 className={baseCls} />;
      case 'paused':
        return <PauseCircle className={baseCls} />;
      case 'file':
        return <FilePlus className={baseCls} />;
      case 'link':
        return <Link className={baseCls} />;
      case 'trash':
        return <Trash2 className={baseCls} />;
      case 'warn':
        return <AlertTriangle className={baseCls} />;
      case 'reset':
        return <RotateCcw className={baseCls} />;
      case 'heart':
        return <Heart className={baseCls} />;
      case 'reorder':
        return <ArrowUpDown className={baseCls} />;
      case 'eye':
        return <Eye className={baseCls} />;
      case 'eyeOff':
        return <EyeOff className={baseCls} />;
      case 'up':
        return <ArrowUp className={baseCls} />;
      case 'down':
        return <ArrowDown className={baseCls} />;
      case 'edit':
        return <Pencil className={baseCls} />;
      case 'group':
        return <Folder className={baseCls} />;
      case 'export':
        return <Upload className={baseCls} />;
      case 'import':
        return <Download className={baseCls} />;
      case 'check':
        return <CheckSquare className={baseCls} />;
      case 'uncheck':
        return <Square className={baseCls} />;
      case 'multiselect':
        return <ListChecks className={baseCls} />;
      case 'close':
        return <X className={baseCls} />;
      case 'back':
        return <Undo2 className={baseCls} />;
      case 'globe':
        return <Globe className={baseCls} />;
      case 'tv':
        return <Tv className={baseCls} />;
      case 'info':
        return <Info className={baseCls} />;
    }
  };

  const renderRow = (row: SettingRow, idxInView: number) => {
    const absIdx = st + idxInView;
    const isSelected = sm !== 'top' && absIdx === safeSi;

    return (
      <button
        key={`${absIdx}-${row.label}`}
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => {
          if (sm === 'top') setSm('main');
          setSi(absIdx);
          row.f();
        }}
        style={{ height: `${rowHeight}px` }}
        className={`w-full flex items-center gap-3 px-4 rounded-xl border text-base whitespace-nowrap cursor-pointer transition-colors duration-150 ${
          isSelected
            ? row.isConfirm
              ? 'bg-rose-500 text-white border-white font-bold'
              : 'wassla-tv-focus'
            : row.isConfirm
              ? 'bg-rose-950/70 text-rose-100 border-rose-500/60'
              : row.isMarked
                ? 'bg-[#ffc400]/12 text-white border-[#ffc400]/60'
                : 'bg-white/[0.035] hover:bg-white/[0.075] text-slate-100 border-white/10'
        }`}
      >
        {row.no && (
          <span
            className={`min-w-[28px] text-center font-bold font-mono-tech text-sm ${
              isSelected ? 'text-[#050a18]' : 'text-[#ffc400]'
            }`}
          >
            {row.no}
          </span>
        )}
        {renderRowIcon(row.icon, isSelected, row.isDanger)}
        <span
          className={`flex-1 text-right truncate ${
            row.isHidden ? 'opacity-55 line-through' : ''
          }`}
        >
          {row.label}
        </span>
        {row.meta && (
          <span
            className={`text-xs shrink-0 font-mono-tech ${
              isSelected ? 'text-[#050a18]/75' : 'text-[#94a8c9]'
            }`}
          >
            {row.meta}
          </span>
        )}
        {row.statusLabel && (
          <span
            className={`text-xs font-bold shrink-0 ${
              isSelected
                ? 'text-[#050a18]'
                : row.statusOn
                  ? 'text-emerald-400'
                  : 'text-rose-400'
            }`}
          >
            · {row.statusLabel}
          </span>
        )}
        {row.value && (
          <span
            className={`px-3 py-1 rounded-lg text-xs sm:text-sm font-bold shrink-0 border flex items-center gap-2 ${
              isSelected
                ? 'bg-[#050a18] text-[#ffc400] border-[#050a18]'
                : 'bg-white/[0.06] text-[#ffc400] border-white/15'
            }`}
          >
            <span>◄</span>
            <span>{row.value}</span>
            <span>►</span>
          </span>
        )}
      </button>
    );
  };

  let infoBoxText = '';
  if ((sm === 'main' || sm === 'top') && cat === 0) {
    infoBoxText = sources.length
      ? `القنوات المفعّلة: ${activeChannelsCount} · ترتيب المصادر يحدد ترقيم القنوات`
      : 'لا توجد مصادر بعد — اختر ملف M3U / TXT أو الصق رابط القائمة';
  } else if (sm === 'ch') {
    infoBoxText = msel
      ? 'OK لتحديد القناة أو إلغاء تحديدها · السطر الأول لإجراءات المحدد'
      : 'اضغط OK على أي قناة لإخفائها أو تحريكها أو حذفها أو إعادة تسميتها';
  } else if ((sm === 'main' || sm === 'top') && cat === 4) {
    infoBoxText =
      'يُحفظ ملف النسخ الاحتياطي بصيغة JSON · الاستيراد يستبدل مصادرك وتعديلاتك الحالية';
  }

  return (
    <div
      style={{ padding: `calc(var(--sf) + 1%) calc(var(--sf) + 2%)` }}
      className="fixed inset-0 z-30 wassla-settings-bg flex flex-col md:flex-row overflow-hidden"
    >
      <input
        ref={fileM3uRef}
        type="file"
        accept=".m3u,.m3u8,.txt"
        onChange={handleM3uFileChange}
        className="hidden"
      />
      <input
        ref={fileBackupRef}
        type="file"
        accept=".json"
        onChange={handleBackupImport}
        className="hidden"
      />

      {/* Sidebar */}
      <aside
        className={`w-full md:w-[26%] max-w-[300px] shrink-0 bg-[#040916]/90 border-b md:border-b-0 md:border-l p-3.5 flex flex-col transition-colors ${
          sm === 'top' ? 'border-[#ffc400]/65' : 'border-white/10'
        }`}
      >
        <div className="flex items-center justify-between gap-2 pb-3 mb-3 border-b border-white/10">
          <div className="flex flex-col gap-1.5 min-w-0">
            <img
              src="/assets/aistudio/banner_cobalt_de32e445.png"
              alt="وصلة TV — DAHMAN-SAT"
              className="h-9 w-auto max-w-[180px] rounded-lg object-cover border border-white/15 bg-[#071028]"
            />
            <span
              dir="ltr"
              className="font-mono-tech text-[11px] font-bold tracking-[0.18em] text-[#ffc400]"
            >
              DAHMAN-SAT
            </span>
          </div>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={onClose}
            className="md:hidden px-3 py-1.5 rounded-lg bg-white/10 border border-white/15 text-xs font-bold cursor-pointer"
          >
            إغلاق
          </button>
        </div>

        <div className="flex flex-wrap md:flex-nowrap md:flex-col gap-1.5 flex-1">
          {CATS.map((item, i) => {
            const active = i === cat;
            const sidebarFocused = sm === 'top' && active;
            const dimmed = sm !== 'main' && sm !== 'top' && !active;
            const Icon = item.icon;
            return (
              <button
                key={item.name}
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSection(i, 'main')}
                className={`flex items-center gap-3 px-3.5 py-2.5 rounded-xl text-sm sm:text-base whitespace-nowrap shrink-0 border transition-colors duration-150 cursor-pointer ${
                  sidebarFocused
                    ? 'wassla-tv-focus'
                    : active
                      ? 'bg-[#12316b]/85 text-white font-bold border-[#4f7fc9]/65'
                      : 'bg-transparent text-[#94a8c9] border-transparent hover:bg-white/[0.05] hover:text-white'
                } ${dimmed ? 'opacity-50' : ''}`}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    sidebarFocused
                      ? 'text-[#050a18]'
                      : active
                        ? 'text-[#ffc400]'
                        : 'text-[#94a8c9]'
                  }`}
                />
                <span>{item.name}</span>
              </button>
            );
          })}
        </div>

        <div className="hidden md:block text-center text-xs text-[#647a9e] pt-2 font-mono-tech">
          الإصدار {VER}
        </div>
      </aside>

      {/* Main Content */}
      <section className="flex-1 min-w-0 min-h-0 flex flex-col">
        <div className="wassla-ph px-5 py-3 flex items-center justify-between gap-3">
          <div className="text-base sm:text-lg font-bold truncate flex items-center gap-2">
            {sm === 'top' ? (
              <>
                <span className="font-normal text-[#ffc400]">الأقسام ›</span>
                <span>{title}</span>
              </>
            ) : sm === 'main' ? (
              <>
                <span className="font-normal text-[#94a8c9]">الإعدادات ›</span>
                <span>{title}</span>
              </>
            ) : (
              <>
                <span className="font-normal text-[#94a8c9]">{CATS[cat].name} ›</span>
                <span>{title}</span>
              </>
            )}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="hidden sm:flex items-center gap-1">
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSection(cat - 1, sm === 'top' ? 'top' : 'main')}
                title="القسم السابق (PageUp)"
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-[#c5d4ee] hover:text-white cursor-pointer whitespace-nowrap"
              >
                ▲ السابق
              </button>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSection(cat + 1, sm === 'top' ? 'top' : 'main')}
                title="القسم التالي (PageDown)"
                className="px-2.5 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-[#c5d4ee] hover:text-white cursor-pointer whitespace-nowrap"
              >
                ▼ التالي
              </button>
            </div>
            {sm === 'reorder' ? (
              <span className="font-mono-tech text-sm text-[#ffc400]">
                {(sources[safeCf]?.all || []).length} قناة
              </span>
            ) : (
              sm !== 'top' &&
              list.length > 1 && (
                <span className="font-mono-tech text-sm text-[#ffc400]">
                  {safeSi + 1} / {list.length}
                </span>
              )
            )}
            {sm !== 'top' && (
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => selectSection(cat, 'top')}
                className="px-2.5 py-1 rounded-lg bg-[#12316b]/85 hover:bg-[#1a4391] border border-[#4f7fc9]/50 text-xs text-white cursor-pointer whitespace-nowrap"
              >
                الأقسام
              </button>
            )}
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={handleBack}
              className="px-3 py-1 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-xs text-[#94a8c9] hover:text-white cursor-pointer whitespace-nowrap"
            >
              {sm === 'top' ? 'إغلاق' : 'رجوع'}
            </button>
          </div>
        </div>

        <div className="flex-1 min-h-0 p-4 flex flex-col gap-3 relative">
          {sm === 'reorder' ? (
            <div className="flex-1 min-h-0 flex flex-col gap-3">
              {/* Source Switcher + Reset Order Bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 bg-white/[0.03] border border-white/10 rounded-xl p-2.5">
                <div className="flex flex-wrap items-center gap-1.5">
                  {sources.map((srcItem, idx) => {
                    const isBarFocused = reorderZone === 'bar' && reorderBarIdx === idx;
                    return (
                      <button
                        key={String(srcItem.id)}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => {
                          setCf(idx);
                          setDragFromIdx(null);
                          setDragOverIdx(null);
                          setReorderCursor(0);
                          setReorderGrabbed(false);
                          setReorderZone('list');
                        }}
                        className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-colors cursor-pointer whitespace-nowrap ${
                          isBarFocused
                            ? 'wassla-tv-focus'
                            : idx === safeCf
                              ? 'bg-[#12316b] text-[#ffc400] border-[#ffc400]/70'
                              : 'bg-white/5 hover:bg-white/10 text-slate-200 border-white/10'
                        }`}
                      >
                        {srcItem.name} ({(srcItem.all || []).length})
                      </button>
                    );
                  })}
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[11px] text-emerald-300">
                    يُحفظ الترتيب محلياً تلقائياً
                  </span>
                  {sources[safeCf]?.ord && sources[safeCf].ord!.length > 0 && (
                    <button
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => resetSourceOrder(safeCf)}
                      className={`px-2.5 py-1 rounded-lg text-xs inline-flex items-center gap-1 cursor-pointer transition-colors border ${
                        reorderZone === 'bar' && reorderBarIdx === sources.length
                          ? 'wassla-tv-focus'
                          : 'bg-white/5 hover:bg-rose-600/80 text-white border-white/10'
                      }`}
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>الترتيب الأصلي</span>
                    </button>
                  )}
                </div>
              </div>

              {/* Scrollable Drag-and-Drop + D-Pad Channel List */}
              <div
                ref={reorderListRef}
                className="flex-1 min-h-0 overflow-y-auto wassla-scroll pr-1 flex flex-col gap-1.5"
              >
                {!sources[safeCf] || !(sources[safeCf].all || []).length ? (
                  <div className="flex-1 flex items-center justify-center text-sm text-[#94a8c9]">
                    لا توجد قنوات في هذا المصدر لإعادة ترتيبها
                  </div>
                ) : (
                  (sources[safeCf].all || []).map((chItem, idx, arr) => {
                    const isDragging = dragFromIdx === idx;
                    const isDropTarget =
                      dragOverIdx === idx && dragFromIdx !== null && dragFromIdx !== idx;
                    const isDpadFocused = reorderZone === 'list' && reorderCursor === idx;
                    const isGrabbed = isDpadFocused && reorderGrabbed;
                    return (
                      <div
                        key={chItem.url}
                        draggable
                        onClick={() => {
                          setReorderZone('list');
                          if (isGrabbed) {
                            setReorderGrabbed(false);
                            onToast('✓ تم تثبيت ترتيب القناة محلياً');
                          } else {
                            setReorderCursor(idx);
                          }
                        }}
                        onDragStart={(e) => {
                          setReorderGrabbed(false);
                          setReorderCursor(idx);
                          setDragFromIdx(idx);
                          setDragOverIdx(idx);
                          e.dataTransfer.effectAllowed = 'move';
                          e.dataTransfer.setData('text/plain', String(idx));
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          e.dataTransfer.dropEffect = 'move';
                          if (dragOverIdx !== idx) setDragOverIdx(idx);
                        }}
                        onDrop={(e) => {
                          e.preventDefault();
                          const rawFrom = e.dataTransfer.getData('text/plain');
                          const from =
                            dragFromIdx !== null
                              ? dragFromIdx
                              : rawFrom !== ''
                                ? Number(rawFrom)
                                : -1;
                          if (from >= 0 && from !== idx) {
                            reorderSourceChannel(safeCf, from, idx);
                            setReorderCursor(idx);
                            onToast('تم حفظ الترتيب المخصص محلياً');
                          }
                          setDragFromIdx(null);
                          setDragOverIdx(null);
                        }}
                        onDragEnd={() => {
                          setDragFromIdx(null);
                          setDragOverIdx(null);
                        }}
                        className={`flex items-center gap-2.5 px-3.5 py-2.5 rounded-xl border select-none cursor-grab active:cursor-grabbing transition-colors ${
                          isGrabbed
                            ? 'bg-emerald-900/75 text-white border-[#ffc400] shadow-[0_0_0_2px_rgba(255,196,0,0.45)]'
                            : isDragging
                              ? 'opacity-45 bg-[#12316b] border-[#ffc400]'
                              : isDropTarget
                                ? 'bg-[#ffc400]/20 border-[#ffc400]'
                                : isDpadFocused
                                  ? 'wassla-tv-focus'
                                  : 'bg-white/[0.035] hover:bg-white/[0.075] border-white/10'
                        }`}
                      >
                        <GripVertical
                          className={`w-4 h-4 shrink-0 ${
                            isDpadFocused && !isGrabbed ? 'text-[#050a18]' : 'text-[#94a8c9]'
                          }`}
                        />
                        <span
                          className={`font-mono-tech min-w-[30px] text-center font-bold text-sm ${
                            isDpadFocused && !isGrabbed ? 'text-[#050a18]' : 'text-[#ffc400]'
                          }`}
                        >
                          {idx + 1}
                        </span>
                        {chItem.logo ? (
                          <img
                            src={chItem.logo}
                            alt=""
                            onError={(e) => {
                              (e.currentTarget as HTMLImageElement).style.display = 'none';
                            }}
                            className="w-7 h-7 object-contain rounded bg-black/30 shrink-0 pointer-events-none"
                          />
                        ) : null}
                        <span className="flex-1 text-right text-sm sm:text-base font-medium truncate">
                          {chItem.name}
                        </span>
                        {isGrabbed ? (
                          <span className="text-xs text-[#ffc400] font-bold shrink-0">
                            ▲▼ حرّك · OK تثبيت
                          </span>
                        ) : (
                          <span
                            className={`hidden sm:inline text-xs shrink-0 ${
                              isDpadFocused ? 'text-[#050a18]/75' : 'text-[#94a8c9]'
                            }`}
                          >
                            {chItem.group}
                          </span>
                        )}
                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            disabled={idx === 0}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={(e) => {
                              e.stopPropagation();
                              reorderSourceChannel(safeCf, idx, idx - 1);
                              setReorderCursor(idx - 1);
                            }}
                            title="تحريك للأعلى"
                            aria-label="تحريك للأعلى"
                            className="w-7 h-7 rounded-lg bg-black/30 hover:bg-black/50 disabled:opacity-30 border border-white/15 flex items-center justify-center text-white cursor-pointer disabled:cursor-default"
                          >
                            <ArrowUp className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            disabled={idx === arr.length - 1}
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={(e) => {
                              e.stopPropagation();
                              reorderSourceChannel(safeCf, idx, idx + 1);
                              setReorderCursor(idx + 1);
                            }}
                            title="تحريك للأسفل"
                            aria-label="تحريك للأسفل"
                            className="w-7 h-7 rounded-lg bg-black/30 hover:bg-black/50 disabled:opacity-30 border border-white/15 flex items-center justify-center text-white cursor-pointer disabled:cursor-default"
                          >
                            <ArrowDown className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ) : (
            <div
              ref={bodyRef}
              onWheel={(e) => {
                if (sm === 'top') {
                  if (e.deltaY > 0) selectSection(cat + 1, 'top');
                  else if (e.deltaY < 0) selectSection(cat - 1, 'top');
                  return;
                }
                if (e.deltaY > 0) {
                  setSi((prev) => Math.min(list.length - 1, prev + 1));
                } else if (e.deltaY < 0) {
                  setSi((prev) => Math.max(0, prev - 1));
                }
              }}
              className={`flex-1 min-h-0 flex flex-col gap-2 relative overflow-hidden ${
                hasScroll ? 'pl-4' : ''
              } ${sm === 'top' ? 'opacity-75' : ''}`}
            >
              {visibleRows.map((row, idx) => renderRow(row, idx))}
              {hasScroll && (
                <div className="absolute left-0 top-1 bottom-1 w-1 rounded bg-white/10">
                  <div
                    className="absolute inset-x-0 rounded bg-[#ffc400]"
                    style={{
                      top: `${(st / list.length) * 100}%`,
                      height: `${(visCount / list.length) * 100}%`,
                    }}
                  />
                </div>
              )}
            </div>
          )}

          {infoBoxText && (
            <div className="text-xs sm:text-sm text-[#94a8c9] px-3.5 py-2 rounded-xl bg-white/[0.03] border border-white/10">
              {infoBoxText}
            </div>
          )}
          {(sm === 'main' || sm === 'top') && cat === 5 && (
            <div
              dir="ltr"
              className="text-center text-xs text-[#94a8c9]/80 px-3.5 py-2 rounded-xl bg-white/[0.03] border border-white/10"
            >
              DAHMAN-SAT · Interface by Atallaoui Dahman
            </div>
          )}
        </div>

        {/* Footer Keys */}
        <div className="px-5 py-2.5 border-t border-white/10 bg-black/35 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-[#94a8c9]">
          {sm === 'reorder' ? (
            <>
              <span>OK {reorderGrabbed ? 'تثبيت القناة' : 'التقاط للتحريك'}</span>
              <span>·</span>
              <span>▲▼ {reorderGrabbed ? 'نقل للأعلى / للأسفل' : 'تنقّل'}</span>
              <span>·</span>
              <span>BACK {reorderGrabbed ? 'إفلات' : 'رجوع'}</span>
            </>
          ) : (
            <>
              <span>▲▼ {sm === 'top' ? 'التنقل بين الأقسام' : 'تنقّل'}</span>
              <span>·</span>
              <span>{sm === 'top' ? 'OK / ◄ دخول القسم' : 'OK اختيار'}</span>
              {(sm === 'main' && (cat === 2 || cat === 3)) ||
              sm === 'ch' ||
              sm === 'grp' ||
              sm === 'hid' ? (
                <>
                  <span>·</span>
                  <span>◄ ► {sm === 'main' ? 'تغيير القيمة' : 'صفحة'}</span>
                </>
              ) : sm === 'main' ? (
                <>
                  <span>·</span>
                  <span>► الأقسام</span>
                </>
              ) : null}
              <span>·</span>
              <span>BACK {sm === 'top' ? 'إغلاق' : 'رجوع'}</span>
            </>
          )}
        </div>
      </section>

      {/* Paste M3U Modal */}
      {pasteOpen && (
        <div
          onClick={() => setPasteOpen(false)}
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="wassla-panel w-full max-w-xl rounded-2xl overflow-hidden flex flex-col"
          >
            <div className="wassla-ph px-5 py-3.5 font-bold flex items-center justify-between">
              <span>إضافة مصدر (TXT / M3U / IPTV)</span>
              <button
                type="button"
                onClick={() => setPasteOpen(false)}
                className="text-xs text-[#ffc400] cursor-pointer"
              >
                إغلاق
              </button>
            </div>
            <div className="p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => fileM3uRef.current?.click()}
                  className="px-3.5 py-2 rounded-lg bg-[#12316b] hover:bg-[#1a4391] border border-[#4f7fc9]/50 text-xs font-bold text-white inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <FilePlus className="w-3.5 h-3.5 text-[#ffc400]" />
                  <span>اختيار ملف TXT / M3U من الجهاز</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPasteName('قائمة TXT تجريبية');
                    setPasteText(
                      `أخبار,#genre#\nالجزيرة الإخبارية,https://live-hls-web-aja.getaj.net/AJA/index.m3u8\nفرانس 24 عربي,https://live.france24.com/hls/live/2037222-b/F24_AR_HI_HLS/master_5000.m3u8\n\nوثائقي,#genre#\nناسا TV UHD,https://ntv1.akamaized.net/hls/live/2014075/NASA-NTV1-HLS/master.m3u8`
                    );
                  }}
                  className="px-3 py-2 rounded-lg bg-white/10 hover:bg-white/20 text-xs text-[#ffc400] font-semibold cursor-pointer"
                >
                  تعبئة نموذج TXT
                </button>
              </div>
              <input
                type="text"
                value={pasteName}
                onChange={(e) => setPasteName(e.target.value)}
                placeholder="اسم المصدر (مثال: قنواتي TXT)"
                className="w-full px-3.5 py-2.5 rounded-lg bg-black/60 border border-white/15 text-white text-sm focus:outline-none focus:border-[#ffc400]"
              />
              <div className="flex gap-2">
                <input
                  type="url"
                  dir="ltr"
                  value={pasteUrl}
                  onChange={(e) => setPasteUrl(e.target.value)}
                  placeholder="https://example.com/channels.txt أو playlist.m3u"
                  className="flex-1 px-3.5 py-2.5 rounded-lg bg-black/60 border border-white/15 text-white text-sm font-mono-tech focus:outline-none focus:border-[#ffc400]"
                />
                <button
                  type="button"
                  onClick={handleFetchPasteUrl}
                  disabled={isFetchingUrl || !pasteUrl.trim()}
                  className="px-4 py-2 rounded-lg bg-[#12316b] hover:bg-[#1a4391] disabled:opacity-50 border border-[#4f7fc9]/50 text-xs font-bold cursor-pointer whitespace-nowrap"
                >
                  {isFetchingUrl ? 'جاري الجلب...' : 'جلب الرابط'}
                </button>
              </div>
              <textarea
                dir="ltr"
                rows={6}
                value={pasteText}
                onChange={(e) => setPasteText(e.target.value)}
                placeholder={'صيغة ملف TXT:\nأخبار,#genre#\nاسم القناة,https://example.com/live.m3u8\nقناة أخرى|https://example.com/stream.m3u8\n\nأو صيغة M3U:\n#EXTM3U\n#EXTINF:-1,اسم القناة\nhttps://example.com/live.m3u8'}
                className="w-full p-3 rounded-lg bg-black/60 border border-white/15 text-white text-xs font-mono-tech focus:outline-none focus:border-[#ffc400]"
              />
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setPasteOpen(false)}
                  className="px-4 py-2 rounded-lg bg-white/10 text-xs font-bold cursor-pointer"
                >
                  إلغاء
                </button>
                <button
                  type="button"
                  onClick={handleSavePastedSource}
                  className="px-5 py-2 rounded-lg bg-[#ffc400] hover:bg-amber-300 text-[#050a18] text-xs font-bold cursor-pointer"
                >
                  حفظ المصدر
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
