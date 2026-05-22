'use client';

import React, { useMemo, useState } from 'react';
import { differenceInYears, parseISO, format, addWeeks, subWeeks } from 'date-fns';
import {
  ArrowRight,
  ArrowLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Plus,
  Shield,
  SkipForward,
} from 'lucide-react';
import { useData } from '@/lib/DataContext';
import {
  Position,
  TrainingResource,
  UserProfile,
  WeeklyAvailability,
  CalendarEvent,
} from '@/lib/types';
import { POSITION_OPTIONS } from '@/lib/onboarding';
import { WeeklyAvailabilityGrid } from './WeeklyAvailabilityGrid';
import { TrainingResourcePicker } from './TrainingResourcePicker';
import { CalendarWeek } from './CalendarWeek';
import { EventModal } from './EventModal';

type StepId = 1 | 2 | 3 | 4;

const TOTAL_STEPS = 4;

interface StepHeaderProps {
  step: StepId;
  title: string;
  subtitle: string;
}

function StepHeader({ step, title, subtitle }: StepHeaderProps) {
  return (
    <div className="mb-6">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-[var(--accent-primary)]">
          Step {step} of {TOTAL_STEPS}
        </span>
        <div className="flex items-center space-x-1.5">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => i + 1).map(i => (
            <span
              key={i}
              className={`h-1 rounded-full transition-all ${
                i < step
                  ? 'w-3 bg-[var(--accent-primary)]'
                  : i === step
                  ? 'w-6 bg-[var(--accent-primary)]'
                  : 'w-3 bg-[rgba(255,255,255,0.15)]'
              }`}
            />
          ))}
        </div>
      </div>
      <h1 className="text-2xl font-bold text-white tracking-tight">{title}</h1>
      <p className="text-sm text-gray-400 mt-1 leading-relaxed">{subtitle}</p>
    </div>
  );
}

