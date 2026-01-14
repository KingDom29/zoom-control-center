import { useState, useEffect } from 'react';
import { 
  Settings as SettingsIcon, Shield, Video, Lock, 
  Users, Mic, Camera, Monitor, Save, RefreshCw,
  Check, AlertCircle, Globe, Clock
} from 'lucide-react';
import { getAccountSettings, getSecuritySettings, getAccountInfo, updateAccountSettings } from '../api';
import logger from '../utils/logger.js';

function SettingToggle({ label, description, enabled, onChange, locked }) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-gray-100 last:border-0">
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <p className="font-medium text-gray-800">{label}</p>
          {locked && <Lock className="w-4 h-4 text-gray-400" />}
        </div>
        {description && <p className="text-sm text-gray-500 mt-1">{description}</p>}
      </div>
      <button
        onClick={() => !locked && onChange(!enabled)}
        disabled={locked}
        className={`relative w-12 h-6 rounded-full transition-colors ${
          enabled ? 'bg-zoom-blue' : 'bg-gray-300'
        } ${locked ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
      >
        <span className={`absolute top-1 w-4 h-4 bg-white rounded-full transition-transform ${
          enabled ? 'left-7' : 'left-1'
        }`} />
      </button>
    </div>
  );
}

function SettingSection({ icon: Icon, title, children }) {
  return (
    <div className="card">
      <div className="flex items-center gap-3 mb-4">
        <div className="p-2 bg-zoom-light rounded-lg">
          <Icon className="w-5 h-5 text-zoom-blue" />
        </div>
        <h3 className="text-lg font-semibold text-gray-800">{title}</h3>
      </div>
      <div>{children}</div>
    </div>
  );
}

export default function Settings() {
  const [settings, setSettings] = useState(null);
  const [security, setSecurity] = useState(null);
  const [accountInfo, setAccountInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(null);

  const fetchSettings = async () => {
    setLoading(true);
    try {
      const [settingsRes, securityRes, infoRes] = await Promise.all([
        getAccountSettings().catch(() => ({ data: null })),
        getSecuritySettings().catch(() => ({ data: null })),
        getAccountInfo().catch(() => ({ data: null }))
      ]);
      setSettings(settingsRes.data);
      setSecurity(securityRes.data);
      setAccountInfo(infoRes.data);
    } catch (err) {
      logger.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings();
  }, []);

  const updateSetting = async (category, key, value) => {
    setSaving(true);
    try {
      await updateAccountSettings({ [category]: { [key]: value } });
      setSettings(prev => ({
        ...prev,
        [category]: { ...prev?.[category], [key]: value }
      }));
      setSaveStatus('success');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (err) {
      logger.error(err);
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(null), 3000);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-800">Einstellungen</h1>
          <p className="text-gray-500 mt-1">Account- und Meeting-Einstellungen</p>
        </div>
        <div className="flex items-center gap-3">
          {saveStatus === 'success' && (
            <span className="flex items-center gap-1 text-green-600 text-sm">
              <Check className="w-4 h-4" /> Gespeichert
            </span>
          )}
          {saveStatus === 'error' && (
            <span className="flex items-center gap-1 text-red-600 text-sm">
              <AlertCircle className="w-4 h-4" /> Fehler beim Speichern
            </span>
          )}
          <button onClick={fetchSettings} className="btn-secondary">
            <RefreshCw className={`w-5 h-5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-zoom-blue"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Account Info */}
          {accountInfo && (
            <SettingSection icon={Globe} title="Account-Informationen">
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-sm text-gray-500">Account ID</p>
                    <p className="font-medium text-gray-800">{accountInfo.id}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Account Name</p>
                    <p className="font-medium text-gray-800">{accountInfo.account_name || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Owner Email</p>
                    <p className="font-medium text-gray-800">{accountInfo.owner_email || '-'}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Account-Typ</p>
                    <p className="font-medium text-gray-800">{accountInfo.account_type || '-'}</p>
                  </div>
                </div>
              </div>
            </SettingSection>
          )}

          {/* Meeting Settings */}
          <SettingSection icon={Video} title="Meeting-Einstellungen">
            <SettingToggle
              label="Host-Video"
              description="Video des Hosts beim Start aktivieren"
              enabled={settings?.schedule_meeting?.host_video}
              onChange={(v) => updateSetting('schedule_meeting', 'host_video', v)}
            />
            <SettingToggle
              label="Teilnehmer-Video"
              description="Video der Teilnehmer beim Beitritt aktivieren"
              enabled={settings?.schedule_meeting?.participants_video}
              onChange={(v) => updateSetting('schedule_meeting', 'participants_video', v)}
            />
            <SettingToggle
              label="Beitritt vor Host"
              description="Teilnehmer können vor dem Host beitreten"
              enabled={settings?.schedule_meeting?.join_before_host}
              onChange={(v) => updateSetting('schedule_meeting', 'join_before_host', v)}
            />
            <SettingToggle
              label="Stummschaltung bei Eintritt"
              description="Teilnehmer automatisch stummschalten"
              enabled={settings?.schedule_meeting?.mute_upon_entry}
              onChange={(v) => updateSetting('schedule_meeting', 'mute_upon_entry', v)}
            />
          </SettingSection>

          {/* Security Settings */}
          <SettingSection icon={Shield} title="Sicherheit">
            <SettingToggle
              label="Warteraum"
              description="Teilnehmer in Warteraum platzieren"
              enabled={settings?.schedule_meeting?.waiting_room}
              onChange={(v) => updateSetting('schedule_meeting', 'waiting_room', v)}
            />
            <SettingToggle
              label="Meeting-Passwort"
              description="Passwort für Meetings erforderlich"
              enabled={settings?.schedule_meeting?.require_password_for_scheduling_new_meetings}
              onChange={(v) => updateSetting('schedule_meeting', 'require_password_for_scheduling_new_meetings', v)}
            />
            <SettingToggle
              label="Nur authentifizierte Benutzer"
              description="Nur angemeldete Benutzer können beitreten"
              enabled={settings?.schedule_meeting?.meeting_authentication}
              onChange={(v) => updateSetting('schedule_meeting', 'meeting_authentication', v)}
            />
            <SettingToggle
              label="Meeting sperren"
              description="Meeting nach Start für neue Teilnehmer sperren"
              enabled={security?.meeting_security?.auto_security}
              onChange={(v) => updateSetting('meeting_security', 'auto_security', v)}
            />
          </SettingSection>

          {/* Recording Settings */}
          <SettingSection icon={Monitor} title="Aufnahmen">
            <SettingToggle
              label="Cloud-Aufnahme"
              description="Aufnahmen in der Cloud speichern"
              enabled={settings?.recording?.cloud_recording}
              onChange={(v) => updateSetting('recording', 'cloud_recording', v)}
            />
            <SettingToggle
              label="Lokale Aufnahme"
              description="Lokale Aufnahmen auf dem Computer erlauben"
              enabled={settings?.recording?.local_recording}
              onChange={(v) => updateSetting('recording', 'local_recording', v)}
            />
            <SettingToggle
              label="Automatische Aufnahme"
              description="Meetings automatisch aufnehmen"
              enabled={settings?.recording?.auto_recording === 'cloud'}
              onChange={(v) => updateSetting('recording', 'auto_recording', v ? 'cloud' : 'none')}
            />
            <SettingToggle
              label="Aufnahme-Zustimmung"
              description="Teilnehmer müssen Aufnahme zustimmen"
              enabled={settings?.recording?.recording_disclaimer}
              onChange={(v) => updateSetting('recording', 'recording_disclaimer', v)}
            />
          </SettingSection>

          {/* Audio/Video Settings */}
          <SettingSection icon={Mic} title="Audio & Video">
            <SettingToggle
              label="HD-Video"
              description="Hochauflösendes Video aktivieren"
              enabled={settings?.in_meeting?.hd_video}
              onChange={(v) => updateSetting('in_meeting', 'hd_video', v)}
            />
            <SettingToggle
              label="Stereo-Audio"
              description="Stereo-Audio für Meetings"
              enabled={settings?.in_meeting?.stereo_audio}
              onChange={(v) => updateSetting('in_meeting', 'stereo_audio', v)}
            />
            <SettingToggle
              label="Original-Sound"
              description="Original-Sound ohne Bearbeitung"
              enabled={settings?.in_meeting?.original_audio}
              onChange={(v) => updateSetting('in_meeting', 'original_audio', v)}
            />
            <SettingToggle
              label="Virtueller Hintergrund"
              description="Virtuelle Hintergründe erlauben"
              enabled={settings?.in_meeting?.virtual_background}
              onChange={(v) => updateSetting('in_meeting', 'virtual_background', v)}
            />
          </SettingSection>

          {/* Collaboration Settings */}
          <SettingSection icon={Users} title="Zusammenarbeit">
            <SettingToggle
              label="Bildschirmfreigabe"
              description="Bildschirmfreigabe für Teilnehmer"
              enabled={settings?.in_meeting?.screen_sharing}
              onChange={(v) => updateSetting('in_meeting', 'screen_sharing', v)}
            />
            <SettingToggle
              label="Chat"
              description="Meeting-Chat aktivieren"
              enabled={settings?.in_meeting?.chat}
              onChange={(v) => updateSetting('in_meeting', 'chat', v)}
            />
            <SettingToggle
              label="Dateiübertragung"
              description="Dateiübertragung im Chat erlauben"
              enabled={settings?.in_meeting?.file_transfer}
              onChange={(v) => updateSetting('in_meeting', 'file_transfer', v)}
            />
            <SettingToggle
              label="Whiteboard"
              description="Whiteboard-Funktion aktivieren"
              enabled={settings?.in_meeting?.whiteboard}
              onChange={(v) => updateSetting('in_meeting', 'whiteboard', v)}
            />
            <SettingToggle
              label="Breakout-Räume"
              description="Breakout-Räume erlauben"
              enabled={settings?.in_meeting?.breakout_room}
              onChange={(v) => updateSetting('in_meeting', 'breakout_room', v)}
            />
          </SettingSection>
        </div>
      )}
    </div>
  );
}
