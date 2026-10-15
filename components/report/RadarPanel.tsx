"use client";

import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";

export interface RadarDatum {
  dimension: string;
  score: number;
  bar: number;
}

/** Five-axis competency radar. The dashed ring marks the hiring bar (5 = meets the bar). */
export function RadarPanel({ data }: { data: RadarDatum[] }) {
  return (
    <div className="h-[340px] w-full" role="img" aria-label={`Radar chart: ${data.map((d) => `${d.dimension} ${d.score}/10`).join(", ")}`}>
      <ResponsiveContainer>
        <RadarChart data={data} outerRadius="74%">
          <PolarGrid stroke="#232836" />
          <PolarAngleAxis dataKey="dimension" tick={{ fill: "#a3aabb", fontSize: 11, fontFamily: "JetBrains Mono" }} />
          <PolarRadiusAxis domain={[0, 10]} tickCount={6} tick={{ fill: "#5f6780", fontSize: 9 }} axisLine={false} angle={90} />
          <Radar name="Hiring bar" dataKey="bar" stroke="#7a8297" strokeDasharray="4 4" strokeWidth={1.5} fill="none" isAnimationActive={false} />
          <Radar
            name="Your score"
            dataKey="score"
            stroke="#c6f432"
            strokeWidth={2}
            fill="#c6f432"
            fillOpacity={0.18}
            dot={{ r: 4, fill: "#c6f432", stroke: "#0c0e14", strokeWidth: 2 }}
            activeDot={{ r: 6 }}
          />
          <Tooltip
            cursor={false}
            contentStyle={{ background: "#11141c", border: "1px solid #343b4d", borderRadius: 8, fontSize: 12, color: "#eceef3" }}
            itemStyle={{ color: "#eceef3" }}
            formatter={(v: number, name: string) => [`${v.toFixed(1)} / 10`, name]}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