export function OnboardingFlow() {
  const { profile, saveProfile, calendarEvents } = useData();

  const [step, setStep] = useState<StepId>(1);

  // --- Step 1: Mandatory profile setup ---
  const [dateOfBirth, setDateOfBirth] = useState<string>(profile?.dateOfBirth || '');
  const [heightCm, setHeightCm] = useState<string>(
    profile?.heightCm != null ? String(profile.heightCm) : ''
  );
  const [weightKg, setWeightKg] = useState<string>(
    profile?.weightKg != null ? String(profile.weightKg) : ''
  );
  const [positions, setPositions] = useState<Position[]>(profile?.positions || []);
  const [teamCode, setTeamCode] = useState<string>(profile?.teamCode || '');
  const [teamConnected, setTeamConnected] = useState<boolean>(!!profile?.teamCode);
  const [teamSkipped, setTeamSkipped] = useState<boolean>(false);
  const [step1Error, setStep1Error] = useState<string>('');
  const [savingStep1, setSavingStep1] = useState(false);

  // --- Step 2: Weekly availability ---
  const [availability, setAvailability] = useState<WeeklyAvailability>(
    profile?.availability || {}
  );

  // --- Step 3: Training resources ---
  const [resources, setResources] = useState<TrainingResource[]>(
    profile?.trainingResources || []
  );

  // --- Step 4: Calendar setup (uses existing system) ---
  const [calendarDate, setCalendarDate] = useState(new Date());
  const [showEventModal, setShowEventModal] = useState(false);
  const [editingEvent, setEditingEvent] = useState<CalendarEvent | undefined>(undefined);
  const [editingIsRecurring, setEditingIsRecurring] = useState(false);
  const [editingInstanceDate, setEditingInstanceDate] = useState<string | undefined>(undefined);
  const [eventModalDate, setEventModalDate] = useState<string>(format(new Date(), 'yyyy-MM-dd'));
  const [defaultStartHour, setDefaultStartHour] = useState<number | undefined>(undefined);

  const [completing, setCompleting] = useState(false);

  const computedAge = useMemo(() => {
    if (!dateOfBirth) return null;
    try {
      return differenceInYears(new Date(), parseISO(dateOfBirth));
    } catch {
      return null;
    }
  }, [dateOfBirth]);

  // ---- Helpers ----
  const togglePosition = (pos: Position) => {
    setPositions(prev =>
      prev.includes(pos) ? prev.filter(p => p !== pos) : [...prev, pos]
    );
  };

  const buildProfilePatch = (overrides: Partial<UserProfile> = {}): UserProfile => ({
    age: computedAge ?? profile?.age ?? 18,
    dateOfBirth: dateOfBirth || profile?.dateOfBirth,
    positions,
    priorities: profile?.priorities || [],
    heightCm: heightCm ? Number(heightCm) : profile?.heightCm,
    weightKg: weightKg ? Number(weightKg) : profile?.weightKg,
    teamCode: teamConnected && teamCode.trim() ? teamCode.trim() : undefined,
    availability,
    trainingResources: resources,
    onboardingCompleted: profile?.onboardingCompleted ?? false,
    ...overrides,
  });

  // ---- Step 1 handlers ----
  const handleSubmitStep1 = async (e: React.FormEvent) => {
    e.preventDefault();
    setStep1Error('');

    if (!dateOfBirth) {
      setStep1Error('Please enter your birthday.');
      return;
    }
    if (computedAge === null || computedAge < 1 || computedAge > 99) {
      setStep1Error('Please enter a valid date of birth.');
      return;
    }
    const heightNum = Number(heightCm);
    if (!heightCm || Number.isNaN(heightNum) || heightNum <= 0 || heightNum > 260) {
      setStep1Error('Please enter a valid height in centimeters.');
      return;
    }
    const weightNum = Number(weightKg);
    if (!weightKg || Number.isNaN(weightNum) || weightNum <= 0 || weightNum > 250) {
      setStep1Error('Please enter a valid weight in kilograms.');
      return;
    }
    if (positions.length === 0) {
      setStep1Error('Pick at least one position.');
      return;
    }

    setSavingStep1(true);
    try {
      saveProfile(buildProfilePatch());
      setStep(2);
    } finally {
      setSavingStep1(false);
    }
  };

  const handleConnectTeam = () => {
    if (!teamCode.trim()) return;
    setTeamConnected(true);
    setTeamSkipped(false);
  };

  const handleNoTeam = () => {
    setTeamConnected(false);
    setTeamSkipped(true);
    setTeamCode('');
  };

  // ---- Step 2 handlers ----
  const handleSaveAvailability = () => {
    saveProfile(buildProfilePatch({ availability }));
    setStep(3);
  };

  const handleSkipAvailability = () => {
    setStep(3);
  };

  // ---- Step 3 handlers ----
  const handleSaveResources = () => {
    saveProfile(buildProfilePatch({ trainingResources: resources }));
    setStep(4);
  };

  const handleSkipResources = () => {
    setStep(4);
  };

  // ---- Step 4 handlers ----
  const handleAddEvent = (dateStr?: string, hour?: number) => {
    setEditingEvent(undefined);
    setEditingIsRecurring(false);
    setEditingInstanceDate(undefined);
    setEventModalDate(dateStr || format(calendarDate, 'yyyy-MM-dd'));
    setDefaultStartHour(hour);
    setShowEventModal(true);
  };

  const handleEditEvent = (
    event: CalendarEvent,
    isRecurringInstance: boolean,
    instanceDate: string
  ) => {
    setEditingEvent(event);
    setEditingIsRecurring(isRecurringInstance);
    setEditingInstanceDate(instanceDate);
    setEventModalDate(instanceDate);
    setDefaultStartHour(undefined);
    setShowEventModal(true);
  };

  const handleCloseModal = () => {
    setShowEventModal(false);
    setEditingEvent(undefined);
    setEditingIsRecurring(false);
    setEditingInstanceDate(undefined);
    setDefaultStartHour(undefined);
  };

  const finishOnboarding = async () => {
    setCompleting(true);
    try {
      saveProfile(buildProfilePatch({ onboardingCompleted: true }));
    } finally {
      setCompleting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[var(--background)] flex flex-col">
      <main className="flex-1 overflow-y-auto pb-12">
        <div className="max-w-md mx-auto px-4 py-8">
          <header className="mb-6 flex items-center space-x-3 animate-fade-in">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[var(--accent-primary)] to-[var(--accent-secondary)] flex items-center justify-center shadow-lg">
              <Shield className="text-black" size={20} />
            </div>
            <div>
              <p className="text-xs text-[var(--accent-secondary)] font-bold uppercase tracking-wider">
                Welcome to Prolaesio
              </p>
              <p className="text-[11px] text-gray-400">Let&apos;s get your account set up</p>
            </div>
          </header>

          {step === 1 && (
            <section className="animate-slide-up">
              <StepHeader
                step={1}
                title="Profile Setup"
                subtitle="Tell us a bit about yourself so the guidance can fit you."
              />

              <form onSubmit={handleSubmitStep1} className="space-y-5">
                {/* Birthday */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-1.5">
                    Birthday
                  </label>
                  <div className="flex items-center space-x-3">
                    <input
                      type="date"
                      value={dateOfBirth}
                      onChange={(e) => { setDateOfBirth(e.target.value); setStep1Error(''); }}
                      max={new Date().toISOString().split('T')[0]}
                      className="flex-1 bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-xl p-3 text-white touch-target [color-scheme:dark]"
                    />
                    {computedAge !== null && (
                      <div className="flex-shrink-0 bg-gradient-to-r from-[var(--accent-primary)] to-emerald-500 text-black font-bold px-4 py-2.5 rounded-xl text-sm shadow-md">
                        Age: {computedAge}
                      </div>
                    )}
                  </div>
                </div>

                {/* Height & Weight */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">
                      Height (cm)
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={50}
                      max={260}
                      step="0.1"
                      value={heightCm}
                      onChange={(e) => { setHeightCm(e.target.value); setStep1Error(''); }}
                      placeholder="e.g. 175"
                      className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-xl p-3 text-white touch-target"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-400 mb-1.5">
                      Weight (kg)
                    </label>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={20}
                      max={250}
                      step="0.1"
                      value={weightKg}
                      onChange={(e) => { setWeightKg(e.target.value); setStep1Error(''); }}
                      placeholder="e.g. 68"
                      className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-xl p-3 text-white touch-target"
                    />
                  </div>
                </div>

                {/* Positions */}
                <div>
                  <label className="block text-xs font-medium text-gray-400 mb-2">
                    Position
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {POSITION_OPTIONS.map(pos => (
                      <button
                        type="button"
                        key={pos.id}
                        onClick={() => togglePosition(pos.id as Position)}
                        className={`px-3 py-2 rounded-full text-xs font-bold transition-all touch-target ${
                          positions.includes(pos.id as Position)
                            ? 'bg-gradient-to-r from-[var(--accent-primary)] to-emerald-500 text-black shadow-md'
                            : 'bg-[rgba(255,255,255,0.05)] text-gray-400 hover:text-gray-200 border border-[rgba(255,255,255,0.1)]'
                        }`}
                      >
                        {pos.id} <span className="opacity-70 font-normal">· {pos.label}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Team / coach code */}
                <div className="glass-card p-4">
                  <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-1">
                    Team / Coach Code
                  </h3>
                  <p className="text-[11px] text-gray-400 mb-3 leading-relaxed">
                    Have a code from a coach or team? Link your account so future coach features can connect you. You can skip this for now.
                  </p>

                  {teamConnected ? (
                    <div className="flex items-center justify-between p-3 rounded-xl bg-[rgba(0,212,170,0.1)] border border-[var(--accent-primary)]">
                      <div className="flex items-center space-x-2 min-w-0">
                        <Check className="text-[var(--accent-primary)] flex-shrink-0" size={18} />
                        <div className="min-w-0">
                          <p className="text-xs text-gray-400">Connected with</p>
                          <p className="text-sm font-bold text-white truncate">{teamCode}</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => { setTeamConnected(false); setTeamSkipped(false); }}
                        className="text-[11px] text-gray-300 hover:text-white underline"
                      >
                        Change
                      </button>
                    </div>
                  ) : (
                    <>
                      <input
                        type="text"
                        value={teamCode}
                        onChange={(e) => { setTeamCode(e.target.value); setTeamSkipped(false); }}
                        placeholder="Enter team code"
                        className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-xl p-3 text-white text-sm focus:border-[var(--accent-primary)] focus:outline-none mb-2 touch-target"
                      />
                      <div className="flex space-x-2">
                        <button
                          type="button"
                          onClick={handleConnectTeam}
                          disabled={!teamCode.trim()}
                          className="flex-1 py-2.5 rounded-xl text-xs font-bold bg-[var(--accent-secondary)] text-white shadow disabled:opacity-40 disabled:cursor-not-allowed transition-transform active:scale-95"
                        >
                          Connect
                        </button>
                        <button
                          type="button"
                          onClick={handleNoTeam}
                          className={`flex-1 py-2.5 rounded-xl text-xs font-bold border transition-colors ${
                            teamSkipped
                              ? 'border-[var(--accent-primary)] text-[var(--accent-primary)] bg-[rgba(0,212,170,0.08)]'
                              : 'border-[rgba(255,255,255,0.15)] text-gray-300 hover:border-[var(--accent-primary)]'
                          }`}
                        >
                          No Team
                        </button>
                      </div>
                      {teamSkipped && (
                        <p className="text-[11px] text-gray-500 mt-2">
                          You can add a team code later from your profile.
                        </p>
                      )}
                    </>
                  )}
                </div>

                {step1Error && (
                  <div className="p-3 rounded-xl bg-[rgba(255,107,107,0.1)] border border-[rgba(255,107,107,0.3)] text-[#ff6b6b] text-xs font-medium animate-fade-in">
                    {step1Error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={savingStep1}
                  className="w-full bg-gradient-to-r from-[var(--accent-primary)] to-emerald-500 text-black font-bold py-3.5 rounded-xl shadow-lg flex items-center justify-center transition-transform active:scale-95 disabled:opacity-60"
                >
                  {savingStep1 ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <>
                      Continue <ArrowRight className="ml-2" size={18} />
                    </>
                  )}
                </button>
              </form>
            </section>
          )}

          {step === 2 && (
            <section className="animate-slide-up">
              <StepHeader
                step={2}
                title="Weekly Availability"
                subtitle="When are you usually free for individual sessions? Tap blocks to mark availability."
              />

              <WeeklyAvailabilityGrid value={availability} onChange={setAvailability} />

              <div className="mt-6 flex flex-col space-y-2">
                <button
                  type="button"
                  onClick={handleSaveAvailability}
                  className="w-full bg-gradient-to-r from-[var(--accent-primary)] to-emerald-500 text-black font-bold py-3.5 rounded-xl shadow-lg flex items-center justify-center transition-transform active:scale-95"
                >
                  Save & Continue <ArrowRight className="ml-2" size={18} />
                </button>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="text-xs text-gray-400 hover:text-white flex items-center"
                  >
                    <ArrowLeft size={14} className="mr-1" /> Back
                  </button>
                  <button
                    type="button"
                    onClick={handleSkipAvailability}
                    className="text-xs text-gray-400 hover:text-white flex items-center"
                  >
                    Skip <SkipForward size={14} className="ml-1" />
                  </button>
                </div>
              </div>
            </section>
          )}

          {step === 3 && (
            <section className="animate-slide-up">
              <StepHeader
                step={3}
                title="Training Resources"
                subtitle="What environments do you have access to? We'll use this to tune training recommendations. Pick all that apply."
              />

              <TrainingResourcePicker value={resources} onChange={setResources} />

              <div className="mt-6 flex flex-col space-y-2">
                <button
                  type="button"
                  onClick={handleSaveResources}
                  className="w-full bg-gradient-to-r from-[var(--accent-primary)] to-emerald-500 text-black font-bold py-3.5 rounded-xl shadow-lg flex items-center justify-center transition-transform active:scale-95"
                >
                  Save & Continue <ArrowRight className="ml-2" size={18} />
                </button>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(2)}
                    className="text-xs text-gray-400 hover:text-white flex items-center"
                  >
                    <ArrowLeft size={14} className="mr-1" /> Back
                  </button>
                  <button
                    type="button"
                    onClick={handleSkipResources}
                    className="text-xs text-gray-400 hover:text-white flex items-center"
                  >
                    Skip <SkipForward size={14} className="ml-1" />
                  </button>
                </div>
              </div>
            </section>
          )}

          {step === 4 && (
            <section className="animate-slide-up">
              <StepHeader
                step={4}
                title="Weekly Schedule"
                subtitle="Add your recurring commitments so guidance can plan around them."
              />

              <div className="glass-card p-4 mb-4">
                <h3 className="text-sm font-bold text-white mb-1">Add to your schedule</h3>
                <ul className="text-xs text-gray-300 leading-relaxed space-y-1 list-disc pl-4">
                  <li>Team training sessions</li>
                  <li>Games / matches</li>
                  <li>School hours <span className="text-gray-500">(Optional)</span></li>
                  <li>Work hours <span className="text-gray-500">(Optional)</span></li>
                </ul>
                <p className="text-[11px] text-gray-500 mt-3 leading-relaxed">
                  Example: Team training Monday and Wednesday from 7:00–8:30 PM, games Saturday from 9:00–11:00 AM.
                </p>
              </div>

              <div className="flex justify-between items-center mb-3">
                <button
                  type="button"
                  onClick={() => setCalendarDate(subWeeks(calendarDate, 1))}
                  className="p-2 text-gray-400 hover:text-white touch-target rounded-full bg-[rgba(255,255,255,0.05)]"
                >
                  <ChevronLeft size={18} />
                </button>
                <span className="text-xs font-bold text-white">
                  Week of {format(calendarDate, 'MMM d')}
                </span>
                <button
                  type="button"
                  onClick={() => setCalendarDate(addWeeks(calendarDate, 1))}
                  className="p-2 text-gray-400 hover:text-white touch-target rounded-full bg-[rgba(255,255,255,0.05)]"
                >
                  <ChevronRight size={18} />
                </button>
              </div>

              <button
                type="button"
                onClick={() => handleAddEvent()}
                className="w-full mb-3 flex items-center justify-center py-2.5 rounded-xl bg-[rgba(74,158,255,0.12)] border border-[var(--accent-secondary)] text-[var(--accent-secondary)] font-bold text-xs"
              >
                <Plus size={16} className="mr-1.5" /> Add Recurring Event
              </button>

              <CalendarWeek
                currentDate={calendarDate}
                onAddEvent={handleAddEvent}
                onEditEvent={handleEditEvent}
                onEventLongPress={() => { /* not used in onboarding */ }}
              />

              <p className="text-[11px] text-gray-500 mt-3 text-center">
                {calendarEvents.length === 0
                  ? 'No events yet. You can add some now or skip and add them later.'
                  : `${calendarEvents.length} event${calendarEvents.length === 1 ? '' : 's'} added.`}
              </p>

              <div className="mt-6 flex flex-col space-y-2">
                <button
                  type="button"
                  onClick={finishOnboarding}
                  disabled={completing}
                  className="w-full bg-gradient-to-r from-[var(--accent-primary)] to-emerald-500 text-black font-bold py-3.5 rounded-xl shadow-lg flex items-center justify-center transition-transform active:scale-95 disabled:opacity-60"
                >
                  {completing ? (
                    <Loader2 className="animate-spin" size={20} />
                  ) : (
                    <>
                      Finish Setup <Check className="ml-2" size={18} />
                    </>
                  )}
                </button>
                <div className="flex items-center justify-between">
                  <button
                    type="button"
                    onClick={() => setStep(3)}
                    className="text-xs text-gray-400 hover:text-white flex items-center"
                  >
                    <ArrowLeft size={14} className="mr-1" /> Back
                  </button>
                  <button
                    type="button"
                    onClick={finishOnboarding}
                    disabled={completing}
                    className="text-xs text-gray-400 hover:text-white flex items-center"
                  >
                    Skip <SkipForward size={14} className="ml-1" />
                  </button>
                </div>
              </div>
            </section>
          )}
        </div>
      </main>

      {showEventModal && (
        <EventModal
          onClose={handleCloseModal}
          selectedDate={eventModalDate}
          existingEvent={editingEvent}
          isRecurringInstance={editingIsRecurring}
          instanceDate={editingInstanceDate}
          defaultStartHour={defaultStartHour}
        />
      )}
    </div>
  );
}
