import React, { useState } from 'react';
import { CopilotHeader, AiProvider, AiTier } from './CopilotHeader';
import { ChatMessage, Message } from './ChatMessage';

interface CopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CopilotDrawer: React.FC<CopilotDrawerProps> = ({ isOpen, onClose }) => {
  const [provider, setProvider] = useState<AiProvider>('anthropic');
  const [tier, setTier] = useState<AiTier>('pro');
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '¡Hola! Soy tu Copiloto de IA. Puedo ayudarte a redactar correos, planificar tareas o analizar tu carga de trabajo.',
      status: 'complete'
    }
  ]);
  const [input, setInput] = useState('');

  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      status: 'complete'
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');

    // Simulate AI response (this will be replaced with real SSE logic)
    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessage: Message = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      status: 'pending'
    };

    setMessages((prev) => [...prev, assistantMessage]);

    setTimeout(() => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, status: 'streaming', content: 'Estoy analizando tu solicitud...' }
            : msg
        )
      );
    }, 1000);

    setTimeout(() => {
      setMessages((prev) =>
        prev.map((msg) =>
          msg.id === assistantMessageId
            ? { ...msg, status: 'complete', content: 'Estoy analizando tu solicitud... \n\n¡Listo! Dime si necesitas algo más.' }
            : msg
        )
      );
    }, 3000);
  };

  return (
    <>
      {/* 
        El Drawer no tiene backdrop oscuro para permitir interactuar con el Kanban de fondo 
      */}
      <div
        className={`fixed top-0 right-0 h-full w-[400px] bg-white shadow-2xl flex flex-col z-50 transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <CopilotHeader
          provider={provider}
          tier={tier}
          onProviderChange={setProvider}
          onTierChange={setTier}
          onClose={onClose}
        />

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-gray-50">
          {messages.map((msg) => (
            <ChatMessage key={msg.id} message={msg} />
          ))}
        </div>

        <div className="p-4 bg-white border-t border-gray-200">
          <div className="relative flex items-end">
            <textarea
              className="w-full resize-none rounded-xl border border-gray-300 p-3 pr-12 focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500 shadow-sm text-sm"
              rows={2}
              placeholder="Pregúntame algo..."
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
            />
            <button
              onClick={handleSend}
              disabled={!input.trim()}
              className="absolute right-2 bottom-2 p-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
              </svg>
            </button>
          </div>
          <div className="text-center mt-2">
            <span className="text-[10px] text-gray-400">El modelo puede cometer errores. Verifica la información.</span>
          </div>
        </div>
      </div>
    </>
  );
};
