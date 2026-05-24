'use client';

import React from 'react';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend, LineChart, Line } from 'recharts';
import { useData } from '../lib/DataContext';
import { format, subDays, parseISO } from 'date-fns';
import { calculateSessionLoad } from '../lib/training-load';

interface ChartProps {
  days: number;
}

const CustomTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[var(--background)] border border-[rgba(255,255,255,0.1)] p-3 rounded-lg shadow-xl">
        <p className="text-white font-bold text-sm mb-1">{label}</p>
        {payload.map((entry: any, index: number) => (
          <p key={index} className="text-xs" style={{ color: entry.color }}>
            {entry.name}: {entry.value}
          </p>
        ))}
      </div>
    );
  }
  return null;
};

export function ReadinessChart({ days }: ChartProps) {
  const { wellnessLogs } = useData();
  
  const data = Array.from({ length: days }).map((_, i) => {
    const date = subDays(new Date(), days - 1 - i);
    const dateStr = format(date, 'yyyy-MM-dd');
    const log = wellnessLogs[dateStr];
    
    // Simplistic score for charting (actual score requires full history mapping, simplifying for UI performance)
    let score = null;
    if (log) {
      score = ((log.sleepDuration >= 8 ? 100 : (log.sleepDuration/8)*100) * 0.3) +
              ((log.energy / 10) * 100 * 0.3) +
              (((10 - log.fatigue + 1) / 10) * 100 * 0.4);
    }
    
    return {
      name: format(date, 'MMM d'),
      score: score ? Math.round(score) : null,
    };
  }).filter(d => d.score !== null);

  if (data.length === 0) return <NoData />;

  return (
    <div className="h-64 w-full glass-card p-4">
      <h3 className="text-xs font-bold text-gray-400 mb-4 uppercase tracking-wider">Readiness Trend</h3>
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
          <defs>
            <linearGradient id="colorScore" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="var(--accent-primary)" stopOpacity={0.8}/>
              <stop offset="95%" stopColor="var(--accent-primary)" stopOpacity={0}/>
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="name" stroke="gray" fontSize={10} tickLine={false} axisLine={false} />
          <YAxis stroke="gray" fontSize={10} tickLine={false} axisLine={false} domain={[0, 100]} />
          <Tooltip content={<CustomTooltip />} />
          <Area type="monotone" dataKey="score" name="Score" stroke="var(--accent-primary)" fillOpacity={1} fill="url(#colorScore)" strokeWidth={3} />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function LoadChart({ days }: ChartProps) {
  const { trainingLogs } = useData();
  
  const data = Array.from({ length: days }).map((_, i) => {
    const date = subDays(new Date(), days - 1 - i);
    const dateStr = format(date, 'yyyy-MM-dd');
    
    const logs = trainingLogs.filter(l => l.date === dateStr);
    const load = logs.reduce((sum, l) => sum + calculateSessionLoad(l), 0);
    
    return {
      name: format(date, 'MMM d'),
      load: load,
    };
  });

  return (
    <div className="h-64 w-full glass-card p-4">
      <h3 className="text-xs font-bold text-gray-400 mb-4 uppercase tracking-wider">Training Load (Acute)</h3>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="name" stroke="gray" fontSize={10} tickLine={false} axisLine={false} />
          <YAxis stroke="gray" fontSize={10} tickLine={false} axisLine={false} />
          <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.05)' }} />
          <Bar dataKey="load" name="Load (Intensity × Duration)" fill="var(--accent-secondary)" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

export function FatigueEnergyChart({ days }: ChartProps) {
  const { wellnessLogs } = useData();
  
  const data = Array.from({ length: days }).map((_, i) => {
    const date = subDays(new Date(), days - 1 - i);
    const dateStr = format(date, 'yyyy-MM-dd');
    const log = wellnessLogs[dateStr];
    
    return {
      name: format(date, 'MMM d'),
      energy: log?.energy || null,
      fatigue: log?.fatigue || null,
    };
  }).filter(d => d.energy !== null);

  if (data.length === 0) return <NoData />;

  return (
    <div className="h-64 w-full glass-card p-4">
      <h3 className="text-xs font-bold text-gray-400 mb-4 uppercase tracking-wider">Energy vs Fatigue</h3>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 0, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" vertical={false} />
          <XAxis dataKey="name" stroke="gray" fontSize={10} tickLine={false} axisLine={false} />
          <YAxis stroke="gray" fontSize={10} tickLine={false} axisLine={false} domain={[0, 10]} />
          <Tooltip content={<CustomTooltip />} />
          <Legend wrapperStyle={{ fontSize: '10px' }} iconType="circle" />
          <Line type="monotone" dataKey="energy" name="Energy" stroke="#ffd43b" strokeWidth={3} dot={{ r: 3, fill: '#ffd43b', strokeWidth: 0 }} />
          <Line type="monotone" dataKey="fatigue" name="Fatigue" stroke="#ff6b6b" strokeWidth={3} dot={{ r: 3, fill: '#ff6b6b', strokeWidth: 0 }} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function NoData() {
  return (
    <div className="h-64 w-full glass-card p-4 flex items-center justify-center flex-col">
      <p className="text-gray-500 font-medium">Not enough data</p>
      <p className="text-xs text-gray-600 mt-1">Log wellness and training to view charts</p>
    </div>
  );
}
