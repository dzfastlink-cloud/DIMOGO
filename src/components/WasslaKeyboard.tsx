import React, { useEffect, useState } from 'react';
import { Check, Delete, Globe, Space, X } from 'lucide-react';

export interface KeyboardNavAction {
  type: 'up' | 'down' | 'left' | 'right' | 'ok' | 'back';
  seq: number;
}

interface WasslaKeyboardProps {
  isOpen: boolean;
  title: string;
  initialValue: string;
  navAction?: KeyboardNavAction | null;
  onConfirm: (value: string) => void;
  onCancel: () => void;
}

const KEY_LAYOUTS = {
  ar: [
    'ضصثقفغعهخحجد',
    'شسيبلاتنمكط',
    'ئءؤرىةوزظذ',
    '1234567890',
  ],
  en: [
    'qwertyuiop',
    'asdfghjkl',
    'zxcvbnm-_.',
    '1234567890',
  ],
};

interface KeyDef {
  k: string;
  t: string;
  wide?: boolean;
}

export const WasslaKeyboard: React.FC<WasslaKeyboardProps> = ({
  isOpen,
  title,
  initialValue,
  navAction,
  onConfirm,
  onCancel,
}) => {
  const [value, setValue] = useState(initialValue);
  const [lang, setLang] = useState<'ar' | 'en'>('ar');
  const [rowIdx, setRowIdx] = useState(0);
  const [colIdx, setColIdx] = useState(0);
  const lastSeqRef = React.useRef(-1);

  useEffect(() => {
    if (isOpen) {
      setValue(initialValue);
      setRowIdx(0);
      setColIdx(0);
    }
  }, [isOpen, initialValue]);

  const rows: KeyDef[][] = KEY_LAYOUTS[lang].map((str) =>
    str.split('').map((ch) => ({ k: ch, t: ch }))
  );
  rows.push([
    { k: 'lang', t: lang === 'ar' ? 'EN' : 'عربي', wide: true },
    { k: 'sp', t: 'مسافة', wide: true },
    { k: 'bs', t: 'حذف', wide: true },
    { k: 'ok', t: 'حفظ', wide: true },
    { k: 'no', t: 'إلغاء', wide: true },
  ]);

  const safeRow = Math.max(0, Math.min(rowIdx, rows.length - 1));
  const safeCol = Math.max(0, Math.min(colIdx, rows[safeRow].length - 1));

  const pressKey = (key: KeyDef) => {
    if (key.k === 'lang') {
      setLang((l) => (l === 'ar' ? 'en' : 'ar'));
    } else if (key.k === 'sp') {
      setValue((v) => v + ' ');
    } else if (key.k === 'bs') {
      setValue((v) => v.slice(0, -1));
    } else if (key.k === 'ok') {
      if (value.trim()) onConfirm(value.trim());
      else onCancel();
    } else if (key.k === 'no') {
      onCancel();
    } else {
      setValue((v) => v + key.k);
    }
  };

  useEffect(() => {
    if (!isOpen || !navAction || navAction.seq === lastSeqRef.current) return;
    lastSeqRef.current = navAction.seq;

    if (navAction.type === 'left') {
      setColIdx(Math.min(rows[safeRow].length - 1, safeCol + 1));
    } else if (navAction.type === 'right') {
      setColIdx(Math.max(0, safeCol - 1));
    } else if (navAction.type === 'down') {
      const nextRow = Math.min(rows.length - 1, safeRow + 1);
      setRowIdx(nextRow);
      setColIdx(Math.min(safeCol, rows[nextRow].length - 1));
    } else if (navAction.type === 'up') {
      const nextRow = Math.max(0, safeRow - 1);
      setRowIdx(nextRow);
      setColIdx(Math.min(safeCol, rows[nextRow].length - 1));
    } else if (navAction.type === 'ok') {
      pressKey(rows[safeRow][safeCol]);
    } else if (navAction.type === 'back') {
      onCancel();
    }
  });

  useEffect(() => {
    if (!isOpen) return;

    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isDirectInput = target && target.id === 'kbIn';

      if (e.key === 'Escape' || e.key === 'GoBack' || e.key === 'BrowserBack') {
        e.preventDefault();
        e.stopPropagation();
        onCancel();
        return;
      }

      if (isDirectInput) {
        if (e.key === 'Enter' || e.key === 'NumpadEnter' || e.key === 'Select') {
          e.preventDefault();
          e.stopPropagation();
          if (value.trim()) onConfirm(value.trim());
          else onCancel();
        }
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.stopPropagation();
        setColIdx(Math.min(rows[safeRow].length - 1, safeCol + 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        e.stopPropagation();
        setColIdx(Math.max(0, safeCol - 1));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        e.stopPropagation();
        const nextRow = Math.min(rows.length - 1, safeRow + 1);
        setRowIdx(nextRow);
        setColIdx(Math.min(safeCol, rows[nextRow].length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        e.stopPropagation();
        const nextRow = Math.max(0, safeRow - 1);
        setRowIdx(nextRow);
        setColIdx(Math.min(safeCol, rows[nextRow].length - 1));
      } else if (
        e.key === 'Enter' ||
        e.key === 'NumpadEnter' ||
        e.key === 'Select' ||
        e.key === 'DPAD_CENTER'
      ) {
        e.preventDefault();
        e.stopPropagation();
        pressKey(rows[safeRow][safeCol]);
      } else if (e.key === 'Backspace') {
        e.preventDefault();
        e.stopPropagation();
        setValue((v) => v.slice(0, -1));
      } else if (e.key.length === 1 && !e.ctrlKey && !e.metaKey) {
        e.preventDefault();
        e.stopPropagation();
        setValue((v) => v + e.key);
      }
    };

    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  });

  if (!isOpen) return null;

  const renderSpecialIcon = (k: string, isSel: boolean) => {
    const cls = `w-4 h-4 shrink-0 ${isSel ? 'text-[#050a18]' : 'text-[#ffc400]'}`;
    if (k === 'lang') return <Globe className={cls} />;
    if (k === 'sp') return <Space className={cls} />;
    if (k === 'bs') return <Delete className={cls} />;
    if (k === 'ok') return <Check className={`w-4 h-4 shrink-0 ${isSel ? 'text-[#050a18]' : 'text-emerald-400'}`} />;
    if (k === 'no') return <X className={`w-4 h-4 shrink-0 ${isSel ? 'text-[#050a18]' : 'text-rose-400'}`} />;
    return null;
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4 sm:p-8"
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="wassla-panel w-full max-w-4xl rounded-2xl flex flex-col overflow-hidden"
      >
        <div className="wassla-ph px-5 py-3.5 flex items-center justify-between text-base sm:text-lg font-bold">
          <span className="text-white">{title}</span>
          <span className="text-xs sm:text-sm font-normal text-[#94a8c9]">
            ▲▼◄► تنقّل · OK اختيار · BACK إلغاء
          </span>
        </div>

        <div className="p-4 sm:p-5 flex flex-col gap-3.5">
          <input
            id="kbIn"
            type="text"
            dir="auto"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full px-4 py-3 text-xl sm:text-2xl rounded-xl border-2 border-[#ffc400]/80 bg-black/60 text-white focus:outline-none focus:border-[#ffc400]"
            placeholder="اكتب هنا أو اختر من لوحة المفاتيح..."
          />

          <div className="flex flex-col gap-2" dir="rtl">
            {rows.map((row, rIdx) => (
              <div key={rIdx} className="flex gap-1.5 sm:gap-2">
                {row.map((keyObj, cIdx) => {
                  const isSel = rIdx === safeRow && cIdx === safeCol;
                  return (
                    <button
                      key={`${rIdx}-${cIdx}-${keyObj.k}`}
                      type="button"
                      onClick={() => {
                        setRowIdx(rIdx);
                        setColIdx(cIdx);
                        pressKey(keyObj);
                      }}
                      className={`h-11 sm:h-12 rounded-xl border flex items-center justify-center gap-1.5 transition-colors duration-150 cursor-pointer whitespace-nowrap ${
                        keyObj.wide ? 'flex-[1.8] text-sm sm:text-base px-2' : 'flex-1 text-lg sm:text-xl'
                      } ${
                        isSel
                          ? 'wassla-tv-focus'
                          : keyObj.k === 'ok'
                            ? 'bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-200 border-emerald-400/35'
                            : 'bg-white/[0.06] hover:bg-white/[0.12] text-white border-white/10'
                      }`}
                    >
                      {keyObj.wide && renderSpecialIcon(keyObj.k, isSel)}
                      <span>{keyObj.t}</span>
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
