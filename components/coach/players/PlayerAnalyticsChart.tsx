import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';

interface AnalyticsSeries {
  dataKey: string;
  name: string;
  color: string;
  type?: 'line' | 'bar';
  yAxisId?: 'left' | 'right';
}

interface PlayerAnalyticsChartProps {
  graphNumber: number;
  title: string;
  data: Array<Record<string, string | number>>;
  series: AnalyticsSeries[];
  leftDomain?: [number, number];
  rightDomain?: [number, number];
  footerNote?: string;
  interactiveLegend?: boolean;
}

interface TooltipPortalPayloadItem {
  name?: string | number;
  value?: string | number | ReadonlyArray<string | number>;
  color?: string;
}

interface TooltipPortalProps {
  active?: boolean;
  coordinate?: { x?: number; y?: number };
  label?: string | number;
  payload?: ReadonlyArray<TooltipPortalPayloadItem>;
  chartContainer: HTMLDivElement | null;
}

function ChartTooltipPortal({ active, coordinate, label, payload, chartContainer }: TooltipPortalProps) {
  if (!active || !coordinate || !payload?.length || !chartContainer || typeof document === 'undefined') {
    return null;
  }

  const chartBounds = chartContainer.getBoundingClientRect();
  const left = chartBounds.left + (coordinate.x ?? 0) + 12;
  const top = chartBounds.top + (coordinate.y ?? 0) + 12;

  return createPortal(
    <div
      className="pointer-events-none fixed max-w-[240px] rounded-[10px] border border-[rgba(255,255,255,0.14)] bg-[rgba(var(--surface-shell-rgb),0.98)] p-3 text-xs shadow-[0_18px_36px_rgba(0,0,0,0.42)]"
      style={{ left, top, zIndex: 2147483647 }}
    >
      <p className="mb-2 text-sm font-semibold text-white">{label}</p>
      <div className="space-y-2">
        {payload.map((item) => (
          <p key={`${item.name}-${item.value}`} className="font-semibold" style={{ color: item.color }}>
            {item.name} : {item.value}
          </p>
        ))}
      </div>
    </div>,
    document.body
  );
}

export function PlayerAnalyticsChart({
  graphNumber,
  title,
  data,
  series,
  leftDomain,
  rightDomain,
  footerNote,
  interactiveLegend = false,
}: PlayerAnalyticsChartProps) {
  const [hiddenSeries, setHiddenSeries] = useState<Set<string>>(new Set());
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const hasBars = series.some((item) => item.type === 'bar');
  const hasRightAxis = series.some((item) => item.yAxisId === 'right');
  const isSeriesHidden = (dataKey: string) => interactiveLegend && hiddenSeries.has(dataKey);
  const toggleSeries = (dataKey: string) => {
    if (!interactiveLegend) return;

    setHiddenSeries((current) => {
      const next = new Set(current);
      if (next.has(dataKey)) {
        next.delete(dataKey);
      } else {
        next.add(dataKey);
      }
      return next;
    });
  };
  const legendContent = interactiveLegend
    ? () => (
        <div className="flex flex-wrap justify-center gap-x-3 gap-y-1 pt-1 text-[10px]">
          {series.map((item) => {
            const isHidden = isSeriesHidden(item.dataKey);

            return (
              <button
                key={item.dataKey}
                type="button"
                aria-pressed={!isHidden}
                onClick={() => toggleSeries(item.dataKey)}
                className={`flex touch-manipulation items-center gap-1.5 rounded-full px-1.5 py-1 transition-opacity ${
                  isHidden ? 'opacity-50 grayscale' : 'opacity-100'
                }`}
              >
                <span
                  className="h-2 w-2 rounded-full"
                  style={{ backgroundColor: isHidden ? 'rgba(156,163,175,0.75)' : item.color }}
                />
                <span className={isHidden ? 'text-gray-500' : 'text-gray-300'}>{item.name}</span>
              </button>
            );
          })}
        </div>
      )
    : undefined;

  return (
    <article className="glass-card relative h-72 p-4 sm:p-5">
      <div className="mb-3 flex items-start justify-between gap-3">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-gray-300">{title}</h3>
        <span className="rounded-md border border-[rgba(255,255,255,0.15)] bg-[rgba(255,255,255,0.06)] px-2 py-0.5 text-xs font-bold text-white">
          {graphNumber}
        </span>
      </div>

      <div ref={chartContainerRef} className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          {hasBars ? (
            <ComposedChart data={data} margin={{ top: 4, right: hasRightAxis ? 8 : 0, left: -20, bottom: 2 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" stroke="gray" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis
                yAxisId="left"
                stroke="gray"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                domain={leftDomain}
              />
              {hasRightAxis ? (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="gray"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  domain={rightDomain}
                />
              ) : null}
              <Tooltip
                content={(props) => (
                  <ChartTooltipPortal
                    active={props.active}
                    coordinate={props.coordinate}
                    label={props.label}
                    payload={props.payload}
                    chartContainer={chartContainerRef.current}
                  />
                )}
              />
              <Legend wrapperStyle={{ fontSize: '10px' }} iconType="circle" content={legendContent} />
              {series.map((item) =>
                item.type === 'bar' ? (
                  <Bar
                    key={item.dataKey}
                    yAxisId={item.yAxisId ?? 'left'}
                    dataKey={item.dataKey}
                    name={item.name}
                    fill={item.color}
                    fillOpacity={0.62}
                    hide={isSeriesHidden(item.dataKey)}
                    radius={[4, 4, 0, 0]}
                    barSize={12}
                  />
                ) : (
                  <Line
                    key={item.dataKey}
                    yAxisId={item.yAxisId ?? 'left'}
                    type="monotone"
                    dataKey={item.dataKey}
                    name={item.name}
                    stroke={item.color}
                    strokeWidth={2.2}
                    dot={{ r: 2, strokeWidth: 0 }}
                    hide={isSeriesHidden(item.dataKey)}
                  />
                )
              )}
            </ComposedChart>
          ) : (
            <LineChart data={data} margin={{ top: 4, right: hasRightAxis ? 8 : 0, left: -20, bottom: 2 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.06)" vertical={false} />
              <XAxis dataKey="label" stroke="gray" fontSize={10} tickLine={false} axisLine={false} />
              <YAxis
                yAxisId="left"
                stroke="gray"
                fontSize={10}
                tickLine={false}
                axisLine={false}
                domain={leftDomain}
              />
              {hasRightAxis ? (
                <YAxis
                  yAxisId="right"
                  orientation="right"
                  stroke="gray"
                  fontSize={10}
                  tickLine={false}
                  axisLine={false}
                  domain={rightDomain}
                />
              ) : null}
              <Tooltip
                content={(props) => (
                  <ChartTooltipPortal
                    active={props.active}
                    coordinate={props.coordinate}
                    label={props.label}
                    payload={props.payload}
                    chartContainer={chartContainerRef.current}
                  />
                )}
              />
              <Legend wrapperStyle={{ fontSize: '10px' }} iconType="circle" content={legendContent} />
              {series.map((item) => (
                <Line
                  key={item.dataKey}
                  yAxisId={item.yAxisId ?? 'left'}
                  type="monotone"
                  dataKey={item.dataKey}
                  name={item.name}
                  stroke={item.color}
                  strokeWidth={2.2}
                  dot={{ r: 2, strokeWidth: 0 }}
                  hide={isSeriesHidden(item.dataKey)}
                />
              ))}
            </LineChart>
          )}
        </ResponsiveContainer>
      </div>

      {footerNote ? <p className="mt-2 text-[11px] text-gray-400">{footerNote}</p> : null}
    </article>
  );
}
