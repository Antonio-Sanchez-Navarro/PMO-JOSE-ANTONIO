import React, { useState } from 'react';

export interface DraftEmailData {
  id: string;
  to: string;
  subject: string;
  body: string;
}

interface DraftEmailCardProps {
  draft: DraftEmailData;
}

export const DraftEmailCard: React.FC<DraftEmailCardProps> = ({ draft }) => {
  const [isEditing, setIsEditing] = useState(false);
  const [emailData, setEmailData] = useState(draft);
  const [status, setStatus] = useState<'idle' | 'sending' | 'sent' | 'discarded'>('idle');

  const handleSend = () => {
    setStatus('sending');
    // TODO: wire up with real backend API
    setTimeout(() => {
      setStatus('sent');
    }, 1500);
  };

  const handleDiscard = () => {
    setStatus('discarded');
    // TODO: trigger event back to chat to request rewrite
  };

  if (status === 'discarded') {
    return (
      <div className="bg-red-50 text-red-700 text-xs px-3 py-2 rounded-md border border-red-100 flex items-center gap-2">
        <span>❌</span> Borrador descartado
      </div>
    );
  }

  if (status === 'sent') {
    return (
      <div className="bg-green-50 text-green-700 text-xs px-3 py-2 rounded-md border border-green-100 flex items-center gap-2">
        <span>✅</span> Correo enviado con éxito
      </div>
    );
  }

  return (
    <div className="bg-white border border-blue-200 rounded-xl shadow-sm overflow-hidden flex flex-col w-full max-w-sm">
      <div className="bg-blue-50 px-3 py-2 border-b border-blue-100 flex justify-between items-center">
        <span className="text-xs font-semibold text-blue-800 flex items-center gap-1">
          <span>✉️</span> Borrador de Correo
        </span>
      </div>
      
      <div className="p-3 flex flex-col gap-2 text-sm">
        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Para</label>
          {isEditing ? (
            <input 
              className="border border-gray-300 rounded px-2 py-1 text-xs w-full focus:outline-none focus:border-blue-500" 
              value={emailData.to}
              onChange={(e) => setEmailData({...emailData, to: e.target.value})}
            />
          ) : (
            <div className="text-gray-800 font-medium">{emailData.to}</div>
          )}
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Asunto</label>
          {isEditing ? (
            <input 
              className="border border-gray-300 rounded px-2 py-1 text-xs w-full focus:outline-none focus:border-blue-500" 
              value={emailData.subject}
              onChange={(e) => setEmailData({...emailData, subject: e.target.value})}
            />
          ) : (
            <div className="text-gray-800 font-medium">{emailData.subject}</div>
          )}
        </div>

        <div className="flex flex-col gap-1 mt-1">
          <label className="text-[10px] font-bold text-gray-500 uppercase">Mensaje</label>
          {isEditing ? (
            <textarea 
              className="border border-gray-300 rounded px-2 py-1 text-xs w-full h-32 resize-none focus:outline-none focus:border-blue-500" 
              value={emailData.body}
              onChange={(e) => setEmailData({...emailData, body: e.target.value})}
            />
          ) : (
            <div className="text-gray-700 bg-gray-50 p-2 rounded border border-gray-100 whitespace-pre-wrap text-xs h-32 overflow-y-auto">
              {emailData.body}
            </div>
          )}
        </div>
      </div>

      <div className="bg-gray-50 px-3 py-2 border-t border-gray-100 flex items-center justify-between gap-2">
        <button 
          onClick={handleDiscard}
          className="text-xs text-gray-500 hover:text-red-600 font-medium px-2 py-1 rounded transition-colors"
          disabled={status === 'sending'}
        >
          Descartar
        </button>
        <div className="flex gap-2">
          <button 
            onClick={() => setIsEditing(!isEditing)}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium px-2 py-1 bg-blue-50 hover:bg-blue-100 rounded transition-colors"
            disabled={status === 'sending'}
          >
            {isEditing ? 'Guardar Cambios' : 'Editar'}
          </button>
          <button 
            onClick={handleSend}
            disabled={status === 'sending'}
            className="text-xs text-white bg-blue-600 hover:bg-blue-700 font-medium px-3 py-1.5 rounded flex items-center gap-1 transition-colors disabled:opacity-50"
          >
            {status === 'sending' ? (
              <>
                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                Enviando...
              </>
            ) : (
              'Aprobar y Enviar'
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
