'use client';

import React from 'react';
import { useData } from '../lib/DataContext';
import { useTrainingLoad } from '../hooks/useTrainingLoad';
import { ShieldAlert, CheckCircle2, AlertCircle } from 'lucide-react';

export function InjuryTracker() {
  const { injuries, saveInjury } = useData();
  const load = useTrainingLoad();

  const activeInjuries = injuries.filter(i => i.status === 'active' || i.status === 'recovering');
  const pastInjuries = injuries.filter(i => i.status === 'resolved');

  const markResolved = (id: string) => {
    const injury = injuries.find(i => i.id === id);
    if (injury) {
      saveInjury({ ...injury, status: 'resolved' });
    }
  };

  return (
    <div className="mt-8 animate-slide-up" style={{ animationDelay: '0.2s', animationFillMode: 'both' }}>
      <h2 className="text-xl font-bold text-white tracking-tight mb-4 flex items-center">
        <ShieldAlert className="mr-2 text-[#ff6b6b]" size={24} />
        Injury Protocol
      </h2>

      {load.hasAutoInjury && (
        <div className="glass-card p-5 mb-4 bg-[rgba(255,107,107,0.1)] border-[#ff6b6b]">
          <h3 className="text-[#ff6b6b] font-bold text-sm tracking-wide flex items-center mb-2">
            <AlertCircle size={16} className="mr-1" /> Auto-Detected Protocol
          </h3>
          <p className="text-gray-300 text-xs leading-relaxed mb-3">
            The system has placed you in an active recovery protocol due to high pain levels logged over multiple days. 
            This protocol will automatically clear after consecutive low-pain logs.
          </p>
        </div>
      )}

      <div className="space-y-4 mb-8">
        {activeInjuries.map(injury => (
          <div key={injury.id} className="glass-card p-5 border-l-4 border-[#ff922b]">
            <h3 className="text-white font-bold text-sm mb-1">{injury.description}</h3>
            {injury.doctorNotes && (
              <p className="text-xs text-gray-400 italic mb-3">" {injury.doctorNotes} "</p>
            )}
            <div className="flex justify-between items-center mt-4">
              <span className="text-[10px] uppercase tracking-wider text-[#ff922b] font-bold bg-[rgba(255,146,43,0.1)] px-2 py-1 rounded">
                {injury.status}
              </span>
              <button 
                onClick={() => markResolved(injury.id)}
                className="text-xs text-gray-400 hover:text-[var(--status-green)] flex items-center touch-target"
              >
                <CheckCircle2 size={16} className="mr-1" /> Resolve
              </button>
            </div>
          </div>
        ))}
        {activeInjuries.length === 0 && !load.hasAutoInjury && (
          <div className="glass-card p-5 text-center border-dashed border-[rgba(255,255,255,0.2)]">
            <CheckCircle2 className="mx-auto text-[var(--status-green)] mb-2" size={32} />
            <p className="text-sm font-medium text-white">No Active Issues</p>
            <p className="text-xs text-gray-400 mt-1">You are fully fit to train.</p>
          </div>
        )}
      </div>

      {pastInjuries.length > 0 && (
        <div>
          <h3 className="text-xs font-bold text-gray-500 uppercase tracking-wider mb-3 pl-1">History</h3>
          <div className="space-y-3 opacity-60">
            {pastInjuries.map(injury => (
              <div key={injury.id} className="glass-card p-4">
                <h4 className="text-sm text-gray-300 line-through">{injury.description}</h4>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
