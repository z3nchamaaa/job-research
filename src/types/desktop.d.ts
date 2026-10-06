export interface DesktopSession {
  connected: boolean;
  sharing: boolean;
  email?: string;
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

export interface SyukatsuDesktopAPI {
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
