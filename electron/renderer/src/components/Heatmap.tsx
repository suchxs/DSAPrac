import React, { useEffect, useState } from 'react';
import GlassCard from './GlassCard';

interface HeatmapProps {
  activity: Record<string, number>;
}

const Heatmap: React.FC<HeatmapProps> = ({ activity }) => {
  const [currentStreak, setCurrentStreak] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);

  useEffect(() => {
    calculateStreaks();
  }, [activity]);

  const generatePastYearDates = (): Date[] => {
    const dates: Date[] = [];
    const today = new Date();
    for (let i = 0; i < 365; i++) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      dates.push(d);
    }
    return dates.reverse();
  };

  const dateKey = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };

  const intensity = (count: number): string => {
    if (count === 0) return 'bg-white/5';
    if (count <= 2) return 'bg-blue-500/30';
    if (count <= 5) return 'bg-blue-500/50';
    if (count <= 10) return 'bg-blue-500/70';
    return 'bg-blue-500';
  };

  const calculateStreaks = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calculate current streak
    let current = 0;
    let checkDate = new Date(today);

    while (true) {
      const key = dateKey(checkDate);
      const count = activity[key] || 0;
      if (count > 0) {
        current++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        if (current === 0 && checkDate.getTime() === today.getTime()) {
          checkDate.setDate(checkDate.getDate() - 1);
          continue;
        }
        break;
      }
    }

    // Calculate longest streak
    const dates = generatePastYearDates();
    let longest = 0;
    let tempStreak = 0;

    dates.forEach((date) => {
      const key = dateKey(date);
      const count = activity[key] || 0;
      if (count > 0) {
        tempStreak++;
        longest = Math.max(longest, tempStreak);
      } else {
        tempStreak = 0;
      }
    });

    setCurrentStreak(current);
    setLongestStreak(longest);
  };

  const renderHeatmap = () => {
    const dates = generatePastYearDates();
    const weeks: Date[][] = [];
    let currentWeek: Date[] = [];

    dates.forEach((date, i) => {
      const dayOfWeek = date.getDay();
      if (i > 0 && dayOfWeek === 0) {
        weeks.push(currentWeek);
        currentWeek = [];
      }
      currentWeek.push(date);
    });
    if (currentWeek.length > 0) weeks.push(currentWeek);

    return (
      <div className="flex gap-1">
        {/* Day labels */}
        <div className="flex flex-col gap-1 text-xs opacity-60 pr-2">
          {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
            <div key={day} className="h-3 flex items-center">
              {day}
            </div>
          ))}
        </div>

        {/* Week columns */}
        {weeks.map((week, weekIdx) => (
          <div key={weekIdx} className="flex flex-col gap-1">
            {/* Fill empty days at start of week */}
            {weekIdx === 0 &&
              Array.from({ length: week[0].getDay() }).map((_, i) => (
                <div key={`empty-${i}`} className="w-3 h-3" />
              ))}

            {week.map((date) => {
              const key = dateKey(date);
              const count = activity[key] || 0;
              return (
                <div
                  key={key}
                  className={`w-3 h-3 rounded-sm ${intensity(
                    count
                  )} transition-all hover:ring-2 hover:ring-white/50 cursor-pointer`}
                  title={`${key}: ${count} activities`}
                />
              );
            })}
          </div>
        ))}
      </div>
    );
  };

  return (
    <div className="mt-6">
      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-semibold mb-1">Practice Activity</h2>
            <p className="text-sm opacity-80">Keep your streak going!</p>
          </div>
          <div className="flex gap-6">
            <div className="text-center">
              <div className="text-2xl font-bold text-blue-400">{currentStreak}</div>
              <div className="text-xs opacity-70 mt-1">Current Streak</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold" style={{ color: '#9dfaf8' }}>
                {longestStreak}
              </div>
              <div className="text-xs opacity-70 mt-1">Longest Streak</div>
            </div>
          </div>
        </div>

        {/* Heatmap Grid */}
        <div className="overflow-x-auto">
          <div className="inline-block min-w-full">
            <div className="flex gap-1 text-xs opacity-60 mb-2 pl-8">
              {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'].map(
                (month) => (
                  <span key={month} className="flex-1 text-center">
                    {month}
                  </span>
                )
              )}
            </div>
            {renderHeatmap()}
            <div className="flex items-center gap-2 mt-4 text-xs opacity-70">
              <span>Less</span>
              <div className="flex gap-1">
                <div className="w-3 h-3 rounded-sm bg-white/5"></div>
                <div className="w-3 h-3 rounded-sm bg-blue-500/30"></div>
                <div className="w-3 h-3 rounded-sm bg-blue-500/50"></div>
                <div className="w-3 h-3 rounded-sm bg-blue-500/70"></div>
                <div className="w-3 h-3 rounded-sm bg-blue-500"></div>
              </div>
              <span>More</span>
            </div>
          </div>
        </div>
      </GlassCard>
    </div>
  );
};

export default Heatmap;
