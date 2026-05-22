'use client';

import React, { useState, useEffect } from 'react';
import { useData } from '../lib/DataContext';
import { UserProfile, Position, Priority } from '../lib/types';
import { Save } from 'lucide-react';
import { differenceInYears, parseISO } from 'date-fns';

export function ProfileForm() {
  const { profile, saveProfile } = useData();

  const [dateOfBirth, setDateOfBirth] = useState<string>('');
  const [heightCm, setHeightCm] = useState<string>('');
  const [weightKg, setWeightKg] = useState<string>('');
  const [teamCode, setTeamCode] = useState<string>('');
  const [positions, setPositions] = useState<Position[]>([]);
  const [priorities, setPriorities] = useState<Priority[]>([]);
  const [error, setError] = useState<string>('');

  const availablePositions: Position[] = ['GK', 'CB', 'FB', 'CM', 'AM', 'W', 'ST'];
  const availablePriorities: Priority[] = [
    'Speed', 'Acceleration', 'Finishing', 'Dribbling', 'Control', 
    'Passing', 'Reflexes', 'Decision-making', 'Stamina', 'Strength'
  ];

  useEffect(() => {
    if (profile) {
      setDateOfBirth(profile.dateOfBirth || '');
      setHeightCm(profile.heightCm != null ? String(profile.heightCm) : '');
      setWeightKg(profile.weightKg != null ? String(profile.weightKg) : '');
      setTeamCode(profile.teamCode || '');
      setPositions(profile.positions);
      setPriorities(profile.priorities);
    }
  }, [profile]);

  const computedAge = dateOfBirth
    ? differenceInYears(new Date(), parseISO(dateOfBirth))
    : null;

  const togglePosition = (pos: Position) => {
    if (positions.includes(pos)) {
      setPositions(positions.filter(p => p !== pos));
    } else {
      setPositions([...positions, pos]);
    }
  };

  const togglePriority = (pri: Priority) => {
    if (priorities.includes(pri)) {
      setPriorities(priorities.filter(p => p !== pri));
    } else {
      setPriorities([...priorities, pri]);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!dateOfBirth) {
      setError('Please enter your date of birth.');
      return;
    }

    if (computedAge === null || computedAge < 1 || computedAge > 99) {
      setError('Please enter a valid date of birth (age must be between 1 and 99).');
      return;
    }

    const heightNum = heightCm ? Number(heightCm) : undefined;
    if (heightCm && (Number.isNaN(heightNum!) || heightNum! <= 0 || heightNum! > 260)) {
      setError('Please enter a valid height in centimeters.');
      return;
    }

    const weightNum = weightKg ? Number(weightKg) : undefined;
    if (weightKg && (Number.isNaN(weightNum!) || weightNum! <= 0 || weightNum! > 250)) {
      setError('Please enter a valid weight in kilograms.');
      return;
    }

    const next: UserProfile = {
      ...profile,
      age: computedAge,
      dateOfBirth,
      positions,
      priorities,
      heightCm: heightNum,
      weightKg: weightNum,
      teamCode: teamCode.trim() || undefined,
      availability: profile?.availability,
      trainingResources: profile?.trainingResources,
      onboardingCompleted: profile?.onboardingCompleted ?? true,
    };
    saveProfile(next);
    alert('Profile saved successfully');
  };

  // Format DOB for display
  const formattedDOB = dateOfBirth
    ? parseISO(dateOfBirth).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })
    : '';

  return (
    <form onSubmit={handleSubmit} className="glass-card p-5 mt-6 animate-slide-up">
      <h3 className="text-[var(--accent-primary)] font-bold uppercase tracking-wider text-xs mb-4">Player Profile</h3>
      
      <div className="mb-6">
        <label className="block text-xs font-medium text-gray-400 mb-2">Date of Birth</label>
        <div className="flex items-center space-x-4">
          <input 
            type="date" 
            value={dateOfBirth}
            onChange={(e) => { setDateOfBirth(e.target.value); setError(''); }}
            max={new Date().toISOString().split('T')[0]}
            className="flex-1 bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-lg p-3 text-white touch-target [color-scheme:dark]"
          />
          {computedAge !== null && (
            <div className="flex-shrink-0 bg-gradient-to-r from-[var(--accent-primary)] to-emerald-500 text-black font-bold px-4 py-2.5 rounded-xl text-sm shadow-md">
              Age: {computedAge}
            </div>
          )}
        </div>
        {formattedDOB && (
          <p className="text-xs text-gray-500 mt-1.5">{formattedDOB}</p>
        )}
      </div>

      {/* Height & Weight */}
      <div className="mb-6 grid grid-cols-2 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-2">Height (cm)</label>
          <input
            type="number"
            inputMode="decimal"
            min={50}
            max={260}
            step="0.1"
            value={heightCm}
            onChange={(e) => { setHeightCm(e.target.value); setError(''); }}
            placeholder="e.g. 175"
            className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-lg p-3 text-white touch-target"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-400 mb-2">Weight (kg)</label>
          <input
            type="number"
            inputMode="decimal"
            min={20}
            max={250}
            step="0.1"
            value={weightKg}
            onChange={(e) => { setWeightKg(e.target.value); setError(''); }}
            placeholder="e.g. 68"
            className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-lg p-3 text-white touch-target"
          />
        </div>
      </div>

      {/* Team / Coach Code */}
      <div className="mb-6">
        <label className="block text-xs font-medium text-gray-400 mb-2">
          Team / Coach Code <span className="text-gray-600">(optional)</span>
        </label>
        <input
          type="text"
          value={teamCode}
          onChange={(e) => setTeamCode(e.target.value)}
          placeholder="Enter team code"
          className="w-full bg-[rgba(255,255,255,0.05)] border border-[rgba(255,255,255,0.1)] rounded-lg p-3 text-white text-sm touch-target"
        />
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-xl bg-[rgba(255,107,107,0.1)] border border-[rgba(255,107,107,0.3)] text-[#ff6b6b] text-xs font-medium animate-fade-in">
          {error}
        </div>
      )}

      <div className="mb-6">
        <label className="block text-xs font-medium text-gray-400 mb-2">Positions Played</label>
        <div className="flex flex-wrap gap-2">
          {availablePositions.map(pos => (
            <button
              type="button"
              key={pos}
              onClick={() => togglePosition(pos)}
              className={`px-3 py-2 rounded-full text-xs font-bold transition-all touch-target ${
                positions.includes(pos)
                  ? 'bg-[var(--accent-secondary)] text-white shadow-md'
                  : 'bg-[rgba(255,255,255,0.05)] text-gray-400 hover:text-gray-200'
              }`}
            >
              {pos}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-6">
        <label className="block text-xs font-medium text-gray-400 mb-2">Development Priorities</label>
        <div className="flex flex-wrap gap-2">
          {availablePriorities.map(pri => (
            <button
              type="button"
              key={pri}
              onClick={() => togglePriority(pri)}
              className={`px-3 py-2 rounded-full text-xs font-bold transition-all touch-target ${
                priorities.includes(pri)
                  ? 'bg-gradient-to-r from-[var(--accent-primary)] to-emerald-500 text-black shadow-md'
                  : 'bg-[rgba(255,255,255,0.05)] text-gray-400 hover:text-gray-200'
              }`}
            >
              {pri}
            </button>
          ))}
        </div>
      </div>

      <button 
        type="submit" 
        className="w-full bg-gradient-to-r from-[var(--accent-primary)] to-emerald-500 text-black font-bold py-4 rounded-xl shadow-lg flex items-center justify-center touch-target transition-transform active:scale-95"
      >
        <Save className="mr-2" size={20} /> Save Profile
      </button>
    </form>
  );
}
