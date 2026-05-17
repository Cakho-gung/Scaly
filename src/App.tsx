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
  const totalNodes = stepCount + 2;
  const initialNodes = Array.from({ length: totalNodes }).map((_, i) => {
    const label = getLabel(i, stepCount);
    const labelStr = String(label);
    
    // Check if we have a persistent anchor for this label
    const hexFromAnchor = existingAnchors ? existingAnchors[labelStr] : null;
    
    return {
      id: `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}-${i}`,
      index: i,
      label,
      hex: hexFromAnchor || (i === 0 ? '#ffffff' : i === totalNodes - 1 ? '#000000' : null),
      isAnchor: !!hexFromAnchor || i === 0 || i === totalNodes - 1,
      locked: i === 0 || i === totalNodes - 1,
    };
  });
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
const SortableColorNode = ({ node, stepCount, theme, onToggleAnchor, onShowToast }: { node: ColorNode, stepCount: number, theme: 'light' | 'dark', onToggleAnchor: () => void, onShowToast: (msg: string) => void }) => {
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

  const labelValue = getLabel(node.index, stepCount);
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
      
      // Update master map with current anchors
      const currentAnchors = { ...s.fullAnchorMap };
      s.nodes.forEach(node => {
        if (node.isAnchor && node.hex) {
          currentAnchors[String(node.label)] = node.hex;
        }
      });

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
      
      const targetNode = s.nodes.find(n => n.id === anchorId);
      const newFullAnchorMap = { ...s.fullAnchorMap };
      if (targetNode) {
        delete newFullAnchorMap[String(targetNode.label)];
      }

      const newNodes = s.nodes.map(n => n.id === anchorId ? { ...n, isAnchor: false } : n);
      return { ...s, nodes: interpolateColors(newNodes), fullAnchorMap: newFullAnchorMap };
    }));
  };

  const updateAnchorColor = (scaleId: string, anchorId: string, hex: string) => {
    setScales(prev => prev.map(s => {
      if (s.id !== scaleId) return s;
      
      const targetNode = s.nodes.find(n => n.id === anchorId);
      const newFullAnchorMap = { ...s.fullAnchorMap };
      if (targetNode) {
        newFullAnchorMap[String(targetNode.label)] = hex;
      }

      const newNodes = s.nodes.map(n => n.id === anchorId ? { ...n, hex } : n);
      return { ...s, nodes: interpolateColors(newNodes), fullAnchorMap: newFullAnchorMap };
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
      
      const maxIndex = currentScale.stepCount + 1;
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
        const newFullAnchorMap = { ...s.fullAnchorMap };
        newFullAnchorMap[String(targetNode.label)] = chroma(validHex).hex();

        newNodes[targetIndex] = {
          ...targetNode,
          hex: chroma(validHex).hex(),
          isAnchor: true,
        };

        return { ...s, nodes: interpolateColors(newNodes), fullAnchorMap: newFullAnchorMap };
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
      
      const targetNode = s.nodes.find(n => n.id === nodeId);
      if (!targetNode) return s;

      const newIsAnchor = !targetNode.isAnchor;
      const newFullAnchorMap = { ...s.fullAnchorMap };
      if (newIsAnchor) {
        newFullAnchorMap[String(targetNode.label)] = targetNode.hex || '#ffffff';
      } else {
        delete newFullAnchorMap[String(targetNode.label)];
      }

      const newNodes = s.nodes.map(n => 
        n.id === nodeId ? { ...n, isAnchor: newIsAnchor } : n
      );
      return { ...s, nodes: interpolateColors(newNodes), fullAnchorMap: newFullAnchorMap };
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
          const newFullAnchorMap = { ...s.fullAnchorMap };

          newNodes = newNodes.map((n, i) => {
            const newLabel = getLabel(i, s.stepCount);
            if (n.id === draggedId) {
              newFullAnchorMap[String(newLabel)] = n.hex || '#ffffff';
              return { ...n, index: i, label: newLabel, isAnchor: true };
            }
            return { ...n, index: i, label: newLabel };
          });

          return { ...s, nodes: interpolateColors(newNodes), fullAnchorMap: newFullAnchorMap };
        }
        return s;
      }));
    }
  };

  const handleCancel = () => {
    parent.postMessage({ pluginMessage: { type: 'CANCEL' } }, '*');
  };

  const generateFigmaNodes = () => {
    const allScaleNodes = scales.flatMap(scale => 
      scale.nodes.filter(n => n.index !== 0 && n.index !== scale.stepCount + 1).map(n => ({
        index: n.index,
        label: getLabel(n.index, scale.stepCount),
        name: `${scale.name}-${getLabel(n.index, scale.stepCount)}`,
        rgb: chroma(n.hex || '#ffffff').rgb(true).map(v => v / 255)
      }))
    );

    const allRawNodes = scales.flatMap(scale => 
      scale.nodes.filter(n => n.index !== 0 && n.index !== scale.stepCount + 1).map(n => ({
        ...n,
        scaleName: scale.name,
        label: getLabel(n.index, scale.stepCount),
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
      scale.nodes.filter(n => n.index !== 0 && n.index !== scale.stepCount + 1).map(n => ({
        ...n,
        scaleName: scale.name,
        label: getLabel(n.index, scale.stepCount),
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
      scale.nodes.filter(n => n.index !== 0 && n.index !== scale.stepCount + 1).map(n => ({
        ...n,
        scaleName: scale.name,
        label: getLabel(n.index, scale.stepCount),
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
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportCollectionName, setExportCollectionName] = useState('Scaly Colors');
  const [exportGroupName, setExportGroupName] = useState('');
  const [existingCollections, setExistingCollections] = useState<{id: string, name: string, groups: string[]}[]>([]);
  const [isStyleModalOpen, setIsStyleModalOpen] = useState(false);
  const [exportStyleGroupName, setExportStyleGroupName] = useState('');
  const [existingStyles, setExistingStyles] = useState<string[]>([]);
  const [toast, setToast] = useState<string | null>(null);
  const toastTimeoutRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const msg = event.data.pluginMessage;
      if (!msg) return;

      if (msg.type === 'COLLECTIONS_DATA') {
        setExistingCollections(msg.collections);
      } else if (msg.type === 'STYLES_DATA') {
        setExistingStyles(msg.groups);
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const showToast = (message: string) => {
    setToast(message);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    toastTimeoutRef.current = setTimeout(() => setToast(null), 5000);
  };

  const closeToast = () => {
    setToast(null);
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
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
          <div className={`flex flex-col pl-2 ${theme === 'light' ? 'text-black/90' : 'text-white/90'}`}>
            <h1 className="text-md font-semibold">Color Scale Generator</h1>
            <p className={`text-md ${theme === 'light' ? 'text-black/40' : 'text-white/40'} text-xs font-semibold`}>Build by Cakhogung</p>
            </div>
        </div>
        <button
          onClick={handleCancel}
          className={`text-sm font-semibold px-4 py-1.5 rounded-full transition-all ${theme === 'light' ? 'text-slate-500 hover:bg-slate-200/50 hover:text-slate-900' : 'text-slate-400 hover:bg-white/10 hover:text-white'}`}
        >
          Cancel
        </button>
      </div>
      {/* Toast Notification */}
      {toast && (
        <ToastNotification 
          message={toast} 
          theme={theme} 
          onClose={closeToast} 
        />
        )}

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
            {scale.nodes.filter(n => n.isAnchor && n.index !== 0 && n.index !== scale.stepCount + 1).map(anchor => (
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
            {scale.nodes.filter(n => n.isAnchor && n.index !== 0 && n.index !== scale.stepCount + 1).length < scale.stepCount && (
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
                  items={scale.nodes.filter(n => n.index !== 0 && n.index !== scale.stepCount + 1).map(n => n.id)}
                  strategy={horizontalListSortingStrategy}
                >
                  {scale.nodes.filter(n => n.index !== 0 && n.index !== scale.stepCount + 1).map(node => (
                    <SortableColorNode 
                      key={node.id} 
                      node={node} 
                      stepCount={scale.stepCount} 
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
                  background: `linear-gradient(to right, ${scale.nodes.filter(n => n.index !== 0 && n.index !== scale.stepCount + 1).map(n => n.hex).join(', ')})`
                }}
              />
            </div>
          </div>
        </div>
      ))}

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
        <div className="flex gap-2 items-center">
          <button
            onClick={addScale}
            className={`p-2 w-10 h-10 rounded-full transition-all flex items-center justify-center ${theme === 'light' ? 'text-slate-500 hover:bg-black hover:text-white' : 'text-slate-400 hover:bg-white hover:text-black'}`}
            title="Add Scale"
          >
            <Plus className="w-5 h-5" />
          </button>
          <div className={`w-[1px] h-6 mx-1 ${theme === 'light' ? 'bg-slate-200' : 'bg-white/10'}`}></div>
          <button
            onClick={generateFigmaNodes}
            className={`font-bold w-[96px] text-sm py-2 rounded-full transition-all ${theme === 'light' ? 'bg-black/5 hover:bg-black text-black hover:text-white' : 'bg-white/5 hover:bg-white/10 text-white'}`}
          >
            + Draw
          </button>
          <button
            onClick={handleExportStylesClick}
            className={`font-bold w-[96px] text-sm py-2 rounded-full transition-all ${theme === 'light' ? 'bg-black/5 hover:bg-black text-black hover:text-white' : 'bg-white/5 hover:bg-white/10 text-white'}`}
          >
            + Styles
          </button>
          <button
            onClick={handleExportClick}
            className={`font-bold w-[96px] text-sm py-2 rounded-full transition-all ${theme === 'light' ? 'bg-black/5 hover:bg-black text-black hover:text-white' : 'bg-white/5 hover:bg-white/10 text-white'}`}
          >
            + Variables
          </button>


        </div>
        <div className={`w-[1px] h-6 ${theme === 'light' ? 'bg-slate-200' : 'bg-white/10'}`}></div>
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
