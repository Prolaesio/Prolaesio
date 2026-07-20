'use client';

import React, { useCallback, useRef, useState, useEffect } from 'react';
import { useData } from '../lib/DataContext';
import { Slider } from './ui/Slider';
import { Toggle } from './ui/Toggle';
import { InjuryStatusToggle } from './InjuryStatusToggle';
import { WellnessLog } from '../lib/types';
import { isAutomaticInjuryPainLevel } from '../lib/injury-status';
import { format, isBefore, parseISO, subDays } from 'date-fns';

interface WellnessFormProps {
  onSaved: () => void;
  selectedDate: string; // YYYY-MM-DD
}

export function WellnessForm({ onSaved, selectedDate }: WellnessFormProps) {
  const { wellnessLogs, saveWellnessLog } = useData();
  const existingLog = wellnessLogs[selectedDate];

  const [sleepTime, setSleepTime] = useState('22:00');
  const [wakeTime, setWakeTime] = useState('06:00');
  const [sleepQuality, setSleepQuality] = useState(5);
  const [energy, setEnergy] = useState(5);
  const [fatigue, setFatigue] = useState(5);
  const [stress, setStress] = useState(5);
  const [painActive, setPainActive] = useState(false);
  const [painLevel, setPainLevel] = useState(1);
  const [painNotes, setPainNotes] = useState('');
  const [manualInjury, setManualInjury] = useState(false);
  const [notes, setNotes] = useState('');
  const sleepTimesTouchedRef = useRef(false);
  const automaticallyTreatAsInjury = painActive && isAutomaticInjuryPainLevel(painLevel);
  const isInjury = painActive && (manualInjury || automaticallyTreatAsInjury);

  const getPreviousSleepTimes = useCallback(() => {
    const selectedDateObj = parseISO(selectedDate);
    const yesterdayKey = format(subDays(selectedDateObj, 1), 'yyyy-MM-dd');
    const yesterdayLog = wellnessLogs[yesterdayKey];
    if (yesterdayLog) {
      return {
        sleepTime: yesterdayLog.sleepTime,
        wakeTime: yesterdayLog.wakeTime,
      };
    }

    const previousLog = Object.values(wellnessLogs)
      .filter((log) => isBefore(parseISO(log.date), selectedDateObj))
      .sort((a, b) => parseISO(b.date).getTime() - parseISO(a.date).getTime())[0];

    return previousLog
      ? { sleepTime: previousLog.sleepTime, wakeTime: previousLog.wakeTime }
      : null;
  }, [selectedDate, wellnessLogs]);

  // Load existing data if changing date
  useEffect(() => {
    if (existingLog) {
      sleepTimesTouchedRef.current = false;
      setSleepTime(existingLog.sleepTime);
      setWakeTime(existingLog.wakeTime);
      setSleepQuality(existingLog.sleepQuality);
      setEnergy(existingLog.energy);
      setFatigue(existingLog.fatigue);
      setStress(existingLog.stress);
      setPainActive(existingLog.painActive);
      setPainLevel(existingLog.painLevel || 1);
      setPainNotes(existingLog.painNotes || '');
      setManualInjury(existingLog.isInjury ?? false);
      setNotes(existingLog.notes || '');
    } else {
      // Defaults map to "average"
      if (!sleepTimesTouchedRef.current) {
        const previousSleepTimes = getPreviousSleepTimes();
        setSleepTime(previousSleepTimes?.sleepTime || '22:00');
        setWakeTime(previousSleepTimes?.wakeTime || '06:00');
      }
      setSleepQuality(5);
      setEnergy(5);
      setFatigue(5);
      setStress(5);
      setPainActive(false);
      setPainLevel(1);
      setPainNotes('');
      setManualInjury(false);
      setNotes('');
    }
  }, [existingLog, selectedDate, wellnessLogs, getPreviousSleepTimes]);

  const handlePainActiveChange = (checked: boolean) => {
    setPainActive(checked);
    if (!checked) {
      setManualInjury(false);
    }
  };

  const calculateDuration = () => {
    const sl = sleepTime.split(':').map(Number);
    const wk = wakeTime.split(':').map(Number);
    let slMin = sl[0] * 60 + sl[1];
    let wkMin = wk[0] * 60 + wk[1];
    if (wkMin < slMin) {
      wkMin += 24 * 60; // Next day
    }
    return Number(((wkMin - slMin) / 60).toFixed(1));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const log: WellnessLog = {
      date: selectedDate,
      sleepTime,
      wakeTime,
      sleepDuration: calculateDuration(),
      sleepQuality,
      energy,
      fatigue,
      stress,
      painActive,
      painLevel: painActive ? painLevel : undefined,
      painNotes: painActive ? painNotes : undefined,
      isInjury,
      notes,
    };
    saveWellnessLog(log);
    onSaved();
  };

  return (
    <form onSubmit={handleSubmit} className="animate-fade-in pb-8">
      <div className="glass-card p-5 mb-6">
        <h3 className="text-[var(--accent-primary)] font-bold uppercase tracking-wider text-xs mb-4">Sleep Metrics</h3>
        
        <div className="flex space-x-4 mb-5">
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-400 mb-1">To Bed</label>
            <input 
              type="time" 
              value={sleepTime} 
              onChange={(e) => {
                sleepTimesTouchedRef.current = true;
                setSleepTime(e.target.value);
              }}
              className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-lg p-3 text-white touch-target"
            />
          </div>
          <div className="flex-1">
            <label className="block text-xs font-medium text-gray-400 mb-1">Wake Up</label>
            <input 
              type="time" 
              value={wakeTime} 
              onChange={(e) => {
                sleepTimesTouchedRef.current = true;
                setWakeTime(e.target.value);
              }}
              className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-lg p-3 text-white touch-target"
            />
          </div>
        </div>
        
        <div className="mb-2 text-right">
          <span className="text-xs text-gray-400">Duration: </span>
          <span className="text-sm font-bold text-white">{calculateDuration()} hrs</span>
        </div>

        <Slider label="Sleep Quality" value={sleepQuality} onChangeValue={setSleepQuality} />
      </div>

      <div className="glass-card p-5 mb-6">
        <h3 className="text-[var(--accent-secondary)] font-bold uppercase tracking-wider text-xs mb-4">Readiness Indicators</h3>
        <Slider label="Morning Energy" value={energy} onChangeValue={setEnergy} />
        <Slider label="Muscle Fatigue/Soreness" value={fatigue} onChangeValue={setFatigue} />
        <Slider label="General Stress" value={stress} onChangeValue={setStress} />
      </div>

      <div className="glass-card p-5 mb-6">
        <h3 className="text-[#ff6b6b] font-bold uppercase tracking-wider text-xs mb-4">Pain & Injury</h3>
        <Toggle label="Are you experiencing unusual pain?" checked={painActive} onChange={handlePainActiveChange} />
        
        {painActive && (
          <div className="mt-4 animate-slide-up bg-[rgba(255,107,107,0.1)] p-4 rounded-xl border border-[rgba(255,107,107,0.2)]">
            <Slider label="Pain Level" value={painLevel} min={1} max={10} onChangeValue={setPainLevel} />
            <div className="mt-4">
              <InjuryStatusToggle
                checked={isInjury}
                automaticallyEnabled={automaticallyTreatAsInjury}
                onChange={setManualInjury}
              />
            </div>
            <div className="mt-4">
              <label className="block text-xs font-medium text-[#ff6b6b] mb-1">Pain Location & Description</label>
              <textarea 
                value={painNotes}
                onChange={(e) => setPainNotes(e.target.value)}
                placeholder="Where does it hurt? Is it sharp or dull?"
                className="w-full bg-[rgba(0,0,0,0.2)] border border-[rgba(255,107,107,0.3)] rounded-lg p-3 text-white focus:outline-none"
                rows={2}
              />
            </div>
          </div>
        )}
      </div>

      <div className="glass-card p-5 mb-6">
        <label className="block text-xs font-medium text-gray-400 mb-2">General Notes (Optional)</label>
        <textarea 
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="How are you feeling overall?"
          className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-lg p-3 text-white focus:outline-none focus:border-[var(--accent-primary)]"
          rows={3}
        />
      </div>

      <button 
        type="submit" 
        className="w-full bg-gradient-to-r from-[var(--accent-primary)] to-[var(--accent-tertiary)] text-black font-bold py-4 rounded-xl shadow-lg transform transition active:scale-95 touch-target"
      >
        Save Wellness Log
      </button>
    </form>
  );
}
