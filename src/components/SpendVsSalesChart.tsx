"use client";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Legend,
} from "recharts";

export interface DailyPoint {
  day: string;
  spend: number;
  sales: number;
}

export function SpendVsSalesChart({ data }: { data: DailyPoint[] }) {
  return (
    <div className="h-72 w-full">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 16, left: -8, bottom: 0 }}>
          <CartesianGrid stroke="#e4e7ec" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="day"
            stroke="#6b7280"
            fontSize={12}
            tickLine={false}
            axisLine={{ stroke: "#e4e7ec" }}
          />
          <YAxis
            stroke="#6b7280"
            fontSize={12}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `$${v}`}
          />
          <Tooltip
            contentStyle={{
              background: "#ffffff",
              border: "1px solid #e4e7ec",
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(v: number) => `$${v.toFixed(2)}`}
          />
          <Legend wrapperStyle={{ fontSize: 12, paddingTop: 8 }} iconType="circle" />
          <Line
            type="monotone"
            dataKey="spend"
            name="Ad spend"
            stroke="#374151"
            strokeWidth={2}
            dot={false}
          />
          <Line
            type="monotone"
            dataKey="sales"
            name="Attributed sales"
            stroke="#2563eb"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
