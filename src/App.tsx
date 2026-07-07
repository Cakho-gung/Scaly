import React, { useState, useCallback, useEffect } from 'react';
import chroma from 'chroma-js';
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  sortableKeyboardCoordinates,
  horizontalListSortingStrategy,
  useSortable,
  arrayMove,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { Anchor, RotateCcw, Check, Pencil, Trash2, Plus, X, Moon, Sun } from 'lucide-react';

interface CustomCheckboxProps {
  checked: boolean;
  indeterminate?: boolean;
  onChange: (checked: boolean) => void;
  theme: 'light' | 'dark';
  size?: 'sm' | 'md';
}

const CustomCheckbox: React.FC<CustomCheckboxProps> = ({ checked, indeterminate, onChange, theme, size = 'md' }) => {
  const sizeClass = size === 'sm' ? 'w-3.5 h-3.5' : 'w-4 h-4';
  const iconSizeClass = size === 'sm' ? 'w-2 h-2' : 'w-2.5 h-2.5';
  
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={`flex items-center justify-center rounded-[6px] border transition-all duration-150 focus:outline-none shrink-0 ${sizeClass} ${
        checked || indeterminate
          ? (theme === 'light' 
              ? 'bg-slate-900 border-slate-900 text-white shadow-sm' 
              : 'bg-white border-white text-black shadow-sm')
          : (theme === 'light'
              ? 'border-slate-300 hover:border-slate-400 bg-white hover:bg-slate-50'
              : 'border-white/20 hover:border-white/30 bg-transparent hover:bg-white/5')
      }`}
    >
      {checked && !indeterminate && (
        <svg className={iconSizeClass} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round">
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      {indeterminate && (
        <div className={`h-[1.5px] w-1.5 rounded-full ${theme === 'light' ? 'bg-white' : 'bg-black'}`} />
      )}
    </button>
  );
};

type ColorNode = {
  id: string;
  index: number;
  label: string | number;
  hex: string | null;
  isAnchor: boolean;
  locked: boolean;
};

interface ScaleData {
  id: string;
  name: string;
  stepCount: number;
  nodes: ColorNode[];
  fullAnchorMap: Record<string, string>; // Maps label (string) to hex
}

const createDefaultNodes = (stepCount: number, existingAnchors?: Record<string, string>): ColorNode[] => {
  const anchors = existingAnchors || {};

  // The stepCount "middle" slots (white/black bracket these, handled separately below)
  const slotLabels: (string | number)[] = [];
  for (let i = 1; i <= stepCount; i++) slotLabels.push(getLabel(i, stepCount));

  // Every anchor keeps its slot count across a stepCount switch — only its position may
  // move. Each anchor's ideal slot is whichever standard label is numerically closest to
  // it (e.g. "50" is closest to "100" on a 9-step grid). When two or more anchors want the
  // same slot, they're pushed apart in order (never past their neighbor), which cascades
  // outer anchors inward exactly as far as needed to fit everyone with no overlap — e.g.
  // "50" and "100" both wanting slot "100" become "100" and "200". If there are literally
  // more anchors than slots, the ones that don't fit collapse onto their nearest neighbor.
  const middleAnchors = Object.entries(anchors)
    .filter(([labelStr]) => labelStr !== 'white' && labelStr !== 'black')
    .map(([labelStr, hex]) => ({ value: Number(labelStr), hex }))
    .sort((a, b) => a.value - b.value);

  const idealSlot = middleAnchors.map(a => {
    let bestIdx = 0, bestDist = Infinity;
    slotLabels.forEach((label, idx) => {
      const dist = Math.abs(Number(label) - a.value);
      if (dist < bestDist) { bestDist = dist; bestIdx = idx; }
    });
    return bestIdx;
  });

  // Forward pass: push later anchors up so no two share a slot
  const assignedSlot = idealSlot.slice();
  for (let k = 1; k < assignedSlot.length; k++) {
    if (assignedSlot[k] <= assignedSlot[k - 1]) assignedSlot[k] = assignedSlot[k - 1] + 1;
  }
  // Backward pass: pull back under the top boundary, tightening any slack left by the forward pass
  for (let k = assignedSlot.length - 1; k >= 0; k--) {
    const upperBound = k === assignedSlot.length - 1 ? stepCount - 1 : assignedSlot[k + 1] - 1;
    if (assignedSlot[k] > upperBound) assignedSlot[k] = upperBound;
  }
  // More anchors than slots (unusual): clamp into range, letting the overflow collapse together
  for (let k = 0; k < assignedSlot.length; k++) {
    assignedSlot[k] = Math.max(0, Math.min(stepCount - 1, assignedSlot[k]));
  }

  const slotAnchorHex: (string | null)[] = new Array(stepCount).fill(null);
  middleAnchors.forEach((a, k) => { slotAnchorHex[assignedSlot[k]] = a.hex; });

  type Entry = { label: string | number; hex: string | null; isAnchor: boolean; locked: boolean };
  const entries: Entry[] = [
    { label: 'white', hex: anchors['white'] || '#ffffff', isAnchor: true, locked: true },
    ...slotLabels.map((label, idx) => ({
      label,
      hex: slotAnchorHex[idx],
      isAnchor: slotAnchorHex[idx] !== null,
      locked: false,
    })),
    { label: 'black', hex: anchors['black'] || '#000000', isAnchor: true, locked: true },
  ];

  const initialNodes: ColorNode[] = entries.map((e, i) => ({
    id: `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${i}`,
    index: i,
    label: e.label,
    hex: e.hex,
    isAnchor: e.isAnchor,
    locked: e.locked,
  }));

  return interpolateColors(initialNodes);
};

const getLabel = (idx: number, stepCount: number) => {
  if (idx === 0) return 'white';
  if (idx === stepCount + 1) return 'black';

  if (stepCount === 9) {
    return idx * 100;
  }
  if (stepCount === 11) {
    if (idx === 1) return 50;
    if (idx === 11) return 950;
    return (idx - 1) * 100;
  }
  if (stepCount === 13) {
    if (idx === 1) return 25;
    if (idx === 2) return 50;
    if (idx === 12) return 950;
    if (idx === 13) return 975;
    return (idx - 2) * 100;
  }
  if (stepCount === 15) {
    if (idx === 1) return 0;
    if (idx === 2) return 25;
    if (idx === 3) return 50;
    if (idx === 13) return 950;
    if (idx === 14) return 975;
    if (idx === 15) return 1000;
    return (idx - 3) * 100;
  }
  return idx * 100;
};

// Reusable Toast Component
const ToastNotification = ({ message, theme, onClose }: { message: string, theme: 'light' | 'dark', onClose: () => void }) => {
  const [visible, setVisible] = React.useState(false);
  const [isLeaving, setIsLeaving] = React.useState(false);

  React.useEffect(() => {
    // Trigger entry transition almost immediately
    const enterTimer = setTimeout(() => setVisible(true), 20);

    // Trigger leaving transition before auto-close
    const exitTimer = setTimeout(() => {
      setIsLeaving(true);
    }, 4500);

    // Call onClose after leaving animation completes
    const closeTimer = setTimeout(() => {
      onClose();
    }, 4850);

    return () => {
      clearTimeout(enterTimer);
      clearTimeout(exitTimer);
      clearTimeout(closeTimer);
    };
  }, [message, onClose]);

  const handleClose = () => {
    setIsLeaving(true);
    setTimeout(onClose, 350);
  };

  let animationClasses = "opacity-0 -translate-y-8 scale-105 pointer-events-none";
  if (visible && !isLeaving) {
    animationClasses = "opacity-100 translate-y-0 scale-100";
  } else if (isLeaving) {
    animationClasses = "opacity-0 translate-y-0 scale-100 pointer-events-none";
  }

  return (
    <div className={`fixed top-6 left-1/2 -translate-x-1/2 z-[100] transition-all duration-350 ease-out ${animationClasses}`}>
      <div className={`${theme === 'light' ? 'bg-white text-slate-800 border-white/60 shadow-slate-200/50' : 'bg-[#1a1a1a]/90 text-white border-white/10 shadow-black/50'} border pl-5 pr-2 py-2 rounded-full shadow-xl text-xs font-bold flex items-center gap-4`}>
        <div className="flex items-center gap-2">
          <Check size={14} strokeWidth={3} className={theme === 'light' ? 'text-green-500' : 'text-green-400'} />
          <span>{message}</span>
        </div>
        <button 
          onClick={handleClose} 
          className={`p-1 rounded-full transition-colors ${theme === 'light' ? 'text-slate-400 hover:text-slate-700 hover:bg-slate-100' : 'text-slate-500 hover:text-slate-200 hover:bg-white/10'}`}
          title="Close"
        >
          <X size={14} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
};

// Sortable Item Component
const SortableColorNode = ({ node, theme, onToggleAnchor, onShowToast }: { node: ColorNode, theme: 'light' | 'dark', onToggleAnchor: () => void, onShowToast: (msg: string) => void }) => {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: node.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    zIndex: isDragging ? 10 : 1,
  };

  const labelValue = node.label;
  const hexDisplay = node.hex ? node.hex.toUpperCase().replace('#', '') : '------';

  const copyToClipboard = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (node.hex) {
      const hex = node.hex.toUpperCase();
      navigator.clipboard.writeText(hex);
      onShowToast(`Hex ${hex} copied to clipboard`);
    }
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex flex-col flex-1 min-w-0 cursor-grab active:cursor-grabbing group ${
        isDragging ? 'scale-105 z-10' : ''
      }`}
      {...attributes}
      {...listeners}
    >
      <div className="relative w-full aspect-square mb-3">
        <div 
          className={`w-full h-full rounded-xl transition-all duration-200 cursor-pointer border ${theme === 'light' ? 'border-black/5' : 'border-white/5'} ${
            isDragging ? 'shadow-2xl scale-110 z-20' : 'active:scale-95'
          }`}
          style={{ backgroundColor: node.hex || '#f0f0f0' }}
          onClick={copyToClipboard}
          title="Click to copy HEX"
        >
        </div>
        
        {/* Anchor Toggle Button */}
        <button
          onClick={(e) => { 
            e.preventDefault();
            e.stopPropagation(); 
            onToggleAnchor(); 
          }}
          className={`absolute -top-1 -right-1 w-5 h-5 rounded-full flex items-center justify-center transition-all z-10 shadow-sm opacity-0 group-hover:opacity-100 hover:scale-110
            ${node.isAnchor 
              ? 'bg-gray-900 text-white' 
              : 'bg-white text-gray-400'
            }`}
          title={node.isAnchor ? "Remove anchor" : "Set as anchor"}
        >
          <Anchor size={10} strokeWidth={3} />
        </button>
      </div>

      <div className="flex flex-col">
        <span className={`text-xs leading-tight ${node.isAnchor ? 'font-bold' : 'font-regular'} ${theme === 'light' ? 'text-gray-900' : 'text-gray-100'}`}>
          {labelValue}{node.isAnchor ? '*' : ''}
        </span>
        <span className={`text-[10px] font-mono uppercase leading-tight ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>
          {hexDisplay}
        </span>
      </div>
    </div>
  );
};

