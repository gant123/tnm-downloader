import type { ProxyStatus } from "../types";

export interface NavItem {
  key: string;
  label: string;
  dot: string;
  count: number;
  active: boolean;
}
export interface TagItem {
  label: string;
  color: string;
  count: number;
  active: boolean;
}

interface Props {
  nav: NavItem[];
  tags: TagItem[];
  status: ProxyStatus | null;
  onNav: (key: string) => void;
  onTag: (label: string) => void;
}

export default function RiptideSidebar({ nav, tags, status, onNav, onTag }: Props) {
  const direct = !status?.proxy_enabled;
  const ok = status?.ok ?? true;
  const dotColor = direct ? "#6b7178" : ok ? "#4fd18a" : "#f5b74f";
  const title = direct ? "Direct connection" : ok ? "Proxy active" : "Proxy unreachable";

  return (
    <div className="rt-side">
      <div className="rt-side-head">LIBRARY</div>
      {nav.map((n) => (
        <div
          key={n.key}
          className={`rt-nav ${n.active ? "active" : ""}`}
          onClick={() => onNav(n.key)}
        >
          <span className="rt-nav-dot square" style={{ background: n.dot }} />
          <span className="rt-nav-label">{n.label}</span>
          <span className="rt-nav-count">{n.count}</span>
        </div>
      ))}

      {tags.length > 0 && <div className="rt-side-head">TAGS</div>}
      {tags.map((g) => (
        <div
          key={g.label}
          className={`rt-nav small ${g.active ? "active" : ""}`}
          onClick={() => onTag(g.label)}
        >
          <span className="rt-nav-dot" style={{ background: g.color }} />
          <span className="rt-nav-label">{g.label}</span>
          <span className="rt-nav-count">{g.count}</span>
        </div>
      ))}

      <div className="rt-side-spacer" />

      <div className="rt-conn">
        <div className="rt-conn-top">
          <span
            className={`rt-conn-dot ${direct ? "" : "pulse"}`}
            style={{ background: dotColor, boxShadow: direct ? "none" : `0 0 8px ${dotColor}` }}
          />
          <span className="rt-conn-title">{title}</span>
        </div>
        <div className="rt-conn-row">
          <span>{direct ? "Route" : "Proxy"}</span>
          <span className="rt-conn-val">{direct ? "Direct internet" : status?.detail}</span>
        </div>
        {!direct && (
          <div className="rt-conn-row">
            <span>Kill switch</span>
            <span style={{ color: ok ? "#4fd18a" : "#f5b74f" }}>
              {ok ? "Ready" : "Blocking"}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
