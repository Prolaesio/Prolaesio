'use client';

import React, { useEffect, useState } from 'react';
import { useData } from '../lib/DataContext';
import { Slider } from './ui/Slider';
import { Toggle } from './ui/Toggle';
import { TrainingLog, SessionType, SprintingOption } from '../lib/types';
import { v4 as uuidv4 } from 'uuid';

interface TrainingFormProps {
  onSaved: () => void;
  selectedDate: string; // YYYY-MM-DD
  initialValues?: {
    sessionType?: SessionType;
    duration?: number;
  };
}

export function TrainingForm({ onSaved, selectedDate, initialValues }: TrainingFormProps) {
  const { saveTrainingLog } = useData();

  const sessionTypes: SessionType[] = ['Solo', 'Partner', 'Team', 'Match', 'Gym', 'Other'];
  const [sessionType, setSessionType] = useState<SessionType>(initialValues?.sessionType || 'Team');
  
  const [duration, setDuration] = useState<string>(
    initialValues?.duration && initialValues.duration > 0 ? String(initialValues.duration) : '90'
  );
  const quickDurations = [30, 45, 60, 90];

  const [distance, setDistance] = useState<string>('');
  const [intensity, setIntensity] = useState<number>(7);
  const [sprinting, setSprinting] = useState<SprintingOption>('no');
  const [performance, setPerformance] = useState<number>(5);
  
  const [painActive, setPainActive] = useState<boolean>(false);
  const [painLevel, setPainLevel] = useState<number>(1);
  const [painNotes, setPainNotes] = useState<string>('');
  const [notes, setNotes] = useState<string>('');

  const [error, setError] = useState<string>('');

  useEffect(() => {
    if (initialValues?.sessionType) {
      setSessionType(initialValues.sessionType);
    }
    if (initialValues?.duration && initialValues.duration > 0) {
      setDuration(String(initialValues.duration));
    }
  }, [initialValues?.sessionType, initialValues?.duration, selectedDate]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    const durationNum = Number(duration);
    if (!duration || isNaN(durationNum) || durationNum <= 0) {
      setError('Please enter a valid duration.');
      return;
    }

    const log: TrainingLog = {
      id: uuidv4(),
      date: selectedDate,
      sessionType,
      duration: durationNum,
      distance: distance ? parseFloat(distance) : undefined,
      intensity,
      sprinting,
      performance,
      painActive,
      painLevel: painActive ? painLevel : undefined,
      painNotes: painActive ? painNotes : undefined,
      notes,
    };
    saveTrainingLog(log);
    onSaved();
    // Reset form mostly
    setDistance('');
    setNotes('');
    setPainActive(false);
  };

  return (
    <form onSubmit={handleSubmit} className="animate-fade-in pb-8">
      
      {error && (
        <div className="mb-4 p-3 rounded-xl bg-[rgba(255,107,107,0.1)] border border-[rgba(255,107,107,0.3)] text-[#ff6b6b] text-xs font-medium animate-fade-in">
          {error}
        </div>
      )}

      {/* Session Details */}
      <div className="glass-card p-5 mb-6">
        <h3 className="text-[var(--accent-primary)] font-bold uppercase tracking-wider text-xs mb-4">Session Details</h3>
        
        <label className="block text-xs font-medium text-gray-400 mb-2">Type</label>
        <div className="grid grid-cols-3 gap-2 mb-6 cursor-pointer">
          {sessionTypes.map(type => (
            <div 
              key={type}
              onClick={() => setSessionType(type)}
              className={`text-center py-2 px-1 rounded-lg text-sm transition-colors touch-target flex justify-center items-center ${
                sessionType === type 
                  ? 'bg-[var(--accent-primary)] text-black font-bold' 
                  : 'bg-[rgba(255,255,255,0.05)] text-gray-300 hover:bg-[rgba(255,255,255,0.1)]'
              }`}
            >
              {type}
            </div>
          ))}
        </div>

        <label className="block text-xs font-medium text-gray-400 mb-2">Duration (mins)</label>
        <div className="flex space-x-2 mb-4 overflow-x-auto pb-2">
          {quickDurations.map(dur => (
            <button
              type="button"
              key={dur}
              onClick={() => setDuration(String(dur))}
              className={`flex-shrink-0 px-4 py-2 rounded-lg text-sm touch-target ${
                duration === String(dur)
                  ? 'bg-[var(--accent-secondary)] text-white font-bold'
                  : 'bg-[rgba(255,255,255,0.05)] text-gray-300 border border-[rgba(255,255,255,0.1)]'
              }`}
            >
              {dur}
            </button>
          ))}
          <input 
            type="number"
            value={duration}
            onChange={(e) => setDuration(e.target.value)}
            className="w-20 bg-[rgba(255,255,255,0.05)] border-2 border-[rgba(255,255,255,0.35)] rounded-lg p-2 text-white text-center ml-2 touch-target"
          />
        </div>

        <label className="block text-xs font-medium text-gray-400 mb-1 mt-4">Distance (KM) - Optional</label>
        <input 
          type="number" 
          step="0.1"
          placeholder="e.g. 5.5"
          value={distance}
          onChange={(e) => setDistance(e.target.value)}
          className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-lg p-3 text-white touch-target"
        />
      </div>

      {/* Exertion & Performance */}
      <div className="glass-card p-5 mb-6">
        <h3 className="text-[var(--accent-secondary)] font-bold uppercase tracking-wider text-xs mb-4">Exertion & Performance</h3>
        
        <Slider label="RPE (Rate of Perceived Exertion)" value={intensity} onChangeValue={setIntensity} />
        
        <div className="mt-6 mb-6">
          <label className="block text-xs font-medium text-gray-400 mb-2">Sprinting / High Speed Running</label>
          <div className="flex space-x-2">
            {[
              { value: 'no', label: 'None' },
              { value: 'yes-90-95', label: '90-95%' },
              { value: 'yes-100', label: '100% Max' },
            ].map(opt => (
              <button
                type="button"
                key={opt.value}
                onClick={() => setSprinting(opt.value as SprintingOption)}
                className={`flex-1 py-2 px-1 rounded-lg text-xs font-medium touch-target ${
                  sprinting === opt.value
                    ? 'bg-gradient-to-r from-[var(--status-orange)] to-[#ff6b6b] text-white shadow-md'
                    : 'bg-[rgba(255,255,255,0.05)] text-gray-400'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <Slider label="Personal Performance" value={performance} onChangeValue={setPerformance} />
      </div>

      {/* Pain & Notes */}
      <div className="glass-card p-5 mb-6">
        <h3 className="text-[#ff6b6b] font-bold uppercase tracking-wider text-xs mb-4">Pain & Notes</h3>
        
        <Toggle label="Pain during/after session?" checked={painActive} onChange={setPainActive} />
        
        {painActive && (
          <div className="mt-4 animate-slide-up bg-[rgba(255,107,107,0.1)] p-4 rounded-xl border border-[rgba(255,107,107,0.2)]">
            <Slider label="Pain Level" value={painLevel} min={1} max={10} onChangeValue={setPainLevel} />
            <div className="mt-4">
              <label className="block text-xs font-medium text-[#ff6b6b] mb-1">Pain Location</label>
              <textarea 
                value={painNotes}
                onChange={(e) => setPainNotes(e.target.value)}
                placeholder="Where did you feel it?"
                className="w-full bg-[rgba(0,0,0,0.2)] border border-[rgba(255,107,107,0.3)] rounded-lg p-3 text-white focus:outline-none"
                rows={2}
              />
            </div>
          </div>
        )}

        <div className="mt-6">
          <label className="block text-xs font-medium text-gray-400 mb-2">Session Notes</label>
          <textarea 
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="Focus areas, coaches feedback, etc."
            className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-lg p-3 text-white focus:outline-none focus:border-[var(--accent-primary)]"
            rows={3}
          />
        </div>
      </div>

      <button 
        type="submit" 
        className="w-full bg-gradient-to-r from-[var(--accent-secondary)] to-blue-500 text-white font-bold py-4 rounded-xl shadow-lg transform transition active:scale-95 touch-target"
      >
        Save Training Log
      </button>
    </form>
  );
}
