import React from 'react';

// Inline icons (Figma uses lucide). Kept local to avoid depending on the pinned
// lucide-react build's limited export set.

type P = { className?: string; size?: number; strokeWidth?: number };

const base = (size = 16, sw = 2): React.SVGProps<SVGSVGElement> => ({
  width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
  stroke: 'currentColor', strokeWidth: sw, strokeLinecap: 'round', strokeLinejoin: 'round',
});

export const ChevronDown = ({ className, size = 16, strokeWidth = 2 }: P) => (
  <svg {...base(size, strokeWidth)} className={className}><path d="m6 9 6 6 6-6" /></svg>
);
export const Plus = ({ className, size = 16, strokeWidth = 2 }: P) => (
  <svg {...base(size, strokeWidth)} className={className}><path d="M12 5v14M5 12h14" /></svg>
);
export const Minus = ({ className, size = 16, strokeWidth = 2 }: P) => (
  <svg {...base(size, strokeWidth)} className={className}><path d="M5 12h14" /></svg>
);
export const X = ({ className, size = 16, strokeWidth = 2 }: P) => (
  <svg {...base(size, strokeWidth)} className={className}><path d="M18 6 6 18M6 6l12 12" /></svg>
);
export const Monitor = ({ className, size = 16, strokeWidth = 2 }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <rect x="2" y="3" width="20" height="14" rx="2" /><path d="M8 21h8M12 17v4" />
  </svg>
);
export const Tablet = ({ className, size = 16, strokeWidth = 2 }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <rect x="4" y="2" width="16" height="20" rx="2" /><path d="M12 18h.01" />
  </svg>
);
export const Smartphone = ({ className, size = 16, strokeWidth = 2 }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <rect x="5" y="2" width="14" height="20" rx="2" /><path d="M12 18h.01" />
  </svg>
);
export const Moon = ({ className, size = 16, strokeWidth = 2 }: P) => (
  <svg {...base(size, strokeWidth)} className={className}><path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" /></svg>
);
export const Sun = ({ className, size = 16, strokeWidth = 2 }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
  </svg>
);
export const Rows = ({ className, size = 16, strokeWidth = 2 }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <rect x="3" y="3" width="18" height="7" rx="1" /><rect x="3" y="14" width="18" height="7" rx="1" />
  </svg>
);
export const EyeOff = ({ className, size = 16, strokeWidth = 2 }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 10 8 10 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
    <path d="M6.61 6.61A18.5 18.5 0 0 0 2 12s3 8 10 8a9.12 9.12 0 0 0 5.39-1.61M2 2l20 20" />
  </svg>
);
export const Trash = ({ className, size = 16, strokeWidth = 2 }: P) => (
  <svg {...base(size, strokeWidth)} className={className}>
    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);
