export interface DesktopSession {
  connected: boolean;
  sharing: boolean;
  email?: string;
  needsReauthentication?: boolean;
  authError?: string;
}

export interface DesktopModel {
  slug: string;
  displayName: string;
}

export interface DesktopGenerateRequest {
  model: string;
  input: string;
  instructions?: string;
  webSearch?: boolean;
}

export interface CareerProfile {
  version: 1;
  completed: boolean;
  major: string;
  industries: string;
  roles: string;
  priorities: string;
  strengths: string;
}

export interface UpdateStatus {
  currentVersion: string;
  status: 'idle' | 'checking' | 'current' | 'available' | 'downloading' | 'ready' | 'opened' | 'error';
  available: boolean;
  progress: number;
  latestVersion?: string;
  releaseNotes?: string;
  releaseUrl?: string;
  size?: number;
  error?: string;
}

export interface SyukatsuDesktopAPI {
  getUpdateStatus(): Promise<UpdateStatus>;
  checkForUpdates(): Promise<UpdateStatus>;
  downloadUpdate(): Promise<UpdateStatus>;
  installUpdate(): Promise<{ opened: boolean }>;
  getSession(): Promise<DesktopSession>;
  signIn(): Promise<void>;
  cancelSignIn(): Promise<void>;
  signOut(): Promise<{remoteRevoked: boolean}>;
  listModels(): Promise<DesktopModel[]>;
  generate(request: DesktopGenerateRequest): Promise<string>;
  openUsage(): Promise<void>;
  getCareerProfile(): Promise<CareerProfile>;
  saveCareerProfile(profile: CareerProfile): Promise<CareerProfile>;
}

declare global {
  interface Window {
    syukatsuDesktop?: SyukatsuDesktopAPI;
  }
}