const interpolateColors = (currentNodes: ColorNode[]) => {
  const anchors = currentNodes.filter(n => n.isAnchor).sort((a, b) => a.index - b.index);
  
  if (anchors.length === 0) return currentNodes;

  const maxIndex = currentNodes.length - 1;
  let scale: chroma.Scale;

  if (anchors.length === 1) {
    const anchor = anchors[0];
    const domain = [0, anchor.index, maxIndex];
    const colors = ['#ffffff', anchor.hex!, '#000000'];
    scale = chroma.scale(colors).domain(domain).mode('oklch');
  } else {
    const domain = anchors.map(a => a.index);
    const colors = anchors.map(a => a.hex!);
    scale = chroma.scale(colors).domain(domain).mode('oklch');
  }

  return currentNodes.map(node => {
    if (node.isAnchor) return node;
    return {
      ...node,
      hex: scale(node.index).hex(),
    };
  });
};

// fullAnchorMap is always derived from the live nodes array rather than patched
// incrementally — every anchor is fully represented in nodes (standard or custom slot),
// so recomputing from scratch avoids stale keys surviving relabels (e.g. drag reorders).
const buildAnchorMap = (nodes: ColorNode[]): Record<string, string> => {
  const map: Record<string, string> = {};
  nodes.forEach(n => {
    if (n.isAnchor && n.hex) map[String(n.label)] = n.hex;
  });
  return map;
};

const ColorPicker = ({ color, onChange, theme }: { color: string, onChange: (color: string) => void, theme: 'light' | 'dark' }) => {
  const [hsl, setHsl] = useState(() => {
    let h = 0, s = 0, l = 0;
    if (chroma.valid(color)) {
      [h, s, l] = chroma(color).hsl();
    }
    return { h: isNaN(h) ? 0 : h, s: isNaN(s) ? 0 : s, l: isNaN(l) ? 0 : l };
  });
  const [text, setText] = useState(color);

  // Parse text
  const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setText(val);
    if (chroma.valid(val)) {
      const [h, s, l] = chroma(val).hsl();
      const newHsl = { h: isNaN(h) ? hsl.h : h, s: isNaN(s) ? 0 : s, l: isNaN(l) ? 0 : l };
      setHsl(newHsl);
      onChange(chroma.hsl(newHsl.h, newHsl.s, newHsl.l).hex());
    }
  };

  const handleHslChange = (part: Partial<typeof hsl>) => {
    const newHsl = { ...hsl, ...part };
    setHsl(newHsl);
    const hex = chroma.hsl(newHsl.h, newHsl.s, newHsl.l).hex();
    setText(hex);
    onChange(hex);
  };

  return (
    <div className="flex flex-col gap-4 mb-2">
      {/* Preview */}
      <div 
        className={`w-full h-12 rounded-md shadow-inner border ${theme === 'light' ? 'border-gray-200' : 'border-gray-700'}`} 
        style={{ backgroundColor: chroma.valid(text) ? chroma(text).css() : '#000' }}
      />
      
      {/* Input */}
      <div>
        <label className={`text-xs font-semibold uppercase ${theme === 'light' ? 'text-gray-500' : 'text-gray-400'}`}>Color Value</label>
        <input 
          type="text" 
          value={text} 
          onChange={handleTextChange} 
          placeholder="Hex, RGB, HSL, etc."
          autoFocus
          className={`w-full border rounded px-3 py-2 mt-1 focus:outline-none focus:ring-1 font-mono text-sm ${theme === 'light' ? 'border-gray-300 bg-white text-gray-900 focus:border-gray-500 focus:ring-gray-300' : 'border-gray-600 bg-[#090909] text-white focus:border-gray-400 focus:ring-gray-600'}`}
        />
      </div>

      {/* Sliders */}
      <div className="flex flex-col gap-4">
        <div>
          <div className={`flex justify-between text-xs font-regular mb-2 ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
            <span>Hue</span>
            <span>{Math.round(hsl.h)}°</span>
          </div>
          <input 
            type="range" min="0" max="360" step="1" 
            value={hsl.h} 
            onChange={e => handleHslChange({ h: Number(e.target.value) })}
            className="w-full h-[4px] rounded-lg color-slider"
            style={{
              background: `linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)`
            }}
          />
        </div>

        <div>
          <div className={`flex justify-between text-xs font-regular mb-2 ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
            <span>Saturation</span>
            <span>{Math.round(hsl.s * 100)}%</span>
          </div>
          <input 
            type="range" min="0" max="1" step="0.01" 
            value={hsl.s} 
            onChange={e => handleHslChange({ s: Number(e.target.value) })}
            className="w-full h-[4px] rounded-lg color-slider"
            style={{
              background: `linear-gradient(to right, ${chroma.hsl(hsl.h, 0, hsl.l).css()}, ${chroma.hsl(hsl.h, 1, hsl.l).css()})`
            }}
          />
        </div>

        <div>
          <div className={`flex justify-between text-xs font-regular mb-2 ${theme === 'light' ? 'text-gray-600' : 'text-gray-400'}`}>
            <span>Lightness</span>
            <span>{Math.round(hsl.l * 100)}%</span>
          </div>
          <input 
            type="range" min="0" max="1" step="0.01" 
            value={hsl.l} 
            onChange={e => handleHslChange({ l: Number(e.target.value) })}
            className="w-full h-[4px] rounded-lg color-slider"
            style={{
              background: `linear-gradient(to right, #000, ${chroma.hsl(hsl.h, hsl.s, 0.5).css()}, #fff)`
            }}
          />
        </div>
      </div>
    </div>
  );
};

