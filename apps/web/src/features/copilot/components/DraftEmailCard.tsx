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
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [transportType, setTransportType] = useState<'gmail' | 'mock' | null>(null);

  const handleSend = async () => {
    setStatus('sending');
    setErrorMsg(null);
    try {
      const res = await fetch('/api/copilot/emails/send', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          to: emailData.to.split(',').map(e => e.trim()).filter(Boolean),
          subject: emailData.subject,
          body: emailData.body
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({ message: `Error HTTP ${res.status}` }));
        throw new Error(errorData.message || 'Error al enviar el correo');
      }
      
      const resData = await res.json().catch(() => ({}));
      if (resData.transport === 'mock') {
        setTransportType('mock');
      } else if (resData.transport === 'gmail') {
        setTransportType('gmail');
      }

      setStatus('sent');
    } catch (err) {
      const error = err as Error;
      setErrorMsg(error.message);
      setStatus('idle');
    }
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
      <div className="bg-green-50 text-green-700 text-xs px-3 py-2 rounded-md border border-green-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span>✅</span> Correo enviado con éxito
        </div>
        {transportType === 'mock' && (
          <span className="bg-orange-100 text-orange-800 px-2 py-0.5 rounded text-[10px] font-bold uppercase" title="El correo no se envió realmente">
            Simulación
          </span>
        )}
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

        <button 
          onClick={handleDiscard}
          disabled={status === 'sending'}
          className="text-xs text-red-600 font-medium hover:text-red-700 disabled:opacity-50"
        >
          Descartar
        </button>
        
        <div className="flex gap-2 items-center">
          {errorMsg && (
            <span className="text-xs text-red-500 mr-2" title={errorMsg}>
              ⚠️ Falló el envío
            </span>
          )}
          <button 
            onClick={() => setIsEditing(!isEditing)}
            disabled={status === 'sending'}
            className="text-xs text-blue-600 font-medium hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded disabled:opacity-50"
          >
            {isEditing ? 'Guardar Cambios' : 'Editar'}
          </button>
          
          <button 
            onClick={handleSend}
            disabled={status === 'sending'}
            className="text-xs text-white font-medium bg-blue-600 hover:bg-blue-700 px-3 py-1.5 rounded flex items-center gap-1 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {status === 'sending' ? (
              <>
                <svg className="animate-spin h-3 w-3 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Enviando...
              </>
            ) : (
              <>
                <span>🚀</span> Enviar
              </>
            )}
          </button>
      </div>
    </div>
  );
};
