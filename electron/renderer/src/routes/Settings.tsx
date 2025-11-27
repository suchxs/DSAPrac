import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface AppSettings {
  autoSaveEnabled: boolean;
  autoSaveInterval: number;
}

const Settings: React.FC = () => {
  const navigate = useNavigate();
  const [selectedTab, setSelectedTab] = useState('general');
  const [settings, setSettings] = useState<AppSettings>({
    autoSaveEnabled: true,
    autoSaveInterval: 30,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  const tabs = [
    { id: 'general', label: 'General', icon: '⚙️' },
    { id: 'appearance', label: 'Appearance', icon: '🎨' },
    { id: 'editor', label: 'Editor', icon: '📝' },
    { id: 'advanced', label: 'Advanced', icon: '🔧' },
  ];

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      const loadedSettings = await window.api.getSettings();
      setSettings(loadedSettings);
    } catch (error) {
      console.error('Failed to load settings:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSaveSettings = async () => {
    setIsSaving(true);
    try {
      await window.api.saveSettings(settings);
      setHasChanges(false);
    } catch (error) {
      console.error('Failed to save settings:', error);
    } finally {
      setIsSaving(false);
    }
  };

  const handleResetToDefaults = async () => {
    const defaultSettings: AppSettings = {
      autoSaveEnabled: true,
      autoSaveInterval: 30,
    };
    setSettings(defaultSettings);
    setHasChanges(true);
  };

  const updateSetting = <K extends keyof AppSettings>(key: K, value: AppSettings[K]) => {
    setSettings(prev => ({ ...prev, [key]: value }));
    setHasChanges(true);
  };

  const renderGeneralSettings = () => (
    <div className="space-y-4">
      {/* Auto-save Toggle */}
      <div className="flex items-center justify-between p-4 rounded-lg border border-neutral-800 bg-neutral-950/50 hover:border-neutral-700 transition">
        <div className="flex-1">
          <h3 className="text-sm font-medium text-neutral-200">Auto-save</h3>
          <p className="text-xs text-neutral-500 mt-1">
            Automatically save your progress in practical problems
          </p>
        </div>
        <div className="ml-4">
          <button
            onClick={() => updateSetting('autoSaveEnabled', !settings.autoSaveEnabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition cursor-pointer ${
              settings.autoSaveEnabled ? 'bg-blue-600' : 'bg-neutral-700'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
                settings.autoSaveEnabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>
      </div>

      {/* Auto-save Interval */}
      {settings.autoSaveEnabled && (
        <div className="flex items-center justify-between p-4 rounded-lg border border-neutral-800 bg-neutral-950/50 hover:border-neutral-700 transition">
          <div className="flex-1">
            <h3 className="text-sm font-medium text-neutral-200">Auto-save Interval</h3>
            <p className="text-xs text-neutral-500 mt-1">
              How often to automatically save your code (in seconds)
            </p>
          </div>
          <div className="ml-4 flex items-center gap-3">
            <input
              type="range"
              min="10"
              max="300"
              step="10"
              value={settings.autoSaveInterval}
              onChange={(e) => updateSetting('autoSaveInterval', parseInt(e.target.value))}
              className="w-32 accent-blue-500 cursor-pointer"
            />
            <span className="text-sm text-neutral-300 w-16 text-right">
              {settings.autoSaveInterval}s
            </span>
          </div>
        </div>
      )}

      {/* Language - Placeholder */}
      <div className="flex items-center justify-between p-4 rounded-lg border border-neutral-800 bg-neutral-950/50 opacity-50">
        <div className="flex-1">
          <h3 className="text-sm font-medium text-neutral-200">Language</h3>
          <p className="text-xs text-neutral-500 mt-1">
            Select your preferred language (Coming Soon)
          </p>
        </div>
        <div className="ml-4">
          <select
            className="rounded-md border border-neutral-800 bg-neutral-900 px-3 py-1.5 text-sm text-neutral-200 outline-none cursor-not-allowed"
            disabled
          >
            <option>English</option>
          </select>
        </div>
      </div>

      {/* Notifications - Placeholder */}
      <div className="flex items-center justify-between p-4 rounded-lg border border-neutral-800 bg-neutral-950/50 opacity-50">
        <div className="flex-1">
          <h3 className="text-sm font-medium text-neutral-200">Notifications</h3>
          <p className="text-xs text-neutral-500 mt-1">
            Enable desktop notifications (Coming Soon)
          </p>
        </div>
        <div className="ml-4">
          <button
            className="relative inline-flex h-6 w-11 items-center rounded-full bg-neutral-700 cursor-not-allowed"
            disabled
          >
            <span className="inline-block h-4 w-4 transform rounded-full bg-white translate-x-1" />
          </button>
        </div>
      </div>
    </div>
  );

  const renderPlaceholderSettings = (sectionName: string) => (
    <div className="space-y-4">
      <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 px-4 py-3">
        <div className="flex items-start gap-3">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="h-5 w-5 text-amber-400 mt-0.5 shrink-0"
          >
            <circle cx="12" cy="12" r="10" />
            <path d="M12 16v-4" />
            <path d="M12 8h.01" />
          </svg>
          <div>
            <p className="text-sm font-medium text-amber-200">{sectionName} Settings Coming Soon</p>
            <p className="text-xs text-amber-300/80 mt-1">
              These settings will be available in a future update.
            </p>
          </div>
        </div>
      </div>
    </div>
  );

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
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white"></div>
                  </div>
                ) : (
                  <>
                    {selectedTab === 'general' && renderGeneralSettings()}
                    {selectedTab === 'appearance' && renderPlaceholderSettings('Appearance')}
                    {selectedTab === 'editor' && renderPlaceholderSettings('Editor')}
                    {selectedTab === 'advanced' && renderPlaceholderSettings('Advanced')}
                  </>
                )}

                {/* Footer Actions */}
                <div className="flex items-center justify-end gap-3 pt-6 border-t border-neutral-800">
                  <button
                    onClick={handleResetToDefaults}
                    className="rounded-md border border-neutral-800 bg-neutral-900 px-4 py-2 text-sm font-medium text-neutral-200 transition hover:border-neutral-700 hover:bg-neutral-800 cursor-pointer"
                  >
                    Reset to Defaults
                  </button>
                  <button
                    onClick={handleSaveSettings}
                    disabled={!hasChanges || isSaving}
                    className={`rounded-md border px-4 py-2 text-sm font-medium transition cursor-pointer ${
                      hasChanges && !isSaving
                        ? 'border-white bg-white text-neutral-950 hover:bg-neutral-200'
                        : 'border-neutral-700 bg-neutral-800 text-neutral-500 cursor-not-allowed'
                    }`}
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
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
