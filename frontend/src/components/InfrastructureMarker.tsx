import L from "leaflet";
import type { InfrastructureElement } from "../types";
import { INFRA_CONFIG, svgIcon } from "../utils/infraConfig";

export function createInfraIcon(el: InfrastructureElement): L.DivIcon {
  const cfg = INFRA_CONFIG[el.category];
  const size = 28;

  return L.divIcon({
    className: "",
    iconSize:   [size, size],
    iconAnchor: [size / 2, size / 2],
    html: `
      <div style="
        width:${size}px;height:${size}px;
        background:${cfg.color}22;
        border:1.5px solid ${cfg.color}99;
        border-radius:5px;
        display:flex;align-items:center;justify-content:center;
        cursor:pointer;
        box-shadow:0 1px 4px #0008;
        color:${cfg.color};
        padding:3px;
        box-sizing:border-box;
      ">${svgIcon(cfg.icon)}</div>
    `,
  });
}

export function createInfraPopup(el: InfrastructureElement): string {
  const cfg = INFRA_CONFIG[el.category];
  const rows = Object.entries(el.tags)
    .filter(([k]) => !["source", "created_by", "note"].includes(k))
    .slice(0, 8)
    .map(([k, v]) => `
      <tr>
        <td style="color:#64748b;padding:2px 6px 2px 0;font-size:11px;white-space:nowrap">${k}</td>
        <td style="font-size:11px;word-break:break-word">${v}</td>
      </tr>`)
    .join("");

  return `
    <div style="color:#0f172a;min-width:180px;max-width:260px;font-family:system-ui,sans-serif">
      <div style="
        background:${cfg.color}18;
        border-left:3px solid ${cfg.color};
        padding:6px 10px;margin-bottom:8px;
        border-radius:0 4px 4px 0;
        display:flex;align-items:center;gap:8px;
      ">
        <span style="width:16px;height:16px;flex-shrink:0;color:${cfg.color}">
          ${svgIcon(cfg.icon)}
        </span>
        <div>
          <div style="font-weight:700;font-size:13px">${el.label}</div>
          <div style="font-size:11px;color:#475569;margin-top:1px">${cfg.label}</div>
        </div>
      </div>
      ${rows ? `<table style="border-collapse:collapse;width:100%">${rows}</table>` : ""}
      <div style="font-size:10px;color:#94a3b8;margin-top:6px">
        OSM #${el.id} · ${el.lat?.toFixed(5)}, ${el.lon?.toFixed(5)}
      </div>
    </div>
  `;
}
