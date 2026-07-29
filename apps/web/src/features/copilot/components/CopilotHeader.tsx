import React from 'react';

export type AiProvider = 'google' | 'anthropic';
export type AiTier = 'light' | 'pro';

export interface ProviderStatus {
  provider: AiProvider;
  ready: boolean;
}

interface CopilotHeaderProps {
  provider: AiProvider;
  tier: AiTier;
  availableProviders: ProviderStatus[];
  onProviderChange: (provider: AiProvider) => void;

  onTierChange: (tier: AiTier) => void;
  onClose: () => void;
}

export const CopilotHeader: React.FC<CopilotHeaderProps> = ({
  provider,
  tier,
  availableProviders,
  onProviderChange,
  onTierChange,
  onClose,
}) => {
  const isGoogleReady = availableProviders.find(p => p.provider === 'google')?.ready ?? false;
  const isAnthropicReady = availableProviders.find(p => p.provider === 'anthropic')?.ready ?? false;

  return (
    <div className="flex flex-col border-b border-gray-200 bg-white p-4 shrink-0">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800 flex items-center gap-2">
          <span>✨</span> Copiloto IA
        </h2>
        <button
          onClick={onClose}
          className="text-gray-500 hover:text-gray-700 p-1 rounded-md hover:bg-gray-100 transition-colors"
          title="Cerrar Copiloto"
        >
          ✕
        </button>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => onProviderChange('google')}
            disabled={!isGoogleReady}
            title={!isGoogleReady ? "Proveedor no configurado" : ""}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              provider === 'google'
                ? 'bg-white shadow-sm text-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Google
          </button>
          <button
            onClick={() => onProviderChange('anthropic')}
            disabled={!isAnthropicReady}
            title={!isAnthropicReady ? "Proveedor no configurado" : ""}
            className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              provider === 'anthropic'
                ? 'bg-white shadow-sm text-purple-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            Anthropic
          </button>
        </div>

        <div className="flex bg-gray-100 p-1 rounded-lg">
          <button
            onClick={() => onTierChange('light')}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              tier === 'light'
                ? 'bg-white shadow-sm text-yellow-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span>⚡</span> Light
          </button>
          <button
            onClick={() => onTierChange('pro')}
            className={`flex items-center gap-1 px-3 py-1.5 text-xs font-medium rounded-md transition-all ${
              tier === 'pro'
                ? 'bg-white shadow-sm text-indigo-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <span>🧠</span> Pro
          </button>
        </div>
      </div>
    </div>
  );
};
