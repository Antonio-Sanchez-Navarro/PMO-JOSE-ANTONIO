import React from 'react';
import { DraftEmailCard, DraftEmailData } from './DraftEmailCard';

export type MessageStatus = 'pending' | 'streaming' | 'complete';
export type MessageRole = 'user' | 'assistant';

export interface Message {
  id: string;
  role: MessageRole;
  content: string;
  status: MessageStatus;
  draftEmail?: DraftEmailData;
}

interface ChatMessageProps {
  message: Message;
}

export const ChatMessage: React.FC<ChatMessageProps> = ({ message }) => {
  const isUser = message.role === 'user';

  return (
    <div className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}>
      <div className={`flex gap-3 max-w-[90%] ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        
        {/* Avatar */}
        <div className={`w-8 h-8 flex-shrink-0 rounded-full flex items-center justify-center text-sm ${
          isUser ? 'bg-blue-100 text-blue-700' : 'bg-purple-100 text-purple-700'
        }`}>
          {isUser ? '👤' : '✨'}
        </div>

        {/* Bubble */}
        <div className="flex flex-col gap-1">
          <div className="text-[11px] text-gray-500 font-medium px-1 flex justify-between items-center">
            <span>{isUser ? 'Tú' : 'Copiloto'}</span>
          </div>
          
          <div className={`rounded-2xl px-4 py-2.5 shadow-sm text-sm ${
            isUser ? 'bg-blue-600 text-white rounded-tr-sm' : 'bg-white border border-gray-100 text-gray-800 rounded-tl-sm'
          }`}>
            
            {message.status === 'pending' && !isUser && (
              <div className="flex items-center gap-1 h-5">
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.3s]"></div>
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce [animation-delay:-0.15s]"></div>
                <div className="w-1.5 h-1.5 bg-gray-400 rounded-full animate-bounce"></div>
              </div>
            )}

            {(message.status === 'streaming' || message.status === 'complete') && (
              <div className="whitespace-pre-wrap leading-relaxed">
                {message.content}
                {message.status === 'streaming' && (
                  <span className="inline-block w-1.5 h-4 ml-1 bg-gray-400 animate-pulse align-middle"></span>
                )}
              </div>
            )}

          </div>

          {/* Render Tool Call Component (e.g., DraftEmailCard) */}
          {message.draftEmail && (
            <div className="mt-2">
              <DraftEmailCard draft={message.draftEmail} />
            </div>
          )}

        </div>
      </div>
    </div>
  );
};
