import type { SVGProps } from "react";

function Svg(props: SVGProps<SVGSVGElement>) {
  return <svg viewBox="0 0 24 24" aria-hidden="true" {...props} />;
}

export function IconRecord() {
  return (
    <Svg>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="12" cy="12" r="1.7" fill="currentColor" />
    </Svg>
  );
}

export function IconSearch() {
  return (
    <Svg>
      <circle cx="11" cy="11" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M15.5 15.5 20 20" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </Svg>
  );
}

export function IconQueue() {
  return (
    <Svg>
      <path d="M5 7h14M5 12h14M5 17h9" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </Svg>
  );
}

export function IconKey() {
  return (
    <Svg>
      <circle cx="9" cy="12" r="3.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M12 12h8l-2 2M17 12l2 2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconInfo() {
  return (
    <Svg>
      <circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 11v5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="12" cy="8" r="0.8" fill="currentColor" />
    </Svg>
  );
}

export function IconLink() {
  return (
    <Svg>
      <path d="M10 13a4 4 0 0 0 6 0l2-2a4 4 0 0 0-6-6l-1 1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M14 11a4 4 0 0 0-6 0l-2 2a4 4 0 0 0 6 6l1-1" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
    </Svg>
  );
}

export function IconList() {
  return (
    <Svg>
      <path d="M8 7h11M8 12h11M8 17h11" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <circle cx="5" cy="7" r="1" fill="currentColor" />
      <circle cx="5" cy="12" r="1" fill="currentColor" />
      <circle cx="5" cy="17" r="1" fill="currentColor" />
    </Svg>
  );
}

export function IconWave() {
  return (
    <Svg>
      <path d="M3 12h2l2-5 3 10 3-7 2 4h6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    </Svg>
  );
}

export function IconPaste() {
  return (
    <Svg>
      <rect x="7" y="5" width="11" height="15" rx="2" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9 5.5h6V4a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v1.5Z" fill="none" stroke="currentColor" strokeWidth="1.6" />
    </Svg>
  );
}
