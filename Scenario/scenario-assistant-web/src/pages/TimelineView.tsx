import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useUniverse } from '../contexts/UniverseContext';
import type { TimelineEvent } from '../contexts/UniverseContext';
import { ArrowLeft, Clock, Plus, Trash2, Filter } from 'lucide-react';

const TimelineView: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { universes, addTimelineEvent, deleteTimelineEvent } = useUniverse();

  const universe = universes.find(u => u.id === id);

  const [showPlots, setShowPlots] = useState(true);
  const [showCharacters, setShowCharacters] = useState(true);

  if (!universe) return <div className="p-8">세계관을 찾을 수 없습니다.</div>;

  const events = universe.timeline
    .filter(e => {
      if (e.type === 'plot' && !showPlots) return false;
      if (e.type === 'character' && !showCharacters) return false;
      return true;
    })
    .sort((a, b) => {
      if (a.year !== b.year) return a.year - b.year;
      const m1 = a.month || 0;
      const m2 = b.month || 0;
      if (m1 !== m2) return m1 - m2;
      const d1 = a.day || 0;
      const d2 = b.day || 0;
      return d1 - d2;
    });

  // Group by year
  const groupedEvents = events.reduce((acc, event) => {
    if (!acc[event.year]) acc[event.year] = [];
    acc[event.year].push(event);
    return acc;
  }, {} as Record<number, TimelineEvent[]>);

  const years = Object.keys(groupedEvents).map(Number).sort((a, b) => a - b);

  const handleAddEvent = () => {
    const title = prompt('타임라인 이벤트 제목을 입력하세요:');
    if (!title) return;
    const yearStr = prompt('연도를 입력하세요 (예: 2024):', '2024');
    if (!yearStr) return;
    const year = parseInt(yearStr);
    const description = prompt('설명을 입력하세요:', '') || '';
    
    addTimelineEvent(universe.id, {
      title,
      description,
      year: isNaN(year) ? 0 : year,
      type: 'plot'
    });
  };

  return (
    <div className="flex flex-col w-full h-full bg-slate-50 dark:bg-[#0f172a]">
      {/* Header */}
      <header className="flex shrink-0 h-16 items-center justify-between px-6 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1e293b]">
        <div className="flex items-center gap-4">
          <button 
            onClick={() => navigate(`/universe/${universe.id}`)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"
          >
            <ArrowLeft size={20} />
          </button>
          <div className="flex items-center gap-2">
            <Clock size={20} className="text-slate-500" />
            <h2 className="text-lg font-bold">타임라인 ({universe.name})</h2>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input type="checkbox" checked={showPlots} onChange={e => setShowPlots(e.target.checked)} className="rounded" />
            <span className="text-blue-600 dark:text-blue-400">플롯</span>
          </label>
          <label className="flex items-center gap-2 text-sm font-medium cursor-pointer">
            <input type="checkbox" checked={showCharacters} onChange={e => setShowCharacters(e.target.checked)} className="rounded" />
            <span className="text-orange-600 dark:text-orange-400">캐릭터</span>
          </label>
          <button 
            onClick={handleAddEvent}
            className="flex items-center gap-2 px-4 py-2 bg-slate-800 hover:bg-slate-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-lg transition-colors text-sm font-medium"
          >
            <Plus size={16} /> 새 이벤트
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 overflow-y-auto p-8 relative">
        <div className="max-w-4xl mx-auto py-8">
          {events.length === 0 ? (
            <div className="text-center p-8 text-slate-500 dark:text-slate-400 flex flex-col items-center">
              <Filter size={48} className="mb-4 opacity-50" />
              <p>표시할 타임라인 이벤트가 없습니다.</p>
            </div>
          ) : (
            <div className="relative border-l-2 border-slate-200 dark:border-slate-800 ml-4 md:ml-0 md:pl-0 space-y-12">
              {years.map(year => (
                <div key={year} className="relative">
                  {/* Year marker */}
                  <div className="sticky top-0 z-10 w-full mb-4 md:-ml-[17px] flex items-center">
                    <div className="w-8 h-8 rounded-full bg-slate-800 dark:bg-slate-700 text-white flex items-center justify-center font-bold text-sm shadow-md border-4 border-white dark:border-[#0f172a]">
                      {year}
                    </div>
                  </div>
                  
                  {/* Events for this year */}
                  <div className="space-y-6 md:pl-10 pl-6">
                    {groupedEvents[year].map(event => (
                      <div 
                        key={event.id}
                        className={`p-5 rounded-xl border relative group shadow-sm transition-shadow hover:shadow-md ${
                          event.type === 'plot' 
                            ? 'bg-blue-50/50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-900/50' 
                            : 'bg-orange-50/50 dark:bg-orange-900/10 border-orange-200 dark:border-orange-900/50'
                        }`}
                      >
                        <div className="absolute right-4 top-4 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={() => {
                              if (window.confirm('정말 삭제하시겠습니까?')) {
                                deleteTimelineEvent(universe.id, event.id);
                              }
                            }}
                            className="p-1 text-slate-400 hover:text-red-500 rounded transition-colors"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                        
                        <div className="flex gap-2 items-center mb-2">
                          <span className={`text-xs font-bold px-2 py-1 rounded-md ${
                            event.type === 'plot' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300' : 'bg-orange-100 text-orange-700 dark:bg-orange-900/40 dark:text-orange-300'
                          }`}>
                            {event.type === 'plot' ? '플롯' : '캐릭터'}
                          </span>
                          <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                            {event.month ? `${event.month}월 ` : ''}{event.day ? `${event.day}일` : ''}
                          </span>
                        </div>
                        
                        <h3 className={`text-lg font-bold mb-1 ${
                          event.type === 'plot' ? 'text-blue-900 dark:text-blue-100' : 'text-orange-900 dark:text-orange-100'
                        }`}>
                          {event.title}
                        </h3>
                        
                        {event.description && (
                          <p className="text-slate-600 dark:text-slate-400 text-sm mt-2 whitespace-pre-wrap">
                            {event.description}
                          </p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
};

export default TimelineView;
