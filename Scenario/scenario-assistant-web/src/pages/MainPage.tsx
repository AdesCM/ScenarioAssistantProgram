import React from 'react';
import { useNavigate } from 'react-router-dom';
import { useUniverse } from '../contexts/UniverseContext';
import type { Universe } from '../contexts/UniverseContext';
import { Globe, Plus, Trash2 } from 'lucide-react';

const UniverseCard: React.FC<{ universe: Universe }> = ({ universe }) => {
  const { deleteUniverse } = useUniverse();
  const navigate = useNavigate();

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (window.confirm(`'${universe.name}' 세계관을 정말 삭제하시겠습니까?`)) {
      deleteUniverse(universe.id);
    }
  };

  const handleEdit = () => {
    navigate(`/universe/${universe.id}`);
  };

  return (
    <div className="w-[370px] h-[180px] p-4 flex flex-col justify-between rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-[#1e293b] shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex gap-4">
          <div className="w-12 h-12 flex items-center justify-center rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400">
            <Globe size={24} />
          </div>
          <div className="flex flex-col">
            <h3 className="text-xl font-bold text-slate-800 dark:text-slate-100 truncate w-[200px]">
              {universe.name}
            </h3>
            <span className="text-sm text-slate-500 dark:text-slate-400">
              최종 수정: {universe.lastEditedBy}
            </span>
          </div>
        </div>
        <button 
          onClick={handleDelete}
          className="p-2 text-slate-400 hover:text-red-500 hover:bg-slate-50 dark:hover:bg-slate-800 rounded-full transition-colors"
          title="삭제"
        >
          <Trash2 size={20} />
        </button>
      </div>

      <div className="text-sm text-slate-600 dark:text-slate-400 font-medium">
        플롯: {universe.plots.length} &nbsp;|&nbsp; 캐릭터: {universe.characters.length} &nbsp;|&nbsp; 장소: {universe.locations.length}
      </div>

      <button
        onClick={handleEdit}
        className="w-full py-2 bg-slate-800 hover:bg-slate-700 dark:bg-slate-700 dark:hover:bg-slate-600 text-white rounded-lg font-medium transition-colors"
      >
        편집하기
      </button>
    </div>
  );
};

const AddUniverseCard: React.FC = () => {
  const { addUniverse } = useUniverse();

  return (
    <div 
      onClick={addUniverse}
      className="w-[370px] h-[180px] cursor-pointer rounded-xl border-dashed border-2 border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-[#0f172a] hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex flex-col items-center justify-center gap-2 group"
    >
      <div className="p-3 rounded-full bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-400 group-hover:bg-blue-50 dark:group-hover:bg-blue-900/30 group-hover:text-blue-500 dark:group-hover:text-blue-400 transition-colors">
        <Plus size={32} />
      </div>
      <span className="text-slate-600 dark:text-slate-400 font-medium">새로운 세계관 만들기</span>
    </div>
  );
};

const MainPage: React.FC = () => {
  const { universes } = useUniverse();

  return (
    <div className="p-8 w-full overflow-y-auto">
      <div className="flex flex-wrap gap-6 max-w-7xl mx-auto">
        {universes.map(uni => (
          <UniverseCard key={uni.id} universe={uni} />
        ))}
        <AddUniverseCard />
      </div>
    </div>
  );
};

export default MainPage;