const AnchorColorItem = ({ anchor, onRemove, onChange, onOpenPicker, theme }: { anchor: ColorNode, onRemove: () => void, onChange: (hex: string) => void, onOpenPicker: (hex: string) => void, theme: 'light' | 'dark' }) => {
  const [isOpen, setIsOpen] = React.useState(false);
  const containerRef = React.useRef<HTMLDivElement>(null);
  const [initialHex, setInitialHex] = React.useState(anchor.hex);

  const handleOpen = () => {
    setInitialHex(anchor.hex);
    setIsOpen(true);
  };

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isOpen]);

  const [hsl, setHsl] = React.useState(() => {
    let [h, s, l] = [0, 0, 0];
    if (chroma.valid(anchor.hex || '')) {
      [h, s, l] = chroma(anchor.hex || '#fff').hsl();
    }
    return { h: isNaN(h) ? 0 : h, s: isNaN(s) ? 0 : s, l: isNaN(l) ? 0 : l };
  });

  React.useEffect(() => {
    if (anchor.hex) {
      const [h, s, l] = chroma(anchor.hex).hsl();
      setHsl(prev => {
        // Nếu màu là đen (l=0) hoặc trắng (l=1), giữ nguyên H và S từ trạng thái cũ
        // để tránh bị reset về 0/NaN
        const newH = isNaN(h) ? prev.h : h;
        const newS = (l === 0 || l === 1) ? prev.s : s;
        return { h: newH, s: newS, l };
      });
    }
  }, [anchor.hex]);

  const handleHChange = (val: number) => {
    const newH = val;
    setHsl(prev => ({ ...prev, h: newH }));
    onChange(chroma.hsl(newH, hsl.s, hsl.l).hex());
  };

  const handleSChange = (val: number) => {
    const newS = val;
    setHsl(prev => ({ ...prev, s: newS }));
    onChange(chroma.hsl(hsl.h, newS, hsl.l).hex());
  };

  const handleLChange = (val: number) => {
    const newL = val;
    setHsl(prev => ({ ...prev, l: newL }));
    onChange(chroma.hsl(hsl.h, hsl.s, newL).hex());
  };

  return (
    <div 
      ref={containerRef}
      className={`relative flex items-center h-10 transition-all duration-300 rounded-full group border border-gray-500/15 ${isOpen ? 'w-[380px]' : 'w-10 cursor-pointer hover:scale-105'}`}
      style={{ backgroundColor: isOpen ? (theme === 'light' ? '#fff' : '#2b2b2b') : (anchor.hex || '#fff') }}
    >
      {!isOpen ? (
        <>
          <div 
            className="w-full h-full rounded-full" 
            onClick={handleOpen} 
            title={`Anchor at ${anchor.index}`}
          />
          <button 
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="absolute -top-1 -right-1 bg-white text-gray-700 rounded-full w-4 h-4 flex items-center justify-center text-xs opacity-0 group-hover:opacity-100 hover:bg-red-600 hover:text-white transition-all shadow-sm z-10"
            title="Remove anchor"
          >
            <X size={10} strokeWidth={3} />
          </button>
        </>
      ) : (
        <div className={`flex w-full items-center gap-4 p-2 rounded-full border transition-colors ${theme === 'light' ? 'bg-white/60 border-white/60 shadow-lg shadow-slate-200/50' : 'bg-[#1a1a1a]/80 border-white/10 shadow-xl shadow-black/50'}`}>
          <div 
            className={`w-12 h-12 rounded-full flex-shrink-0 shadow-inner border cursor-pointer hover:scale-105 transition-transform ${theme === 'light' ? 'border-black/5' : 'border-white/10'}`} 
            style={{ backgroundColor: anchor.hex || '#fff' }}
            onClick={() => setIsOpen(false)}
            title="Close"
          />
          <div className="flex flex-col flex-1 gap-[12px] justify-center py-1">
            <div className="relative flex items-center">
              <input 
                type="range" min="0" max="360" step="1" value={hsl.h}
                onChange={(e) => handleHChange(Number(e.target.value))}
                className="w-full h-[2px] rounded-lg appearance-none cursor-pointer color-slider"
                style={{
                  background: `linear-gradient(to right, #f00 0%, #ff0 17%, #0f0 33%, #0ff 50%, #00f 67%, #f0f 83%, #f00 100%)`
                }}
                title="Hue"
              />
            </div>
            <div className="relative flex items-center">
              <input 
                type="range" min="0" max="1" step="0.01" value={hsl.s}
                onChange={(e) => handleSChange(Number(e.target.value))}
                className="w-full h-[2px] rounded-lg appearance-none cursor-pointer color-slider"
                style={{
                  background: `linear-gradient(to right, ${chroma.hsl(hsl.h, 0, hsl.l).css()}, ${chroma.hsl(hsl.h, 1, hsl.l).css()})`
                }}
                title="Saturation"
              />
            </div>
            <div className="relative flex items-center">
              <input 
                type="range" min="0" max="1" step="0.01" value={hsl.l}
                onChange={(e) => handleLChange(Number(e.target.value))}
                className="w-full h-[2px] rounded-lg appearance-none cursor-pointer color-slider"
                style={{
                  background: `linear-gradient(to right, #000, ${chroma.hsl(hsl.h, hsl.s, 0.5).css()}, #fff)`
                }}
                title="Lightness"
              />
            </div>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => onChange(initialHex || '#fff')}
              className="w-7 h-7 flex-shrink-0 text-gray-400 hover:text-gray-700 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
              title="Reset"
            >
              <RotateCcw size={14} strokeWidth={2.5} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default function App() {
  const [scales, setScales] = useState<ScaleData[]>(() => [
    {
      id: `scale-${Date.now()}`,
      name: 'Primary Scale',
      stepCount: 11,
      nodes: createDefaultNodes(11, { "white": "#ffffff", "black": "#000000" }),
      fullAnchorMap: { "white": "#ffffff", "black": "#000000" },
    }
  ]);
  
  const [hexInput, setHexInput] = useState('#f20d0d');
  const [error, setError] = useState('');
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [activeScaleId, setActiveScaleId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<'color' | 'typo'>('color');
  
  // Track editing state per scale
  const [editingScaleId, setEditingScaleId] = useState<string | null>(null);
  const [editingAnchorId, setEditingAnchorId] = useState<string | null>(null);
  const [editingOrderScaleId, setEditingOrderScaleId] = useState<string | null>(null);
  const [orderInputValue, setOrderInputValue] = useState<string>('');
  
  const nameInputRef = React.useRef<HTMLInputElement>(null);
  const orderInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editingScaleId && nameInputRef.current) {
      nameInputRef.current.focus();
    }
  }, [editingScaleId]);

  React.useEffect(() => {
    if (editingOrderScaleId && orderInputRef.current) {
      orderInputRef.current.focus();
      orderInputRef.current.select();
    }
  }, [editingOrderScaleId]);

  const handleNameKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' || e.key === 'Escape') {
      setEditingScaleId(null);
    }
  };

  const handleOrderSubmit = (scaleId: string) => {
    if (!editingOrderScaleId) return;
    const currentIdx = scales.findIndex(s => s.id === scaleId);
    const parsed = parseInt(orderInputValue, 10);
    
    if (isNaN(parsed) || parsed < 1 || parsed > scales.length) {
      showToast(`Invalid position. Please select from 01 to ${String(scales.length).padStart(2, '0')}.`);
      setEditingOrderScaleId(null);
      return;
    }
    
    const newIdx = parsed - 1;
    if (currentIdx !== newIdx) {
      setScales(prev => arrayMove(prev, currentIdx, newIdx));
    }
    setEditingOrderScaleId(null);
  };

  const handleOrderKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, scaleId: string) => {
    if (e.key === 'Enter') {
      handleOrderSubmit(scaleId);
    } else if (e.key === 'Escape') {
      setEditingOrderScaleId(null);
    }
  };

  const updateScale = (scaleId: string, updates: Partial<ScaleData>) => {
    setScales(prev => prev.map(s => s.id === scaleId ? { ...s, ...updates } : s));
  };

  const handleStepCountChange = (scaleId: string, stepCount: number) => {
    setScales(prev => prev.map(s => {
      if (s.id !== scaleId) return s;

      const currentAnchors = buildAnchorMap(s.nodes);

      return {
        ...s,
        stepCount,
        fullAnchorMap: currentAnchors,
        nodes: createDefaultNodes(stepCount, currentAnchors)
      };
    }));
  };

  const SCALE_NAMES = [
    'Primary', 'Secondary', 'Tertiary', 'Quaternary', 'Quinary', 
    'Senary', 'Septenary', 'Octonary', 'Nonary', 'Denary',
    'Undenary', 'Duodenary', 'Tredecenary', 'Quattuordecenary', 'Quindecenary',
    'Sexdecenary', 'Septendecenary', 'Octodecenary', 'Novemdecenary', 'Vigenary'
  ];

  const addScale = () => {
    const nextIndex = scales.length;
    const name = SCALE_NAMES[nextIndex] ? `${SCALE_NAMES[nextIndex]} Scale` : `Scale ${nextIndex + 1}`;
    
    const initialAnchors = { "white": "#ffffff", "black": "#000000" };
    const newScale: ScaleData = {
      id: `scale-${Date.now()}`,
      name: name,
      stepCount: 11,
      nodes: createDefaultNodes(11, initialAnchors),
      fullAnchorMap: initialAnchors,
    };
    setScales(prev => [...prev, newScale]);
  };

  const removeAnchor = (scaleId: string, anchorId: string) => {
    setScales(prev => prev.map(s => {
      if (s.id !== scaleId) return s;

      const newNodes = s.nodes.map(n => n.id === anchorId ? { ...n, isAnchor: false } : n);
      const interpolated = interpolateColors(newNodes);
      return { ...s, nodes: interpolated, fullAnchorMap: buildAnchorMap(interpolated) };
    }));
  };

  const updateAnchorColor = (scaleId: string, anchorId: string, hex: string) => {
    setScales(prev => prev.map(s => {
      if (s.id !== scaleId) return s;

      const newNodes = s.nodes.map(n => n.id === anchorId ? { ...n, hex } : n);
      const interpolated = interpolateColors(newNodes);
      return { ...s, nodes: interpolated, fullAnchorMap: buildAnchorMap(interpolated) };
    }));
  };

  const handleAddAnchor = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeScaleId) return;
    setError('');

    let validHex = hexInput.trim();
    if (!validHex.startsWith('#') && chroma.valid(validHex)) {
      validHex = chroma(validHex).hex();
    }

    if (!chroma.valid(validHex)) {
      setError('Invalid color format');
      return;
    }

    if (editingAnchorId) {
      // Edit existing anchor
      updateAnchorColor(activeScaleId, editingAnchorId, validHex);
    } else {
      // Add new anchor
      const currentScale = scales.find(s => s.id === activeScaleId);
      if (!currentScale) return;

      const oklch = chroma(validHex).oklch();
      const l = oklch[0]; // 0 to 1
      
      const maxIndex = currentScale.nodes.length - 1;
      let targetIndex = Math.round((1 - l) * maxIndex);
      targetIndex = Math.max(0, Math.min(maxIndex, targetIndex));

      setScales(prev => prev.map(s => {
        if (s.id !== activeScaleId) return s;
        
        const newNodes = [...s.nodes];
        
        // Handle collision
        if (newNodes[targetIndex].isAnchor) {
          // Find nearest empty index
          let offset = 1;
          let found = false;
          while (offset <= maxIndex) {
            if (targetIndex + offset <= maxIndex && !newNodes[targetIndex + offset].isAnchor) {
              targetIndex = targetIndex + offset;
              found = true;
              break;
            }
            if (targetIndex - offset >= 0 && !newNodes[targetIndex - offset].isAnchor) {
              targetIndex = targetIndex - offset;
              found = true;
              break;
            }
            offset++;
          }
          if (!found) {
            setError('Scale is full of anchors!');
            return s;
          }
        }

        const targetNode = newNodes[targetIndex];
        newNodes[targetIndex] = {
          ...targetNode,
          hex: chroma(validHex).hex(),
          isAnchor: true,
        };

        const interpolated = interpolateColors(newNodes);
        return { ...s, nodes: interpolated, fullAnchorMap: buildAnchorMap(interpolated) };
      }));
    }

    setIsAddModalOpen(false);
    setHexInput('#f20d0d');
    setActiveScaleId(null);
    setEditingAnchorId(null);
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const toggleAnchor = (scaleId: string, nodeId: string) => {
    setScales(prev => prev.map(s => {
      if (s.id !== scaleId) return s;
      
      const newNodes = s.nodes.map(n => n.id === nodeId ? { ...n, isAnchor: !n.isAnchor } : n);
      const interpolated = interpolateColors(newNodes);
      return { ...s, nodes: interpolated, fullAnchorMap: buildAnchorMap(interpolated) };
    }));
  };

  const handleDragEnd = (scaleId: string, event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      setScales(prev => prev.map(s => {
        if (s.id !== scaleId) return s;
        
        const oldIndex = s.nodes.findIndex(n => n.id === active.id);
        const newIndex = s.nodes.findIndex(n => n.id === over.id);
        
        if (oldIndex !== -1 && newIndex !== -1) {
          let newNodes = arrayMove(s.nodes, oldIndex, newIndex);
          const draggedId = active.id;

          // fullAnchorMap is rebuilt from the result afterwards (buildAnchorMap), so any
          // anchor whose label shifts here doesn't leave a stale entry behind under its old label.
          newNodes = newNodes.map((n, i) => {
            const newLabel = getLabel(i, s.stepCount);
            return n.id === draggedId
              ? { ...n, index: i, label: newLabel, isAnchor: true }
              : { ...n, index: i, label: newLabel };
          });

          const interpolated = interpolateColors(newNodes);
          return { ...s, nodes: interpolated, fullAnchorMap: buildAnchorMap(interpolated) };
        }
        return s;
      }));
    }
  };

  const handleCancel = () => {
    setIsCancelConfirmOpen(true);
  };

  const generateFigmaNodes = () => {
    const allScaleNodes = scales.flatMap(scale =>
      scale.nodes.filter(n => !n.locked).map(n => ({
        index: n.index,
        label: n.label,
        name: `${scale.name}-${n.label}`,
        rgb: chroma(n.hex || '#ffffff').rgb(true).map(v => v / 255)
      }))
    );

    const allRawNodes = scales.flatMap(scale =>
      scale.nodes.filter(n => !n.locked).map(n => ({
        ...n,
        scaleName: scale.name,
        rgb: chroma(n.hex || '#ffffff').gl()
      }))
    );

    parent.postMessage({
      pluginMessage: {
        type: 'GENERATE_SCALE',
        nodes: allScaleNodes,
        rawNodes: allRawNodes
      }
    }, '*');
  };

  const handleExportClick = () => {
    parent.postMessage({ pluginMessage: { type: 'GET_COLLECTIONS' } }, '*');
    setIsExportModalOpen(true);
  };

  const createVariables = (e: React.FormEvent) => {
    e.preventDefault();
    if (!exportCollectionName.trim()) {
      showToast('Collection name cannot be empty');
      return;
    }

    const allRawNodes = scales.flatMap(scale =>
      scale.nodes.filter(n => !n.locked).map(n => ({
        ...n,
        scaleName: scale.name,
        label: String(n.label) + (n.isAnchor ? '*' : ''),
        rgb: chroma(n.hex || '#ffffff').gl()
      }))
    );

    parent.postMessage({
      pluginMessage: {
        type: 'CREATE_VARIABLES',
        collectionName: exportCollectionName.trim(),
        groupName: exportGroupName.trim(),
        rawNodes: allRawNodes
      }
    }, '*');
    
    setIsExportModalOpen(false);
  };

  const handleExportStylesClick = () => {
    parent.postMessage({ pluginMessage: { type: 'GET_STYLES' } }, '*');
    setIsStyleModalOpen(true);
  };

  const createStyles = (e: React.FormEvent) => {
    e.preventDefault();
    const allRawNodes = scales.flatMap(scale =>
      scale.nodes.filter(n => !n.locked).map(n => ({
        ...n,
        scaleName: scale.name,
        label: String(n.label) + (n.isAnchor ? '*' : ''),
        rgb: chroma(n.hex || '#ffffff').gl()
      }))
    );

    parent.postMessage({
      pluginMessage: {
        type: 'CREATE_STYLES',
        groupName: exportStyleGroupName.trim(),
        rawNodes: allRawNodes
      }
    }, '*');
    
    setIsStyleModalOpen(false);
  };


  const [theme, setTheme] = useState<'light' | 'dark'>('light');
  const [isImportDropdownOpen, setIsImportDropdownOpen] = useState(false);
  const [isExportDropdownOpen, setIsExportDropdownOpen] = useState(false);
  const [isCancelConfirmOpen, setIsCancelConfirmOpen] = useState(false);
  const [importMode, setImportMode] = useState<'append' | 'replace'>('append');
  const [isImportModeDropdownOpen, setIsImportModeDropdownOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportCollectionName, setExportCollectionName] = useState('Scaly Colors');
  const [exportGroupName, setExportGroupName] = useState('');
  const [existingCollections, setExistingCollections] = useState<{id: string, name: string, groups: string[]}[]>([]);
  const [isStyleModalOpen, setIsStyleModalOpen] = useState(false);
  const [exportStyleGroupName, setExportStyleGroupName] = useState('');
  const [existingStyles, setExistingStyles] = useState<string[]>([]);
  const [isImportVariableModalOpen, setIsImportVariableModalOpen] = useState(false);
  const [isImportStyleModalOpen, setIsImportStyleModalOpen] = useState(false);
  const [importVariablesData, setImportVariablesData] = useState<any[]>([]);
  const [importStylesData, setImportStylesData] = useState<any[]>([]);
  const [selectedImportVariables, setSelectedImportVariables] = useState<{ [key: string]: boolean }>({});
  const [selectedImportStyles, setSelectedImportStyles] = useState<{ [key: string]: boolean }>({});
  const [toast, setToast] = useState<string | null>(null);
  const toastTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 5000);
  };

  const handleImportedScales = useCallback((importedScales: any[], isReplace: boolean = false) => {
    const newScales = importedScales.map(imported => {
      // Force stepCount to be one of the standard step counts of the plugin (9, 11, 13, 15)
      const standardCounts = [9, 11, 13, 15];
      let stepCount = imported.stepCount;
      if (!standardCounts.includes(stepCount)) {
        stepCount = 11; // Default to 11 steps
      }
      
      const totalNodes = stepCount + 2;
      const maxIndex = totalNodes - 1;
      
      // Initialize empty standard nodes
      const nodes: ColorNode[] = Array.from({ length: totalNodes }).map((_, i) => {
        const label = getLabel(i, stepCount);
        return {
          id: `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${i}`,
          index: i,
          label,
          hex: i === 0 ? '#ffffff' : i === totalNodes - 1 ? '#000000' : null,
          isAnchor: i === 0 || i === totalNodes - 1,
          locked: i === 0 || i === totalNodes - 1
        };
      });

      // Map imported colors to standard steps
      const importedNodes = [...imported.nodes];
      
      importedNodes.forEach(imp => {
        const impLabelStr = String(imp.label);
        const impHex = imp.hex ? chroma(imp.hex).hex() : null;
        if (!impHex) return;

        // Try mapping by exact label match first
        let targetIndex = -1;
        for (let i = 0; i < totalNodes; i++) {
          if (String(getLabel(i, stepCount)) === impLabelStr) {
            targetIndex = i;
            break;
          }
        }

        // If no exact label match (e.g. fallback custom selection), map based on lightness
        if (targetIndex === -1) {
          const oklch = chroma(impHex).oklch();
          const l = oklch[0]; // 0 to 1
          targetIndex = Math.round((1 - l) * maxIndex);
          targetIndex = Math.max(0, Math.min(maxIndex, targetIndex));
        }

        // Check if this node should be treated as an anchor:
        // 1. Extreme white/black nodes (index 0 and maxIndex) are always anchors
        // 2. For fallback selections, all imported blocks are treated as anchors
        // 3. For structured design scales, only blocks having isAnchor === true are anchors
        const isFallback = imported.name === "Imported Selection";
        const shouldBeAnchor = isFallback || imp.isAnchor || targetIndex === 0 || targetIndex === maxIndex;

        if (shouldBeAnchor) {
          // Collision handling: find the nearest empty (non-anchor) step in nodes
          if (nodes[targetIndex].isAnchor) {
            // If it's the absolute first or last node (white/black), let's keep the custom hex if it fits
            if (targetIndex === 0 || targetIndex === maxIndex) {
              nodes[targetIndex].hex = impHex;
              return;
            }

            let offset = 1;
            let found = false;
            while (offset <= maxIndex) {
              if (targetIndex + offset < maxIndex && !nodes[targetIndex + offset].isAnchor) {
                targetIndex = targetIndex + offset;
                found = true;
                break;
              }
              if (targetIndex - offset > 0 && !nodes[targetIndex - offset].isAnchor) {
                targetIndex = targetIndex - offset;
                found = true;
                break;
              }
              offset++;
            }
            if (!found) return; // Scale is full, skip
          }

          // Place the color node as an anchor
          nodes[targetIndex].hex = impHex;
          nodes[targetIndex].isAnchor = true;
        } else {
          // Non-anchor color: We do NOT set isAnchor to true.
          // By default, the interpolation will override this step's color dynamically.
          // However, if there are NO anchors defined in the imported nodes list besides 0 and maxIndex,
          // we can still import this color as a starting point. But here, the user explicitly wants
          // to interpolate all non-anchor steps, so we do not mark it as anchor.
        }
      });

      const fullAnchorMap = buildAnchorMap(nodes);

      // Interpolate the missing steps
      const interpolated = interpolateColors(nodes);

      return {
        id: `scale-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        name: imported.name,
        stepCount,
        nodes: interpolated,
        fullAnchorMap
      };
    });

    if (isReplace) {
      setScales(newScales);
    } else {
      setScales(prev => [...prev, ...newScales]);
    }
    showToast(`Successfully imported ${newScales.length} scale(s) from design!`);
  }, [showToast]);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;

      if (msg.type === 'COLLECTIONS_DATA') {
        setExistingCollections(msg.collections);
      } else if (msg.type === 'STYLES_DATA') {
        setExistingStyles(msg.groups);
      } else if (msg.type === 'IMPORTED_SCALES_DATA') {
        handleImportedScales(msg.scales);
      } else if (msg.type === 'VARIABLES_IMPORT_DATA') {
        setImportVariablesData(msg.collections);
        setImportMode('append');
        setIsImportVariableModalOpen(true);
        // Pre-select all scales by default
        const initialSelections: { [key: string]: boolean } = {};
        msg.collections.forEach((col: any) => {
          col.groups.forEach((group: any) => {
            group.scales.forEach((scale: any) => {
              initialSelections[`${col.id}:${group.name}:${scale.name}`] = true;
            });
          });
        });
        setSelectedImportVariables(initialSelections);
      } else if (msg.type === 'STYLES_IMPORT_DATA') {
        setImportStylesData(msg.groups);
        setImportMode('append');
        setIsImportStyleModalOpen(true);
        const initialSelections: { [key: string]: boolean } = {};
        msg.groups.forEach((group: any) => {
          group.scales.forEach((scale: any) => {
            initialSelections[`${group.name}:${scale.name}`] = true;
          });
        });
        setSelectedImportStyles(initialSelections);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleImportedScales]);

  useEffect(() => {
    if (!isImportDropdownOpen && !isExportDropdownOpen && !isImportModeDropdownOpen) return;
    const handleOutsideClick = () => {
      setIsImportDropdownOpen(false);
      setIsExportDropdownOpen(false);
      setIsImportModeDropdownOpen(false);
    };
    window.addEventListener('click', handleOutsideClick);
    return () => window.removeEventListener('click', handleOutsideClick);
  }, [isImportDropdownOpen, isExportDropdownOpen, isImportModeDropdownOpen]);

  const closeToast = () => {
    setToast(null);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
  };

  const toggleImportVariable = (key: string) => {
    setSelectedImportVariables(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const toggleImportStyle = (key: string) => {
    setSelectedImportStyles(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const toggleAllVariablesInCollection = (colId: string, value: boolean) => {
    const updated = { ...selectedImportVariables };
    const col = importVariablesData.find(c => c.id === colId);
    if (col) {
      col.groups.forEach((g: any) => {
        g.scales.forEach((s: any) => {
          updated[`${colId}:${g.name}:${s.name}`] = value;
        });
      });
    }
    setSelectedImportVariables(updated);
  };

  const toggleAllVariablesInGroup = (colId: string, groupName: string, value: boolean) => {
    const updated = { ...selectedImportVariables };
    const col = importVariablesData.find(c => c.id === colId);
    if (col) {
      const g = col.groups.find((gr: any) => gr.name === groupName);
      if (g) {
        g.scales.forEach((s: any) => {
          updated[`${colId}:${groupName}:${s.name}`] = value;
        });
      }
    }
    setSelectedImportVariables(updated);
  };

  const toggleAllStylesInGroup = (groupName: string, value: boolean) => {
    const updated = { ...selectedImportStyles };
    const g = importStylesData.find(gr => gr.name === groupName);
    if (g) {
      g.scales.forEach((s: any) => {
        updated[`${groupName}:${s.name}`] = value;
      });
    }
    setSelectedImportStyles(updated);
  };

  const executeVariablesImport = () => {
    const scalesToImport: any[] = [];
    
    importVariablesData.forEach((col: any) => {
      col.groups.forEach((group: any) => {
        group.scales.forEach((scale: any) => {
          const isSelected = selectedImportVariables[`${col.id}:${group.name}:${scale.name}`];
          if (isSelected) {
            const mappedNodes = scale.nodes.map((n: any) => {
              return {
                label: n.label,
                hex: n.hex,
                isAnchor: !!n.isAnchor
              };
            });
            
            scalesToImport.push({
              name: scale.name,
              stepCount: scale.nodes.length,
              nodes: mappedNodes
            });
          }
        });
      });
    });
    
    if (scalesToImport.length === 0) {
      showToast('Please select at least one scale to import.');
      return;
    }
    
    handleImportedScales(scalesToImport, importMode === 'replace');
    setIsImportVariableModalOpen(false);
  };

  const executeStylesImport = () => {
    const scalesToImport: any[] = [];
    
    importStylesData.forEach((group: any) => {
      group.scales.forEach((scale: any) => {
        const isSelected = selectedImportStyles[`${group.name}:${scale.name}`];
        if (isSelected) {
          const mappedNodes = scale.nodes.map((n: any) => {
            return {
              label: n.label,
              hex: n.hex,
              isAnchor: !!n.isAnchor
            };
          });
          
          scalesToImport.push({
            name: scale.name,
            stepCount: scale.nodes.length,
            nodes: mappedNodes
          });
        }
      });
    });
    
    if (scalesToImport.length === 0) {
      showToast('Please select at least one scale to import.');
      return;
    }
    
    handleImportedScales(scalesToImport, importMode === 'replace');
    setIsImportStyleModalOpen(false);
  };

  const toggleTheme = () => {
    setTheme(prev => prev === 'light' ? 'dark' : 'light');
  };

  return (
    <div className={`p-4 flex flex-col h-[100vh] ${theme === 'light' ? 'bg-gradient-to-br from-slate-50 to-slate-200/50 text-slate-800' : 'dark bg-gradient-to-br from-[#0a0a0a] to-[#121212] text-slate-100'} font-sans pb-32 overflow-y-auto no-scrollbar transition-colors duration-500`}>
      {/* Header */}
      <div className="flex justify-between items-center mb-6 mt-2 px-2">
        <div className={`flex gap-4 items-center pl-2 ${theme === 'light' ? 'text-black/90' : 'text-white/90'}`}>
          <svg width="32" height="56" viewBox="0 0 157 269" fill="none" xmlns="http://www.w3.org/2000/svg">
          <path d="M71 0C61.6761 -1.11186e-07 52.4436 1.83647 43.8295 5.40455C35.2154 8.97264 27.3884 14.2025 20.7954 20.7954C14.2025 27.3884 8.97264 35.2154 5.40455 43.8295C1.83647 52.4436 -2.96373e-07 61.6761 0 71C2.96373e-07 80.3239 1.83647 89.5564 5.40455 98.1705C8.97264 106.785 14.2025 114.612 20.7954 121.205C27.3884 127.798 35.2154 133.027 43.8295 136.595C52.4436 140.164 61.6762 142 71 142L71 0Z" fill="currentColor"/>
          <path d="M86 269C104.83 269 122.89 261.52 136.205 248.205C149.52 234.89 157 216.83 157 198C157 179.17 149.52 161.111 136.205 147.795C122.89 134.48 104.83 127 86 127L86 269Z" fill="currentColor"/>
          <path d="M71 213C71 203.676 69.1635 194.444 65.5955 185.829C62.0274 177.215 56.7976 169.388 50.2046 162.795C43.6116 156.202 35.7846 150.973 27.1705 147.405C18.5564 143.836 9.32385 142 0 142L1.15674e-05 213H71Z" fill="currentColor"/>
          <path d="M86 59C86 68.3239 87.8365 77.5564 91.4045 86.1705C94.9726 94.7846 100.202 102.612 106.795 109.205C113.388 115.798 121.215 121.027 129.829 124.595C138.444 128.164 147.676 130 157 130V59L86 59Z" fill="currentColor"/>
          </svg>
          <div className="flex flex-col pl-2">
            <p className={`text-xs font-semibold mb-1 ${theme === 'light' ? 'text-black/40' : 'text-white/40'}`}>
              Scale Generator - by Cakhogung
            </p>
            <div className="flex items-center gap-4">
              <button 
                onClick={() => setActiveTab('color')}
                className={`text-2xl font-medium transition-all ${activeTab === 'color' ? (theme === 'light' ? 'text-slate-900' : 'text-white') : (theme === 'light' ? 'text-slate-300 hover:text-slate-400' : 'text-slate-600 hover:text-slate-500')}`}
              >
                Color
              </button>
              <button 
                onClick={() => setActiveTab('typo')}
                className={`text-2xl font-medium transition-all ${activeTab === 'typo' ? (theme === 'light' ? 'text-slate-900' : 'text-white') : (theme === 'light' ? 'text-slate-300 hover:text-slate-400' : 'text-slate-600 hover:text-slate-500')}`}
              >
                Typography
              </button>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 pr-2">
          <button
            onClick={handleCancel}
            className={`text-sm font-semibold px-4 py-1.5 rounded-full transition-all ${theme === 'light' ? 'text-slate-500 hover:bg-slate-200/50 hover:text-slate-900' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}
          >
            Cancel
          </button>
        </div>
      </div>
      {/* Toast Notification */}
      {toast && (
        <ToastNotification 
          message={toast} 
          theme={theme} 
          onClose={closeToast} 
        />
        )}

      {activeTab === 'color' && (
        <>
      {scales.map((scale, scaleIdx) => (
        <div key={scale.id} className={`flex flex-col p-5 rounded-[2rem] backdrop-blur-2xl border transition-colors duration-300 ${theme === 'light' ? 'bg-white/40 border-white shadow-[0_8px_30px_rgb(0,0,0,0.04)]' : 'bg-white/[0.02] border-white/5 shadow-2xl'} ${scaleIdx > 0 ? 'mt-6' : ''}`}>
          <div className="flex justify-between items-center mb-5">
            <div className="flex items-center gap-3">
              {/* Editable Scale Order */}
              {editingOrderScaleId === scale.id ? (
                <input
                  ref={orderInputRef}
                  type="text"
                  maxLength={2}
                  value={orderInputValue}
                  onChange={(e) => setOrderInputValue(e.target.value.replace(/\D/g, ''))}
                  onBlur={() => handleOrderSubmit(scale.id)}
                  onKeyDown={(e) => handleOrderKeyDown(e, scale.id)}
                  className={`text-2xl font-mono ${theme === 'light' ? 'text-gray-900' : 'text-white'} border-b-2 border-gray-500 outline-none bg-transparent w-[40px] text-center`}
                />
              ) : (
                <span 
                  className={`text-2xl font-mono cursor-pointer transition-colors ${theme === 'light' ? 'text-slate-300 hover:text-slate-500' : 'text-slate-600 hover:text-slate-400'}`}
                  onClick={() => {
                    setOrderInputValue(String(scaleIdx + 1).padStart(2, '0'));
                    setEditingOrderScaleId(scale.id);
                  }}
                  title="Click to change order"
                >
                  {String(scaleIdx + 1).padStart(2, '0')}
                </span>
              )}

              {/* Scale Name */}
              <div className="flex items-center group cursor-pointer gap-2" onClick={() => setEditingScaleId(scale.id)}>
                {editingScaleId === scale.id ? (
                  <input
                    ref={nameInputRef}
                    type="text"
                    maxLength={30}
                    value={scale.name}
                    onChange={(e) => updateScale(scale.id, { name: e.target.value })}
                    onBlur={() => setEditingScaleId(null)}
                    onKeyDown={handleNameKeyDown}
                    className={`text-xl font-bold ${theme === 'light' ? 'text-gray-900' : 'text-white'} border-b-2 border-gray-500 outline-none bg-transparent w-[280px]`}
                  />
                ) : (
                  <>
                    <h1 className={`text-xl font-bold ${theme === 'light' ? 'text-gray-900' : 'text-white'}`}>{scale.name}</h1>
                    <Pencil size={14} strokeWidth={2.5} className="text-gray-400 opacity-50 group-hover:opacity-100 transition-opacity" />
                  </>
                )}
              </div>
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-3 bg-transparent p-1">
                {[9, 11, 13, 15].map(steps => (
                  <button
                    key={steps}
                    onClick={() => handleStepCountChange(scale.id, steps)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition-all ${
                      scale.stepCount === steps
                        ? (theme === 'light' ? 'bg-slate-900/10 text-slate-900 shadow-sm' : 'bg-white/10 text-white shadow-sm')
                        : (theme === 'light' ? 'text-slate-400 hover:text-slate-900' : 'text-slate-500 hover:text-white')
                    }`}
                  >
                    {steps}
                  </button>
                ))}
              </div>
              {scales.length > 1 && (
                <button 
                  onClick={() => setScales(prev => prev.filter(s => s.id !== scale.id))}
                  className="text-gray-400 hover:text-red-500 transition-colors"
                  title="Remove scale"
                >
                  <Trash2 size={16} strokeWidth={2.5} />
                </button>
              )}
            </div>
          </div>
          
          <div className="mb-6 flex flex-wrap gap-2 items-center">
            {scale.nodes.filter(n => n.isAnchor && !n.locked).map(anchor => (
              <AnchorColorItem
                key={anchor.id}
                anchor={anchor}
                theme={theme}
                onRemove={() => removeAnchor(scale.id, anchor.id)}
                onChange={(newHex) => updateAnchorColor(scale.id, anchor.id, newHex)}
                onOpenPicker={(hex) => {
                  setHexInput(hex);
                  setActiveScaleId(scale.id);
                  setEditingAnchorId(anchor.id);
                  setIsAddModalOpen(true);
                }}
              />
            ))}
            {scale.nodes.filter(n => n.isAnchor && !n.locked).length < scale.stepCount && (
              <button 
                onClick={() => { 
                  setHexInput('#f20d0d'); 
                  setActiveScaleId(scale.id);
                  setIsAddModalOpen(true); 
                }}
                className={`w-10 aspect-square rounded-full border border-dashed backdrop-blur-md transition-all ${theme === 'light' ? 'border-slate-300 bg-white/50 text-slate-500 hover:bg-white hover:shadow-sm' : 'border-slate-600 bg-black/20 text-slate-400 hover:bg-black/40 hover:border-slate-500'} flex items-center justify-center`}
                title="Add new anchor"
              >
                <Plus size={16} strokeWidth={3} />
              </button>
            )}
          </div>
          <div className={`w-full relative p-4 rounded-[16px] transition-colors duration-300 ${theme === 'light' ? 'bg-white shadow-sm ring-1 ring-slate-900/5' : 'bg-[#000000] ring-1 ring-white/10'}`}>
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={(e) => handleDragEnd(scale.id, e)}
            >
              <div className="flex w-full gap-2">
                <SortableContext
                  items={scale.nodes.filter(n => !n.locked).map(n => n.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  {scale.nodes.filter(n => !n.locked).map(node => (
                    <SortableColorNode
                      key={node.id}
                      node={node}
                      theme={theme}
                      onToggleAnchor={() => toggleAnchor(scale.id, node.id)}
                      onShowToast={showToast}
                    />
                  ))}
                </SortableContext>
              </div>
            </DndContext>
            
            <div className={`w-full h-[6px] rounded-full overflow-hidden mt-3 shadow-inner border ${theme === 'light' ? 'border-slate-100' : 'border-[#1a1a1a]'}`}>
              <div 
                className="w-full h-full"
                style={{
                  background: `linear-gradient(to right, ${scale.nodes.filter(n => !n.locked).map(n => n.hex).join(', ')})`
                }}
              />
            </div>
          </div>
        </div>
      ))}

      {isCancelConfirmOpen && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className={`rounded-3xl shadow-2xl p-6 w-full max-w-sm backdrop-blur-3xl border transition-colors ${theme === 'light' ? 'bg-white border-slate-200 shadow-slate-300/50' : 'bg-[#111111]/90 border-white/10 shadow-black/50'}`}>
            <h2 className={`text-lg font-bold mb-2 ${theme === 'light' ? 'text-slate-800' : 'text-white'}`}>
              Close Scaly?
            </h2>
            <p className={`text-sm mb-6 font-medium ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
              You have unsaved changes. Would you like to draw your color scales onto the canvas before closing?
            </p>
            <div className="flex flex-col gap-2.5">
              <button
                onClick={() => {
                  generateFigmaNodes();
                  setTimeout(() => {
                    parent.postMessage({ pluginMessage: { type: 'CANCEL' } }, '*');
                  }, 100);
                }}
                className="w-full font-bold text-sm py-2.5 rounded-xl transition-all bg-black text-white hover:bg-slate-800 dark:bg-white dark:text-black dark:hover:bg-slate-100 flex items-center justify-center gap-1.5"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 20h9M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
                <span>Draw & Close</span>
              </button>
              
              <button
                onClick={() => {
                  parent.postMessage({ pluginMessage: { type: 'CANCEL' } }, '*');
                }}
                className={`w-full font-bold text-sm py-2.5 rounded-xl transition-all border flex items-center justify-center gap-1.5 ${
                  theme === 'light' 
                    ? 'border-red-200 text-red-600 hover:bg-red-50 bg-white' 
                    : 'border-red-500/20 text-red-400 hover:bg-red-500/10 bg-transparent'
                }`}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2M10 11v6M14 11v6" />
                </svg>
                <span>Discard & Close</span>
              </button>
              
              <button
                onClick={() => setIsCancelConfirmOpen(false)}
                className={`w-full font-bold text-sm py-2.5 rounded-xl transition-all ${
                  theme === 'light' 
                    ? 'bg-slate-100 text-slate-700 hover:bg-slate-200' 
                    : 'bg-white/5 text-slate-300 hover:bg-white/10'
                }`}
              >
                Keep Editing
              </button>
            </div>
          </div>
        </div>
      )}

      {isExportModalOpen && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className={`rounded-3xl shadow-2xl p-6 w-full max-w-md backdrop-blur-3xl border transition-colors ${theme === 'light' ? 'bg-white border-white/60 shadow-slate-300/50' : 'bg-[#111111]/90 border-white/10 shadow-black/50'}`}>
            <h2 className={`text-lg font-bold mb-4 ${theme === 'light' ? 'text-slate-800' : 'text-white'}`}>
              Export to Variables
            </h2>
            <form onSubmit={createVariables} className="flex flex-col gap-4">
              <div>
                <label className={`block text-xs font-semibold mb-2 ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>Collection Name</label>
                <input
                  type="text"
                  value={exportCollectionName}
                  onChange={(e) => setExportCollectionName(e.target.value)}
                  placeholder="e.g. Brand Colors"
                  className={`w-full px-4 py-2 rounded-xl border font-medium outline-none transition-all ${
                    theme === 'light' 
                      ? 'bg-slate-50 border-slate-200 focus:border-blue-500 text-slate-800' 
                      : 'bg-white/5 border-white/10 focus:border-blue-400 text-white placeholder-slate-500'
                  }`}
                />
              </div>

              {existingCollections.length > 0 && (
                <div>
                  <div className={`flex flex-row flex-nowrap gap-2 overflow-x-auto no-scrollbar rounded-xl p-2 border ${theme === 'light' ? 'bg-slate-50 border-slate-100' : 'bg-white/5 border-white/5'}`}>
                    {existingCollections.map(c => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => { setExportCollectionName(c.name); setExportGroupName(''); }}
                        className={`text-xs px-3 py-1.5 rounded-lg shrink-0 transition-colors ${
                          exportCollectionName === c.name
                            ? (theme === 'light' ? 'bg-blue-100 text-blue-700 font-bold' : 'bg-blue-500/20 text-blue-300 font-bold')
                            : (theme === 'light' ? 'bg-white hover:bg-slate-200 text-slate-600' : 'bg-white/5 hover:bg-white/10 text-slate-300')
                        }`}
                      >
                        {c.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className={`block text-xs font-semibold mb-2 ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>Group Name (Optional, uses / for nesting)</label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={exportGroupName}
                    onChange={(e) => setExportGroupName(e.target.value)}
                    placeholder="e.g. UI/Colors"
                    className={`w-full pl-4 pr-36 py-2 rounded-xl border font-medium outline-none transition-all ${
                      theme === 'light' 
                        ? 'bg-slate-50 border-slate-200 focus:border-blue-500 text-slate-800' 
                        : 'bg-white/5 border-white/10 focus:border-blue-400 text-white placeholder-slate-500'
                    }`}
                  />
                  <div className="absolute right-3 pointer-events-none flex items-center select-none">
                    <span className={`text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded-md border ${
                      theme === 'light'
                        ? 'bg-slate-100 border-slate-200 text-slate-400'
                        : 'bg-white/5 border-white/10 text-slate-500'
                    }`}>
                      / [Scale Name]
                    </span>
                  </div>
                </div>
              </div>

              {(() => {
                const selectedCol = existingCollections.find(c => c.name === exportCollectionName);
                if (selectedCol && selectedCol.groups && selectedCol.groups.length > 0) {
                  return (
                    <div>
                      <div className={`flex flex-row flex-nowrap gap-2 overflow-x-auto no-scrollbar rounded-xl p-2 border ${theme === 'light' ? 'bg-slate-50 border-slate-100' : 'bg-white/5 border-white/5'}`}>
                        {selectedCol.groups.map(g => (
                          <button
                            key={g}
                            type="button"
                            onClick={() => setExportGroupName(g)}
                            className={`text-xs px-3 py-1.5 rounded-lg shrink-0 transition-colors ${
                              exportGroupName === g
                                ? (theme === 'light' ? 'bg-blue-100 text-blue-700 font-bold' : 'bg-blue-500/20 text-blue-300 font-bold')
                                : (theme === 'light' ? 'bg-white hover:bg-slate-200 text-slate-600' : 'bg-white/5 hover:bg-white/10 text-slate-300')
                            }`}
                          >
                            {g}
                          </button>
                        ))}
                      </div>
                    </div>
                  );
                }
                return null;
              })()}
              
              <div className="flex justify-end gap-2 mt-2">
                <button 
                  type="button"
                  onClick={() => setIsExportModalOpen(false)}
                  className={`px-4 py-2 text-sm rounded-full font-regular transition-colors ${theme === 'light' ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-300 hover:bg-[#0A0A17]'}`}
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className={`text-sm px-5 py-2 rounded-full font-bold shadow-md transition-all ${theme === 'light' ? 'bg-gray-900 hover:bg-black text-white' : 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 text-white'}`}
                >
                  Export
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isStyleModalOpen && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className={`rounded-3xl shadow-2xl p-6 w-full max-w-md backdrop-blur-3xl border transition-colors ${theme === 'light' ? 'bg-white border-white/60 shadow-slate-300/50' : 'bg-[#111111]/90 border-white/10 shadow-black/50'}`}>
            <h2 className={`text-lg font-bold mb-4 ${theme === 'light' ? 'text-slate-800' : 'text-white'}`}>
              Export to Styles
            </h2>
            <form onSubmit={createStyles} className="flex flex-col gap-4">
              <div>
                <label className={`block text-xs font-semibold mb-2 ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>Group Name (Optional, uses / for nesting)</label>
                <div className="relative flex items-center">
                  <input
                    type="text"
                    value={exportStyleGroupName}
                    onChange={(e) => setExportStyleGroupName(e.target.value)}
                    placeholder="e.g. Brand/Colors"
                    className={`w-full pl-4 pr-36 py-2 rounded-xl border font-medium outline-none transition-all ${
                      theme === 'light' 
                        ? 'bg-slate-50 border-slate-200 focus:border-blue-500 text-slate-800' 
                        : 'bg-white/5 border-white/10 focus:border-blue-400 text-white placeholder-slate-500'
                    }`}
                  />
                  <div className="absolute right-3 pointer-events-none flex items-center select-none">
                    <span className={`text-[10px] font-mono font-bold tracking-wider px-2 py-0.5 rounded-md border ${
                      theme === 'light'
                        ? 'bg-slate-100 border-slate-200 text-slate-400'
                        : 'bg-white/5 border-white/10 text-slate-500'
                    }`}>
                      / [Scale Name]
                    </span>
                  </div>
                </div>
              </div>

              {existingStyles.length > 0 && (
                <div>
                  <label className={`block text-xs font-semibold mb-2 ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>Or select existing group</label>
                  <div className={`flex flex-row flex-nowrap gap-2 overflow-x-auto no-scrollbar rounded-xl p-2 border ${theme === 'light' ? 'bg-slate-50 border-slate-100' : 'bg-white/5 border-white/5'}`}>
                    {existingStyles.map(g => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setExportStyleGroupName(g)}
                        className={`text-xs px-3 py-1.5 rounded-lg shrink-0 transition-colors ${
                          exportStyleGroupName === g
                            ? (theme === 'light' ? 'bg-blue-100 text-blue-700 font-bold' : 'bg-blue-500/20 text-blue-300 font-bold')
                            : (theme === 'light' ? 'bg-white hover:bg-slate-200 text-slate-600' : 'bg-white/5 hover:bg-white/10 text-slate-300')
                        }`}
                      >
                        {g}
                      </button>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="flex justify-end gap-2 mt-2">
                <button 
                  type="button"
                  onClick={() => setIsStyleModalOpen(false)}
                  className={`px-4 py-2 text-sm rounded-full font-regular transition-colors ${theme === 'light' ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-300 hover:bg-[#0A0A17]'}`}
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className={`text-sm px-5 py-2 rounded-full font-bold shadow-md transition-all ${theme === 'light' ? 'bg-gray-900 hover:bg-black text-white' : 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 text-white'}`}
                >
                  Export
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {isImportVariableModalOpen && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className={`rounded-3xl shadow-2xl p-6 w-full max-w-lg backdrop-blur-3xl border flex flex-col max-h-[85vh] transition-colors ${theme === 'light' ? 'bg-white border-white/60 shadow-slate-300/50' : 'bg-[#111111]/90 border-white/10 shadow-black/50'}`}>
            <h2 className={`text-lg font-bold ${theme === 'light' ? 'text-slate-800' : 'text-white'}`}>
              Import from Variables
            </h2>
            <p className={`text-xs mt-1 ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
              Select which color scales you want to import. Steps ending with '*' will be treated as anchors, and other steps will be interpolated.
            </p>

            <div className="flex-1 overflow-y-auto pr-1 my-4 space-y-4 max-h-[50vh] no-scrollbar">
              {importVariablesData.map(col => {
                const allInColSelected = col.groups.every((g: any) => g.scales.every((s: any) => selectedImportVariables[`${col.id}:${g.name}:${s.name}`]));
                const someInColSelected = col.groups.some((g: any) => g.scales.some((s: any) => selectedImportVariables[`${col.id}:${g.name}:${s.name}`]));
                return (
                  <div key={col.id} className={`p-4 rounded-2xl border ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-white/5 border-white/10'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <CustomCheckbox
                        checked={allInColSelected}
                        indeterminate={someInColSelected && !allInColSelected}
                        onChange={(val) => toggleAllVariablesInCollection(col.id, val)}
                        theme={theme}
                      />
                      <span className={`text-sm font-bold ${theme === 'light' ? 'text-slate-800' : 'text-white'}`}>
                        {col.name}
                      </span>
                    </div>
                    
                    <div className="pl-6 space-y-3">
                       {col.groups.map((group: any) => {
                        const allInGroupSelected = group.scales.every((s: any) => selectedImportVariables[`${col.id}:${group.name}:${s.name}`]);
                        const someInGroupSelected = group.scales.some((s: any) => selectedImportVariables[`${col.id}:${group.name}:${s.name}`]);
                        const isDefaultGroup = group.name === 'Default Group';
                        return (
                          <div key={group.name} className="space-y-2">
                            {!isDefaultGroup && (
                              <div className="flex items-center gap-2">
                                <CustomCheckbox
                                  checked={allInGroupSelected}
                                  indeterminate={someInGroupSelected && !allInGroupSelected}
                                  onChange={(val) => toggleAllVariablesInGroup(col.id, group.name, val)}
                                  theme={theme}
                                  size="sm"
                                />
                                <span className={`text-xs font-semibold uppercase tracking-wider ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
                                  {group.name}
                                </span>
                              </div>
                            )}
                            
                            <div className={`${isDefaultGroup ? '' : 'pl-6'} space-y-2`}>
                              {group.scales.map((scale: any) => {
                                const key = `${col.id}:${group.name}:${scale.name}`;
                                const isChecked = !!selectedImportVariables[key];
                                return (
                                  <div 
                                    key={scale.name} 
                                    onClick={() => toggleImportVariable(key)}
                                    className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-all ${
                                      isChecked 
                                        ? (theme === 'light' ? 'bg-blue-50/50 hover:bg-blue-50' : 'bg-blue-500/10 hover:bg-blue-500/15')
                                        : (theme === 'light' ? 'hover:bg-slate-100' : 'hover:bg-white/5')
                                    }`}
                                  >
                                    <div className="flex items-center gap-2">
                                      <CustomCheckbox
                                        checked={isChecked}
                                        onChange={() => toggleImportVariable(key)}
                                        theme={theme}
                                        size="sm"
                                      />
                                      <span className={`text-xs font-medium ${theme === 'light' ? 'text-slate-700' : 'text-slate-200'}`}>
                                        {scale.name}
                                      </span>
                                    </div>
                                    <div className="flex gap-0.5 items-center">
                                      {scale.nodes.map((node: any, idx: number) => (
                                        <div 
                                          key={idx} 
                                          className="w-2.5 h-2.5 rounded-full border border-black/10" 
                                          style={{ backgroundColor: node.hex }} 
                                        />
                                      ))}
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-100 dark:border-white/5">
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsImportModeDropdownOpen(prev => !prev);
                  }}
                  className={`text-xs font-bold px-4 py-2 rounded-full border transition-all flex items-center gap-1.5 ${
                    theme === 'light' 
                      ? 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800' 
                      : 'bg-white/5 border-white/10 hover:bg-white/10 text-white'
                  }`}
                >
                  <span>{importMode === 'append' ? 'Append' : 'Replace'}</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={`opacity-80 transition-transform ${isImportModeDropdownOpen ? 'rotate-180' : ''}`}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {isImportModeDropdownOpen && (
                  <div className={`absolute top-full mt-2 left-0 backdrop-blur-2xl border p-1.5 shadow-2xl rounded-2xl flex flex-col gap-1 w-[160px] z-[60] animate-in fade-in slide-in-from-top-2 duration-150 ${
                    theme === 'light' 
                      ? 'bg-white/95 border-slate-200 shadow-slate-200/50 text-slate-800' 
                      : 'bg-[#181818]/95 border-white/10 shadow-black/80 text-white'
                  }`}>
                    <button
                      type="button"
                      onClick={() => {
                        setImportMode('append');
                        setIsImportModeDropdownOpen(false);
                      }}
                      className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-xl text-left transition-colors ${
                        importMode === 'append'
                          ? (theme === 'light' ? 'bg-slate-100 font-bold' : 'bg-white/10 font-bold')
                          : (theme === 'light' ? 'hover:bg-slate-100' : 'hover:bg-white/5')
                      }`}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${importMode === 'append' ? 'opacity-100' : 'opacity-0'}`}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Append</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setImportMode('replace');
                        setIsImportModeDropdownOpen(false);
                      }}
                      className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-xl text-left transition-colors ${
                        importMode === 'replace'
                          ? (theme === 'light' ? 'bg-slate-100 font-bold' : 'bg-white/10 font-bold')
                          : (theme === 'light' ? 'hover:bg-slate-100' : 'hover:bg-white/5')
                      }`}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${importMode === 'replace' ? 'opacity-100' : 'opacity-0'}`}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Replace</span>
                    </button>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button 
                  type="button"
                  onClick={() => setIsImportVariableModalOpen(false)}
                  className={`px-4 py-2 text-sm rounded-full font-regular transition-colors ${theme === 'light' ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-300 hover:bg-[#0A0A17]'}`}
                >
                  Cancel
                </button>
                <button 
                  type="button"
                  onClick={executeVariablesImport}
                  className={`text-sm px-5 py-2 rounded-full font-bold shadow-md transition-all ${theme === 'light' ? 'bg-gray-900 hover:bg-black text-white' : 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 text-white'}`}
                >
                  Import Selected
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isImportStyleModalOpen && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className={`rounded-3xl shadow-2xl p-6 w-full max-w-lg backdrop-blur-3xl border flex flex-col max-h-[85vh] transition-colors ${theme === 'light' ? 'bg-white border-white/60 shadow-slate-300/50' : 'bg-[#111111]/90 border-white/10 shadow-black/50'}`}>
            <h2 className={`text-lg font-bold ${theme === 'light' ? 'text-slate-800' : 'text-white'}`}>
              Import from Styles
            </h2>
            <p className={`text-xs mt-1 ${theme === 'light' ? 'text-slate-500' : 'text-slate-400'}`}>
              Select which color styles you want to import. Steps ending with '*' will be treated as anchors, and other steps will be interpolated.
            </p>

            <div className="flex-1 overflow-y-auto pr-1 my-4 space-y-4 max-h-[50vh] no-scrollbar">
              {importStylesData.map(group => {
                const allInGroupSelected = group.scales.every((s: any) => selectedImportStyles[`${group.name}:${s.name}`]);
                const someInGroupSelected = group.scales.some((s: any) => selectedImportStyles[`${group.name}:${s.name}`]);
                return (
                  <div key={group.name} className={`p-4 rounded-2xl border ${theme === 'light' ? 'bg-slate-50 border-slate-200' : 'bg-white/5 border-white/10'}`}>
                    <div className="flex items-center gap-2 mb-3">
                      <CustomCheckbox
                        checked={allInGroupSelected}
                        indeterminate={someInGroupSelected && !allInGroupSelected}
                        onChange={(val) => toggleAllStylesInGroup(group.name, val)}
                        theme={theme}
                      />
                      <span className={`text-sm font-bold ${theme === 'light' ? 'text-slate-800' : 'text-white'}`}>
                        {group.name === 'Default Group' ? 'Global Styles' : group.name}
                      </span>
                    </div>
                    
                    <div className="pl-6 space-y-2">
                      {group.scales.map((scale: any) => {
                        const key = `${group.name}:${scale.name}`;
                        const isChecked = !!selectedImportStyles[key];
                        return (
                          <div 
                            key={scale.name} 
                            onClick={() => toggleImportStyle(key)}
                            className={`flex items-center justify-between p-2 rounded-xl cursor-pointer transition-all ${
                              isChecked 
                                ? (theme === 'light' ? 'bg-blue-50/50 hover:bg-blue-50' : 'bg-blue-500/10 hover:bg-blue-500/15')
                                : (theme === 'light' ? 'hover:bg-slate-100' : 'hover:bg-white/5')
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <CustomCheckbox
                                checked={isChecked}
                                onChange={() => toggleImportStyle(key)}
                                theme={theme}
                                size="sm"
                              />
                              <span className={`text-xs font-medium ${theme === 'light' ? 'text-slate-700' : 'text-slate-200'}`}>
                                {scale.name}
                              </span>
                            </div>
                            <div className="flex gap-0.5 items-center">
                              {scale.nodes.map((node: any, idx: number) => (
                                <div 
                                  key={idx} 
                                  className="w-2.5 h-2.5 rounded-full border border-black/10" 
                                  style={{ backgroundColor: node.hex }} 
                                />
                              ))}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-between items-center mt-2 pt-2 border-t border-slate-100 dark:border-white/5">
              <div className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    setIsImportModeDropdownOpen(prev => !prev);
                  }}
                  className={`text-xs font-bold px-4 py-2 rounded-full border transition-all flex items-center gap-1.5 ${
                    theme === 'light' 
                      ? 'bg-slate-50 border-slate-200 hover:bg-slate-100 text-slate-800' 
                      : 'bg-white/5 border-white/10 hover:bg-white/10 text-white'
                  }`}
                >
                  <span>{importMode === 'append' ? 'Append' : 'Replace'}</span>
                  <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className={`opacity-80 transition-transform ${isImportModeDropdownOpen ? 'rotate-180' : ''}`}>
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </button>

                {isImportModeDropdownOpen && (
                  <div className={`absolute top-full mt-2 left-0 backdrop-blur-2xl border p-1.5 shadow-2xl rounded-2xl flex flex-col gap-1 w-[160px] z-[60] animate-in fade-in slide-in-from-top-2 duration-150 ${
                    theme === 'light' 
                      ? 'bg-white/95 border-slate-200 shadow-slate-200/50 text-slate-800' 
                      : 'bg-[#181818]/95 border-white/10 shadow-black/80 text-white'
                  }`}>
                    <button
                      type="button"
                      onClick={() => {
                        setImportMode('append');
                        setIsImportModeDropdownOpen(false);
                      }}
                      className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-xl text-left transition-colors ${
                        importMode === 'append'
                          ? (theme === 'light' ? 'bg-slate-100 font-bold' : 'bg-white/10 font-bold')
                          : (theme === 'light' ? 'hover:bg-slate-100' : 'hover:bg-white/5')
                      }`}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${importMode === 'append' ? 'opacity-100' : 'opacity-0'}`}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Append</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setImportMode('replace');
                        setIsImportModeDropdownOpen(false);
                      }}
                      className={`flex items-center gap-2 px-3 py-1.5 text-xs font-semibold rounded-xl text-left transition-colors ${
                        importMode === 'replace'
                          ? (theme === 'light' ? 'bg-slate-100 font-bold' : 'bg-white/10 font-bold')
                          : (theme === 'light' ? 'hover:bg-slate-100' : 'hover:bg-white/5')
                      }`}
                    >
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className={`shrink-0 ${importMode === 'replace' ? 'opacity-100' : 'opacity-0'}`}>
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>Replace</span>
                    </button>
                  </div>
                )}
              </div>
              <div className="flex gap-2">
                <button 
                  type="button"
                  onClick={() => setIsImportStyleModalOpen(false)}
                  className={`px-4 py-2 text-sm rounded-full font-regular transition-colors ${theme === 'light' ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-300 hover:bg-[#0A0A17]'}`}
                >
                  Cancel
                </button>
                <button 
                  type="button"
                  onClick={executeStylesImport}
                  className={`text-sm px-5 py-2 rounded-full font-bold shadow-md transition-all ${theme === 'light' ? 'bg-gray-900 hover:bg-black text-white' : 'bg-gradient-to-r from-blue-500 to-indigo-500 hover:from-blue-400 hover:to-indigo-400 text-white'}`}
                >
                  Import Selected
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {isAddModalOpen && (
        <div className="fixed inset-0 bg-slate-900/20 backdrop-blur-sm flex items-center justify-center z-50 p-4 animate-in fade-in duration-200">
          <div className={`rounded-3xl shadow-2xl p-6 w-full max-w-sm backdrop-blur-3xl border transition-colors ${theme === 'light' ? 'bg-white border-white/60 shadow-slate-300/50' : 'bg-[#111111]/90 border-white/10 shadow-black/50'}`}>
            <h2 className={`text-lg font-bold mb-4 ${theme === 'light' ? 'text-slate-800' : 'text-white'}`}>
              {editingAnchorId ? 'Edit Anchor Color' : 'Add New Anchor'}
            </h2>
            <form onSubmit={handleAddAnchor} className="flex flex-col gap-3">
              <ColorPicker color={hexInput} onChange={setHexInput} theme={theme} />
              
              {error && <div className="text-red-500 text-sm">{error}</div>}
              <div className="flex justify-end gap-2 mt-2">
                <button 
                  type="button"
                  onClick={() => { setIsAddModalOpen(false); setError(''); setHexInput('#f20d0d'); setActiveScaleId(null); }}
                  className={`px-4 py-2 text-sm rounded-full font-regular transition-colors ${theme === 'light' ? 'text-gray-600 hover:bg-gray-100' : 'text-gray-300 hover:bg-[#0A0A17]'}`}
                >
                  Cancel
                </button>
                <button 
                  type="submit"
                  className={`text-sm px-4 py-2 rounded-full font-regular transition-colors ${theme === 'light' ? 'bg-gray-900 hover:bg-black text-white' : 'bg-white hover:bg-gray-200 text-gray-900'}`}
                >
                  {editingAnchorId ? 'Update Color' : 'Add Anchor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
        </>
      )}

      {activeTab === 'typo' && (
        <div className="flex flex-col items-center justify-center h-full opacity-50 mt-20">
          <p className="text-xl font-bold">Typography Scale (Coming Soon)</p>
        </div>
      )}

      {/* Bottom Gradient Overlay with Glassmorphic Gradient Blur */}
      <div 
        className={`fixed bottom-0 left-0 w-full h-32 pointer-events-none z-30 backdrop-blur-[8px] transition-all duration-500 ${
          theme === 'light' 
            ? 'bg-gradient-to-t from-slate-50/90 via-slate-50/40 to-transparent' 
            : 'bg-gradient-to-t from-[#0a0a0a]/95 via-[#0a0a0a]/40 to-transparent'
        }`}
        style={{
          WebkitMaskImage: 'linear-gradient(to top, black 25%, transparent)',
          maskImage: 'linear-gradient(to top, black 25%, transparent)'
        }}
      />

      <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 backdrop-blur-2xl border transition-colors duration-300 ${theme === 'light' ? 'bg-white/80 border-white/60 shadow-xl shadow-slate-200/50' : 'bg-[#111111]/80 border-white/10 shadow-2xl shadow-black/80'} rounded-full p-2 flex gap-3 items-center z-40`}>
        {activeTab === 'color' && (
        <>
        <div className="flex gap-2 items-center">
          <button
            onClick={addScale}
            className={`p-2 w-10 h-10 rounded-full transition-all flex items-center justify-center ${theme === 'light' ? 'text-slate-500 hover:bg-black hover:text-white' : 'text-slate-400 hover:bg-white hover:text-black'}`}
            title="Add Scale"
          >
            <Plus className="w-5 h-5" />
          </button>
          <div className={`w-[1px] h-6 mx-1 ${theme === 'light' ? 'bg-slate-200' : 'bg-white/10'}`}></div>
          
          {/* Import Dropdown Button */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsImportDropdownOpen(prev => !prev);
                setIsExportDropdownOpen(false);
              }}
              className={`font-bold w-[104px] text-sm py-2 rounded-full transition-all flex items-center justify-center gap-1.5 ${
                isImportDropdownOpen
                  ? (theme === 'light' ? 'bg-black text-white' : 'bg-white text-black')
                  : (theme === 'light' ? 'bg-black/5 hover:bg-black text-black hover:text-white' : 'bg-white/5 hover:bg-white/10 text-white')
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-90">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
              <span>Import</span>
            </button>
            
            {/* Import Dropdown Menu */}
            {isImportDropdownOpen && (
              <div className={`absolute bottom-full mb-3 left-1/2 -translate-x-1/2 backdrop-blur-2xl border p-1.5 shadow-2xl rounded-2xl flex flex-col gap-1 w-[160px] z-50 ${theme === 'light' ? 'bg-white/95 border-slate-200 shadow-slate-200/50 text-slate-800' : 'bg-[#181818]/95 border-white/10 shadow-black/80 text-white'}`}>
                <button
                  onClick={() => {
                    setIsImportDropdownOpen(false);
                    parent.postMessage({ pluginMessage: { type: 'IMPORT_FROM_DESIGN' } }, '*');
                  }}
                  className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl text-left transition-colors ${theme === 'light' ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-80">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="9" cy="9" r="2"/>
                    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                  </svg>
                  <span>From Design</span>
                </button>
                <button
                  onClick={() => {
                    setIsImportDropdownOpen(false);
                    parent.postMessage({ pluginMessage: { type: 'GET_VARIABLES_FOR_IMPORT' } }, '*');
                  }}
                  className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl text-left transition-colors ${theme === 'light' ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-80">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                    <line x1="12" y1="22.08" x2="12" y2="12"/>
                  </svg>
                  <span>From Variable</span>
                </button>
                <button
                  onClick={() => {
                    setIsImportDropdownOpen(false);
                    parent.postMessage({ pluginMessage: { type: 'GET_STYLES_FOR_IMPORT' } }, '*');
                  }}
                  className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl text-left transition-colors ${theme === 'light' ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-80">
                    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
                    <path d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
                  </svg>
                  <span>From Style</span>
                </button>
              </div>
            )}
          </div>

          {/* Export Dropdown Button */}
          <div className="relative">
            <button
              onClick={(e) => {
                e.stopPropagation();
                setIsExportDropdownOpen(prev => !prev);
                setIsImportDropdownOpen(false);
              }}
              className={`font-bold w-[104px] text-sm py-2 rounded-full transition-all flex items-center justify-center gap-1.5 ${
                isExportDropdownOpen
                  ? (theme === 'light' ? 'bg-black text-white' : 'bg-white text-black')
                  : (theme === 'light' ? 'bg-black/5 hover:bg-black text-black hover:text-white' : 'bg-white/5 hover:bg-white/10 text-white')
              }`}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="opacity-90">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              <span>Export</span>
            </button>
            
            {/* Export Dropdown Menu */}
            {isExportDropdownOpen && (
              <div className={`absolute bottom-full mb-3 left-1/2 -translate-x-1/2 backdrop-blur-2xl border p-1.5 shadow-2xl rounded-2xl flex flex-col gap-1 w-[160px] z-50 ${theme === 'light' ? 'bg-white/95 border-slate-200 shadow-slate-200/50 text-slate-800' : 'bg-[#181818]/95 border-white/10 shadow-black/80 text-white'}`}>
                <button
                  onClick={() => {
                    setIsExportDropdownOpen(false);
                    generateFigmaNodes();
                  }}
                  className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl text-left transition-colors ${theme === 'light' ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-80">
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/>
                    <circle cx="9" cy="9" r="2"/>
                    <path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/>
                  </svg>
                  <span>To Design</span>
                </button>
                <button
                  onClick={() => {
                    setIsExportDropdownOpen(false);
                    handleExportClick();
                  }}
                  className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl text-left transition-colors ${theme === 'light' ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-80">
                    <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                    <polyline points="3.27 6.96 12 12.01 20.73 6.96"/>
                    <line x1="12" y1="22.08" x2="12" y2="12"/>
                  </svg>
                  <span>To Variable</span>
                </button>
                <button
                  onClick={() => {
                    setIsExportDropdownOpen(false);
                    handleExportStylesClick();
                  }}
                  className={`flex items-center gap-2 px-3 py-2 text-xs font-semibold rounded-xl text-left transition-colors ${theme === 'light' ? 'hover:bg-slate-100' : 'hover:bg-white/10'}`}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-80">
                    <path d="M12 22c5.523 0 10-4.477 10-10S17.523 2 12 2 2 6.477 2 12s4.477 10 10 10z"/>
                    <path d="M12 16a4 4 0 1 0 0-8 4 4 0 0 0 0 8z"/>
                  </svg>
                  <span>To Style</span>
                </button>
              </div>
            )}
          </div>
        </div>
        <div className={`w-[1px] h-6 ${theme === 'light' ? 'bg-slate-200' : 'bg-white/10'}`}></div>
        </>
        )}
        <button 
          onClick={toggleTheme}
          className={`w-10 h-10 flex items-center justify-center rounded-full transition-all ${theme === 'light' ? 'text-slate-500 hover:bg-black hover:text-white' : 'text-slate-400 hover:bg-white hover:text-black'}`}
          title={theme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
        >
          {theme === 'light' ? (
            <Moon size={18} strokeWidth={2.5} />
          ) : (
            <Sun size={18} strokeWidth={2.5} />
          )}
        </button>
      </div>
    </div>
  );
}
