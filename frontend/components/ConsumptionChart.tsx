"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from "recharts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface LoadProfile {
  weekday_kw: number[];
  weekend_kw: number[];
  labels: string[];
  peak_hours: [number, number];
}

interface Props {
  profile: LoadProfile;
  /** Total annual kWh — shown in tooltip title */
  annualKwh: number;
}

// ---------------------------------------------------------------------------
// Custom tooltip
// ---------------------------------------------------------------------------

function CustomTooltip({
  active,
  payload,
  label,
}: {
  active?: boolean;
  payload?: Array<{ name: string; value: number; color: string }>;
  label?: string;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-[#1e293b] border border-slate-700 rounded-lg px-3 py-2 text-xs shadow-lg">
      <p className="text-slate-400 mb-1 font-mono">{label}</p>
      {payload.map((p) => (
        <p key={p.name} style={{ color: p.color }} className="font-semibold">
          {p.name} : {p.value.toFixed(1)} kW
        </p>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export default function ConsumptionChart({ profile, annualKwh }: Props) {
  const { weekday_kw, weekend_kw, labels, peak_hours } = profile;

  // Build recharts data array
  const data = labels.map((label, i) => ({
    time: label,
    "Jour ouvré": weekday_kw[i],
    Weekend: weekend_kw[i],
  }));

  // Peak window reference lines (hour → slot label)
  const peakStartLabel = `${String(peak_hours[0]).padStart(2, "0")}:00`;
  const peakEndLabel   = `${String(peak_hours[1]).padStart(2, "0")}:00`;

  // X-axis: show every 4 hours (every 8th slot)
  const xTicks = labels.filter((_, i) => i % 8 === 0);

  const maxKw = Math.max(...weekday_kw, ...weekend_kw);

  return (
    <div className="w-full">
      {/* Legend caption */}
      <div className="flex items-center gap-6 mb-4 text-xs text-slate-400">
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-[#bef264] inline-block rounded" />
          Jour ouvré (lun–ven)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="w-3 h-0.5 bg-slate-500 inline-block rounded" />
          Weekend
        </span>
        <span className="flex items-center gap-1.5 ml-auto text-[10px]">
          Consommation annuelle estimée :{" "}
          <span className="text-white font-semibold ml-1">
            {(annualKwh / 1000).toFixed(0)} MWh/an
          </span>
        </span>
      </div>

      <ResponsiveContainer width="100%" height={220}>
        <AreaChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
          <defs>
            {/* Lime gradient for weekday */}
            <linearGradient id="gradWeekday" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#bef264" stopOpacity={0.25} />
              <stop offset="95%" stopColor="#bef264" stopOpacity={0.02} />
            </linearGradient>
            {/* Slate gradient for weekend */}
            <linearGradient id="gradWeekend" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%"  stopColor="#64748b" stopOpacity={0.20} />
              <stop offset="95%" stopColor="#64748b" stopOpacity={0.02} />
            </linearGradient>
          </defs>

          <CartesianGrid
            strokeDasharray="3 3"
            stroke="#1e293b"
            vertical={false}
          />

          <XAxis
            dataKey="time"
            ticks={xTicks}
            tick={{ fill: "#64748b", fontSize: 11, fontFamily: "monospace" }}
            axisLine={{ stroke: "#334155" }}
            tickLine={false}
          />
          <YAxis
            domain={[0, Math.ceil(maxKw * 1.15)]}
            tick={{ fill: "#64748b", fontSize: 11 }}
            axisLine={false}
            tickLine={false}
            tickFormatter={(v: number) => `${v} kW`}
            width={52}
          />

          <Tooltip content={<CustomTooltip />} />

          {/* Peak window markers */}
          <ReferenceLine
            x={peakStartLabel}
            stroke="#bef264"
            strokeDasharray="4 3"
            strokeOpacity={0.35}
            label={{
              value: "↑ début activité",
              position: "insideTopRight",
              fill: "#bef264",
              fontSize: 9,
              opacity: 0.6,
            }}
          />
          <ReferenceLine
            x={peakEndLabel}
            stroke="#bef264"
            strokeDasharray="4 3"
            strokeOpacity={0.35}
            label={{
              value: "fin activité ↑",
              position: "insideTopLeft",
              fill: "#bef264",
              fontSize: 9,
              opacity: 0.6,
            }}
          />

          {/* Weekend area (behind) */}
          <Area
            type="monotone"
            dataKey="Weekend"
            stroke="#64748b"
            strokeWidth={1.5}
            fill="url(#gradWeekend)"
            dot={false}
            activeDot={{ r: 3, fill: "#64748b" }}
            legendType="none"
          />

          {/* Weekday area (front) */}
          <Area
            type="monotone"
            dataKey="Jour ouvré"
            stroke="#bef264"
            strokeWidth={2}
            fill="url(#gradWeekday)"
            dot={false}
            activeDot={{ r: 4, fill: "#bef264" }}
            legendType="none"
          />
        </AreaChart>
      </ResponsiveContainer>

      {/* Night talon annotation */}
      <p className="text-[10px] text-slate-500 text-center mt-1">
        Zone hors plage d&apos;activité [{String(peak_hours[0]).padStart(2, "0")}h–
        {String(peak_hours[1]).padStart(2, "0")}h] = talon de nuit estimé
      </p>
    </div>
  );
}
