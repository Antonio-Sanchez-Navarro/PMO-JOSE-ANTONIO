import React, { useState, useEffect, useMemo, useRef } from 'react';
import { getTimeReport, TimeReportResult } from '../api/time.api';
import { toast } from 'sonner';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';

interface TimeReportModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TimeReportModal: React.FC<TimeReportModalProps> = ({ isOpen, onClose }) => {
  const [groupBy, setGroupBy] = useState<'task' | 'day' | 'week'>('day');
  const [reportData, setReportData] = useState<TimeReportResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const generationRef = useRef(0);

  useEffect(() => {
    if (isOpen) {
      loadReport();
    }
  }, [isOpen, groupBy]);

  const loadReport = async () => {
    const currentGen = ++generationRef.current;
    setIsLoading(true);
    try {
      const data = await getTimeReport({ groupBy });
      if (currentGen !== generationRef.current) return;
      setReportData(data);
    } catch {
      if (currentGen !== generationRef.current) return;
      toast.error('Error al cargar el reporte');
    } finally {
      if (currentGen === generationRef.current) {
        setIsLoading(false);
      }
    }
  };

  const formatHours = (seconds: number) => (seconds / 3600).toFixed(2);

  const chartData = useMemo(() => {
    if (!reportData) return [];
    return reportData.rows.map(row => ({
      name: row.label,
      hours: parseFloat(formatHours(row.seconds))
    }));
  }, [reportData]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
      <div className="w-full max-w-4xl bg-white shadow-2xl rounded-2xl dark:bg-slate-800 ring-1 ring-slate-900/5 overflow-hidden flex flex-col h-[80vh]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 flex-shrink-0">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-800 dark:text-white flex items-center gap-2">
              <span>📊</span> Reporte de Tiempos
            </h2>
            <button onClick={onClose} className="text-slate-400 hover:text-slate-500 dark:hover:text-slate-300">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 custom-scrollbar flex flex-col">
          
          <div className="flex items-center justify-between mb-6">
            <div className="flex bg-slate-100 p-1 rounded-lg dark:bg-slate-900">
              <button
                onClick={() => setGroupBy('day')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${groupBy === 'day' ? 'bg-white shadow-sm text-indigo-600 dark:bg-slate-800 dark:text-indigo-400' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'}`}
              >
                Por Día
              </button>
              <button
                onClick={() => setGroupBy('week')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${groupBy === 'week' ? 'bg-white shadow-sm text-indigo-600 dark:bg-slate-800 dark:text-indigo-400' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'}`}
              >
                Por Semana
              </button>
              <button
                onClick={() => setGroupBy('task')}
                className={`px-4 py-1.5 text-sm font-medium rounded-md transition ${groupBy === 'task' ? 'bg-white shadow-sm text-indigo-600 dark:bg-slate-800 dark:text-indigo-400' : 'text-slate-600 hover:text-slate-900 dark:text-slate-400'}`}
              >
                Por Tarea
              </button>
            </div>
            
            {reportData && (
              <div className="text-right">
                <p className="text-sm text-slate-500 font-medium">Total Registrado</p>
                <p className="text-xl font-bold text-slate-800 dark:text-slate-100">
                  {formatHours(reportData.totalSec)} <span className="text-sm font-normal text-slate-500">horas</span>
                </p>
              </div>
            )}
          </div>

          <div className="flex-1 bg-slate-50 dark:bg-slate-900/50 rounded-xl border border-slate-200 dark:border-slate-700 p-4 min-h-[300px]">
            {isLoading ? (
              <div className="h-full flex items-center justify-center text-slate-500">Cargando reporte...</div>
            ) : chartData.length === 0 ? (
              <div className="h-full flex items-center justify-center text-slate-500">No hay datos para mostrar</div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={chartData} margin={{ top: 20, right: 30, left: 20, bottom: 60 }}>
                  <CartesianGrid strokeDasharray="3 3" opacity={0.3} />
                  <XAxis 
                    dataKey="name" 
                    tick={{ fontSize: 12 }} 
                    interval={0} 
                    angle={-45} 
                    textAnchor="end" 
                    height={80}
                  />
                  <YAxis 
                    label={{ value: 'Horas', angle: -90, position: 'insideLeft', style: { textAnchor: 'middle' } }} 
                  />
                  <Tooltip 
                    cursor={{ fill: 'rgba(0,0,0,0.05)' }} 
                    contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                  />
                  <Bar dataKey="hours" name="Horas Trabajadas" radius={[4, 4, 0, 0]}>
                    {chartData.map((_entry, index) => (
                      <Cell key={`cell-${index}`} fill="#6366f1" />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
