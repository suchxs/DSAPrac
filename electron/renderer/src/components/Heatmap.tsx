import React, { useEffect, useState } from 'react';
import GlassCard from './GlassCard';

interface HeatmapProps {
  activity: Record<string, number>;
}

const Heatmap: React.FC<HeatmapProps> = ({ activity }) => {
  const [currentStreak, setCurrentStreak] = useState(0);
  const [longestStreak, setLongestStreak] = useState(0);
  const scrollContainerRef = React.useRef<HTMLDivElement>(null);

  // Debug: log activity data
  console.log('Heatmap received activity data:', activity);
  console.log('Activity keys:', Object.keys(activity));
  console.log('Activity with counts:', Object.entries(activity).filter(([_, count]) => count > 0));

  useEffect(() => {
    calculateStreaks();
  }, [activity]);

  useEffect(() => {
    // Scroll to show current month on mount
    if (scrollContainerRef.current) {
      const today = new Date();
      const currentMonth = today.getMonth(); // 0-11
      // Each month is roughly 90px wide, scroll to show current month in view
      const scrollPosition = Math.max(0, (currentMonth * 90) - 200); // Offset to center it better
      scrollContainerRef.current.scrollLeft = scrollPosition;
    }
  }, []);

  const generatePastYearDates = (): Date[] => {
    const dates: Date[] = [];
    const today = new Date();
    const currentYear = today.getFullYear();
    
    // Generate dates from January 1 to December 31 of the current year
    const startDate = new Date(currentYear, 0, 1); // January 1st
    const endDate = new Date(currentYear, 11, 31); // December 31st
    
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
      dates.push(new Date(currentDate));
      currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return dates;
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

  const getIntensityStyle = (count: number): React.CSSProperties => {
    if (count === 0) return { backgroundColor: 'rgba(255, 255, 255, 0.05)' };
    if (count <= 2) return { backgroundColor: 'rgba(59, 130, 246, 0.3)' }; // blue-500 with 30% opacity
    if (count <= 5) return { backgroundColor: 'rgba(59, 130, 246, 0.5)' }; // blue-500 with 50% opacity
    if (count <= 10) return { backgroundColor: 'rgba(59, 130, 246, 0.7)' }; // blue-500 with 70% opacity
    return { backgroundColor: 'rgb(59, 130, 246)' }; // blue-500 full
  };

  const calculateStreaks = () => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Calculate current streak (include today if there's activity)
    let current = 0;
    let checkDate = new Date(today);

    // Check if today has activity
    const todayKey = dateKey(today);
    const hasTodayActivity = (activity[todayKey] || 0) > 0;

    // Start checking from today
    while (true) {
      const key = dateKey(checkDate);
      const count = activity[key] || 0;
      
      if (count > 0) {
        current++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        // If this is today and it has no activity, check yesterday
        if (checkDate.getTime() === today.getTime() && !hasTodayActivity) {
          checkDate.setDate(checkDate.getDate() - 1);
          continue;
        }
        // Otherwise, streak is broken
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

    // Make sure current streak doesn't exceed longest
    longest = Math.max(longest, current);

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

    // Calculate month positions based on actual week data
    const monthPositions: { month: string; position: number }[] = [];
    let currentMonth = -1;
    weeks.forEach((week, weekIdx) => {
      const firstDate = week.find(d => d.getMonth() !== currentMonth);
      if (firstDate && firstDate.getMonth() !== currentMonth) {
        currentMonth = firstDate.getMonth();
        const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
        monthPositions.push({ month: monthNames[currentMonth], position: weekIdx });
      }
    });

    return (
      <>
        {/* Month labels positioned above actual weeks */}
        <div className="flex gap-1 text-xs opacity-60 mb-3" style={{ position: 'relative', height: '20px' }}>
          {monthPositions.map(({ month, position }) => (
            <span 
              key={month} 
              style={{ 
                position: 'absolute',
                left: `${position * 16}px`, // position * (12px square + 4px gap)
                minWidth: '30px',
                top: 0
              }}
            >
              {month}
            </span>
          ))}
        </div>

        {/* Week columns */}
        <div className="flex gap-1">
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
                
                // Get Tailwind background class based on activity count
                let bgClass = 'bg-white/5'; // No activity
                if (count > 0 && count <= 2) bgClass = 'bg-blue-500/30';
                else if (count > 2 && count <= 5) bgClass = 'bg-blue-500/50';
                else if (count > 5 && count <= 10) bgClass = 'bg-blue-500/70';
                else if (count > 10) bgClass = 'bg-blue-500';
                
                // Debug logging
                if (count > 0) {
                  console.log(`Date: ${key}, Count: ${count}, Class: ${bgClass}`);
                }
                
                return (
                  <div
                    key={key}
                    className={`w-3 h-3 rounded-sm transition-all hover:ring-2 hover:ring-white/50 cursor-pointer ${bgClass}`}
                    title={`${key}: ${count} activities`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </>
    );
  };

  return (
    <div className="mt-8">
      <GlassCard className="p-6">
        <div className="flex items-center justify-between mb-6 flex-wrap gap-4">
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

        {/* Heatmap Grid - Full width scrollable */}
        <div className="flex gap-1">
          {/* Day labels - Always visible (sticky) */}
          <div className="flex flex-col text-xs opacity-60 pr-2" style={{ minWidth: '48px' }}>
            {/* Spacer for month labels - exact match */}
            <div className="mb-3" style={{ height: '20px' }}></div>
            {/* Day labels aligned with squares */}
            <div className="flex flex-col gap-1">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                <div key={day} className="h-3 flex items-center">
                  {day}
                </div>
              ))}
            </div>
          </div>

          {/* Scrollable heatmap area */}
          <div 
            ref={scrollContainerRef}
            className="overflow-x-auto overflow-y-hidden pb-2 flex-1" 
            style={{ 
              maxWidth: 'calc(100% - 56px)',
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(255, 255, 255, 0.3) transparent'
            }}
          >
            <div style={{ minWidth: '800px', width: 'fit-content' }}>
              {renderHeatmap()}
            </div>
          </div>
        </div>
        
        {/* Legend - Always visible, outside scrollable area */}
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
      </GlassCard>
    </div>
  );
};

export default Heatmap;
