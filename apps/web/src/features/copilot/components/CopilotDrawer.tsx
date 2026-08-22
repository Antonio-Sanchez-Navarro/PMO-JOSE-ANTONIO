import React, { useState, useEffect, useRef } from 'react';
import { CopilotHeader, AiProvider, AiTier, ProviderStatus } from './CopilotHeader';
import { ChatMessage, Message } from './ChatMessage';
import { useCopilot } from '../CopilotContext';
import { CopilotThread, fetchThreads, fetchThreadMessages, deleteThread } from '../api/copilot.api';
import { API_BASE, apiFetch } from '../../../lib/api';
import { TaskPriority } from '../../kanban/types';
import { toast } from 'sonner';

interface CopilotDrawerProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CopilotDrawer: React.FC<CopilotDrawerProps> = ({ isOpen, onClose }) => {
  const [provider, setProvider] = useState<AiProvider>('anthropic');
  const [tier, setTier] = useState<AiTier>('pro');
  const { copilotContext, setCopilotContext } = useCopilot();
  const [availableProviders, setAvailableProviders] = useState<ProviderStatus[]>([]);
  const [messages, setMessages] = useState<Message[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: '¡Hola! Soy tu Copiloto de IA. Puedo ayudarte a redactar correos, planificar tareas o analizar tu carga de trabajo.',
      status: 'complete'
    }
  ]);
  const [input, setInput] = useState('');
  const abortControllerRef = useRef<AbortController | null>(null);

  const [currentThreadId, setCurrentThreadId] = useState<string | null>(null);
  const [threads, setThreads] = useState<CopilotThread[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  const handleToggleHistory = async () => {
    if (!showHistory) {
      try {
        const data = await fetchThreads();
        setThreads(data);
      } catch {
        toast.error('Error al cargar historial');
      }
    }
    setShowHistory(!showHistory);
  };

  useEffect(() => {
    if (isOpen) {
      apiFetch<ProviderStatus[]>('/copilot/providers')
        .then((data: ProviderStatus[]) => {
          setAvailableProviders(data);
          // If current provider is not ready, switch to the first ready one
          const isCurrentReady = data.find(p => p.provider === provider)?.ready;
          if (!isCurrentReady) {
            const firstReady = data.find(p => p.ready);
            if (firstReady) setProvider(firstReady.provider);
          }
        })
        .catch(err => console.error('No se pudieron cargar los proveedores del copiloto:', err));
    }
  }, [isOpen]);

  const stopGeneration = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
  };

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      status: 'complete'
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput('');

    const assistantMessageId = (Date.now() + 1).toString();
    setMessages((prev) => [
      ...prev,
      { id: assistantMessageId, role: 'assistant', content: '', status: 'pending' }
    ]);

    const abortController = new AbortController();
    abortControllerRef.current = abortController;

    try {
      const res = await fetch(`${API_BASE}/copilot/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ provider, tier, message: input, context: copilotContext, threadId: currentThreadId }),
        signal: abortController.signal,
      });

      if (!res.ok) {
        const { message } = await res.json().catch(() => ({ message: `Error ${res.status}` }));
        throw new Error(message);
      }

      setMessages((prev) => prev.map(msg => msg.id === assistantMessageId ? { ...msg, status: 'streaming' } : msg));

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const bloques = buffer.split('\n\n');
        buffer = bloques.pop() ?? '';

        for (const bloque of bloques) {
          const evento = bloque.match(/^event: (.+)$/m)?.[1];
          const dataStr = bloque.match(/^data: (.+)$/m)?.[1] ?? '{}';
          let data: { type?: string; text?: string; toolName?: string; payload?: { to?: string | string[]; subject?: string; body?: string; title?: string; description?: string; priority?: string; dueDate?: string | null; sourceEmailId?: string | null }; message?: string; threadId?: string } = {};
          try {
            data = JSON.parse(dataStr);
          } catch {
            console.error('No se pudo interpretar el evento SSE:', dataStr);
          }

          if (evento === 'token' && data.text) {
            setMessages((prev) => prev.map(msg => {
              if (msg.id === assistantMessageId) {
                return { ...msg, content: msg.content + data.text };
              }
              return msg;
            }));
          } else if (evento === 'tool_call') {
            const payload = data.payload;
            if (data.toolName === 'draft_email' && payload) {
              setMessages((prev) => prev.map(msg => {
                if (msg.id === assistantMessageId) {
                  return {
                    ...msg,
                    status: 'complete',
                    draftEmail: {
                      id: Date.now().toString(),
                      to: Array.isArray(payload.to) ? payload.to.join(', ') : (payload.to || ''),
                      subject: payload.subject || '',
                      body: payload.body || ''
                    }
                  };
                }
                return msg;
              }));
            } else if (data.toolName === 'create_task' && payload) {
              setMessages((prev) => prev.map(msg => {
                if (msg.id === assistantMessageId) {
                  return { 
                    ...msg, 
                    status: 'complete',
                    createTask: {
                      title: payload.title || '',
                      description: payload.description || '',
                      priority: (payload.priority as TaskPriority) || 'MEDIUM',
                      dueDate: payload.dueDate || null,
                      sourceEmailId: payload.sourceEmailId || null
                    }
                  };
                }
                return msg;
              }));
            }
          } else if (evento === 'error') {
            throw new Error(data.message || 'Stream error');
          } else if (evento === 'done') {
            if (data.threadId) {
              setCurrentThreadId(data.threadId);
            }
            break;
          }
        }
      }

      setMessages((prev) => prev.map(msg => msg.id === assistantMessageId ? { ...msg, status: 'complete' } : msg));
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        setMessages((prev) => prev.map(msg => msg.id === assistantMessageId ? { ...msg, status: 'complete' } : msg));
      } else {
        const error = err as Error;
        setMessages((prev) => prev.map(msg => msg.id === assistantMessageId ? { 
          ...msg, 
          content: msg.content + (msg.content ? '\n\n' : '') + `⚠️ Error: ${error.message}`,
          status: 'complete' 
        } : msg));
      }
    } finally {
      abortControllerRef.current = null;
    }
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
          availableProviders={availableProviders}
          onProviderChange={setProvider}
          onTierChange={setTier}
          onToggleHistory={handleToggleHistory}
          onClose={onClose}
        />

        {showHistory ? (
          <div className="flex-1 overflow-y-auto bg-gray-50 flex flex-col">
            <div className="p-4 flex items-center justify-between border-b border-gray-200">
              <h3 className="font-medium text-gray-800">Historial</h3>
              <button onClick={() => {
                setCurrentThreadId(null);
                setMessages([{
                  id: 'welcome',
                  role: 'assistant',
                  content: '¡Hola! Soy tu Copiloto de IA. Puedo ayudarte a redactar correos, planificar tareas o analizar tu carga de trabajo.',
                  status: 'complete'
                }]);
                setShowHistory(false);
              }} className="text-xs font-medium text-blue-600 hover:underline">Nueva conversación</button>
            </div>
            {threads.length === 0 ? (
              <div className="p-8 text-center text-gray-400 text-sm">No hay conversaciones previas.</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {threads.map(t => (
                  <li key={t.id} className="p-4 hover:bg-white cursor-pointer group flex justify-between items-center transition" onClick={async () => {
                    try {
                      const msgs = await fetchThreadMessages(t.id);
                      setMessages(msgs.map((m) => ({
                        id: m.id,
                        role: m.role,
                        content: m.content,
                        status: 'complete'
                      })));
                      setCurrentThreadId(t.id);
                      setShowHistory(false);
                    } catch {
                      toast.error('Error al cargar la conversación');
                    }
                  }}>
                    <div className="min-w-0 flex-1 pr-2">
                      <p className="text-sm font-medium text-gray-800 truncate">{t.title || 'Conversación'}</p>
                      <p className="text-xs text-gray-400 mt-1">{new Date(t.updatedAt).toLocaleDateString()}</p>
                    </div>
                    <button onClick={async (e) => {
                      e.stopPropagation();
                      if(window.confirm('¿Eliminar esta conversación?')) {
                        try {
                          await deleteThread(t.id);
                          setThreads(prev => prev.filter(x => x.id !== t.id));
                          if (currentThreadId === t.id) {
                            setCurrentThreadId(null);
                            setMessages([{
                              id: 'welcome',
                              role: 'assistant',
                              content: '¡Hola! Soy tu Copiloto de IA. Puedo ayudarte a redactar correos, planificar tareas o analizar tu carga de trabajo.',
                              status: 'complete'
                            }]);
                          }
                        } catch {
                          toast.error('Error al eliminar');
                        }
                      }
                    }} className="opacity-0 group-hover:opacity-100 p-1.5 text-red-400 hover:text-red-600 hover:bg-red-50 rounded transition" title="Eliminar hilo">
                      <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-gray-50">
              {messages.map((msg) => (
                <ChatMessage key={msg.id} message={msg} />
              ))}
            </div>

            <div className="p-4 bg-white border-t border-gray-200">
              {copilotContext && (
                <div className="mb-3 flex items-center justify-between rounded-lg bg-indigo-50 px-3 py-2 text-sm text-indigo-700">
                  <div className="flex items-center gap-2">
                    <span>📎</span>
                    <span className="font-medium">
                      {copilotContext.taskId ? 'Tarea adjunta' : 'Correo adjunto'}
                    </span>
                    <span className="text-indigo-400 font-mono text-xs">
                      ({copilotContext.taskId || copilotContext.emailId})
                    </span>
                  </div>
                  <button
                    onClick={() => setCopilotContext(null)}
                    className="rounded hover:bg-indigo-100 p-1 text-indigo-500 transition-colors"
                    title="Quitar contexto"
                  >
                    ✕
                  </button>
                </div>
              )}
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
                {abortControllerRef.current ? (
                  <button
                    onClick={stopGeneration}
                    className="absolute right-2 bottom-2 p-2 text-white bg-red-600 rounded-lg hover:bg-red-700 transition-colors"
                    title="Detener generación"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                      <path fillRule="evenodd" d="M4.5 7.5a3 3 0 013-3h9a3 3 0 013 3v9a3 3 0 01-3 3h-9a3 3 0 01-3-3v-9z" clipRule="evenodd" />
                    </svg>
                  </button>
                ) : (
                  <button
                    onClick={handleSend}
                    disabled={!input.trim()}
                    className="absolute right-2 bottom-2 p-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                  >
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                      <path d="M3.478 2.405a.75.75 0 00-.926.94l2.432 7.905H13.5a.75.75 0 010 1.5H4.984l-2.432 7.905a.75.75 0 00.926.94 60.519 60.519 0 0018.445-8.986.75.75 0 000-1.218A60.517 60.517 0 003.478 2.405z" />
                    </svg>
                  </button>
                )}
              </div>
              <div className="text-center mt-2">
                <span className="text-[10px] text-gray-400">El modelo puede cometer errores. Verifica la información.</span>
              </div>
            </div>
          </>
        )}
      </div>
    </>
  );
};
