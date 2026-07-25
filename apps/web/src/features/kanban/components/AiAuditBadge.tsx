import React from 'react';

interface AiAuditBadgeProps {
  confidence?: number | null;
}

export const AiAuditBadge: React.FC<AiAuditBadgeProps> = ({ confidence }) => {
  if (confidence == null) return null;

  const colorClass = confidence >= 0.8 
    ? "bg-green-100 text-green-700" 
    : confidence >= 0.5 
      ? "bg-yellow-100 text-yellow-700" 
      : "bg-red-100 text-red-700";

  return (
    <div className={`flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-bold ${colorClass}`} title="Confianza de la IA al extraer esta tarea">
      AI: {Math.round(confidence * 100)}%
    </div>
  );
};
