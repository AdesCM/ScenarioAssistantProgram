import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useUniverse } from '../contexts/UniverseContext';
import { Plus, X, Users, MapPin, FileText, Clock, Download, Sparkles } from 'lucide-react';
import AIToolsModal from '../components/AIToolsModal';

const UniverseDashboard: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { universes, addCharacter, addLocation, addPlot, deleteCharacter, deleteLocation, deletePlot } = useUniverse();
  
  const universe = universes.find(u => u.id === id);
  const [activeTab, setActiveTab] = useState<'plots' | 'characters' | 'locations'>('plots');
  const [showAI, setShowAI] = useState(false);

  if (!universe) {
    return <div className="p-8">세계관을 찾을 수 없습니다.</div>;
  }

  const handleAddItem = () => {
    if (activeTab === 'characters') addCharacter(universe.id);
    if (activeTab === 'locations') addLocation(universe.id);
    if (activeTab === 'plots') addPlot(universe.id);
  };

  const getItems = () => {
    if (activeTab === 'characters') return universe.characters;
    if (activeTab === 'locations') return universe.locations;
    return universe.plots;
  };

  const handleDelete = (itemId: string) => {
    if (window.confirm('정말 삭제하시겠습니까?')) {
      if (activeTab === 'characters') deleteCharacter(universe.id, itemId);
      if (activeTab === 'locations') deleteLocation(universe.id, itemId);
      if (activeTab === 'plots') deletePlot(universe.id, itemId);
    }
  };

  const handleEdit = (itemId: string) => {
    if (activeTab === 'characters') navigate(`/universe/${universe.id}/character/${itemId}`);
    if (activeTab === 'locations') navigate(`/universe/${universe.id}/location/${itemId}`);
    if (activeTab === 'plots') navigate(`/universe/${universe.id}/plot/${itemId}`);
  };

  const items = getItems();

  return (
    <>
    <div className="flex w-full h-full">
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-[#1e293b] flex flex-col transition-colors">
        <div className="p-4 border-b border-slate-200 dark:border-slate-800">
          <h2 className="font-bold text-lg text-slate-800 dark:text-slate-100 truncate">{universe.name}</h2>
          <p className="text-xs text-slate-500 mt-1">대시보드</p>
        </div>
        <nav className="flex-1 p-4 space-y-2">
          <button 
            onClick={() => setActiveTab('plots')}
            className={`w-full flex items-center gap-3 text-left px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'plots' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
          >
            <FileText size={18} /> 플롯
          </button>
          <button 
            onClick={() => setActiveTab('characters')}
            className={`w-full flex items-center gap-3 text-left px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'characters' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
          >
            <Users size={18} /> 등장인물
          </button>
          <button 
            onClick={() => setActiveTab('locations')}
            className={`w-full flex items-center gap-3 text-left px-4 py-3 rounded-lg font-medium transition-colors ${activeTab === 'locations' ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' : 'hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300'}`}
          >
            <MapPin size={18} /> 장소/배경
          </button>
          <button 
            onClick={() => navigate(`/universe/${universe.id}/timeline`)}
            className="w-full flex items-center gap-3 text-left px-4 py-3 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 font-medium transition-colors"
          >
            <Clock size={18} /> 타임라인(사건)
          </button>
        </nav>
        <div className="p-4 border-t border-slate-200 dark:border-slate-800 space-y-2">
           <button
             onClick={() => setShowAI(true)}
             className="w-full flex justify-center items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white rounded-lg text-sm font-bold transition-all shadow-md hover:shadow-indigo-500/30 hover:scale-[1.02]"
           >
             <Sparkles size={16} /> AI 도구
           </button>
           <button 
             className="w-full flex justify-center items-center gap-2 px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-lg text-sm font-medium transition-colors"
           >
             <Download size={16} /> JSON 데이터 관리
           </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <section className="flex-1 p-8 overflow-y-auto bg-slate-50 dark:bg-[#0f172a] transition-colors">
        <div className="max-w-6xl mx-auto">
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-2xl font-bold text-slate-800 dark:text-white">
              {activeTab === 'characters' ? '등장인물 관리' : activeTab === 'locations' ? '장소/배경 관리' : '플롯 관리'}
            </h2>
            <button 
              onClick={handleAddItem}
              className="px-4 py-2 bg-slate-800 hover:bg-slate-700 dark:bg-indigo-500 dark:hover:bg-indigo-600 text-white rounded-lg flex items-center gap-2 text-sm font-medium transition-colors shadow-sm"
            >
              <Plus size={18} /> 
              {activeTab === 'characters' ? '새 캐릭터 만들기' : activeTab === 'locations' ? '새 장소 만들기' : '새 플롯 만들기'}
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {items.map(item => (
              <div 
                key={item.id} 
                onClick={() => handleEdit(item.id)}
                className="group relative h-32 p-5 bg-white dark:bg-[#1e293b] border border-slate-200 dark:border-slate-700 rounded-xl cursor-pointer hover:shadow-md dark:hover:border-slate-600 transition-all flex flex-col justify-center"
              >
                <div className="absolute top-3 right-3 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button 
                    onClick={(e) => { e.stopPropagation(); handleDelete(item.id); }}
                    className="p-1.5 bg-slate-100 hover:bg-red-100 text-slate-500 hover:text-red-500 dark:bg-slate-800 dark:hover:bg-red-900/30 dark:text-slate-400 dark:hover:text-red-400 rounded-md transition-colors"
                  >
                    <X size={16} />
                  </button>
                </div>
                <h3 className="font-bold text-lg text-slate-800 dark:text-slate-200 mb-2 truncate">
                  {item.name}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  마지막 수정: {item.lastEdited}
                </p>
              </div>
            ))}
            
            {/* Add New Item Card */}
            <div 
              onClick={handleAddItem}
              className="h-32 rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 flex items-center justify-center cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-800/50 transition-colors group"
            >
              <div className="w-12 h-12 rounded-full flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:bg-blue-100 group-hover:text-blue-500 dark:group-hover:bg-blue-900/30 dark:group-hover:text-blue-400 transition-colors">
                <Plus size={24} />
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
      {showAI && <AIToolsModal universe={universe} onClose={() => setShowAI(false)} />}
    </>
  );
};

export default UniverseDashboard;
