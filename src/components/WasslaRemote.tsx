import React, { useRef, useState } from 'react';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Heart,
  History,
  Info,
  List,
  Power,
  Radio,
  RotateCcw,
  Settings,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';

interface WasslaRemoteProps {
  isOpen: boolean;
  isPoweredOn: boolean;
  isMuted: boolean;
  onToggleOpen: () => void;
  onPower: () => void;
  onMute: () => void;
  onDigit: (d: string) => void;
  onUp: () => void;
  onDown: () => void;
  onLeft: () => void;
  onRight: () => void;
  onOk: () => void;
  onOkLongPress: () => void;
  onBack: () => void;
  onInfo: () => void;
  onList: () => void;
  onFavorites: () => void;
  onRecent: () => void;
  onSources: () => void;
  onSettings: () => void;
  onVolumeUp: () => void;
  onVolumeDown: () => void;
}

export const WasslaRemote: React.FC<WasslaRemoteProps> = ({
  isOpen,
  isPoweredOn,
  isMuted,
  onToggleOpen,
  onPower,
  onMute,
  onDigit,
  onUp,
  onDown,
  onLeft,
  onRight,
  onOk,
  onOkLongPress,
  onBack,
  onInfo,
  onList,
  onFavorites,
  onRecent,
  onSources,
  onSettings,
  onVolumeUp,
  onVolumeDown,
}) => {
  const [irFlash, setIrFlash] = useState(false);
  const okHoldTimerRef = useRef<number | null>(null);
  const okHeldLongRef = useRef(false);

  const pulse = (fn: () => void) => {
    setIrFlash(true);
    window.setTimeout(() => setIrFlash(false), 120);
    fn();
  };

  const clearOkHoldTimer = () => {
    if (okHoldTimerRef.current !== null) {
      window.clearTimeout(okHoldTimerRef.current);
      okHoldTimerRef.current = null;
    }
  };

  const handleOkPointerDown = () => {
    clearOkHoldTimer();
    okHeldLongRef.current = false;
    okHoldTimerRef.current = window.setTimeout(() => {
      okHoldTimerRef.current = null;
      okHeldLongRef.current = true;
      pulse(onOkLongPress);
    }, 520);
  };

  const handleOkClick = () => {
    clearOkHoldTimer();
    if (okHeldLongRef.current) {
      okHeldLongRef.current = false;
      return;
    }
    pulse(onOk);
  };

  const keepFocusOut = (e: React.MouseEvent) => {
    e.preventDefault();
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onMouseDown={keepFocusOut}
        onClick={onToggleOpen}
        title="إظهار الريموت الافتراضي (R)"
        className="fixed left-4 bottom-20 sm:bottom-6 z-40 px-3.5 py-2 rounded-xl bg-[#0b2a5c]/90 hover:bg-[#123f86] border-2 border-[#4f7fc9] text-white text-xs sm:text-sm font-bold flex items-center gap-2 shadow-xl backdrop-blur-sm cursor-pointer transition-colors"
      >
        <Radio className="w-4 h-4 text-[#ffc400]" />
        <span>الريموت</span>
      </button>
    );
  }

  const keyBtn =
    'rounded-lg bg-[#123f86]/75 hover:bg-[#1a52ab] active:scale-95 border border-[#4f7fc9]/60 text-white transition-all flex items-center justify-center cursor-pointer';

  return (
    <aside
      aria-label="الريموت الافتراضي لـ DAHMAN-SAT"
      onMouseDown={keepFocusOut}
      className="fixed left-4 bottom-14 sm:bottom-12 z-40 w-[232px] wassla-panel rounded-2xl p-3.5 select-none"
    >
      {/* Header */}
      <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-[#4f7fc9]/40">
        <div className="flex items-center gap-2">
          <span
            className={`w-2.5 h-2.5 rounded-full transition-colors ${
              irFlash ? 'bg-[#ffc400] shadow-[0_0_8px_#ffc400]' : 'bg-[#4f7fc9]/40'
            }`}
          />
          <span className="text-xs font-bold text-[#ffc400] font-mono-tech">DAHMAN-SAT</span>
        </div>
        <button
          type="button"
          onClick={onToggleOpen}
          aria-label="طي الريموت"
          className="w-7 h-7 rounded-md bg-black/30 hover:bg-black/50 text-[#9fb4d6] hover:text-white flex items-center justify-center cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Power & Mute */}
      <div className="grid grid-cols-2 gap-2 mb-2.5">
        <button
          type="button"
          onClick={() => pulse(onPower)}
          className={`h-9 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer ${
            isPoweredOn
              ? 'bg-rose-600/80 hover:bg-rose-500 border-rose-400/60 text-white'
              : 'bg-emerald-600/85 hover:bg-emerald-500 border-emerald-400/60 text-white'
          }`}
        >
          <Power className="w-3.5 h-3.5" />
          <span>{isPoweredOn ? 'إيقاف' : 'تشغيل'}</span>
        </button>
        <button
          type="button"
          onClick={() => pulse(onMute)}
          className={`h-9 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 active:scale-95 cursor-pointer ${
            isMuted
              ? 'bg-[#ffc400] border-white text-black'
              : 'bg-[#123f86]/75 hover:bg-[#1a52ab] border-[#4f7fc9]/60 text-white'
          }`}
        >
          {isMuted ? <VolumeX className="w-3.5 h-3.5" /> : <Volume2 className="w-3.5 h-3.5" />}
          <span>كتم</span>
        </button>
      </div>

      {/* Number Pad */}
      <div className="grid grid-cols-3 gap-1.5 mb-2.5" dir="ltr">
        {['1', '2', '3', '4', '5', '6', '7', '8', '9'].map((d) => (
          <button
            key={d}
            type="button"
            onClick={() => pulse(() => onDigit(d))}
            className={`${keyBtn} h-8 font-mono-tech text-sm font-bold`}
          >
            {d}
          </button>
        ))}
        <button
          type="button"
          onClick={() => pulse(onInfo)}
          className={`${keyBtn} h-8 text-[11px] font-bold gap-1`}
          title="معلومات القناة"
        >
          <Info className="w-3 h-3 text-[#ffc400]" />
          <span>INFO</span>
        </button>
        <button
          type="button"
          onClick={() => pulse(() => onDigit('0'))}
          className={`${keyBtn} h-8 font-mono-tech text-sm font-bold`}
        >
          0
        </button>
        <button
          type="button"
          onClick={() => pulse(onBack)}
          className={`${keyBtn} h-8 text-[11px] font-bold gap-1`}
          title="رجوع"
        >
          <RotateCcw className="w-3 h-3 text-[#ffc400]" />
          <span>BACK</span>
        </button>
      </div>

      {/* D-Pad */}
      <div className="bg-[#040a18]/80 border border-[#4f7fc9]/40 rounded-xl p-2 mb-2.5">
        <div className="grid grid-cols-3 gap-1.5 max-w-[162px] mx-auto" dir="ltr">
          <div />
          <button type="button" onClick={() => pulse(onUp)} className={`${keyBtn} h-9`}>
            <ChevronUp className="w-5 h-5" />
          </button>
          <div />
          <button type="button" onClick={() => pulse(onLeft)} className={`${keyBtn} h-9`}>
            <ChevronLeft className="w-5 h-5" />
          </button>
          <button
            type="button"
            onPointerDown={handleOkPointerDown}
            onPointerUp={clearOkHoldTimer}
            onPointerLeave={clearOkHoldTimer}
            onPointerCancel={clearOkHoldTimer}
            onClick={handleOkClick}
            title="ضغط قصير: موافق | ضغط مطول: تفضيل القناة"
            className="h-9 rounded-lg bg-[#ffc400] hover:bg-amber-300 active:scale-95 text-black font-extrabold text-xs cursor-pointer"
          >
            OK
          </button>
          <button type="button" onClick={() => pulse(onRight)} className={`${keyBtn} h-9`}>
            <ChevronRight className="w-5 h-5" />
          </button>
          <div />
          <button type="button" onClick={() => pulse(onDown)} className={`${keyBtn} h-9`}>
            <ChevronDown className="w-5 h-5" />
          </button>
          <div />
        </div>
      </div>

      {/* Volume & Quick Receiver Screens */}
      <div className="grid grid-cols-2 gap-1.5 mb-2">
        <button
          type="button"
          onClick={() => pulse(onVolumeUp)}
          className={`${keyBtn} h-8 text-xs font-bold`}
        >
          صوت +
        </button>
        <button
          type="button"
          onClick={() => pulse(onVolumeDown)}
          className={`${keyBtn} h-8 text-xs font-bold`}
        >
          صوت −
        </button>
      </div>

      <div className="grid grid-cols-3 gap-1.5 mb-1.5">
        <button
          type="button"
          onClick={() => pulse(onList)}
          className={`${keyBtn} h-8 text-[11px] font-bold gap-1`}
        >
          <List className="w-3.5 h-3.5 text-[#ffc400]" />
          <span>القنوات</span>
        </button>
        <button
          type="button"
          onClick={() => pulse(onFavorites)}
          className={`${keyBtn} h-8 text-[11px] font-bold gap-1`}
          title="القنوات المفضلة (F)"
        >
          <Heart className="w-3.5 h-3.5 text-rose-400" />
          <span>المفضلة</span>
        </button>
        <button
          type="button"
          onClick={() => pulse(onRecent)}
          className={`${keyBtn} h-8 text-[11px] font-bold gap-1`}
          title="سجل القنوات الأخيرة (H)"
        >
          <History className="w-3.5 h-3.5 text-[#ffc400]" />
          <span>الأخيرة</span>
        </button>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <button
          type="button"
          onClick={() => pulse(onSources)}
          className={`${keyBtn} h-8 text-[11px] font-bold`}
        >
          المصادر
        </button>
        <button
          type="button"
          onClick={() => pulse(onSettings)}
          className={`${keyBtn} h-8 text-[11px] font-bold gap-1`}
        >
          <Settings className="w-3.5 h-3.5 text-[#ffc400]" />
          <span>إعدادات</span>
        </button>
      </div>
    </aside>
  );
};
