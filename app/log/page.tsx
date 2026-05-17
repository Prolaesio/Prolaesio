'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { WellnessForm } from '@/components/WellnessForm';
import { TrainingForm } from '@/components/TrainingForm';
import { useData } from '@/lib/DataContext';
import { format, subDays, addDays, parseISO, isValid } from 'date-fns';
import { ChevronLeft, ChevronRight, CheckCircle2, Heart, Dumbbell, Moon, Zap, Activity } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { SessionType } from '@/lib/types';

const sessionTypeSet = new Set<SessionType>(['Solo', 'Partner', 'Team', 'Match', 'Gym', 'Other']);

export default function LogPage() {
  const [expandedForm, setExpandedForm] = useState<'wellness' | 'training' | null>(null);
  const [selectedDateObj, setSelectedDateObj] = useState(new Date());
  const [showSuccess, setShowSuccess] = useState(false);
  const [trainingPrefill, setTrainingPrefill] = useState<{ sessionType?: SessionType; duration?: number } | null>(null);

  const { wellnessLogs, trainingLogs } = useData();
  const searchParams = useSearchParams();
  const openParam = searchParams.get('open');
  const dateParam = searchParams.get('date');
  const durationParam = searchParams.get('duration');
  const sessionTypeParam = searchParams.get('sessionType');

  const selectedDateStr = format(selectedDateObj, 'yyyy-MM-dd');
  const todayStr = format(new Date(), 'yyyy-MM-dd');

  const handlePrevDay = () => setSelectedDateObj(subDays(selectedDateObj, 1));
  const handleNextDay = () => {
    if (selectedDateStr !== todayStr) {
      setSelectedDateObj(addDays(selectedDateObj, 1));
    }
  };

  const onSaved = () => {
    setShowSuccess(true);
    setExpandedForm(null);
    setTrainingPrefill(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const toggleForm = (form: 'wellness' | 'training') => {
    setExpandedForm(prev => prev === form ? null : form);
  };

  // Get wellness log for the selected date
  const selectedWellness = useMemo(() => {
    return wellnessLogs[selectedDateStr] || null;
  }, [wellnessLogs, selectedDateStr]);

  // Get training logs for the selected date
  const selectedTrainings = useMemo(() => {
    return trainingLogs.filter(log => log.date === selectedDateStr);
  }, [trainingLogs, selectedDateStr]);

  const hasAnyLogs = selectedWellness || selectedTrainings.length > 0;

  useEffect(() => {
    if (openParam !== 'training') return;

    if (dateParam) {
      const parsed = parseISO(dateParam);
      if (isValid(parsed)) {
        setSelectedDateObj(parsed);
      }
    }

    const parsedDuration = durationParam ? Number(durationParam) : NaN;
    const parsedSessionType =
      sessionTypeParam && sessionTypeSet.has(sessionTypeParam as SessionType)
        ? (sessionTypeParam as SessionType)
        : undefined;

    setTrainingPrefill({
      sessionType: parsedSessionType,
      duration: Number.isFinite(parsedDuration) && parsedDuration > 0 ? parsedDuration : undefined,
    });
    setExpandedForm('training');
  }, [openParam, dateParam, durationParam, sessionTypeParam]);

  return (
    <div className="px-4 py-8 max-w-md mx-auto">
      <header className="mb-6 pl-1">
        <h1 className="text-3xl font-bold text-white tracking-tight">Log Activity</h1>
      </header>

      {/* Date Selector */}
      <div className="flex justify-between items-center mb-6 glass-card p-2 rounded-full">
        <button onClick={handlePrevDay} className="p-2 text-gray-400 hover:text-white touch-target">
          <ChevronLeft size={24} />
        </button>
        <span className="font-bold text-white">
          {selectedDateStr === todayStr ? 'Today' : format(selectedDateObj, 'MMM d, yyyy')}
        </span>
        <button 
          onClick={handleNextDay} 
          className={`p-2 touch-target ${selectedDateStr === todayStr ? 'text-gray-600 cursor-not-allowed' : 'text-gray-400 hover:text-white'}`}
          disabled={selectedDateStr === todayStr}
        >
          <ChevronRight size={24} />
        </button>
      </div>

      {/* Success Notification */}
      {showSuccess && (
        <div className="mb-6 bg-emerald-500 text-black font-bold p-4 rounded-xl flex items-center justify-center animate-slide-up shadow-lg shadow-emerald-900/50">
          <CheckCircle2 className="mr-2" />
          Successfully saved!
        </div>
      )}

      {/* Toggle Buttons */}
      <div className="grid grid-cols-2 gap-3 mb-6">
        <button
          onClick={() => toggleForm('wellness')}
          className={`py-4 px-3 rounded-xl font-bold text-sm transition-all shadow-sm touch-target flex flex-col items-center justify-center space-y-1 ${
            expandedForm === 'wellness' 
              ? 'bg-gradient-to-br from-[var(--accent-primary)] to-emerald-600 text-black shadow-lg shadow-emerald-900/30' 
              : 'glass-card text-gray-300 hover:text-white'
          }`}
        >
          <Heart size={20} />
          <span>Daily Wellness</span>
        </button>
        <button
          onClick={() => toggleForm('training')}
          className={`py-4 px-3 rounded-xl font-bold text-sm transition-all shadow-sm touch-target flex flex-col items-center justify-center space-y-1 ${
            expandedForm === 'training' 
              ? 'bg-gradient-to-br from-[var(--accent-secondary)] to-blue-600 text-white shadow-lg shadow-blue-900/30' 
              : 'glass-card text-gray-300 hover:text-white'
          }`}
        >
          <Dumbbell size={20} />
          <span>Training Session</span>
        </button>
      </div>

      {/* Expanded Form */}
      {expandedForm === 'wellness' && (
        <div className="animate-slide-up">
          <WellnessForm key={`wellness-${selectedDateStr}`} selectedDate={selectedDateStr} onSaved={onSaved} />
        </div>
      )}
      {expandedForm === 'training' && (
        <div className="animate-slide-up">
          <TrainingForm
            key={`training-${selectedDateStr}-${trainingPrefill?.sessionType || 'default'}-${trainingPrefill?.duration || 'default'}`}
            selectedDate={selectedDateStr}
            onSaved={onSaved}
            initialValues={trainingPrefill || undefined}
          />
        </div>
      )}

      {/* Logs for Selected Date — shown when no form is expanded */}
      {expandedForm === null && (
        <div className="space-y-4 animate-fade-in">
          {!hasAnyLogs ? (
            <div className="glass-card p-6 flex flex-col items-center justify-center text-gray-400 border-dashed border-[rgba(255,255,255,0.2)]">
              <p className="text-sm">No logs recorded for this day</p>
            </div>
          ) : (
            <>
              {/* Wellness Summary for Selected Date */}
              {selectedWellness && (
                <div className="glass-card p-5">
                  <h3 className="text-xs font-bold text-[var(--accent-primary)] uppercase tracking-wider mb-3 flex items-center">
                    <Heart size={14} className="mr-1.5" /> Daily Wellness
                  </h3>
                  <div>
                    <p className="text-xs text-gray-400 mb-3">{format(parseISO(selectedWellness.date), 'EEEE, MMM d, yyyy')}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="flex items-center space-x-2">
                        <Moon size={14} className="text-blue-400" />
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase">Sleep</p>
                          <p className="text-sm font-bold text-white">{selectedWellness.sleepDuration}h · Q{selectedWellness.sleepQuality}/10</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Zap size={14} className="text-yellow-400" />
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase">Energy</p>
                          <p className="text-sm font-bold text-white">{selectedWellness.energy}/10</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Activity size={14} className="text-orange-400" />
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase">Fatigue</p>
                          <p className="text-sm font-bold text-white">{selectedWellness.fatigue}/10</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Heart size={14} className="text-red-400" />
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase">Stress</p>
                          <p className="text-sm font-bold text-white">{selectedWellness.stress}/10</p>
                        </div>
                      </div>
                    </div>
                    {selectedWellness.painActive && (
                      <div className="mt-3 p-2 rounded-lg bg-[rgba(255,107,107,0.1)] border border-[rgba(255,107,107,0.2)]">
                        <p className="text-xs text-[#ff6b6b] font-medium">Pain Level: {selectedWellness.painLevel}/10</p>
                        {selectedWellness.painNotes && <p className="text-xs text-gray-400 mt-1">{selectedWellness.painNotes}</p>}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Training Summaries for Selected Date */}
              {selectedTrainings.map((training) => (
                <div key={training.id} className="glass-card p-5">
                  <h3 className="text-xs font-bold text-[var(--accent-secondary)] uppercase tracking-wider mb-3 flex items-center">
                    <Dumbbell size={14} className="mr-1.5" /> {training.sessionType} Session
                  </h3>
                  <div>
                    <p className="text-xs text-gray-400 mb-3">{format(parseISO(training.date), 'EEEE, MMM d, yyyy')}</p>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase">Type</p>
                        <p className="text-sm font-bold text-white">{training.sessionType}</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase">Duration</p>
                        <p className="text-sm font-bold text-white">{training.duration} mins</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase">Intensity (RPE)</p>
                        <p className="text-sm font-bold text-white">{training.intensity}/10</p>
                      </div>
                      <div>
                        <p className="text-[10px] text-gray-500 uppercase">Performance</p>
                        <p className="text-sm font-bold text-white">{training.performance}/10</p>
                      </div>
                    </div>
                    {training.notes && (
                      <p className="text-xs text-gray-400 mt-3 italic">&ldquo;{training.notes}&rdquo;</p>
                    )}
                  </div>
                </div>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}

