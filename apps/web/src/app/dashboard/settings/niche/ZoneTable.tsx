'use client';

interface Zone {
  name: string;
  description: string;
  min?: number;
  max?: number;
}

interface ZoneConfig {
  label: string;
  unit: string;
  zones: Zone[];
}

interface ZoneTableProps {
  zoneConfig: ZoneConfig;
  nicheColor: string;
}

export default function ZoneTable({ zoneConfig, nicheColor }: ZoneTableProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">
          {zoneConfig.label}
        </h3>
        <span
          className="text-xs font-medium px-2 py-1 rounded-lg"
          style={{ background: `${nicheColor}15`, color: nicheColor }}
        >
          {zoneConfig.unit}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-100">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-gray-50 border-b border-gray-100">
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider w-1/3">
                Zona
              </th>
              <th className="px-4 py-2.5 text-left text-xs font-semibold text-gray-500 uppercase tracking-wider">
                Descrição
              </th>
              <th className="px-4 py-2.5 text-right text-xs font-semibold text-gray-500 uppercase tracking-wider w-1/4">
                Intervalo
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {zoneConfig.zones.map((zone, idx) => (
              <tr key={idx} className="hover:bg-gray-50/60 transition-colors">
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ background: nicheColor, opacity: 0.4 + idx * 0.1 }}
                    />
                    <span className="font-semibold text-gray-800">{zone.name}</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-gray-500 text-xs">{zone.description}</td>
                <td className="px-4 py-3 text-right font-mono text-xs text-gray-600">
                  {zone.min !== undefined && zone.max !== undefined
                    ? `${zone.min} – ${zone.max}`
                    : zone.min !== undefined
                    ? `≥ ${zone.min}`
                    : zone.max !== undefined
                    ? `≤ ${zone.max}`
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
