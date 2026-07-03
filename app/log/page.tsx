'use client';

import React, { useState, useMemo, useEffect } from 'react';
import { WellnessForm } from '@/components/WellnessForm';
import { TrainingForm } from '@/components/TrainingForm';
import { useData } from '@/lib/DataContext';
import { format, subDays, addDays, parseISO, isValid } from 'date-fns';
import { ChevronLeft, ChevronRight, CheckCircle2, Heart, Dumbbell, Moon, Zap, Activity, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { SESSION_TYPES, SessionType, TrainingLog } from '@/lib/types';

const sessionTypeSet = new Set<SessionType>(SESSION_TYPES);

export default function LogPage() {
  const [expandedForm, setExpandedForm] = useState<'wellness' | 'training' | null>(null);
  const [selectedDateObj, setSelectedDateObj] = useState(new Date());
  const [showSuccess, setShowSuccess] = useState(false);
  const [trainingPrefill, setTrainingPrefill] = useState<Partial<TrainingLog> | null>(null);
  const [editingTraining, setEditingTraining] = useState<TrainingLog | null>(null);
  const [openTrainingMenuId, setOpenTrainingMenuId] = useState<string | null>(null);
  const [confirmDeleteTrainingId, setConfirmDeleteTrainingId] = useState<string | null>(null);

  const { wellnessLogs, trainingLogs, deleteTrainingLog } = useData();
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
    setEditingTraining(null);
    setOpenTrainingMenuId(null);
    setConfirmDeleteTrainingId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
    setTimeout(() => setShowSuccess(false), 3000);
  };

  const toggleForm = (form: 'wellness' | 'training') => {
    setExpandedForm(prev => prev === form ? null : form);
    setEditingTraining(null);
    if (form === 'training') {
      setTrainingPrefill(null);
    }
  };

  const handleEditTraining = (training: TrainingLog) => {
    setEditingTraining(training);
    setTrainingPrefill(training);
    setExpandedForm('training');
    setOpenTrainingMenuId(null);
    setConfirmDeleteTrainingId(null);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteTraining = (trainingId: string) => {
    deleteTrainingLog(trainingId);
    setOpenTrainingMenuId(null);
    setConfirmDeleteTrainingId(null);
    if (editingTraining?.id === trainingId) {
      setEditingTraining(null);
      setTrainingPrefill(null);
      setExpandedForm(null);
    }
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
  const hasAnyWellnessLogs = Object.keys(wellnessLogs).length > 0;
  const hasAnyTrainingLogs = trainingLogs.length > 0;

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
        <div className="mb-6 bg-[var(--status-green)] text-black font-bold p-4 rounded-xl flex items-center justify-center animate-slide-up shadow-lg shadow-[0_16px_40px_rgba(var(--status-green-rgb),0.26)]">
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
              ? 'bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-tertiary)] text-black shadow-lg shadow-[0_16px_40px_rgba(var(--accent-tertiary-rgb),0.22)]'
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
              ? 'bg-gradient-to-br from-[var(--accent-secondary)] to-[var(--accent-tertiary)] text-white shadow-lg shadow-[0_16px_40px_rgba(var(--accent-secondary-rgb),0.22)]'
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
            key={`training-${selectedDateStr}-${trainingPrefill?.id || trainingPrefill?.sessionType || 'default'}-${trainingPrefill?.duration || 'default'}`}
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
              <p className="mt-2 text-center text-xs leading-relaxed text-gray-500">
                {!hasAnyWellnessLogs
                  ? 'Start with Daily Wellness so Lodario can learn your sleep, energy, fatigue, and stress patterns.'
                  : !hasAnyTrainingLogs
                  ? 'Log your first training session after football, gym, or match play to build your load history.'
                  : 'Use the buttons above to add wellness or training for this date.'}
              </p>
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
                        <Moon size={14} className="text-[var(--metric-sleep-score)]" />
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
                        <Activity size={14} className="text-[var(--metric-fatigue)]" />
                        <div>
                          <p className="text-[10px] text-gray-500 uppercase">Fatigue</p>
                          <p className="text-sm font-bold text-white">{selectedWellness.fatigue}/10</p>
                        </div>
                      </div>
                      <div className="flex items-center space-x-2">
                        <Heart size={14} className="text-[var(--metric-stress)]" />
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
                <div key={training.id} className="glass-card p-5 relative">
                  <div className="flex items-start justify-between mb-3">
                    <h3 className="text-xs font-bold text-[var(--accent-secondary)] uppercase tracking-wider flex items-center pr-8">
                      <Dumbbell size={14} className="mr-1.5" /> {training.sessionType} Session
                    </h3>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenTrainingMenuId(openTrainingMenuId === training.id ? null : training.id);
                        setConfirmDeleteTrainingId(null);
                      }}
                      className="absolute top-3 right-3 p-2 rounded-full text-gray-400 hover:text-white hover:bg-[rgba(255,255,255,0.08)] touch-target"
                      aria-label="Training log options"
                    >
                      <MoreVertical size={18} />
                    </button>
                  </div>

                  {openTrainingMenuId === training.id && (
                    <div className="absolute right-3 top-12 z-20 w-36 overflow-hidden rounded-xl border border-[rgba(255,255,255,0.1)] bg-[var(--background)] shadow-xl animate-fade-in">
                      <button
                        type="button"
                        onClick={() => handleEditTraining(training)}
                        className="w-full px-3 py-3 text-left text-xs font-bold text-gray-200 hover:bg-[rgba(255,255,255,0.06)] flex items-center"
                      >
                        <Pencil size={14} className="mr-2" /> Edit
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteTrainingId(training.id)}
                        className="w-full px-3 py-3 text-left text-xs font-bold text-[#ff6b6b] hover:bg-[rgba(255,107,107,0.08)] flex items-center"
                      >
                        <Trash2 size={14} className="mr-2" /> Delete
                      </button>
                    </div>
                  )}

                  {confirmDeleteTrainingId === training.id && (
                    <div className="mb-4 p-3 rounded-xl bg-[rgba(255,107,107,0.1)] border border-[rgba(255,107,107,0.3)] animate-fade-in">
                      <p className="text-xs text-gray-200 mb-3">Delete this training log?</p>
                      <div className="flex space-x-2">
                        <button
                          type="button"
                          onClick={() => handleDeleteTraining(training.id)}
                          className="flex-1 py-2 rounded-lg text-xs font-bold bg-[#ff6b6b] text-white flex items-center justify-center transition-transform active:scale-95"
                        >
                          <Trash2 size={14} className="mr-1.5" /> Delete Log
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteTrainingId(null)}
                          className="px-4 py-2 rounded-lg text-xs font-medium text-gray-400 bg-[rgba(255,255,255,0.05)] hover:text-white"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
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
                        <p className="text-sm font-bold text-white">
                          {training.performance == null ? 'Not recorded' : `${training.performance}/10`}
                        </p>
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

