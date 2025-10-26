import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

interface SettingItem {
  title: string;
  description: string;
  type: 'dropdown' | 'toggle' | 'slider' | 'number' | 'button';
  options?: string[];
}

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState('general');

  const tabs = [
    { id: 'general', label: 'General', icon: '⚙️' },
    { id: 'appearance', label: 'Appearance', icon: '🎨' },
    { id: 'editor', label: 'Editor', icon: '📝' },
    { id: 'advanced', label: 'Advanced', icon: '🔧' },
  ];

  const settingSections: Record<string, SettingItem[]> = {
    general: [
      { title: 'Language', description: 'Select your preferred language', type: 'dropdown', options: ['English', 'Spanish', 'French'] },
      { title: 'Auto-save', description: 'Automatically save your progress', type: 'toggle' },
      { title: 'Notifications', description: 'Enable desktop notifications', type: 'toggle' },
    ],
    appearance: [
      { title: 'Theme', description: 'Choose your color theme', type: 'dropdown', options: ['Dark', 'Light', 'Auto'] },
      { title: 'Font Size', description: 'Adjust the interface font size', type: 'slider' },
      { title: 'Animations', description: 'Enable smooth animations', type: 'toggle' },
    ],
    editor: [
      { title: 'Tab Size', description: 'Number of spaces per tab', type: 'number' },
      { title: 'Auto-complete', description: 'Enable code suggestions', type: 'toggle' },
      { title: 'Line Numbers', description: 'Show line numbers in editor', type: 'toggle' },
    ],
    advanced: [
      { title: 'Developer Mode', description: 'Enable advanced developer features', type: 'toggle' },
      { title: 'Clear Cache', description: 'Remove all cached data', type: 'button' },
      { title: 'Reset Settings', description: 'Restore default settings', type: 'button' },
    ],
  };

  const currentSettings = settingSections[selectedTab] || [];

  return (
    <div className="h-screen overflow-y-auto bg-neutral-950 text-neutral-100">
      <div className="mx-auto flex min-h-full w-full max-w-6xl flex-col px-6 py-12">
        {/* Header */}
        <header className="mb-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-3xl font-semibold tracking-tight text-white">
              Settings
            </h1>
            <p className="mt-1 text-sm text-neutral-400">
              Manage your preferences and application settings
            </p>
          </div>
          <button
            type="button"
            onClick={() => navigate(-1)}
            className="inline-flex items-center gap-2 rounded-md border border-neutral-800 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-neutral-700 hover:bg-neutral-900 cursor-pointer"
          >
            <svg
              xmlns="http://www.w3.org/2000/svg"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="h-4 w-4"
            >
              <path d="M19 12H5" />
              <path d="M12 19l-7-7 7-7" />
            </svg>
            Back
          </button>
        </header>

        {/* Settings Container */}
        <div className="flex flex-1 flex-col rounded-xl border border-neutral-900 bg-neutral-900/70 overflow-hidden">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-0 min-h-[600px]">
            {/* Sidebar Navigation */}
            <div className="md:col-span-1 border-b md:border-b-0 md:border-r border-neutral-800 bg-neutral-950/50">
              <nav className="p-4 space-y-1">
                {tabs.map((tab) => (
                  <button
                    key={tab.id}
                    onClick={() => setSelectedTab(tab.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg text-left text-sm font-medium transition cursor-pointer ${
                      selectedTab === tab.id
                        ? 'bg-white text-neutral-950'
                        : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-900'
                    }`}
                  >
                    <span className="text-lg">{tab.icon}</span>
                    <span>{tab.label}</span>
                  </button>
                ))}
              </nav>
            </div>

            {/* Content Area */}
            <div className="md:col-span-3 p-6">
              <div className="space-y-6">
                {/* Info Banner */}
                <div className="rounded-lg border border-blue-500/30 bg-blue-500/10 px-4 py-3">
                  <div className="flex items-start gap-3">
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      className="h-5 w-5 text-blue-400 mt-0.5 shrink-0"
                    >
                      <circle cx="12" cy="12" r="10" />
                      <path d="M12 16v-4" />
                      <path d="M12 8h.01" />
                    </svg>
                    <div>
                      <p className="text-sm font-medium text-blue-200">Settings Coming Soon</p>
                      <p className="text-xs text-blue-300/80 mt-1">
                        These settings are placeholders. Functionality will be implemented in future updates.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Settings List */}
                <div className="space-y-4">
                  {currentSettings.map((setting, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between p-4 rounded-lg border border-neutral-800 bg-neutral-950/50 hover:border-neutral-700 transition"
                    >
                      <div className="flex-1">
                        <h3 className="text-sm font-medium text-neutral-200">
                          {setting.title}
                        </h3>
                        <p className="text-xs text-neutral-500 mt-1">
                          {setting.description}
                        </p>
                      </div>
                      <div className="ml-4">
                        {setting.type === 'toggle' && (
                          <button
                            className="relative inline-flex h-6 w-11 items-center rounded-full bg-neutral-700 transition hover:bg-neutral-600 cursor-pointer"
                            disabled
                          >
                            <span className="inline-block h-4 w-4 transform rounded-full bg-white transition translate-x-1" />
                          </button>
                        )}
                        {setting.type === 'dropdown' && (
                          <select
                            className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 outline-none transition focus:border-neutral-600 cursor-pointer"
                            disabled
                          >
                            {setting.options?.map((option: string) => (
                              <option key={option} value={option}>
                                {option}
                              </option>
                            ))}
                          </select>
                        )}
                        {setting.type === 'number' && (
                          <input
                            type="number"
                            className="w-20 rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 outline-none transition focus:border-neutral-600"
                            defaultValue={4}
                            disabled
                          />
                        )}
                        {setting.type === 'slider' && (
                          <input
                            type="range"
                            className="w-32 accent-white cursor-pointer"
                            min="12"
                            max="20"
                            defaultValue="14"
                            disabled
                          />
                        )}
                        {setting.type === 'button' && (
                          <button
                            className="rounded-md border border-neutral-800 bg-neutral-900 px-4 py-1.5 text-xs font-medium text-neutral-200 transition hover:border-neutral-700 hover:bg-neutral-800 cursor-pointer"
                            disabled
                          >
                            {setting.title}
                          </button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Footer Actions */}
                <div className="flex items-center justify-end gap-3 pt-6 border-t border-neutral-800">
                  <button
                    className="rounded-md border border-neutral-800 bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-neutral-700 hover:bg-neutral-800 cursor-pointer"
                    disabled
                  >
                    Reset to Defaults
                  </button>
                  <button
                    className="rounded-md border border-white bg-white px-4 py-2 text-sm font-medium text-neutral-950 transition hover:bg-neutral-200 cursor-pointer"
                    disabled
                  >
                    Save Changes
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Settings;
